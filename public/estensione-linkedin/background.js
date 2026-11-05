/* TwoBee · Sfida LinkedIn — la finestrella chiede, qui si esegue.
   Porta la scheda sulla tua attività («Tutto»: i tuoi post li riconosce la
   raccolta dal link alle analisi), aspetta che il feed arrivi, passa
   l'intervallo alla pagina e lancia la raccolta. Non legge niente fuori da
   linkedin.com.

   Si passa dal profilo e si legge dove LinkedIn porta: «/in/me/recent-activity/
   shares/» il 5 novembre 2026 restava una pagina bianca, e l'unica che
   funzionava era «/in/<nome-profilo>/recent-activity/all/». */

var PROFILO = 'https://www.linkedin.com/in/me/'
var SU_ATTIVITA = /^https:\/\/www\.linkedin\.com\/in\/[^/]+\/recent-activity\/(shares|all)\//
var SU_LINKEDIN = /^https:\/\/www\.linkedin\.com\//
var NOME_PROFILO = /^https:\/\/www\.linkedin\.com\/in\/([^/?#]+)/

/** Dall'indirizzo del profilo (dopo il reindirizzamento di «me») a quello dell'attività. Se il nome non si legge resta «me». */
function attivitaDi(urlProfilo) {
  var m = NOME_PROFILO.exec(urlProfilo || '')
  var nome = m && m[1] !== 'me' ? m[1] : 'me'
  return 'https://www.linkedin.com/in/' + nome + '/recent-activity/all/'
}

function caricata(tabId) {
  return new Promise(function (resolve) {
    var finito = false
    var chiudi = function () {
      if (finito) return
      finito = true
      chrome.tabs.onUpdated.removeListener(ascolta)
      resolve()
    }
    var ascolta = function (id, info) { if (id === tabId && info.status === 'complete') chiudi() }
    chrome.tabs.onUpdated.addListener(ascolta)
    setTimeout(chiudi, 20000)
  })
}

async function avvia(msg) {
  var schede = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  var tab = schede[0]
  var tabId = tab && tab.id
  if (!tabId) return
  if (!SU_ATTIVITA.test(tab.url || '')) {
    // fuori da LinkedIn non si tocca la scheda di chi lavora: se ne apre una
    if (SU_LINKEDIN.test(tab.url || '')) await chrome.tabs.update(tabId, { url: PROFILO })
    else tabId = (await chrome.tabs.create({ url: PROFILO })).id
    await caricata(tabId)
    // LinkedIn ha reindirizzato «me» al tuo nome profilo: da lì si va all'attività
    var profilo = await chrome.tabs.get(tabId)
    await chrome.tabs.update(tabId, { url: attivitaDi(profilo.url) })
    await caricata(tabId)
    await new Promise(function (r) { setTimeout(r, 2500) })
  }
  await chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: function (opz) { window.__twobeeOpzioni = opz },
    args: [{ dal: msg.dal, al: msg.al, diagnostica: msg.tipo === 'diagnostica' }],
  })
  await chrome.scripting.executeScript({ target: { tabId: tabId }, files: ['raccolta.js'] })
}

chrome.runtime.onMessage.addListener(function (msg, _mittente, rispondi) {
  if (msg && (msg.tipo === 'raccogli' || msg.tipo === 'diagnostica')) {
    rispondi({ ok: true })
    avvia(msg)
  }
})
