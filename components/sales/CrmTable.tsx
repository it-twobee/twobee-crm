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
import { Search, Loader2, RefreshCw, BarChart3, List } from 'lucide-react'

import { FASI, GRUPPI, ETICHETTA_GRUPPO, classiFase, etichettaFase } from '@/lib/sales-stages'
import { salvaCellaDeal, collegaLeadACliente, aggiornaDaFoglio } from '@/app/actions/sales'
import { NewClientModal } from '@/components/clients/NewClientModal'
import type { Client } from '@/lib/types/database'
import { CrmScheda } from './CrmScheda'
import { CrmAnalytics } from './CrmAnalytics'
import { tassoDi, type RigaAnalisi } from '@/lib/sales-analytics'
import { VoceSezione } from '@/components/workspace/VoceSezione'

export type RigaCrm = Record<string, unknown> & {
  id: string
  company_name: string | null
  stage: string
  client_id: string | null
}

export function CrmTable({ righe: iniziali }: { righe: RigaCrm[] }) {
  const [righe, setRighe] = useState(iniziali)
  const [cerca, setCerca] = useState('')
  const [gruppo, setGruppo] = useState<string>('tutti')
  const [converto, setConverto] = useState<RigaCrm | null>(null)
  const [apertaId, setApertaId] = useState<string | null>(null)
  const [vista, setVista] = useState<'tabella' | 'numeri'>('tabella')
  const [aggiorno, setAggiorno] = useState(false)
  const [esitoSync, setEsitoSync] = useState<string | null>(null)
  const [pending, start] = useTransition()

  /* Gli stessi numeri del pannello, in testata: chi apre la pagina vede
     subito quanti clienti e quanti aperti, come in Clienti vede il canone. */
  const t = useMemo(() => tassoDi(righe as unknown as RigaAnalisi[]), [righe])
  /* La scheda si tiene per **id**, non per oggetto: salvando una cella la riga
     viene ricreata, e un riferimento vecchio mostrerebbe il valore di prima
     accanto a quello nuovo nell'elenco. */
  const aperta = apertaId ? righe.find(r => r.id === apertaId) ?? null : null
  const setAperta = (r: RigaCrm | null) => setApertaId(r?.id ?? null)

  const viste = useMemo(() => {
    const q = cerca.trim().toLowerCase()
    return righe.filter(r => {
      if (gruppo !== 'tutti' && FASI.find(f => f.chiave === r.stage)?.gruppo !== gruppo) return false
      if (!q) return true
      return ['company_name', 'contact_name', 'contact_email', 'contact_phone', 'referral', 'owner_name']
        .some(c => String(r[c] ?? '').toLowerCase().includes(q))
    })
  }, [righe, cerca, gruppo])

  /* Il conteggio per fase si fa sulle righe **filtrate dalla ricerca** ma non
     dal gruppo: altrimenti scegliendo un gruppo gli altri direbbero zero, e
     il numero accanto al filtro serve proprio a sapere quanto c'è di là. */
  const perGruppo = useMemo(() => {
    const q = cerca.trim().toLowerCase()
    const base = q
      ? righe.filter(r => ['company_name', 'contact_name', 'contact_email']
          .some(c => String(r[c] ?? '').toLowerCase().includes(q)))
      : righe
    const conta: Record<string, number> = { tutti: base.length }
    for (const g of GRUPPI) conta[g] = base.filter(r => FASI.find(f => f.chiave === r.stage)?.gruppo === g).length
    return conta
  }, [righe, cerca])

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
      setEsitoSync(`${e.nuovi} nuovi · ${e.giaPresenti} già presenti · ${e.scartati} scartati (prove o senza azienda)`)
      if (e.nuovi) { toast.success(`${e.nuovi} lead importati`); location.reload() }
      else toast.success('Nessun lead nuovo: il foglio è allineato')
    } catch (err) {
      const m = (err as Error).message
      setEsitoSync(m); toast.error(m)
    } finally { setAggiorno(false) }
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
          <button onClick={aggiorna} disabled={aggiorno}
            title="Rilegge il foglio dei lead: inserisce solo le righe nuove, non tocca quelle che ci sono"
            className="flex items-center gap-1.5 text-sm font-semibold bg-gold text-on-gold px-4 py-2.5 rounded-xl shadow-soft press disabled:opacity-40">
            <RefreshCw className={`w-4 h-4 ${aggiorno ? 'animate-spin' : ''}`} />
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
            {viste.map(r => {
              const scelta = aperta?.id === r.id
              const telefono = typeof r.contact_phone === 'string' ? r.contact_phone : ''
              const referente = typeof r.contact_name === 'string' ? r.contact_name : ''
              const org = (r.lead_origine ?? {}) as Record<string, string>
              const contorno = [org.piattaforma, org.tipologia, org.tempistica].filter(Boolean).join(' · ')
              return (
                <button key={r.id} onClick={() => setAperta(scelta ? null : r)}
                  aria-current={scelta ? 'true' : undefined}
                  className={`w-full text-left px-3 py-2.5 transition-colors ${
                    scelta ? 'bg-gold/10' : 'hover:bg-surface-hover'}`}>
                  <span className="flex items-center gap-2">
                    <span className="flex-1 min-w-0 text-sm font-semibold text-text-primary truncate">
                      {r.company_name || 'Senza nome'}
                    </span>
                    <span className={`text-2xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${classiFase(r.stage)}`}>
                      {etichettaFase(r.stage)}
                    </span>
                  </span>
                  <span className="block text-2xs text-text-secondary truncate mt-0.5">
                    {[referente, telefono].filter(Boolean).join(' · ') || 'Nessun recapito'}
                  </span>
                  {contorno && (
                    <span className="block text-2xs text-text-tertiary truncate mt-px">{contorno}</span>
                  )}
                </button>
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
              />
            </div>
          )}
        </div>
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
