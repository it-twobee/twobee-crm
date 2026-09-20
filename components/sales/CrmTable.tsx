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
import { Search, Columns3, UserPlus, Loader2, RefreshCw, BarChart3, Table2 } from 'lucide-react'
import { COLONNE, COLONNE_PRINCIPALI, type Colonna } from '@/lib/sales-table'
import { FASI, GRUPPI, ETICHETTA_GRUPPO, classiFase, etichettaFase, fasiDelGruppo } from '@/lib/sales-stages'
import { salvaCellaDeal, collegaLeadACliente, aggiornaDaFoglio } from '@/app/actions/sales'
import { NewClientModal } from '@/components/clients/NewClientModal'
import type { Client } from '@/lib/types/database'
import { CrmCella } from './CrmCella'
import { CrmAnalytics } from './CrmAnalytics'
import type { RigaAnalisi } from '@/lib/sales-analytics'

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
  const [tutteLeColonne, setTutteLeColonne] = useState(false)
  const [converto, setConverto] = useState<RigaCrm | null>(null)
  const [vista, setVista] = useState<'tabella' | 'numeri'>('tabella')
  const [aggiorno, setAggiorno] = useState(false)
  const [esitoSync, setEsitoSync] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const colonne: Colonna[] = tutteLeColonne ? COLONNE : COLONNE_PRINCIPALI

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
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-text-primary font-heading">Commerciale</h1>
          <p className="text-sm text-text-secondary mt-1">
            <span className="tabular font-semibold text-text-primary">{viste.length}</span> righe
            {gruppo !== 'tutti' && <> in {ETICHETTA_GRUPPO[gruppo as 'todo']}</>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setVista(v => v === 'tabella' ? 'numeri' : 'tabella')}
            className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary border border-border px-3 py-1.5 rounded-lg hover:text-text-primary transition-colors">
            {vista === 'tabella' ? <><BarChart3 className="w-3.5 h-3.5" />Numeri</> : <><Table2 className="w-3.5 h-3.5" />Tabella</>}
          </button>
          {vista === 'tabella' && (
            <button onClick={() => setTutteLeColonne(v => !v)}
              className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary border border-border px-3 py-1.5 rounded-lg hover:text-text-primary transition-colors">
              <Columns3 className="w-3.5 h-3.5" />
              {tutteLeColonne ? `${COLONNE_PRINCIPALI.length} colonne` : `Tutte (${COLONNE.length})`}
            </button>
          )}
          <button onClick={aggiorna} disabled={aggiorno}
            title="Rilegge il foglio dei lead: inserisce solo le righe nuove, non tocca quelle che ci sono"
            className="flex items-center gap-1.5 text-xs font-semibold text-gold-text border border-gold/30 px-3 py-1.5 rounded-lg hover:bg-gold/10 transition-colors disabled:opacity-40">
            <RefreshCw className={`w-3.5 h-3.5 ${aggiorno ? 'animate-spin' : ''}`} />
            {aggiorno ? 'Leggo il foglio…' : 'Aggiorna dal foglio'}
          </button>
        </div>
      </div>

      {esitoSync && (
        <p className="text-2xs text-text-secondary bg-surface border border-border rounded-lg px-3 py-2">{esitoSync}</p>
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
            className="w-full bg-surface border border-border-interactive rounded-lg pl-8 pr-3 py-2 text-sm text-text-primary" />
        </label>
        {(['tutti', ...GRUPPI] as const).map(g => (
          <button key={g} onClick={() => setGruppo(g)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
              gruppo === g ? 'border-gold/40 bg-gold/10 text-gold-text' : 'border-border text-text-secondary hover:text-text-primary'}`}>
            {g === 'tutti' ? 'Tutti' : ETICHETTA_GRUPPO[g]}
            <span className="ml-1.5 tabular text-text-tertiary">{perGruppo[g] ?? 0}</span>
          </button>
        ))}
      </div>
      )}

      {vista === 'numeri' ? <CrmAnalytics righe={righe as unknown as RigaAnalisi[]} /> : <>
      {/* §371 — `overflow-x-auto`, mai `overflow-hidden`: ventitré colonne non
          entrano in uno schermo e comprimerle le rende tutte illeggibili. */}
      <div className="border border-border rounded-xl overflow-x-auto">
        <table className="w-max min-w-full text-left">
          <thead className="sticky top-0 z-10 bg-surface">
            <tr className="border-b border-border">
              {colonne.map((c, i) => (
                <th key={c.campo} style={{ width: `${c.largh}rem`, minWidth: `${c.largh}rem` }}
                  className={`px-2 py-2 text-2xs font-semibold text-text-tertiary uppercase tracking-wide ${
                    i === 0 ? 'sticky left-0 z-20 bg-surface' : ''}`}>
                  {c.etichetta}
                </th>
              ))}
              <th className="px-2 py-2 w-28 min-w-28" />
            </tr>
          </thead>
          <tbody>
            {viste.map(r => (
              <tr key={r.id} className="border-b border-border last:border-0 hover:bg-surface-hover transition-colors align-top">
                {colonne.map((c, i) => (
                  <td key={c.campo} style={{ width: `${c.largh}rem`, minWidth: `${c.largh}rem` }}
                    className={`px-2 py-1.5 ${i === 0 ? 'sticky left-0 z-10 bg-surface' : ''}`}>
                    <CrmCella colonna={c} valore={r[c.campo]}
                      onSalva={v => salva(r, c.campo, v)} />
                  </td>
                ))}
                <td className="px-2 py-1.5">
                  {r.client_id ? (
                    <span className="text-2xs text-success">in anagrafica</span>
                  ) : (
                    <button onClick={() => setConverto(r)} disabled={pending}
                      className="flex items-center gap-1 text-2xs font-semibold text-gold-text border border-gold/30 px-2 py-1 rounded-lg hover:bg-gold/10 transition-colors disabled:opacity-40">
                      {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
                      Lead convertito
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!viste.length && (
              <tr><td colSpan={colonne.length + 1} className="px-3 py-10 text-center text-sm text-text-tertiary">
                Nessuna riga{cerca ? ' per questa ricerca' : ''}.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      </>}

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
