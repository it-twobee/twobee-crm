-- 206 — §242 · La liquidazione IVA vera, dal modello F24
--
-- `lib/vat.ts` stima l'IVA dalle righe registrate: debito meno credito, più
-- l'1% dell'opzione trimestrale. È la stima giusta per sapere quanto mettere da
-- parte, e sarà **sempre** diversa dal modello — il registro IVA del
-- commercialista contiene fatture che il conto economico non ha ancora.
--
-- Sul 2º trimestre 2026 la differenza è di 1.269,46 €: il tool dice 8.399,87, il
-- modello in scadenza il 20 agosto chiede **9.669,33** (codice tributo 6032). Il
-- 22% dei ricavi registrati fa esattamente 9.108,00 di debito, quindi il buco
-- non è un arrotondamento: è fatturato che il conto economico non ha.
--
-- Quando il documento arriva, il documento vince — è la stessa regola dei
-- cedolini (§182) — e la differenza **resta scritta**: è l'unico posto in cui
-- quel buco si vede senza andarlo a cercare. Il riporto al trimestre dopo
-- continua a nascere dal saldo calcolato: sostituirlo con un numero che il
-- modello non contiene sposterebbe l'errore avanti invece di mostrarlo.

CREATE TABLE IF NOT EXISTS public.vat_settlements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year        INT  NOT NULL,
  quarter     INT  NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  -- quello che il modello chiede, interessi compresi
  to_pay      NUMERIC(14,2) NOT NULL DEFAULT 0,
  -- il documento: numero, protocollo, o come lo si ritrova
  doc_ref     TEXT,
  paid_on     DATE,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (year, quarter)
);

COMMENT ON TABLE public.vat_settlements IS
  '§242 — la liquidazione IVA come la dice il modello F24. Dove c''è, vince sulla stima di lib/vat.ts; la differenza resta visibile e dice quanto fatturato manca al conto economico.';

ALTER TABLE public.vat_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vat_settlements_admin ON public.vat_settlements;
CREATE POLICY vat_settlements_admin ON public.vat_settlements
  FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

-- ── il modello arrivato dal commercialista ──────────────────────────────────
-- TWO BEE PAGHE + IVA 2°TRIMESTRE 2026, scadenza 20/08/2026, Banco BPM.
-- Nello stesso F24 ci sono anche le ritenute dei dipendenti (1001, 239,48), i
-- crediti compensati (1701 + 1704 = 217,57) e l'INPS DM10 (856,00): quelli sono
-- costo del lavoro e stanno in `hr_f24`. Qui va solo il rigo 6032.
-- Totale versato col modello: 10.547,24.
INSERT INTO public.vat_settlements (year, quarter, to_pay, doc_ref, note)
VALUES (2026, 2, 9669.33, 'F24 20/08/2026 — cod. 6032',
  'Dal modello del commercialista. Il tool stimava 8.399,87 sulle righe registrate: la differenza di 1.269,46 è fatturato del trimestre che il conto economico non ha. Stesso F24: ritenute 239,48, crediti 217,57, INPS 856,00 — quelli sono in hr_f24. Totale versato 10.547,24.')
ON CONFLICT (year, quarter) DO UPDATE SET
  to_pay = EXCLUDED.to_pay, doc_ref = EXCLUDED.doc_ref, note = EXCLUDED.note,
  updated_at = now();

NOTIFY pgrst, 'reload schema';
