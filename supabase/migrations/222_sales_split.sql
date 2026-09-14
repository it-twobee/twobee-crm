-- ═══════════════════════════════════════════════════════════════════════════
-- 222 — §330 · Un commerciale di riferimento, una provvigione divisa
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Il piano compensi conosce due soli casi: o un cliente l'ha portato qualcuno,
-- e la provvigione è sua per intero, o non l'ha portato nessuno (`sales_origin
-- = 'inbound'`, o nessun nome né sulla riga né in anagrafica) e allora si
-- divide fra i soci in parti uguali — 5% a testa sul growth, 2% sul digital.
--
-- Il progetto **iCura AI Digital Trainer** non è né l'uno né l'altro. Walter è
-- il commerciale di riferimento e resta scritto — è lui che il cliente chiama,
-- ed è lui che compare sulla scheda — ma il lavoro è stato portato in tre, e la
-- quota commerciale si divide in tre. Le due strade che il tool aveva erano
-- entrambe sbagliate: lasciarla intera a Walter dà a una persona il compenso di
-- tre, e marcare la riga «inbound» per ottenere la divisione **cancella il
-- commerciale** — cioè scrive una cosa falsa in anagrafica per far tornare un
-- numero, che è il modo in cui un archivio smette di essere consultabile.
--
-- Quindi la divisione diventa quello che è: una **scelta dichiarata**, accanto
-- al nome di chi resta il riferimento. `sales_split` non tocca la percentuale —
-- il 6% resta 6% — cambia solo la tasca in cui finisce.
--
-- Sta su **due** tabelle e non su una sola. Sulla riga, perché è lì che il
-- motore la legge e lì che si corregge un mese. Sull'accordo, perché è
-- dell'accordo che si tratta: un acconto di kick-off e le rate che verranno
-- dopo sono lo stesso lavoro, e una scelta da rifare a mano su ogni rata è una
-- scelta che qualcuno dimenticherà — e il mese in cui la dimentica il numero
-- resta plausibile. `contractDrift` (§207) la riporta dall'accordo alla riga
-- come già fa per tipo, progetto, IVA e partita di giro.

BEGIN;

ALTER TABLE public.pl_revenue_lines
  ADD COLUMN IF NOT EXISTS sales_split BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.revenue_streams
  ADD COLUMN IF NOT EXISTS sales_split BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.pl_revenue_lines.sales_split IS
  '§330 — la provvigione di questa riga si divide fra i soci in parti uguali anche se un commerciale c''è. Non cambia la percentuale, cambia a chi va.';
COMMENT ON COLUMN public.revenue_streams.sales_split IS
  '§330 — l''accordo dice che la provvigione si divide fra i soci. Le righe dei mesi aperti ci si riallineano (§207).';

-- La decisione che ha fatto nascere la colonna, scritta qui e non lasciata a un
-- clic: l'accordo **iCura AI Digital Trainer** divide la provvigione, e la riga
-- dell'acconto di kick-off che è già in agosto la eredita. Come il backfill
-- della 220, è idempotente e nomina quello che tocca — un dato di produzione
-- cambiato da una migration deve essere leggibile nella migration.
UPDATE public.revenue_streams
   SET sales_split = TRUE
 WHERE id = 'c39342e7-4198-4f70-a311-7d4e4ff36c78';

UPDATE public.pl_revenue_lines
   SET sales_split = TRUE
 WHERE stream_id = 'c39342e7-4198-4f70-a311-7d4e4ff36c78';

COMMIT;
