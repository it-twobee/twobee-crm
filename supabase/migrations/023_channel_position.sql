-- Posizione per ordinamento canali nella sidebar
ALTER TABLE public.chat_channels
  ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;

-- Imposta posizioni iniziali: cc prima, interno dopo
UPDATE public.chat_channels SET position = 0 WHERE type IN ('customer_care', 'cliente');
UPDATE public.chat_channels SET position = 1 WHERE type = 'cliente_interno';
