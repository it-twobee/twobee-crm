'use client'

import { useState, useMemo } from 'react'
import { Plus, Trash2, Edit2, X, Loader2, Clock, Calendar, Filter } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { TimeEntryRow, TimeEntryCategory, Project, Client, Profile } from '@/lib/types/database'

const CATEGORIES: { value: TimeEntryCategory; label: string; color: string }[] = [
  { value: 'sviluppo',  label: 'Sviluppo',   color: '#60A5FA' },
  { value: 'design',    label: 'Design',      color: '#A78BFA' },
  { value: 'riunione',  label: 'Riunione',    color: '#F59E0B' },
  { value: 'strategia', label: 'Strategia',   color: '#F5C800' },
  { value: 'formazione',label: 'Formazione',  color: '#34D399' },
  { value: 'admin',     label: 'Admin',       color: '#6B7280' },
  { value: 'altro',     label: 'Altro',       color: '#9CA3AF' },
]

const catColor = (c: string) => CATEGORIES.find(x => x.value === c)?.color ?? '#9CA3AF'
const catLabel = (c: string) => CATEGORIES.find(x => x.value === c)?.label ?? c

const inp = 'w-full bg-[#0A0A0A] border border-[#2A2A2A] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F5C800] placeholder:text-[#333]'

type FormState = {
  date: string; hours: string; category: TimeEntryCategory
  project_id: string; client_id: string; task_id: string; note: string; profile_id: string
}

const EMPTY_FORM: FormState = {
  date: new Date().toISOString().slice(0, 10),
  hours: '', category: 'sviluppo',
  project_id: '', client_id: '', task_id: '', note: '', profile_id: '',
}

interface Props {
  initialEntries: TimeEntryRow[]
  profiles: Pick<Profile, 'id' | 'full_name' | 'app_role'>[]
  projects: (Pick<Project, 'id' | 'name'> & { client_id: string })[]
  clients: Pick<Client, 'id' | 'company_name'>[]
  currentUserId: string
  isAdmin: boolean
}

export function TimesheetTable({ initialEntries, profiles, projects, clients, currentUserId, isAdmin }: Props) {
  const [entries, setEntries] = useState<TimeEntryRow[]>(initialEntries)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM, profile_id: currentUserId })
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [filterUser, setFilterUser] = useState<string>(isAdmin ? '' : currentUserId)
  const [filterMonth, setFilterMonth] = useState<string>(new Date().toISOString().slice(0, 7))

  const filtered = useMemo(() => {
    return entries.filter(e => {
      if (filterUser && e.profile_id !== filterUser) return false
      if (filterMonth && !e.date.startsWith(filterMonth)) return false
      return true
    })
  }, [entries, filterUser, filterMonth])

  const totalHours = filtered.reduce((s, e) => s + e.hours, 0)

  const byUser = useMemo(() => {
    const map: Record<string, number> = {}
    filtered.forEach(e => { map[e.profile_id] = (map[e.profile_id] ?? 0) + e.hours })
    return map
  }, [filtered])

  const openNew = () => {
    setEditId(null)
    setForm({ ...EMPTY_FORM, profile_id: currentUserId })
    setShowForm(true)
  }

  const openEdit = (e: TimeEntryRow) => {
    setEditId(e.id)
    setForm({
      date: e.date, hours: String(e.hours), category: e.category as TimeEntryCategory,
      project_id: e.project_id ?? '', client_id: e.client_id ?? '',
      task_id: e.task_id ?? '', note: e.note ?? '', profile_id: e.profile_id,
    })
    setShowForm(true)
  }

  const save = async () => {
    if (!form.hours || Number(form.hours) <= 0) { toast.error('Inserisci le ore'); return }
    setSaving(true)
    const payload = {
      profile_id: form.profile_id || currentUserId,
      date: form.date,
      hours: Number(form.hours),
      category: form.category,
      project_id: form.project_id || null,
      client_id: form.client_id || null,
      task_id: form.task_id || null,
      note: form.note || null,
    }

    if (editId) {
      const { data, error } = await createClient().from('time_entries').update(payload).eq('id', editId).select(`
        *, profile:profiles(id,full_name), project:projects(id,name),
        client:clients(id,company_name), task:tasks(id,title)
      `).single()
      setSaving(false)
      if (error) { toast.error(error.message); return }
      setEntries(prev => prev.map(e => e.id === editId ? data as unknown as TimeEntryRow : e))
      toast.success('Voce aggiornata')
    } else {
      const { data, error } = await createClient().from('time_entries').insert(payload).select(`
        *, profile:profiles(id,full_name), project:projects(id,name),
        client:clients(id,company_name), task:tasks(id,title)
      `).single()
      setSaving(false)
      if (error) { toast.error(error.message); return }
      setEntries(prev => [data as unknown as TimeEntryRow, ...prev])
      toast.success('Ore registrate')
    }
    setShowForm(false)
  }

  const remove = async (id: string) => {
    if (!confirm('Eliminare questa voce?')) return
    await createClient().from('time_entries').delete().eq('id', id)
    setEntries(prev => prev.filter(e => e.id !== id))
    toast.success('Eliminata')
  }

  const profileName = (id: string) => profiles.find(p => p.id === id)?.full_name ?? '—'

  const filteredProjects = form.client_id
    ? projects.filter(p => p.client_id === form.client_id)
    : projects

  return (
    <div>
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="bg-[#0C0C0C] border border-[#1A1A1A] rounded-2xl p-4">
          <p className="text-[10px] text-[#444] uppercase tracking-wider mb-1">Ore totali</p>
          <p className="text-2xl font-black text-[#F5C800]">{totalHours.toFixed(1)}</p>
          <p className="text-[10px] text-[#333] mt-0.5">{filtered.length} voci</p>
        </div>
        <div className="bg-[#0C0C0C] border border-[#1A1A1A] rounded-2xl p-4">
          <p className="text-[10px] text-[#444] uppercase tracking-wider mb-1">Media giornaliera</p>
          <p className="text-2xl font-black text-white">
            {filtered.length ? (totalHours / new Set(filtered.map(e => e.date)).size).toFixed(1) : '—'}
          </p>
          <p className="text-[10px] text-[#333] mt-0.5">ore/giorno attivo</p>
        </div>
        <div className="col-span-2 bg-[#0C0C0C] border border-[#1A1A1A] rounded-2xl p-4">
          <p className="text-[10px] text-[#444] uppercase tracking-wider mb-2">Per categoria</p>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.filter(c => filtered.some(e => e.category === c.value)).map(c => {
              const h = filtered.filter(e => e.category === c.value).reduce((s, e) => s + e.hours, 0)
              return (
                <span key={c.value} className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg"
                  style={{ background: `${c.color}12`, color: c.color, border: `1px solid ${c.color}25` }}>
                  {c.label} · {h.toFixed(1)}h
                </span>
              )
            })}
          </div>
        </div>
      </div>

      {/* Filters + action */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2 flex-1 flex-wrap">
          <div className="flex items-center gap-1.5 bg-[#0C0C0C] border border-[#1A1A1A] rounded-xl px-3 py-2">
            <Calendar className="w-3.5 h-3.5 text-[#444]" />
            <input type="month" value={filterMonth}
              onChange={e => setFilterMonth(e.target.value)}
              className="bg-transparent text-sm text-white focus:outline-none" />
          </div>
          {isAdmin && (
            <div className="flex items-center gap-1.5 bg-[#0C0C0C] border border-[#1A1A1A] rounded-xl px-3 py-2">
              <Filter className="w-3.5 h-3.5 text-[#444]" />
              <select value={filterUser} onChange={e => setFilterUser(e.target.value)}
                className="bg-transparent text-sm text-white focus:outline-none">
                <option value="">Tutti i membri</option>
                {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            </div>
          )}
        </div>
        <button onClick={openNew}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-black bg-[#F5C800] hover:bg-yellow-400 transition-colors">
          <Plus className="w-3.5 h-3.5" /> Registra ore
        </button>
      </div>

      {/* Per-user summary (admin only) */}
      {isAdmin && !filterUser && Object.keys(byUser).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {Object.entries(byUser).map(([pid, h]) => (
            <button key={pid} onClick={() => setFilterUser(pid)}
              className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-xl border border-[#1A1A1A] bg-[#0A0A0A] text-[#666] hover:text-white hover:border-[#333] transition-all">
              <Clock className="w-3 h-3" /> {profileName(pid)} · {h.toFixed(1)}h
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="border border-[#1A1A1A] rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#111] bg-[#0A0A0A]">
                <th className="text-left px-4 py-3 text-[10px] font-bold text-[#444] uppercase tracking-wider">Data</th>
                {(isAdmin && !filterUser) && <th className="text-left px-4 py-3 text-[10px] font-bold text-[#444] uppercase tracking-wider">Persona</th>}
                <th className="text-left px-4 py-3 text-[10px] font-bold text-[#444] uppercase tracking-wider">Progetto / Cliente</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-[#444] uppercase tracking-wider">Categoria</th>
                <th className="text-right px-4 py-3 text-[10px] font-bold text-[#444] uppercase tracking-wider">Ore</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-[#444] uppercase tracking-wider">Note</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-14 text-[#333] text-sm">
                    Nessuna voce per il periodo selezionato.
                  </td>
                </tr>
              ) : (
                filtered.map(e => (
                  <tr key={e.id} className="group border-b border-[#0E0E0E] hover:bg-[#0A0A0A] transition-colors">
                    <td className="px-4 py-3 text-white text-sm whitespace-nowrap">
                      {new Date(e.date).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    {(isAdmin && !filterUser) && (
                      <td className="px-4 py-3 text-[#888] text-sm">{e.profile?.full_name ?? profileName(e.profile_id)}</td>
                    )}
                    <td className="px-4 py-3">
                      {e.project ? (
                        <div>
                          <p className="text-sm text-white font-semibold leading-tight">{e.project.name}</p>
                          {e.client && <p className="text-[10px] text-[#444]">{e.client.company_name}</p>}
                        </div>
                      ) : e.client ? (
                        <p className="text-sm text-[#888]">{e.client.company_name}</p>
                      ) : (
                        <p className="text-sm text-[#333]">—</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] font-bold px-2 py-1 rounded-lg"
                        style={{ background: `${catColor(e.category)}12`, color: catColor(e.category), border: `1px solid ${catColor(e.category)}25` }}>
                        {catLabel(e.category)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-black text-white">
                      {e.hours.toFixed(1)}h
                    </td>
                    <td className="px-4 py-3 text-[#555] text-xs max-w-xs truncate">{e.note ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                        {(isAdmin || e.profile_id === currentUserId) && (
                          <>
                            <button onClick={() => openEdit(e)}
                              className="p-1.5 rounded-lg text-[#333] hover:text-white hover:bg-white/5 transition-all">
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button onClick={() => remove(e.id)}
                              className="p-1.5 rounded-lg text-[#333] hover:text-[#EF4444] hover:bg-[#EF4444]/10 transition-all">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setShowForm(false)}>
          <div className="bg-[#0E0E0E] border border-[#2A2A2A] rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1A1A1A]">
              <div>
                <h3 className="text-sm font-bold text-white">{editId ? 'Modifica voce' : 'Registra ore'}</h3>
                <p className="text-[10px] text-[#444] mt-0.5">Aggiungi una voce al tuo timesheet</p>
              </div>
              <button onClick={() => setShowForm(false)} className="p-1 text-[#444] hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              {isAdmin && (
                <div>
                  <label className="block text-[10px] text-[#444] mb-1.5 uppercase tracking-wider">Persona</label>
                  <select value={form.profile_id} onChange={e => setForm(p => ({ ...p, profile_id: e.target.value }))} className={inp}>
                    {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-[#444] mb-1.5 uppercase tracking-wider">Data *</label>
                  <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} className={inp} />
                </div>
                <div>
                  <label className="block text-[10px] text-[#444] mb-1.5 uppercase tracking-wider">Ore *</label>
                  <input type="number" step="0.5" min="0.5" max="24" value={form.hours}
                    onChange={e => setForm(p => ({ ...p, hours: e.target.value }))}
                    className={inp} placeholder="8" />
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-[#444] mb-1.5 uppercase tracking-wider">Categoria</label>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORIES.map(c => (
                    <button key={c.value} type="button" onClick={() => setForm(p => ({ ...p, category: c.value }))}
                      className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition-all"
                      style={form.category === c.value
                        ? { background: `${c.color}20`, color: c.color, border: `1px solid ${c.color}40` }
                        : { background: 'transparent', color: '#444', border: '1px solid #1A1A1A' }}>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-[#444] mb-1.5 uppercase tracking-wider">Cliente</label>
                <select value={form.client_id}
                  onChange={e => setForm(p => ({ ...p, client_id: e.target.value, project_id: '' }))}
                  className={inp}>
                  <option value="">— Nessun cliente —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-[10px] text-[#444] mb-1.5 uppercase tracking-wider">Progetto</label>
                <select value={form.project_id} onChange={e => setForm(p => ({ ...p, project_id: e.target.value }))} className={inp}>
                  <option value="">— Nessun progetto —</option>
                  {filteredProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-[10px] text-[#444] mb-1.5 uppercase tracking-wider">Note</label>
                <textarea value={form.note} onChange={e => setForm(p => ({ ...p, note: e.target.value }))}
                  rows={2} className={`${inp} resize-none`} placeholder="Cosa hai fatto…" />
              </div>
            </div>

            <div className="flex gap-3 px-5 pb-5">
              <button onClick={() => setShowForm(false)}
                className="flex-1 py-2.5 border border-[#2A2A2A] rounded-xl text-sm text-[#555] hover:text-white">
                Annulla
              </button>
              <button onClick={save} disabled={saving || !form.hours || !form.date}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-black bg-[#F5C800] hover:bg-yellow-400 disabled:opacity-40 flex items-center justify-center gap-2">
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {editId ? 'Aggiorna' : 'Salva ore'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
