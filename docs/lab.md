# Laboratorio (`/lab`, §474-§500)

Ambiente di prova **solo per il super admin** (`lib/lab-guard.ts`: `hasLabAccess`
nel layout, `requireLabAdmin()` in ogni azione). Le nuove versioni delle sezioni
economiche nascono qui, leggono i dati veri e **non scrivono niente**; finché non
vengono promosse, quelle in uso non cambiano.

- **Mese** (`/lab/novembre`, §475-§476): piano dai contratti, mobile first. Dal
  §500 sopra il piano c'è `BancaMese`: cassa del mese dai movimenti veri, righe
  di entrata e uscita con la copertura di banca, compensi in tre letture.
- **Progetti** (`/lab/progetti`): una riga per progetto da `projectDeal`. Un
  accordo che copre più progetti non si attribuisce a nessuno (§188): margine n/d.
- **Fatturazione** (`/lab/fatturazione`): fatture emesse aperte con `isOpen` e
  `invoiceStatus`, movimento candidato da `txCandidates`. Il caricamento è
  `lib/invoices-load.ts`, lo stesso della pagina in uso.
- **Banca**: non c'è ancora.

## Il mese letto dalla banca (§500, `lib/mese-banca.ts`)
Una spunta «incassato» è un'opinione (§226). Qui una riga è incassata solo se i
movimenti `banca`/`manuale` la coprono **per intero** (quote di `bank_tx_lines`
prima, poi il legame per colonna); un `derivato` non certifica, i nascosti e i
giroconti non contano. Una copertura **parziale** non è un incasso: il compenso
aspetta il resto.

I compensi usano lo stesso motore e la stessa finestra del conto economico
(§286, `buildWindow`/`takenIn`), in tre letture della colonna «incassata»:
maturato · spunte · banca. La differenza banca−spunte è quanto si erogherebbe su
soldi che l'estratto non conferma. Su ottobre 2026: base 10.825 sulle spunte
contro 7.700 sulla banca, per due righe spuntate il 14 ottobre senza movimento.

Gate: `npx tsx lib/mese-banca.check.ts`. Da fare: proporre gli abbinamenti
(`matchCandidates`) ai movimenti senza riga — oggi la pagina mostra solo gli
agganci già fatti.
