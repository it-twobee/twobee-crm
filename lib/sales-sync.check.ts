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
  assert.deepEqual(first, { letti: 3, nuovi: 1, giaPresenti: 1, scartati: 0, ignorati: 1 })
  assert.equal(inserted.length, 1); assert.equal(inserted[0].sheet_row_id, '3')
  assert.equal((await sincronizzaLead(db, 'https://example.test/foglio.csv')).nuovi, 0)
  assert.equal(inserted.length, 1)
  const before = dbCalls
  csv = 'id,company_name\n4,Incompleta'
  assert.match((await sincronizzaLead(db, 'https://example.test/foglio.csv')).errore!, /Colonne mancanti/)
  csv = '<!doctype html><html>Login</html>'
  assert.match((await sincronizzaLead(db, 'https://example.test/foglio.csv')).errore!, /login/)
  assert.equal(dbCalls, before)
  console.log('Tutti i controlli passano: nessuna sovrascrittura, eliminati esclusi, retry senza duplicati, CSV multilinea e schema verificato prima del database.')
}
main().finally(() => { global.fetch = originalFetch }).catch(e => { console.error(e); process.exitCode = 1 })
