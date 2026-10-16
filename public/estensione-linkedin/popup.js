/* La finestrella: da che giorno a che giorno. I giorni sono quelli di Roma,
   come nell'OS. Di default il mese in corso fino a oggi, che è quello che la
   sfida conta: l'OS ignora i post degli altri mesi. */

var dal = document.getElementById('dal')
var al = document.getElementById('al')
var nota = document.getElementById('nota')
var oggi = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' })
var primo = oggi.slice(0, 8) + '01'

dal.value = primo
al.value = oggi
dal.max = oggi
al.max = oggi

function controlla() {
  nota.className = 'nota'
  if (dal.value && al.value && dal.value > al.value) {
    nota.className = 'nota errore'
    nota.textContent = '«Dal» viene dopo «Al».'
    return false
  }
  nota.textContent = dal.value && dal.value < primo
    ? 'La sfida conta solo i post di questo mese: quelli prima del 1° l\'OS li ignora.'
    : ''
  return true
}

function avvia(tipo) {
  if (!dal.value || !al.value || !controlla()) return
  chrome.runtime.sendMessage({ tipo: tipo, dal: dal.value, al: al.value }, function () { window.close() })
}

dal.addEventListener('change', controlla)
al.addEventListener('change', controlla)
document.getElementById('modulo').addEventListener('submit', function (e) { e.preventDefault(); avvia('raccogli') })
document.getElementById('diag').addEventListener('click', function () { avvia('diagnostica') })
