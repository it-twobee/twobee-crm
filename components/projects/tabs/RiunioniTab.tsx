'use client'

import { useState, useRef } from 'react'
import {
  BookOpen, Edit2, Loader2, Plus, Printer, Sparkles, Upload,
  X, ChevronDown, ChevronUp, Check, Trash2, Users,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { MeetingNote, Profile, Project, Client } from '@/lib/types/database'

interface MeetingExtract {
  summary: string; key_topics: string[]; decisions: string[]
  actions: { what: string; who: string; by: string }[]
  participants: string[]; mood: 'positivo' | 'neutro' | 'critico'
}

export function printMeeting(m: MeetingNote, extract: MeetingExtract | null) {
  const win = window.open('', '_blank')
  if (!win) return
  const mc = extract?.mood === 'positivo' ? '#22C55E' : extract?.mood === 'critico' ? '#EF4444' : '#888'
  const dateStr = new Date(m.date).toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
  let topicsHtml = ''
  if (extract?.key_topics?.length) {
    topicsHtml = '<h2>Argomenti trattati</h2><div>' + extract.key_topics.map(t => '<span class="topic">' + t + '</span>').join('') + '</div>'
  }
  let decisionsHtml = ''
  const decLines = m.decisions ? m.decisions.split('\n').filter(Boolean) : (extract?.decisions ?? [])
  if (decLines.length) {
    decisionsHtml = '<h2>Decisioni prese</h2><ul>' + decLines.map(d => '<li>' + d + '</li>').join('') + '</ul>'
  }
  let actionsHtml = ''
  if (m.next_actions) {
    actionsHtml = '<h2>Prossime azioni</h2><ul>' + m.next_actions.split('\n').filter(Boolean).map(a => '<li>' + a + '</li>').join('') + '</ul>'
  } else if (extract?.actions?.length) {
    actionsHtml = '<h2>Prossime azioni</h2>' + extract.actions.map(a =>
      '<div class="action"><div class="what">' + a.what + '</div><div class="meta2">' +
      (a.who ? '👤 ' + a.who : '') + (a.who && a.by ? ' · ' : '') + (a.by ? '📅 ' + a.by : '') +
      '</div></div>'
    ).join('')
  }
  const moodBadge = extract?.mood ? '<span class="badge">' + extract.mood + '</span>' : ''
  const partStr = extract?.participants?.length ? '<span>👥 ' + extract.participants.join(', ') + '</span>' : ''
  const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + m.title + '</title>' +
    '<style>' +
    '* { box-sizing: border-box; margin: 0; padding: 0 }' +
    'body { font-family: -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif; color: #111; background: #fff; padding: 40px; max-width: 720px; margin: 0 auto }' +
    'h1 { font-size: 22px; font-weight: 800; margin-bottom: 4px }' +
    '.meta { color: #888; font-size: 12px; margin-bottom: 24px; display: flex; gap: 16px; flex-wrap: wrap }' +
    '.badge { display: inline-block; padding: 2px 8px; border-radius: 99px; font-size: 11px; font-weight: 700; background: ' + mc + '18; color: ' + mc + '; border: 1px solid ' + mc + '30 }' +
    'h2 { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #888; margin: 20px 0 8px }' +
    'p { font-size: 14px; line-height: 1.6; color: #333 }' +
    'ul { list-style: none; padding: 0 }' +
    'ul li { font-size: 14px; color: #333; padding: 4px 0 4px 16px; position: relative; line-height: 1.5 }' +
    'ul li::before { content: "•"; position: absolute; left: 0; color: #bbb }' +
    '.action { background: #f5f5f5; border-radius: 8px; padding: 8px 12px; margin-bottom: 6px }' +
    '.action .what { font-size: 13px; font-weight: 600; color: #111 }' +
    '.action .meta2 { font-size: 11px; color: #888; margin-top: 2px }' +
    '.topic { display: inline-block; background: #f0f0f0; border-radius: 6px; padding: 3px 8px; font-size: 11px; font-weight: 600; margin: 2px; color: #555 }' +
    '.divider { border: none; border-top: 1px solid #eee; margin: 16px 0 }' +
    '@media print { body { padding: 20px } }' +
    '</style></head><body>' +
    '<h1>' + m.title + '</h1>' +
    '<div class="meta"><span>' + dateStr + '</span>' + moodBadge + partStr + '</div>' +
    '<hr class="divider">' +
    '<h2>Sintesi</h2><p>' + m.summary + '</p>' +
    topicsHtml + decisionsHtml + actionsHtml +
    '<script>window.onload = function() { window.print() }<\/script>' +
    '</body></html>'
  win.document.write(html)
  win.document.close()
}

export function MeetingRecapsSection({ meetings: initial, project, client, currentProfile, isAdmin, accent }: {
  meetings: MeetingNote[]; project: Project; client: Client
  currentProfile: Profile; isAdmin: boolean; accent: string
}) {
  const [items, setItems]     = useState<MeetingNote[]>(initial)
  const [showForm, setForm]   = useState(false)
  const [saving, setSaving]   = useState(false)
  const [editId, setEditId]   = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [extracts, setExtracts]   = useState<Record<string, MeetingExtract>>({})
  const [aiLoading, setAiLoad]    = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [tab, setTab2] = useState<'manual' | 'file'>('manual')
  const [uploadText, setUploadText] = useState('')
  const [form, setForm2] = useState({ title: '', date: new Date().toISOString().slice(0, 10), summary: '', decisions: '', next_actions: '' })

  const sorted = [...items].sort((a, b) => b.date.localeCompare(a.date))

  const toggleCollapse = (id: string) => setCollapsed(prev => {
    const n = new Set(prev)
    n.has(id) ? n.delete(id) : n.add(id)
    return n
  })

  const openNew = () => {
    setEditId(null); setTab2('manual'); setUploadText('')
    setForm2({ title: '', date: new Date().toISOString().slice(0, 10), summary: '', decisions: '', next_actions: '' })
    setForm(true)
  }
  const openEdit = (m: MeetingNote) => {
    setEditId(m.id); setTab2('manual')
    setForm2({ title: m.title, date: m.date, summary: m.summary, decisions: m.decisions ?? '', next_actions: m.next_actions ?? '' })
    setForm(true)
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setUploadText(ev.target?.result as string ?? '')
    reader.readAsText(file)
    if (!form.title) setForm2(p => ({ ...p, title: file.name.replace(/\.[^.]+$/, '') }))
  }

  const extractFromFile = async () => {
    if (!uploadText.trim()) { toast.error('Carica prima un file'); return }
    setAiLoad('form')
    const r = await fetch('/api/ai/extract-meeting', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: uploadText, title: form.title, date: form.date }),
    })
    const data: MeetingExtract = await r.json()
    setAiLoad(null)
    if (data.summary) {
      setForm2(p => ({
        ...p,
        summary: data.summary,
        decisions: data.decisions?.join('\n') ?? '',
        next_actions: data.actions?.map(a => `${a.what}${a.who ? ' — ' + a.who : ''}${a.by ? ' (entro ' + a.by + ')' : ''}`).join('\n') ?? '',
      }))
      setExtracts(prev => ({ ...prev, ['form']: data }))
      toast.success('AI ha estratto i punti salienti')
    }
  }

  const save = async () => {
    if (!form.title.trim() || !form.summary.trim()) return
    setSaving(true)
    if (editId) {
      const { data } = await createClient().from('meeting_notes')
        .update({ title: form.title.trim(), date: form.date, summary: form.summary.trim(), decisions: form.decisions || null, next_actions: form.next_actions || null })
        .eq('id', editId).select().single()
      if (data) setItems(prev => prev.map(x => x.id === editId ? data as MeetingNote : x))
      toast.success('Riunione aggiornata')
    } else {
      const { data } = await createClient().from('meeting_notes')
        .insert({ project_id: project.id, client_id: client.id, title: form.title.trim(), date: form.date, summary: form.summary.trim(), decisions: form.decisions || null, next_actions: form.next_actions || null, created_by: currentProfile.id })
        .select().single()
      if (data) { setItems(prev => [data as MeetingNote, ...prev]); if (extracts['form']) setExtracts(prev => { const n = {...prev}; n[(data as MeetingNote).id] = n['form']; delete n['form']; return n }) }
      toast.success('Riunione salvata')
    }
    setSaving(false); setForm(false)
  }

  const remove = async (id: string) => {
    if (!confirm('Eliminare questo recap?')) return
    await createClient().from('meeting_notes').delete().eq('id', id)
    setItems(prev => prev.filter(x => x.id !== id))
    toast.success('Eliminata')
  }

  const moodStyle: Record<string, string> = {
    positivo: 'bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/20',
    neutro:   'bg-[#888]/10 text-[#888] border-[#888]/20',
    critico:  'bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20',
  }
  const moodEmoji: Record<string, string> = { positivo: '✅', neutro: '⚪', critico: '🔴' }

  const inp = 'w-full bg-[#111] border border-[#2A2A2A] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F5C800] placeholder:text-[#333]'

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-[#444]">{items.length} riunioni registrate</p>
        {isAdmin && (
          <button onClick={openNew}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-all"
            style={{ background: `${accent}15`, color: accent, border: `1px solid ${accent}30` }}>
            <Plus className="w-3 h-3" /> Nuovo recap
          </button>
        )}
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-14 text-center border border-dashed border-[#1A1A1A] rounded-2xl">
          <BookOpen className="w-8 h-8 text-[#1A1A1A]" />
          <div>
            <p className="text-sm font-semibold text-[#333]">Nessun recap ancora</p>
            <p className="text-xs text-[#222] mt-0.5 max-w-xs mx-auto">
              Carica la trascrizione di Plaud o Gemini, oppure scrivi un recap manuale.
            </p>
          </div>
          {isAdmin && <button onClick={openNew} className="text-xs font-bold mt-1" style={{ color: accent }}>+ Aggiungi il primo</button>}
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map(m => {
            const isCollapsed = collapsed.has(m.id)
            const ext = extracts[m.id]
            const mood = ext?.mood
            return (
              <div key={m.id} className="group border border-[#1A1A1A] rounded-2xl overflow-hidden hover:border-[#222] transition-all">
                <div className="flex items-center gap-3 px-4 py-3 cursor-pointer bg-[#090909]"
                  onClick={() => toggleCollapse(m.id)}>
                  <div className="shrink-0 w-9 text-center">
                    <p className="text-[8px] font-bold uppercase tracking-wider" style={{ color: accent }}>
                      {new Date(m.date).toLocaleDateString('it-IT', { month: 'short' }).toUpperCase()}
                    </p>
                    <p className="text-lg font-black text-white leading-tight">
                      {new Date(m.date).toLocaleDateString('it-IT', { day: '2-digit' })}
                    </p>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-white leading-tight">{m.title}</p>
                      {mood && (
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${moodStyle[mood]}`}>
                          {moodEmoji[mood]} {mood}
                        </span>
                      )}
                    </div>
                    {isCollapsed && <p className="text-[10px] text-[#333] mt-0.5 truncate">{m.summary}</p>}
                    {ext?.key_topics?.length && !isCollapsed && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {ext.key_topics.slice(0, 4).map((t, i) => (
                          <span key={i} className="text-[9px] px-1.5 py-0.5 rounded-md"
                            style={{ background: `${accent}10`, color: `${accent}99` }}>{t}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {isAdmin && (
                      <div className="hidden group-hover:flex gap-0.5">
                        <button onClick={e => { e.stopPropagation(); openEdit(m) }}
                          className="p-1.5 rounded-lg text-[#333] hover:text-white hover:bg-white/5 transition-all">
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button onClick={e => { e.stopPropagation(); printMeeting(m, ext ?? null) }}
                          className="p-1.5 rounded-lg text-[#333] hover:text-white hover:bg-white/5 transition-all">
                          <Printer className="w-3 h-3" />
                        </button>
                        <button onClick={e => { e.stopPropagation(); remove(m.id) }}
                          className="p-1.5 rounded-lg text-[#333] hover:text-[#EF4444] hover:bg-[#EF4444]/10 transition-all">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                    {isCollapsed
                      ? <ChevronDown className="w-3.5 h-3.5 text-[#2A2A2A]" />
                      : <ChevronUp className="w-3.5 h-3.5 text-[#333]" />}
                  </div>
                </div>

                {!isCollapsed && (
                  <div className="px-4 pb-4 pt-1 border-t border-[#0E0E0E] bg-[#060606] space-y-4">
                    <div className="pt-3">
                      <p className="text-[9px] uppercase tracking-widest font-bold text-[#2A2A2A] mb-2">Sintesi</p>
                      <p className="text-sm text-[#aaa] leading-relaxed">{m.summary}</p>
                    </div>

                    {(ext?.participants?.length || ext?.key_topics?.length) && (
                      <div className="flex flex-wrap gap-4">
                        {ext?.participants?.length && (
                          <div>
                            <p className="text-[9px] uppercase tracking-widest font-bold text-[#2A2A2A] mb-1.5">Partecipanti</p>
                            <div className="flex flex-wrap gap-1">
                              {ext.participants.map((p, i) => (
                                <span key={i} className="flex items-center gap-1 text-[10px] text-[#555] bg-[#111] border border-[#1A1A1A] px-2 py-0.5 rounded-full">
                                  <Users className="w-2.5 h-2.5" /> {p}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {m.decisions && (
                      <div>
                        <p className="text-[9px] uppercase tracking-widest font-bold text-[#2A2A2A] mb-2">Decisioni prese</p>
                        <ul className="space-y-1">
                          {m.decisions.split('\n').filter(Boolean).map((d, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-[#888]">
                              <Check className="w-3 h-3 mt-0.5 shrink-0 text-[#22C55E]" />
                              {d}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {ext?.actions?.length && !m.next_actions && (
                      <div>
                        <p className="text-[9px] uppercase tracking-widest font-bold text-[#2A2A2A] mb-2">Prossime azioni</p>
                        <div className="space-y-1.5">
                          {ext.actions.map((a, i) => (
                            <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-[#0C0C0C] border border-[#111]">
                              <div className="w-4 h-4 rounded-md flex items-center justify-center shrink-0 mt-0.5"
                                style={{ background: `${accent}15` }}>
                                <span className="text-[8px] font-black" style={{ color: accent }}>{i + 1}</span>
                              </div>
                              <div>
                                <p className="text-sm text-white font-medium">{a.what}</p>
                                <p className="text-[10px] text-[#444] mt-0.5">
                                  {a.who && `👤 ${a.who}`}{a.who && a.by && ' · '}{a.by && `📅 ${a.by}`}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {m.next_actions && (
                      <div>
                        <p className="text-[9px] uppercase tracking-widest font-bold text-[#2A2A2A] mb-2">Prossime azioni</p>
                        <ul className="space-y-1">
                          {m.next_actions.split('\n').filter(Boolean).map((a, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-[#888]">
                              <span className="w-4 h-4 rounded-md flex items-center justify-center shrink-0 mt-0.5 text-[8px] font-black"
                                style={{ background: `${accent}15`, color: accent }}>{i + 1}</span>
                              {a}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-2 border-t border-[#0E0E0E]">
                      <button onClick={() => printMeeting(m, ext ?? null)}
                        className="flex items-center gap-1.5 text-xs text-[#333] hover:text-white px-3 py-1.5 border border-[#1A1A1A] hover:border-[#2A2A2A] rounded-lg transition-all">
                        <Printer className="w-3 h-3" /> Stampa PDF
                      </button>
                      {isAdmin && (
                        <button onClick={() => openEdit(m)}
                          className="flex items-center gap-1.5 text-xs text-[#333] hover:text-white px-3 py-1.5 border border-[#1A1A1A] hover:border-[#2A2A2A] rounded-lg transition-all">
                          <Edit2 className="w-3 h-3" /> Modifica
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setForm(false)}>
          <div className="bg-[#0C0C0C] border border-[#2A2A2A] rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg shadow-2xl flex flex-col max-h-[92vh]"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1A1A1A] shrink-0">
              <div>
                <h3 className="text-sm font-bold text-white">{editId ? 'Modifica recap' : 'Nuovo recap riunione'}</h3>
                <p className="text-[10px] text-[#444] mt-0.5">
                  {editId ? 'Aggiorna i dati del recap' : 'Carica trascrizione AI o scrivi manualmente'}
                </p>
              </div>
              <button onClick={() => setForm(false)} className="p-1.5 text-[#444] hover:text-white"><X className="w-4 h-4" /></button>
            </div>

            {!editId && (
              <div className="flex gap-1 px-5 pt-4 shrink-0">
                {(['manual', 'file'] as const).map(t => (
                  <button key={t} onClick={() => setTab2(t)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${tab === t ? 'text-white' : 'text-[#444] hover:text-[#777]'}`}
                    style={tab === t ? { background: `${accent}15`, border: `1px solid ${accent}30`, color: accent } : { border: '1px solid transparent' }}>
                    {t === 'file' ? <><Upload className="w-3 h-3" /> Carica file</> : <><Edit2 className="w-3 h-3" /> Scrivi manualmente</>}
                  </button>
                ))}
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-5 pb-5 pt-4 space-y-3">
              {tab === 'file' && !editId && (
                <div className="space-y-3">
                  <div
                    className="border-2 border-dashed border-[#2A2A2A] rounded-xl p-6 text-center hover:border-[#444] transition-colors cursor-pointer"
                    onClick={() => fileRef.current?.click()}>
                    <Upload className="w-6 h-6 text-[#333] mx-auto mb-2" />
                    <p className="text-sm font-semibold text-[#555]">Carica trascrizione</p>
                    <p className="text-[10px] text-[#333] mt-1">TXT da Plaud, Gemini, Otter, Fireflies…</p>
                    {uploadText && <p className="text-[10px] mt-2 font-bold" style={{ color: accent }}>✓ File caricato ({uploadText.length.toLocaleString()} caratteri)</p>}
                    <input ref={fileRef} type="file" accept=".txt,.md,.text" className="hidden" onChange={handleFile} />
                  </div>

                  {uploadText && (
                    <button onClick={extractFromFile} disabled={aiLoading === 'form'}
                      className="w-full py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all"
                      style={{ background: `${accent}15`, color: accent, border: `1px solid ${accent}30` }}>
                      {aiLoading === 'form'
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> AI sta analizzando…</>
                        : <><Sparkles className="w-3.5 h-3.5" /> Estrai punti salienti con AI</>}
                    </button>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-[10px] text-[#444] mb-1.5 uppercase tracking-wider">Titolo *</label>
                  <input value={form.title} onChange={e => setForm2(p => ({ ...p, title: e.target.value }))} className={inp} placeholder="Es. Sprint review Q2" />
                </div>
                <div>
                  <label className="block text-[10px] text-[#444] mb-1.5 uppercase tracking-wider">Data *</label>
                  <input type="date" value={form.date} onChange={e => setForm2(p => ({ ...p, date: e.target.value }))} className={inp} />
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-[#444] mb-1.5 uppercase tracking-wider">Sintesi *</label>
                <textarea value={form.summary} onChange={e => setForm2(p => ({ ...p, summary: e.target.value }))} rows={3}
                  className={`${inp} resize-none`} placeholder="Cosa è stato discusso, obiettivi della riunione, contesto…" />
              </div>
              <div>
                <label className="block text-[10px] text-[#444] mb-1.5 uppercase tracking-wider">Decisioni prese</label>
                <textarea value={form.decisions} onChange={e => setForm2(p => ({ ...p, decisions: e.target.value }))} rows={3}
                  className={`${inp} resize-none`} placeholder="Una decisione per riga…" />
              </div>
              <div>
                <label className="block text-[10px] text-[#444] mb-1.5 uppercase tracking-wider">Prossime azioni</label>
                <textarea value={form.next_actions} onChange={e => setForm2(p => ({ ...p, next_actions: e.target.value }))} rows={3}
                  className={`${inp} resize-none`} placeholder="Una azione per riga — chi fa cosa entro quando…" />
              </div>
            </div>

            <div className="flex gap-3 px-5 pb-5 shrink-0 border-t border-[#111] pt-4">
              <button onClick={() => setForm(false)} className="flex-1 py-2.5 border border-[#2A2A2A] rounded-xl text-sm text-[#555] hover:text-white">Annulla</button>
              <button onClick={save} disabled={saving || !form.title.trim() || !form.summary.trim()}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-black disabled:opacity-40 flex items-center justify-center gap-2"
                style={{ background: accent }}>
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Salva recap
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
