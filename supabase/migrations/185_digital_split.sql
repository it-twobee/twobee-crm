-- 185 — Spartizione digital: quote sull'imponibile, non sul residuo.
--
-- Prima il digital si divideva così: 6% al commerciale, 35% target costi, 10%
-- fondo rischio, e il 49% che restava veniva spartito col vecchio meccanismo —
-- il 30% del residuo a ciascun socio, il 10% alla cassa. Due problemi.
--
-- Il primo è che nessuno sapeva dire quanto prendeva. «Il 30% del 49%» su una
-- fattura da 3.000 € è un conto a mente che nessuno fa, e una quota che non si
-- calcola a mente non si controlla: diventa un numero che arriva.
--
-- Il secondo è che quelle percentuali sommavano al 44,1% dell'imponibile ai
-- soci, che sul digital — dove il lavoro lo fa il team a stipendio, non i soci —
-- non regge il costo del personale.
--
-- Da qui in avanti le quote digital sono percentuali dell'**imponibile**, e si
-- leggono sulla riga:
--
--     6%  al commerciale (quello dell'anagrafica del cliente)
--    28%  ai soci, in parti uguali
--    10%  alle casse TwoBee
--    35%  target costi
--    10%  fondo rischio
--    ───
--    11%  margine non distribuito, che resta in cassa e si mostra a parte
--
-- Il growth non cambia: 15% commerciale, 30% erogato in parti uguali fra i soci,
-- residuo in cassa. Lì la quota è erogato — il lavoro lo fanno i soci — e sul
-- digital è utile: sono due cose diverse e continuano ad avere due formule.
--
-- Sul commerciale: se il cliente non ne ha uno in anagrafica, il 6% **non resta
-- in cassa**, si divide fra i soci in parti uguali, come già accade sul growth.

ALTER TABLE public.pl_config
  -- quota complessiva ai soci sul digital, divisa in parti uguali fra loro
  ADD COLUMN IF NOT EXISTS digital_partners_pct NUMERIC(5,4) NOT NULL DEFAULT 0.2800,
  -- quota destinata alle casse della società
  ADD COLUMN IF NOT EXISTS digital_company_pct  NUMERIC(5,4) NOT NULL DEFAULT 0.1000;

COMMENT ON COLUMN public.pl_config.digital_partners_pct IS
  'DIGITAL: quota dell''imponibile ai soci, in parti uguali. Sostituisce partner_share_pct sul residuo.';
COMMENT ON COLUMN public.pl_config.digital_company_pct IS
  'DIGITAL: quota dell''imponibile alle casse TwoBee. Il margine che avanza resta comunque in cassa, ma si legge a parte.';

-- la riga singola di configurazione prende le quote nuove (il default vale solo
-- per una tabella vuota, e qui la riga c'è già dalla 163)
UPDATE public.pl_config SET
  digital_sales_pct    = 0.0600,
  digital_partners_pct = 0.2800,
  digital_company_pct  = 0.1000
WHERE id = true;

-- `partner_share_pct` e `company_share_pct` restano in tabella: servono ancora al
-- growth quando `growth_residual_to_company` è false. Sul digital non li legge
-- più nessuno — cancellarli avrebbe rotto la storia dei mesi già chiusi.

NOTIFY pgrst, 'reload schema';
