-- Add priority field to portfolio_clients for Asana-like priority sorting
ALTER TABLE public.portfolio_clients
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'media'
    CHECK (priority IN ('alta', 'media', 'bassa'));
