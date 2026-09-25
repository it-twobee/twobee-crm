-- 266 — l'archivio dei documenti economici e l'IBAN dei conti (§450)
--
-- Tre cose, tutte al servizio della pagina «Carica documenti»:
--
-- 1) `bank_accounts.iban`. I conti Vivid sono quattro e il camt dice l'IBAN:
--    scegliere il conto a occhio ogni volta è il modo di caricare l'estratto di
--    Toto sul conto di Walter. La prima volta si sceglie, e il conto se lo
--    ricorda. Unico, normalizzato: un IBAN è di un conto solo.
--
-- 2) Il conto principale era registrato come «Banca Valsabbina», ed è il conto
--    Banco BPM (lo dicono l'estratto e l'F24). Si corregge il nome della banca,
--    non l'etichetta: «Conto corrente Two Bee» resta come lo conoscono tutti.
--
-- 3) `economics_documents`: l'originale di ogni file caricato — estratto,
--    fattura, cedolino, F24 — su MinIO, con l'impronta SHA-256. Il dato letto
--    sta nelle tabelle di dominio; qui c'è il foglio da cui viene, così un
--    numero si può sempre riportare al documento. L'impronta è unica: lo stesso
--    file caricato due volte è lo stesso documento.
--    Deny-all: la tabella si legge e si scrive solo dal server, dopo
--    `requireEconomicsAdmin()`. Cedolini e F24 hanno stipendi e codici fiscali.

-- ── 1) IBAN ────────────────────────────────────────────────────────────────
alter table public.bank_accounts add column if not exists iban text;

create unique index if not exists uq_bank_accounts_iban
  on public.bank_accounts (upper(replace(iban, ' ', '')))
  where iban is not null;

-- ── 2) il nome della banca ─────────────────────────────────────────────────
update public.bank_accounts
   set bank_name = 'Banco BPM', updated_at = now()
 where bank_name ilike '%valsabbina%';

-- ── 3) l'archivio ──────────────────────────────────────────────────────────
create table if not exists public.economics_documents (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('estratto', 'fattura', 'cedolino', 'f24', 'altro')),
  filename     text not null,
  sha256       text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes   bigint not null check (size_bytes >= 0),
  mime         text,
  storage_key  text not null,
  -- il mese a cui il documento si riferisce, quando si sa
  period       date,
  account_id   uuid references public.bank_accounts(id) on delete set null,
  person_id    uuid references public.hr_people(id) on delete set null,
  f24_id       uuid references public.f24_documents(id) on delete set null,
  -- cosa ne ha fatto il tool: «12 movimenti nuovi», «da confermare: 0,73 €»
  esito        text,
  uploaded_by  uuid references auth.users(id),
  uploaded_at  timestamptz not null default now()
);

create unique index if not exists uq_economics_documents_sha on public.economics_documents(sha256);
create index if not exists idx_economics_documents_kind on public.economics_documents(kind, uploaded_at desc);

comment on table public.economics_documents is
  '§450 — gli originali dei documenti economici caricati (MinIO), con impronta. Deny-all: solo server, dopo requireEconomicsAdmin.';

alter table public.economics_documents enable row level security;
revoke all on public.economics_documents from anon, authenticated;
