-- 168 — Le entrate del mese sanno da dove vengono.
--
-- Una riga di ricavo nasceva come copia scollegata: il mese chiuso deve restare
-- quello che era, e quello resta vero. Ma «copia» non vuol dire «orfana»: senza
-- sapere da quale progetto e da quale contratto arriva, il conto economico e
-- l'economics dei progetti restano due mondi che non si parlano. Non si può
-- aprire il progetto da una riga, non si vede quali righe sono coperte da un
-- contratto e quali sono ancora ferme all'MRR d'anagrafica.
--
-- Qui la riga tiene il riferimento all'origine. Gli importi restano copiati:
-- il legame serve a navigare e a distinguere, non a ricalcolare.
--
-- ON DELETE SET NULL su tutti e tre: cancellare un contratto non deve
-- riscrivere la storia di un mese già registrato, semmai perderne il rimando.

ALTER TABLE public.pl_revenue_lines
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stream_id UUID REFERENCES public.revenue_streams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS installment_id UUID REFERENCES public.revenue_installments(id) ON DELETE SET NULL,
  -- 'contratto' = generata da un revenue_stream · 'anagrafica' = dall'MRR del
  -- cliente, in attesa che il contratto esista · 'manuale' = scritta a mano
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'manuale'
    CHECK (origin IN ('contratto', 'anagrafica', 'manuale'));

CREATE INDEX IF NOT EXISTS idx_pl_revenue_project ON public.pl_revenue_lines(project_id);
CREATE INDEX IF NOT EXISTS idx_pl_revenue_stream ON public.pl_revenue_lines(stream_id);

-- Le righe già presenti con un cliente ma senza contratto vengono dall'MRR
-- d'anagrafica: marcarle adesso evita di doverle indovinare dopo.
UPDATE public.pl_revenue_lines
SET origin = 'anagrafica'
WHERE client_id IS NOT NULL AND stream_id IS NULL AND origin = 'manuale';

NOTIFY pgrst, 'reload schema';
