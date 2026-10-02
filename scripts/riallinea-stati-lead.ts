/* §461 — il riallineamento una tantum: porta ogni lead alla fase che la sua
   storia dice, con le stesse regole del trigger (`sales_fase_attesa`).

   npx tsx scripts/riallinea-stati-lead.ts            anteprima, non scrive niente
   npx tsx scripts/riallinea-stati-lead.ts --applica  applica (senza notifiche)

   Si guarda sempre l'anteprima prima: il riallineamento può anche far
   retrocedere un lead che qualcuno aveva spostato in avanti a mano. */

import { createClient } from '@supabase/supabase-js'

;(async () => {
  const applica = process.argv.includes('--applica')
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data, error } = await admin.rpc('sales_riallinea_stati', { p_applica: applica })
  if (error) throw new Error(error.message)
  const righe = (data ?? []) as { deal_id: string; azienda: string; da: string; a: string }[]
  const rotte: Record<string, number> = {}
  for (const r of righe) rotte[`${r.da} → ${r.a}`] = (rotte[`${r.da} → ${r.a}`] ?? 0) + 1
  console.log(`${applica ? 'APPLICATI' : 'ANTEPRIMA'}: ${righe.length} lead cambierebbero fase`)
  for (const [k, n] of Object.entries(rotte).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)} · ${k}`)
  for (const r of righe) console.log(`  ${r.azienda}: ${r.da} → ${r.a}`)
  if (!applica && righe.length) console.log('\nPer applicare: --applica')
})().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
