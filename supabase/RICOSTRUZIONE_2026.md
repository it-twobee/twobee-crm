# Ricostruzione del conto economico dai movimenti — aprile-agosto 2026

I fatti che hai dettato il 9 agosto, scritti prima di toccare il database.
Cinque mesi di contabilità non si riscrivono da un messaggio di chat senza una
lista che si possa rileggere: se un numero è sbagliato voglio che si veda
**qui**, non fra tre mesi in dichiarazione.

Tutti i mesi sono **riaperti**.

---

## Entrate — i fatti dichiarati

| Cliente | Cosa dice il movimento | Conseguenza sulle righe |
|---|---|---|
| **iCura** | 8.784 € il 9 giugno = aprile+maggio+giugno aggregati · 4.392 € il 21 luglio | resta scoperto **luglio** |
| **Fatima Leo** | primo incasso = **due mensilità** da 1.500 € + IVA | una riga sola copre due mesi |
| **Josè Restaurant** (Marietta) | primo pagamento a **maggio** | niente prima |
| **Sartoria Condotti** (Taylors srl) | due arretrati da 2.000 € → paga **aprile e maggio** | due mensilità in un movimento |
| **Plus Vending** | stesso schema, 1.200 €/mese | idem |
| **Affinity** | 900 € = **metà mese** di servizio di maggio | mezza mensilità, non una intera |
| **Seven** | primo pagamento = **progetto pilota** | non è un canone |

## Uscite — i fatti dichiarati

| Voce | Cosa dice il movimento |
|---|---|
| **Gabriele Saraiello** | pagati aprile, maggio, giugno · **ad agosto** riceve luglio · i due da 1.300 € del 15 maggio sono **marzo e aprile** |
| **Michele e Sabrina** | competenze da **aprile**, ricevute a maggio **di tasca di Marco** · maggio pagato a giugno · giugno pagato a luglio |
| **Agostino** | parte da **giugno**, ricevuto a luglio |
| **Annalisa** | parte da **giugno**, ricevuto a luglio |
| **Marco 1.225 € + Walter 1.275 €** | **capitale sociale versato** — non è un compenso |
| **Walter −1.200 €** | ritiro dell'**anticipo per il notaio** |
| **Affinity 29/05** | subappalto del **progetto pilota** |
| **Roberto Annunziata** | subappalto: contenuti ads per Sartoria Condotti |
| **Gialeda 366 €** | tirocinio di **Agostino** |
| **Talenti 366 €** | apprendistato di **Sabrina** |
| **Asana** | pagato per qualche mese, **da agosto non più** |
| **Commissioni bonifici** | vanno **in conto economico** come uscita, sommate |
| **Google Cloud** | fatture ancora da caricare in Fatturazione |
| **Erogato + commerciale** | **due mesi** erogati davvero a Marco, Toto, Walter |
| **Giugno, Marco e Toto** | compenso **maggiorato per scelta strategica** — fuori formula |

## Due cose da verificare prima di scrivere

1. **I movimenti del 1° maggio non esistono.** Vanno ricontrollati sull'estratto
   conto e cancellati se sono un artefatto dell'import. Finché ci sono, ogni
   totale di maggio è sbagliato.
2. **Alcuni «pagamenti dichiarati» vanno confermati**: sono usciti davvero dalla
   tasca di Marco, o sono solo residui di budget nel conto economico? Sono due
   cose opposte — nel primo caso è un anticipo da rimborsare, nel secondo è una
   riga da azzerare.

## Regole che valgono sempre

- L'**erogato ai soci** si paga il mese dopo.
- Il **costo delle risorse** si paga il mese dopo (il 20).
- Ogni risorsa pesa **dal mese in cui è entrata** (§233).
- Un **anticipo di tasca propria** esiste solo se registrato come movimento
  `manuale` (§195): un fatto che non è scritto, per il tool non è successo.
- Un **incasso dichiarato** non è un movimento e non compare in Banca (§249).

## Perché non l'ho scritto stanotte

Sono cinque mesi, ~138 movimenti e venti regole che si incrociano — e tre di
esse (i movimenti del 1° maggio, i dichiarati di Marco, l'importo maggiorato di
giugno) **non hanno ancora un numero**. Scrivere gli altri diciassette e lasciare
quei tre a metà produrrebbe un conto economico che sembra a posto e non lo è, che
è peggio di uno palesemente incompleto: nessuno andrebbe più a controllarlo.

Servono, nell'ordine:

1. l'estratto conto del **1° maggio**, per sapere cosa cancellare;
2. l'elenco degli **anticipi di Marco** (data, importo, per chi) da caricare come
   movimenti `manuale`;
3. **quanto** hanno preso Marco e Toto a giugno.

Con quei tre numeri la ricostruzione si fa in un passaggio solo, verificabile
mese per mese con `npx tsx scripts/verify-invoices.ts` e
`npx tsx scripts/verify-bank.ts`.
