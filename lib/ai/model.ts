/**
 * Unica fonte per il modello Groq di tutta l'app.
 *
 * Nasce da un incidente concreto: `llama-3.3-70b-versatile` è stato dismesso e
 * il literal era copiato in cinque route, che hanno smesso di funzionare tutte
 * insieme senza che nulla lo segnalasse. Un modello che sparisce è normale;
 * doverlo cercare in cinque file no. Si cambia con la env `GROQ_MODEL`, senza
 * toccare il codice — ed è esattamente così che si è passati a Qwen.
 *
 * **Il default non è una preferenza estetica.** `qwen/qwen3.8-27b` è stato messo
 * al posto di `openai/gpt-oss-120b` dopo averli provati sullo stesso carico:
 * - Qwen emette **più tool call nello stesso turno** (tre, in una domanda
 *   composta), dove gpt-oss ne fa una sola e ha bisogno di un giro in più.
 * - Qwen **non è un modello di reasoning**: `reasoning_tokens` è assente, quindi
 *   un `max_tokens` stretto accorcia la risposta invece di **svuotarla**. Con
 *   gpt-oss un budget da 200-400 token poteva restituire `content` vuoto, ed è
 *   la ragione per cui i tetti delle route sono stati alzati a 1500.
 * - Sull'azione che modifica i dati Qwen chiama lo strumento; gpt-oss a volte
 *   chiedeva conferma a parole, scavalcando la card di conferma dell'app.
 *
 * Il prezzo di Qwen è il **rate limit**: il 429 arriva più facilmente, per
 * questo `provider.ts` riprova una volta rispettando `Retry-After`.
 */
export const GROQ_MODEL = process.env.GROQ_MODEL ?? 'qwen/qwen3.8-27b'
