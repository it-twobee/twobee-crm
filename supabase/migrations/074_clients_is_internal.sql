-- Clienti interni (TwoBee, Elettra Group) — esclusi dalle statistiche commerciali/finanziarie
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS is_internal BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_clients_is_internal ON public.clients(is_internal);
