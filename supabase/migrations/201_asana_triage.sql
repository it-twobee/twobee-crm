-- ═══════════════════════════════════════════════════════════════════════════
-- §217 · Asana — la decisione presa su ogni task, che sopravvive alla sessione
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Chiudere Asana vuol dire passare in rassegna 146 board e qualche centinaio di
-- task decidendo, una per una, se serve o si butta. Non è un pomeriggio: è un
-- lavoro a strappi, fatto fra una cosa e l'altra, e ogni volta bisogna sapere
-- **dove si era arrivati**.
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
-- Tabella temporanea come la sezione che la usa: quando Asana è chiuso si droppa
-- insieme a `/asana` e a `lib/asana.ts`.
--
-- Idempotente.

BEGIN;

CREATE TABLE IF NOT EXISTS public.asana_triage (
  -- il gid della task su Asana: è l'unica cosa che i due mondi hanno in comune
  gid         TEXT PRIMARY KEY,
  /* Tre risposte, e nessuna è «forse»: una task che resta in dubbio non ha una
     riga qui, e finisce nel conto di quelle da decidere. Un quarto stato
     «in dubbio» avrebbe fatto sembrare deciso quello che non lo è. */
  decision    TEXT NOT NULL CHECK (decision IN ('tieni', 'elimina', 'migrata')),
  note        TEXT,
  decided_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asana_triage_decision ON public.asana_triage (decision);

COMMENT ON TABLE public.asana_triage IS
  '§217 — cosa si è deciso di una task Asana durante la chiusura del workspace. Chiave = gid di Asana, nessuna FK verso tasks: quasi nessuna di queste entrerà in TwoBee. Temporanea: si droppa con la sezione /asana.';

ALTER TABLE public.asana_triage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS asana_triage_admin ON public.asana_triage;
CREATE POLICY asana_triage_admin ON public.asana_triage FOR ALL
  USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

COMMIT;

NOTIFY pgrst, 'reload schema';
