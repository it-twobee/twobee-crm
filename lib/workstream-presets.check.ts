/* §394 — i workstream preimpostati.
   Esegui: npx tsx lib/workstream-presets.check.ts

   L'errore di questo modulo non si vede il giorno in cui succede: propone due
   volte la stessa voce, o nasconde quella che c'è già, e il nome della corsia
   se lo inventa chi sta creando. Sei mesi dopo lo stesso lavoro si chiama in
   quattro modi e nessuno sa più quale progetto contiene cosa. */
import {
  proposte, suMisura, tipoServizio, normalizza, formaDelProgetto, trimestriMancanti,
  corsieDeiTemplate, modelliDiTipo, type CatalogRow,
} from '@/lib/workstream-presets'
import {
  workstreamPrefixFromProjectName, applyWorkstreamPrefix, stripWorkstreamPrefix,
} from '@/lib/project-naming'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(58)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

const c = (area: string, service_type: string, label: string, extra: Partial<CatalogRow> = {}): CatalogRow =>
  ({ area, service_type, service_subtype: null, label, is_active: true, ...extra })

const CATALOGO: CatalogRow[] = [
  c('growth', 'lead_generation', 'Lead Generation'),
  c('growth', 'ecommerce', 'E-commerce'),
  c('growth', 'saas', 'SaaS', { is_active: false }),
  c('marketing', 'branding', 'Branding'),
  c('marketing', 'social_media_management', 'Social Media Management'),
  c('digital', 'digital_transformation', 'Digitalizzazione — CRM', { service_subtype: 'crm' }),
]

console.log('\n— Cosa si propone, e in che ordine —')
{
  const p = proposte(CATALOGO, { area: 'growth' })
  is('prima l\'area del progetto', p.slice(0, 2).map(x => x.label), ['Lead Generation', 'E-commerce'])
  is('poi le altre', p.slice(2).map(x => x.area), ['marketing', 'marketing', 'digital'])
  is('e si dice quali vengono da fuori', p.map(x => x.altraArea), [false, false, true, true, true])
  is('le voci spente non si propongono', p.some(x => x.label === 'SaaS'), false)

  is('senza le altre aree resta la sola area',
    proposte(CATALOGO, { area: 'growth', altreAree: false }).map(x => x.label),
    ['Lead Generation', 'E-commerce'])
  is('un\'area senza catalogo non propone niente',
    proposte(CATALOGO, { area: 'altra', altreAree: false }).length, 0)
}

console.log('\n— La ricerca —')
{
  is('cerca dentro l\'etichetta, non solo in testa',
    proposte(CATALOGO, { area: 'growth', query: 'commerce' }).map(x => x.label), ['E-commerce'])
  is('ignora maiuscole e accenti',
    proposte(CATALOGO, { area: 'marketing', query: 'BRÁNDING' }).map(x => x.label), ['Branding'])
  is('e gli spazi di troppo',
    proposte(CATALOGO, { area: 'growth', query: '  lead   generation ' }).map(x => x.label), ['Lead Generation'])
}

console.log('\n— Quello che c\'è già —')
{
  /* Marcato, non tolto: una riga che sparisce dal catalogo sembra un catalogo
     che l'ha persa, e chi cerca come si chiama da noi la cerca proprio lì. */
  const p = proposte(CATALOGO, { area: 'growth', presenti: ['lead generation'] })
  is('resta in elenco', p.map(x => x.label).includes('Lead Generation'), true)
  is('ed è marcata', p.find(x => x.label === 'Lead Generation')?.presente, true)
  is('le altre no', p.find(x => x.label === 'E-commerce')?.presente, false)

  /* Lo stesso servizio venduto in due aree è una riga sola, e vince quella
     del progetto: due righe identiche costringono a indovinare. */
  const doppio = [...CATALOGO, c('marketing', 'lead_generation', 'Lead generation')]
  const q = proposte(doppio, { area: 'growth' }).filter(x => normalizza(x.label) === 'lead generation')
  is('un servizio in due aree è una riga sola', q.length, 1)
  is('e vince quella dell\'area', q[0]?.area, 'growth')
}

console.log('\n— Quando il testo scritto è un workstream nuovo —')
{
  const p = proposte(CATALOGO, { area: 'growth', query: 'Retention' })
  is('un nome che non c\'è si può creare', suMisura('Retention', p), 'Retention')
  is('il campo vuoto no', suMisura('   ', p), null)
  is('un nome a catalogo no',
    suMisura('lead generation', proposte(CATALOGO, { area: 'growth', query: 'lead generation' })), null)
  is('nemmeno scritto diverso',
    suMisura('E-COMMERCE', proposte(CATALOGO, { area: 'growth', query: 'E-COMMERCE' })), null)
  is('e nemmeno se è già una corsia del progetto',
    suMisura('Retention', p, ['retention']), null)
  is('gli spazi di troppo non fanno un nome nuovo', suMisura('  Retention  ', p), 'Retention')
}

console.log('\n— Lo slug del su misura —')
{
  is('minuscolo e con gli underscore', tipoServizio('Retention & Loyalty'), 'retention_loyalty')
  is('senza accenti', tipoServizio('Attività ricorrenti'), 'attivita_ricorrenti')
  is('senza underscore ai bordi', tipoServizio('— Setup —'), 'setup')
  /* Vuoto è una risposta: `createCatalogService` rifiuta un nome che non
     produce niente invece di scrivere una voce senza tipo. */
  is('un nome di soli segni non produce uno slug', tipoServizio('···'), '')
}

console.log('\n— Il nome che esce dalla scelta —')
{
  /* La convention si applica alla voce scelta, non dopo: chi sceglie a
     catalogo non deve premere anche «Convention». E la corsia che dà il nome
     al progetto non lo ripete — senza la regola usciva «ACME · Lead
     Generation — Lead Generation». */
  const prefix = workstreamPrefixFromProjectName('ACME · Growth · Lead Generation')
  is('il prefisso è cliente e servizio', prefix, 'ACME · Lead Generation')
  is('una voce qualsiasi si appende',
    applyWorkstreamPrefix(prefix!, 'Reporting'), 'ACME · Lead Generation — Reporting')
  is('quella che dà il nome al progetto non si ripete',
    applyWorkstreamPrefix(prefix!, 'Lead Generation'), 'ACME · Lead Generation')
  is('e non si impila applicandola due volte',
    applyWorkstreamPrefix(prefix!, applyWorkstreamPrefix(prefix!, 'Reporting')),
    'ACME · Lead Generation — Reporting')
  is('la ricerca a catalogo riparte dal nome nudo',
    stripWorkstreamPrefix(prefix!, 'ACME · Lead Generation — Reporting'), 'Reporting')
}

console.log('\n— Dove le corsie sono i periodi —')
{
  /* §396 — su un servizio a trimestri la corsia è il periodo: proporre il
     nome del servizio sarebbe proporre la cosa sbagliata. La forma si legge
     per tipo **e** sottotipo, perché la Digitalizzazione ha tre righe. */
  const cat = [
    { service_type: 'lead_generation', service_subtype: null, period_shape: 'quarter' as const },
    { service_type: 'social_media_management', service_subtype: null, period_shape: 'month' as const },
    { service_type: 'branding', service_subtype: null, period_shape: 'none' as const },
    { service_type: 'digital_transformation', service_subtype: 'crm', period_shape: 'quarter' as const },
    { service_type: 'digital_transformation', service_subtype: 'management_software', period_shape: 'none' as const },
  ]
  is('il Growth va a trimestri',
    formaDelProgetto(cat, { service_type: 'lead_generation', service_subtype: null }), 'quarter')
  is('il Social Media Management a mesi',
    formaDelProgetto(cat, { service_type: 'social_media_management', service_subtype: null }), 'month')
  is('il sottotipo sceglie la riga',
    formaDelProgetto(cat, { service_type: 'digital_transformation', service_subtype: 'management_software' }), 'none')
  is('e l\'altro sottotipo l\'altra',
    formaDelProgetto(cat, { service_type: 'digital_transformation', service_subtype: 'crm' }), 'quarter')
  /* Un servizio che il catalogo non conosce non ha periodi: inventarglieli
     vorrebbe dire proporre di aprire corsie su un progetto che non le
     aspetta. */
  is('un servizio fuori catalogo non ha periodi',
    formaDelProgetto(cat, { service_type: 'chissa', service_subtype: null }), 'none')
}

console.log('\n— Quale trimestre manca —')
{
  const q = trimestriMancanti({ oggi: '2026-09-22', forma: 'quarter', corsie: [] })
  is('il trimestre in corso, se non c\'è nessuna corsia', q.mancanti.map(p => p.chiave), ['2026-Q4'])
  is('con le date della stagione', [q.mancanti[0]?.dal, q.mancanti[0]?.al], ['2026-09-01', '2026-12-31'])

  /* §389 — le nove corsie in archivio *sono* un periodo senza saperlo: si
     guardano le date, non i nomi, o si aprirebbe Q4 accanto a «Set-Dic
     2026» e chi ci lavora non saprebbe in quale mettere le task. */
  const coperto = trimestriMancanti({
    oggi: '2026-09-22', forma: 'quarter',
    corsie: [{ id: 'w1', name: 'Set-Dic 2026', dal: '2026-09-01', al: '2026-12-31' }],
  })
  is('niente da aprire se una corsia lo copre già', coperto.mancanti.length, 0)
  is('e si dice quale', coperto.coperti[0]?.corsia, 'Set-Dic 2026')

  /* Dai mesi la risposta è **vuota**, non zero: il registro dal browser non si
     legge, e un elenco inventato sarebbe peggio di nessun elenco. */
  is('sui mesi non si pronuncia',
    trimestriMancanti({ oggi: '2026-09-22', forma: 'month', corsie: [] }).mancanti.length, 0)
  is('e nemmeno sui servizi senza periodi',
    trimestriMancanti({ oggi: '2026-09-22', forma: 'none', corsie: [] }).mancanti.length, 0)
}

console.log('\n— Le corsie che stanno dentro un servizio (§400) —')
{
  const tpl = [
    { id: 't1', service_type: 'lead_generation', service_subtype: null, is_active: true },
    { id: 't2', service_type: 'lead_generation', service_subtype: null, is_active: true },
    { id: 't3', service_type: 'lead_generation', service_subtype: null, is_active: false },
    { id: 't4', service_type: 'lead_generation', service_subtype: null, is_active: true, kind: 'period' },
    { id: 't5', service_type: 'branding', service_subtype: null, is_active: true },
  ]
  const w = (id: string, template_id: string, name: string, sort_order: number, workstream_type = 'project') =>
    ({ id, template_id, parent_id: null, node_type: 'workstream', name, sort_order, workstream_type })
  const dentro = (id: string, parent_id: string, node_type: string, name: string) =>
    ({ id, template_id: 't1', parent_id, node_type, name, sort_order: 0 })
  const nodi = [
    w('w1', 't1', 'Setup e tracciamento', 10), w('w2', 't1', 'Advertising', 20), w('w3', 't1', 'Governance', 30, 'recurring'),
    w('w4', 't2', 'Advertising', 10), w('w5', 't2', 'Governance', 20, 'recurring'),
    w('w6', 't3', 'Corsia di un template spento', 10),
    w('w7', 't4', 'Piano del trimestre', 10),
    w('w8', 't5', 'Identità visiva', 10),
    /* «Advertising» sta in due template: vuota in t1, con due tappe, tre task e
       una ricorrente in t2. Chi la spunta si aspetta quella piena. */
    dentro('m1', 'w4', 'milestone', 'Piano media'),
    dentro('m2', 'w4', 'milestone', 'Ottimizzazione'),
    dentro('k1', 'm1', 'task', 'Brief creativo'),
    dentro('k2', 'm1', 'task', 'Setup campagne'),
    dentro('k3', 'm2', 'task', 'Report settimanale'),
    dentro('r1', 'w4', 'recurring_task', 'Check budget'),
    { id: 'x1', template_id: 't1', parent_id: 'n1', node_type: 'milestone', name: 'Una tappa', sort_order: 40 },
  ]
  const servizi = [{ service_type: 'lead_generation', service_subtype: null }]
  const c = corsieDeiTemplate(tpl, nodi, servizi)

  /* Le più comuni per prime: quella che c'è in tutti i template è quella che
     serve quasi sempre. A parità resta l'ordine del template. */
  is('le più comuni per prime', c.map(x => x.nome),
    ['Advertising', 'Governance', 'Setup e tracciamento'])
  is('e si dice in quanti template stanno', c.map(x => x.quante), [2, 2, 1])
  is('il tipo della corsia viene dal template', c.find(x => x.nome === 'Governance')?.tipo, 'recurring')

  is('niente dai template di altri servizi', c.some(x => x.nome === 'Identità visiva'), false)
  is('niente dai template spenti', c.some(x => x.nome.includes('spento')), false)
  /* Lo scheletro di periodo descrive cosa nasce **dentro** un trimestre: non
     sono corsie del progetto, e proporle qui sarebbe proporre due volte la
     stessa cosa. */
  is('e niente dagli scheletri di periodo', c.some(x => x.nome === 'Piano del trimestre'), false)
  is('le tappe non sono corsie', c.some(x => x.nome === 'Una tappa'), false)

  is('un servizio senza template non propone niente',
    corsieDeiTemplate(tpl, nodi, [{ service_type: 'audit', service_subtype: null }]).length, 0)

  /* §402 — la corsia porta dentro quello che ha nel modello, e fra due
     occorrenze vince la più piena: una vuota e una con cinque righe sono lo
     stesso nome e due cose diverse. */
  const adv = c.find(x => x.nome === 'Advertising')
  is('il contenuto è quello dell\'occorrenza più ricca',
    [adv?.tappe, adv?.task, adv?.ricorrenti], [2, 3, 1])
  is('e si copia da quel nodo', adv?.nodeId, 'w4')
  is('una corsia vuota resta vuota',
    (() => { const g = c.find(x => x.nome === 'Governance'); return [g?.tappe, g?.task, g?.ricorrenti] })(), [0, 0, 0])
}

console.log('\n— Tappe, task e ricorrenti dai modelli (§405) —')
{
  const tpl = [
    { id: 't1', service_type: 'lead_generation', service_subtype: null, is_active: true },
    { id: 't2', service_type: 'lead_generation', service_subtype: null, is_active: true },
    { id: 't3', service_type: 'lead_generation', service_subtype: null, is_active: true, kind: 'period' },
    { id: 't4', service_type: 'branding', service_subtype: null, is_active: true },
  ]
  const n = (id: string, template_id: string, parent_id: string | null, node_type: string, name: string, extra: Record<string, unknown> = {}) =>
    ({ id, template_id, parent_id, node_type, name, sort_order: 0, ...extra })
  const nodi = [
    n('w1', 't1', null, 'workstream', 'Advertising'),
    n('m1', 't1', 'w1', 'milestone', 'Piano media', { relative_due_days: 14 }),
    n('k1', 't1', 'm1', 'task', 'Brief creativo', { estimated_hours: 4, priority: 'alta', suggested_owner_role: 'Media Buyer' }),
    n('k2', 't1', 'm1', 'task', 'Setup campagne'),
    n('r1', 't1', 'w1', 'recurring_task', 'Check budget', { frequency: 'weekly', suggested_owner_role: 'Media Buyer' }),
    // la stessa tappa, in un altro modello, con dentro di più: vince questa
    n('m2', 't2', 'w2', 'milestone', 'Piano media'),
    n('m3', 't2', 'w2', 'milestone', 'Report di fine periodo'),
    n('k3', 't2', 'm3', 'task', 'Report'),
    n('k4', 't2', 'm3', 'task', 'Presentazione'),
    // dallo scheletro di periodo e da un altro servizio non si prende niente
    n('m4', 't3', null, 'milestone', 'Piano del trimestre'),
    n('m5', 't4', 'w9', 'milestone', 'Identità visiva'),
  ]
  const servizi = [{ service_type: 'lead_generation', service_subtype: null }]

  const tappe = modelliDiTipo(tpl, nodi, servizi, 'milestone')
  is('le tappe del servizio, le più comuni per prime', tappe.map(t => t.nome),
    ['Piano media', 'Report di fine periodo'])
  is('con quanti task portano', tappe.map(t => t.figli), [2, 2])
  is('e l\'ancora relativa quando c\'è', tappe.find(t => t.nome === 'Piano media')?.giorni, 14)
  is('niente dagli scheletri di periodo', tappe.some(t => t.nome === 'Piano del trimestre'), false)
  is('e niente dagli altri servizi', tappe.some(t => t.nome === 'Identità visiva'), false)

  const task = modelliDiTipo(tpl, nodi, servizi, 'task')
  is('i task portano ore, priorità e ruolo',
    (() => { const t = task.find(x => x.nome === 'Brief creativo'); return [t?.ore, t?.priorita, t?.ruolo] })(),
    [4, 'alta', 'Media Buyer'])

  const ric = modelliDiTipo(tpl, nodi, servizi, 'recurring_task')
  is('le ricorrenti portano la frequenza',
    [ric.length, ric[0]?.nome, ric[0]?.frequenza], [1, 'Check budget', 'weekly'])
}

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
