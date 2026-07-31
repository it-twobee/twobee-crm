-- 167 — Provvigione senza commerciale: si divide fra i soci, non resta in cassa.
--
-- Regola: se un cliente non l'ha portato nessuno — tipicamente arriva dalla
-- lead generation — il 15% del growth non sparisce e non finisce in cassa: si
-- divide in parti uguali fra i soci, 5% a testa. È la stessa regola del foglio
-- di gestione, dove `no_comm` veniva diviso per tre.
--
-- Una riga senza commerciale è già trattata così dal motore (`isInbound` in
-- lib/pl.ts). `sales_origin` serve a dirlo in modo esplicito: distingue «non
-- l'ha portato nessuno» da «mi sono dimenticato di compilarlo», e permette di
-- dividere la provvigione anche quando un commerciale è valorizzato ma il
-- cliente è comunque arrivato da inbound.

ALTER TABLE public.pl_revenue_lines
  ADD COLUMN IF NOT EXISTS sales_origin TEXT NOT NULL DEFAULT 'diretto'
    CHECK (sales_origin IN ('diretto', 'inbound'));

ALTER TABLE public.revenue_streams
  ADD COLUMN IF NOT EXISTS sales_origin TEXT NOT NULL DEFAULT 'diretto'
    CHECK (sales_origin IN ('diretto', 'inbound'));

-- Le righe già inserite senza commerciale sono inbound per definizione:
-- allinearle evita che il primo salvataggio le faccia cambiare comportamento.
UPDATE public.pl_revenue_lines
SET sales_origin = 'inbound'
WHERE sales_owner_id IS NULL AND (sales_owner IS NULL OR sales_owner = '');

NOTIFY pgrst, 'reload schema';
