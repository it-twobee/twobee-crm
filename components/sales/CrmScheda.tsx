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

import { useState } from 'react'
import { Check, X, UserPlus, Loader2, ExternalLink, Trash2, Sparkles, Target, TriangleAlert } from 'lucide-react'
import { COLONNE, GRUPPI_SCHEDA, TITOLO_GRUPPO, colonnaDi, type Colonna } from '@/lib/sales-table'
import { CrmCella } from './CrmCella'
import { MenuFase } from './MenuFase'
import { useFasi } from './FasiContext'
import { campiCheServono, prossimaAzione, suggerimenti } from '@/lib/sales-scheda'
import type { PersonaCrm, RigaCrm } from './CrmTable'
import { SalesFollowUps } from './SalesFollowUps'

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

/**
 * §430 — chi segue il lead. Non è una cella di `deals` ma un elenco
 * (`deal_owners`), quindi non passa da `CrmCella`: in lettura i nomi, e per chi
 * assegna il lavoro l'elenco di chi l'area la vede, da accendere e spegnere.
 * Chi non è più assegnabile resta scritto finché qualcuno non lo toglie —
 * farlo sparire direbbe che il lead non lo seguiva nessuno.
 */
function Owner({ riga, persone, onOwner }: {
  riga: RigaCrm
  persone: PersonaCrm[]
  onOwner?: (ids: string[]) => Promise<void>
}) {
  const [aperto, setAperto] = useState(false)
  const scelti = Array.isArray(riga.owners) ? (riga.owners as string[]) : []
  const nome = (id: string) => persone.find(p => p.id === id)?.nome ?? 'Ex collega'
  const offerte = persone.filter(p => p.assegnabile || scelti.includes(p.id))
  const nomi = scelti.map(nome).join(', ')

  if (!onOwner) return <span className="text-2xs text-text-primary">{nomi || <span className="text-text-tertiary">Nessuno</span>}</span>
  if (!aperto) {
    return (
      <button type="button" onClick={() => setAperto(true)}
        className="block w-full text-left truncate text-2xs text-text-primary hover:text-gold-text">
        {nomi || <span className="text-text-tertiary">Nessuno · assegna</span>}
      </button>
    )
  }
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1">
        {offerte.map(p => {
          const on = scelti.includes(p.id)
          return (
            <button key={p.id} type="button" aria-pressed={on}
              onClick={() => onOwner(on ? scelti.filter(x => x !== p.id) : [...scelti, p.id])}
              className={`flex items-center gap-1 text-2xs px-2 py-1 rounded-lg border transition-colors ${
                on ? 'border-gold/40 bg-gold/10 text-gold-text' : 'border-border text-text-secondary hover:text-text-primary'}`}>
              {on && <Check className="w-3 h-3" aria-hidden />}{p.nome}
            </button>
          )
        })}
      </div>
      <button type="button" onClick={() => setAperto(false)} className="text-2xs text-text-tertiary hover:text-text-primary">Fatto</button>
    </div>
  )
}

type Extra = { persone: PersonaCrm[]; onOwner?: (ids: string[]) => Promise<void> }

/** etichetta a sinistra, valore a destra: si scorre con l'occhio, non si cerca */
function Campo({ colonna, riga, onSalva, persone, onOwner }: {
  colonna: Colonna
  riga: RigaCrm
  onSalva: (campo: string, valore: unknown) => Promise<void>
} & Extra) {
  return (
    <div className="flex items-start gap-3 px-3 py-2">
      <span className="w-32 shrink-0 text-2xs text-text-tertiary pt-0.5">{colonna.etichetta}</span>
      <div className="flex-1 min-w-0">
        {colonna.tipo === 'persone'
          ? <Owner riga={riga} persone={persone} onOwner={onOwner} />
          : <CrmCella colonna={colonna} valore={riga[colonna.campo]}
              onSalva={v => onSalva(colonna.campo, v)} />}
      </div>
    </div>
  )
}

export function CrmScheda({ riga, onChiudi, onSalva, onConverti, onElimina, pending, persone = [], onOwner }: {
  riga: RigaCrm
  persone?: PersonaCrm[]
  /** assente per chi non assegna il lavoro: gli owner si leggono e basta */
  onOwner?: (ids: string[]) => Promise<void>
  onChiudi: () => void
  onSalva: (campo: string, valore: unknown) => Promise<void>
  onConverti: () => void
  /** assente per chi non può eliminare: il bottone non c'è, non è spento */
  onElimina?: () => void
  pending: boolean
}) {
  const { TUTTE } = useFasi()
  const origine = (riga.lead_origine ?? {}) as Record<string, string>
  const voci = ORIGINE.filter(([k]) => origine[k])

  /* §428 — tre domande a cui la scheda risponde prima di mostrare i campi:
     cosa fare adesso, cosa manca per la fase in cui sta, e cosa sappiamo già
     da un'altra parte. Sono funzioni pure con il loro gate: qui si disegna. */
  const azione = prossimaAzione(TUTTE, riga as never, Date.now())
  const mancanti = campiCheServono(TUTTE, riga as never)
    .map(colonnaDi).filter((c): c is Colonna => !!c)
  const proposte = suggerimenti(riga as never, riga as Record<string, unknown>)

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
            {/* §426 — la fase si cambia da qui senza cercare la cella in
                tabella: è il primo dato che si guarda aprendo una scheda, e
                fino a ieri era l'unico che si poteva solo leggere. */}
            <MenuFase
              valore={riga.stage as string}
              etichetta={`Fase di ${String(riga.company_name ?? 'questo lead')}`}
              onScegli={fase => { void onSalva('stage', fase) }}
            />
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
        {/* Una cosa sola, la più urgente: un elenco di sei cose da fare è un
            elenco che non si fa. L'ordine è quello del danno — un lead senza
            recapito non si lavora, e dirgli «qualificalo» prima sarebbe un
            consiglio che non si può seguire. */}
        {azione && (
          <div className={`flex items-start gap-2 px-3 py-2.5 rounded-xl border text-xs ${
            azione.urgente
              ? 'bg-warning-dim border-warning/30 text-warning'
              : 'bg-gold-dim border-gold/30 text-gold-text'}`}>
            {azione.urgente ? <TriangleAlert className="w-4 h-4 shrink-0 mt-px" /> : <Target className="w-4 h-4 shrink-0 mt-px" />}
            <span>{azione.testo}</span>
          </div>
        )}

        {/* Quello che manca **per questa fase**, subito compilabile: non tutti i
            campi vuoti — quasi ogni riga ne ha dieci, e dieci cose mancanti sono
            un elenco che si ignora. */}
        {mancanti.length > 0 && (
          <Riquadro titolo="Cosa manca adesso">
            {mancanti.map(c => <Campo key={c.campo} colonna={c} riga={riga} onSalva={onSalva} persone={persone} onOwner={onOwner} />)}
          </Riquadro>
        )}

        {/* Lo sappiamo già, e nessuno l'ha ricopiato. Si **propone**: la
            provenienza Meta è dichiarata da chi ha compilato il modulo e non è
            verificata, e un campo che si riempie da solo non lo ricontrolla
            nessuno. */}
        {proposte.length > 0 && (
          <section className="border border-border rounded-xl px-3 py-2.5 space-y-2">
            <p className="flex items-center gap-1.5 text-2xs font-semibold text-text-tertiary uppercase tracking-wide">
              <Sparkles className="w-3.5 h-3.5" /> Lo sappiamo già
            </p>
            {proposte.map(s => (
              <div key={s.campo} className="flex items-center gap-2 text-2xs">
                <span className="text-text-tertiary shrink-0">{colonnaDi(s.campo)?.etichetta ?? s.campo}</span>
                <span className="flex-1 min-w-0 truncate text-text-primary" title={`da ${s.da}`}>{s.valore}</span>
                <button onClick={() => { void onSalva(s.campo, s.valore) }} disabled={pending}
                  className="shrink-0 text-2xs font-semibold text-gold-text border border-gold/30 px-2 py-0.5 rounded-lg hover:bg-gold/10 disabled:opacity-40">
                  Usa
                </button>
              </div>
            ))}
          </section>
        )}

        <SalesFollowUps key={riga.id} dealId={riga.id} company={riga.company_name || 'Lead'}
          email={typeof riga.contact_email === 'string' ? riga.contact_email : null} />
        {GRUPPI_SCHEDA.filter(g => g !== 'provenienza').map(g => (
          <Riquadro key={g} titolo={TITOLO_GRUPPO[g]}>
            {COLONNE.filter(c => c.gruppo === g).map(c => (
              <Campo key={c.campo} colonna={c} riga={riga} onSalva={onSalva} persone={persone} onOwner={onOwner} />
            ))}
          </Riquadro>
        ))}

        <Riquadro titolo={TITOLO_GRUPPO.provenienza}>
          {COLONNE.filter(c => c.gruppo === 'provenienza').map(c => (
            <Campo key={c.campo} colonna={c} riga={riga} onSalva={onSalva} persone={persone} onOwner={onOwner} />
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
