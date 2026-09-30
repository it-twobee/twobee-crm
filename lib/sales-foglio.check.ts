/* Vista Foglio del commerciale. Esegui: npx tsx lib/sales-foglio.check.ts */
import {
  COLONNE_FOGLIO, STATO_FOGLIO, VISIBILI_DI_PARTENZA, VUOTE, colonneVisibili, comeCsv, comeTsv, distinti,
  filtraColonne, interpreta, leggiData, leggiStato, leggiTsv, ripeti, stessoValore, colonnaModificabile, testoEditor, type CtxInterpreta, ordinaRighe, raggruppa, testoCella, totali, type CtxFoglio, type RigaFoglio,
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

console.log('\n— Date scritte in fretta —')
const oggi = new Date(2026, 8, 29)
is('domani', leggiData('domani', oggi), '2026-09-30')
is('+7g', leggiData('+7g', oggi), '2026-10-06')
is('+2s', leggiData('+2s', oggi), '2026-10-13')
is('12/10 → quest\'anno', leggiData('12/10', oggi), '2026-10-12')
is('12/1 → gennaio prossimo, non il passato', leggiData('12/1', oggi), '2027-01-12')
is('oggi stesso non slitta di un anno', leggiData('29/9', oggi), '2026-09-29')
is('12/10/27', leggiData('12/10/27', oggi), '2027-10-12')
is('31/2 non esiste', leggiData('31/2', oggi), null)
is('parole a caso', leggiData('boh', oggi), null)
is('ISO passa', leggiData('2026-10-12', oggi), '2026-10-12')

console.log('\n— Incolla da Sheets —')
is('due righe due colonne', leggiTsv('a\tb\nc\td'), [['a', 'b'], ['c', 'd']])
is('a capo fra virgolette non spezza', leggiTsv('"x\ny"\tb\nc\td'), [['x\ny', 'b'], ['c', 'd']])
is('riga finale vuota ignorata', leggiTsv('a\tb\n'), [['a', 'b']])
is('virgolette raddoppiate', leggiTsv('"di ""Rossi"""'), [['di "Rossi"']])

console.log('\n— Da testo a valore —')
const ci: CtxInterpreta = {
  fasi: FASI_SEME, ammesse: { priority: ['High', 'Low'] }, motivi: [{ chiave: 'prezzo', etichetta: 'Prezzo alto' }],
  persone: [{ id: 'a', nome: 'Anna' }, { id: 'b', nome: 'Bruno' }], etichettaScelta: (_c, v) => v, oggi,
}
const nl = FASI_SEME[0]
is('fase per etichetta', interpreta('stage', nl.etichetta, ci), { ok: true, valore: nl.chiave })
is('fase inesistente', interpreta('stage', 'Boh', ci).ok, false)
is('qualifica per etichetta', interpreta('qualifica', 'In target', ci), { ok: true, valore: 'in_target' })
is('priorità senza maiuscole', interpreta('priority', 'high', ci), { ok: true, valore: 'High' })
is('motivo per etichetta', interpreta('motivo_perso', 'Prezzo alto', ci), { ok: true, valore: 'prezzo' })
is('owner per nome', interpreta('owners', 'Anna, Bruno', ci), { ok: true, valore: ['a', 'b'] })
is('owner sconosciuto: errore, non un id', interpreta('owners', 'Carlo', ci).ok, false)
is('data scritta a mano', interpreta('started_on', '12/10', ci), { ok: true, valore: '2026-10-12' })
is('data illeggibile', interpreta('started_on', 'mai', ci).ok, false)
is('email storta', interpreta('contact_email', 'rossi', ci).ok, false)
is('azienda vuota non passa', interpreta('company_name', '', ci).ok, false)
is('colonna calcolata non si scrive', interpreta('giorni_contatto', '3', ci).ok, false)
is('il tentativo è del diario', colonnaModificabile('tentativi'), false)
is('l\'azienda si scrive', colonnaModificabile('company_name'), true)
is('l\'editor mostra la data all\'italiana', testoEditor('2026-10-12', 'started_on', ctx), '12/10/2026')

console.log('\n— Confronto e riempimento —')
is('vuoto = null = stringa vuota', stessoValore(null, ''), true)
is('l\'ordine dei tag non conta', stessoValore(['a', 'b'], ['b', 'a']), true)
is('un valore diverso è diverso', stessoValore('a', 'b'), false)
is('lista vuota = niente', stessoValore([], null), true)
is('il blocco si ripete in ciclo', ripeti([['x'], ['y']], 5), [['x'], ['y'], ['x'], ['y'], ['x']])

console.log(fail ? `\n${fail} controlli falliti` : '\nTutti i controlli passano')
process.exit(fail ? 1 : 0)
