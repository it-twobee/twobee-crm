'use client'

import { useState, useMemo, useTransition } from 'react'
import { toast } from 'sonner'
import { Plus, X, ArrowUp, ArrowDown, FolderTree, Sparkles, Loader2, Layers } from 'lucide-react'
import { StepHead, SearchInput, PickRow, Empty } from '@/components/shared/formkit'
import { createCatalogService } from '@/app/actions/wizard'
import { nk, type WsPick, type ProjectArea } from './types'
import type { ServiceCatalogEntry, ProjectTemplate } from '@/lib/types/database'

const keyOf = (s: ServiceCatalogEntry) => s.service_type + (s.service_subtype ? `::${s.service_subtype}` : '')

export function StepWorkstream({
  area, services, templates, picks, setPicks, canPersist,
}: {
  area: ProjectArea
  services: ServiceCatalogEntry[]
  templates: ProjectTemplate[]
  picks: WsPick[]
  setPicks: React.Dispatch<React.SetStateAction<WsPick[]>>
  canPersist: boolean
}) {
  const [q, setQ] = useState('')
  const [persist, setPersist] = useState(true)
  const [pending, start] = useTransition()

  const tplCount = useMemo(() => {
    const m = new Map<string, number>()
    templates.filter(t => t.is_active).forEach(t => {
      const k = t.service_type + (t.service_subtype ? `::${t.service_subtype}` : '')
      m.set(k, (m.get(k) ?? 0) + 1)
    })
    return m
  }, [templates])

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? services.filter(s => s.label.toLowerCase().includes(t)) : services
  }, [services, q])

  const has = (k: string) => picks.some(p => p.key === k)
  const toggle = (s: ServiceCatalogEntry) => {
    const k = keyOf(s)
    setPicks(ps => has(k)
      ? ps.filter(p => p.key !== k)
      : [...ps, { key: k, label: s.label, service_type: s.service_type, service_subtype: s.service_subtype, custom: false }])
  }

  const typed = q.trim()
  const exactExists = services.some(s => s.label.toLowerCase() === typed.toLowerCase())
    || picks.some(p => p.label.toLowerCase() === typed.toLowerCase())

  const addCustom = () => {
    if (!typed) return
    const finish = (service_type: string) => {
      setPicks(ps => [...ps, { key: `custom:${nk()}`, label: typed, service_type, service_subtype: null, custom: true }])
      setQ('')
    }
    if (!persist || !canPersist) { finish(typed.toLowerCase().replace(/[^a-z0-9]+/gi, '_')); return }
    start(async () => {
      try {
        const svc = await createCatalogService({ area, label: typed })
        finish((svc as ServiceCatalogEntry).service_type)
        toast.success('Workstream aggiunto al catalogo')
      } catch (e) {
        // il catalogo è un di più: se fallisce, il workstream resta comunque nel progetto
        finish(typed.toLowerCase().replace(/[^a-z0-9]+/gi, '_'))
        toast.message('Aggiunto solo a questo progetto', { description: e instanceof Error ? e.message : undefined })
      }
    })
  }

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

      <div className="space-y-3">
        <SearchInput value={q} onChange={setQ} placeholder="Cerca a catalogo o scrivi un workstream nuovo…" autoFocus />

        {typed && !exactExists && (
          <div className="rounded-xl border border-gold/40 bg-gold-dim p-3">
            <button type="button" onClick={addCustom} disabled={pending}
              className="flex items-center gap-2 text-sm font-semibold text-text-primary disabled:opacity-50">
              {pending ? <Loader2 className="w-4 h-4 animate-spin text-gold-text" /> : <Plus className="w-4 h-4 text-gold-text" />}
              Crea «{typed}» come workstream
            </button>
            {canPersist && (
              <label className="flex items-center gap-2 mt-2 cursor-pointer">
                <input type="checkbox" checked={persist} onChange={e => setPersist(e.target.checked)} />
                <span className="text-2xs text-text-secondary">Salvalo anche a catalogo, così lo ritrovi nei prossimi progetti</span>
              </label>
            )}
          </div>
        )}

        {filtered.length === 0 && !typed ? (
          <Empty>Nessun workstream a catalogo per quest&apos;area: scrivine uno qui sopra.</Empty>
        ) : (
          <div className="space-y-1.5 max-h-[36vh] overflow-y-auto pr-1">
            {filtered.map(s => {
              const k = keyOf(s)
              const n = tplCount.get(k) ?? 0
              return (
                <PickRow key={k} selected={has(k)} onClick={() => toggle(s)}
                  icon={<FolderTree className="w-4 h-4 text-gold-text shrink-0" />}
                  title={s.label}
                  subtitle={s.service_subtype ? s.service_subtype.replace(/_/g, ' ') : undefined}
                  meta={n > 0
                    ? <span className="flex items-center gap-1 text-2xs text-info shrink-0"><Layers className="w-3 h-3" />{n} template</span>
                    : undefined}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
