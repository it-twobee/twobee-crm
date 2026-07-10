-- Credenziali Google fuori da user_metadata.
--
-- PERCHÉ: /api/google/callback salvava access_token e refresh_token in
-- auth.users.user_metadata. Quel campo è leggibile E scrivibile dal client
-- dell'utente stesso (supabase.auth.updateUser({data})), quindi un refresh
-- token — che vale finché non viene revocato — era esposto al browser.
-- Inoltre non esiste modo di leggere il metadata di un altro utente senza le
-- admin API, e il calendario condiviso ne ha bisogno.
--
-- Qui: tabella con RLS abilitata e NESSUNA policy. Anon e authenticated non
-- possono leggere né scrivere; il service role bypassa le RLS ed è l'unico
-- accesso, sempre server-side.

CREATE TABLE IF NOT EXISTS public.google_credentials (
  profile_id    UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  access_token  TEXT,
  refresh_token TEXT,
  expiry        TIMESTAMPTZ,
  scope         TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.google_credentials ENABLE ROW LEVEL SECURITY;

-- Nessuna policy: deny-all per chiunque non sia service role.
-- (Non aggiungerne. Se serve sapere "è collegato?", usa profiles.google_connected.)

REVOKE ALL ON public.google_credentials FROM anon, authenticated;

-- Flag pubblico, non segreto: serve alla UI per mostrare "Collegato".
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS google_connected BOOLEAN NOT NULL DEFAULT false;

-- Chi aveva già collegato Google ha i token nel metadata: il flag viene
-- ricalcolato al primo passaggio dal callback. Nessuna migrazione dei token:
-- non sono leggibili da qui, e vanno comunque ruotati.
