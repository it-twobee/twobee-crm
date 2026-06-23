-- Rinomina roas → mer (è sempre stato MER, non ROAS)
ALTER TABLE public.client_kpis
  RENAME COLUMN roas TO mer;

-- Nuove colonne Growth
ALTER TABLE public.client_kpis
  ADD COLUMN IF NOT EXISTS sql_count        INTEGER,
  ADD COLUMN IF NOT EXISTS ltv              NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS orders_count     INTEGER,
  ADD COLUMN IF NOT EXISTS avg_order_value  NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS cart_abandonment NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS reach            INTEGER,
  ADD COLUMN IF NOT EXISTS engagement_rate  NUMERIC(5,2);

-- Nuove colonne Digital
ALTER TABLE public.client_kpis
  ADD COLUMN IF NOT EXISTS organic_sessions INTEGER,
  ADD COLUMN IF NOT EXISTS new_users        INTEGER,
  ADD COLUMN IF NOT EXISTS seo_avg_position NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS bounce_rate      NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS active_users     INTEGER,
  ADD COLUMN IF NOT EXISTS uptime           NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS ai_interactions  INTEGER,
  ADD COLUMN IF NOT EXISTS crm_contacts     INTEGER,
  ADD COLUMN IF NOT EXISTS automation_runs  INTEGER,
  ADD COLUMN IF NOT EXISTS email_open_rate  NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS email_click_rate NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS unsubscribe_rate NUMERIC(5,3);
