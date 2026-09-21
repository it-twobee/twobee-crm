/**
 * §389 — cosa farebbe il generatore, senza fare niente.
 *
 *   npx tsx scripts/prova-periodi.ts
 *
 * Legge i progetti veri e stampa le decisioni. Sola lettura: serve a
 * guardarle **prima** di accendere il giro, perché l'errore di un
 * generatore di periodi si vede su venti progetti insieme.
 */
import { readFileSync } from 'fs'
import { decidi, riassumi, type CorsiaEsistente } from '@/lib/generatore-periodi'
import type { Forma } from '@/lib/periodi'

const env = Object.fromEntries(
  readFileSync(`${process.cwd()}/.env.local`, 'utf8').split('\n')
    .map(l => l.match(/^([A-Z_0-9]+)=(.*)$/)).filter(Boolean)
    .map(m => [m![1], m![2].trim().replace(/^["']|["']$/g, '')]))
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
const g = async (p: string): Promise<Record<string, unknown>[]> => {
  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${p}`, { headers: H })
  if (!r.ok) throw new Error(`${p}: ${await r.text()}`)
  return r.json() as Promise<Record<string, unknown>[]>
}

async function main() {
  const oggi = (process.argv[2] ?? new Date().toISOString().slice(0, 10))
  const [pr, cl, cat, ws, pp] = await Promise.all([
    g('projects?select=id,name,client_id,service_type,service_subtype,status'),
    g('clients?select=id,company_name'),
    g('service_catalog?select=service_type,service_subtype,period_shape'),
    g('project_workstreams?select=id,project_id,name,start_date,end_date,workstream_type'),
    g('project_periods?select=project_id,period_key'),
  ])
  const nome = new Map(cl.map(c => [c.id, c.company_name]))
  /* La forma si cerca per tipo **e** sottotipo: la Digitalizzazione ha tre
     righe di catalogo e potrebbero non avere la stessa forma. */
  const forma = new Map(cat.map(c => [`${c.service_type}|${c.service_subtype ?? ''}`, c.period_shape]))

  let creerebbe = 0
  const righe: string[] = []
  for (const p of pr) {
    if (p.status !== 'active') continue
    const f = (forma.get(`${p.service_type}|${p.service_subtype ?? ''}`)
      ?? forma.get(`${p.service_type}|`) ?? 'none') as Forma
    if (f === 'none') continue

    const corsie: CorsiaEsistente[] = ws
      .filter(w => w.project_id === p.id && w.workstream_type === 'project')
      .map(w => ({ id: String(w.id), name: String(w.name), dal: (w.start_date as string) ?? null, al: (w.end_date as string) ?? null }))
    const chiaviAperte = pp.filter(x => x.project_id === p.id).map(x => String(x.period_key))

    const d = decidi({ oggi, forma: f, chiaviAperte, corsie })
    const crea = d.filter(x => x.fare === 'crea')
    creerebbe += crea.length

    righe.push(`\n${crea.length ? '▶' : '·'} ${nome.get(p.client_id) ?? '?'} — ${String(p.name).slice(0, 52)}   [${f}]`)
    righe.push(`     ${riassumi(d)}`)
    for (const x of d) {
      righe.push(x.fare === 'crea'
        ? `       + ${x.periodo.etichetta.padEnd(16)} ${x.periodo.dal} → ${x.periodo.al}`
        : `       · ${x.periodo.etichetta.padEnd(16)} saltato: ${x.perche}${x.corsia ? ` («${x.corsia}»)` : ''}`)
    }
  }
  console.log(righe.join('\n'))
  console.log(`\n\n══ al ${oggi}: creerebbe ${creerebbe} periodi ══`)
}
main().catch(e => { console.error(e.message); process.exit(1) })
