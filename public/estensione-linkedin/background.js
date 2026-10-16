/* TwoBee · Sfida LinkedIn — il clic sull'icona.
   Porta la scheda sulla tua attività (i soli post: «shares»), aspetta che il
   feed arrivi e lancia la raccolta. Non legge niente fuori da linkedin.com. */

var ATTIVITA = 'https://www.linkedin.com/in/me/recent-activity/shares/'
var SU_ATTIVITA = /^https:\/\/www\.linkedin\.com\/in\/[^/]+\/recent-activity\/(shares|all)\//
var SU_LINKEDIN = /^https:\/\/www\.linkedin\.com\//

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

chrome.action.onClicked.addListener(async function (tab) {
  var tabId = tab.id
  if (!tabId) return
  if (!SU_ATTIVITA.test(tab.url || '')) {
    // fuori da LinkedIn non si tocca la scheda di chi lavora: se ne apre una
    if (SU_LINKEDIN.test(tab.url || '')) await chrome.tabs.update(tabId, { url: ATTIVITA })
    else tabId = (await chrome.tabs.create({ url: ATTIVITA })).id
    await caricata(tabId)
    await new Promise(function (r) { setTimeout(r, 2500) })
  }
  await chrome.scripting.executeScript({ target: { tabId: tabId }, files: ['raccolta.js'] })
})
