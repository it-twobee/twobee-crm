'use client'

/**
 * §379 — la bacheca: le stesse righe dell'elenco, per colonna di fase.
 *
 * L'elenco resta la vista di casa e la ragione sta in §371: quando devi
 * decidere **chi chiamare adesso** ti servono referente, telefono e
 * provenienza, e una bacheca mostra bene la fase e male tutto il resto. Ma
 * c'è una domanda che l'elenco risponde peggio — «com'è messa la pipeline,
 * dove si è accumulato» — e a quella una colonna per fase risponde con un
 * colpo d'occhio. Quindi si aggiunge, non si sostituisce.
 *
 * **Dodici colonne scorrono, non si comprimono**, come le colonne della
 * tabella di prima: dodici fasi in mille pixel sono dodici colonne
 * illeggibili. Chi vuole restringere il campo usa il filtro dei gruppi, che
 * qui nasconde le colonne invece di svuotarle — una colonna vuota che non
 * può riempirsi è rumore.
 *
 * **Lo scroll verticale resta della pagina** (§manuale): una colonna con lo
 * scroll suo dentro la pagina che scorre è lo scroll dentro lo scroll, e le
 * schede sparirebbero dietro una striscia alta due centimetri. Le colonne
 * crescono, la pagina scorre.
 *
 * Il trascinamento è quello nativo del browser e non una libreria: sono
 * quattro eventi, e una dipendenza in più è una dipendenza da aggiornare per
 * sempre. Il prezzo dichiarato è che **col dito non funziona** — il
 * trascinamento HTML5 non esiste sul touch — e per questo la fase resta
 * modificabile dalla scheda, che è la strada di chi lavora dal telefono.
 *
 * Gli evidenziati usano `gold-dim` e non `bg-gold/5`: in questo progetto i
 * token sono `var(--color-*)` senza `<alpha-value>`, quindi Tailwind **non
 * genera** le classi con l'opacità — `bg-gold/5` non esiste nel foglio di
 * stile e non colora niente. Qui non sarebbe un dettaglio estetico: è il
 * solo segnale che dice dove stai per lasciare la scheda.
 */

import { useState } from 'react'
import { FASI, GRUPPI, classiFase, etichettaFase, type Gruppo } from '@/lib/sales-stages'
import type { RigaCrm } from './CrmTable'

/** giorno e ora, come nell'elenco: `20/09 15:41` */
function quando(v: unknown): string {
  if (typeof v !== 'string' || !v) return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  const anno = d.getFullYear() === new Date().getFullYear() ? '' : `/${String(d.getFullYear()).slice(2)}`
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}${anno} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function CrmBacheca({ righe, gruppo, apertaId, onApri, onSposta }: {
  righe: RigaCrm[]
  /** `tutti` o uno dei tre gruppi: nasconde le colonne, non le svuota */
  gruppo: string
  apertaId: string | null
  onApri: (r: RigaCrm) => void
  /** chiede lo spostamento: la conferma e il salvataggio stanno di sopra */
  onSposta: (riga: RigaCrm, fase: string) => void
}) {
  const [trascinato, setTrascinato] = useState<string | null>(null)
  const [sopra, setSopra] = useState<string | null>(null)

  const colonne = (GRUPPI as readonly string[]).includes(gruppo)
    ? FASI.filter(f => f.gruppo === gruppo as Gruppo)
    : FASI

  const lascia = (fase: string) => {
    setSopra(null)
    const riga = righe.find(r => r.id === trascinato)
    setTrascinato(null)
    // trascinare una scheda dov'era già non è uno spostamento: niente conferma
    if (riga && riga.stage !== fase) onSposta(riga, fase)
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {colonne.map(f => {
        const carte = righe.filter(r => r.stage === f.chiave)
        const bersaglio = sopra === f.chiave
        return (
          <section key={f.chiave}
            aria-label={`${f.etichetta}, ${carte.length} lead`}
            onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setSopra(f.chiave) }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setSopra(null) }}
            onDrop={e => { e.preventDefault(); lascia(f.chiave) }}
            className={`w-64 shrink-0 rounded-xl border transition-colors ${
              bersaglio ? 'border-gold bg-gold-dim' : 'border-border bg-surface'}`}>
            <header className="flex items-center gap-2 px-2.5 py-2 border-b border-border">
              <span className={`text-2xs font-semibold px-2 py-0.5 rounded-full truncate ${classiFase(f.chiave)}`}>
                {f.etichetta}
              </span>
              <span className="ml-auto text-2xs tabular text-text-tertiary shrink-0">{carte.length}</span>
            </header>

            <div className="p-2 space-y-2 min-h-24">
              {carte.map(r => {
                const scelta = apertaId === r.id
                const telefono = typeof r.contact_phone === 'string' ? r.contact_phone : ''
                const referente = typeof r.contact_name === 'string' ? r.contact_name : ''
                const arrivo = quando(r.created_at)
                const org = (r.lead_origine ?? {}) as Record<string, string>
                return (
                  /* `div` e non `button`: un bottone trascinabile ha
                     comportamenti diversi da browser a browser, e qui il
                     trascinamento è l'interazione principale. Il ruolo e il
                     tasto restano, così la scheda si apre anche da tastiera. */
                  <div key={r.id} role="button" tabIndex={0} draggable
                    onClick={() => onApri(r)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onApri(r) } }}
                    onDragStart={e => {
                      setTrascinato(r.id)
                      e.dataTransfer.effectAllowed = 'move'
                      // Firefox non avvia il trascinamento senza un payload
                      e.dataTransfer.setData('text/plain', r.id)
                    }}
                    onDragEnd={() => { setTrascinato(null); setSopra(null) }}
                    aria-current={scelta ? 'true' : undefined}
                    className={`rounded-lg border px-2.5 py-2 cursor-grab active:cursor-grabbing transition-colors ${
                      trascinato === r.id ? 'opacity-40' : ''} ${
                      scelta ? 'border-gold bg-surface-active' : 'border-border bg-background hover:bg-surface-hover'}`}>
                    <p className="text-xs font-semibold text-text-primary truncate">
                      {r.company_name || 'Senza nome'}
                    </p>
                    {(referente || telefono) && (
                      <p className="text-2xs text-text-secondary truncate mt-0.5">
                        {[referente, telefono].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    <p className="flex items-center gap-2 mt-0.5">
                      {org.piattaforma && <span className="text-2xs text-text-tertiary truncate">{org.piattaforma}</span>}
                      {arrivo && <span className="text-2xs text-text-tertiary tabular ml-auto shrink-0">{arrivo}</span>}
                    </p>
                  </div>
                )
              })}

              {/* Una colonna vuota deve restare un bersaglio: senza un'area
                  con un'altezza, non ci si può lasciare niente sopra. */}
              {!carte.length && (
                <p className="text-2xs text-text-tertiary text-center py-6 border border-dashed border-border rounded-lg">
                  {bersaglio ? `Lascia qui per ${etichettaFase(f.chiave)}` : 'Vuota'}
                </p>
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}
