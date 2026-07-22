'use client'

import { useState } from 'react'
import { FileText, Sparkles, Loader2, Trash2, Zap, Edit2, ChevronUp, ChevronDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Client, Project, Profile } from '@/lib/types/database'
import { Section } from '../project-shared'
import { type AiPlanSprint } from '../AiPlanBuilder'
import { TemplatePickerModal } from './TemplatePickerModal'

// ─── Brief Panel ───────────────────────────────────────────────────────────────
export function BriefPanel({ project, client, isAdmin, accent, workstreamsCount, tasksCount }: {
  project: Project; client: Client; isAdmin: boolean; accent: string
  profiles: Profile[]; currentUserId: string
  workstreamsCount: number; tasksCount: number
}) {
  const [brief, setBrief]           = useState(project.brief ?? '')
  const [saving, setSaving]         = useState(false)
  const [briefLoading, setBriefLoad] = useState(false)
  const [aiLoading, setAiLoad]      = useState(false)
  const [aiPlan, setAiPlan]         = useState<AiPlanSprint[] | null>(null)
  const [aiError, setAiErr]         = useState('')
  const [showAi, setShowAi]         = useState(false)
  const [showTmpl, setShowTmpl]     = useState(false)
  const [briefAiGenerated, setBriefAiGenerated] = useState(false)
  // §15.1: dopo il salvataggio il brief resta in LETTURA. Template/AI/genera-piano
  // compaiono solo in edit mode. Un brief vuoto parte già in edit (non c'è nulla da leggere).
  const [editMode, setEditMode] = useState(!project.brief)
  // Brief lungo in lettura: collassato con "Mostra tutto" per non allungare la pagina.
  const [briefExpanded, setBriefExpanded] = useState(false)
  const briefLong = brief.length > 320 || brief.split('\n').length > 7

  const isDirty = brief !== (project.brief ?? '')

  const saveBrief = async () => {
    setSaving(true)
    await createClient().from('projects').update({ brief: brief.trim() || null }).eq('id', project.id)
    setSaving(false)
    setBriefAiGenerated(false)
    setEditMode(false)                       // torna in lettura
    toast.success('Brief salvato')
  }

  // Annulla: ripristina il testo salvato — le modifiche non confermate si perdono, il brief no.
  const cancelEdit = () => {
    setBrief(project.brief ?? '')
    setBriefAiGenerated(false)
    setEditMode(false)
  }

  const clearBrief = async () => {
    setBrief('')
    setBriefAiGenerated(false)
    await createClient().from('projects').update({ brief: null }).eq('id', project.id)
    toast.success('Brief rimosso')
  }

  const generatePlan = async () => {
    if (!brief.trim()) { toast.error('Scrivi prima il brief oppure usa un template'); return }
    setAiLoad(true); setAiErr(''); setAiPlan(null); setShowAi(true)
    const r = await fetch('/api/ai/generate-plan', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brief, project_type: project.project_type, project_name: project.name, company_name: client.company_name, kind: project.project_kind }),
    })
    const data = await r.json()
    setAiLoad(false)
    if (data.error) { setAiErr(data.error); return }
    setAiPlan(data.sprints ?? [])
  }

  const generateBriefFromExisting = async () => {
    setBriefLoad(true)
    setBriefAiGenerated(false)
    try {
      const r = await fetch('/api/ai/generate-brief', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_type: project.project_type, project_name: project.name,
          company_name: client.company_name, kind: project.project_kind,
          template_label: `${workstreamsCount} aree di lavoro, ${tasksCount} task già configurati`,
        }),
      })
      const data = await r.json()
      if (data.brief) {
        setBrief(data.brief)
        setBriefAiGenerated(true)
        setEditMode(true)          // il brief AI si rivede prima di confermare
        await createClient().from('projects').update({ brief: data.brief }).eq('id', project.id)
        toast.success('Brief generato!')
      }
    } catch {
      toast.error('Errore generazione brief')
    }
    setBriefLoad(false)
  }

  // Il template genera solo il BRIEF. La parte che creava la struttura produceva
  // SPRINT (AiPlanSprint → sprint → milestone-task): resta fuori finché
  // AiPlanBuilder e /api/ai/generate-plan non parlano di Aree di lavoro.
  const handleTemplateSelect = async (plan: AiPlanSprint[], templateLabel: string) => {
    setShowTmpl(false)
    setBriefLoad(true)
    setBriefAiGenerated(false)
    try {
      const r = await fetch('/api/ai/generate-brief', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_type: project.project_type, project_name: project.name,
          company_name: client.company_name, kind: project.project_kind,
          template_label: templateLabel,
        }),
      })
      const data = await r.json()
      if (data.brief) {
        setBrief(data.brief)
        setBriefAiGenerated(true)
        setEditMode(true)          // il brief da template si rivede prima di confermare
        await createClient().from('projects').update({ brief: data.brief }).eq('id', project.id)
      }
    } catch {
      // brief generation is best-effort
    }
    setBriefLoad(false)
  }

  const wordCount = brief.trim().split(/\s+/).filter(Boolean).length

  return (
    <>
      <Section title="Brief del progetto" icon={<FileText className="w-3.5 h-3.5" />} accent={accent}>
        <div className="px-4 pb-4 pt-3">
          {/* Brief AI badge */}
          {briefAiGenerated && (
            <div className="flex items-center gap-1.5 mb-3 px-2.5 py-1.5 rounded-lg w-fit"
              style={{ background: `color-mix(in srgb, ${accent} 7%, transparent)`, border: `1px solid color-mix(in srgb, ${accent} 15%, transparent)` }}>
              <Sparkles className="w-3 h-3" style={{ color: accent }} />
              <span className="text-2xs font-bold" style={{ color: accent }}>Brief generato dall&apos;AI — modificalo liberamente</span>
            </div>
          )}

          {/* Empty state with AI generate button when project already has sprints */}
          {isAdmin && !brief && !briefLoading && workstreamsCount > 0 && (
            <div className="flex items-center gap-3 mb-3 p-3 rounded-xl border border-dashed border-border">
              <Sparkles className="w-4 h-4 shrink-0" style={{ color: accent }} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-text-primary">Piano già configurato</p>
                <p className="text-2xs text-text-tertiary">{workstreamsCount} aree di lavoro · {tasksCount} task</p>
              </div>
              <button onClick={generateBriefFromExisting}
                className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                style={{ background: `color-mix(in srgb, ${accent} 8%, transparent)`, color: accent, border: `1px solid color-mix(in srgb, ${accent} 19%, transparent)` }}>
                Genera brief AI
              </button>
            </div>
          )}

          {/* Corpo: LETTURA (default) o EDIT */}
          {briefLoading ? (
            <div className="flex flex-col items-center gap-2.5 py-10">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: accent }} />
              <p className="text-xs text-text-tertiary">L&apos;AI sta scrivendo il brief del progetto…</p>
            </div>
          ) : editMode && isAdmin ? (
            <textarea value={brief} onChange={e => { setBrief(e.target.value); setBriefAiGenerated(false) }}
              autoFocus
              rows={brief ? Math.min(12, Math.max(5, brief.split('\n').length + 2)) : 5}
              placeholder="Descrivi il progetto: obiettivi, target, vincoli, aspettative del cliente…&#10;&#10;Usa un template per generare il brief automaticamente con AI."
              className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm leading-relaxed text-text-primary resize-none focus:outline-none focus:border-gold/40 placeholder:text-text-tertiary" />
          ) : brief ? (
            <div>
              <p className="text-sm leading-relaxed text-text-secondary whitespace-pre-line"
                style={!briefExpanded && briefLong ? { display: '-webkit-box', WebkitLineClamp: 7, WebkitBoxOrient: 'vertical', overflow: 'hidden' } : undefined}>
                {brief}
              </p>
              {briefLong && (
                <button onClick={() => setBriefExpanded(x => !x)}
                  className="mt-1.5 flex items-center gap-1 text-2xs font-semibold text-gold-text hover:opacity-80 transition-opacity">
                  {briefExpanded ? <><ChevronUp className="w-3 h-3" /> Comprimi</> : <><ChevronDown className="w-3 h-3" /> Mostra tutto</>}
                </button>
              )}
            </div>
          ) : (
            <p className="text-sm text-text-tertiary italic">Nessun brief disponibile.</p>
          )}

          {/* Azioni */}
          {isAdmin && !briefLoading && (
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
              <div className="flex items-center gap-3">
                <span className="text-2xs text-text-tertiary">{wordCount} parole</span>
                {editMode && brief && (
                  <button onClick={clearBrief}
                    className="text-2xs text-text-tertiary hover:text-error transition-colors flex items-center gap-1">
                    <Trash2 className="w-2.5 h-2.5" /> Elimina
                  </button>
                )}
              </div>

              {editMode ? (
                /* EDIT MODE: template, AI, genera piano, annulla, salva */
                <div className="flex items-center gap-2">
                  <button onClick={() => setShowTmpl(true)}
                    className="flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-primary px-3 py-1.5 border border-border hover:border-border-strong rounded-lg transition-colors">
                    <Zap className="w-3 h-3" /> Template + AI
                  </button>
                  <button onClick={cancelEdit}
                    className="text-xs px-3 py-1.5 rounded-lg text-text-tertiary hover:text-text-primary border border-border transition-colors">
                    Annulla
                  </button>
                  <button onClick={saveBrief} disabled={saving || !isDirty}
                    className="text-xs px-4 py-1.5 rounded-lg font-bold bg-gold text-on-gold disabled:opacity-30 transition-colors">
                    {saving ? 'Salvo…' : 'Salva'}
                  </button>
                </div>
              ) : (
                /* VIEW MODE: solo la CTA per entrare in modifica */
                <button onClick={() => setEditMode(true)}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 border border-border rounded-lg text-text-secondary hover:text-text-primary hover:border-border-strong transition-colors">
                  <Edit2 className="w-3 h-3" /> Modifica brief
                </button>
              )}
            </div>
          )}
        </div>
      </Section>

      {showTmpl && (
        <TemplatePickerModal
          onClose={() => setShowTmpl(false)}
          onSelect={handleTemplateSelect}
          projectType={project.project_type}
          accent={accent}
        />
      )}
    </>
  )
}
