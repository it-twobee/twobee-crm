-- ═══════════════════════════════════════════════════════════════════════════
-- §217 · Asana — la decisione presa su ogni task, che sopravvive alla sessione
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Chiudere Asana vuol dire passare in rassegna 146 board e 1.720 task decidendo,
-- una per una, se serve o si butta. Non è un pomeriggio: è un lavoro a strappi,
-- fatto fra una cosa e l'altra, e ogni volta bisogna sapere **dove si era
-- arrivati**.
--
-- Tenerlo nel browser (localStorage) sarebbe costato zero, e sarebbe stato il
-- posto sbagliato: una cache svuotata, un altro computer, un collega che dà una
-- mano, e le decisioni di tre giorni sono andate senza che nessuno se ne
-- accorga. Il conto di quanto manca è la sola cosa che rende finito un lavoro
-- che sembra infinito.
--
-- La chiave è il `gid` di Asana, non un id nostro: la decisione riguarda una
-- task che vive **là**, e la maggior parte di queste non entrerà mai in TwoBee.
-- Per la stessa ragione non c'è nessuna FK verso `tasks`.
--
-- **Perché senza BEGIN/COMMIT.** La prima stesura era in transazione, e non
-- passava: in transazione un errore su un solo statement annulla tutto — tabella
-- compresa — e nel SQL Editor resta un errore rosso in fondo, facile da non
-- collegare a niente. Qui ogni statement è idempotente e indipendente: quello
-- che passa resta, e l'errore dice su quale riga si è fermato. Per la stessa
-- ragione `decided_by` non ha una FK verso `profiles`: era l'unica dipendenza
-- esterna, quindi l'unico punto plausibile di fallimento, e non serve a niente.
--
-- Tabella temporanea come la sezione che la usa: quando Asana è chiuso si droppa
-- insieme a `/asana` e a `lib/asana.ts`.
--
-- Idempotente: si può rilanciare.

-- Prima: NULL = non c'è · un nome = c'era già, e il problema era la cache
SELECT to_regclass('public.asana_triage') AS prima_di_creare;

CREATE TABLE IF NOT EXISTS public.asana_triage (
  -- il gid della task su Asana: è l'unica cosa che i due mondi hanno in comune
  gid         TEXT PRIMARY KEY,
  /* Tre risposte, e nessuna è «forse»: una task che resta in dubbio non ha una
     riga qui, e finisce nel conto di quelle da decidere. Un quarto stato
     «in dubbio» avrebbe fatto sembrare deciso quello che non lo è. */
  decision    TEXT NOT NULL CHECK (decision IN ('tieni', 'elimina', 'migrata')),
  note        TEXT,
  decided_by  UUID,
  decided_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asana_triage_decision ON public.asana_triage (decision);

COMMENT ON TABLE public.asana_triage IS
  '§217 — cosa si è deciso di una task Asana durante la chiusura del workspace. Chiave = gid di Asana, nessuna FK verso tasks: quasi nessuna di queste entrerà in TwoBee. Temporanea: si droppa con la sezione /asana.';

ALTER TABLE public.asana_triage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS asana_triage_admin ON public.asana_triage;
CREATE POLICY asana_triage_admin ON public.asana_triage FOR ALL
  USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

-- Espliciti: Supabase li dà di default, ma se il default fosse stato cambiato
-- l'API risponderebbe 404 esattamente come per una tabella che non esiste.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asana_triage TO authenticated;
GRANT ALL ON public.asana_triage TO service_role;

-- Senza questo la tabella c'è e l'API continua a non vederla
NOTIFY pgrst, 'reload schema';

-- Dopo: deve stampare «asana_triage» e 0 righe
SELECT to_regclass('public.asana_triage') AS dopo_creare,
       (SELECT count(*) FROM public.asana_triage) AS righe;
