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

import { useState, useMemo, useTransition } from 'react'
import { toast } from 'sonner'
import { Search, Loader2, RefreshCw, BarChart3, List, Columns3, ShieldCheck, ArrowUpDown, SlidersHorizontal, X, Plus, Trash2, ChevronRight } from 'lucide-react'

import { ETICHETTA_GRUPPO, GRUPPI, gruppoDi, type Gruppo } from '@/lib/sales-stages'
import { useFasi } from './FasiContext'
import { MenuFase } from './MenuFase'
import { dividiPersi, notaInRiga } from '@/lib/sales-elenco'
import { salvaCellaDeal, collegaLeadACliente, aggiornaDaFoglio, eliminaLead, impostaOwnerDeal } from '@/app/actions/sales'
import { ETICHETTA_QUALIFICA } from '@/lib/sales-table'
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
import {
  ordina, applica, cerca as cercaIn, opzioni, quantiFiltri,
  ORDINABILI, FILTRABILI, SENZA_OWNER, type Verso, type Scelte,
} from '@/lib/sales-filtri'
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

export function CrmTable({ righe: iniziali, puoiEliminare = false, persone = [], puoiAssegnare = false }: {
  righe: RigaCrm[]
  persone?: PersonaCrm[]
  /** §430 — admin e manager: gli owner li decide chi assegna il lavoro */
  puoiAssegnare?: boolean
  /** §378 — admin e manager. Chi non può non vede le caselle, non le vede spente */
  puoiEliminare?: boolean
}) {
  const { TUTTE, FASI, etichettaFase, faseConRuolo, etichettaScelta, ORDINI } = useFasi()
  const [righe, setRighe] = useState(iniziali)
  const [cerca, setCerca] = useState('')
  const [gruppo, setGruppo] = useState<string>('tutti')
  const [converto, setConverto] = useState<RigaCrm | null>(null)
  const [apertaId, setApertaId] = useState<string | null>(null)
  const [campoOrd, setCampoOrd] = useState('created_at')
  const [verso, setVerso] = useState<Verso>('giu')
  const [scelte, setScelte] = useState<Scelte>({})
  const [pannello, setPannello] = useState(false)
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
  const attivi = quantiFiltri(scelte)
  const aperta = apertaId ? righe.find(r => r.id === apertaId) ?? null : null
  const setAperta = (r: RigaCrm | null) => setApertaId(r?.id ?? null)

  /* §376 — cercare, filtrare, ordinare: in quest'ordine, e tutto e tre nel
     modulo puro. Il gruppo resta un filtro a parte perché è l'unico che si
     usa a colpo d'occhio, senza aprire niente. */
  const viste = useMemo(() => {
    let out = cercaIn(righe as unknown as Record<string, unknown>[], cerca)
    if (gruppo !== 'tutti') { const g = gruppo as Gruppo; out = out.filter(r => { const f = FASI.find(x => x.chiave === r.stage); return f ? gruppoDi(f) === g : false }) }
    out = applica(out, scelte)
    return ordina(TUTTE, out, campoOrd, verso, ORDINI) as unknown as RigaCrm[]
  }, [righe, cerca, gruppo, scelte, campoOrd, verso, ORDINI])

  /* Il conteggio per fase si fa sulle righe **filtrate dalla ricerca** ma non
     dal gruppo: altrimenti scegliendo un gruppo gli altri direbbero zero, e
     il numero accanto al filtro serve proprio a sapere quanto c'è di là. */
  const perGruppo = useMemo(() => {
    const base = applica(cercaIn(righe as unknown as Record<string, unknown>[], cerca), scelte)
    const conta: Record<string, number> = { tutti: base.length }
    for (const g of GRUPPI) conta[g] = base.filter(r => { const f = FASI.find(x => x.chiave === r.stage); return f ? gruppoDi(f) === g : false }).length
    return conta
  }, [righe, cerca, scelte])

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
    () => applica(cercaIn(righe as unknown as Record<string, unknown>[], cerca), scelte),
    [righe, cerca, scelte])

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
  const rigaElenco = (r: RigaCrm) => {
              const scelta = aperta?.id === r.id
              const telefono = typeof r.contact_phone === 'string' ? r.contact_phone : ''
              const referente = typeof r.contact_name === 'string' ? r.contact_name : ''
              const email = typeof r.contact_email === 'string' ? r.contact_email : ''
              const arrivo = quando(r.created_at)
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
      <div className="flex items-center gap-2 flex-wrap">
        <label className="relative flex-1 min-w-48 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" aria-hidden />
          <input value={cerca} onChange={e => setCerca(e.target.value)} aria-label="Cerca fra i lead"
            placeholder="Azienda, referente, telefono…"
            className="w-full bg-surface border border-border-interactive rounded-xl pl-8 pr-3 py-2 text-sm text-text-primary" />
        </label>
        {/* §431 — nei numeri i gruppi e l'ordinamento non ci sono: un tasso di
            conversione sui soli «aperti» è zero per costruzione, e l'ordine
            delle righe non cambia un conteggio. Cerca e filtri sì. */}
        {vista !== 'numeri' && <>
        {(['tutti', ...GRUPPI] as const).map(g => (
          <button key={g} onClick={() => setGruppo(g)}
            className={`text-xs font-semibold px-3 py-2 rounded-xl border transition-colors ${
              gruppo === g ? 'border-gold/40 bg-gold/10 text-gold-text' : 'border-border text-text-secondary hover:text-text-primary'}`}>
            {g === 'tutti' ? 'Tutti' : ETICHETTA_GRUPPO[g]}
            <span className="ml-1.5 tabular text-text-tertiary">{perGruppo[g] ?? 0}</span>
          </button>
        ))}

        {/* §376 — ordinare su qualunque colonna. Il verso è un bottone a
            parte e non due voci nel menu: raddoppierebbe un elenco già lungo
            per dire una cosa che è sì/no. */}
        <label className="flex items-center gap-1.5 text-xs text-text-secondary">
          <ArrowUpDown className="w-3.5 h-3.5 shrink-0" aria-hidden />
          <select value={campoOrd} onChange={e => setCampoOrd(e.target.value)} aria-label="Ordina per"
            className="bg-surface border border-border-interactive rounded-xl px-2 py-2 text-xs text-text-primary">
            {ORDINABILI.map(c => <option key={c.campo} value={c.campo}>{c.etichetta}</option>)}
          </select>
        </label>
        <button onClick={() => setVerso(v => v === 'su' ? 'giu' : 'su')}
          aria-label={verso === 'su' ? 'Ordine crescente, premi per invertire' : 'Ordine decrescente, premi per invertire'}
          className="text-xs font-semibold text-text-secondary border border-border px-3 py-2 rounded-xl hover:text-text-primary transition-colors">
          {verso === 'su' ? '↑' : '↓'}
        </button>

        </>}

        <button onClick={() => setPannello(p => !p)}
          className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border transition-colors ${
            attivi ? 'border-gold/40 bg-gold/10 text-gold-text' : 'border-border text-text-secondary hover:text-text-primary'}`}>
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Filtri{attivi > 0 && <span className="tabular">{attivi}</span>}
        </button>
        {attivi > 0 && (
          <button onClick={() => setScelte({})}
            className="flex items-center gap-1 text-xs text-text-tertiary hover:text-text-primary">
            <X className="w-3.5 h-3.5" />Azzera
          </button>
        )}
      </div>
      )}

      {/* Un riquadro per variabile, con i valori che **esistono davvero** e
          quanti sono: offrire un valore che nessuna riga ha porta a zero
          risultati, e si impara in fretta a non usare i filtri. */}
      {vista !== 'controllo' && pannello && (
        <div className="border border-border rounded-xl p-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FILTRABILI.map(f => {
            const ops = opzioni(righe as unknown as Record<string, unknown>[], f)
            if (!ops.length) return null
            const scelti = scelte[f.campo] ?? []
            return (
              <div key={f.campo}>
                <p className="text-2xs font-semibold text-text-tertiary uppercase tracking-wide mb-1.5">{f.etichetta}</p>
                <div className="flex flex-wrap gap-1">
                  {ops.map(o => {
                    const on = scelti.includes(o.valore)
                    return (
                      <button key={o.valore}
                        onClick={() => setScelte(p => ({
                          ...p,
                          [f.campo]: on ? scelti.filter(x => x !== o.valore) : [...scelti, o.valore],
                        }))}
                        aria-pressed={on}
                        className={`text-2xs px-2 py-1 rounded-lg border transition-colors ${
                          on ? 'border-gold/40 bg-gold/10 text-gold-text' : 'border-border text-text-secondary hover:text-text-primary'}`}>
                        {f.campo === 'stage' ? etichettaFase(o.valore)
                          : f.campo === 'owners' ? (o.valore === SENZA_OWNER ? 'Nessuno' : nomeDi.get(o.valore) ?? 'Ex collega')
                          : f.campo === 'qualifica' ? (ETICHETTA_QUALIFICA[o.valore] ?? o.valore)
                          : f.campo === 'priority' || f.campo === 'membership' ? etichettaScelta(f.campo, o.valore)
                          : o.valore}
                        <span className="ml-1 tabular text-text-tertiary">{o.quante}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
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
                Nessuna trattativa aperta{cerca ? ' per questa ricerca' : ''}.
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
                Nessuna riga{cerca ? ' per questa ricerca' : ''}.
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
                onConverti={() => setConverto(aperta)}
                onElimina={puoiEliminare ? () => setDaEliminare([aperta.id]) : undefined}
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
