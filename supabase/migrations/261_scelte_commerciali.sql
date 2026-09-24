-- 261 — Priorità e membership diventano elenchi che si governano (§436).
--
-- Dalla 236 erano un CHECK scritto a mano (`High/Medium/Low`,
-- `Member/Not Member/Potential`) e una costante nel codice: due copie dello
-- stesso elenco, e per aggiungere una voce servivano una migration e un rilascio.
-- Diventano due tabelle come i motivi del perso (258), lette dal tool e scritte
-- solo dall'azione, col service role.
--
-- **Le chiavi sono i valori che i lead hanno già**: nessuna riga di `deals` si
-- tocca. L'etichetta nasce uguale alla chiave e si potrà cambiare dall'editor;
-- la chiave no, perché i lead la puntano.
--
-- La chiave esterna è `ON DELETE RESTRICT`, non `SET NULL` come per i motivi:
-- una voce usata non deve potersi cancellare nemmeno per sbaglio, e il database
-- lo deve rifiutare anche se l'azione se ne dimenticasse. `ON UPDATE CASCADE`
-- lascia aperta la strada a una rinomina della chiave senza spezzare niente.
--
-- Prima di aggiungere le chiavi esterne si seminano anche i valori che i lead
-- avessero fuori elenco: il CHECK non lo permetteva, ma una chiave esterna che
-- fallisce a metà migration è peggio di una voce in più da ritirare.
--
-- Prerequisiti: 236. Rilanciabile.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.sales_priorita (
  chiave     text PRIMARY KEY CHECK (length(btrim(chiave)) BETWEEN 1 AND 40),
  etichetta  text NOT NULL CHECK (length(btrim(etichetta)) BETWEEN 1 AND 40),
  ordine     integer NOT NULL,
  attivo     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.sales_membership (
  chiave     text PRIMARY KEY CHECK (length(btrim(chiave)) BETWEEN 1 AND 40),
  etichetta  text NOT NULL CHECK (length(btrim(etichetta)) BETWEEN 1 AND 40),
  ordine     integer NOT NULL,
  attivo     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.sales_priorita (chiave, etichetta, ordine) VALUES
  ('High', 'High', 10), ('Medium', 'Medium', 20), ('Low', 'Low', 30)
ON CONFLICT (chiave) DO NOTHING;
INSERT INTO public.sales_membership (chiave, etichetta, ordine) VALUES
  ('Member', 'Member', 10), ('Potential', 'Potential', 20), ('Not Member', 'Not Member', 30)
ON CONFLICT (chiave) DO NOTHING;

-- i valori fuori elenco, se ce ne fossero: in fondo, e ritirati
INSERT INTO public.sales_priorita (chiave, etichetta, ordine, attivo)
SELECT DISTINCT d.priority, left(d.priority, 40), 900, false FROM public.deals d
WHERE d.priority IS NOT NULL AND length(btrim(d.priority)) BETWEEN 1 AND 40
ON CONFLICT (chiave) DO NOTHING;
INSERT INTO public.sales_membership (chiave, etichetta, ordine, attivo)
SELECT DISTINCT d.membership, left(d.membership, 40), 900, false FROM public.deals d
WHERE d.membership IS NOT NULL AND length(btrim(d.membership)) BETWEEN 1 AND 40
ON CONFLICT (chiave) DO NOTHING;

ALTER TABLE public.deals DROP CONSTRAINT IF EXISTS deals_priority_check;
ALTER TABLE public.deals DROP CONSTRAINT IF EXISTS deals_membership_check;

DO $$ BEGIN
  ALTER TABLE public.deals ADD CONSTRAINT deals_priority_esiste
    FOREIGN KEY (priority) REFERENCES public.sales_priorita(chiave) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.deals ADD CONSTRAINT deals_membership_esiste
    FOREIGN KEY (membership) REFERENCES public.sales_membership(chiave) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- chi legge e chi scrive: come la 258, lettura a chi ha una sessione, nessuna
-- policy di scrittura
ALTER TABLE public.sales_priorita   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_membership ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sales_priorita_lettura ON public.sales_priorita;
CREATE POLICY sales_priorita_lettura ON public.sales_priorita FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS sales_membership_lettura ON public.sales_membership;
CREATE POLICY sales_membership_lettura ON public.sales_membership FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.sales_priorita, public.sales_membership TO authenticated;
GRANT ALL ON public.sales_priorita, public.sales_membership TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- verifica: tre priorità e tre membership (più eventuali fuori elenco, spente),
-- i due CHECK spariti (0), le due chiavi esterne al loro posto (2)
SELECT
  (SELECT count(*) FROM public.sales_priorita)                                       AS priorita,
  (SELECT count(*) FROM public.sales_membership)                                     AS membership,
  (SELECT count(*) FROM pg_constraint
    WHERE conname IN ('deals_priority_check', 'deals_membership_check'))             AS check_rimasti,
  (SELECT count(*) FROM pg_constraint
    WHERE conname IN ('deals_priority_esiste', 'deals_membership_esiste'))           AS chiavi_esterne;
