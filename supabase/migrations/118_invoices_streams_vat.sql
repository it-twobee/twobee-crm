-- FASE 1d — `invoices`: rimozione del vincolo bloccante, link alla fonte, IVA.
--
-- ⚠️ UNICA MIGRATION NON PURAMENTE ADDITIVA DEL PIANO.
--
-- Il vincolo UNIQUE(client_id, month) della 002 impone UNA sola fattura per
-- cliente al mese. Un cliente Growth+Digital che nello stesso mese riceve il
-- canone e un SAL di progetto NON è rappresentabile: i due importi vanno fusi in
-- una riga e la separazione Growth/Digital diventa impossibile per costruzione.
--
-- Oggi `invoices` ha 0 righe → il DROP è a rischio zero. Dopo le prime fatture
-- reali l'operazione non è più reversibile (due righe sullo stesso
-- client_id+month impediscono di ricreare il vincolo). Decisione Q28: DROP.

DO $$
DECLARE c RECORD;
BEGIN
  -- Droppa qualunque UNIQUE su esattamente (client_id, month), comunque si chiami.
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE ns.nspname = 'public' AND rel.relname = 'invoices' AND con.contype = 'u'
      AND (
        -- ::text obbligatorio: attname è `name`, e name[] non si confronta con text[].
        SELECT array_agg(att.attname::text ORDER BY att.attname::text)
        FROM unnest(con.conkey) k
        JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = k
      ) = ARRAY['client_id','month']
  LOOP
    EXECUTE format('ALTER TABLE public.invoices DROP CONSTRAINT %I', c.conname);
    RAISE NOTICE 'Droppato vincolo %', c.conname;
  END LOOP;
END $$;

-- ─── Link alla fonte del ricavo ──────────────────────────────────────────────
-- Senza questi, una fattura non è attribuibile né a una linea di servizio né a
-- un progetto: era la ragione per cui "il ricavo di progetto" veniva calcolato
-- come fatturato dell'intero cliente (bug in ControlloGestioneClient.tsx:133).

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS stream_id            UUID REFERENCES public.revenue_streams(id)    ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revenue_milestone_id UUID REFERENCES public.revenue_milestones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS project_id           UUID REFERENCES public.projects(id)           ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_stream  ON public.invoices(stream_id);
CREATE INDEX IF NOT EXISTS idx_invoices_project ON public.invoices(project_id);
-- Il fatturato è per CASSA (decisione Q7): l'indice segue paid_at, non month.
CREATE INDEX IF NOT EXISTS idx_invoices_paid_at ON public.invoices(paid_at) WHERE paid_at IS NOT NULL;

-- ─── Scomposizione IVA ───────────────────────────────────────────────────────
-- `amount` era un campo unico e ambiguo: nessuno poteva sapere se chi inseriva
-- mettesse lordo o netto. Decisione Q8: il fatturato è al NETTO.
-- `amount` resta invariato per compatibilità con il codice esistente e
-- `taxable_amount` ne è il significato esplicito.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS taxable_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS vat_rate       NUMERIC(5,2) DEFAULT 22,
  ADD COLUMN IF NOT EXISTS vat_amount     NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS total_gross    NUMERIC(12,2);

-- Backfill: `amount` è trattato come IMPONIBILE (in produzione: 0 righe).
UPDATE public.invoices
SET taxable_amount = amount,
    vat_amount     = ROUND(amount * COALESCE(vat_rate, 22) / 100, 2),
    total_gross    = amount + ROUND(amount * COALESCE(vat_rate, 22) / 100, 2)
WHERE taxable_amount IS NULL;

-- Coerenza: chi inserisce può compilare l'imponibile e lasciar calcolare il resto.
CREATE OR REPLACE FUNCTION public.invoices_fill_vat()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.taxable_amount IS NULL THEN NEW.taxable_amount := NEW.amount; END IF;
  IF NEW.vat_rate       IS NULL THEN NEW.vat_rate       := 22;         END IF;
  NEW.vat_amount  := ROUND(NEW.taxable_amount * NEW.vat_rate / 100, 2);
  NEW.total_gross := NEW.taxable_amount + NEW.vat_amount;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS invoices_vat ON public.invoices;
CREATE TRIGGER invoices_vat BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.invoices_fill_vat();

COMMENT ON COLUMN public.invoices.amount IS
  'Storico/compatibilità. Per gli aggregati usare taxable_amount (imponibile).';
COMMENT ON COLUMN public.invoices.month IS
  'Mese di COMPETENZA. Il fatturato aziendale si calcola su paid_at (cassa), non su month.';

-- Rollback:
--   DROP TRIGGER invoices_vat ON public.invoices; DROP FUNCTION public.invoices_fill_vat;
--   ALTER TABLE public.invoices DROP COLUMN stream_id, DROP COLUMN revenue_milestone_id,
--     DROP COLUMN project_id, DROP COLUMN taxable_amount, DROP COLUMN vat_rate,
--     DROP COLUMN vat_amount, DROP COLUMN total_gross;
--   -- Il vincolo UNIQUE(client_id, month) è ricreabile SOLO se non esistono duplicati:
--   -- ALTER TABLE public.invoices ADD CONSTRAINT invoices_client_id_month_key UNIQUE (client_id, month);
