-- §321 — Il quarto stato che non è un cliente: `lead`.
--
-- Nasce da un gesto preciso: nella nuova task ad hoc si scrive il nome di
-- qualcuno che in anagrafica non c'è. Le risposte possibili sono due, e sono
-- entrambe «mettilo in anagrafica» — cambia il peso della riga:
--
--   · **aggiungi in anagrafica** → è un cliente, si apre la scheda completa;
--   · **segna come lead** → non è ancora un cliente, ma il lavoro per lui è
--     già cominciato e deve avere un posto dove stare.
--
-- L'alternativa era un campo di testo libero sulla task. Sarebbe stato un
-- riferimento sospeso: non si apre, non si raggruppa, non compare nella scheda
-- di nessuno, e il giorno in cui quel nome diventa un cliente vero non c'è
-- niente da collegare. Una riga in anagrafica invece è la stessa entità in uno
-- stato precedente, e diventare cliente è cambiare una parola.
--
-- **Un lead non fattura**, quindi vale la regola della `pending` (§176): fuori
-- da MRR attivo, generazione del conto economico, alert e insight. E **non è un
-- perso**: non è mai stato un cliente, quindi non conta nel churn — contarlo
-- direbbe che abbiamo perso qualcuno che non avevamo. `lib/clients.ts` resta
-- l'unica fonte: `isLead`, `countsInStats`.
--
-- Additiva e idempotente: allarga un CHECK, non tocca una riga.

ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_client_label_check;
ALTER TABLE public.clients ADD CONSTRAINT clients_client_label_check
  CHECK (client_label IN ('stabile', 'in_bilico', 'pending', 'lead', 'perso', 'partner'));

COMMENT ON COLUMN public.clients.client_label IS
  '§321 — stabile · in_bilico · pending (sospeso, §176) · lead (non ancora cliente: '
  'fuori dai conti, fuori dal churn) · perso · partner.';
