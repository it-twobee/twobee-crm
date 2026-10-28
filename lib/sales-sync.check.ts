import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sincronizzaLead } from './sales-sync'

const headers = 'id,created_time,full_name,phone_number,work_email,company_name,STATUS,Note,Follow up'
let csv = `${headers}\n1,2026-09-01T10:00:00Z,Ada,,,Acme,Qualificato,"Prima\nseconda",\n2,2026-09-01T10:00:00Z,Ada,,,Ignorata,,,\n3,2026-09-01T10:00:00Z,Ada,,,Nuova,,,`
const originalFetch = global.fetch
let dbCalls = 0
const existing = new Set(['1'])
const inserted: Record<string, unknown>[] = []
const db = { from: (table: string) => {
  dbCalls++
  return {
    select: () => ({ in: async () => ({ data: Array.from(table === 'deals' ? existing : new Set(['2'])).map(sheet_row_id => ({ sheet_row_id })), error: null }) }),
    insert: async (rows: Record<string, unknown>[]) => {
      for (const row of rows) { inserted.push(row); existing.add(row.sheet_row_id as string) }
      return { error: null }
    },
  }
} } as unknown as SupabaseClient

async function main() {
  global.fetch = async () => new Response(csv)
  const first = await sincronizzaLead(db, 'https://example.test/foglio.csv')
  assert.deepEqual(first, { letti: 3, nuovi: 1, giaPresenti: 1, scartati: 0, ignorati: 1,
    schede: [{ etichetta: 'Foglio', letti: 3, nuovi: 1, giaPresenti: 1, scartati: 0, ignorati: 1 }] })
  assert.equal(inserted.length, 1); assert.equal(inserted[0].sheet_row_id, '3')
  assert.equal((await sincronizzaLead(db, 'https://example.test/foglio.csv')).nuovi, 0)
  assert.equal(inserted.length, 1)
  const before = dbCalls
  csv = 'id,company_name\n4,Incompleta'
  assert.match((await sincronizzaLead(db, 'https://example.test/foglio.csv')).errore!, /Colonne mancanti/)
  csv = '<!doctype html><html>Login</html>'
  assert.match((await sincronizzaLead(db, 'https://example.test/foglio.csv')).errore!, /login/)
  assert.equal(dbCalls, before)

  /* §494 — più schede: il modulo IA ha `email` e non `work_email`, niente
     azienda, niente Note; e una scheda rotta non ferma le altre */
  const fogli: Record<string, string> = {
    'https://example.test/ia.csv': 'id,created_time,full_name,email,phone_number,form_name,STATUS\nl:9,2026-10-27T10:00:00Z,Bea,bea@example.test,p:+39333,Modulo IA,',
    'https://example.test/rotta.csv': 'id,company_name\n5,Rotta',
  }
  global.fetch = async (u: string | URL | Request) => new Response(fogli[String(u)] ?? '')
  const due = await sincronizzaLead(db, 'Modulo 2 - IA|https://example.test/ia.csv; Rotta|https://example.test/rotta.csv')
  assert.equal(due.errore, undefined, 'una scheda rotta non fa fallire il giro')
  assert.equal(due.nuovi, 1)
  assert.equal(due.schede.length, 2)
  assert.match(due.schede[1].errore!, /Colonne mancanti/)
  const ia = inserted[inserted.length - 1]
  assert.equal(ia.sheet_row_id, '9')
  assert.equal(ia.contact_email, 'bea@example.test')
  assert.equal(ia.company_name, 'Bea')
  assert.equal(ia.contact_name, 'Bea', 'la persona resta referente anche quando fa da azienda')
  assert.equal((ia.lead_origine as Record<string, string>).scheda, 'Modulo 2 - IA')
  const tutteRotte = await sincronizzaLead(db, 'A|https://example.test/rotta.csv; B|https://example.test/nessuna.csv')
  assert.match(tutteRotte.errore!, /^A: .*· B: /, 'se non passa nessuna scheda, il giro lo dice con il nome di ognuna')
  assert.match((await sincronizzaLead(db, '')).errore!, /non configurata/)

  console.log('Tutti i controlli passano: nessuna sovrascrittura, eliminati esclusi, retry senza duplicati, CSV multilinea, schema verificato prima del database, più schede e una rotta che non ferma le altre.')
}
main().finally(() => { global.fetch = originalFetch }).catch(e => { console.error(e); process.exitCode = 1 })
