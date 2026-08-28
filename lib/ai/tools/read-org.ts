import { globalSearch, workspaceSearch } from '@/app/actions/global-search'
import { ROLE_LABELS } from '@/lib/permissions'
import type { AppRole } from '@/lib/types/database'
import { schema, S, capLimit, type AnyTool } from './types'

export const search: AnyTool = {
  name: 'search',
  description: 'Cerca per nome fra clienti, progetti, task e documenti. Usalo per trovare un ID.',
  parameters: schema({ query: S.str('Testo da cercare, almeno 2 caratteri') }, ['query']),
  mutating: false,
  risky: false,
  canUse: () => true,
  async run(args: { query: string }, c) {
    // Stesso motore della barra di ricerca: perimetro e rotte cambiano con la surface.
    const results = c.surface === 'workspace'
      ? await workspaceSearch(args.query)
      : await globalSearch(args.query)
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
  canUse: () => true,
  async run(args: { nome?: string; limite?: number }, c) {
    let q = c.sb.from('profiles')
      .select('id, full_name, app_role, job_title, area')
      .eq('is_active', true)
    if (args.nome) q = q.ilike('full_name', `%${args.nome.replace(/[%_\\]/g, (m) => '\\' + m)}%`)

    const { data, error } = await q.order('full_name').limit(capLimit(args.limite, 30, 60))
    if (error) return { error: error.message }

    const rows = (data ?? []) as { id: string; full_name: string; app_role: AppRole; job_title: string | null; area: string | null }[]
    return {
      team: rows.map((p) => ({
        id: p.id, nome: p.full_name,
        ruolo: ROLE_LABELS[p.app_role] ?? p.app_role,
        mansione: p.job_title, area: p.area,
      })),
    }
  },
}

const DASHBOARD_PATHS = [
  '/dashboard', '/clienti', '/progetti', '/task', '/le-mie-attivita', '/workload',
  '/calendario', '/fatturazione', '/report', '/commerciale', '/customer-care', '/documenti', '/cestino',
]
const WORKSPACE_PATHS = [
  '/workspace', '/workspace/attivita', '/workspace/progetti', '/workspace/workload',
  '/workspace/calendario', '/workspace/clienti', '/workspace/customer-care',
  '/workspace/documenti', '/workspace/feedback', '/workspace/profilo', '/workspace/cestino',
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
  canUse: () => true,
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
