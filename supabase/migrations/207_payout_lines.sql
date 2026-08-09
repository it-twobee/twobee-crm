-- 207 — §243 · Il compenso diventa una riga che si può spuntare
--
-- Fin qui i compensi a soci e commerciali non erano scritti da nessuna parte:
-- si ricalcolano a ogni lettura dalle righe del mese (§227), ed è la ragione per
-- cui basta mettere una rata nel mese giusto perché provvigioni ed erogato
-- tornino da soli. È anche la ragione per cui non si potevano **spuntare**: non
-- c'era niente su cui mettere la spunta, e «quanto è uscito davvero» si poteva
-- solo dedurre dai bonifici (§226) — che non dicono se stanno pagando la quota
-- di socio o la provvigione, perché a una persona sola si bonifica una volta.
--
-- Qui il compenso diventa una riga, con la stessa disciplina delle entrate:
-- **l'importo si copia**, non si ricalcola. Un mese chiuso deve restare quello
-- che era anche se domani una rata si sposta, e senza la copia il compenso di
-- luglio cambierebbe sotto gli occhi di chi lo ha già bonificato.
--
-- **Matura in un mese ed esce in quello dopo**, come il costo del lavoro (§224):
-- le retribuzioni di luglio si pagano ad agosto, e lo stesso vale per l'erogato
-- ai soci e per le provvigioni. `due_month` lo scrive la generazione, `paid_on`
-- lo scrive la spunta — e sono due cose diverse, come sempre in questo tool.

CREATE TABLE IF NOT EXISTS public.pl_payouts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month_id     UUID NOT NULL REFERENCES public.pl_months(id) ON DELETE CASCADE,
  -- la chiave della persona: 'p:<partner_id>' per un socio, 'o:<nome>' per un
  -- commerciale senza account. È la stessa di `mergePeople` in cash-certify.
  person_key   TEXT NOT NULL,
  person_label TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('socio', 'commerciale')),
  -- copiato dal piano compensi quando il mese si prepara, non ricalcolato dopo
  amount       NUMERIC(14,2) NOT NULL DEFAULT 0,
  -- il mese in cui è atteso: quello dopo la maturazione (§224)
  due_month    DATE NOT NULL,
  paid         BOOLEAN NOT NULL DEFAULT false,
  paid_on      DATE,
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- una persona, un mese, un tipo: un socio che è anche commerciale ha due
  -- righe, perché sono due lavori diversi pagati con due formule diverse (§231)
  UNIQUE (month_id, person_key, kind)
);

CREATE INDEX IF NOT EXISTS pl_payouts_due ON public.pl_payouts (due_month);
CREATE INDEX IF NOT EXISTS pl_payouts_paid_on ON public.pl_payouts (paid_on);

COMMENT ON TABLE public.pl_payouts IS
  '§243 — compensi a soci e commerciali come righe spuntabili. Importo copiato dal piano (non ricalcolato), maturazione nel mese, uscita in quello dopo. paid_on è l''unico che fa cassa.';

ALTER TABLE public.pl_payouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pl_payouts_admin ON public.pl_payouts;
CREATE POLICY pl_payouts_admin ON public.pl_payouts
  FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

-- ── la data la scrive la spunta, non chi spunta ─────────────────────────────
-- Stessa regola delle righe di conto economico (§224): quando si mette la
-- spunta il movimento è di **oggi**, e togliendola la data se ne va con lei.
-- Chiedere la data a mano significa averla sbagliata la metà delle volte.
CREATE OR REPLACE FUNCTION public.pl_payout_paid_on()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.paid IS TRUE AND (OLD.paid IS DISTINCT FROM NEW.paid) AND NEW.paid_on IS NULL THEN
    NEW.paid_on := CURRENT_DATE;
  END IF;
  IF NEW.paid IS FALSE THEN NEW.paid_on := NULL; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_pl_payout_paid_on ON public.pl_payouts;
CREATE TRIGGER trg_pl_payout_paid_on
  BEFORE UPDATE ON public.pl_payouts
  FOR EACH ROW EXECUTE FUNCTION public.pl_payout_paid_on();

NOTIFY pgrst, 'reload schema';
