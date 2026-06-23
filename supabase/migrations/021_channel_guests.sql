-- Ospiti esterni nei canali Customer Care
-- Ogni canale CC può avere max 5 clienti + 5 partner
CREATE TABLE IF NOT EXISTS public.channel_guests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id   UUID NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  full_name    TEXT,
  role         TEXT,                          -- es. "CEO", "Marketing Manager"
  guest_type   TEXT NOT NULL DEFAULT 'cliente'
               CHECK (guest_type IN ('cliente', 'partner')),
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'active', 'revoked')),
  invite_token TEXT UNIQUE DEFAULT gen_random_uuid()::text,
  profile_id   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  invited_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  invited_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at  TIMESTAMPTZ,
  UNIQUE(channel_id, email)
);

ALTER TABLE public.channel_guests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth manage channel_guests" ON public.channel_guests;
CREATE POLICY "auth manage channel_guests"
  ON public.channel_guests FOR ALL USING (auth.uid() IS NOT NULL);

-- Aggiungi 'guest' come ruolo valido nei profili
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_app_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_app_role_check
    CHECK (app_role IN ('super_admin','admin','manager','senior','junior','viewer','client','guest'));

-- Canali customer_care: assicura che type check includa 'customer_care'
-- (già fatto in 020, ma per sicurezza)
ALTER TABLE public.chat_channels
  DROP CONSTRAINT IF EXISTS chat_channels_type_check;
ALTER TABLE public.chat_channels
  ADD CONSTRAINT chat_channels_type_check
    CHECK (type IN ('cliente', 'interno', 'task', 'customer_care'));
