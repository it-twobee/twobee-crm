# Periodi estesi in Banca Laboratorio — 17 novembre 2026

Il selettore sostituisce il solo mese con: mese (con precedente/successivo), ultimi 30 giorni, ultimi 90 giorni, ultimi 6 mesi di calendario incluso quello corrente, trimestre del mese indicato, anno del mese indicato, periodo libero dal/al e tutto lo storico disponibile. Per trimestre/anno il mese di riferimento determina il periodo di calendario, non una finestra mobile.

Date e confini sono inclusivi, calcolati in UTC sulle date bancarie; osservazione corrente Europe/Rome. Date libere impossibili, mancanti o invertite mostrano un avviso e il mese di riferimento, senza un risultato vuoto presentato come valido. Il form limita la fine a oggi; anche URL costruiti manualmente non includono fatti futuri. Il periodo richiesto e la data limite dell’osservazione restano visibili.

URL: `periodo`, `dal`, `al`, con `m` mantenuto per il contesto e i periodi di calendario. Il periodo si conserva fra conti, viste, filtri e accessi dai grafici. Il giorno selezionato deve appartenere all’intervallo. I filtri dei movimenti non cambiano il saldo.

`bankReadout` accetta un intervallo opzionale: i chiamanti precedenti mantengono il mese. Flussi, dichiarati esclusi e lista si limitano all’intervallo; il saldo finale usa l’apertura e tutto lo storico bancario precedente fino alla fine osservabile. Il confronto con l’estratto resta alla data dichiarata, non viene spostato alla fine del periodo.

Anche `bankDailyChart` accetta l’intervallo opzionale. La curva saldo si ritaglia sul periodo mantenendo il cumulato precedente; un punto al termine riporta l’ultimo saldo ricostruito senza dichiarare la completezza degli estratti. L’apertura non viene estesa artificiosamente a prima della propria data. Esportazioni e contesto riportano i dati del periodo; clic sul giorno conserva i confini selezionati.

Nessuna migration, scrittura economica o modifica a Economics. Gate estesi in `lib/lab-bank.check.ts`: rolling, trimestri/anni, bisestili, date invalide/invertite, intervalli fra mesi, cumulato iniziale, cap alla data osservata e grafico con intervallo. Verifica visiva autenticata ancora da completare.

Esiti: TypeScript, 147/147 gate Europe/Rome e build passati. Gate Banca anche UTC e America/Los_Angeles. Ventuno ingressi anonimi con parametri conservati, 28 chunk Lab e chunk popup 200/JavaScript; API raccordi anonime 403/no-store. Nessuna prova visiva autenticata dichiarata.
