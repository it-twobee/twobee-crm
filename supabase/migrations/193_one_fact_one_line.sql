-- ═══════════════════════════════════════════════════════════════════════════
-- §193 — Una rata, una riga. Un lavoro affidato fuori, una riga.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Il conto economico di luglio contava lo stesso contratto due volte: una volta
-- generato dalla scheda del cliente e una dalla scheda del progetto. Sono lo
-- stesso patto visto da due posti — l'economics del cliente e quella del progetto
-- leggono la stessa tabella — ma finché niente lo impediva, due generazioni
-- creavano due righe e il fatturato del mese risultava più alto del vero. Sui
-- 10.000 € del CRM di Industrial Service faceva 6.500 € di ricavo inventato.
--
-- La regola non è una convenzione da ricordare, è un vincolo del database:
--
--   · **una rata esiste in un mese solo** — quello della sua scadenza. Un indice
--     unico su `installment_id` lo garantisce: la seconda riga non entra;
--   · **una lavorazione «una tantum» atterra una volta sola** — non si può
--     esprimere con un indice, perché la frequenza sta su un'altra tabella, e
--     serve un trigger che vada a leggerla.
--
-- Un canone invece torna ogni mese, ed è giusto: la sua chiave resta (mese, voce),
-- che l'indice della 171 già copre.
--
-- Prima dei vincoli si ripulisce, altrimenti la migration non passa. La riga che
-- resta è quella nel mese giusto — la scadenza della rata, lo `start_month` della
-- voce — perché è quella che il resto del tool si aspetta di trovare.

BEGIN;

-- ── 1) Le rate materializzate due volte ─────────────────────────────────────
-- Tiene la riga nel mese della scadenza; se nessuna ci sta, tiene la più vecchia
-- (cancellarle tutte perderebbe l'incasso già registrato).
WITH ranked AS (
  SELECT r.id, r.installment_id,
         ROW_NUMBER() OVER (
           PARTITION BY r.installment_id
           ORDER BY (date_trunc('month', m.month) = date_trunc('month', i.due_month)) DESC,
                    r.created_at ASC
         ) AS pos
    FROM public.pl_revenue_lines r
    JOIN public.pl_months m ON m.id = r.month_id
    JOIN public.revenue_installments i ON i.id = r.installment_id
   WHERE r.installment_id IS NOT NULL
)
DELETE FROM public.pl_revenue_lines
 WHERE id IN (SELECT id FROM ranked WHERE pos > 1);

-- ── 2) Le lavorazioni una tantum atterrate in più mesi ──────────────────────
WITH ranked AS (
  SELECT c.id,
         ROW_NUMBER() OVER (
           PARTITION BY c.cost_item_id
           ORDER BY (date_trunc('month', m.month) = date_trunc('month', COALESCE(i.start_month, m.month))) DESC,
                    c.created_at ASC
         ) AS pos
    FROM public.pl_cost_lines c
    JOIN public.pl_months m ON m.id = c.month_id
    JOIN public.cost_items i ON i.id = c.cost_item_id
   WHERE c.cost_item_id IS NOT NULL AND i.frequency = 'una_tantum'
)
DELETE FROM public.pl_cost_lines
 WHERE id IN (SELECT id FROM ranked WHERE pos > 1);

-- ── 3) I vincoli ────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_pl_revenue_one_per_installment
  ON public.pl_revenue_lines (installment_id)
  WHERE installment_id IS NOT NULL;

COMMENT ON INDEX public.idx_pl_revenue_one_per_installment IS
  '§193 — Una rata è una fattura: una riga sola, nel mese della sua scadenza. '
  'L''economics del cliente e quella del progetto leggono lo stesso contratto: '
  'senza questo vincolo due generazioni creano due ricavi.';

/**
 * Una lavorazione «una tantum» non può atterrare due volte.
 *
 * Serve un trigger e non un indice perché la frequenza sta su `cost_items`: un
 * indice unico su `cost_item_id` vieterebbe anche i canoni, che devono tornare
 * ogni mese. L'errore è esplicito perché chi lo vede deve capire cosa fare —
 * spostare la riga, non crearne un'altra.
 */
CREATE OR REPLACE FUNCTION public.pl_cost_one_shot_guard()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_freq TEXT;
  v_altro UUID;
  v_mese DATE;
BEGIN
  IF NEW.cost_item_id IS NULL THEN RETURN NEW; END IF;

  SELECT frequency INTO v_freq FROM cost_items WHERE id = NEW.cost_item_id;
  IF v_freq IS DISTINCT FROM 'una_tantum' THEN RETURN NEW; END IF;

  SELECT c.id, m.month INTO v_altro, v_mese
    FROM pl_cost_lines c JOIN pl_months m ON m.id = c.month_id
   WHERE c.cost_item_id = NEW.cost_item_id
     AND c.id IS DISTINCT FROM NEW.id
   LIMIT 1;

  IF v_altro IS NOT NULL THEN
    RAISE EXCEPTION
      'Questa lavorazione una tantum è già nel conto economico di %: spostala invece di duplicarla',
      to_char(v_mese, 'MM/YYYY');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pl_cost_one_shot ON public.pl_cost_lines;
CREATE TRIGGER trg_pl_cost_one_shot
  BEFORE INSERT OR UPDATE OF cost_item_id, month_id ON public.pl_cost_lines
  FOR EACH ROW EXECUTE FUNCTION public.pl_cost_one_shot_guard();

COMMIT;
