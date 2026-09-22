'use client'

import { useState, useMemo } from 'react'
import { X, ArrowUp, ArrowDown, FolderTree, Sparkles, Layers } from 'lucide-react'
import { StepHead, SearchInput } from '@/components/shared/formkit'
import { WorkstreamPresets } from '@/components/projects/WorkstreamPresets'
import { DaDovePartiamo } from './DaDovePartiamo'
import type { Preset } from '@/lib/workstream-presets'
import type { Periodo } from '@/lib/periodi'
import {
  nk, type WsPick, type CorsiaScelta, type EventoScelto, type ProjectArea,
} from './types'
import type { ServiceCatalogEntry, ProjectTemplate, ProjectTemplateNode } from '@/lib/types/database'

const keyOf = (s: { service_type: string; service_subtype: string | null }) =>
  s.service_type + (s.service_subtype ? `::${s.service_subtype}` : '')

/**
 * §404 — il passo dove si decide **cosa** consegniamo e **da dove** partiamo.
 *
 * Erano due passi lontani tre schermate, e il secondo buttava via il primo. Il
 * servizio dà il nome al progetto e il suo ritmo; il modello dà l'ossatura;
 * corsie, ricorrenze commerciali e su misura si aggiungono sopra.
 */
export function StepWorkstream({
  area, services, templates, nodes, picks, setPicks,
  templateId, setTemplateId, corsie, setCorsie, eventi, setEventi,
  periodi, apriPeriodi, setApriPeriodi, strutturaToccata, canPersist,
}: {
  area: ProjectArea
  services: ServiceCatalogEntry[]
  templates: ProjectTemplate[]
  nodes: ProjectTemplateNode[]
  picks: WsPick[]
  setPicks: React.Dispatch<React.SetStateAction<WsPick[]>>
  /** il modello intero: uno solo, dà l'ossatura */
  templateId: string | null
  setTemplateId: (id: string | null) => void
  /** le aggiunte: corsie dei modelli, su misura, ricorrenze commerciali */
  corsie: CorsiaScelta[]
  setCorsie: React.Dispatch<React.SetStateAction<CorsiaScelta[]>>
  eventi: EventoScelto[]
  setEventi: React.Dispatch<React.SetStateAction<EventoScelto[]>>
  /** i periodi che il motore aprirà alla creazione, se il servizio ne ha */
  periodi: Periodo[]
  apriPeriodi: boolean
  setApriPeriodi: (v: boolean) => void
  /** l'albero è stato modificato a mano: cambiare qui lo riscrive */
  strutturaToccata: boolean
  canPersist: boolean
}) {
  const [q, setQ] = useState('')

  const tplCount = useMemo(() => {
    const m = new Map<string, number>()
    templates.filter(t => t.is_active && (t.kind ?? 'project') !== 'period').forEach(t => {
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
        hint="Il servizio dà il nome al progetto. Sotto scegli da dove parte la struttura."
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

      <div className="space-y-3">
        <SearchInput value={q} onChange={setQ} placeholder="Cerca a catalogo o scrivi un servizio nuovo…" autoFocus />

        {/* §394 — l'elenco è quello di ogni altro «nuovo workstream»: qui si
            sceglie anche il servizio del progetto, quindi niente altre aree. */}
        <WorkstreamPresets
          area={area} services={services} query={q} altreAree={false} canPersist={canPersist}
          presenti={picks.map(p => p.label)} notaPresente=""
          maxH="max-h-[28vh]"
          scelto={(p: Preset) => picks.some(x => x.key === keyOf(p))}
          metaOf={(p: Preset) => {
            const n = tplCount.get(keyOf(p)) ?? 0
            return n > 0
              ? <span className="flex items-center gap-1 text-2xs text-info shrink-0"><Layers className="w-3 h-3" />{n} modelli</span>
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

        {picks.length > 0 && (
          <DaDovePartiamo
            area={area} servizi={picks} templates={templates} nodes={nodes}
            templateId={templateId} setTemplateId={setTemplateId}
            corsie={corsie} setCorsie={setCorsie} eventi={eventi} setEventi={setEventi}
            periodi={periodi} apriPeriodi={apriPeriodi} setApriPeriodi={setApriPeriodi}
            strutturaToccata={strutturaToccata} />
        )}
      </div>
    </div>
  )
}
