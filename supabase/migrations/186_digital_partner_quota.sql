-- 186 — Digital: 28% a socio sul margine, e il fondo rischio è una scelta.
--
-- Corregge la 185, che aveva letto «il 28% ai tre soci» come quota complessiva.
-- È **28% a ciascuno**, e la base non è l'imponibile ma il **margine**: prima si
-- paga il subappaltatore, poi si divide quello che resta.
--
--     Progetto digital 24.000 €, 12.000 affidati fuori
--     ─────────────────────────────────────────────────
--     margine                       12.000
--       commerciale        6%           720
--       Marco             28%         3.360
--       Toto              28%         3.360
--       Walter            28%         3.360
--       casse TwoBee      10%         1.200
--     ─────────────────────────────────────────────────
--       totale           100%        12.000
--
-- Perché il margine e non il ricavo: su un lavoro affidato fuori il ricavo lordo
-- non è distribuibile — metà è già di qualcun altro. Distribuire l'imponibile
-- significherebbe promettere ai soci soldi che il subappaltatore si porta via il
-- mese dopo. Il growth resta sull'imponibile perché lì il costo di delivery è il
-- tempo dei soci, e quel tempo è già la loro quota.
--
-- FONDO RISCHIO, OPZIONALE. Sopra i 20.000 € di valore del progetto l'admin può
-- destinare il 9% del margine al fondo rischio, togliendo 3 punti a ciascun socio
-- (28 → 25). Non è automatico: su un progetto grosso può convenire tenere il
-- margine liquido, e quella decisione la prende una persona, riga per riga. Sotto
-- i 20.000 l'opzione non compare nemmeno.
--
-- CONSEGUENZA DA SAPERE: il margine digital è distribuito per intero, quindi il
-- digital **non contribuisce** al 35% di target costi né al fondo rischio
-- ordinario del 10%. Struttura e personale li copre il growth. In un mese a
-- prevalenza digital la cassa TwoBee risulta negativa, e il tool la mostra
-- negativa: è la verità del piano, non un errore di calcolo.

ALTER TABLE public.pl_config
  -- quota del margine a CIASCUN socio (non complessiva: la 185 diceva quello)
  ADD COLUMN IF NOT EXISTS digital_partner_pct    NUMERIC(5,4) NOT NULL DEFAULT 0.2800,
  -- quota del margine alle casse della società
  ADD COLUMN IF NOT EXISTS digital_company_pct    NUMERIC(5,4) NOT NULL DEFAULT 0.1000,
  -- fondo rischio digital, quando l'admin lo attiva
  ADD COLUMN IF NOT EXISTS digital_risk_fund_pct  NUMERIC(5,4) NOT NULL DEFAULT 0.0900,
  -- punti percentuali tolti a ciascun socio per finanziarlo
  ADD COLUMN IF NOT EXISTS digital_risk_cut_pct   NUMERIC(5,4) NOT NULL DEFAULT 0.0300,
  -- valore del progetto oltre il quale l'opzione è disponibile
  ADD COLUMN IF NOT EXISTS digital_risk_threshold NUMERIC(12,2) NOT NULL DEFAULT 20000;

COMMENT ON COLUMN public.pl_config.digital_partner_pct IS
  'DIGITAL: quota del margine (ricavo meno subappalti) a CIASCUN socio. Con tre soci fa l''84%.';
COMMENT ON COLUMN public.pl_config.digital_risk_fund_pct IS
  'DIGITAL: quota del margine al fondo rischio, solo se l''admin la attiva sulla riga e il progetto supera la soglia.';
COMMENT ON COLUMN public.pl_config.digital_risk_threshold IS
  'Valore venduto del progetto oltre il quale l''opzione fondo rischio compare. Si guarda il progetto, non la rata.';

UPDATE public.pl_config SET
  digital_sales_pct      = 0.0600,
  digital_partner_pct    = 0.2800,
  digital_company_pct    = 0.1000,
  digital_risk_fund_pct  = 0.0900,
  digital_risk_cut_pct   = 0.0300,
  digital_risk_threshold = 20000
WHERE id = true;

-- `digital_partners_pct` della 185 (quota complessiva) non la legge più nessuno.
-- Resta in tabella se la 185 è stata eseguita: una colonna inutilizzata non fa
-- danni, una colonna cancellata rompe un mese già chiuso che la leggeva.

-- ═══════════════════════════════════════════════════════════════════════════
-- La scelta sul fondo rischio sta sulla riga, non nella configurazione
-- ═══════════════════════════════════════════════════════════════════════════
-- Perché è una decisione per progetto: due lavori da 30.000 € nello stesso mese
-- possono meritare risposte diverse, e una scelta globale costringerebbe a
-- cambiarla avanti e indietro.
ALTER TABLE public.pl_revenue_lines
  ADD COLUMN IF NOT EXISTS risk_fund BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.pl_revenue_lines.risk_fund IS
  'Digital sopra soglia: il 9% del margine va al fondo rischio e i soci scendono al 25%. Scelta dell''admin.';

NOTIFY pgrst, 'reload schema';
