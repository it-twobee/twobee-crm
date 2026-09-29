/* Vista Foglio del commerciale. Esegui: npx tsx lib/sales-foglio.check.ts */
import {
  COLONNE_FOGLIO, STATO_FOGLIO, VISIBILI_DI_PARTENZA, VUOTE, colonneVisibili, comeCsv, comeTsv, distinti,
  filtraColonne, leggiStato, ordinaRighe, raggruppa, testoCella, totali, type CtxFoglio, type RigaFoglio,
} from '@/lib/sales-foglio'
import { FASI_SEME, etichettaFase } from '@/lib/sales-stages'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(58)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

const adessoMs = Date.parse('2026-09-29T10:00:00Z')
const ctx: CtxFoglio = { etichettaFase: k => etichettaFase(FASI_SEME, k), nomeDi: id => ({ a: 'Anna', b: 'Bruno' } as Record<string, string>)[id] ?? '?', adessoMs }
const r = (id: string, x: Record<string, unknown>): RigaFoglio => ({ id, ...x })
const righe = [
  r('1', { company_name: 'Zeta', stage: 'nuovo_lead', tentativi: 2, owners: ['a'], last_interaction_at: '2026-09-27T10:00:00Z' }),
  r('2', { company_name: 'Alfa', stage: 'perso', tentativi: 0, owners: [] }),
  r('3', { company_name: 'Beta', stage: 'nuovo_lead', tentativi: 5, owners: ['a', 'b'], lead_origine: { piattaforma: 'Facebook' } }),
]

console.log('\n— Le colonne —')
is('chiavi uniche', new Set(COLONNE_FOGLIO.map(c => c.chiave)).size, COLONNE_FOGLIO.length)
is('le visibili di partenza esistono tutte', VISIBILI_DI_PARTENZA.every(k => COLONNE_FOGLIO.some(c => c.chiave === k)), true)

console.log('\n— Un testo per cella —')
is('fase in parole', testoCella(righe[0], 'stage', ctx), etichettaFase(FASI_SEME, 'nuovo_lead'))
is('owner in nomi', testoCella(righe[2], 'owners', ctx), 'Anna, Bruno')
is('giorni dal contatto', testoCella(righe[0], 'giorni_contatto', ctx), '2')
is('mai sentito: vuoto, non zero', testoCella(righe[2], 'giorni_contatto', ctx), '')
is('piattaforma dall\'origine', testoCella(righe[2], 'piattaforma', ctx), 'Facebook')

console.log('\n— Ordine, filtro, gruppi —')
is('numeri come numeri', ordinaRighe(righe, { chiave: 'tentativi', dir: 'desc' }, ctx).map(x => x.id), ['3', '1', '2'])
is('i vuoti restano in fondo anche al contrario',
  ordinaRighe(righe, { chiave: 'giorni_contatto', dir: 'desc' }, ctx).map(x => x.id).slice(0, 1), ['1'])
is('testo alfabetico', ordinaRighe(righe, { chiave: 'company_name', dir: 'asc' }, ctx).map(x => x.id), ['2', '3', '1'])
is('filtro su un owner di due', filtraColonne(righe, { owners: ['Bruno'] }, ctx).map(x => x.id), ['3'])
is('filtro sulle vuote', filtraColonne(righe, { owners: [VUOTE] }, ctx).map(x => x.id), ['2'])
is('distinti contano per owner', distinti(righe, 'owners', ctx), [{ valore: 'Anna', quante: 2 }, { valore: 'Bruno', quante: 1 }, { valore: VUOTE, quante: 1 }])
const g = raggruppa(FASI_SEME, righe, 'owner', ctx)
is('i persi in fondo, anche raggruppando', g[g.length - 1].persi, true)
is('una riga con due owner sta in due gruppi', g.filter(s => !s.persi).map(s => s.righe.length), [2, 1])
is('senza gruppo: vive + persi', raggruppa(FASI_SEME, righe, 'nessuno', ctx).map(s => s.righe.length), [2, 1])

console.log('\n— Stato salvato —')
is('stato vuoto = default', leggiStato(null).visibili, STATO_FOGLIO.visibili)
is('chiavi sparite scartate', leggiStato({ visibili: ['company_name', 'boh'] }).visibili, ['company_name'])
is('colonne nuove entrano nell\'ordine', leggiStato({ ordine: ['stage'] }).ordine.length, COLONNE_FOGLIO.length)
is('larghezze assurde scartate', leggiStato({ larghezze: { stage: 5, notes: 300 } }).larghezze, { notes: 300 })

console.log('\n— Export —')
const cols = colonneVisibili({ ...STATO_FOGLIO, visibili: ['company_name', 'notes'] })
is('TSV: a capo nelle note non spezza la riga', comeTsv([r('9', { company_name: 'X', notes: 'a\nb\tc' })], cols, ctx).split('\n').length, 2)
is('CSV: le virgolette si raddoppiano', comeCsv([r('9', { company_name: 'X "Y"; Z' })], cols, ctx).includes('"X ""Y""; Z"'), true)
is('totali', totali(righe, ctx), { righe: 3, tentativi: 7 })

console.log(fail ? `\n${fail} controlli falliti` : '\nTutti i controlli passano')
process.exit(fail ? 1 : 0)
