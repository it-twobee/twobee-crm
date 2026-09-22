/* §394 — i workstream preimpostati.
   Esegui: npx tsx lib/workstream-presets.check.ts

   L'errore di questo modulo non si vede il giorno in cui succede: propone due
   volte la stessa voce, o nasconde quella che c'è già, e il nome della corsia
   se lo inventa chi sta creando. Sei mesi dopo lo stesso lavoro si chiama in
   quattro modi e nessuno sa più quale progetto contiene cosa. */
import {
  proposte, suMisura, tipoServizio, normalizza, type CatalogRow,
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

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
