-- Fase 2b — Calendario: mirror locale degli eventi + colonne watch channel.
-- Additiva + idempotente. Il mirror serve a: (1) collegare eventi a cliente/progetto
-- (fix matching §16), (2) overlay, (3) base per il webhook 2c. Fonte di verità resta
-- Google; qui teniamo una copia con external_event_id e stato di sync.

CREATE TABLE IF NOT EXISTS public.calendar_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  external_event_id TEXT,                       -- id evento su Google
  calendar_id       TEXT NOT NULL DEFAULT 'primary',
  client_id         UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  project_id        UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  title             TEXT NOT NULL,
  description       TEXT,
  location          TEXT,
  start_at          TIMESTAMPTZ,
  end_at            TIMESTAMPTZ,
  all_day           BOOLEAN NOT NULL DEFAULT false,
  timezone          TEXT NOT NULL DEFAULT 'Europe/Rome',
  attendees         JSONB,
  meet_link         TEXT,
  color             TEXT,
  recurrence        TEXT,                        -- RRULE (es. 'RRULE:FREQ=WEEKLY')
  reminders         JSONB,                       -- [{method,minutes}]
  sync_status       TEXT NOT NULL DEFAULT 'synced'
                      CHECK (sync_status IN ('synced', 'pending', 'error', 'local')),
  last_synced_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (profile_id, external_event_id)
);

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

-- Ognuno gestisce i propri eventi; lo staff può leggere (overlay agende interne).
DROP POLICY IF EXISTS calendar_events_owner       ON public.calendar_events;
DROP POLICY IF EXISTS calendar_events_staff_read  ON public.calendar_events;
CREATE POLICY calendar_events_owner ON public.calendar_events
  FOR ALL USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());
CREATE POLICY calendar_events_staff_read ON public.calendar_events
  FOR SELECT USING (public.is_staff());

CREATE INDEX IF NOT EXISTS idx_calendar_events_profile ON public.calendar_events(profile_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_project ON public.calendar_events(project_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_client  ON public.calendar_events(client_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_extid   ON public.calendar_events(external_event_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_range   ON public.calendar_events(start_at, end_at);

-- Watch channel Google (push notifications) per il webhook 2c. I channel scadono
-- (~7gg) → servono per il rinnovo. Sta in google_credentials (deny-all, service role).
ALTER TABLE public.google_credentials
  ADD COLUMN IF NOT EXISTS calendar_channel_id      TEXT,
  ADD COLUMN IF NOT EXISTS calendar_resource_id     TEXT,
  ADD COLUMN IF NOT EXISTS calendar_channel_expiry  TIMESTAMPTZ;
