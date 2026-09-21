-- §360 — la riga di saluto scritta la notte, e a chi è permesso leggerla.
--
-- Il testo non si genera mentre la pagina si apre: `SalutoDinamico` sta in un
-- server component, e una chiamata a un modello davanti a ogni apertura
-- costerebbe il render — oltre a dare una frase diversa a ogni refresh, che è
-- esattamente il difetto che §351 voleva togliere.
--
-- Si salva il **template**, non il testo finito. I segnaposto (`{late}`,
-- `{collega1}`) li riempie il codice al momento della lettura, con i numeri di
-- **adesso**: così la frase resta quella di stamattina — e quindi ferma — ma il
-- numero dentro è vero anche alle sei di sera. `situazione` dice per quale
-- scenario era stata scritta: se nel pomeriggio cambia (le scadute diventano
-- zero), la riga non si adatta, si ritira, e torna il testo deterministico di
-- `lib/task-mood.ts`.
--
-- `fatti` è la fotografia del mattino: non serve a rendere la riga, serve a
-- sapere perché il modello aveva scritto quella. Senza, un testo strano di tre
-- settimane fa non è indagabile.
--
-- Rilanciabile: `IF NOT EXISTS` ovunque + `DROP POLICY IF EXISTS`.

BEGIN;

CREATE TABLE IF NOT EXISTS public.person_copy (
  profile_id  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  giorno      date        NOT NULL,
  chiave      text        NOT NULL DEFAULT 'saluto',
  template    text        NOT NULL,
  situazione  text        NOT NULL,
  fatti       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  modello     text,
  -- quante risposte il validatore ha scartato prima di questa: se sale, il
  -- prompt sta sbagliando, e senza il numero non lo scopre nessuno
  tentativi   smallint    NOT NULL DEFAULT 1,
  creato_il   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, giorno, chiave)
);

-- La pulizia cancella per data: senza indice è una scansione, e la scansione
-- di una tabella da quindici righe al giorno non è un problema — ma la query
-- del mattino («la mia riga di oggi») passa dalla PK, ed è quella che conta.
CREATE INDEX IF NOT EXISTS person_copy_giorno_idx ON public.person_copy (giorno);

ALTER TABLE public.person_copy ENABLE ROW LEVEL SECURITY;

-- Si legge solo la propria riga. Nemmeno l'admin legge quella degli altri: qui
-- dentro ci sono i nomi dei colleghi con cui uno condivide le task, ed è un
-- dato che descrive la persona, non l'azienda.
DROP POLICY IF EXISTS person_copy_leggo_la_mia ON public.person_copy;
CREATE POLICY person_copy_leggo_la_mia ON public.person_copy
  FOR SELECT USING (profile_id = auth.uid());

-- Nessuna policy di scrittura, e non è una dimenticanza: scrive solo il cron
-- col service role. Una riga che la persona può riscrivere non è più un fatto.

COMMIT;

-- verifica: la tabella c'è, la RLS è accesa, e l'unica policy è in lettura
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'person_copy')        AS colonne,
  (SELECT relrowsecurity FROM pg_class
    WHERE oid = 'public.person_copy'::regclass)                          AS rls_accesa,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'person_copy')           AS policy,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'person_copy'
      AND cmd <> 'SELECT')                                               AS policy_di_scrittura;
