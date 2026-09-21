-- §378 — eliminare un lead, e che il foglio non lo rimetta.
--
-- «Il foglio crea, il tool governa» (§370) ha un buco esattamente qui: il
-- giro inserisce ogni `sheet_row_id` che non trova in `deals`, e una riga
-- eliminata **non c'è più** — quindi alle tre del mattino rientra. Chi la
-- sera ha ripulito trenta righe di spazzatura le ritrova al mattino, e la
-- seconda volta che succede non preme più né «Elimina» né «Aggiorna».
--
-- La lapide è quello che resta della decisione: l'id del foglio, chi l'ha
-- presa e quando. Non è un cestino — il lead è andato davvero, con le sue
-- attività — è la memoria che impedisce al giro di rifare da capo ogni notte
-- un lavoro già fatto a mano.
--
-- Si conserva anche il nome: `1036…` non dice niente a nessuno, e il giorno
-- in cui qualcuno chiede «perché quel lead non entra» la risposta deve essere
-- leggibile senza aprire il foglio e cercare la riga.
--
-- Rilanciabile: `IF NOT EXISTS` ovunque.

BEGIN;

CREATE TABLE IF NOT EXISTS public.sales_sheet_ignored (
  sheet_row_id text PRIMARY KEY,
  company_name text,
  deleted_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  deleted_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sales_sheet_ignored_quando_idx
  ON public.sales_sheet_ignored (deleted_at DESC);

ALTER TABLE public.sales_sheet_ignored ENABLE ROW LEVEL SECURITY;

-- Nessuna policy, e non è una dimenticanza: ci legge e ci scrive solo il
-- service role, dalle server action che passano da `requireSalesAccess` —
-- la stessa scelta di `deal_owners` (236).

COMMIT;

-- verifica: la tabella c'è ed è chiusa
SELECT
  (SELECT count(*) FROM information_schema.tables
    WHERE table_schema='public' AND table_name='sales_sheet_ignored')  AS tabella,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname='public' AND tablename='sales_sheet_ignored')     AS policy_attese_zero,
  (SELECT relrowsecurity FROM pg_class
    WHERE oid='public.sales_sheet_ignored'::regclass)                  AS rls_attiva;
