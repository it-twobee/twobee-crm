-- 203 — §224 · Quando i soldi si muovono, non solo se si sono mossi.
--
-- Il conto economico sapeva dire in che mese il lavoro è stato fatto. Non
-- sapeva dire quando i soldi passano dal conto, e sono due domande diverse:
-- lo stipendio di luglio esce il 20 agosto, il subappalto si paga quando ha
-- pagato il cliente, una fattura emessa il 1° vale quindici giorni.
--
-- Finché l'unica cosa scritta era una spunta booleana, la lettura di cassa di
-- un mese conteneva le sole righe di quel mese: agosto non vedeva lo stipendio
-- di luglio che stava pagando, e luglio se lo teneva come se fosse uscito lì.
--
-- Tre colonne, e nessuna delle tre è l'altra:
--
--   · `terms`    — l'accordo di pagamento. NULL = lo decide la natura della
--                  voce, e la regola sta in `lib/cash-calendar.ts`, in un posto
--                  solo. Qui non si calcola niente, o le regole diventerebbero
--                  due e la seconda si dimenticherebbe sempre un caso.
--   · `due_date` — la scadenza scritta a mano: un'eccezione decisa da una
--                  persona, che vince sulla regola.
--   · `paid_on`  — quando i soldi si sono mossi. È l'unico che fa cassa.
--
-- **Backfill dichiarato.** Le righe già spuntate non hanno una data del
-- movimento perché nessuno l'ha mai chiesta: qui si assume la **scadenza** —
-- il 20 del mese dopo per il personale, la fine del mese per il resto, il 15
-- per le entrate. È un'assunzione, non un dato: quello che sposta è l'attribuzione
-- di cassa dei mesi già registrati, ed è esattamente quello che deve succedere
-- (il costo del lavoro di giugno smette di pesare su giugno e passa a luglio).
-- Una data sbagliata si corregge dalla riga.

ALTER TABLE public.pl_revenue_lines
  ADD COLUMN IF NOT EXISTS terms    TEXT,
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS paid_on  DATE;

ALTER TABLE public.pl_cost_lines
  ADD COLUMN IF NOT EXISTS terms    TEXT,
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS paid_on  DATE;

COMMENT ON COLUMN public.pl_revenue_lines.terms IS
  '§224 — accordo di pagamento: stesso_mese, giorni_15/30/60/90, mese_succ_20, a_incasso. NULL = regola di default (lib/cash-calendar.ts)';
COMMENT ON COLUMN public.pl_revenue_lines.due_date IS
  '§224 — scadenza scritta a mano: eccezione, vince sulla regola';
COMMENT ON COLUMN public.pl_revenue_lines.paid_on IS
  '§224 — quando l''incasso è passato dal conto. Decide su quale mese pesa in cassa';
COMMENT ON COLUMN public.pl_cost_lines.paid_on IS
  '§224 — quando il pagamento è uscito dal conto. Lo stipendio di luglio pagato il 20 agosto è cassa di agosto';

-- L'accordo si scrive solo dove è un'eccezione: le tre nature (entrata, costo
-- del lavoro, subappalto) le riconosce il motore, e scriverle qui vorrebbe dire
-- congelare oggi una regola che domani cambia in un posto e non nell'altro.

-- ── il movimento e la spunta restano d'accordo ───────────────────────────────
-- Spuntare «pagato» senza data lascerebbe la riga senza mese di cassa; togliere
-- la spunta senza cancellare la data lascerebbe un movimento che non esiste.
CREATE OR REPLACE FUNCTION public.pl_sync_paid_on()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.paid AND NEW.paid_on IS NULL THEN
    NEW.paid_on := CURRENT_DATE;
  END IF;
  IF NOT NEW.paid THEN
    NEW.paid_on := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pl_revenue_paid_on ON public.pl_revenue_lines;
CREATE TRIGGER trg_pl_revenue_paid_on
  BEFORE INSERT OR UPDATE ON public.pl_revenue_lines
  FOR EACH ROW EXECUTE FUNCTION public.pl_sync_paid_on();

DROP TRIGGER IF EXISTS trg_pl_cost_paid_on ON public.pl_cost_lines;
CREATE TRIGGER trg_pl_cost_paid_on
  BEFORE INSERT OR UPDATE ON public.pl_cost_lines
  FOR EACH ROW EXECUTE FUNCTION public.pl_sync_paid_on();

-- ── backfill: le righe già spuntate prendono la data della loro scadenza ─────
-- Entrate: la fattura esce il 1° e vale quindici giorni (§177).
UPDATE public.pl_revenue_lines l
   SET paid_on = (m.month + INTERVAL '14 days')::date
  FROM public.pl_months m
 WHERE m.id = l.month_id AND l.paid AND l.paid_on IS NULL;

-- Uscite: il costo del lavoro esce il 20 del mese dopo, il resto entro il mese.
-- I subappalti (`a_incasso`) qui cadono sul fondo mese, che è il ripiego del
-- motore quando non si sa quando ha pagato il cliente: nessuna data inventata.
UPDATE public.pl_cost_lines l
   SET paid_on = CASE
         WHEN lower(btrim(l.category)) IN ('personale', 'persone')
           THEN (m.month + INTERVAL '1 month' + INTERVAL '19 days')::date
         ELSE (m.month + INTERVAL '1 month' - INTERVAL '1 day')::date
       END
  FROM public.pl_months m
 WHERE m.id = l.month_id AND l.paid AND l.paid_on IS NULL;

-- Il mese di cassa si interroga per intervallo di date: senza indice ogni
-- apertura del conto economico scansiona tutte le righe di tutti i mesi.
CREATE INDEX IF NOT EXISTS idx_pl_revenue_paid_on ON public.pl_revenue_lines(paid_on);
CREATE INDEX IF NOT EXISTS idx_pl_cost_paid_on    ON public.pl_cost_lines(paid_on);
CREATE INDEX IF NOT EXISTS idx_pl_revenue_due     ON public.pl_revenue_lines(due_date);
CREATE INDEX IF NOT EXISTS idx_pl_cost_due        ON public.pl_cost_lines(due_date);

NOTIFY pgrst, 'reload schema';
