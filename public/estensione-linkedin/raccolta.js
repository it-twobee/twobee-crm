/* TwoBee · Sfida LinkedIn — la raccolta dei post del mese.
   Gira nella tua pagina «Attività → Post»: scorre finché trova un tuo post del
   mese prima, legge reazioni, commenti e impression dei post del mese (ora di
   Roma) e scarica il CSV da caricare su TwoBee OS → Sfida LinkedIn.
   Non spedisce niente a nessuno: il file lo carichi tu.

   Le funzioni pure in testa le prova `lib/linkedin.check.ts` nel repository:
   il mese di un post qui e nell'OS deve essere lo stesso. Solo `var` e
   `function` al primo livello, perché un secondo clic reinietta il file. */

var OS_SFIDA = 'https://os.twobee.it/workspace/linkedin'
var PAROLE_SFIDA = {
  impression: 'impressioni|impressione|impressions|impression',
  reazioni: 'reazioni|reazione|reactions|reaction',
  commenti: 'commenti|commento|comments|comment',
  diffusioni: 'diffusioni|diffusione|reposts|repost|condivisioni|condivisione',
}
var SEL_POST = '[data-urn*="urn:li:activity:"], [data-id*="urn:li:activity:"], [data-urn*="urn:li:ugcPost:"], [data-id*="urn:li:ugcPost:"]'
var SEL_ANALISI = 'a[href*="/analytics/"], [class*="ca-entry-point"], [class*="analytics-entry-point"]'
var COLONNE_CSV = ['post_urn', 'url', 'reazioni', 'commenti', 'diffusioni', 'impression', 'testo']

/** «1.234», «1,234», «45», «1,2K», «3 mila», «1,5 mln» → intero; niente numero → null. */
function numeroDa(testo) {
  var t = String(testo == null ? '' : testo).replace(/[  ]/g, ' ')
  var m = /(\d{1,3}(?:[.,\s]\d{3})+|\d+(?:[.,]\d+)?)\s*(mila|mln|k|m)?(?![a-zà-ü])/i.exec(t)
  if (!m) return null
  var suff = (m[2] || '').toLowerCase()
  if (!suff) return parseInt(m[1].replace(/[.,\s]/g, ''), 10)
  var mult = suff === 'k' || suff === 'mila' ? 1e3 : 1e6
  return Math.round(parseFloat(m[1].replace(/\s/g, '').replace(',', '.')) * mult)
}

/** Il primo «<numero> <parola>» fra i testi: «12 commenti», «1.234 impressions». */
function contaDa(testi, parole) {
  var re = new RegExp('(\\d[\\d.,\\s]*(?:\\s*(?:mila|mln|k|m)(?![a-zà-ü]))?)\\s*(?:' + parole + ')(?![a-zà-ü])', 'i')
  for (var i = 0; i < testi.length; i++) {
    var m = re.exec(String(testi[i] == null ? '' : testi[i]).replace(/[  ]/g, ' '))
    if (m) {
      var n = numeroDa(m[1])
      if (n !== null) return n
    }
  }
  return null
}

/** Il contatore delle reazioni senza parola: «45», o «Mario Rossi e altri 44» (= 45). */
function reazioniDa(testo) {
  var t = String(testo == null ? '' : testo).replace(/[  ]/g, ' ')
  var altri = /(?:\be altr[ie]|\band)\s+(\d[\d.,]*)/i.exec(t)
  if (altri) {
    var n = numeroDa(altri[1])
    return n === null ? null : n + 1
  }
  return numeroDa(t)
}

/** Quando è uscito il post, dall'ID: i primi 41 bit sono i millisecondi. */
function msDaUrn(urn) {
  var m = /urn:li:(?:activity|share|ugcPost):(\d{15,22})/.exec(String(urn))
  if (!m) return null
  var ms = Number(BigInt(m[1]) >> BigInt(22))
  return ms > 1420070400000 && ms < 4102444800000 ? ms : null
}

function meseRoma(ms) {
  var parti = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit' })
    .formatToParts(new Date(ms))
  var v = function (t) { var p = parti.find(function (x) { return x.type === t }); return p ? p.value : '' }
  return v('year') + '-' + v('month')
}

function csvDi(righe) {
  var cella = function (v) {
    if (v === null || v === undefined) return ''
    var s = String(v)
    if (/^[=+\-@]/.test(s)) s = "'" + s
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  var tutte = [COLONNE_CSV].concat(righe.map(function (r) { return COLONNE_CSV.map(function (k) { return r[k] }) }))
  return '﻿' + tutte.map(function (r) { return r.map(cella).join(',') }).join('\r\n') + '\r\n'
}

/* ——— da qui in giù: la pagina ——— */

function urnDi(el) {
  var v = (el.getAttribute('data-urn') || '') + ' ' + (el.getAttribute('data-id') || '')
  var m = /urn:li:(?:activity|ugcPost|share):\d{15,22}/.exec(v)
  return m ? m[0] : null
}

/** I tuoi post sono quelli con l'ingresso alle analisi: le impression le vede solo l'autore. */
function postMiei() {
  var mappa = new Map()
  document.querySelectorAll(SEL_ANALISI).forEach(function (a) {
    var host = a.closest(SEL_POST)
    var urn = host && urnDi(host)
    if (urn && !mappa.has(urn)) mappa.set(urn, host)
  })
  if (mappa.size === 0) {
    document.querySelectorAll(SEL_POST).forEach(function (host) {
      var urn = urnDi(host)
      if (urn && !mappa.has(urn) && contaDa(testiDi(host), PAROLE_SFIDA.impression) !== null) mappa.set(urn, host)
    })
  }
  return mappa
}

/** I testi del post, senza quelli di un post annidato (la condivisione di un altro). */
function testiDi(host) {
  var proprio = function (e) { return e.closest(SEL_POST) === host }
  var out = []
  host.querySelectorAll('[aria-label]').forEach(function (e) {
    if (proprio(e)) out.push(e.getAttribute('aria-label'))
  })
  host.querySelectorAll('[class*="social-details"], [class*="social-counts"], [class*="social-activity"], ' + SEL_ANALISI).forEach(function (e) {
    if (proprio(e)) out.push(e.innerText || e.textContent || '')
  })
  return out
}

function leggiPost(host, urn) {
  var testi = testiDi(host)
  var reazioni = contaDa(testi, PAROLE_SFIDA.reazioni)
  // il primo contatore del sottoalbero può essere quello del post condiviso: si cerca il proprio
  var proprio = function (sel) {
    return Array.from(host.querySelectorAll(sel)).find(function (e) { return e.closest(SEL_POST) === host }) || null
  }
  if (reazioni === null) {
    var rc = proprio('[class*="reactions-count"]')
    if (rc) reazioni = reazioniDa(rc.innerText || rc.textContent)
  }
  var corpo = proprio('[class*="update-components-text"], [class*="commentary"], [class*="feed-shared-text"]')
  var commenti = contaDa(testi, PAROLE_SFIDA.commenti)
  var diffusioni = contaDa(testi, PAROLE_SFIDA.diffusioni)
  return {
    post_urn: urn,
    url: 'https://www.linkedin.com/feed/update/' + urn + '/',
    // senza contatore LinkedIn non ha niente da dire: zero reazioni, zero commenti
    reazioni: reazioni === null ? 0 : reazioni,
    commenti: commenti === null ? 0 : commenti,
    diffusioni: diffusioni === null ? 0 : diffusioni,
    // le impression invece ci sono sempre, sui propri post: se mancano, la cella resta vuota
    impression: contaDa(testi, PAROLE_SFIDA.impression),
    testo: corpo ? (corpo.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 280) : '',
  }
}

function attesa(ms) { return new Promise(function (r) { setTimeout(r, ms) }) }

function bottoneAltri() {
  var bs = document.querySelectorAll('button')
  for (var i = 0; i < bs.length; i++) {
    var t = (bs[i].innerText || '').trim()
    if (!bs[i].disabled && /^(mostra altri risultati|visualizza altri risultati|show more results|carica altri)/i.test(t)) return bs[i]
  }
  return null
}

async function scorri(mese, stato) {
  var fermo = 0
  for (var giro = 0; giro < 80 && fermo < 4; giro++) {
    var prima = document.querySelectorAll(SEL_POST).length
    var miei = postMiei()
    stato('Scorro la tua attività… ' + miei.size + ' post tuoi caricati.')
    var passato = Array.from(miei.keys()).some(function (u) {
      var ms = msDaUrn(u)
      return ms !== null && meseRoma(ms) < mese
    })
    if (passato) return
    var b = bottoneAltri()
    if (b) b.click()
    var tutti = document.querySelectorAll(SEL_POST)
    if (tutti.length) tutti[tutti.length - 1].scrollIntoView({ block: 'end' })
    window.scrollTo(0, document.documentElement.scrollHeight)
    await attesa(1500 + Math.random() * 1500)
    fermo = document.querySelectorAll(SEL_POST).length > prima ? 0 : fermo + 1
  }
}

function scarica(testo, nome) {
  var url = URL.createObjectURL(new Blob([testo], { type: 'text/csv;charset=utf-8' }))
  var a = document.createElement('a')
  a.href = url
  a.download = nome
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(function () { URL.revokeObjectURL(url) }, 10000)
}

function pannello() {
  var vecchio = document.getElementById('twobee-sfida')
  if (vecchio) vecchio.remove()
  var host = document.createElement('div')
  host.id = 'twobee-sfida'
  host.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483647'
  var root = host.attachShadow({ mode: 'open' })
  root.innerHTML = '<style>'
    + '.box{width:340px;max-width:calc(100vw - 40px);box-sizing:border-box;background:#141414;color:#f5f5f5;border:1px solid #F5C800;border-radius:14px;padding:16px;font:15px/1.45 system-ui,sans-serif;box-shadow:0 12px 32px rgba(0,0,0,.35)}'
    + 'strong{display:block;color:#F5C800;margin-bottom:6px}'
    + '.msg{white-space:pre-line;margin:0}'
    + '.azioni{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}'
    + 'a,button{font:inherit;font-size:14px;border-radius:10px;padding:7px 12px;cursor:pointer;text-decoration:none}'
    + 'a{background:#F5C800;color:#111;font-weight:600;border:0}'
    + 'button{background:transparent;color:#f5f5f5;border:1px solid #555}'
    + 'a:focus-visible,button:focus-visible{outline:2px solid #fff;outline-offset:2px}'
    + '</style><div class="box" role="status" aria-live="polite"><strong>TwoBee · Sfida LinkedIn</strong><p class="msg"></p><div class="azioni"></div></div>'
  document.body.appendChild(host)
  var msg = root.querySelector('.msg')
  var azioni = root.querySelector('.azioni')
  return {
    stato: function (t) { msg.textContent = t },
    fine: function (t, conLink) {
      msg.textContent = t
      azioni.innerHTML = ''
      if (conLink) {
        var a = document.createElement('a')
        a.href = OS_SFIDA
        a.target = '_blank'
        a.rel = 'noopener'
        a.textContent = 'Apri TwoBee OS'
        azioni.appendChild(a)
      }
      var x = document.createElement('button')
      x.type = 'button'
      x.textContent = 'Chiudi'
      x.onclick = function () { host.remove() }
      azioni.appendChild(x)
    },
  }
}

function diagnostica() {
  return 'Diagnostica: ' + document.querySelectorAll(SEL_POST).length + ' post in pagina, '
    + document.querySelectorAll(SEL_ANALISI).length + ' ingressi alle analisi, '
    + document.querySelectorAll('[class*="reactions-count"]').length + ' contatori di reazioni.'
}

async function avviaSfida() {
  if (window.__twobeeSfida) return
  window.__twobeeSfida = true
  var ui = pannello()
  try {
    if (!/\/recent-activity\//.test(location.pathname)) {
      ui.fine('Non sono sulla tua attività. Apri il tuo profilo → Attività → Post, poi clicca di nuovo l\'icona.', false)
      return
    }
    var ora = Date.now()
    var mese = meseRoma(ora)
    var nomeMese = new Date(ora).toLocaleDateString('it-IT', { month: 'long', timeZone: 'Europe/Rome' })
    await scorri(mese, ui.stato)
    var righe = []
    postMiei().forEach(function (host, urn) {
      var ms = msDaUrn(urn)
      if (ms !== null && meseRoma(ms) === mese) righe.push(leggiPost(host, urn))
    })
    if (righe.length === 0) {
      ui.fine('Nessun tuo post di ' + nomeMese + ' trovato in questa pagina.\n'
        + 'Se ne hai pubblicati, LinkedIn potrebbe aver cambiato la pagina: manda questa riga a chi cura TwoBee OS.\n' + diagnostica(), false)
      return
    }
    var tot = righe.reduce(function (s, r) {
      return { reazioni: s.reazioni + r.reazioni, commenti: s.commenti + r.commenti, impression: s.impression + (r.impression || 0), senza: s.senza + (r.impression === null ? 1 : 0) }
    }, { reazioni: 0, commenti: 0, impression: 0, senza: 0 })
    var avvisi = []
    if (tot.senza) avvisi.push('Attenzione: impression non lette su ' + tot.senza + ' post (nel file restano vuote, non zero).')
    if (righe.length > 1 && tot.reazioni === 0 && tot.commenti === 0) avvisi.push('Attenzione: nessuna reazione né commento letti. Se non è vero, LinkedIn ha cambiato la pagina: non caricare il file. ' + diagnostica())
    var giorno = new Date(ora).toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' })
    scarica(csvDi(righe), 'linkedin-sfida-' + giorno + '.csv')
    ui.fine(righe.length + ' post di ' + nomeMese + ': '
      + tot.impression.toLocaleString('it-IT') + ' impression, '
      + tot.reazioni.toLocaleString('it-IT') + ' reazioni, '
      + tot.commenti.toLocaleString('it-IT') + ' commenti.\n'
      + 'Il CSV è nei download: caricalo su TwoBee OS → Sfida LinkedIn.'
      + (avvisi.length ? '\n\n' + avvisi.join('\n') : ''), true)
  } catch (e) {
    ui.fine('Qualcosa è andato storto: ' + (e && e.message ? e.message : e), false)
  } finally {
    window.__twobeeSfida = false
  }
}

if (typeof module === 'object' && module && module.exports) {
  module.exports = { numeroDa: numeroDa, contaDa: contaDa, reazioniDa: reazioniDa, msDaUrn: msDaUrn, meseRoma: meseRoma, csvDi: csvDi, COLONNE_CSV: COLONNE_CSV, PAROLE_SFIDA: PAROLE_SFIDA }
} else {
  avviaSfida()
}
