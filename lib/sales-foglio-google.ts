import 'server-only'
import { google } from 'googleapis'
import type { SupabaseClient } from '@supabase/supabase-js'
import { URL_FOGLIO, sincronizzaLead } from './sales-sync'
import { pianoRitorno, rif } from './sales-foglio-ritorno'
import { fasiVere, leadDelTool } from './sales-foglio-dati'

/**
 * §434 — il ritorno sul foglio, la parte che parla con Google.
 *
 * Scrive con un **account di servizio** e non col Google di una persona: il
 * giro gira di notte, e un collegamento personale scade, si revoca, se ne va
 * con chi lascia l'azienda. La chiave sta in `GOOGLE_SHEETS_SA_JSON` (il JSON
 * intero, come lo scarica Google Cloud) e il foglio va condiviso come Editor
 * con l'indirizzo `…@….iam.gserviceaccount.com` che c'è dentro.
 *
 * Il foglio si trova dallo stesso `SALES_SHEET_CSV_URL` dell'ingresso — id e
 * `gid` — così le due direzioni non possono puntare a due fogli diversi.
 *
 * Senza chiave il ritorno **non parte e lo dice**: l'ingresso continua uguale,
 * e il riepilogo scrive che il ritorno non è configurato invece di tacere.
 */

export type EsitoRitorno = { scritte: number; righe: number; nuoveColonne: string[] } | { errore: string }

/** `…/d/<ID>/export?format=csv&gid=<GID>` → id e gid */
export function foglioDaUrl(url: string): { id: string; gid: number } | null {
  const id = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1]
  if (!id) return null
  const gid = Number(url.match(/[?&#]gid=(\d+)/)?.[1] ?? 0)
  return { id, gid: Number.isFinite(gid) ? gid : 0 }
}

function credenziali(): { client_email: string; private_key: string } | null {
  const grezzo = process.env.GOOGLE_SHEETS_SA_JSON
  if (!grezzo) return null
  try {
    const j = JSON.parse(grezzo) as { client_email?: string; private_key?: string }
    return j.client_email && j.private_key ? { client_email: j.client_email, private_key: j.private_key } : null
  } catch { return null }
}

export async function scriviRitorno(admin: SupabaseClient, url = URL_FOGLIO): Promise<EsitoRitorno> {
  const cred = credenziali()
  if (!cred) return { errore: 'ritorno sul foglio non configurato (manca GOOGLE_SHEETS_SA_JSON)' }
  const dove = foglioDaUrl(url)
  if (!dove) return { errore: 'SALES_SHEET_CSV_URL non dice quale foglio: serve il link …/spreadsheets/d/<ID>/…' }

  const auth = new google.auth.JWT({ email: cred.client_email, key: cred.private_key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
  const sheets = google.sheets({ version: 'v4', auth })
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: dove.id, fields: 'sheets.properties' })
    const scheda = meta.data.sheets?.find(s => (s.properties?.sheetId ?? 0) === dove.gid)?.properties
    if (!scheda?.title) return { errore: `Nel foglio non c'è la scheda con gid ${dove.gid}` }

    const letti = await sheets.spreadsheets.values.get({
      spreadsheetId: dove.id, range: `'${scheda.title.replace(/'/g, "''")}'`, valueRenderOption: 'FORMATTED_VALUE',
    })
    const valori = ((letti.data.values ?? []) as unknown[][]).map(r => r.map(v => String(v ?? '')))
    const piano = pianoRitorno(valori, await leadDelTool(admin, await fasiVere(admin)))
    if (!piano.celle.length) return { scritte: 0, righe: piano.abbinate, nuoveColonne: [] }

    /* Un foglio nasce con 26 colonne e quello dei lead ne usa già 24: le
       colonne nuove cadrebbero fuori dalla griglia, e l'API rifiuta la
       scrittura invece di allargarla. */
    const serve = Math.max(...piano.celle.map(c => c.colonna)) + 1
    const ha = scheda.gridProperties?.columnCount ?? 0
    if (serve > ha) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: dove.id,
        requestBody: { requests: [{ appendDimension: { sheetId: dove.gid, dimension: 'COLUMNS', length: serve - ha } }] },
      })
    }

    /* RAW e non USER_ENTERED: «2026-09-22» deve restare quel testo, non
       diventare una data che il foglio poi mostra nel formato di chi lo apre. */
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: dove.id,
      requestBody: {
        valueInputOption: 'RAW',
        data: piano.celle.map(c => ({ range: rif(scheda.title!, c), values: [[c.valore]] })),
      },
    })
    return { scritte: piano.celle.length, righe: piano.abbinate, nuoveColonne: piano.nuoveColonne }
  } catch (e) {
    const codice = (e as { code?: number }).code
    if (codice === 403) return { errore: `Il foglio non è condiviso con ${cred.client_email} come Editor` }
    if (codice === 404) return { errore: 'Il foglio non si trova: controlla SALES_SHEET_CSV_URL' }
    return { errore: e instanceof Error ? e.message : 'Scrittura sul foglio fallita' }
  }
}

/**
 * §434 — il giro intero: prima entra quello che c'è di nuovo, poi torna quello
 * che sappiamo. In quest'ordine, così un lead arrivato stanotte ha già la sua
 * fase sul foglio stamattina. Il cron e il bottone chiamano questa, non le due
 * metà: se facessero due cose diverse, il giorno in cui il cron sbaglia nessuno
 * riuscirebbe a riprodurlo premendo il bottone (§372).
 *
 * Il ritorno che fallisce non fa fallire l'ingresso: i lead nuovi sono entrati,
 * e dirlo è la parte che conta. L'errore del ritorno sta accanto, in parole.
 */
export async function giroFoglio(admin: SupabaseClient) {
  const ingresso = await sincronizzaLead(admin)
  if (ingresso.errore) return { ...ingresso, ritorno: null as EsitoRitorno | null }
  return { ...ingresso, ritorno: await scriviRitorno(admin) }
}
