/* §493 — Il connettore di Claude: chi entra e quali strumenti vede.
   Esegui il gate: npx tsx lib/mcp/protocollo.check.ts

   Modulo puro, come `lib/ai/tools/access.ts`: il registro degli strumenti tira
   dentro i server action e fuori da Next non si carica, quindi le regole stanno
   qui e si provano senza login. */
import { isExternalResource, isPortalAccount, INTERNAL_COARSE_ROLES } from '@/lib/permissions'
import type { StrumentoMcp } from './protocollo'

/**
 * Chi può usare il connettore: lo staff interno attivo. Gli account del
 * portale cliente (§409) e le risorse esterne restano fuori.
 *
 * Questo è il controllo che conta. La pagina di autorizzazione lo ripete per
 * dire «no» subito, ma chiunque abbia una sessione può chiedere un token a
 * Supabase senza passare da lì: è `/api/mcp` che rifiuta il token di chi non è
 * staff, a ogni richiesta.
 */
export function puoUsareIlConnettore(p: {
  role?: string | null
  app_role?: string | null
  is_active?: boolean | null
} | null | undefined): boolean {
  if (!p || p.is_active === false) return false
  if (isPortalAccount(p) || isExternalResource(p.app_role)) return false
  return (INTERNAL_COARSE_ROLES as readonly string[]).includes(p.role ?? '')
}

/**
 * Gli strumenti dell'assistente Ctrl+J che il connettore **non** offre, con il
 * motivo. Uno strumento nuovo deve stare qui o in `TITOLI`: il controllo lo
 * ferma finché qualcuno non decide.
 */
export const ESCLUSI: Record<string, string> = {
  open_page: 'apre una pagina del gestionale nel pannello Ctrl+J: dentro Claude non c\'è nessuna pagina da aprire',
  delete_task: 'eliminare resta fuori dalla prima versione (decisione del 23 ottobre 2026)',
}

/** Il nome che Claude mostra quando chiede il permesso: dice cosa fa, in italiano. */
export const TITOLI: Record<string, string> = {
  search: 'Cerca nel gestionale',
  list_team: 'Elenca il team',
  list_my_tasks: 'Le mie task',
  list_tasks: 'Elenca le task',
  get_task: 'Apri una task',
  list_projects: 'Elenca i progetti',
  get_project: 'Apri un progetto',
  list_workstreams: 'Elenca le workstream',
  list_milestones: 'Elenca le milestone',
  list_clients: 'Elenca i clienti',
  get_financials: 'Numeri economici',
  create_task: 'Crea una task',
  update_task: 'Modifica una task',
  complete_task: 'Completa una task',
  assign_task: 'Assegna una task',
  create_milestone: 'Crea una milestone',
  create_project: 'Crea un progetto',
  create_workstream: 'Crea una workstream',
}

type StrumentoAssistente = { name: string; description: string; parameters: Record<string, unknown>; mutating: boolean }

/**
 * Gli strumenti dell'assistente, nella forma di MCP. Il catalogo arriva già
 * filtrato per ruolo (`toolsFor`): qui si tolgono gli esclusi e si dichiara
 * chi modifica, perché Claude chieda il permesso prima di quelli.
 */
export function strumentiMcp(tools: StrumentoAssistente[]): StrumentoMcp[] {
  return tools
    .filter(t => !(t.name in ESCLUSI) && t.name in TITOLI)
    .map(t => ({
      name: t.name,
      title: TITOLI[t.name],
      description: t.description,
      inputSchema: t.parameters,
      annotations: {
        title: TITOLI[t.name],
        readOnlyHint: !t.mutating,
        destructiveHint: false,
        openWorldHint: false,
      },
    }))
}

export const ISTRUZIONI = [
  'Gestionale interno di TwoBee, società di consulenza digitale: clienti, progetti, workstream, milestone e task.',
  'Ogni strumento lavora con i permessi della persona collegata: quello che non vede nel gestionale non lo vede nemmeno qui.',
  'Le task stanno dentro una milestone, le milestone dentro una workstream, le workstream dentro un progetto.',
  'Quando un elenco dice "troncato", il totale è quello dichiarato, non il numero di righe ricevute.',
].join(' ')
