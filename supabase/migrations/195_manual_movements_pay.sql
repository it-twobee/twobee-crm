-- ═══════════════════════════════════════════════════════════════════════════
-- §205 — Un movimento a mano è denaro che si è mosso
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `bank_on_match` usciva subito su tutto quello che non era `banca`:
--
--     IF NEW.source <> 'banca' THEN RETURN NEW; END IF;
--
-- Conseguenza: si poteva agganciare un movimento **manuale** — contante, la carta
-- di un socio — a una fattura, e non accadeva niente. La riga restava da incassare
-- pur essendo stata pagata, e il movimento dichiarato gemello restava lì a
-- raddoppiare l'uscita. L'intenzione del filtro era giusta (un movimento
-- `derivato` nasce da una spunta e non deve marcare niente: sarebbe la spunta che
-- conferma se stessa) ma la condizione era troppo larga.
--
-- La regola vera è una sola: **`derivato` è una dichiarazione, `banca` e `manuale`
-- sono fatti.** Un fatto marca la riga pagata e spegne la dichiarazione gemella.
--
-- Il saldo **reale** continua a contare solo `banca`, e questo non cambia: la
-- riconciliazione col conto va fatta su ciò che il conto prova. Un movimento
-- manuale resta nel saldo *dichiarato*, che è il posto giusto per il denaro che si
-- è mosso senza passare da qui.

BEGIN;

CREATE OR REPLACE FUNCTION public.bank_on_match()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- una dichiarazione non conferma se stessa: solo i fatti marcano
  IF NEW.source = 'derivato' THEN RETURN NEW; END IF;

  IF NEW.revenue_line_id IS NOT NULL THEN
    DELETE FROM bank_transactions
     WHERE revenue_line_id = NEW.revenue_line_id AND source = 'derivato';
    UPDATE pl_revenue_lines SET paid = true
     WHERE id = NEW.revenue_line_id AND paid IS NOT TRUE;
  END IF;

  IF NEW.cost_line_id IS NOT NULL THEN
    DELETE FROM bank_transactions
     WHERE cost_line_id = NEW.cost_line_id AND source = 'derivato';
    UPDATE pl_cost_lines SET paid = true
     WHERE id = NEW.cost_line_id AND paid IS NOT TRUE;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.bank_on_match() IS
  '§205 — `derivato` è una dichiarazione e non marca niente; `banca` e `manuale` sono fatti '
  'e marcano la riga pagata, spegnendo la dichiarazione gemella. Il saldo reale resta quello '
  'dei soli movimenti `banca`: la riconciliazione si fa su ciò che il conto prova.';

-- ── Le dichiarazioni orfane ─────────────────────────────────────────────────
-- Ogni spunta «pagato» ripetuta creava un movimento dichiarato in più, e
-- rimuovendo la riga restavano lì a gonfiare il saldo dichiarato. Non toccano il
-- saldo reale, ma sporcano ogni confronto: si puliscono una volta.
DELETE FROM public.bank_transactions
 WHERE source = 'derivato'
   AND revenue_line_id IS NULL
   AND cost_line_id IS NULL;

COMMIT;
