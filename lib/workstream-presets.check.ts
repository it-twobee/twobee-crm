/* §394 — i workstream preimpostati.
   Esegui: npx tsx lib/workstream-presets.check.ts

   L'errore di questo modulo non si vede il giorno in cui succede: propone due
   volte la stessa voce, o nasconde quella che c'è già, e il nome della corsia
   se lo inventa chi sta creando. Sei mesi dopo lo stesso lavoro si chiama in
   quattro modi e nessuno sa più quale progetto contiene cosa. */
import {
  proposte, suMisura, tipoServizio, normalizza, formaDelProgetto, trimestriMancanti,
  type CatalogRow,
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

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
