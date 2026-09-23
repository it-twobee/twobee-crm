import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'

// Database effimero senza rete e senza credenziali del prodotto.
const name = `twobee-portal-check-${randomUUID().slice(0, 8)}`
try {
  execFileSync('docker', ['run', '--rm', '-d', '--network', 'none', '--name', name, '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:16-alpine'], { stdio: 'pipe' })
  let ready = false
  for (let i = 0; i < 30; i++) {
    try { execFileSync('docker', ['exec', name, 'pg_isready', '-U', 'postgres'], { stdio: 'pipe' }); ready = true; break }
    catch { await new Promise(resolve => setTimeout(resolve, 500)) }
  }
  if (!ready) throw new Error('PostgreSQL isolato non disponibile')
  const sql = path => {
    try {
      execFileSync('docker', ['exec', '-i', name, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
        input: readFileSync(path), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 4 * 1024 * 1024,
      })
      console.log(`OK ${path}`)
    } catch (error) { console.error(error.stderr?.toString()); throw error }
  }
  sql('scripts/fixtures/portal-base.sql')
  sql('scripts/fixtures/storage-base.sql')
  // La 249 collega le consegne ai file veri: senza lo storage non si prova niente.
  sql('supabase/migrations/108_files_storage.sql')
  sql('supabase/migrations/109_storage_folders_shares.sql')
  for (let i = 0; i < 2; i++) {
    sql('supabase/migrations/244_client_portal.sql')
    sql('supabase/migrations/245_portal_access_management.sql')
    sql('supabase/migrations/246_storage_isolation.sql')
    sql('supabase/migrations/249_portal_publishing.sql')
    sql('supabase/migrations/250_portal_materials.sql')
    sql('supabase/migrations/251_area_cliente.sql')
  }
  sql('supabase/tests/244_client_portal.check.sql')
  sql('supabase/tests/245_portal_access_management.check.sql')
  sql('supabase/tests/249_portal_publishing.check.sql')
  sql('supabase/tests/250_portal_materials.check.sql')
  sql('supabase/tests/251_area_cliente.check.sql')
  // La 254 cambia una regola della 251 (nome e percorso si possono cambiare):
  // si applica dopo le prove della 251, che raccontano la regola di allora.
  for (let i = 0; i < 2; i++) sql('supabase/migrations/254_area_file_cartelle.sql')
  sql('supabase/tests/254_area_file_cartelle.check.sql')
  // La 256 riscrive la guardia della 254 (l'autore che si slega), e in
  // produzione c'è la sua: le prove della 254 devono reggere anche sopra.
  for (let i = 0; i < 2; i++) {
    sql('supabase/migrations/256_autore_ignoto.sql')
    sql('supabase/migrations/257_cancellare_una_persona.sql')
    sql('supabase/migrations/259_cartelle_senza_autore.sql')
  }
  sql('supabase/tests/254_area_file_cartelle.check.sql')
  sql('supabase/tests/259_cartelle_senza_autore.check.sql')
  console.log('Tutti i controlli passano: migration rilanciabili e isolamento SQL su PostgreSQL effimero.')
} finally {
  execFileSync('docker', ['rm', '-f', name], { stdio: 'pipe' })
}
