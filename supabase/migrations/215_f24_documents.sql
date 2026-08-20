-- §301 — L'F24 come documento: un foglio, due mondi dentro.
--
-- L'IVA di un trimestre e le ritenute dei dipendenti si versano **con lo stesso
-- modello**, e nel tool vivevano in due tabelle che non si parlavano:
-- `vat_settlements` (§242) e `hr_f24` (§182). Il documento che le contiene non
-- esisteva da nessuna parte.
--
-- Il prezzo si legge in un movimento: il 20 agosto dal conto sono usciti
-- **10.547,24 €**, che sono 9.669,33 di IVA più 877,91 di ritenute e contributi.
-- Al centesimo. Ma nessuna riga del tool valeva quella cifra, quindi quel
-- movimento non si poteva agganciare a niente — ed è la voce più grossa fra
-- quelle che il ponte (§199) non spiega.
--
-- Il documento è **il contenitore, non un dominio nuovo**: ogni riga dice a
-- quale mondo appartiene, e quel mondo resta l'autorità. L'IVA punta alla sua
-- liquidazione, le ritenute al loro `hr_f24`. Sommarle farebbe costare
-- diecimila euro un mese di stipendi.

create table if not exists public.f24_documents (
  id          uuid primary key default gen_random_uuid(),
  -- quando si versa: è la data del modello, non quella dei tributi che contiene
  due_date    date not null,
  paid_on     date,
  -- quello che il modello chiede in fondo. Il trigger sotto lo confronta con le righe
  total       numeric(14,2) not null check (total >= 0),
  doc_ref     text,
  note        text,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.f24_documents is
  '§301 — il modello F24 come documento. Contiene tributi di domini diversi (IVA, ritenute, INPS) e ognuno resta di casa sua.';

create table if not exists public.f24_lines (
  id       uuid primary key default gen_random_uuid(),
  doc_id   uuid not null references public.f24_documents(id) on delete cascade,
  -- il codice del modello: 6032 è l'IVA del 2º trimestre, 1001 le ritenute
  codice   text not null,
  label    text not null,
  -- a quale mondo appartiene. `credito` si **sottrae**: è l'indennità
  -- L. 207/2024 che esce in busta e rientra qui (§235), e contarla come debito
  -- la farebbe pagare due volte.
  kind     text not null check (kind in ('iva', 'ritenute', 'inps', 'inail', 'credito', 'altro')),
  -- sempre positivo: il verso lo dice `kind`, non il segno
  amount   numeric(14,2) not null check (amount > 0),
  -- il periodo del tributo, non quello del versamento
  period   date,

  -- il legame col dominio che ne è l'autorità. Nullable: un modello si può
  -- trascrivere prima che la liquidazione sia registrata.
  vat_settlement_id uuid references public.vat_settlements(id) on delete set null,
  hr_f24_id         uuid references public.hr_f24(id) on delete set null,

  created_at timestamptz not null default now()
);

create index if not exists idx_f24_lines_doc on public.f24_lines(doc_id);
create index if not exists idx_f24_lines_vat on public.f24_lines(vat_settlement_id);
create index if not exists idx_f24_docs_due  on public.f24_documents(due_date);

-- ── Il movimento che paga un F24 ───────────────────────────────────────────
--
-- Quarto bersaglio delle allocazioni (§297). Il CHECK va rifatto: era «uno solo
-- fra tre», diventa «uno solo fra quattro».
alter table public.payment_allocations
  add column if not exists f24_id uuid references public.f24_documents(id) on delete cascade;

alter table public.payment_allocations
  drop constraint if exists payment_allocations_one_target;
alter table public.payment_allocations
  add constraint payment_allocations_one_target check (
    (revenue_line_id is not null)::int
    + (cost_line_id is not null)::int
    + (payout_id is not null)::int
    + (f24_id is not null)::int = 1
  );

create unique index if not exists uq_alloc_tx_f24
  on public.payment_allocations(tx_id, f24_id) where f24_id is not null;
create index if not exists idx_alloc_f24 on public.payment_allocations(f24_id);

-- ── L'invariante del documento ─────────────────────────────────────────────
--
-- Il totale versato è la somma dei debiti meno i crediti. Uno scarto non è un
-- arrotondamento: è una riga che nessuno ha trascritto, e senza quella riga il
-- modello non si può usare per riconciliare — si saprebbe *quanto* è uscito e
-- non *per cosa*.
--
-- Il controllo scatta sulle righe e non sul documento: un modello nasce vuoto e
-- si compila una riga alla volta, quindi vietare lo stato intermedio vorrebbe
-- dire non poterlo scrivere affatto. Si verifica quando le righe cambiano, e
-- solo se ce n'è almeno una.
create or replace function public.f24_lines_balance() returns trigger
language plpgsql as $$
declare
  doc      uuid := coalesce(new.doc_id, old.doc_id);
  atteso   numeric(14,2);
  somma    numeric(14,2);
  quante   int;
begin
  select total into atteso from public.f24_documents where id = doc;
  if atteso is null then return coalesce(new, old); end if;

  select count(*),
         coalesce(sum(case when kind = 'credito' then -amount else amount end), 0)
    into quante, somma
    from public.f24_lines where doc_id = doc;

  if quante > 0 and abs(somma - atteso) > 0.01 then
    raise exception
      'Il modello chiede % € e le sue righe fanno %: la differenza è una riga che nessuno ha trascritto.',
      to_char(atteso, 'FM999999990.00'), to_char(somma, 'FM999999990.00');
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_f24_lines_balance on public.f24_lines;
create constraint trigger trg_f24_lines_balance
  after insert or update or delete on public.f24_lines
  deferrable initially deferred
  for each row execute function public.f24_lines_balance();

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.f24_documents enable row level security;
alter table public.f24_lines enable row level security;

drop policy if exists f24_documents_admin on public.f24_documents;
create policy f24_documents_admin on public.f24_documents
  for all using (public.get_my_role() = 'admin') with check (public.get_my_role() = 'admin');

drop policy if exists f24_lines_admin on public.f24_lines;
create policy f24_lines_admin on public.f24_lines
  for all using (public.get_my_role() = 'admin') with check (public.get_my_role() = 'admin');
