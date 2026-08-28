/**
 * Unica fonte per il modello Groq di tutta l'app.
 *
 * Nasce da un incidente concreto: `llama-3.3-70b-versatile` è stato dismesso e
 * il literal era copiato in 28 route, che hanno smesso di funzionare tutte
 * insieme senza che nulla lo segnalasse. Un modello che sparisce è normale;
 * doverlo cercare in 28 file no. Da qui in avanti si cambia con la env
 * GROQ_MODEL, senza toccare il codice.
 *
 * NB: `openai/gpt-oss-120b` è un modello di reasoning — i token di ragionamento
 * pescano dallo stesso `max_tokens` della risposta. Un budget stretto (200-400)
 * può esaurirsi nel ragionamento e restituire `content` vuoto: se una route
 * torna vuota, il primo sospetto è il tetto dei token, non il prompt.
 */
export const GROQ_MODEL = process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b'
