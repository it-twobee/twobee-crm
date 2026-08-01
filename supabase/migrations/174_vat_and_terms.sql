-- 174 — L'accordo di pagamento si scrive, l'IVA si mette da parte.
--
-- Due cose che il conto economico non sapeva dire.
--
-- 1. **Come** si paga, non solo quanto. Un contratto a 6.000 con saldo a 90
--    giorni e uno con 40/30/30 valgono lo stesso a bilancio e sono due mondi
--    diversi in cassa. Vale per quello che incassi dal cliente e per quello che
--    paghi al fornitore: quando affidi fuori una lavorazione, l'accordo con chi
--    la esegue parte quasi sempre da quello che hai col cliente — stessa
--    struttura, stesse scadenze — ma può essere diverso, e va scritto.
--
-- 2. L'IVA che stai accumulando. Non è tua: la incassi dal cliente e la giri
--    allo Stato. Il regime lo decide l'azienda, quindi sta in configurazione e
--    non nel codice.

ALTER TABLE public.revenue_streams
  ADD COLUMN IF NOT EXISTS payment_terms TEXT;

ALTER TABLE public.cost_items
  ADD COLUMN IF NOT EXISTS payment_terms TEXT;

COMMENT ON COLUMN public.revenue_streams.payment_terms IS
  'Metodo di pagamento concordato: «30gg d.f. fine mese», «40/30/30 a SAL», «anticipo 50%»…';
COMMENT ON COLUMN public.cost_items.payment_terms IS
  'Accordo col fornitore. Di norma ricalca quello col cliente, ma può divergere.';

ALTER TABLE public.pl_config
  ADD COLUMN IF NOT EXISTS vat_regime TEXT NOT NULL DEFAULT 'trimestrale'
    CHECK (vat_regime IN ('mensile', 'trimestrale')),
  -- l'1% è il prezzo dell'opzione trimestrale, si versa sul dovuto dei primi
  -- tre trimestri. Sta qui perché è una regola fiscale, e le regole cambiano.
  ADD COLUMN IF NOT EXISTS vat_interest_pct NUMERIC(5,4) NOT NULL DEFAULT 0.01;

NOTIFY pgrst, 'reload schema';
