-- ═══════════════════════════════════════════════════════════════════════════
-- §191 — I sottoconti dei soci: l'erogato che esce come spesa deducibile
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Il conto Vivid è nato per ads, tool e software. Nel primo mese ha pagato anche
-- 522 € di ristoranti, 91 di carburante e 148 di elettronica: il 52% delle uscite
-- fuori dal suo scopo, e — peggio — le spese di tre persone diverse mescolate in
-- un conto solo. Mescolate non si deducono, perché nessuno può dire di chi era
-- quel pranzo.
--
-- La risposta è una separazione con un fine fiscale preciso: **un sottoconto per
-- socio, con 500 €/mese di budget, e quei 500 sono parte del suo erogato — non un
-- costo in più.** Il socio invece di prendere 500 € in denaro li spende in nome
-- della società: la società porta a costo la spesa e recupera l'IVA dove spetta,
-- e l'erogato in cassa scende dello stesso importo. Il totale che la società
-- sostiene non cambia: cambia la forma, e la forma vale l'imposta.
--
-- Da qui le due regole che il codice deve rispettare, o il conto si sballa:
--
--   1. **Non è un costo di struttura.** Le righe con `partner_id` restano fuori
--      dallo scostamento sul target del 35%: quei soldi erano già stanziati nel
--      30% di erogato del piano compensi. Contarli anche come struttura li
--      farebbe pagare due volte — lo stesso errore della §188 sui subappalti.
--   2. **L'erogato in cassa è netto di quello che il socio ha già speso.**
--      `erogato − speso sul sottoconto`. Senza questo la società pagherebbe due
--      volte: una al fornitore del socio e una al socio.
--
-- L'IVA e la deducibilità **non si dichiarano da sole**: un pranzo è deducibile al
-- 75% e la sua IVA è detraibile solo con fattura intestata e inerenza dimostrata,
-- il carburante segue il veicolo. Perciò ogni riga porta la sua percentuale, con
-- un valore di partenza per famiglia di spesa e la possibilità di correggerlo:
-- un'IVA recuperata senza averne diritto si restituisce con le sanzioni, e vale
-- meno di quella non recuperata.

-- ── Sottoconti ─────────────────────────────────────────────────────────────
ALTER TABLE public.bank_accounts
  -- il conto di cui questo è una tasca: la liquidità totale non cambia
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  -- di chi sono le spese che passano da qui (non tutti i soci hanno un account)
  ADD COLUMN IF NOT EXISTS owner_partner_id UUID REFERENCES public.pl_partners(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS owner_label TEXT,
  -- il tetto mensile: quanto dell'erogato può uscire in questa forma
  ADD COLUMN IF NOT EXISTS allowance_amount NUMERIC(12,2);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_parent ON public.bank_accounts(parent_id);

COMMENT ON COLUMN public.bank_accounts.allowance_amount IS
  'Quota mensile dell''erogato del socio spendibile da questo sottoconto. Non è un costo '
  'aggiuntivo: è una forma di pagamento dell''erogato, e va sottratta da quello in denaro.';

-- ── Le righe di costo sanno di chi sono ─────────────────────────────────────
ALTER TABLE public.pl_cost_lines
  ADD COLUMN IF NOT EXISTS partner_id UUID REFERENCES public.pl_partners(id) ON DELETE SET NULL,
  -- quanto di questo costo è davvero deducibile (0,75 sui pasti, 0,20 sul carburante…)
  ADD COLUMN IF NOT EXISTS deductible_pct NUMERIC(5,4) NOT NULL DEFAULT 1,
  -- e quanto della sua IVA è detraibile: sono due percentuali diverse
  ADD COLUMN IF NOT EXISTS vat_deductible_pct NUMERIC(5,4) NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_pl_cost_lines_partner ON public.pl_cost_lines(partner_id);

COMMENT ON COLUMN public.pl_cost_lines.partner_id IS
  'Spesa fatta da un socio col suo sottoconto. Fuori dal target costi del 35% (era già '
  'erogato) e sottratta dall''erogato in denaro di quel socio.';
COMMENT ON COLUMN public.pl_cost_lines.deductible_pct IS
  'Parte deducibile ai fini IRES/IRAP. La parte restante è un costo che la società '
  'sostiene e su cui paga le imposte: dirlo dopo, in dichiarazione, è tardi.';

-- ── Klaviyo: per adesso è gratis ────────────────────────────────────────────
-- Zero, non cancellata: il tool esiste e adesso costa niente. Cancellarla
-- perderebbe il fatto che, superata la soglia del piano gratuito, tornano 50 €.
UPDATE public.cost_items
   SET amount = 0,
       note = COALESCE(NULLIF(note, '') || ' · ', '')
              || 'Piano gratuito ad agosto 2026: superata la soglia torna a 50 €/mese'
 WHERE label ILIKE '%Klaviyo%' AND amount > 0;

-- ── L'area dove atterrano le spese dei soci ─────────────────────────────────
-- Senza voci di piano: il piano non le prevede una per una, le **registra** dai
-- movimenti dei sottoconti. Il tetto dell'area è la somma delle tre quote.
INSERT INTO public.cost_centers (name, description, monthly_budget, sort_order)
SELECT 'Spese soci',
       'Spese dei soci sui sottoconti Vivid dedicati: rappresentanza, trasferte, '
       'carburante, piccola elettronica. Non è un costo in più — è la parte dell''erogato '
       'che esce come spesa della società, per recuperarne IVA e deducibilità.',
       0, 70
 WHERE NOT EXISTS (SELECT 1 FROM public.cost_centers WHERE lower(name) = 'spese soci');

DO $$
DECLARE
  v_center  UUID;
  v_vivid   UUID;
  v_partner RECORD;
  v_sub     UUID;
  v_quota   NUMERIC := 500;
BEGIN
  SELECT id INTO v_center FROM public.cost_centers WHERE lower(name) = 'spese soci' LIMIT 1;
  SELECT id INTO v_vivid  FROM public.bank_accounts
   WHERE label ILIKE '%Vivid%' AND parent_id IS NULL ORDER BY created_at LIMIT 1;

  FOR v_partner IN
    SELECT id, label, sort_order FROM public.pl_partners WHERE is_active ORDER BY sort_order
  LOOP
    SELECT id INTO v_sub FROM public.bank_accounts
     WHERE owner_partner_id = v_partner.id AND parent_id IS NOT DISTINCT FROM v_vivid LIMIT 1;

    IF v_sub IS NULL AND v_vivid IS NOT NULL THEN
      INSERT INTO public.bank_accounts
        (label, bank_name, currency, opening_balance, opening_date, is_primary, purpose,
         parent_id, owner_partner_id, owner_label, allowance_amount,
         funding_from_id, funding_day, funding_amount, is_active)
      VALUES
        ('Vivid ' || v_partner.label, 'Vivid Money', 'EUR', 0,
         date_trunc('month', CURRENT_DATE)::date, false,
         'Spese di ' || v_partner.label || ' fuori da ads e software: rappresentanza, '
         || 'trasferte, carburante. Quota dell''erogato, non un costo in più.',
         v_vivid, v_partner.id, v_partner.label, v_quota,
         v_vivid, 1, v_quota, true);
    ELSIF v_sub IS NOT NULL THEN
      -- rilanciabile: riallinea la quota e l'aggancio al conto padre
      UPDATE public.bank_accounts
         SET allowance_amount = COALESCE(allowance_amount, v_quota),
             parent_id = COALESCE(parent_id, v_vivid),
             owner_label = COALESCE(owner_label, v_partner.label)
       WHERE id = v_sub;
    END IF;
  END LOOP;

  -- il tetto dell'area è la somma delle quote dei sottoconti attivi
  IF v_center IS NOT NULL THEN
    UPDATE public.cost_centers
       SET monthly_budget = COALESCE((
             SELECT SUM(allowance_amount) FROM public.bank_accounts
              WHERE owner_partner_id IS NOT NULL AND is_active), 0)
     WHERE id = v_center;
  END IF;
END $$;
