-- 265 — le viste salvate dell'elenco dei lead (§440)
--
-- Una vista è **una query**, la stessa che sta nell'indirizzo (`scrivi` in
-- `lib/sales-vista.ts`): salvarla come testo invece che come colonne vuol dire
-- che un filtro nuovo non chiede una migration, e che la vista si apre
-- esattamente come il link che la rappresenta. La query si rilegge e si
-- riscrive nell'azione prima di salvarla: qui entra solo quello che `leggi`
-- conosce.
--
-- Ognuno salva le sue; chi la crea può renderla visibile al team. Condivisa
-- vuol dire leggibile, non modificabile: la cambia o la elimina chi l'ha fatta,
-- o un admin. «Miei» dentro una vista condivisa resta «miei» di chi guarda.
--
-- Deny-all: ci arriva solo il service role, dalle azioni che passano da
-- `requireSalesAccess`.

BEGIN;

CREATE TABLE IF NOT EXISTS public.sales_viste (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  nome       text NOT NULL CHECK (length(btrim(nome)) BETWEEN 1 AND 60),
  query      text NOT NULL DEFAULT '' CHECK (length(query) <= 2000),
  condivisa  boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- due viste con lo stesso nome della stessa persona sono una di troppo
CREATE UNIQUE INDEX IF NOT EXISTS sales_viste_nome ON public.sales_viste(owner_id, lower(btrim(nome)));

ALTER TABLE public.sales_viste ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sales_viste FROM anon, authenticated;
GRANT ALL ON public.sales_viste TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- verifica: la tabella c'è, vuota, e nessuna policy la apre al browser
SELECT (SELECT count(*) FROM public.sales_viste) AS viste,
       (SELECT count(*) FROM pg_policies WHERE tablename = 'sales_viste') AS policy;
