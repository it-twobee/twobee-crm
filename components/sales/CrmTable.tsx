'use client'

/**
 * §371 — il CRM commerciale: la tabella di Notion, qui dentro.
 *
 * **Una tabella e non una bacheca**, perché è così che il commerciale la usa:
 * su Notion le righe si scorrono e si modificano in cella, e le colonne sono
 * ventitré. Una bacheca a colonne mostrerebbe bene la fase e male tutto il
 * resto — e il resto è il motivo per cui si apre la pagina.
 *
 * **Le colonne scorrono, non si comprimono.** Ventitré colonne in mille pixel
 * vorrebbero dire ventitré colonne illeggibili: la tabella ha una larghezza
 * sua e si scorre di lato, con l'azienda ancorata a sinistra perché è
 * l'unica cosa che dice di chi stai leggendo la riga. Le colonne di contorno
 * — fatturato, indirizzo, Drive — stanno dietro un interruttore: ci sono, e
 * non sono fra te e il telefono di chi devi chiamare.
 */

import { useState, useMemo, useTransition } from 'react'
import { toast } from 'sonner'
import { Search, Loader2, RefreshCw, BarChart3, List, ArrowUpDown, SlidersHorizontal, X, Plus, Trash2 } from 'lucide-react'

import { FASI, GRUPPI, ETICHETTA_GRUPPO, classiFase, etichettaFase } from '@/lib/sales-stages'
import { salvaCellaDeal, collegaLeadACliente, aggiornaDaFoglio, eliminaLead } from '@/app/actions/sales'
import { NewClientModal } from '@/components/clients/NewClientModal'
import type { Client } from '@/lib/types/database'
import { CrmScheda } from './CrmScheda'
import { EliminaLead } from './EliminaLead'
import { NuovoLead } from './NuovoLead'
import { CrmAnalytics } from './CrmAnalytics'
import { tassoDi, type RigaAnalisi } from '@/lib/sales-analytics'
import {
  ordina, applica, cerca as cercaIn, opzioni, quantiFiltri,
  ORDINABILI, FILTRABILI, type Verso, type Scelte,
} from '@/lib/sales-filtri'
import { VoceSezione } from '@/components/workspace/VoceSezione'

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

export function CrmTable({ righe: iniziali, puoiEliminare = false }: {
  righe: RigaCrm[]
  /** §378 — admin e manager. Chi non può non vede le caselle, non le vede spente */
  puoiEliminare?: boolean
}) {
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
  const [vista, setVista] = useState<'tabella' | 'numeri'>('tabella')
  const [aggiorno, setAggiorno] = useState(false)
  const [esitoSync, setEsitoSync] = useState<string | null>(null)
  /* La selezione vive sugli **id** e non sulle righe, come in Clienti: una
     riga eliminata esce da sé invece di restare a gonfiare il contatore di
     una barra che agirebbe su niente. */
  const [selezione, setSelezione] = useState<string[]>([])
  /** id in attesa di conferma: uno solo dalla scheda, N dalla selezione */
  const [daEliminare, setDaEliminare] = useState<string[] | null>(null)
  const [elimino, setElimino] = useState(false)
  const [pending, start] = useTransition()

  /* Gli stessi numeri del pannello, in testata: chi apre la pagina vede
     subito quanti clienti e quanti aperti, come in Clienti vede il canone. */
  const t = useMemo(() => tassoDi(righe as unknown as RigaAnalisi[]), [righe])
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
    if (gruppo !== 'tutti') out = out.filter(r => FASI.find(f => f.chiave === r.stage)?.gruppo === gruppo)
    out = applica(out, scelte)
    return ordina(out, campoOrd, verso) as unknown as RigaCrm[]
  }, [righe, cerca, gruppo, scelte, campoOrd, verso])

  /* Il conteggio per fase si fa sulle righe **filtrate dalla ricerca** ma non
     dal gruppo: altrimenti scegliendo un gruppo gli altri direbbero zero, e
     il numero accanto al filtro serve proprio a sapere quanto c'è di là. */
  const perGruppo = useMemo(() => {
    const base = applica(cercaIn(righe as unknown as Record<string, unknown>[], cerca), scelte)
    const conta: Record<string, number> = { tutti: base.length }
    for (const g of GRUPPI) conta[g] = base.filter(r => FASI.find(f => f.chiave === r.stage)?.gruppo === g).length
    return conta
  }, [righe, cerca, scelte])

  const salva = async (riga: RigaCrm, campo: string, valore: unknown) => {
    const prima = riga[campo]
    // ottimistico: chi modifica venti celle di fila non aspetta venti volte
    setRighe(rs => rs.map(r => r.id === riga.id ? { ...r, [campo]: valore } : r))
    try {
      const { valore: confermato } = await salvaCellaDeal(riga.id, campo, valore)
      setRighe(rs => rs.map(r => r.id === riga.id ? { ...r, [campo]: confermato } : r))
    } catch (e) {
      // il database ha ancora il valore di prima: la cella deve dire quello
      setRighe(rs => rs.map(r => r.id === riga.id ? { ...r, [campo]: prima } : r))
      toast.error((e as Error).message)
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
          ? { ...r, client_id: cliente.id, stage: 'active_client' } : r))
        toast.success(`${cliente.company_name} è in anagrafica`)
        setConverto(null)
      } catch (e) { toast.error((e as Error).message) }
    })
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
            {gruppo !== 'tutti' && <> in {ETICHETTA_GRUPPO[gruppo as 'todo']}</>}
            {t.vinti > 0 && <> · <span className="text-success font-semibold tabular">{t.vinti}</span> clienti</>}
            {t.aperti > 0 && <> · <span className="text-gold-text font-semibold tabular">{t.aperti}</span> ancora aperti</>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setVista(v => v === 'tabella' ? 'numeri' : 'tabella')}
            className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary border border-border px-3 py-2 rounded-xl hover:text-text-primary hover:bg-surface-hover transition-colors">
            {vista === 'tabella' ? <><BarChart3 className="w-3.5 h-3.5" />Numeri</> : <><List className="w-3.5 h-3.5" />Elenco</>}
          </button>
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
          e poi si smette di credere anche agli altri. */}
      {vista === 'tabella' && (
      <div className="flex items-center gap-2 flex-wrap">
        <label className="relative flex-1 min-w-48 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" aria-hidden />
          <input value={cerca} onChange={e => setCerca(e.target.value)} aria-label="Cerca fra i lead"
            placeholder="Azienda, referente, telefono…"
            className="w-full bg-surface border border-border-interactive rounded-xl pl-8 pr-3 py-2 text-sm text-text-primary" />
        </label>
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
      {vista === 'tabella' && pannello && (
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
                        {f.campo === 'stage' ? etichettaFase(o.valore) : o.valore}
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

      {vista === 'numeri' ? <CrmAnalytics righe={righe as unknown as RigaAnalisi[]} /> : (
        /* §374 — elenco a sinistra, scheda a destra. Prima era una tabella da
           ventitré colonne che scorreva di lato: fedele a Notion e inutile per
           lavorare. L'elenco adesso mostra **solo quello che serve a decidere
           chi chiamare** — azienda, fase, referente, telefono, provenienza — e
           tutto il resto vive nella scheda, con lo spazio per essere letto.

           Sotto i 1024px la scheda prende tutto lo schermo invece di
           schiacciare l'elenco a una colonna di dieci caratteri. */
        <div className="flex gap-4 items-start">
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
            {viste.map(r => {
              const scelta = aperta?.id === r.id
              const telefono = typeof r.contact_phone === 'string' ? r.contact_phone : ''
              const referente = typeof r.contact_name === 'string' ? r.contact_name : ''
              const email = typeof r.contact_email === 'string' ? r.contact_email : ''
              const arrivo = quando(r.created_at)
              const org = (r.lead_origine ?? {}) as Record<string, string>
              const contorno = [org.piattaforma, org.tipologia, org.tempistica].filter(Boolean).join(' · ')
              return (
                /* La casella è **accanto** al bottone e non dentro: un
                   `<button>` dentro un `<button>` non è valido, e sceglierne
                   uno aprirebbe la scheda invece di spuntare la riga. */
                <div key={r.id}
                  className={`flex items-start gap-2.5 px-3 transition-colors ${
                    scelta ? 'bg-gold/10' : 'hover:bg-surface-hover'}`}>
                  {puoiEliminare && (
                    <input type="checkbox" checked={selezione.includes(r.id)} onChange={() => scegli(r.id)}
                      aria-label={`Seleziona ${r.company_name || 'il lead senza nome'}`}
                      className="accent-gold w-3.5 h-3.5 cursor-pointer mt-3 shrink-0" />
                  )}
                <button onClick={() => setAperta(scelta ? null : r)}
                  aria-current={scelta ? 'true' : undefined}
                  className="flex-1 min-w-0 text-left py-2.5">
                  <span className="flex items-center gap-2">
                    <span className="flex-1 min-w-0 text-sm font-semibold text-text-primary truncate">
                      {r.company_name || 'Senza nome'}
                    </span>
                    <span className={`text-2xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${classiFase(r.stage)}`}>
                      {etichettaFase(r.stage)}
                    </span>
                  </span>
                  {/* §376 — referente, email e telefono si leggono senza
                      aprire la scheda: sono le tre cose che servono per
                      decidere se chiamare adesso, e tenerle dietro un clic
                      voleva dire aprire ventinove schede per trovarne una. */}
                  <span className="block text-2xs text-text-secondary truncate mt-0.5">
                    {[referente, telefono, email].filter(Boolean).join(' · ') || 'Nessun recapito'}
                  </span>
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
                </div>
              )
            })}
            {!viste.length && (
              <p className="px-3 py-10 text-center text-sm text-text-tertiary">
                Nessuna riga{cerca ? ' per questa ricerca' : ''}.
              </p>
            )}
          </div>

          {aperta && (
            <div className="fixed inset-0 z-40 bg-background p-4 lg:static lg:inset-auto lg:z-auto lg:p-0 lg:flex-1 lg:min-w-0 lg:max-h-[calc(100vh-14rem)]">
              <CrmScheda
                riga={aperta}
                pending={pending}
                onChiudi={() => setAperta(null)}
                onSalva={(campo, valore) => salva(aperta, campo, valore)}
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
