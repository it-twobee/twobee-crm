/**
 * Unica fonte per il modello Groq di tutta l'app.
 *
 * Nasce da un incidente concreto: `llama-3.3-70b-versatile` è stato dismesso e
 * il literal era copiato in cinque route, che hanno smesso di funzionare tutte
 * insieme senza che nulla lo segnalasse. Un modello che sparisce è normale;
 * doverlo cercare in cinque file no. Si cambia con la env `GROQ_MODEL`, senza
 * toccare il codice — ed è esattamente così che si è passati a Qwen.
 *
 * **Il default si sceglie guardando i limiti, non solo la qualità.** Prima è stato
 * messo `qwen/qwen3.8-27b`, che nei test si comportava meglio di tutti — tre tool
 * call in un turno, nessun token di ragionamento, tipi sempre corretti. In
 * produzione è durato tre domande: su questo account ha **8.000 token al minuto**,
 * e un turno dell'assistente ne consuma da 3.700 a 9.900, quindi un turno solo
 * bruciava il minuto intero e il secondo prendeva 429. Gli altri modelli ne hanno
 * **250.000**: trentun volte tanto.
 *
 * `qwen/qwen3.6-27b` è la scelta: stesso limite alto, e passa le stesse prove —
 * loop multi-giro, azione che modifica i dati, risposta senza strumenti, nessuna
 * tabella. Due cose da sapere:
 * - **È un modello di reasoning** (1.200 token di ragionamento su una domanda
 *   semplice), quindi i tetti larghi servono: un `max_tokens` stretto non
 *   accorcia la risposta, la **svuota**.
 * - Fa un giro per strumento, non tre come il 3.8: `MAX_ROUNDS` resta 6.
 *
 * Se serve tornare indietro è una env: `openai/gpt-oss-120b` ha lo stesso limite
 * alto ed è provato. Su `qwen/qwen3.8-27b` non si torna senza alzare il piano.
 */
export const GROQ_MODEL = process.env.GROQ_MODEL ?? 'qwen/qwen3.6-27b'
