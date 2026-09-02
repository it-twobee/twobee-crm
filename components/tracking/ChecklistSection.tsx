'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Check, ChevronDown, ChevronUp, StickyNote } from 'lucide-react'
import { getChecklist, setChecklistItem } from '@/app/actions/tracking'
import type { MergedChecklist, MergedChecklistItem } from '@/lib/tracking/checklist'
import { inputCls } from '@/components/shared/formkit'
import { Card, Loading, Notice } from './ui'

function Bar({ done, total, percent }: { done: number; total: number; percent: number }) {
  return (
    <div className="flex items-center gap-2 min-w-[140px]">
      <div className="flex-1 h-1.5 rounded-full bg-surface-active overflow-hidden">
        <div className="h-full bg-gold rounded-full" style={{ width: `${percent}%` }} />
      </div>
      <span className="text-2xs text-text-tertiary whitespace-nowrap">{done}/{total}</span>
    </div>
  )
}

/**
 * Le voci stanno nei JSON del codice (lib/tracking/templates); a database va
 * solo l'avanzamento. Gli id delle voci sono chiavi: rinominarne uno perde la
 * spunta.
 */
export function ChecklistSection({ clientId, archetype }: { clientId: string; archetype: string | null }) {
  const [list, setList] = useState<MergedChecklist | null>(null)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [pending, start] = useTransition()

  const reload = useCallback(async () => {
    const res = await getChecklist(clientId)
    if (!res.ok) { toast.error(res.error); return }
    setList(res.data)
    // le sezioni incomplete aperte, quelle finite chiuse
    setOpen(prev => Object.fromEntries(res.data.sections.map(s => [s.id, prev[s.id] ?? s.progress.percent < 100])))
  }, [clientId])

  useEffect(() => { reload() }, [reload, archetype])

  const update = (item: MergedChecklistItem, patch: { done?: boolean; note?: string }) => start(async () => {
    const res = await setChecklistItem(clientId, item.id, patch)
    if (!res.ok) { toast.error(res.error); return }
    setList(res.data)
  })

  if (!archetype) {
    return (
      <Card title="Checklist di setup" hint="Le voci dipendono dall'archetipo">
        <Notice tone="muted">Assegna un archetipo nella configurazione per avere la checklist.</Notice>
      </Card>
    )
  }
  if (!list) return <Card title="Checklist di setup"><Loading /></Card>

  return (
    <Card title={list.title} hint={list.note || 'Checklist di setup per archetipo'}
      aside={<Bar done={list.progress.done} total={list.progress.total} percent={list.progress.percent} />}>
      <div className="space-y-2">
        {list.sections.map(section => {
          const isOpen = open[section.id] ?? true
          return (
            <div key={section.id} className="border border-border rounded-xl overflow-hidden">
              <button type="button" onClick={() => setOpen(o => ({ ...o, [section.id]: !isOpen }))}
                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 bg-surface-hover text-left">
                <span className="text-sm font-semibold text-text-primary flex items-center gap-2">
                  {isOpen ? <ChevronUp className="w-4 h-4 text-text-tertiary" /> : <ChevronDown className="w-4 h-4 text-text-tertiary" />}
                  {section.title}
                </span>
                <Bar done={section.progress.done} total={section.progress.total} percent={section.progress.percent} />
              </button>
              {isOpen && (
                <ul className="divide-y divide-border">
                  {section.items.map(item => <ChecklistRow key={item.id} item={item} pending={pending} onChange={p => update(item, p)} />)}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function ChecklistRow({ item, pending, onChange }: { item: MergedChecklistItem; pending: boolean; onChange: (p: { done?: boolean; note?: string }) => void }) {
  const [noteOpen, setNoteOpen] = useState(!!item.note)
  const [note, setNote] = useState(item.note)
  useEffect(() => { setNote(item.note) }, [item.note])

  return (
    <li className="px-3 py-2.5">
      <div className="flex items-start gap-3">
        <button type="button" role="checkbox" aria-checked={item.done} aria-label={item.title} disabled={pending}
          onClick={() => onChange({ done: !item.done })}
          className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
            item.done ? 'bg-gold border-gold' : 'border-border-strong hover:border-gold'}`}>
          {item.done && <Check className="w-3.5 h-3.5 text-on-gold" strokeWidth={3} />}
        </button>
        <div className="min-w-0 flex-1">
          <p className={`text-sm ${item.done ? 'text-text-tertiary line-through' : 'text-text-primary'}`}>{item.title}</p>
          {item.detail && <p className="text-2xs text-text-tertiary mt-0.5">{item.detail}</p>}
          {noteOpen && (
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
              onBlur={() => { if (note !== item.note) onChange({ note }) }}
              placeholder="Nota (si salva quando esci dal campo)" className={`${inputCls} mt-2 text-2xs`} />
          )}
        </div>
        <button type="button" onClick={() => setNoteOpen(v => !v)} aria-label="Nota"
          className={`shrink-0 ${item.note ? 'text-gold-text' : 'text-text-tertiary hover:text-text-primary'}`}>
          <StickyNote className="w-4 h-4" />
        </button>
      </div>
    </li>
  )
}
