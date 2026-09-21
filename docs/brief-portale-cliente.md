# Brief funzionale — Portale cliente (v1.0)

Trascrizione **verbatim** di `TwoBee-OS_Brief_Portale-Cliente_v1.0.pdf`
(documento 2 di 2, 14 settembre 2026). Il PDF non è nel repo: sta fuori, e un
brief che vive solo sul portatile di una persona non è una fonte condivisa.
Il documento 1 di 2 è `TwoBee-OS_Brief_Area-Commerciale_v1.0.pdf`, già
implementato — vedi `docs/commerciale.md`.

---

TWOBEE OS · BRIEF FUNZIONALE

Portale cliente
Brief funzionale per sviluppo e confronto tecnico

DOCUMENTO          2 di 2 — Versione 1.0

DESTINATARIO       Sviluppatore IT TwoBee OS

OBIETTIVO          Sviluppare un portale customer centric, alimentato dal lavoro operativo e semplice da usare per cliente e team.

1 Risultato atteso

Il cliente deve poter capire:

  Come procedono i progetti.
  Cosa è stato consegnato.
  Cosa succederà dopo.
  Cosa serve da lui.
  Come chiedere aiuto.

  Il team deve aggiornare il lavoro una volta sola, mantenendo una distinzione sicura tra contenuti interni e condivisi.

Il percorso /portale e le funzioni customer care risultano già citati nel documento tecnico: verificarne stato e riuso prima di creare
nuove strutture.

2 Navigazione proposta

 SEZIONE             CONTENUTO

 Home                Situazione, prossimi passi, novità e azioni richieste

 Progetti            Avanzamento, risultati, documenti e decisioni

 Da fare             Materiali, risposte e approvazioni

 Richieste           Supporto, attività, audit, report, bug e feedback

Il pulsante “Fai una richiesta” deve essere sempre facilmente raggiungibile.

3 Accesso e visibilità

Credenziali personali, recupero accesso e inviti gestiti tramite l’autenticazione esistente.

Prevedere:

  Associazione verificata utente→azienda.
  Eventuale accesso limitato a specifici progetti.
  Revoca degli accessi.
  Distinzione tra referente, collaboratore e lettore.
  Selettore azienda soltanto per utenti autorizzati a più aziende.

Non esporre note interne, margini, compensi, rischio cliente o dati di altre aziende.

  Il parametro cliente presente nell’URL non costituisce autorizzazione.

4 Home cliente

Ordine dei contenuti:

1. Azioni richieste al cliente.
2. Progetti e prossimo traguardo.
3. Ultime consegne e aggiornamenti.
4. Prossimo incontro.
5. Referente e assistenza.
Quando non ci sono attività, mostrarlo chiaramente. Quando manca un aggiornamento, non presentare automaticamente il progetto
come regolare.

La home deve adattarsi al momento della relazione:

  Avvio: materiali, accessi, kickoff.
  Lavorazione: progressi, consegne e dipendenze.
  Verifica: approvazioni e correzioni.
  Continuativo: risultati, decisioni e prossime iniziative.

5 Scheda progetto

Contenuti comuni:

  Obiettivo.
  Perimetro condiviso.
  Referente.
  Aggiornamenti.
  Prossimi passi.
  Attività cliente.
  Deliverable, documenti e decisioni.

Growth: KPI, esperimenti, risultati del periodo e prossime azioni.

Digital: milestone, funzionalità, verifiche, dipendenze e rilascio.

  Preferire avanzamenti comprensibili. Una percentuale ricavata dal numero delle task interne non rappresenta necessariamente il
  progresso del progetto.

Mostrare date previste e confermate con etichette distinguibili.

6 Attività del cliente

Ogni attività deve spiegare:

  Cosa fare.
  Perché serve.
  Entro quando.
  A chi rivolgersi.

Azioni principali: Allega, Rispondi, Rivedi e approva.

Il caricamento di un materiale può portare l’attività in verifica al team, senza dichiarare automaticamente che il contenuto sia
corretto.

Il cliente non modifica owner interni, perimetro, priorità operative o scadenze di progetto, salvo autorizzazioni specifiche.

7 Approvazioni

Ogni approvazione riguarda una versione precisa del deliverable.

Registrare:

  File/versione.
  Utente.
  Data.
  Esito.
  Commento, quando necessario.

Azioni: Approva oppure Richiedi modifiche.

  Una nuova versione non eredita automaticamente l’approvazione precedente. Visualizzazione e download non equivalgono ad
  accettazione.

8 Centro richieste

Un solo ingresso: “Di cosa hai bisogno?”
 TIPO                     INFORMAZIONI INIZIALI

 Supporto                 Domanda o problema

 Nuova attività           Risultato desiderato

 Bug                      Cosa accade, pagina e screenshot facoltativo

 Audit                    Area e obiettivo

 Report                   Periodo e domanda da chiarire

 Feedback                 Osservazione o proposta

Azienda e progetto vengono precompilati dal contesto. Richiedere dettagli aggiuntivi solo quando necessari.

Stati proposti:

                          Ricevuta → In valutazione → In lavorazione → In attesa di te → Risolta → Chiusa

Gestire anche annullamento, richiesta non accolta e riapertura con motivazione.

  Una nuova attività entra in valutazione: non diventa automaticamente lavoro approvato. Audit e report non devono essere
  presentati come sempre gratuiti o inclusi.

9 Aggiornamento automatico dal lavoro interno

 EVENTO VERIFICATO                     EFFETTO NEL PORTALE

 Milestone condivisa completata        Avanzamento aggiornato

 Consegna pubblicata                   File disponibile

 Approvazione richiesta                Attività cliente creata

 Materiale ricevuto                    Avviso al responsabile

 Risposta pubblica                     Conversazione aggiornata

 Nuova versione pubblicata             Nuova verifica, quando necessaria

I contenuti sono interni per default. La prima pubblicazione è esplicita.

Definire quali aggiornamenti di un elemento già condiviso si propagano automaticamente e quali richiedono revisione, soprattutto
per date e impegni.

10 Aggiornamento periodico assistito

Preparare una bozza usando:

  Milestone condivise concluse.
  Consegne pubblicate.
  Prossime scadenze.
  Richieste aperte al cliente.

Il referente controlla e pubblica. Struttura breve:

                                    Fatto / Prossimo passo / Serve da te / Eventuale impedimento

  L’AI può aiutare a scrivere, ma non inventa risultati, interpreta autonomamente dati mancanti o pubblica promesse.

11 Coda interna “Da gestire”

Integrare nel workspace/customer care:

  Richieste da assegnare.
  Risposte cliente da verificare.
  Consegne da pubblicare.
  Aggiornamenti da controllare.
  Approvazioni e materiali in attesa.
  Richieste riaperte.

Ogni elemento permette un’azione diretta, senza cambiare ripetutamente schermata.

Assegnazione iniziale al referente del progetto; in sua assenza, coda da assegnare.

  Note interne e risposte pubbliche devono essere separate nel dato e chiaramente distinguibili nell’interfaccia.

12 Documenti, risultati e notifiche

Documenti filtrabili per progetto e periodo, con versione e autore.

I report devono distinguere:

  Risultato.
  Interpretazione.
  Prossima azione.

Prevedere riepiloghi riunioni e registro delle decisioni condivise.

Notifiche solo per eventi utili: nuova attività, risposta, approvazione, consegna o scadenza pertinente. Evitare notifiche per modifiche
interne e promemoria duplicati.

Email e digest richiedono integrazione disponibile e preferenze configurate. Nessuna promessa di assistenza continuativa o tempo
garantito senza accordi definiti.

13 Sicurezza e gestione degli errori

  Controlli server e database su azienda, progetto e azione.
  Protezione di file, ricerca, notifiche e Realtime.
  Nessuna fuga di note interne nei payload.
  Upload con limiti e gestione degli errori.
  Salvataggio del testo inserito in caso di errore.
  Prevenzione di duplicazioni su invii ripetuti.
  Cronologia delle azioni.
  Accessibilità da tastiera e compatibilità mobile.

Per il rilascio, testare almeno due aziende con utenti diversi e tentativi di accesso incrociato.

14 Priorità e funzioni ulteriori

  PRIMA VERSIONE
  Accesso, home, progetti, attività cliente, approvazioni, richieste e coda interna.

  INCREMENTO SUCCESSIVO
  Onboarding, aggiornamenti assistiti, report, decisioni, preferenze di notifica e feedback post-risoluzione.

  DA VALUTARE SEPARATAMENTE
  Amministrazione e pagamenti, prenotazione incontri, chat in tempo reale, assistente AI, gestione autonoma utenti e firma
  contrattuale.

Non creare nuove voci di menu quando la funzione può essere integrata in un flusso esistente.

15 Contributo richiesto allo sviluppatore

Proporre soluzioni per:

  Ridurre il lavoro di pubblicazione del team.
  Migliorare il collegamento tra task e richieste.
  Rendere evidenti materiali e decisioni mancanti.
  Personalizzare la home senza complicare la configurazione.
  Evitare notifiche inutili.
  Riutilizzare customer care, documenti e autorizzazioni esistenti.

Spunti da valutare: “Dall’ultimo accesso”, checklist di onboarding precompilate, aggiornamento periodico assistito e conferma
della risoluzione.

  Ogni proposta deve indicare beneficio, complessità, rischi, dipendenze e priorità. Le idee che modificano perimetro,
  permessi o promesse al cliente devono essere concordate.

16 Criteri di accettazione

□ Richiesta semplice inviata in meno di un minuto, come obiettivo da verificare.
□ Cliente in grado di trovare subito prossima attività e ultimo aggiornamento.
□ Una sola registrazione per aggiornare il lavoro condiviso.
□ Richieste collegate alle task senza duplicazioni.
□ Approvazioni legate alla versione corretta.
□ Nessun accesso tra aziende non autorizzate.
□ Nessun contenuto interno esposto.
□ Flussi verificati su mobile, tastiera e nei due temi.
□ Controlli tecnici del repository superati.

Consegna richiesta allo sviluppatore: ricognizione dell’esistente, proposta tecnica, priorità, stima per incrementi, prototipo dei flussi
principali e piano di verifica. Le idee sono aperte al miglioramento; semplicità d’uso, integrità dei dati e separazione degli accessi restano
requisiti fondamentali.
