-- 173 — Il subappalto è un costo che sa a quale lavoro appartiene.
--
-- Growth e digital si erogano anche fuori: un video, un design, uno sviluppo,
-- un'agenzia partner. Finché quel costo vive solo nel mese, il conto economico
-- torna ma la marginalità del progetto è una bugia — si vede quanto il cliente
-- paga e non quanto costa consegnarlo.
--
-- Non serve un secondo motore: un subappalto **è** una voce di piano
-- (`cost_items`), con la sua frequenza e il suo fornitore, che in più sa da
-- quale progetto nasce. Così eredita già tutto: cade nei mesi giusti, entra
-- nel conto economico con «Porta nel mese», pesa sul budget della sua area.
--
-- `pl_cost_lines.project_id` porta il legame anche sul consuntivo: una spesa
-- registrata a mano si può attaccare a un progetto senza passare dal piano.
-- Come per i ricavi, l'importo nel mese resta una copia: un mese chiuso non si
-- riscrive perché il fornitore ha ritoccato il preventivo.

ALTER TABLE public.cost_items
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;

ALTER TABLE public.pl_cost_lines
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cost_items_project ON public.cost_items(project_id);
CREATE INDEX IF NOT EXISTS idx_pl_cost_project ON public.pl_cost_lines(project_id);

-- Le uscite già generate da una voce di progetto ereditano il legame: senza,
-- il margine del mese in corso partirebbe monco.
UPDATE public.pl_cost_lines l
SET project_id = i.project_id
FROM public.cost_items i
WHERE l.cost_item_id = i.id AND l.project_id IS NULL AND i.project_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
