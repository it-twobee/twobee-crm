/* TwoBee · Sfida LinkedIn — la raccolta dei post.
   Gira nella tua pagina «Attività → Post»: scorre finché trova un tuo post
   più vecchio dell'intervallo scelto nella finestrella, legge reazioni,
   commenti e impression dei post dell'intervallo (giorni di Roma) e scarica il
   CSV da caricare su TwoBee OS → Sfida LinkedIn. Non spedisce niente a nessuno.

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
// i nomi delle icone delle reazioni, interni (LIKE, PRAISE…) e visibili, in italiano e in inglese
var ICONE_REAZIONI = /^(like|consiglia|celebrate|praise|applaudi|applauso|support|appreciation|sostegno|sostieni|love|empathy|amore|insightful|interest|interessante|funny|entertainment|divertente|curious|maybe)\b/i
var SEL_POST = '[data-urn*="urn:li:activity:"], [data-id*="urn:li:activity:"], [data-urn*="urn:li:ugcPost:"], [data-id*="urn:li:ugcPost:"]'
var SEL_ANALISI = 'a[href*="/analytics/"], [class*="ca-entry-point"], [class*="analytics-entry-point"]'
var SEL_CORPO = '[class*="update-components-text"], [class*="commentary"], [class*="feed-shared-text"]'
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

/** «Mario e altri 44», «Claudia Amodei e 78 altre persone», «Anna and 9 others»: il nome più gli altri. */
function altriDa(testo) {
  var t = String(testo == null ? '' : testo).replace(/[  ]/g, ' ')
  var m = /\be\s+altr[ie]\s+(\d[\d.,]*)/i.exec(t) || /\be\s+(\d[\d.,]*)\s+altr[ie]\b/i.exec(t) || /\band\s+(\d[\d.,]*)\s+others?\b/i.exec(t)
  if (!m) return null
  var n = numeroDa(m[1])
  return n === null ? null : n + 1
}

/** Il contatore delle reazioni senza parola: «45», o «Mario Rossi e altri 44» (= 45). */
function reazioniDa(testo) {
  var altri = altriDa(testo)
  return altri !== null ? altri : numeroDa(testo)
}

/**
 * Le reazioni dentro un pezzo di riga: «18 · 3 commenti · 1 diffusione post»,
 * «Claudia Amodei e 78 altre persone 18 commenti». Si tolgono i numeri che
 * hanno la loro parola (commenti, diffusioni, impression): quello che resta,
 * un numero da solo o «Nome e N altre persone», sono le reazioni. «1s» e
 * «2 sett.» non sono numeri da soli.
 */
function numeroNudo(testo) {
  var tutte = [PAROLE_SFIDA.commenti, PAROLE_SFIDA.diffusioni, PAROLE_SFIDA.impression, PAROLE_SFIDA.reazioni].join('|')
  var t = String(testo == null ? '' : testo).replace(/[  ]/g, ' ')
    .replace(new RegExp('\\d[\\d.,]*\\s*(?:(?:mila|mln|k)\\s*)?(?:' + tutte + ')(?![a-zà-ü])', 'gi'), ' · ')
  var altri = altriDa(t)
  if (altri !== null) return altri
  var m = /(?:^|[\s·•])(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?\s*(?:mila|mln|k)?)(?=$|[\s·•])/i.exec(t)
  return m ? numeroDa(m[1]) : null
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

/** Il giorno di Roma, «2026-10-01»: è il calendario della finestrella. */
function giornoRoma(ms) {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' })
}

/** L'intervallo della finestrella; se manca o è storto, dal 1° del mese a oggi. */
function intervalloDi(opz, ora) {
  var oggi = giornoRoma(ora)
  var ok = function (g) { return typeof g === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(g) }
  var dal = opz && ok(opz.dal) ? opz.dal : oggi.slice(0, 8) + '01'
  var al = opz && ok(opz.al) ? opz.al : oggi
  return dal <= al ? { dal: dal, al: al } : { dal: al, al: dal }
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

/** L'elemento più esterno con quell'URN: LinkedIn lo ripete anche dentro il post. */
function hostDi(el) {
  var host = el.closest(SEL_POST)
  var urn = host && urnDi(host)
  if (!urn) return null
  var su = host.parentElement && host.parentElement.closest(SEL_POST)
  while (su && urnDi(su) === urn) {
    host = su
    su = host.parentElement && host.parentElement.closest(SEL_POST)
  }
  return host
}

var RE_URN = /urn:li:(?:activity|ugcPost|share):\d{15,22}/

function decodifica(s) {
  try { return decodeURIComponent(s) } catch (e) { return s }
}

/**
 * L'URN del post dal link alle analisi. Da novembre 2026 LinkedIn non mette più
 * `data-urn` / `data-id` sui post: l'URN sta solo negli `href`
 * (…/analytics/post-summary/urn:li:activity:…), e il link alle analisi c'è solo sui tuoi.
 */
function urnDaAnalisi(el) {
  var a = el.matches('a[href]') ? el : (el.querySelector('a[href*="urn:li:"], a[href*="urn%3Ali%3A"]') || el.closest('a[href]'))
  var m = a && RE_URN.exec(decodifica(a.getAttribute('href') || ''))
  return m ? m[0] : null
}

/**
 * Senza `data-urn` il post è il **più grande antenato** del link alle analisi che
 * non contiene il link alle analisi di un altro post: un salto più su ci sono
 * anche i post vicini. Si ferma comunque a `main` / `body`.
 */
function hostDaAnalisi(a, urn) {
  var host = a
  while (host.parentElement) {
    var su = host.parentElement
    if (su === document.body || su === document.documentElement || su.tagName === 'MAIN' || su.getAttribute('role') === 'main') break
    var altro = Array.from(su.querySelectorAll(SEL_ANALISI)).some(function (x) {
      var u = urnDaAnalisi(x)
      return !!u && u !== urn
    })
    if (altro) break
    host = su
  }
  return host
}

/**
 * Un elemento è di questo post se sta dentro `host` e, quando ha un antenato con
 * `data-urn` dentro `host`, quello ha lo **stesso URN** — non lo stesso elemento:
 * la barra delle reazioni sta dentro un blocco che ripete l'URN del post, e
 * confrontare gli elementi la scartava. Un post condiviso dentro il tuo ha un
 * altro URN, e resta fuori.
 */
function delPost(e, host, urn) {
  var h = e.closest(SEL_POST)
  if (h && host.contains(h)) return urnDi(h) === urn
  if (!host.contains(e)) return false
  return !incorporatiDi(host).some(function (r) { return r.contains(e) })
}

/**
 * Il blocco del post (novembre 2026): quello che contiene il titolo nascosto
 * <h2> «Post nel feed». I suoi figli diretti sono l'intestazione, il testo
 * dell'autore (un <p>), l'eventuale post condiviso e la barra dei pulsanti.
 */
function areaDi(host) {
  var h2 = host.querySelector('h2')
  return h2 && h2.parentElement && host.contains(h2.parentElement) ? h2.parentElement : null
}

var INCORPORATI = new WeakMap()

/**
 * I post condivisi dentro il tuo: il figlio dell'area che contiene un link a un
 * altro post (/feed/update/urn:li:…). Il suo testo («Circa 100 commenti…») e i
 * suoi numeri non sono tuoi, e non vanno letti. Si rifà a ogni lettura.
 */
function incorporatiDi(host) {
  var r = INCORPORATI.get(host)
  if (r) return r
  r = []
  var area = areaDi(host)
  if (area) {
    host.querySelectorAll('a[href*="/feed/update/urn:li:"], a[href*="/feed/update/urn%3Ali%3A"]').forEach(function (a) {
      var el = a
      while (el.parentElement && el.parentElement !== area) el = el.parentElement
      if (el.parentElement === area && r.indexOf(el) < 0) r.push(el)
    })
  }
  INCORPORATI.set(host, r)
  return r
}

/**
 * Il testo scritto dall'autore. Sulla pagina vecchia lo dicono le classi; su
 * quella di novembre 2026 le classi sono offuscate e il testo è il primo <p>
 * figlio diretto dell'area del post (i <p> dell'ora, dei numeri e del post
 * condiviso stanno più in basso).
 */
function corpoDi(host, urn) {
  var c = Array.from(host.querySelectorAll(SEL_CORPO)).filter(function (e) { return delPost(e, host, urn) })[0]
  if (c) return c
  var area = areaDi(host)
  if (!area) return null
  for (var i = 0; i < area.children.length; i++) {
    if (area.children[i].tagName === 'P') return area.children[i]
  }
  return null
}

/** Il testo di un post senza il «…altro» che LinkedIn mette in fondo ai post lunghi. */
function testoPulito(el) {
  var t = (el.innerText || el.textContent || '').replace(/\s+/g, ' ')
    .replace(/\s*(?:…|\.{3})\s*(?:altro|mostra altro|more|see more)\s*$/i, '').trim()
  // 280 caratteri al massimo, tagliati all'ultima parola intera
  return t.length > 280 ? t.slice(0, 279).replace(/\s+\S*$/, '') + '…' : t
}

/** I tuoi post sono quelli con l'ingresso alle analisi: le impression le vede solo l'autore. */
function postMiei() {
  var mappa = new Map()
  document.querySelectorAll(SEL_ANALISI).forEach(function (a) {
    var host = hostDi(a)
    var urn = host && urnDi(host)
    if (!urn) {
      urn = urnDaAnalisi(a)
      if (!urn || mappa.has(urn)) return
      host = hostDaAnalisi(a, urn)
    }
    if (urn && !mappa.has(urn)) mappa.set(urn, host)
  })
  if (mappa.size === 0) {
    document.querySelectorAll(SEL_POST).forEach(function (el) {
      var host = hostDi(el)
      var urn = host && urnDi(host)
      if (urn && !mappa.has(urn) && contaDa(testiDi(host, urn, null), PAROLE_SFIDA.impression) !== null) mappa.set(urn, host)
    })
  }
  return mappa
}

/** I pezzi di testo sotto un elemento, uno per nodo. */
function nodiDi(el) {
  var out = []
  var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  for (var n = w.nextNode(); n; n = w.nextNode()) {
    var t = (n.nodeValue || '').replace(/\s+/g, ' ').trim()
    if (t) out.push({ testo: t, el: n.parentElement })
  }
  return out
}

/**
 * Il testo di un blocco con un separatore fra un nodo e l'altro. `innerText`
 * incolla due elementi senza spazio in mezzo: «12» e «8 commenti» diventavano
 * «128 commenti».
 */
function testoSeparato(el) {
  return nodiDi(el).map(function (x) { return x.testo }).join(' · ')
}

/**
 * Dove cercare «N commenti», «N impressioni»: le etichette accessibili, la
 * barra social e ogni pezzo di testo breve del post, fuori dal testo scritto
 * dall'autore — dove «100 commenti» è una frase, non un conteggio.
 */
function testiDi(host, urn, corpo) {
  var out = []
  host.querySelectorAll('[aria-label]').forEach(function (e) {
    if (delPost(e, host, urn)) out.push(e.getAttribute('aria-label'))
  })
  host.querySelectorAll('[class*="social-details"], [class*="social-counts"], [class*="social-activity"], ' + SEL_ANALISI).forEach(function (e) {
    if (delPost(e, host, urn)) out.push(testoSeparato(e))
  })
  nodiDi(host).forEach(function (x) {
    if (x.el && x.testo.length < 120 && delPost(x.el, host, urn) && !(corpo && corpo.contains(x.el))) out.push(x.testo)
  })
  return out
}

/** Accanto alle icone delle reazioni c'è il loro numero. */
function reazioniDaIcone(tutti) {
  var icone = tutti('img[alt], [data-test-reactions-icon-type], [data-reaction-type], svg[aria-label]').filter(function (e) {
    var nome = e.getAttribute('data-test-reactions-icon-type') || e.getAttribute('data-reaction-type') || e.getAttribute('alt') || e.getAttribute('aria-label') || ''
    return ICONE_REAZIONI.test(nome.trim())
  })
  for (var i = 0; i < icone.length; i++) {
    var su = icone[i].parentElement
    // oltre i 200 caratteri si è usciti dalla riga e si legge il testo del post
    for (var k = 0; k < 4 && su && testoSeparato(su).length < 200; k++, su = su.parentElement) {
      var n = numeroNudo(testoSeparato(su))
      if (n !== null) return n
    }
  }
  return null
}

/** Sulla riga di «3 commenti · 1 diffusione» il numero senza parola sono le reazioni. */
function reazioniDaRiga(tutti, corpo) {
  var re = new RegExp('\\d[\\d.,]*\\s*(?:' + PAROLE_SFIDA.commenti + '|' + PAROLE_SFIDA.diffusioni + ')(?![a-zà-ü])', 'i')
  var ancore = tutti('button, a, span, li').filter(function (e) {
    var t = testoSeparato(e)
    return t.length < 60 && re.test(t)
  })
  for (var i = 0; i < ancore.length; i++) {
    var su = ancore[i].parentElement
    for (var k = 0; k < 4 && su && testoSeparato(su).length < 200; k++, su = su.parentElement) {
      if (corpo && su.contains(corpo)) break
      var n = numeroNudo(testoSeparato(su))
      if (n !== null) return n
    }
  }
  return null
}

/**
 * Sulla pagina di novembre 2026 il numero sta dentro il pulsante, senza la
 * parola: «Commenta» con un «1» dentro. Pulsante senza numero = zero. Nessun
 * pulsante = null: sulla pagina vecchia il pulsante «Commenta» non ha numeri e
 * lo zero sarebbe falso, quindi si usa solo dopo i testi «N commenti».
 */
function contaDaPulsante(tutti, nome) {
  var bs = tutti('button[aria-label], a[aria-label]').filter(function (b) {
    return nome.test((b.getAttribute('aria-label') || '').trim())
  })
  if (!bs.length) return null
  var n = numeroNudo(testoSeparato(bs[0]))
  return n === null ? 0 : n
}

function leggiPost(host, urn) {
  INCORPORATI = new WeakMap()
  var tutti = function (sel) {
    return Array.from(host.querySelectorAll(sel)).filter(function (e) { return delPost(e, host, urn) })
  }
  var corpo = corpoDi(host, urn)
  var testi = testiDi(host, urn, corpo)
  var reazioni = contaDa(testi, PAROLE_SFIDA.reazioni)
  if (reazioni === null) reazioni = reazioniDaIcone(tutti)
  if (reazioni === null) reazioni = reazioniDaRiga(tutti, corpo)
  if (reazioni === null) {
    var rc = tutti('[class*="reactions-count"]')[0]
    if (rc) reazioni = reazioniDa(rc.innerText || rc.textContent)
  }
  if (reazioni === null) reazioni = contaDaPulsante(tutti, /pulsante reazione|reaction button/i)
  var commenti = contaDa(testi, PAROLE_SFIDA.commenti)
  if (commenti === null) commenti = contaDaPulsante(tutti, /^(commenta|comment)$/i)
  var diffusioni = contaDa(testi, PAROLE_SFIDA.diffusioni)
  if (diffusioni === null) diffusioni = contaDaPulsante(tutti, /^(diffondi|repost|condividi)\b/i)
  return {
    post_urn: urn,
    url: 'https://www.linkedin.com/feed/update/' + urn + '/',
    // senza contatore LinkedIn non ha niente da dire: zero. Ma il pannello lo dice, post per post
    reazioni: reazioni === null ? 0 : reazioni,
    reazioniLette: reazioni !== null,
    commenti: commenti === null ? 0 : commenti,
    diffusioni: diffusioni === null ? 0 : diffusioni,
    // le impression invece ci sono sempre, sui propri post: se mancano, la cella resta vuota
    impression: contaDa(testi, PAROLE_SFIDA.impression),
    testo: corpo ? testoPulito(corpo) : '',
  }
}

function attesa(ms) { return new Promise(function (r) { setTimeout(r, ms) }) }

/**
 * LinkedIn riempie i numeri di un post quando il post è in vista: il primo
 * giro, con la pagina appena scorsa, ha scritto zero reazioni su post che ne
 * avevano. Quindi il post si porta in vista, si aspetta, e se le reazioni non
 * ci sono ancora si rilegge, fino a tre volte.
 */
async function leggiConPazienza(host, urn) {
  host.scrollIntoView({ block: 'center' })
  var r = null
  for (var i = 0; i < 3; i++) {
    await attesa(i === 0 ? 500 : 1500)
    r = leggiPost(host, urn)
    if (r.reazioniLette) break
  }
  return r
}

/** «Mostra altri risultati», «Visualizza altri post», «Show more results»: fuori dai post, visibile. */
function bottoneAltri() {
  var bs = document.querySelectorAll('button')
  for (var i = 0; i < bs.length; i++) {
    var b = bs[i]
    var t = (b.innerText || '').trim()
    if (b.disabled || b.offsetParent === null || b.closest(SEL_POST)) continue
    if (/^(mostra|visualizza|carica|vedi)\s+(altr[iey]|di più|ancora)|^(show|load|see)\s+more/i.test(t)) return b
  }
  return null
}

/** Quanti post vede la pagina: con o senza `data-urn`, i link alle analisi crescono a ogni caricamento. */
function contaPost() {
  return Math.max(document.querySelectorAll(SEL_POST).length, document.querySelectorAll(SEL_ANALISI).length)
}

/** L'ultimo post in pagina, quello verso cui si scorre. */
function ultimoPost(miei) {
  var tutti = document.querySelectorAll(SEL_POST)
  if (tutti.length) return tutti[tutti.length - 1]
  var hosts = Array.from(miei.values())
  return hosts.length ? hosts[hosts.length - 1] : null
}

/** Se la pagina scorre dentro un contenitore e non nella finestra, si scorre quello. */
function contenitoreScorrevole(ultimo) {
  var e = ultimo ? ultimo.parentElement : null
  while (e && e !== document.body && e !== document.documentElement) {
    var s = getComputedStyle(e)
    if (/(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 10) return e
    e = e.parentElement
  }
  return null
}

/**
 * Si scorre finché compare un tuo post più vecchio del «dal». La prima versione
 * smetteva dopo quattro giri senza post nuovi e sul LinkedIn vero, il 16
 * ottobre, ha perso post di inizio mese più vecchi di quelli trovati: LinkedIn
 * può metterci più di tre secondi, volere il bottone «Mostra altri» o scorrere
 * dentro un contenitore. Quindi più pazienza (a ogni giro a vuoto si aspetta
 * di più), il bottone riconosciuto più largo, e il contenitore scorso anche lui.
 */
async function scorri(dal, stato) {
  var fermo = 0
  for (var giro = 0; giro < 150 && fermo < 7; giro++) {
    var prima = contaPost()
    var miei = postMiei()
    stato('Scorro la tua attività… ' + miei.size + ' post tuoi caricati.')
    var passato = Array.from(miei.keys()).some(function (u) {
      var ms = msDaUrn(u)
      return ms !== null && giornoRoma(ms) < dal
    })
    if (passato) return
    var b = bottoneAltri()
    if (b) b.click()
    var ultimo = ultimoPost(miei)
    if (ultimo) ultimo.scrollIntoView({ block: 'end' })
    var box = contenitoreScorrevole(ultimo)
    if (box) box.scrollTop = box.scrollHeight
    window.scrollTo(0, document.documentElement.scrollHeight)
    await attesa(1500 + Math.random() * 1500 + fermo * 1000)
    fermo = contaPost() > prima ? 0 : fermo + 1
  }
}

function scarica(testo, nome, tipo) {
  var url = URL.createObjectURL(new Blob([testo], { type: tipo }))
  var a = document.createElement('a')
  a.href = url
  a.download = nome
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(function () { URL.revokeObjectURL(url) }, 10000)
}

/**
 * La pagina per chi cura l'estensione: **solo i tuoi post** dell'intervallo,
 * senza script, stili, immagini e link (tranne quelli alle analisi). Basta a
 * capire dove LinkedIn ha messo un numero quando l'estensione smette di trovarlo.
 */
function paginaDiagnostica(hosts) {
  var parti = hosts.map(function (h) {
    var c = h.cloneNode(true)
    c.querySelectorAll('script, style, code, noscript, iframe, video').forEach(function (e) { e.remove() })
    c.querySelectorAll('[src], [srcset]').forEach(function (e) { e.removeAttribute('src'); e.removeAttribute('srcset') })
    c.querySelectorAll('[href]').forEach(function (e) {
      if (!/\/analytics\/|urn:li:/.test(e.getAttribute('href') || '')) e.setAttribute('href', '#')
    })
    return c.outerHTML
  })
  return '<!doctype html>\n<meta charset="utf-8">\n<title>Diagnostica sfida LinkedIn</title>\n<body>\n<div id="post">\n'
    + parti.join('\n') + '\n</div>\n</body>\n'
}

function pannello() {
  var vecchio = document.getElementById('twobee-sfida')
  if (vecchio) vecchio.remove()
  var host = document.createElement('div')
  host.id = 'twobee-sfida'
  host.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483647'
  var root = host.attachShadow({ mode: 'open' })
  root.innerHTML = '<style>'
    + '.box{width:360px;max-width:calc(100vw - 40px);max-height:70vh;overflow:auto;box-sizing:border-box;background:#141414;color:#f5f5f5;border:1px solid #F5C800;border-radius:14px;padding:16px;font:15px/1.45 system-ui,sans-serif;box-shadow:0 12px 32px rgba(0,0,0,.35)}'
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
  return 'Diagnostica: ' + document.querySelectorAll(SEL_POST).length + ' post con data-urn, '
    + postMiei().size + ' tuoi riconosciuti, '
    + document.querySelectorAll(SEL_ANALISI).length + ' ingressi alle analisi, '
    + document.querySelectorAll('[class*="reactions-count"]').length + ' contatori di reazioni.'
}

function giornoBreve(g) {
  return new Date(g + 'T12:00:00Z').toLocaleDateString('it-IT', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

async function avviaSfida() {
  if (window.__twobeeSfida) return
  window.__twobeeSfida = true
  var opz = window.__twobeeOpzioni || {}
  window.__twobeeOpzioni = null
  var ui = pannello()
  try {
    if (!/\/recent-activity\//.test(location.pathname)) {
      ui.fine('Non sono sulla tua attività. Apri il tuo profilo → Attività → Post, poi riprova dall\'icona.', false)
      return
    }
    var ora = Date.now()
    var iv = intervalloDi(opz, ora)
    var quando = 'dal ' + giornoBreve(iv.dal) + ' al ' + giornoBreve(iv.al)
    await scorri(iv.dal, ui.stato)
    var hosts = []
    var righe = []
    var urns = []
    postMiei().forEach(function (host, urn) {
      var ms = msDaUrn(urn)
      var g = ms === null ? '' : giornoRoma(ms)
      if (g >= iv.dal && g <= iv.al) {
        hosts.push(host)
        urns.push(urn)
      }
    })
    if (!opz.diagnostica) {
      for (var i = 0; i < hosts.length; i++) {
        ui.stato('Leggo i numeri… post ' + (i + 1) + ' di ' + hosts.length + '.')
        righe.push(await leggiConPazienza(hosts[i], urns[i]))
      }
    }

    if (opz.diagnostica) {
      var campione = hosts.length ? hosts.slice(0, 6) : Array.from(postMiei().values()).slice(0, 6)
      if (!campione.length) {
        campione = Array.from(document.querySelectorAll(SEL_POST)).map(hostDi)
          .filter(function (h, i, a) { return h && a.indexOf(h) === i }).slice(0, 6)
      }
      scarica(paginaDiagnostica(campione), 'linkedin-diagnostica-' + giornoRoma(ora) + '.html', 'text/html;charset=utf-8')
      ui.fine('File di diagnostica nei download: ' + campione.length + ' post, senza immagini né link.\n'
        + 'Mandalo a chi cura TwoBee OS insieme ai numeri che vedi sotto quei post.\n' + diagnostica(), false)
      return
    }

    if (righe.length === 0) {
      ui.fine('Nessun tuo post ' + quando + ' trovato in questa pagina.\n'
        + 'Se ne hai pubblicati, LinkedIn potrebbe aver cambiato la pagina: rifai dalla finestrella con «Scarica la pagina per la diagnostica».\n' + diagnostica(), false)
      return
    }
    var tot = righe.reduce(function (s, r) {
      return { reazioni: s.reazioni + r.reazioni, commenti: s.commenti + r.commenti, impression: s.impression + (r.impression || 0), senza: s.senza + (r.impression === null ? 1 : 0) }
    }, { reazioni: 0, commenti: 0, impression: 0, senza: 0 })
    var nonLette = righe.filter(function (r) { return !r.reazioniLette })
    var avvisi = []
    if (tot.senza) avvisi.push('Impression non lette su ' + tot.senza + ' post: nel file restano vuote, non zero.')
    if (tot.reazioni === 0 || nonLette.length) {
      avvisi.push('Reazioni non trovate su ' + (tot.reazioni === 0 ? righe.length : nonLette.length) + ' post: nel file risultano 0. '
        + 'Se sotto quei post vedi delle reazioni, non caricare il file: rifai con «Scarica la pagina per la diagnostica» e mandalo a chi cura TwoBee OS.')
    }
    var meseOra = meseRoma(ora)
    var fuori = righe.filter(function (r) { return meseRoma(msDaUrn(r.post_urn)) !== meseOra }).length
    if (fuori) avvisi.push(fuori + ' post non sono di questo mese: l\'OS li ignora, la sfida conta solo il mese in corso.')
    scarica(csvDi(righe), 'linkedin-sfida-' + iv.dal + '_' + iv.al + '.csv', 'text/csv;charset=utf-8')
    ui.fine(righe.length + ' post ' + quando + ': '
      + tot.impression.toLocaleString('it-IT') + ' impression, '
      + tot.reazioni.toLocaleString('it-IT') + ' reazioni, '
      + tot.commenti.toLocaleString('it-IT') + ' commenti.\n'
      + 'Il CSV è nei download: caricalo su TwoBee OS → Sfida LinkedIn.'
      + (avvisi.length ? '\n\nAttenzione:\n' + avvisi.join('\n') : ''), true)
  } catch (e) {
    ui.fine('Qualcosa è andato storto: ' + (e && e.message ? e.message : e), false)
  } finally {
    window.__twobeeSfida = false
  }
}

if (typeof module === 'object' && module && module.exports) {
  module.exports = {
    numeroDa: numeroDa, contaDa: contaDa, reazioniDa: reazioniDa, altriDa: altriDa, numeroNudo: numeroNudo, msDaUrn: msDaUrn,
    meseRoma: meseRoma, giornoRoma: giornoRoma, intervalloDi: intervalloDi, csvDi: csvDi,
    COLONNE_CSV: COLONNE_CSV, PAROLE_SFIDA: PAROLE_SFIDA, ICONE_REAZIONI: ICONE_REAZIONI,
  }
} else {
  avviaSfida()
}
