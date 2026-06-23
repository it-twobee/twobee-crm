-- Campi fiscali cliente (per integrazione Aruba)
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS piva TEXT,
  ADD COLUMN IF NOT EXISTS fiscal_code TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS cap TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'IT',
  ADD COLUMN IF NOT EXISTS sdi_code TEXT,
  ADD COLUMN IF NOT EXISTS pec TEXT,
  ADD COLUMN IF NOT EXISTS email_pec TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS website TEXT;

-- Espandi fatture
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS invoice_type TEXT NOT NULL DEFAULT 'fattura' CHECK (invoice_type IN ('fattura', 'nota_credito')),
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS aruba_id TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS pdf_url TEXT;

-- Aggiorna stato in modo da supportare nota_credito come tipo separato
-- Lo stato per note di credito sarà: da_inviare, inviata, accettata
