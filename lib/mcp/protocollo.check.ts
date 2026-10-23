/* §493 — Il connettore di Claude. Esegui: npx tsx lib/mcp/protocollo.check.ts */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { rispondi, rispondiCorpo, versioneConcordata, ERRORE, VERSIONI, type Server } from '@/lib/mcp/protocollo'
import { ESCLUSI, TITOLI, puoUsareIlConnettore, strumentiMcp } from '@/lib/mcp/accesso'
import { intestazioneNonAutorizzato, metadatiRisorsa, tokenDa, urlMetadati } from '@/lib/mcp/risorsa'
import { TOOL_ACCESS } from '@/lib/ai/tools/access'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(64)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

async function main() {
  const chiamate: string[] = []
  const s: Server = {
    nome: 'twobee-gestionale', versione: 'test', istruzioni: 'prova',
    strumenti: [{ name: 'list_tasks', description: 'Elenca', inputSchema: { type: 'object' } }],
    async esegui(nome, args) {
      chiamate.push(`${nome}:${JSON.stringify(args)}`)
      if (nome === 'boom') throw new Error('rotto')
      return nome === 'list_tasks' ? { content: [{ type: 'text', text: '{"totale":0}' }] } : null
    },
  }

  console.log('\n— Il saluto —')
  const init = await rispondi({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude' } } }, s) as { result: Record<string, unknown> }
  is('la versione del client, se la conosciamo', init.result.protocolVersion, '2025-06-18')
  is('offre strumenti', init.result.capabilities, { tools: { listChanged: false } })
  is('dice chi è', init.result.serverInfo, { name: 'twobee-gestionale', version: 'test' })
  is('con le istruzioni', init.result.instructions, 'prova')
  is('versione sconosciuta → la più recente nostra', versioneConcordata('2099-01-01'), VERSIONI[0])
  is('una notifica non ha risposta', await rispondi({ jsonrpc: '2.0', method: 'notifications/initialized' }, s), null)
  is('ping', await rispondi({ jsonrpc: '2.0', id: 'p', method: 'ping' }, s), { jsonrpc: '2.0', id: 'p', result: {} })

  console.log('\n— Gli strumenti —')
  const elenco = await rispondi({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, s) as { result: { tools: { name: string }[] } }
  is('tools/list li elenca', elenco.result.tools.map(t => t.name), ['list_tasks'])
  const chiamata = await rispondi({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'list_tasks', arguments: { stato: 'da_fare' } } }, s)
  is('tools/call esegue con gli argomenti', chiamate, ['list_tasks:{"stato":"da_fare"}'])
  is('e restituisce il contenuto', chiamata, { jsonrpc: '2.0', id: 3, result: { content: [{ type: 'text', text: '{"totale":0}' }] } })
  const ignoto = await rispondi({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'non_esiste' } }, s) as { error: { code: number } }
  is('uno strumento sconosciuto è un errore di protocollo', ignoto.error.code, ERRORE.parametri)
  const rotto = await rispondi({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'boom', arguments: {} } }, s) as { result: { isError: boolean; content: { text: string }[] } }
  is('un errore di esecuzione torna al modello, non rompe la risposta', [rotto.result.isError, rotto.result.content[0].text], [true, '{"error":"rotto"}'])
  const argomenti = await rispondi({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'list_tasks', arguments: [1] } }, s) as { error: { code: number } }
  is('argomenti che non sono un oggetto: rifiutati', argomenti.error.code, ERRORE.parametri)

  console.log('\n— Le richieste sbagliate —')
  is('metodo sconosciuto', ((await rispondi({ jsonrpc: '2.0', id: 7, method: 'resources/list' }, s)) as { error: { code: number } }).error.code, ERRORE.metodo)
  is('senza jsonrpc', ((await rispondi({ id: 8, method: 'ping' }, s)) as { error: { code: number } }).error.code, ERRORE.richiesta)
  is('non un oggetto', ((await rispondi('ciao', s)) as { error: { code: number } }).error.code, ERRORE.richiesta)
  const lotto = await rispondiCorpo([{ jsonrpc: '2.0', method: 'notifications/initialized' }, { jsonrpc: '2.0', id: 9, method: 'ping' }], s)
  is('un lotto risponde solo alle richieste', lotto, [{ jsonrpc: '2.0', id: 9, result: {} }])
  is('un lotto di sole notifiche: nessuna risposta (202)', await rispondiCorpo([{ jsonrpc: '2.0', method: 'notifications/initialized' }], s), null)

  console.log('\n— Chi entra —')
  is('admin', puoUsareIlConnettore({ role: 'admin', app_role: 'admin', is_active: true }), true)
  is('manager', puoUsareIlConnettore({ role: 'team', app_role: 'manager', is_active: true }), true)
  is('junior', puoUsareIlConnettore({ role: 'team', app_role: 'junior', is_active: true }), true)
  is('stage', puoUsareIlConnettore({ role: 'team', app_role: 'stage', is_active: true }), true)
  is('il portale cliente no (§409)', puoUsareIlConnettore({ role: 'client', app_role: 'client', is_active: true }), false)
  is('l\'invitato del portale (guest) no', puoUsareIlConnettore({ role: 'guest', app_role: 'guest', is_active: true }), false)
  is('una risorsa esterna no', puoUsareIlConnettore({ role: 'team', app_role: 'freelance', is_active: true }), false)
  is('un account disattivato no', puoUsareIlConnettore({ role: 'admin', app_role: 'admin', is_active: false }), false)
  is('senza profilo no', puoUsareIlConnettore(null), false)

  console.log('\n— Quali strumenti —')
  const tutti = Object.keys(TOOL_ACCESS)
  is('ogni strumento dell\'assistente è deciso: offerto o escluso', tutti.filter(n => !(n in TITOLI) && !(n in ESCLUSI)), [])
  is('nessuno è tutte e due le cose', tutti.filter(n => n in TITOLI && n in ESCLUSI), [])
  is('nessun titolo per uno strumento che non c\'è', Object.keys(TITOLI).filter(n => !(n in TOOL_ACCESS)), [])
  is('eliminare resta fuori', 'delete_task' in ESCLUSI, true)
  const mcp = strumentiMcp([
    { name: 'list_tasks', description: 'Elenca le task', parameters: { type: 'object' }, mutating: false },
    { name: 'create_task', description: 'Crea una task', parameters: { type: 'object' }, mutating: true },
    { name: 'delete_task', description: 'Elimina una task', parameters: { type: 'object' }, mutating: true },
  ])
  is('gli esclusi non arrivano a Claude', mcp.map(t => t.name), ['list_tasks', 'create_task'])
  is('chi legge lo dichiara, chi modifica no (Claude chiede il permesso)', mcp.map(t => t.annotations?.readOnlyHint), [true, false])
  is('il nome per il permesso è in italiano', mcp[1].title, 'Crea una task')

  console.log('\n— Dove fare il login —')
  is('il token dall\'intestazione', tokenDa('Bearer abc.def-ghi_jkl'), 'abc.def-ghi_jkl')
  is('senza Bearer niente token', tokenDa('Basic abc'), null)
  is('intestazione assente', tokenDa(null), null)
  const meta = metadatiRisorsa('https://os.twobee.it', 'https://ref.supabase.co/')
  is('la risorsa è l\'endpoint', meta.resource, 'https://os.twobee.it/api/mcp')
  is('i token li rilascia Supabase Auth', meta.authorization_servers, ['https://ref.supabase.co/auth/v1'])
  is('il 401 dice dove leggere i metadati', intestazioneNonAutorizzato('https://os.twobee.it', false),
    `Bearer resource_metadata="${urlMetadati('https://os.twobee.it')}"`)
  is('e, con un token sbagliato, che non va', intestazioneNonAutorizzato('https://os.twobee.it', true).endsWith('error="invalid_token"'), true)

  console.log('\n— L\'endpoint usa le difese che ci sono —')
  const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
  const rotta = src('app/api/mcp/route.ts')
  is('identità dal token, per ogni createClient', /conToken\(token/.test(rotta), true)
  is('staff controllato prima di eseguire', rotta.indexOf('puoUsareIlConnettore(') > 0 && rotta.indexOf('puoUsareIlConnettore(') < rotta.indexOf('rispondiCorpo(corpo'), true)
  is('catalogo filtrato per ruolo (toolsFor)', /toolsFor\(c\)/.test(rotta), true)
  is('niente service role nell\'endpoint', /createAdminClient\(|SUPABASE_SERVICE_ROLE_KEY/.test(rotta), false)
  is('la superficie la decide il ruolo, non chi chiama', /surface: base\.isAdmin \? 'dashboard' : 'workspace'/.test(rotta), true)
  const server = src('lib/supabase/server.ts')
  is('createClient legge il token della richiesta', /tokenDellaRichiesta\.getStore\(\)/.test(server), true)
  is('getUser e getClaims verificano quel token', /getUser\(jwt \?\? token\)/.test(server) && /getClaims\(jwt \?\? token/.test(server), true)
  const conf = src('next.config.mjs')
  is('i metadati stanno dove li cerca lo standard', conf.includes('/.well-known/oauth-protected-resource/:path*'), true)

  console.log(fail ? `\n${fail} controlli falliti.` : '\nTutti i controlli passano.')
  process.exit(fail ? 1 : 0)
}

main()
