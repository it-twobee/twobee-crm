/**
 * §344 — Le quattro facce della porta: chiedi, aspetti, è no, è pieno.
 *
 * HTML autonomo come il foglio che protegge (§334): nessun asset esterno,
 * stile in linea. Chi arriva qui non ha una sessione e spesso non ha mai visto
 * il tool — la pagina deve dire **cos'è**, **perché è chiusa** e **cosa
 * succede adesso**, in quest'ordine e senza gergo. Una pagina che dice solo
 * «non puoi» costringe a cercare un canale, ed è il motivo per cui questa
 * pagina esiste.
 */
import { scopeLabel } from '@/lib/report-access'

const esc = (s: string) => String(s ?? '')
  .replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]!))

export type GateKind = 'form' | 'attesa' | 'negato' | 'pieno'

export type GatePage = {
  kind: GateKind
  /** Il documento, com'è intitolato: «Compensi di agosto 2026». */
  titolo: string
  /** Dove va il modulo: l'indirizzo stesso, mese compreso. */
  action: string
  scope: string
  first?: string
  last?: string
  /** Chi sta aspettando, per la pagina d'attesa. */
  chi?: string
  error?: string | null
}

const STILE = `
  * { box-sizing: border-box; }
  :root {
    --ink: #0E0F12; --ink-2: #3A4048; --mute: #767E8A; --line: #E4E6EA;
    --gold: #F5C800; --gold-bg: #FFFAE6; --neg: #B3261E; --pos: #12764A; --warn: #A85B00;
  }
  body {
    margin: 0; background: #E8E9EB; color: var(--ink); padding: 24px 16px;
    font: 400 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  }
  .card { max-width: 560px; margin: 4vh auto; background: #fff; border-radius: 14px;
          overflow: hidden; box-shadow: 0 10px 40px rgba(14,15,18,.10); }
  .band { background: var(--ink); color: #fff; padding: 22px 26px 20px; }
  .band .wm { font-size: 10px; letter-spacing: 4px; color: var(--gold); font-weight: 700; }
  .band h1 { margin: 8px 0 0; font-size: 24px; letter-spacing: -.5px; line-height: 1.15; }
  .band p { margin: 8px 0 0; font-size: 13px; color: #A9B0BA; }
  .body { padding: 22px 26px 26px; }
  .body h2 { margin: 0 0 6px; font-size: 17px; letter-spacing: -.2px; }
  .body p { margin: 0 0 14px; font-size: 14px; color: var(--ink-2); }
  .body p.mute { color: var(--mute); font-size: 13px; margin-bottom: 0; }
  .row { display: flex; gap: 12px; flex-wrap: wrap; }
  label { display: block; flex: 1 1 200px; font-size: 12px; font-weight: 600;
          text-transform: uppercase; letter-spacing: .6px; color: var(--mute); }
  input { display: block; width: 100%; margin-top: 6px; padding: 11px 12px; font: inherit;
          color: var(--ink); background: #fff; border: 1px solid #C9CDD4; border-radius: 9px; }
  input:focus-visible { outline: 3px solid rgba(245,200,0,.55); outline-offset: 1px;
                        border-color: var(--ink); }
  button { margin-top: 18px; width: 100%; padding: 13px 16px; font: 700 15px/1 inherit;
           color: var(--ink); background: var(--gold); border: 0; border-radius: 10px;
           cursor: pointer; }
  button:hover { filter: brightness(.95); }
  button:focus-visible { outline: 3px solid var(--ink); outline-offset: 2px; }
  .req { color: var(--neg); }
  .err { margin: 0 0 16px; padding: 10px 12px; border-radius: 9px; font-size: 13.5px;
         background: #FCECEA; color: var(--neg); border-left: 3px solid var(--neg); }
  .note { border-left: 3px solid var(--line); background: #F7F8F9; padding: 12px 14px;
          border-radius: 0 9px 9px 0; font-size: 13.5px; color: var(--ink-2); }
  .note b { color: var(--ink); }
  .note.ok { border-left-color: var(--pos); }
  .note.wait { border-left-color: var(--warn); }
  .foot { margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--line);
          font-size: 12px; color: var(--mute); }
`

function corpo(p: GatePage): string {
  const mese = scopeLabel(p.scope)

  if (p.kind === 'negato') return `
    <h2>Richiesta non accolta</h2>
    <p>La richiesta di vedere i compensi di ${esc(mese)} è stata esaminata e
      non è stata approvata.</p>
    <div class="note">Se pensi sia un errore, rispondi a chi ti ha mandato il link:
      da qui non c'è altro da fare, e richiedere di nuovo non cambierebbe la risposta.</div>`

  if (p.kind === 'pieno') return `
    <h2>Riprova fra poco</h2>
    <p>Ci sono troppe richieste in attesa su questo documento e il modulo è
      momentaneamente chiuso.</p>
    <div class="note">Non è un no: ricarica la pagina più tardi, oppure scrivi a chi
      ti ha mandato il link.</div>`

  if (p.kind === 'attesa') return `
    <h2>Richiesta inviata</h2>
    <p>${p.chi ? `<b>${esc(p.chi)}</b> ha chiesto` : 'Hai chiesto'} di vedere i compensi
      di ${esc(mese)}. Un amministratore di TWO BEE deve approvarla.</p>
    <div class="note wait">Puoi lasciare aperta questa pagina: <b>si aggiorna da sola</b>
      e appena la richiesta è approvata il documento compare qui.</div>
    <p class="mute" style="margin-top:14px">Il permesso vale per questo mese soltanto
      e scade dopo qualche giorno.</p>`

  return `
    <h2>Documento riservato</h2>
    <p>I compensi di ${esc(mese)} si vedono solo con l'approvazione di un
      amministratore di TWO BEE. Scrivi nome e cognome: la richiesta gli arriva
      subito, e quando la approva il documento si apre qui.</p>
    ${p.error ? `<p class="err">${esc(p.error)}</p>` : ''}
    <form method="post" action="${esc(p.action)}">
      <input type="hidden" name="m" value="${esc(p.scope)}">
      <div class="row">
        <label for="nome">Nome <span class="req" aria-hidden="true">*</span>
          <input id="nome" name="nome" required maxlength="40" autocomplete="given-name"
            autocapitalize="words" value="${esc(p.first ?? '')}"${p.first ? '' : ' autofocus'}>
        </label>
        <label for="cognome">Cognome <span class="req" aria-hidden="true">*</span>
          <input id="cognome" name="cognome" required maxlength="40" autocomplete="family-name"
            autocapitalize="words" value="${esc(p.last ?? '')}">
        </label>
      </div>
      <button type="submit">Chiedi l'accesso</button>
    </form>
    <p class="foot">Chi approva vede il nome che scrivi qui e il documento che hai chiesto.
      Il permesso riguarda ${esc(mese)}: per un altro mese serve un'altra richiesta.</p>`
}

export function gatePageHtml(p: GatePage): string {
  const titolo = p.kind === 'form' || p.kind === 'attesa'
    ? p.titolo : 'Accesso non consentito'
  return `<!doctype html>
<html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
${p.kind === 'attesa' ? '<meta http-equiv="refresh" content="20">' : ''}
<title>TWO BEE — ${esc(titolo)}</title>
<style>${STILE}</style></head>
<body>
  <main class="card">
    <div class="band">
      <div class="wm">TWO BEE</div>
      <h1>${esc(p.titolo)}</h1>
      <p>${p.kind === 'form' ? 'Accesso su richiesta' : p.kind === 'attesa'
        ? 'In attesa di approvazione' : 'Documento riservato'}</p>
    </div>
    <div class="body">${corpo(p)}</div>
  </main>
</body></html>`
}
