'use client'

/**
 * §371/§374/§379 — il CRM commerciale, e le tre viste delle stesse righe.
 *
 * **L'elenco è la vista di casa**, e il motivo è che risponde alla domanda
 * che si fa aprendo la pagina: chi chiamo adesso. Referente, telefono, mail
 * e provenienza si leggono senza aprire niente; il resto vive nella scheda,
 * con lo spazio per essere letto. Prima era la tabella di Notion a ventitré
 * colonne che scorreva di lato — fedele al millimetro e inutile per lavorare
 * (§374).
 *
 * **La bacheca risponde a un'altra domanda** — com'è messa la pipeline, dove
 * si è accumulato — e a quella l'elenco risponde peggio. Sta in
 * `CrmBacheca`, si trascina per cambiare fase, e ogni spostamento passa da
 * una conferma: è l'unico gesto del prodotto che cambia un dato passando
 * sopra a qualcosa, e un trascinamento mancato non si nota (§379).
 *
 * **I numeri sono la terza** e guardano tutte le righe, non quelle filtrate:
 * per questo lì i filtri spariscono invece di restare senza effetto.
 *
 * Tutte e tre leggono lo **stesso** `viste`, già cercato, filtrato e
 * ordinato: due viste che mostrano insiemi diversi sotto gli stessi filtri
 * sono due viste di cui una mente.
 */

import { useState, useMemo, useTransition, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Loader2, RefreshCw, BarChart3, List, Columns3, ShieldCheck, Plus, Trash2, ChevronRight } from 'lucide-react'

import { ETICHETTA_GRUPPO, GRUPPI, gruppoDi, type Gruppo } from '@/lib/sales-stages'
import { useFasi } from './FasiContext'
import { MenuFase } from './MenuFase'
import { dividiPersi, notaInRiga } from '@/lib/sales-elenco'
import { salvaCellaDeal, collegaLeadACliente, aggiornaDaFoglio, eliminaLead, impostaOwnerDeal, salvaCampoExtra } from '@/app/actions/sales'
import { ETICHETTA_QUALIFICA } from '@/lib/sales-table'
import { giorniFa, quandoContatto } from '@/lib/sales-timeline'
import { NewClientModal } from '@/components/clients/NewClientModal'
import type { Client } from '@/lib/types/database'
import { CrmScheda } from './CrmScheda'
import { EliminaLead } from './EliminaLead'
import { CrmBacheca } from './CrmBacheca'
import { ConfermaFase } from './ConfermaFase'
import { CrmControllo } from './CrmControllo'
import { controlla, quanteGravi } from '@/lib/sales-igiene'
import type { RigaIgiene } from '@/lib/sales-igiene'
import { NuovoLead } from './NuovoLead'
import { CrmAnalytics } from './CrmAnalytics'
import { tassoDi, type RigaAnalisi } from '@/lib/sales-analytics'
import { SENZA_OWNER } from '@/lib/sales-filtri'
import { applicaStato, eNostra, leggi, scrivi, VUOTO, type StatoElenco } from '@/lib/sales-vista'
import { BarraFiltri } from './BarraFiltri'
import { VoceSezione } from '@/components/workspace/VoceSezione'

/** §430 — chi può comparire come Account Owner, e chi si può ancora scegliere */
export type PersonaCrm = { id: string; nome: string; assegnabile: boolean }

export type RigaCrm = Record<string, unknown> & {
  id: string
  company_name: string | null
  stage: string
  client_id: string | null
}

/**
 * Giorno e ora del lead, all'italiana: `20/09 15:41`.
 *
 * L'ora non è un vezzo — è la differenza fra un lead arrivato alle nove del
 * mattino e uno delle undici di sera, che si richiamano in due momenti
 * diversi. L'anno si scrive solo quando non è quello in corso, o sarebbero
 * cinque caratteri ripetuti su ventinove righe.
 */
function quando(v: unknown): string {
  if (typeof v !== 'string' || !v) return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  const anno = d.getFullYear() === new Date().getFullYear() ? '' : `/${String(d.getFullYear()).slice(2)}`
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}${anno} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const MEMORIA = 'twobee-crm-elenco'
const GRUPPI_AMMESSI = ['tutti', ...GRUPPI]

export function CrmTable({ righe: iniziali, puoiEliminare = false, persone = [], puoiAssegnare = false, io }: {
  righe: RigaCrm[]
  /** §440 — chi guarda: «Miei» è suoi */
  io: string
  persone?: PersonaCrm[]
  /** §430 — admin e manager: gli owner li decide chi assegna il lavoro */
  puoiAssegnare?: boolean
  /** §378 — admin e manager. Chi non può non vede le caselle, non le vede spente */
  puoiEliminare?: boolean
}) {
  const { TUTTE, FASI, etichettaFase, faseConRuolo, etichettaScelta, ORDINI } = useFasi()
  const [righe, setRighe] = useState(iniziali)
  /* §440 — cerca, gruppo, filtri, date e ordine sono **uno** stato, che sta
     nell'indirizzo e si ricorda: prima erano sette `useState` e al ricarico
     sparivano tutti. */
  const [stato, setStatoGrezzo] = useState<StatoElenco>(VUOTO)
  const [converto, setConverto] = useState<RigaCrm | null>(null)
  const [apertaId, setApertaId] = useState<string | null>(null)
  const [nuovo, setNuovo] = useState(false)
  const [vista, setVista] = useState<'tabella' | 'bacheca' | 'numeri' | 'controllo'>('tabella')
  const [aggiorno, setAggiorno] = useState(false)
  const [esitoSync, setEsitoSync] = useState<string | null>(null)
  /* La selezione vive sugli **id** e non sulle righe, come in Clienti: una
     riga eliminata esce da sé invece di restare a gonfiare il contatore di
     una barra che agirebbe su niente. */
  const [selezione, setSelezione] = useState<string[]>([])
  /** id in attesa di conferma: uno solo dalla scheda, N dalla selezione */
  const [daEliminare, setDaEliminare] = useState<string[] | null>(null)
  const [elimino, setElimino] = useState(false)
  /** §379 — lo spostamento chiesto trascinando, in attesa di conferma */
  const [daSpostare, setDaSpostare] = useState<{ riga: RigaCrm; fase: string } | null>(null)
  const [sposto, setSposto] = useState(false)
  const [pending, start] = useTransition()

  /* Gli stessi numeri del pannello, in testata: chi apre la pagina vede
     subito quanti clienti e quanti aperti, come in Clienti vede il canone. */
  const t = useMemo(() => tassoDi(TUTTE, righe as unknown as RigaAnalisi[]), [TUTTE, righe])
  /* §385 — il numero sul bottone si conta su **tutte** le righe e non su
     quelle filtrate: un controllo che sparisce quando cerchi qualcos'altro
     ti fa credere di averlo risolto. Conta le righe toccate, non i rilievi:
     una riga che sbaglia tre cose è un problema, e dire «tre» farebbe
     sembrare l'archivio peggio di com'è. */
  const daControllare = useMemo(
    () => quanteGravi(controlla(TUTTE, righe as unknown as RigaIgiene[], new Date().toISOString().slice(0, 10))),
    [TUTTE, righe])
  /* La scheda si tiene per **id**, non per oggetto: salvando una cella la riga
     viene ricreata, e un riferimento vecchio mostrerebbe il valore di prima
     accanto a quello nuovo nell'elenco. */
  /* all'apertura: prima l'indirizzo (un link incollato vince), poi l'ultima
     vista di questo browser, altrimenti tutto. La memoria può mancare — una
     finestra privata — e l'elenco si apre lo stesso. */
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    if (Array.from(p.keys()).some(eNostra)) { setStatoGrezzo(leggi(p, GRUPPI_AMMESSI)); return }
    try {
      const salvata = window.localStorage.getItem(MEMORIA)
      if (salvata) setStatoGrezzo(leggi(salvata, GRUPPI_AMMESSI))
    } catch { /* senza memoria si parte da capo */ }
  }, [])
  const setStato = useCallback((s: StatoElenco) => {
    setStatoGrezzo(s)
    const query = scrivi(s)
    try { window.localStorage.setItem(MEMORIA, query) } catch { /* resta nell'indirizzo */ }
    // `replaceState` e non il router: cambiare un filtro non deve rileggere la pagina dal server
    const p = new URLSearchParams(window.location.search)
    Array.from(p.keys()).filter(eNostra).forEach(k => p.delete(k))
    new URLSearchParams(query).forEach((v, k) => p.set(k, v))
    const qs = p.toString()
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`)
  }, [])
  const leggiQuery = useCallback((q: string) => leggi(q, GRUPPI_AMMESSI), [])
  const gruppo = stato.gruppo
  /* §439 — `?lead=<id>` apre la scheda: è dove porta il promemoria della
     campanella, e un promemoria che ti lascia a cercare il lead in un elenco
     di quaranta righe ricorda solo metà della cosa. */
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('lead')
    if (id && iniziali.some(r => r.id === id)) setApertaId(id)
  }, [iniziali])
  const aperta = apertaId ? righe.find(r => r.id === apertaId) ?? null : null
  const setAperta = (r: RigaCrm | null) => setApertaId(r?.id ?? null)

  /* §376 — cercare, filtrare, ordinare: in quest'ordine, e tutto e tre nel
     modulo puro. Il gruppo resta un filtro a parte perché è l'unico che si
     usa a colpo d'occhio, senza aprire niente. */
  const adesso = useMemo(() => Date.now(), [righe, stato])
  const contesto = useMemo(() => ({
    fasi: TUTTE, io, adessoMs: adesso, ordini: ORDINI,
    gruppoDi: (r: Record<string, unknown>) => { const f = FASI.find(x => x.chiave === r.stage); return f ? gruppoDi(f) : null },
  }), [TUTTE, io, adesso, ORDINI, FASI])
  const viste = useMemo(
    () => applicaStato(righe as unknown as Record<string, unknown>[], stato, contesto) as unknown as RigaCrm[],
    [righe, stato, contesto])

  /* Il conteggio per fase si fa sulle righe **filtrate dalla ricerca** ma non
     dal gruppo: altrimenti scegliendo un gruppo gli altri direbbero zero, e
     il numero accanto al filtro serve proprio a sapere quanto c'è di là. */
  const perGruppo = useMemo(() => {
    const base = applicaStato(righe as unknown as Record<string, unknown>[], stato, contesto, { senzaGruppo: true })
    const conta: Record<string, number> = { tutti: base.length }
    for (const g of GRUPPI) conta[g] = base.filter(r => contesto.gruppoDi(r) === g).length
    return conta
  }, [righe, stato, contesto])

  const nomeDi = useMemo(() => new Map(persone.map(p => [p.id, p.nome])), [persone])

  /* §430 — gli owner non passano da `salvaCellaDeal`: sono un'altra tabella e
     un'altra porta (`impostaOwnerDeal`), ma lo stesso gesto ottimistico. */
  const salvaOwner = async (riga: RigaCrm, ids: string[]) => {
    const prima = riga.owners
    setRighe(rs => rs.map(r => r.id === riga.id ? { ...r, owners: ids } : r))
    try {
      const { owner } = await impostaOwnerDeal(riga.id, ids)
      setRighe(rs => rs.map(r => r.id === riga.id ? { ...r, owners: owner } : r))
    } catch (e) {
      setRighe(rs => rs.map(r => r.id === riga.id ? { ...r, owners: prima } : r))
      toast.error((e as Error).message)
    }
  }

  /* §431 — i numeri leggono lo stesso insieme dell'elenco (§379: due viste con
     insiemi diversi sotto gli stessi filtri sono due viste di cui una mente),
     meno il gruppo di fasi, che su un tasso di conversione non ha senso. */
  const perNumeri = useMemo(
    () => applicaStato(righe as unknown as Record<string, unknown>[], stato, contesto, { senzaGruppo: true }),
    [righe, stato, contesto])

  /* §437 — un campo personalizzato: ottimistico come le celle, ma sull'oggetto
     `campi_extra`, e al ritorno vale quello che dice il database — che è anche
     il posto dove un collega può aver compilato un altro campo intanto. */
  const salvaExtra = async (riga: RigaCrm, chiave: string, valore: unknown) => {
    const prima = (riga.campi_extra ?? {}) as Record<string, unknown>
    const conValore = (o: Record<string, unknown>, v: unknown) => {
      const n = { ...o }
      if (v === null || v === undefined || v === '') delete n[chiave]; else n[chiave] = v
      return n
    }
    setRighe(rs => rs.map(r => r.id === riga.id ? { ...r, campi_extra: conValore(prima, valore) } : r))
    try {
      const { tutti } = await salvaCampoExtra(riga.id, chiave, valore)
      setRighe(rs => rs.map(r => r.id === riga.id ? { ...r, campi_extra: tutti } : r))
    } catch (e) {
      setRighe(rs => rs.map(r => r.id === riga.id ? { ...r, campi_extra: prima } : r))
      toast.error((e as Error).message)
    }
  }

  const salva = async (riga: RigaCrm, campo: string, valore: unknown): Promise<boolean> => {
    const prima = riga[campo]
    // ottimistico: chi modifica venti celle di fila non aspetta venti volte
    setRighe(rs => rs.map(r => r.id === riga.id ? { ...r, [campo]: valore } : r))
    try {
      const { valore: confermato } = await salvaCellaDeal(riga.id, campo, valore)
      setRighe(rs => rs.map(r => r.id === riga.id ? { ...r, [campo]: confermato } : r))
      return true
    } catch (e) {
      // il database ha ancora il valore di prima: la cella deve dire quello
      setRighe(rs => rs.map(r => r.id === riga.id ? { ...r, [campo]: prima } : r))
      toast.error((e as Error).message)
      return false
    }
  }

  /* §379 — la conferma resta aperta se il salvataggio fallisce: chiuderla
     comunque lascerebbe la scheda tornata al suo posto senza spiegazione,
     e il trascinamento sembrerebbe non aver fatto niente. */
  const confermaSposta = async () => {
    if (!daSpostare) return
    setSposto(true)
    const fatto = await salva(daSpostare.riga, 'stage', daSpostare.fase)
    setSposto(false)
    if (fatto) {
      toast.success(`${daSpostare.riga.company_name || 'Il lead'} è in ${etichettaFase(daSpostare.fase)}`)
      setDaSpostare(null)
    }
  }

  /* §372 — lo stesso giro del cron notturno, non una sua copia: se a mano e
     in automatico facessero due cose diverse, il giorno in cui il cron
     sbaglia nessuno riuscirebbe a riprodurlo premendo il bottone.

     Il riepilogo resta sotto, non in un avviso che sparisce: chi preme ha
     appena aggiunto una riga al foglio e vuole sapere se è arrivata. */
  const aggiorna = async () => {
    setAggiorno(true); setEsitoSync(null)
    try {
      const e = await aggiornaDaFoglio()
      if (e.errore) { setEsitoSync(e.errore); toast.error(e.errore); return }
      setEsitoSync([
        `${e.nuovi} nuovi`,
        `${e.giaPresenti} già presenti`,
        `${e.scartati} scartati (prove o senza azienda)`,
        /* §378 — si dice solo quando ce ne sono: uno «0 eliminati» fisso in
           coda insegna a non leggere la riga. */
        ...(e.ignorati ? [`${e.ignorati} eliminati a mano, non rientrano`] : []),
        /* §434 — il ritorno si dice sempre, anche quando non è configurato:
           chi preme il bottone deve sapere se il foglio adesso è allineato. */
        ...(e.ritorno ? ['errore' in e.ritorno
          ? `foglio non aggiornato: ${e.ritorno.errore}`
          : e.ritorno.scritte
            ? `sul foglio ${e.ritorno.scritte} celle aggiornate${e.ritorno.nuoveColonne.length ? ` e ${e.ritorno.nuoveColonne.length} colonne OS aggiunte` : ''}`
            : 'sul foglio era già tutto allineato'] : []),
      ].join(' · '))
      if (e.nuovi) { toast.success(`${e.nuovi} lead importati`); location.reload() }
      else toast.success('Nessun lead nuovo: il foglio è allineato')
    } catch (err) {
      const m = (err as Error).message
      setEsitoSync(m); toast.error(m)
    } finally { setAggiorno(false) }
  }

  const scegli = (id: string) =>
    setSelezione(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  const idVisti = useMemo(() => viste.map(r => r.id), [viste])
  const tuttiScelti = idVisti.length > 0 && idVisti.every(id => selezione.includes(id))
  const scegliTutti = () => setSelezione(p => tuttiScelti
    ? p.filter(id => !idVisti.includes(id))
    : Array.from(new Set([...p, ...idVisti])))

  /* §378 — eliminare non è modificare: niente ottimismo, niente `location
     .reload()`. Le righe si tolgono dallo stato quando il server ha detto
     che sono andate, e il riepilogo dice quante non rientreranno dal foglio
     — è l'unica parte che non si vede guardando l'elenco. */
  const elimina = async () => {
    if (!daEliminare?.length) return
    setElimino(true)
    try {
      const esito = await eliminaLead(daEliminare)
      const tolti = new Set(daEliminare)
      setRighe(rs => rs.filter(r => !tolti.has(r.id)))
      setSelezione(p => p.filter(id => !tolti.has(id)))
      if (apertaId && tolti.has(apertaId)) setApertaId(null)
      setDaEliminare(null)
      const quanti = esito.eliminati === 1 ? 'Lead eliminato' : `${esito.eliminati} lead eliminati`
      toast.success(esito.dalFoglio
        ? `${quanti} · il giro dal foglio non li rimette`
        : quanti)
    } catch (e) {
      toast.error((e as Error).message)
    } finally { setElimino(false) }
  }

  const convertito = (riga: RigaCrm) => (cliente: Client) => {
    start(async () => {
      try {
        await collegaLeadACliente(riga.id, cliente.id)
        setRighe(rs => rs.map(r => r.id === riga.id
          ? { ...r, client_id: cliente.id, stage: faseConRuolo('vinto')?.chiave ?? r.stage } : r))
        toast.success(`${cliente.company_name} è in anagrafica`)
        setConverto(null)
      } catch (e) { toast.error((e as Error).message) }
    })
  }

  /* I persi in fondo, e la regola guarda il **ruolo**: «Perso» è una fase che
     si può rinominare o duplicare dalle impostazioni (§424), quindi chiedere la
     chiave varrebbe finché nessuno tocca la configurazione. */
  const { vive, persi } = useMemo(() => dividiPersi(TUTTE, viste as RigaCrm[]), [TUTTE, viste])

  /* §426 — la riga è una funzione perché si disegna due volte: una per le
     trattative vive e una dentro il blocco dei persi. Copiarla avrebbe
     voluto dire due righe che divergono al primo ritocco. */
  // `adesso` è quello del filtro: la riga e i filtri devono contare dallo stesso istante
  const rigaElenco = (r: RigaCrm) => {
              const scelta = aperta?.id === r.id
              const telefono = typeof r.contact_phone === 'string' ? r.contact_phone : ''
              const referente = typeof r.contact_name === 'string' ? r.contact_name : ''
              const email = typeof r.contact_email === 'string' ? r.contact_email : ''
              const arrivo = quando(r.created_at)
              /* §438 — quando l'abbiamo sentito, con l'ora: «Ieri 09:10» si
                 legge senza fare conti, e decide chi chiamare prima. Senza ora
                 quando nessuno l'ha segnata — mezzanotte non è un orario. */
              const sentito = quandoContatto(r.last_interaction_at as string | null, r.last_interaction_has_time !== false, adesso)
              const fermo = (giorniFa(r.last_interaction_at as string | null, adesso) ?? 0) > 14
              const tentativi = Number(r.tentativi ?? 0)
              const richiamo = quandoContatto(r.next_followup_at as string | null, true, adesso)
              const nota = notaInRiga(r.notes)
              const org = (r.lead_origine ?? {}) as Record<string, string>
              const contorno = [org.piattaforma, org.tipologia, org.tempistica].filter(Boolean).join(' · ')
              return (
                /* La casella è **accanto** al bottone e non dentro: un
                   `<button>` dentro un `<button>` non è valido, e sceglierne
                   uno aprirebbe la scheda invece di spuntare la riga.

                   Compare all'hover, ma lo spazio resta occupato: nasconderla
                   con `hidden` farebbe saltare di lato il nome dell'azienda a
                   ogni passaggio del mouse, su tutte le righe. E resta visibile
                   in tre casi in cui sparire sarebbe un difetto — quando è
                   spuntata (o non si vedrebbe cosa si sta per eliminare),
                   quando ha il fuoco da tastiera, e dove l'hover non esiste
                   (`hover: none`): sul telefono non comparirebbe mai. */
                <div key={r.id}
                  className={`group flex items-center gap-2.5 px-3 transition-colors ${
                    scelta ? 'bg-gold/10' : 'hover:bg-surface-hover'}`}>
                  {puoiEliminare && (
                    <input type="checkbox" checked={selezione.includes(r.id)} onChange={() => scegli(r.id)}
                      aria-label={`Seleziona ${r.company_name || 'il lead senza nome'}`}
                      className="accent-gold w-3.5 h-3.5 cursor-pointer shrink-0 opacity-0 transition-opacity
                        group-hover:opacity-100 focus-visible:opacity-100 checked:opacity-100
                        [@media(hover:none)]:opacity-100" />
                  )}
                <button onClick={() => setAperta(scelta ? null : r)}
                  aria-current={scelta ? 'true' : undefined}
                  className="flex-1 min-w-0 text-left py-2.5">
                  <span className="block min-w-0 text-sm font-semibold text-text-primary truncate">
                    {r.company_name || 'Senza nome'}
                  </span>
                  {/* §376 — referente, email e telefono si leggono senza
                      aprire la scheda: sono le tre cose che servono per
                      decidere se chiamare adesso, e tenerle dietro un clic
                      voleva dire aprire ventinove schede per trovarne una. */}
                  <span className="block text-2xs text-text-secondary truncate mt-0.5">
                    {[referente, telefono, email].filter(Boolean).join(' · ') || 'Nessun recapito'}
                  </span>
                  {/* §426 — la nota si legge senza aprire niente: è il campo
                      che qualcuno ha scritto a mano, e tenerlo dietro un clic
                      voleva dire aprire trenta schede per ritrovare l'unica che
                      diceva qualcosa. Una riga sola: il resto sta nella scheda. */}
                  {nota && (
                    <span className="block text-2xs text-text-primary/80 truncate mt-0.5" title={String(r.notes ?? '')}>
                      {nota}
                    </span>
                  )}
                  <span className="flex items-center gap-2 mt-px">
                    <span className={`text-2xs shrink-0 tabular ${!sentito ? 'text-text-tertiary' : fermo ? 'text-warning' : 'text-text-secondary'}`}
                      title={sentito ? 'Ultimo contatto' : undefined}>
                      {sentito ? `Sentito ${sentito.charAt(0).toLowerCase()}${sentito.slice(1)}` : 'Mai sentito'}
                      {tentativi > 0 && <span className="text-warning"> · {tentativi} a vuoto</span>}
                      {richiamo && <span className="text-gold-text"> · richiamo {richiamo.charAt(0).toLowerCase()}{richiamo.slice(1)}</span>}
                    </span>
                    {contorno && <span className="text-2xs text-text-tertiary truncate">{contorno}</span>}
                    {arrivo && (
                      /* Giorno **e ora**: due lead dello stesso giorno non
                         sono la stessa cosa se uno è arrivato alle nove e
                         l'altro alle ventitré. */
                      <span className="text-2xs text-text-tertiary tabular ml-auto shrink-0">{arrivo}</span>
                    )}
                  </span>
                </button>
                {/* Fuori dal bottone: un `<button>` dentro un `<button>` non è
                    valido, e cliccare il chip aprirebbe la scheda invece di
                    cambiare fase. Qui si salva e basta, senza la conferma del
                    trascinamento (§379): quella serve perché un trascinamento
                    mancato sposta una scheda senza che chi l'ha fatto se ne
                    accorga, mentre questo è un gesto dichiarato. */}
                <MenuFase
                  valore={r.stage as string}
                  etichetta={`Fase di ${r.company_name || 'questo lead'}`}
                  className="shrink-0 max-w-[10rem]"
                  onScegli={fase => { void salva(r, 'stage', fase) }}
                />
                </div>
              )
  }

  return (
    <div className="max-w-none p-4 sm:p-6 space-y-5">
      {/* §373 — la stessa intestazione di Clienti, Progetti e Tracking: titolo,
          la riga di §351 che cambia con l'ora, poi i conteggi. Una sezione che
          si presenta in un modo suo sembra un pezzo attaccato dopo — ed è
          esattamente quello che era. */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-text-primary font-heading">Commerciale</h1>
          <VoceSezione sezione="commerciale" />
          <p className="text-text-secondary text-sm mt-0.5">
            <span className="tabular font-semibold text-text-primary">{viste.length}</span> righe
            {gruppo !== 'tutti' && <> in {ETICHETTA_GRUPPO[gruppo as Gruppo]}</>}
            {t.vinti > 0 && <> · <span className="text-success font-semibold tabular">{t.vinti}</span> clienti</>}
            {t.aperti > 0 && <> · <span className="text-gold-text font-semibold tabular">{t.aperti}</span> ancora aperti</>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* §379 — tre viste, quindi tre bottoni e non un interruttore che
              cicla: con due, «cosa c'è dopo» si indovinava premendo. */}
          <div className="flex items-center border border-border rounded-xl overflow-hidden">
            {([
              ['tabella', 'Elenco', List],
              ['bacheca', 'Bacheca', Columns3],
              ['numeri', 'Numeri', BarChart3],
              ['controllo', 'Controllo', ShieldCheck],
            ] as const).map(([v, etichetta, Icona]) => (
              <button key={v} onClick={() => setVista(v)} aria-pressed={vista === v}
                /* `bg-gold-dim` e non `bg-gold/10`: i token sono
                   `var(--color-*)` senza `<alpha-value>`, quindi le classi
                   con l'opacità non vengono generate e lo stato attivo non
                   si vedrebbe. */
                className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 transition-colors ${
                  vista === v ? 'bg-gold-dim text-gold-text' : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'}`}>
                <Icona className="w-3.5 h-3.5" />{etichetta}
                {v === 'controllo' && daControllare > 0 && (
                  <span className="tabular text-2xs font-bold bg-error-dim text-error px-1.5 rounded-full">
                    {daControllare}
                  </span>
                )}
              </button>
            ))}
          </div>
          {/* L'azione primaria della pagina, quindi piena e con `press` come
              «Nuova task» e «Nuovo Cliente»: l'oro è il riempimento, non
              l'inchiostro (§design system). */}
          {/* «Nuovo lead» viene prima di «Aggiorna»: aggiungere è la cosa
              che si fa più spesso, e il foglio si rilegge da solo di notte. */}
          <button onClick={() => setNuovo(true)}
            className="flex items-center gap-1.5 text-sm font-semibold bg-gold text-on-gold px-4 py-2.5 rounded-xl shadow-soft press">
            <Plus className="w-4 h-4" />Nuovo lead
          </button>
          <button onClick={aggiorna} disabled={aggiorno}
            title="Rilegge il foglio dei lead: inserisce solo le righe nuove, non tocca quelle che ci sono"
            className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary border border-border px-3 py-2 rounded-xl hover:text-text-primary hover:bg-surface-hover transition-colors disabled:opacity-40">
            <RefreshCw className={`w-3.5 h-3.5 ${aggiorno ? 'animate-spin' : ''}`} />
            {aggiorno ? 'Leggo il foglio…' : 'Aggiorna dal foglio'}
          </button>
        </div>
      </div>

      {esitoSync && (
        <p className="text-2xs text-text-secondary bg-surface border border-border rounded-xl px-3 py-2">{esitoSync}</p>
      )}

      {/* Nella vista numeri i filtri non filtrano niente — l'analisi guarda
          tutte le righe — e un controllo che non fa niente si prova due volte
          e poi si smette di credere anche agli altri. Sulla bacheca invece
          servono: il filtro dei gruppi è quello che la porta da dodici
          colonne a quattro. */}
      {vista !== 'controllo' && (
        <BarraFiltri
          stato={stato}
          setStato={setStato}
          leggiQuery={leggiQuery}
          righe={righe as unknown as Record<string, unknown>[]}
          conteggio={{ mostrate: vista === 'numeri' ? perNumeri.length : viste.length, totali: righe.length }}
          /* §431 — nei numeri i gruppi e l'ordinamento non ci sono: un tasso di
             conversione sui soli «aperti» è zero per costruzione, e l'ordine
             delle righe non cambia un conteggio. Cerca e filtri sì. */
          gruppi={vista === 'numeri' ? undefined : (['tutti', ...GRUPPI] as const).map(g => ({
            chiave: g, etichetta: g === 'tutti' ? 'Tutti' : ETICHETTA_GRUPPO[g], quante: perGruppo[g] ?? 0,
          }))}
          conOrdine={vista !== 'numeri'}
          etichette={{ valore: (campo, v) =>
            campo === 'stage' ? etichettaFase(v)
              : campo === 'owners' ? (v === SENZA_OWNER ? 'Nessuno' : nomeDi.get(v) ?? 'Ex collega')
              : campo === 'qualifica' ? (ETICHETTA_QUALIFICA[v] ?? v)
              : campo === 'priority' || campo === 'membership' ? etichettaScelta(campo, v)
              : v }}
        />
      )}

      {vista === 'numeri' ? <CrmAnalytics righe={perNumeri as unknown as RigaAnalisi[]} totale={righe.length} nomeDi={nomeDi} />
      : vista === 'controllo' ? (
        /* §385 — i controlli guardano **tutte** le righe, non quelle
           filtrate: un doppione che sta fuori dalla ricerca è un doppione
           che resta. */
        <CrmControllo righe={righe} onApri={id => { setVista('tabella'); setApertaId(id) }}
          onFatto={() => location.reload()} />
      ) : (
        /* §374 — elenco a sinistra, scheda a destra. Prima era una tabella da
           ventitré colonne che scorreva di lato: fedele a Notion e inutile per
           lavorare. L'elenco adesso mostra **solo quello che serve a decidere
           chi chiamare** — azienda, fase, referente, telefono, provenienza — e
           tutto il resto vive nella scheda, con lo spazio per essere letto.

           Sotto i 1024px la scheda prende tutto lo schermo invece di
           schiacciare l'elenco a una colonna di dieci caratteri. */
        <div className="flex gap-4 items-start">
          {vista === 'bacheca' ? (
            /* §379 — la bacheca prende le **stesse** righe dell'elenco, già
               cercate, filtrate e ordinate: due viste che mostrano insiemi
               diversi sotto gli stessi filtri sono due viste di cui una
               mente. */
            <div className={`flex-1 min-w-0 ${aperta ? 'hidden lg:block' : ''}`}>
              <CrmBacheca
                righe={viste}
                gruppo={gruppo}
                apertaId={apertaId}
                onApri={r => setAperta(apertaId === r.id ? null : r)}
                onSposta={(riga, fase) => setDaSpostare({ riga, fase })}
              />
            </div>
          ) : (
          <div className={`flex-1 min-w-0 border border-border rounded-xl divide-y divide-border overflow-hidden ${aperta ? 'hidden lg:block lg:max-w-md xl:max-w-lg' : ''}`}>
            {puoiEliminare && viste.length > 0 && (
              <div className="flex items-center gap-2.5 px-3 py-1.5 bg-surface">
                <input type="checkbox" checked={tuttiScelti} onChange={scegliTutti}
                  aria-label={tuttiScelti ? 'Deseleziona tutti' : 'Seleziona tutti i lead in elenco'}
                  className="accent-gold w-3.5 h-3.5 cursor-pointer" />
                <span className="text-2xs text-text-tertiary">
                  {selezione.length
                    ? `${selezione.length} selezionat${selezione.length === 1 ? 'o' : 'i'}`
                    : 'Seleziona tutti'}
                </span>
              </div>
            )}
            {vive.map(rigaElenco)}
            {!vive.length && persi.length > 0 && (
              <p className="px-3 py-8 text-center text-sm text-text-tertiary">
                Nessuna trattativa aperta{stato.q || stato.rapida || Object.keys(stato.date).length ? ' con questi filtri' : ''}.
              </p>
            )}

            {/* §426 — i persi sono un terzo dell'archivio e stanno in mezzo a
                quelli vivi: chi scorre li legge, capisce che non servono, e
                ricomincia. Non si nascondono però — una riga che sparisce fa
                credere di averla persa, e riprendere in mano un perso è un
                lavoro vero — quindi si incapsulano, chiusi, col numero sopra. */}
            {persi.length > 0 && (
              <details className="group/persi bg-surface">
                <summary className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none text-xs text-text-secondary hover:text-text-primary">
                  <ChevronRight className="w-3.5 h-3.5 shrink-0 transition-transform group-open/persi:rotate-90" />
                  <span className="font-semibold">Persi</span>
                  <span className="text-2xs text-text-tertiary">
                    {persi.length} {persi.length === 1 ? 'trattativa chiusa senza esito' : 'trattative chiuse senza esito'}
                  </span>
                </summary>
                <div className="divide-y divide-border border-t border-border">
                  {persi.map(rigaElenco)}
                </div>
              </details>
            )}
            {!viste.length && (
              <p className="px-3 py-10 text-center text-sm text-text-tertiary">
                Nessuna riga{stato.q || stato.rapida || Object.keys(stato.date).length ? ' con questi filtri' : ''}.
              </p>
            )}
          </div>
          )}

            {/* §428 — la scheda segue lo scorrimento invece di scivolare via con la
                pagina: si apre una riga in cima e si legge l'elenco sotto, e prima
                bisognava risalire per vederla. `sticky` e non `fixed`: resta dentro
                la colonna, quindi non copre l'elenco e non va spostata a mano quando
                la finestra cambia. L'altezza è la finestra meno l'intestazione
                dell'app; lo scorrimento interno è della scheda (§195: lo scroll è
                della pagina — qui l'eccezione è dichiarata, perché un pannello
                laterale non è il corpo della pagina). */}
          {aperta && (
            <div className="fixed inset-0 z-40 bg-background p-4 lg:sticky lg:top-4 lg:inset-auto lg:z-auto lg:p-0 lg:flex-1 lg:min-w-0 lg:h-[calc(100vh-7rem)]">
              <CrmScheda key={aperta.id}
                riga={aperta}
                pending={pending}
                onChiudi={() => setAperta(null)}
                onSalva={async (campo, valore) => { await salva(aperta, campo, valore) }}
                persone={persone}
                onOwner={puoiAssegnare ? ids => salvaOwner(aperta, ids) : undefined}
                onSalvaExtra={(chiave, v) => salvaExtra(aperta, chiave, v)}
                onConverti={() => setConverto(aperta)}
                onElimina={puoiEliminare ? () => setDaEliminare([aperta.id]) : undefined}
                onDerivati={d => setRighe(rs => rs.map(r => r.id === aperta.id ? { ...r, ...d } : r))}
              />
            </div>
          )}
        </div>
      )}

      {/* Sta sopra tutto e in fondo allo schermo, come in Clienti: agisce su
          righe che possono essere state scelte prima di filtrare, senza
          doverle ritrovare. */}
      {puoiEliminare && selezione.length > 0 && (
        <div className="fixed inset-x-4 bottom-4 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 z-40 flex items-center gap-3 bg-surface border border-border-strong rounded-2xl shadow-pop px-4 py-2.5 animate-slide-up">
          <span className="text-sm font-bold text-text-primary whitespace-nowrap">
            {selezione.length} selezionat{selezione.length === 1 ? 'o' : 'i'}
          </span>
          <button onClick={() => setSelezione([])} className="text-xs text-text-secondary hover:text-text-primary transition-colors">
            Annulla
          </button>
          <button onClick={() => setDaEliminare(selezione)}
            className="ml-auto sm:ml-2 flex items-center gap-1.5 text-sm font-semibold bg-error-dim border border-error/40 text-error px-3 py-1.5 rounded-xl hover:bg-error/20 transition-colors press">
            <Trash2 className="w-3.5 h-3.5" /> Elimina
          </button>
        </div>
      )}

      {daEliminare && daEliminare.length > 0 && (
        <EliminaLead
          nomi={daEliminare.map(id => righe.find(r => r.id === id)?.company_name || 'Senza nome')}
          inAnagrafica={daEliminare.filter(id => righe.find(r => r.id === id)?.client_id).length}
          pending={elimino}
          onAnnulla={() => { if (!elimino) setDaEliminare(null) }}
          onConferma={elimina}
        />
      )}

      {daSpostare && (
        <ConfermaFase
          azienda={daSpostare.riga.company_name || 'Senza nome'}
          da={daSpostare.riga.stage}
          a={daSpostare.fase}
          creaCliente={daSpostare.fase === faseConRuolo('vinto')?.chiave && !daSpostare.riga.client_id}
          pending={sposto}
          onAnnulla={() => { if (!sposto) setDaSpostare(null) }}
          onConferma={confermaSposta}
        />
      )}

      {nuovo && (
        <NuovoLead onChiudi={() => setNuovo(false)} onFatto={() => { setNuovo(false); location.reload() }} />
      )}

      {/* §368 — non un form ridotto: **il** modale di anagrafica, precompilato
          con quello che il lead ha già detto. */}
      {converto && (
        <NewClientModal
          onClose={() => setConverto(null)}
          onCreated={convertito(converto)}
          precompilato={{
            nome: converto.company_name,
            referente: {
              nome: String(converto.contact_name ?? '') || null,
              email: String(converto.contact_email ?? '') || null,
              telefono: String(converto.contact_phone ?? '') || null,
            },
          }}
        />
      )}
    </div>
  )
}
