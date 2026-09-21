import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'

const name = `twobee-storage-check-${randomUUID().slice(0, 8)}`
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
  sql('supabase/migrations/108_files_storage.sql')
  sql('supabase/migrations/109_storage_folders_shares.sql')
  sql('supabase/migrations/246_storage_isolation.sql')
  sql('supabase/migrations/246_storage_isolation.sql')
  sql('supabase/tests/246_storage_isolation.check.sql')
  console.log('Tutti i controlli passano: isolamento file, contesti, condivisioni e migration rilanciabile su PostgreSQL effimero.')
} finally {
  execFileSync('docker', ['rm', '-f', name], { stdio: 'pipe' })
}
