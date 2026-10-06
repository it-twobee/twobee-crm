/* §467 — Social: le regole pure. Esegui: npx tsx lib/social.check.ts */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  CANALI_ELENCO, FORMATI_ELENCO, STATI_ELENCO, dirittiSocial, parseContenuto, validaLinkPost, puoPassareA,
  avvisi, meseDopo, intervalloMese, intervalloGriglia, etichettaMese, dataBreve, ordinaContenuti, riepilogo,
  settimanaScoperta, progettiMiei, soloMieiDiPartenza, suggerisciMilestone, rejectSocialMedia, socialMediaKind,
  normalizzaCanali, isGiorno, isOra, isSocialProject, inRitardo,
} from '@/lib/social'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(64)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

const U = '11111111-1111-4111-8111-111111111111'
const V = '22222222-2222-4222-8222-222222222222'

console.log('\n— Un vocabolario solo: lib e migration dicono la stessa cosa —')
{
  const dir = join(process.cwd(), 'supabase', 'migrations')
  const file = readdirSync(dir).find(f => /^(\d+|XXX)_social\.sql$/.test(f))
  is('la migration del social esiste', !!file, true)
  const sql = file ? readFileSync(join(dir, file), 'utf8') : ''
  const elenco = (re: RegExp) => (sql.match(re)?.[1] ?? '').split(',').map(s => s.trim().replace(/'/g, '')).filter(Boolean)
  is('canali', elenco(/channels <@ ARRAY\[([^\]]+)\]/), CANALI_ELENCO)
  is('formati', elenco(/social_contents_format CHECK \(format IN \(([^)]+)\)\)/), FORMATI_ELENCO)
  is('stati', elenco(/social_contents_status CHECK \(status IN \(([^)]+)\)\)/), STATI_ELENCO)
}

console.log('\n— Chi può fare cosa (§322) —')
is('chi governa crea, modifica, elimina', dirittiSocial({ governa: true, userId: U }), { crea: true, modifica: true, elimina: true })
is('il responsabile modifica e basta', dirittiSocial({ governa: false, userId: U, contenuto: { owner_id: U, created_by: V } }),
  { crea: false, modifica: true, elimina: false })
is('chi l’ha creato lo modifica', dirittiSocial({ governa: false, userId: U, contenuto: { owner_id: null, created_by: U } }).modifica, true)
is('gli altri guardano', dirittiSocial({ governa: false, userId: U, contenuto: { owner_id: V, created_by: V } }),
  { crea: false, modifica: false, elimina: false })

console.log('\n— Il contenuto che arriva dal browser —')
const base = { title: '  Reel dietro le quinte ', planned_date: '2026-11-12', planned_time: '18:30', channels: ['tiktok', 'instagram', 'instagram'], format: 'reel', caption: 'Testo  \n' }
const ok = parseContenuto(base)
is('si ripulisce', ok.ok && ok.value, {
  planned_date: '2026-11-12', planned_time: '18:30', channels: ['instagram', 'tiktok'], format: 'reel',
  title: 'Reel dietro le quinte', caption: 'Testo', owner_id: null, milestone_id: null,
})
is('senza tema no', parseContenuto({ ...base, title: ' ' }).ok, false)
is('il 31 novembre non esiste', parseContenuto({ ...base, planned_date: '2026-11-31' }).ok, false)
is('l’ora vuota è nessuna ora', parseContenuto({ ...base, planned_time: '' }).ok && (parseContenuto({ ...base, planned_time: '' }) as { value: { planned_time: null } }).value.planned_time, null)
is('25:00 non è un’ora', parseContenuto({ ...base, planned_time: '25:00' }).ok, false)
is('un canale inventato no', parseContenuto({ ...base, channels: ['instagram', 'myspace'] }).ok, false)
is('senza canali no', parseContenuto({ ...base, channels: [] }).ok, false)
is('un formato inventato no', parseContenuto({ ...base, format: 'meme' }).ok, false)
is('un responsabile che non è un id no', parseContenuto({ ...base, owner_id: 'Annalisa' }).ok, false)
is('normalizza nell’ordine dell’elenco', normalizzaCanali(['x', 'facebook']), ['facebook', 'x'])
is('giorno valido', [isGiorno('2028-02-29'), isGiorno('2026-02-29'), isGiorno('2026-1-1')], [true, false, false])
is('ora valida', [isOra('00:00'), isOra('23:59'), isOra('9:00')], [true, true, false])

console.log('\n— Il link di un post —')
is('instagram va', validaLinkPost('instagram', 'https://www.instagram.com/p/abc/'), null)
is('linkedin accorciato va', validaLinkPost('linkedin', 'https://lnkd.in/xyz'), null)
is('http no', validaLinkPost('instagram', 'http://instagram.com/p/abc') !== null, true)
is('javascript: no', validaLinkPost('instagram', 'javascript:alert(1)') !== null, true)
is('un altro sito no', validaLinkPost('instagram', 'https://instagram.com.evil.it/p') !== null, true)
is('un sottodominio finto no', validaLinkPost('tiktok', 'https://nottiktok.com/v') !== null, true)
is('vuoto no', validaLinkPost('facebook', ' ') !== null, true)

console.log('\n— Gli stati —')
is('pubblicato senza link no', puoPassareA({ format: 'post', channels: ['instagram', 'facebook'], links: ['instagram'] }, 'pubblicato'),
  'Per segnarlo pubblicato serve il link del post su Facebook.')
is('pubblicato con i link sì', puoPassareA({ format: 'post', channels: ['instagram'], links: ['instagram'] }, 'pubblicato'), null)
is('la story non ha link', puoPassareA({ format: 'story', channels: ['instagram'], links: [] }, 'pubblicato'), null)
is('annullare si può sempre', puoPassareA({ format: 'post', channels: ['instagram'], links: [] }, 'annullato'), null)
is('in ritardo', [inRitardo({ planned_date: '2026-10-01', status: 'pronto' }, '2026-10-06'),
  inRitardo({ planned_date: '2026-10-01', status: 'pubblicato' }, '2026-10-06'),
  inRitardo({ planned_date: '2026-10-06', status: 'bozza' }, '2026-10-06')], [true, false, false])

console.log('\n— Avvisi, che non bloccano —')
is('troppo lungo per X', avvisi({ channels: ['x'], format: 'post', caption: 'a'.repeat(300) }, []), ['La didascalia supera i 280 caratteri di X.'])
is('carosello con una slide', avvisi({ channels: ['instagram'], format: 'carosello', caption: null }, [{ kind: 'immagine' }]), ['Un carosello con una sola creatività è un post.'])
is('reel senza video', avvisi({ channels: ['instagram'], format: 'reel', caption: null }, [{ kind: 'immagine' }]), ['Un reel senza video: manca la clip.'])
is('niente da dire', avvisi({ channels: ['instagram'], format: 'post', caption: 'ok' }, []), [])

console.log('\n— Mesi —')
is('dicembre → gennaio', meseDopo('2026-12'), '2027-01')
is('indietro', meseDopo('2026-01', -1), '2025-12')
is('il mese è un intervallo', intervalloMese('2026-12'), { dal: '2026-12-01', al: '2027-01-01' })
const g = intervalloGriglia('2026-11')
is('la griglia comincia di lunedì', [g.giorni.length, g.dal, g.al], [42, '2026-10-26', '2026-12-07'])
const ora = intervalloGriglia('2026-10')
is('anche col cambio d’ora (25 ottobre)', ora.giorni.includes('2026-10-25') && ora.giorni.includes('2026-10-26'), true)
is('etichetta', etichettaMese('2026-11'), 'novembre 2026')
is('data breve senza fuso', dataBreve('2026-11-12'), 'gio 12 nov')

console.log('\n— Ordine e conteggi —')
const lista = [
  { title: 'B', planned_date: '2026-11-12', planned_time: null, status: 'bozza' },
  { title: 'A', planned_date: '2026-11-12', planned_time: '09:00', status: 'pronto' },
  { title: 'C', planned_date: '2026-11-10', planned_time: '18:00', status: 'annullato' },
]
is('giorno, ora, poi chi non ha ora', ordinaContenuti(lista).map(c => c.title), ['C', 'A', 'B'])
const r = riepilogo(lista, '2026-11-12')
is('gli annullati non contano', [r.totale, r.perStato.annullato, r.inRitardo], [2, 1, 0])
is('settimana scoperta', settimanaScoperta(lista, '2026-11-13'), true)
is('settimana coperta', settimanaScoperta(lista, '2026-11-06'), false)
is('un annullato non copre', settimanaScoperta([{ planned_date: '2026-11-07', status: 'annullato' }], '2026-11-06'), true)

console.log('\n— I miei progetti —')
const progetti = [{ id: 'pm', manager_id: U }, { id: 'membro', manager_id: null }, { id: 'task', manager_id: null },
  { id: 'resp', manager_id: null }, { id: 'altro', manager_id: V }]
const miei = progettiMiei({
  userId: U, progetti,
  membri: [{ project_id: 'membro', profile_id: U }, { project_id: 'altro', profile_id: V }],
  assegnati: ['task', 'non-social'],
  responsabili: [{ project_id: 'resp', owner_id: U }, { project_id: 'altro', owner_id: V }],
})
is('manager, membro, task, responsabile', Array.from(miei).sort(), ['membro', 'pm', 'resp', 'task'])
is('un progetto che non è social non entra', miei.has('non-social'), false)
is('si parte dai miei se ce ne sono', [soloMieiDiPartenza(2), soloMieiDiPartenza(0)], [true, false])

console.log('\n— Il PED del mese —')
const ms = [
  { id: 'ott', title: 'M1 · Sviluppo & Consegna PED Ottobre 2026', due_date: '2026-09-30' },
  { id: 'nov', title: 'M2 · PED Novembre 2026', due_date: '2026-10-15' },
  { id: 'dic', title: 'Chiusura anno', due_date: '2026-12-20' },
]
is('per titolo', suggerisciMilestone(ms, '2026-11'), 'nov')
is('per scadenza', suggerisciMilestone(ms, '2026-12'), 'dic')
is('niente', suggerisciMilestone(ms, '2027-03'), null)

console.log('\n— Creatività —')
is('jpg sì', rejectSocialMedia({ name: 'a.jpg', mime: 'image/jpeg', size: 1000 }), null)
is('mov sì', socialMediaKind('video/quicktime', 'clip.mov'), 'video')
is('pdf è un documento', socialMediaKind('application/pdf', 'carosello.pdf'), 'documento')
is('psd no', rejectSocialMedia({ name: 'a.psd', mime: 'image/vnd.adobe.photoshop', size: 1000 }) !== null, true)
is('svg no', rejectSocialMedia({ name: 'logo.svg', mime: 'image/svg+xml', size: 1000 }) !== null, true)
is('docx no', rejectSocialMedia({ name: 'testo.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 1000 }) !== null, true)
is('vuoto no', rejectSocialMedia({ name: 'a.jpg', mime: 'image/jpeg', size: 0 }) !== null, true)

console.log('\n— Il progetto social —')
is('si riconosce dal servizio', [isSocialProject({ service_type: 'social_media_management' }), isSocialProject({ service_type: 'branding' }), isSocialProject(null)], [true, false, false])

console.log(fail ? `\n${fail} controlli falliti.` : '\nTutti i controlli passano.')
process.exit(fail ? 1 : 0)
