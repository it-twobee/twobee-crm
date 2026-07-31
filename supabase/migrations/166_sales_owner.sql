-- 166 — Il commerciale sta in anagrafica cliente, e può essere esterno al tool.
--
-- Oggi il commerciale si sceglie riga per riga nel conto economico, da una
-- tendina di profili: si riscrive ogni mese e non regge chi porta clienti senza
-- avere un account (segnalatori, agenzie, partner commerciali).
--
-- Qui diventa un dato d'anagrafica: si imposta una volta sul cliente e le righe
-- del mese lo ereditano. Due campi perché sono due casi diversi:
--
--   sales_owner_id    un profilo del tool (provvigione tracciabile a persona)
--   sales_owner_name  un nome libero, per chi nel tool non c'è
--
-- Se ci sono entrambi vince l'id: il nome libero è il ripiego, non l'alias.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS sales_owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sales_owner_name TEXT;

-- stesso doppio campo sul contratto: un singolo servizio può essere stato
-- portato da qualcun altro rispetto al cliente
ALTER TABLE public.revenue_streams
  ADD COLUMN IF NOT EXISTS sales_owner_name TEXT;

CREATE INDEX IF NOT EXISTS idx_clients_sales_owner ON public.clients(sales_owner_id);

NOTIFY pgrst, 'reload schema';
