'use client'

/**
 * §374 — la scheda di un lead: tutti i campi, larghi, in cinque riquadri.
 *
 * La tabella di prima aveva ventitré colonne a `text-2xs` che scorrevano di
 * lato: fedele a Notion e inutile per lavorare. Qui l'elenco mostra solo
 * quello che serve a decidere chi chiamare, e **tutto il resto vive qui** —
 * con lo spazio per essere letto e modificato senza mirare a una cella alta
 * venti pixel.
 *
 * I riquadri seguono **cosa stai facendo**, non l'ordine alfabetico
 * dell'export: chi chiamare, a che punto è, com'è fatta l'azienda, come
 * l'abbiamo classificata, da dove arriva. Gli ultimi due si guardano una
 * volta ogni tanto e stanno in fondo.
 *
 * La provenienza Meta è in fondo e **non si tocca**: è quello che il foglio
 * ha detto, ed è l'unico riferimento a com'era la riga prima che qualcuno la
 * lavorasse.
 */

import { X, UserPlus, Loader2, ExternalLink, Trash2 } from 'lucide-react'
import { COLONNE, GRUPPI_SCHEDA, TITOLO_GRUPPO, type Colonna } from '@/lib/sales-table'
import { CrmCella } from './CrmCella'
import type { RigaCrm } from './CrmTable'
import { SalesFollowUps } from './SalesFollowUps'
import { useFasi } from './FasiContext'

const ORIGINE: [string, string][] = [
  ['piattaforma', 'Piattaforma'], ['campagna', 'Campagna'], ['adset', 'Adset'],
  ['annuncio', 'Annuncio'], ['form', 'Modulo'], ['tipologia', 'Tipo di attività'],
  ['fatturato_dichiarato', 'Fatturato dichiarato'], ['tempistica', 'Quando vuole partire'],
]

function Riquadro({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return (
    <section className="border border-border rounded-xl overflow-hidden">
      <h3 className="px-3 py-2 text-2xs font-semibold text-text-tertiary uppercase tracking-wide border-b border-border">
        {titolo}
      </h3>
      <div className="divide-y divide-border">{children}</div>
    </section>
  )
}

/** etichetta a sinistra, valore a destra: si scorre con l'occhio, non si cerca */
function Campo({ colonna, riga, onSalva }: {
  colonna: Colonna
  riga: RigaCrm
  onSalva: (campo: string, valore: unknown) => Promise<void>
}) {
  return (
    <div className="flex items-start gap-3 px-3 py-2">
      <span className="w-32 shrink-0 text-2xs text-text-tertiary pt-0.5">{colonna.etichetta}</span>
      <div className="flex-1 min-w-0">
        <CrmCella colonna={colonna} valore={riga[colonna.campo]}
          onSalva={v => onSalva(colonna.campo, v)} />
      </div>
    </div>
  )
}

export function CrmScheda({ riga, onChiudi, onSalva, onConverti, onElimina, pending }: {
  riga: RigaCrm
  onChiudi: () => void
  onSalva: (campo: string, valore: unknown) => Promise<void>
  onConverti: () => void
  /** assente per chi non può eliminare: il bottone non c'è, non è spento */
  onElimina?: () => void
  pending: boolean
}) {
  const { classiFase, etichettaFase } = useFasi()
  const origine = (riga.lead_origine ?? {}) as Record<string, string>
  const voci = ORIGINE.filter(([k]) => origine[k])

  return (
    <aside
      aria-label={`Scheda di ${riga.company_name ?? 'lead'}`}
      className="flex flex-col h-full bg-surface border border-border rounded-xl overflow-hidden"
    >
      <header className="flex items-start gap-3 px-4 py-3 border-b border-border shrink-0">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-text-primary font-heading truncate">
            {riga.company_name || 'Senza nome'}
          </h2>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className={`text-2xs font-semibold px-2 py-0.5 rounded-full ${classiFase(riga.stage)}`}>
              {etichettaFase(riga.stage)}
            </span>
            {typeof riga.priority === 'string' && riga.priority && (
              <span className="text-2xs text-text-secondary">{riga.priority}</span>
            )}
            {riga.client_id ? <span className="text-2xs text-success">in anagrafica</span> : null}
          </div>
        </div>
        <button onClick={onChiudi} aria-label="Chiudi la scheda"
          className="text-text-tertiary hover:text-text-primary shrink-0 -mr-1 p-1">
          <X className="w-4 h-4" />
        </button>
      </header>

      {/* Le azioni che si fanno dal telefono in mano stanno in alto, non in
          fondo a una scheda da scorrere. */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border shrink-0 flex-wrap">
        {typeof riga.contact_phone === 'string' && riga.contact_phone && (
          <a href={`tel:${riga.contact_phone.replace(/\s/g, '')}`}
            className="text-xs font-semibold text-gold-text border border-gold/30 px-3 py-1.5 rounded-xl hover:bg-gold/10 transition-colors">
            Chiama
          </a>
        )}
        {typeof riga.contact_email === 'string' && riga.contact_email && (
          <a href={`mailto:${riga.contact_email}`}
            className="text-xs font-semibold text-text-secondary border border-border px-3 py-1.5 rounded-xl hover:text-text-primary transition-colors">
            Scrivi
          </a>
        )}
        {!riga.client_id && (
          <button onClick={onConverti} disabled={pending}
            className="flex items-center gap-1.5 text-xs font-semibold bg-gold text-on-gold px-3 py-1.5 rounded-xl shadow-soft press disabled:opacity-40 ml-auto">
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
            Lead convertito
          </button>
        )}
        {/* §378 — in fondo alla riga e in rosso soltanto di bordo: eliminare
            è la sola azione qui dentro che nessun'altra rimette a posto, ma
            un bottone pieno accanto a «Chiama» si preme per sbaglio. */}
        {onElimina && (
          <button onClick={onElimina} disabled={pending}
            aria-label={`Elimina il lead ${riga.company_name ?? ''}`.trim()}
            className={`flex items-center gap-1.5 text-xs font-semibold text-error border border-error/30 px-3 py-1.5 rounded-xl hover:bg-error-dim transition-colors disabled:opacity-40 ${riga.client_id ? 'ml-auto' : ''}`}>
            <Trash2 className="w-3.5 h-3.5" />Elimina
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <SalesFollowUps key={riga.id} dealId={riga.id} company={riga.company_name || 'Lead'}
          email={typeof riga.contact_email === 'string' ? riga.contact_email : null} />
        {GRUPPI_SCHEDA.filter(g => g !== 'provenienza').map(g => (
          <Riquadro key={g} titolo={TITOLO_GRUPPO[g]}>
            {COLONNE.filter(c => c.gruppo === g).map(c => (
              <Campo key={c.campo} colonna={c} riga={riga} onSalva={onSalva} />
            ))}
          </Riquadro>
        ))}

        <Riquadro titolo={TITOLO_GRUPPO.provenienza}>
          {COLONNE.filter(c => c.gruppo === 'provenienza').map(c => (
            <Campo key={c.campo} colonna={c} riga={riga} onSalva={onSalva} />
          ))}
          {/* Quello che ha detto Meta: si legge per capire da dove è arrivato,
              e non si modifica — riscriverlo perderebbe l'unico riferimento. */}
          {voci.map(([k, etichetta]) => (
            <div key={k} className="flex items-start gap-3 px-3 py-2">
              <span className="w-32 shrink-0 text-2xs text-text-tertiary">{etichetta}</span>
              <span className="flex-1 min-w-0 text-2xs text-text-secondary break-words">{origine[k]}</span>
            </div>
          ))}
          {typeof riga.drive_url === 'string' && riga.drive_url && (
            <a href={riga.drive_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 text-2xs text-gold-text hover:underline">
              <ExternalLink className="w-3 h-3" />Cartella Drive
            </a>
          )}
        </Riquadro>
      </div>
    </aside>
  )
}
