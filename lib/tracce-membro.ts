/**
 * §418 — cosa si porta dietro una persona, detto in italiano.
 *
 * `tracce_membro` (migration 234) risponde con i nomi veri delle tabelle,
 * perché li chiede allo schema e non a un elenco scritto a mano — ed è giusto
 * così: è l'unico modo perché resti aggiornato. Ma «1 in portal_events» davanti
 * a chi deve decidere se cancellare una persona non è un'informazione: è il nome
 * di un file di un altro mestiere.
 *
 * Qui la tabella diventa una frase. Quello che **non** c'è in elenco esce col
 * suo nome vero invece di una parola inventata: una traccia sconosciuta è una
 * cosa che qualcuno deve andare a guardare, e travestirla da «altri dati» è il
 * modo migliore per far cancellare qualcosa che nessuno ha capito.
 */
type Voce = { uno: string; molti: string }

const VOCI: Record<string, Voce> = {
  tasks:                { uno: 'task assegnata',            molti: 'task assegnate' },
  task_assignees:       { uno: 'assegnazione di task',      molti: 'assegnazioni di task' },
  task_comments:        { uno: 'commento a una task',       molti: 'commenti a task' },
  milestones:           { uno: 'tappa in carico',           molti: 'tappe in carico' },
  projects:             { uno: 'progetto',                  molti: 'progetti' },
  project_workstreams:  { uno: 'workstream in carico',      molti: 'workstream in carico' },
  activity_log:         { uno: 'riga di cronologia',        molti: 'righe di cronologia' },
  notifications:        { uno: 'notifica',                  molti: 'notifiche' },
  files:                { uno: 'file caricato',             molti: 'file caricati' },
  invitations:          { uno: 'invito mandato',            molti: 'inviti mandati' },
  deals:                { uno: 'opportunità commerciale',   molti: 'opportunità commerciali' },
  clients:              { uno: 'cliente in carico',         molti: 'clienti in carico' },
  chat_messages:        { uno: 'messaggio',                 molti: 'messaggi' },
  chat_dm_participants: { uno: 'conversazione diretta',     molti: 'conversazioni dirette' },
  google_credentials:   { uno: 'collegamento a Google',     molti: 'collegamenti a Google' },
  resource_profiles:    { uno: 'scheda risorsa',            molti: 'schede risorsa' },
  person_copy:          { uno: 'messaggio del giorno',      molti: 'messaggi del giorno' },
  os_sessions:          { uno: 'sessione di utilizzo',      molti: 'sessioni di utilizzo' },
  os_versions:          { uno: 'versione del tool scritta', molti: 'versioni del tool scritte' },
  portal_materials:     { uno: 'file caricato nell’area di un cliente', molti: 'file caricati nell’area dei clienti' },
  portal_events:        { uno: 'movimento nel portale cliente',  molti: 'movimenti nel portale cliente' },
  portal_memberships:   { uno: 'accesso al portale cliente',     molti: 'accessi al portale cliente' },
  portal_requests:      { uno: 'richiesta dal portale',          molti: 'richieste dal portale' },
  portal_approvals:     { uno: 'approvazione nel portale',       molti: 'approvazioni nel portale' },
}

/** «1 task assegnata» · «3 file caricati» · «2 in una_tabella_che_non_conosco». */
export function etichettaTraccia(tabella: string, righe: number): string {
  const v = VOCI[tabella]
  if (!v) return `${righe} in ${tabella}`
  return `${righe} ${righe === 1 ? v.uno : v.molti}`
}

/** Le tabelle tradotte, per il controllo: serve a vedere cosa manca. */
export const TABELLE_TRADOTTE = Object.keys(VOCI)
