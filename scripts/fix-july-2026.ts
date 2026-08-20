/**
 * §285/§286 — La riparazione di luglio 2026: i subappalti che mancavano.
 *
 *   npx tsx scripts/fix-july-2026.ts            # dice cosa farebbe, non scrive
 *   npx tsx scripts/fix-july-2026.ts --apply    # riapre luglio, corregge, richiude
 *
 * Luglio distribuiva ai soci **4.045,94 € a testa** invece di 2.661,12. Non per
 * una formula sbagliata: perché al mese mancavano 5.209,33 € di lavorazioni
 * affidate fuori che il piano di progetto aveva già scritte.
 *
 *   · Seven — Acconto 13,3333%   2.459,33   il piano lo mette a luglio, nessuno
 *                                           l'ha mai portato nel mese
 *   · ISF — 30% all'ordine       2.100,00   idem
 *   · Fatima — Gianni              650,00   datato agosto, ma finanzia la rata
 *                                           1/4 che matura a luglio
 *
 * Il terzo è il caso che ha fatto nascere il legame di §285: la riga di ricavo
 * di Fatima **non porta un progetto** — il contratto ne copre tre (§188) —
 * quindi l'attribuzione per progetto non può raggiungerla in nessun modo. Solo
 * la rata le mette in contatto.
 *
 * Nello stesso giro si corregge una cosa che avrebbe rifatto il danno ogni mese:
 * le tranche del subappalto Seven stanno **un mese avanti** rispetto alle rate
 * che finanziano (Rata 1 a agosto contro una rata di luglio, e così fino a
 * gennaio). Il margine digital è il rapporto fra una rata e il suo fornitore
 * nello stesso mese: sfasati, ogni mese ne esce uno gonfiato e uno depresso.
 *
 * Sola lettura senza `--apply`. Con `--apply` scrive, e ogni scrittura è
 * dichiarata prima.
 */
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync(`${process.cwd()}/.env.local`, 'utf8').split('\n')
    .map(l => l.match(/^([A-Z_0-9]+)=(.*)$/)).filter(Boolean)
    .map(m => [m![1], m![2].trim().replace(/^["']|["']$/g, '')]))

const URL = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '')
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
const APPLY = process.argv.includes('--apply')
const MESE = '2026-07-01'

async function rest<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY, Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=representation',
      ...(init?.headers ?? {}),
    },
  })
  const text = await r.text()
  if (!r.ok) throw new Error(`${path}: ${r.status} ${text}`)
  return (text ? JSON.parse(text) : null) as T
}
const get = <T>(p: string) => rest<T>(p)
const patch = (p: string, body: unknown) =>
  rest(p, { method: 'PATCH', body: JSON.stringify(body) })
const post = (p: string, body: unknown) =>
  rest(p, { method: 'POST', body: JSON.stringify(body) })

const eur = (n: number) =>
  `${Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
const first = (m: string) => `${String(m).slice(0, 7)}-01`

type Row = Record<string, unknown>
const S = (v: unknown) => (v == null ? null : String(v))
const N = (v: unknown) => Number(v ?? 0)

/**
 * Le tranche che il nome non basta ad agganciare.
 *
 * La 212 aggancia per **coda del nome** — «… — Rata 1 di 6» trova la rata che si
 * chiama così — e copre quasi tutto, perché è `splitCostLikeClient` a comporre
 * quei nomi. «Graphic Designer - Gianni» no: è stata scritta a mano, non è nata
 * da un piano di pagamento, e nessuna regola automatica può indovinare quale
 * rata finanzia. Lo dice una persona, e sta scritto qui.
 */
const A_MANO: { item: RegExp; project: RegExp; installment: string }[] = [
  { item: /^Graphic Designer/i, project: /Fatima Leo · Marketing · Branding/, installment: 'Prima rata' },
]

async function main() {
  console.log(`\n${'═'.repeat(78)}\nRIPARAZIONE LUGLIO 2026 — ${APPLY ? 'SCRITTURA' : 'SOLA LETTURA (usa --apply per scrivere)'}\n${'═'.repeat(78)}`)

  // La 212 c'è? Senza, il legame non ha dove stare e la riga di Fatima resta
  // irraggiungibile: il progetto non c'è, e non c'è nemmeno un altro modo.
  try {
    await get('pl_cost_lines?select=installment_id&limit=1')
  } catch (e) {
    if (String(e).includes('42703') || String(e).includes('installment_id')) {
      console.error('\n  ✗ Manca la colonna `installment_id`.\n'
        + '    Esegui prima `supabase/migrations/212_payout_window.sql` nel SQL Editor.\n')
      process.exit(1)
    }
    throw e
  }

  const [months, projects, streams, inst, items] = await Promise.all([
    get<Row[]>('pl_months?select=id,month,status&order=month'),
    get<Row[]>('projects?select=id,name'),
    get<Row[]>('revenue_streams?select=id,project_id'),
    get<Row[]>('revenue_installments?select=id,stream_id,due_month,label&order=due_month'),
    get<Row[]>('cost_items?select=*&project_id=not.is.null'),
  ])
  const pn = (id: unknown) => S(projects.find(p => p.id === id)?.name) ?? '—'
  const monthOf = new Map(months.map(m => [S(m.id)!, first(S(m.month)!)]))
  const luglio = months.find(m => first(S(m.month)!) === MESE)
  if (!luglio) throw new Error('Luglio 2026 non esiste fra i mesi del conto economico')

  /* Le rate di un progetto: la tranche di subappalto si aggancia a una rata
     **dello stesso progetto**, o si aggancerebbe al contratto di un altro
     lavoro che per caso ha una rata con lo stesso nome. */
  const streamProject = new Map(streams.map(s => [S(s.id)!, S(s.project_id)]))
  const rateOfProject = (projectId: string | null) =>
    inst.filter(i => streamProject.get(S(i.stream_id)!) === projectId)

  // ── 1 · il legame tranche → rata ───────────────────────────────────────────
  console.log('\n1 · IL LEGAME — quale rata finanzia ciascuna tranche')
  const daLegare: { item: Row; rata: Row; how: string }[] = []
  for (const it of items) {
    if (it.installment_id) continue
    const label = S(it.label) ?? ''
    const pid = S(it.project_id)
    const rate = rateOfProject(pid)

    const manuale = A_MANO.find(m => m.item.test(label) && m.project.test(pn(pid)))
    const perNome = rate.filter(r => r.label && label.endsWith(`— ${S(r.label)}`))
    const scelta = manuale
      ? rate.find(r => S(r.label) === manuale.installment) ?? null
      : perNome.length === 1 ? perNome[0] : null

    if (!scelta) {
      console.log(`    · ${label.slice(0, 52).padEnd(52)} ${perNome.length > 1 ? 'più rate possibili' : 'nessuna rata riconosciuta'} → resta per mese`)
      continue
    }
    daLegare.push({ item: it, rata: scelta, how: manuale ? 'a mano' : 'per nome' })
    console.log(`    ✓ ${label.slice(0, 52).padEnd(52)} → ${S(scelta.label)} (${first(S(scelta.due_month)!)}) · ${manuale ? 'a mano' : 'per nome'}`)
  }

  // ── 2 · le tranche legate cadono dove cade la rata ─────────────────────────
  console.log('\n2 · IL MESE — una tranche legata cade dove cade la sua rata')
  const rataById = new Map(inst.map(i => [S(i.id)!, i]))
  /* **Tutte** le legate, non solo quelle appena agganciate: la 212 ne ha legate
     dieci col backfill, e restano col `start_month` che avevano — le sei tranche
     Seven stanno un mese avanti rispetto alle rate. `fallsIn` sa già leggere il
     legame, ma `plannedForMonth` (che è quello che «Porta nel mese» usa) guarda
     `start_month`: finché i due non dicono la stessa cosa, aprire settembre
     rimetterebbe il costo in ottobre. */
  const tutteLegate = items
    .map(it => ({ item: it, rata: rataById.get(S(it.installment_id) ?? '') }))
    .filter((x): x is { item: Row; rata: Row } => !!x.rata)
    .concat(daLegare.map(x => ({ item: x.item, rata: x.rata })))
  const daSpostare: { item: Row; da: string | null; a: string }[] = []
  for (const { item, rata } of tutteLegate) {
    if (S(item.frequency) !== 'una_tantum') continue
    const target = first(S(rata.due_month)!)
    const cur = item.start_month ? first(S(item.start_month)!) : null
    if (cur === target) continue
    daSpostare.push({ item, da: cur, a: target })
    console.log(`    · ${S(item.label)!.slice(0, 52).padEnd(52)} ${cur ?? '—'} → ${target}`)
  }
  if (!daSpostare.length) console.log('    tutte già al posto giusto')

  // ── 3 · le occorrenze che mancano nel mese ────────────────────────────────
  const linee = await get<Row[]>('pl_cost_lines?select=*&project_id=not.is.null')
  const centers = await get<Row[]>('cost_centers?select=id,name')
  const delivery = S(centers.find(c => /delivery/i.test(S(c.name) ?? ''))?.id)

  const legameOf = new Map(daLegare.map(x => [S(x.item.id)!, S(x.rata.id)!]))
  const rataOf = (itemId: string) => legameOf.get(itemId) ?? S(items.find(i => i.id === itemId)?.installment_id)
  const meseRata = new Map(inst.map(i => [S(i.id)!, first(S(i.due_month)!)]))
  /** dove la tranche deve stare: il mese della sua rata, o quello scritto sopra */
  const meseGiusto = (it: Row) => {
    const r = rataOf(S(it.id)!)
    return r ? meseRata.get(r)! : (it.start_month ? first(S(it.start_month)!) : null)
  }

  console.log('\n3 · LE OCCORRENZE — quello che il mese non ha')
  const daCreare: Row[] = []
  const daMuovere: { line: Row; da: string; a: string }[] = []
  for (const it of items) {
    if (S(it.frequency) !== 'una_tantum' || it.is_active === false) continue
    const target = meseGiusto(it)
    if (!target) continue
    const line = linee.find(l => l.cost_item_id === it.id)
    if (line) {
      const dove = monthOf.get(S(line.month_id)!)!
      if (dove !== target) {
        if (line.paid === true) {
          console.log(`    ! ${S(it.label)!.slice(0, 46).padEnd(46)} è in ${dove}, andrebbe in ${target} — ma è PAGATA: non si muove`)
          continue
        }
        daMuovere.push({ line, da: dove, a: target })
        console.log(`    ↔ ${S(it.label)!.slice(0, 46).padEnd(46)} ${dove} → ${target}   ${eur(N(line.actual))}`)
      }
      continue
    }
    // nessuna occorrenza: se il mese è già stato preparato, manca
    const meseRow = months.find(m => first(S(m.month)!) === target)
    if (!meseRow) continue
    daCreare.push({ it, target, meseRow } as unknown as Row)
    console.log(`    + ${S(it.label)!.slice(0, 46).padEnd(46)} manca in ${target}   ${eur(N(it.amount))} · ${pn(it.project_id)}`)
  }
  if (!daCreare.length && !daMuovere.length) console.log('    niente da portare né da spostare')

  // ── 4 · il legame anche sulle righe già nel mese ───────────────────────────
  const daTaggare = linee.filter(l => !l.installment_id && l.cost_item_id
    && rataOf(S(l.cost_item_id)!))
  console.log(`\n4 · LE RIGHE GIÀ NEL MESE — ${daTaggare.length} da agganciare alla loro rata`)

  const tocca = new Set<string>([
    ...daCreare.map(x => String((x as unknown as { target: string }).target)),
    ...daMuovere.flatMap(x => [x.da, x.a]),
  ])
  const chiusiDaRiaprire = months.filter(m =>
    m.status === 'chiuso' && tocca.has(first(S(m.month)!)))
  if (chiusiDaRiaprire.length) {
    console.log(`\n   mesi chiusi da riaprire e richiudere: ${chiusiDaRiaprire.map(m => first(S(m.month)!)).join(', ')}`)
  }

  if (!APPLY) {
    console.log('\n  Sola lettura. Rilancia con --apply per scrivere.\n')
    return
  }

  // ── scrittura ─────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(78) + '\nSCRITTURA')

  for (const { item, rata } of daLegare) {
    await patch(`cost_items?id=eq.${item.id}`, { installment_id: rata.id })
  }
  console.log(`  ✓ ${daLegare.length} tranche legate alla loro rata`)

  for (const { item, a } of daSpostare) {
    await patch(`cost_items?id=eq.${item.id}`, { start_month: a, end_month: a })
  }
  console.log(`  ✓ ${daSpostare.length} tranche riportate al mese della rata`)

  for (const m of chiusiDaRiaprire) {
    await patch(`pl_months?id=eq.${m.id}`, { status: 'aperto', closed_at: null })
  }
  if (chiusiDaRiaprire.length) console.log(`  ✓ ${chiusiDaRiaprire.length} mesi riaperti`)

  for (const { line, a } of daMuovere) {
    const dest = months.find(m => first(S(m.month)!) === a)
    if (!dest) continue
    await patch(`pl_cost_lines?id=eq.${line.id}`, {
      month_id: dest.id, installment_id: rataOf(S(line.cost_item_id)!) ?? null,
    })
    console.log(`  ✓ spostata «${S(line.label)}» in ${a}`)
  }

  for (const raw of daCreare) {
    const { it, target, meseRow } = raw as unknown as { it: Row; target: string; meseRow: Row }
    const { count } = { count: linee.filter(l => l.month_id === meseRow.id).length }
    await post('pl_cost_lines', {
      month_id: meseRow.id,
      center_id: it.center_id ?? delivery,
      project_id: it.project_id,
      installment_id: rataOf(S(it.id)!) ?? null,
      cost_item_id: it.id,
      category: it.category,
      label: it.label,
      cost_type: it.cost_type,
      budget: N(it.amount),
      /* L'effettivo nasce uguale al preventivato, come «Porta nel mese»: uno
         zero non significa «non speso», significa «nessuno l'ha guardato». */
      actual: N(it.amount),
      /* **Non pagata.** Che il fornitore sia stato saldato non lo sappiamo: lo
         dice l'estratto conto, e finché non lo dice una spunta sarebbe
         un'opinione (§226). */
      paid: false,
      vat_applied: it.vat_applied,
      vat_rate: N(it.vat_rate),
      note: it.supplier,
      sort_order: (count + 1) * 10,
    })
    console.log(`  ✓ portata nel mese «${S(it.label)}» in ${target} · ${eur(N(it.amount))}`)
  }

  for (const l of daTaggare) {
    await patch(`pl_cost_lines?id=eq.${l.id}`, { installment_id: rataOf(S(l.cost_item_id)!) })
  }
  console.log(`  ✓ ${daTaggare.length} righe agganciate alla loro rata`)

  for (const m of chiusiDaRiaprire) {
    await patch(`pl_months?id=eq.${m.id}`, {
      status: 'chiuso', closed_at: new Date().toISOString(),
    })
  }
  if (chiusiDaRiaprire.length) console.log(`  ✓ ${chiusiDaRiaprire.length} mesi richiusi`)

  console.log('\n  Fatto. Controlla con:\n'
    + '    npx tsx scripts/verify-month.ts 2026-07-01\n'
    + '    npx tsx scripts/verify-payout.ts 2026-07-01\n')
}

main().catch(e => { console.error('\n✗', e instanceof Error ? e.message : e, '\n'); process.exit(1) })
