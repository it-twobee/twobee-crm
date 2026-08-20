-- §297 — Il registro delle allocazioni: quanto di un movimento paga quale riga.
--
-- Per tutta la vita del tool il legame fra conto corrente e conto economico è
-- stato **un campo**: `bank_transactions.cost_line_id` e il suo gemello per le
-- entrate. Un movimento, una riga. Regge finché il mondo è fatto così, e il
-- mondo non è fatto così: un bonifico paga due fatture, una distinta paga tre
-- stipendi, una fattura si paga con due bonifici o a metà, e un compenso è due
-- cose insieme — a Marco a luglio sono usciti 3.412 €, che sono 3.191,12 di
-- quota socio più 220,88 di provvigione divisa con Toto.
--
-- Con un campo solo ognuno di questi casi ha una sola uscita: non agganciare
-- niente. Ed è quello che è successo — il ponte fra conto economico e saldo
-- (§199) non quadra per −6.029 €, e quasi tutto sta in tre bonifici cumulativi
-- che nessuno ha potuto spiegare.
--
-- Qui l'unità non è il legame: è **l'euro allocato**.
--
-- La migration è **additiva**. `bank_transactions.revenue_line_id` e
-- `cost_line_id` restano dove sono, con i loro trigger: il backfill li copia
-- qui e da lì in poi si legge il registro, ma niente si rompe se una pagina
-- ancora non lo fa. Si droppano quando nessun chiamante li usa più.

create table if not exists public.payment_allocations (
  id           uuid primary key default gen_random_uuid(),
  tx_id        uuid not null references public.bank_transactions(id) on delete cascade,

  -- Su cosa atterra. Uno solo dei tre, e il CHECK lo impone: una allocazione che
  -- punta a due cose non è una allocazione, è un errore che si scopre a valle.
  revenue_line_id uuid references public.pl_revenue_lines(id) on delete cascade,
  cost_line_id    uuid references public.pl_cost_lines(id)    on delete cascade,
  payout_id       uuid references public.pl_payouts(id)       on delete cascade,

  -- Sempre **lordo** e sempre **positivo**: dal conto passa il totale della
  -- fattura, la riga di conto economico è imponibile, e lo scorporo si fa dove
  -- serve (§296). Il verso lo decide il target, non il segno.
  amount       numeric(14,2) not null check (amount > 0),

  -- §226 — `certificata` la porta un movimento vero (banca o contante),
  -- `dichiarata` una spunta che nessun estratto conto dimostra. Tenerle
  -- distinte è tutto il valore del registro: senza, un'affermazione conferma
  -- sé stessa.
  evidence     text not null default 'certificata'
               check (evidence in ('certificata', 'dichiarata')),

  note         text,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),

  constraint payment_allocations_one_target check (
    (revenue_line_id is not null)::int
    + (cost_line_id is not null)::int
    + (payout_id is not null)::int = 1
  )
);

comment on table public.payment_allocations is
  '§297 — quanto di un movimento paga quale riga. Un movimento ha N allocazioni, una riga ne ha N: è la forma che un campo singolo non poteva avere.';
comment on column public.payment_allocations.amount is
  'Lordo allocato, sempre positivo. Il verso lo decide il target.';

-- La stessa riga due volte sullo stesso movimento va sommata in una allocazione
-- sola, o «quanto è coperto» diventa illeggibile. Tre indici parziali perché il
-- vincolo unico deve valere per target, e i NULL non si confrontano.
create unique index if not exists uq_alloc_tx_revenue
  on public.payment_allocations(tx_id, revenue_line_id) where revenue_line_id is not null;
create unique index if not exists uq_alloc_tx_cost
  on public.payment_allocations(tx_id, cost_line_id) where cost_line_id is not null;
create unique index if not exists uq_alloc_tx_payout
  on public.payment_allocations(tx_id, payout_id) where payout_id is not null;

create index if not exists idx_alloc_tx      on public.payment_allocations(tx_id);
create index if not exists idx_alloc_revenue on public.payment_allocations(revenue_line_id);
create index if not exists idx_alloc_cost    on public.payment_allocations(cost_line_id);
create index if not exists idx_alloc_payout  on public.payment_allocations(payout_id);

-- ── Il vincolo che il registro non può violare ─────────────────────────────
--
-- Non si alloca più di quello che il movimento contiene. Sforare vuol dire che
-- due righe si stanno dividendo denaro che dal conto non è passato, e da lì il
-- saldo del tool smette di essere il saldo della banca. Sta nel database e non
-- solo nel codice perché è un'invariante, e un'invariante deve reggere anche a
-- una scrittura fatta da fuori.
create or replace function public.alloc_within_tx() returns trigger
language plpgsql as $$
declare
  lordo   numeric(14,2);
  allocato numeric(14,2);
begin
  select abs(amount) into lordo from public.bank_transactions where id = new.tx_id;
  select coalesce(sum(amount), 0) into allocato
    from public.payment_allocations
   where tx_id = new.tx_id and id <> new.id;

  if allocato + new.amount > lordo + 0.01 then
    raise exception
      'Allocati % € su un movimento da % €: due righe non possono dividersi denaro che dal conto non è passato.',
      to_char(allocato + new.amount, 'FM999999990.00'), to_char(lordo, 'FM999999990.00');
  end if;
  return new;
end $$;

drop trigger if exists trg_alloc_within_tx on public.payment_allocations;
create trigger trg_alloc_within_tx
  before insert or update on public.payment_allocations
  for each row execute function public.alloc_within_tx();

-- ── RLS: il dominio economico è chiuso ─────────────────────────────────────
alter table public.payment_allocations enable row level security;

drop policy if exists payment_allocations_admin on public.payment_allocations;
create policy payment_allocations_admin on public.payment_allocations
  for all using (public.get_my_role() = 'admin') with check (public.get_my_role() = 'admin');

-- ── Backfill: quello che i due campi già dicevano ──────────────────────────
--
-- Ogni movimento agganciato a una riga diventa una allocazione. L'importo è il
-- **minore** fra il lordo del movimento e quello della riga: se il bonifico è
-- più grande, la differenza resta da allocare e si vede; se è più piccolo, la
-- riga risulta coperta a metà, che è la verità.
--
-- L'evidenza la decide la sorgente: un `derivato` nasce da una spunta e non può
-- certificare la spunta da cui nasce (§226).
insert into public.payment_allocations (tx_id, cost_line_id, amount, evidence, note)
select t.id, t.cost_line_id,
       least(abs(t.amount), round(
         (case when c.actual > 0 then c.actual else c.budget end)
         * (case when c.vat_applied then 1 + c.vat_rate else 1 end), 2)),
       case when t.source in ('banca', 'manuale') then 'certificata' else 'dichiarata' end,
       'Backfill §297 dal legame diretto'
  from public.bank_transactions t
  join public.pl_cost_lines c on c.id = t.cost_line_id
 where t.cost_line_id is not null
   and abs(t.amount) > 0
   and not exists (
     select 1 from public.payment_allocations a
      where a.tx_id = t.id and a.cost_line_id = t.cost_line_id);

insert into public.payment_allocations (tx_id, revenue_line_id, amount, evidence, note)
select t.id, t.revenue_line_id,
       least(abs(t.amount), round(r.amount_net * (1 + r.vat_rate), 2)),
       case when t.source in ('banca', 'manuale') then 'certificata' else 'dichiarata' end,
       'Backfill §297 dal legame diretto'
  from public.bank_transactions t
  join public.pl_revenue_lines r on r.id = t.revenue_line_id
 where t.revenue_line_id is not null
   and abs(t.amount) > 0
   and not exists (
     select 1 from public.payment_allocations a
      where a.tx_id = t.id and a.revenue_line_id = t.revenue_line_id);
