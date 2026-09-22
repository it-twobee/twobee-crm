'use client'

import { useState, useMemo } from 'react'
import { X, ArrowUp, ArrowDown, FolderTree, Sparkles, Layers, Repeat, CalendarRange } from 'lucide-react'
import { StepHead, SearchInput } from '@/components/shared/formkit'
import { WorkstreamPresets } from '@/components/projects/WorkstreamPresets'
import { corsieDeiTemplate, formaDelProgetto, type Preset } from '@/lib/workstream-presets'
import { periodiDaAprire } from '@/lib/periodi'
import { ORIZZONTE } from '@/lib/generatore-periodi'
import { nk, type WsPick, type CorsiaScelta, type ProjectArea } from './types'
import type { ServiceCatalogEntry, ProjectTemplate, ProjectTemplateNode } from '@/lib/types/database'

const keyOf = (s: { service_type: string; service_subtype: string | null }) =>
  s.service_type + (s.service_subtype ? `::${s.service_subtype}` : '')

export function StepWorkstream({
  area, services, templates, nodes, picks, setPicks, corsie, setCorsie,
  apriPeriodi, setApriPeriodi, canPersist,
}: {
  area: ProjectArea
  services: ServiceCatalogEntry[]
  templates: ProjectTemplate[]
  nodes: ProjectTemplateNode[]
  picks: WsPick[]
  setPicks: React.Dispatch<React.SetStateAction<WsPick[]>>
  /** §400 — le corsie che andranno dentro, scelte fra quelle del servizio */
  corsie: CorsiaScelta[]
  setCorsie: React.Dispatch<React.SetStateAction<CorsiaScelta[]>>
  apriPeriodi: boolean
  setApriPeriodi: (v: boolean) => void
  canPersist: boolean
}) {
  const [q, setQ] = useState('')

  /* §400 — il servizio del progetto è il primo scelto: è quello che gli dà il
     nome, e quello il cui ritmo decide se le corsie sono i trimestri. */
  const forma = useMemo(
    () => picks[0] ? formaDelProgetto(services, picks[0]) : 'none',
    [services, picks])
  const periodi = useMemo(() => forma === 'none' ? []
    : periodiDaAprire(new Date().toISOString().slice(0, 10), forma, ORIZZONTE[forma]),
    [forma])
  const proposte = useMemo(
    () => corsieDeiTemplate(templates, nodes, picks),
    [templates, nodes, picks])
  const scelta = (k: string) => corsie.some(c => c.key === k)

  const tplCount = useMemo(() => {
    const m = new Map<string, number>()
    templates.filter(t => t.is_active).forEach(t => {
      const k = t.service_type + (t.service_subtype ? `::${t.service_subtype}` : '')
      m.set(k, (m.get(k) ?? 0) + 1)
    })
    return m
  }, [templates])

  const move = (i: number, d: -1 | 1) => setPicks(ps => {
    const j = i + d
    if (j < 0 || j >= ps.length) return ps
    const copy = [...ps]
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
    return copy
  })

  return (
    <div>
      <StepHead
        title="Cosa consegniamo?"
        hint="Ogni voce diventa un workstream del progetto. Puoi sceglierne più di uno e riordinarli."
        aside={picks.length > 0
          ? <span className="text-2xs font-semibold text-gold-text tabular shrink-0">{picks.length} selezionati</span>
          : undefined}
      />

      {picks.length > 0 && (
        <div className="mb-4 space-y-1.5">
          {picks.map((p, i) => (
            <div key={p.key} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gold-dim border border-gold/30">
              <span className="w-5 h-5 rounded-md bg-surface flex items-center justify-center text-2xs font-bold text-gold-text tabular shrink-0">{i + 1}</span>
              <FolderTree className="w-3.5 h-3.5 text-gold-text shrink-0" />
              <span className="flex-1 text-sm font-semibold text-text-primary truncate">{p.label}</span>
              {p.custom && (
                <span className="flex items-center gap-1 text-2xs text-text-tertiary shrink-0">
                  <Sparkles className="w-3 h-3" />su misura
                </span>
              )}
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
                aria-label="Sposta su" className="text-text-tertiary hover:text-text-primary disabled:opacity-25">
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === picks.length - 1}
                aria-label="Sposta giù" className="text-text-tertiary hover:text-text-primary disabled:opacity-25">
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => setPicks(ps => ps.filter(x => x.key !== p.key))}
                aria-label={`Togli ${p.label}`} className="text-text-tertiary hover:text-error">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* §400 — scelto il servizio, quali corsie ci vanno dentro. Sono quelle
          dei suoi template: chiederle da capo vuol dire farsele riscrivere ogni
          volta con un nome diverso. Sul Growth c'è prima il trimestre, che non
          è una riga dell'albero — lo apre il motore appena il progetto esiste,
          con registro e tappe (§396). */}
      {picks.length > 0 && (forma !== 'none' || proposte.length > 0) && (
        <section className="mb-4 border border-border rounded-xl overflow-hidden">
          <header className="px-3 py-2.5 bg-surface border-b border-border">
            <h3 className="text-xs font-bold text-text-primary">
              Cosa mettiamo dentro {picks.map(p => p.label).join(' e ')}?
            </h3>
            <p className="text-2xs text-text-secondary mt-0.5">
              Le corsie che questo lavoro ha di solito, con dentro quello che hanno nel modello. Spunta quelle che servono: il resto si aggiunge dopo, dall&apos;albero.
            </p>
          </header>

          {forma !== 'none' && (
            <label className="flex items-start gap-2.5 px-3 py-2.5 border-b border-border cursor-pointer hover:bg-surface-hover transition-colors">
              <input type="checkbox" checked={apriPeriodi} onChange={e => setApriPeriodi(e.target.checked)}
                className="accent-gold w-3.5 h-3.5 cursor-pointer shrink-0 mt-0.5" />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-text-primary">
                  <CalendarRange className="w-3.5 h-3.5 text-gold-text shrink-0" />
                  {forma === 'quarter'
                    ? `Apri subito ${periodi.map(p => p.etichetta).join(' e ')}`
                    : `Apri subito i mesi: ${periodi.map(p => p.etichetta.split(' ')[0]).join(', ')}`}
                </span>
                <span className="block text-2xs text-text-secondary mt-0.5">
                  {forma === 'quarter'
                    ? 'Questo servizio lavora a trimestri: la corsia è il periodo, con le sue date e le sue tappe. La apre il motore appena il progetto esiste, non l’albero qui sotto.'
                    : 'Questo servizio lavora a mesi: ogni mese è una tappa dentro la continuativa, non una corsia. Le apre il motore appena il progetto esiste.'}
                </span>
              </span>
            </label>
          )}

          {proposte.length > 0 ? (
            <div className="max-h-[30vh] overflow-y-auto divide-y divide-border">
              {proposte.map(c => (
                <label key={c.key}
                  className={`flex items-start gap-2.5 px-3 py-2 cursor-pointer transition-colors ${
                    scelta(c.key) ? 'bg-gold-dim' : 'hover:bg-surface-hover'}`}>
                  <input type="checkbox" checked={scelta(c.key)}
                    onChange={() => setCorsie(cs => scelta(c.key)
                      ? cs.filter(x => x.key !== c.key)
                      : [...cs, { key: c.key, nome: c.nome, tipo: c.tipo, nodeId: c.nodeId }])}
                    className="accent-gold w-3.5 h-3.5 cursor-pointer shrink-0 mt-0.5" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-semibold text-text-primary truncate">{c.nome}</span>
                    {/* §402 — cosa porta dentro: una corsia che arriva con tre
                        tappe e otto task non è la stessa cosa di un contenitore
                        vuoto, e spuntarla alla cieca era l'unica scelta. */}
                    <span className="block text-2xs text-text-tertiary tabular truncate">
                      {[
                        c.tappe && `${c.tappe} ${c.tappe === 1 ? 'tappa' : 'tappe'}`,
                        c.task && `${c.task} task`,
                        c.ricorrenti && `${c.ricorrenti} ${c.ricorrenti === 1 ? 'ricorrente' : 'ricorrenti'}`,
                      ].filter(Boolean).join(' · ') || 'corsia vuota'}
                    </span>
                  </span>
                  {c.tipo === 'recurring' && (
                    <span className="flex items-center gap-1 text-2xs text-success shrink-0">
                      <Repeat className="w-3 h-3" />continuativa
                    </span>
                  )}
                  {c.quante > 1 && (
                    <span className="text-2xs text-text-tertiary shrink-0 tabular">in {c.quante} template</span>
                  )}
                </label>
              ))}
            </div>
          ) : (
            <p className="px-3 py-2.5 text-2xs text-text-tertiary">
              Per questo servizio non ci sono corsie a modello: le scrivi nell&apos;albero, al passo Struttura.
            </p>
          )}
        </section>
      )}

      <div className="space-y-3">
        <SearchInput value={q} onChange={setQ} placeholder="Cerca a catalogo o scrivi un workstream nuovo…" autoFocus />

        {/* §394 — l'elenco è quello di ogni altro «nuovo workstream»: qui si
            sceglie anche il servizio del progetto, quindi niente altre aree. */}
        <WorkstreamPresets
          area={area} services={services} query={q} altreAree={false} canPersist={canPersist}
          presenti={picks.map(p => p.label)} notaPresente=""
          maxH="max-h-[36vh]"
          scelto={(p: Preset) => picks.some(x => x.key === keyOf(p))}
          metaOf={(p: Preset) => {
            const n = tplCount.get(keyOf(p)) ?? 0
            return n > 0
              ? <span className="flex items-center gap-1 text-2xs text-info shrink-0"><Layers className="w-3 h-3" />{n} template</span>
              : undefined
          }}
          onPick={pick => {
            if (pick.custom) {
              setPicks(ps => [...ps, { key: `custom:${nk()}`, label: pick.label, service_type: pick.service_type, service_subtype: null, custom: true }])
              setQ('')
              return
            }
            const k = keyOf(pick)
            setPicks(ps => ps.some(p => p.key === k)
              ? ps.filter(p => p.key !== k)
              : [...ps, { key: k, label: pick.label, service_type: pick.service_type, service_subtype: pick.service_subtype, custom: false }])
          }}
        />
      </div>
    </div>
  )
}
