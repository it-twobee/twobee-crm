-- §344 — Il foglio riservato si chiede, non si nega.
-- `/api/compensi` è un documento che si manda a chi il compenso lo riceve, e
-- chi lo riceve nel tool non entra (§334). Finché la porta rispondeva
-- «Permesso negato», il link condiviso diventava una telefonata: chi apriva non
-- sapeva a chi chiedere, chi aveva mandato non sapeva che qualcuno aspettava.
-- Qui si conserva la domanda: chi, quale documento, e la decisione dell'admin.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.report_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Il browser che ha chiesto: chi non ha un account non ha un id, e il
  -- permesso deve poter tornare a lui senza fargli creare un utente.
  token text NOT NULL,
  resource text NOT NULL,
  -- Il permesso è del **documento**, non della persona: il mese chiesto.
  scope text NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  -- Se chi chiede aveva una sessione, l'admin lo sa: un nome scritto a mano e
  -- un account del tool non sono la stessa prova.
  requester_email text,
  requester_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'denied')),
  decided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at timestamptz,
  -- Un permesso che non scade è un permesso che nessuno revoca.
  expires_at timestamptz,
  opened_at timestamptz,
  opened_n integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Una richiesta per documento e per browser: riaprire la pagina non deve
-- moltiplicare le notifiche a chi approva.
CREATE UNIQUE INDEX IF NOT EXISTS report_access_one_per_doc
  ON public.report_access_requests (token, resource, scope);
CREATE INDEX IF NOT EXISTS report_access_da_decidere
  ON public.report_access_requests (resource, status, created_at DESC);

-- Deny-all come `google_credentials`: qui dentro c'è chi può leggere numeri
-- riservati, quindi ci passa solo il service role, dietro le guard applicative.
ALTER TABLE public.report_access_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.report_access_requests FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
