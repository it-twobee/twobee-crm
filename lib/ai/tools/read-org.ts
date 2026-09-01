import { globalSearch, workspaceSearch } from '@/app/actions/global-search'
import { ROLE_LABELS } from '@/lib/permissions'
import type { AppRole } from '@/lib/types/database'
import { schema, S, capLimit, escapeLike, listInfo, type AnyTool } from './types'
import { accessFor } from './access'

export const search: AnyTool = {
  name: 'search',
  // La descrizione elenca solo ciò che il motore copre davvero: clienti, messaggi
  // di chat e documenti. Prometterle anche progetti e task porterebbe il modello a
  // cercare qui un id che qui non c'è, e a fermarsi sul risultato vuoto.
  description: 'Cerca fra clienti, messaggi e documenti. Non copre progetti e task.',
  parameters: schema({ query: S.str('Testo da cercare, almeno 2 caratteri') }, ['query']),
  mutating: false,
  risky: false,
  canUse: accessFor('search'),
  async run(args: { query: string }, c) {
    // Stesso motore della barra di ricerca: perimetro e rotte cambiano con la surface.
    const results = c.surface === 'workspace'
      ? await workspaceSearch(args.query)
      : await globalSearch(args.query)
    /* Qui NON si dichiara un totale, ed è deliberato: il motore limita ogni
       sorgente a monte (6 clienti, 8 messaggi, 6 documenti), quindi
       `results.length` non è «quanti ce ne sono» ma «quanti me ne ha dati» — un
       totale costruito su quel numero sarebbe la stessa bugia che `listInfo`
       serve a togliere, solo scritta con più sicurezza. Chi deve contare i
       clienti usa `list_clients`, che il totale ce l'ha vero. */
    return {
      risultati: results.slice(0, 20).map((r) => ({
        tipo: r.type, id: r.id, titolo: r.title, dettaglio: r.subtitle, percorso: r.href,
      })),
    }
  },
}

export const listTeam: AnyTool = {
  name: 'list_team',
  description: 'Elenca i membri del team con ruolo, per trovare l ID di una persona.',
  parameters: schema({
    nome: S.str('Filtra per nome, anche parziale'),
    limite: S.num('Massimo risultati (default 30)'),
  }),
  mutating: false,
  risky: false,
  canUse: accessFor('list_team'),
  async run(args: { nome?: string; limite?: number }, c) {
    let q = c.sb.from('profiles')
      .select('id, full_name, app_role, job_title, area', { count: 'exact' })
      .eq('is_active', true)
    if (args.nome) q = q.ilike('full_name', `%${escapeLike(args.nome)}%`)

    const { data, error, count } = await q.order('full_name').limit(capLimit(args.limite, 30, 60))
    if (error) return { error: error.message }

    const rows = (data ?? []) as { id: string; full_name: string; app_role: AppRole; job_title: string | null; area: string | null }[]
    return {
      ...listInfo(count, rows.length),
      team: rows.map((p) => ({
        id: p.id, nome: p.full_name,
        ruolo: ROLE_LABELS[p.app_role] ?? p.app_role,
        mansione: p.job_title, area: p.area,
      })),
    }
  },
}

// Ricavati da app/(dashboard) e app/(workspace)/workspace: un percorso che non
// esiste è un link rotto dentro la risposta, quindi l'elenco va tenuto allineato
// alle cartelle, non a memoria.
const DASHBOARD_PATHS = [
  '/dashboard', '/clienti', '/progetti', '/ad-hoc', '/le-mie-attivita', '/calendario',
  '/chat', '/customer-care', '/documenti', '/economics', '/feedback', '/hr', '/asana', '/impostazioni',
]
const WORKSPACE_PATHS = [
  '/workspace', '/workspace/attivita', '/workspace/progetti', '/workspace/ad-hoc',
  '/workspace/calendario', '/workspace/chat', '/workspace/clienti', '/workspace/cronologia',
  '/workspace/customer-care', '/workspace/documenti', '/workspace/documenti-personali',
  '/workspace/buste-paga', '/workspace/feedback', '/workspace/hr', '/workspace/profilo',
]

export const openPage: AnyTool = {
  name: 'open_page',
  description: 'Proponi all utente un link cliccabile verso una pagina del gestionale.',
  parameters: schema({
    percorso: S.str('Percorso interno, es. /clienti/<uuid>'),
    etichetta: S.str('Testo del bottone'),
  }, ['percorso', 'etichetta']),
  mutating: false,
  risky: false,
  canUse: accessFor('open_page'),
  async run(args: { percorso: string; etichetta: string }, c) {
    // Nessun effetto collaterale, ma il percorso va comunque validato: un link
    // fuori dominio nella risposta sarebbe un vettore di phishing gratuito.
    const path = (args.percorso ?? '').trim()
    if (!path.startsWith('/') || path.startsWith('//')) return { error: 'Percorso interno non valido' }
    const allowed = c.surface === 'workspace' ? WORKSPACE_PATHS : DASHBOARD_PATHS
    if (!allowed.some((p) => path === p || path.startsWith(p + '/'))) {
      return { error: `Percorso non disponibile in questo portale. Disponibili: ${allowed.join(', ')}` }
    }
    return { link: { percorso: path, etichetta: args.etichetta } }
  },
}

export const READ_ORG_TOOLS: AnyTool[] = [search, listTeam, openPage]
