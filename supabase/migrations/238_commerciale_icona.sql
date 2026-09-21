-- §375 — l'icona del commerciale diventa `Handshake`, nei due portali.
--
-- La 237 aveva messo `Target` nel workspace per farla combaciare con la barra
-- admin. Combaciava — ma nella barra admin `Target` era già l'icona di
-- **«Costi e budget»**, ed era l'unica usata due volte in tutto il prodotto.
--
-- Due sezioni con lo stesso simbolo si confondono quanto una sezione con due
-- simboli diversi, e il danno è lo stesso: l'icona è la prima cosa che si
-- cerca quando si sa dove si vuole andare ma non come si chiama la voce. Chi
-- puntava a «Commerciale» finiva su un conto economico.
--
-- `Handshake` dice «trattativa» senza doverci pensare, e non è usata da
-- nessun'altra parte. La barra admin è un file TypeScript e quella del
-- workspace è questa tabella: vanno cambiate tutte e due, o si ricrea proprio
-- l'asimmetria che la 237 era venuta a chiudere.
--
-- Rilanciabile: un UPDATE che al secondo giro non trova più niente.

BEGIN;

UPDATE public.workspace_sections
   SET icon = 'Handshake'
 WHERE key = 'commerciale' AND icon IS DISTINCT FROM 'Handshake';

COMMIT;

-- verifica: l'icona è quella nuova, e nessun'altra sezione la usa
SELECT
  (SELECT icon FROM public.workspace_sections WHERE key = 'commerciale')        AS icona_commerciale,
  (SELECT count(*) FROM public.workspace_sections WHERE icon = 'Handshake')     AS quante_la_usano;
