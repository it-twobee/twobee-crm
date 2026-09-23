'use client'

import { useState, useEffect, useTransition } from 'react'
import { Users, Shield, Bell, Mail, Crown, X, Check, ChevronDown, Loader2, Trash2, Plus, AlertCircle, Pencil, KeyRound, AtSign, User, Copy, Link2, RefreshCw, UserMinus, ShieldAlert, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Profile, RolePermission, Invitation, AppRole, PermissionSection, PermissionAction } from '@/lib/types/database'
import {
  SUPER_ADMIN_EMAILS, ROLE_LABELS, ROLE_COLORS, SECTIONS, ACTIONS,
  SECTION_LABELS, ACTION_LABELS, isSuperAdmin, buildPermMap,
} from '@/lib/permissions'
import { adminChangeUserEmail, adminChangeUserName, adminSendPasswordReset, adminUpdateUserProfile, adminUserTraces, adminDeleteUser, type Traccia } from '@/app/actions/admin-user'
import { etichettaTraccia } from '@/lib/tracce-membro'

const EDITABLE_ROLES: Exclude<AppRole, 'super_admin'>[] = ['admin', 'manager', 'senior', 'junior', 'stage', 'freelance', 'partner', 'viewer', 'client', 'guest']
const AREAS = ['growth', 'digital', 'ops', 'hr']
const COMPETENCIES = ['Meta Ads','Google Ads','TikTok Ads','LinkedIn Ads','YouTube Ads','SEO','Content','Email Marketing','Copywriting','Web Design','E-commerce','CRM','Analytics','IT / AI','Strategia','Customer Care']

interface Props {
  currentProfile: Profile
  profiles: Profile[]
  permissions: RolePermission[]
  invitations: Invitation[]
  clients: { id: string; company_name: string }[]
}

const ic = 'w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold/50'
const TABS = ['👤 Utenti', '🔐 Permessi', '✉️ Inviti']

// ─────────────────────────────────────────────────────────
// GOD MODE banner
// ─────────────────────────────────────────────────────────
function GodModeBanner() {
  return (
    <div className="mb-6 flex items-center gap-3 bg-gold/10 border border-gold/40 rounded-xl px-5 py-3">
      <Crown className="w-5 h-5 text-gold-text shrink-0" />
      <div>
        <p className="text-sm font-black text-gold-text">GOD MODE attivo</p>
        <p className="text-xs text-gold-text/70">Hai accesso illimitato a tutto. Alcune azioni sono irreversibili — procedi con attenzione.</p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Tab: Utenti
// ─────────────────────────────────────────────────────────
type EditTab = 'profilo' | 'email' | 'password' | 'clienti'

function UserEditModal({
  user, currentProfile, clients, onClose, onSaved,
}: {
  user: Profile
  currentProfile: Profile
  clients: { id: string; company_name: string }[]
  onClose: () => void
  onSaved: (updated: Partial<Profile>) => void
}) {
  const [tab, setTab] = useState<EditTab>('profilo')
  const isSA = SUPER_ADMIN_EMAILS.includes(user.email)

  // ── Profilo ──
  const [fullName, setFullName] = useState(user.full_name)
  const [appRole, setAppRole] = useState<AppRole>(user.app_role ?? 'junior')
  const [area, setArea] = useState(user.area ?? '')
  const [jobTitle, setJobTitle] = useState(user.job_title ?? '')
  const [competencies, setCompetencies] = useState<string[]>(user.competencies ?? [])
  const [isActive, setIsActive] = useState(user.is_active)
  const [hireDate, setHireDate] = useState(user.hire_date ?? '')
  const [birthDate, setBirthDate] = useState(user.birth_date ?? '')
  const [savingProfile, setSavingProfile] = useState(false)

  // ── Email ──
  const [newEmail, setNewEmail] = useState('')
  const [savingEmail, setSavingEmail] = useState(false)

  // ── Password ──
  const [sendingReset, setSendingReset] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  // ── Clienti ──
  const [assignedClients, setAssignedClients] = useState<string[]>([])
  const [loadingClients, setLoadingClients] = useState(false)
  const [clientsLoaded, setClientsLoaded] = useState(false)

  const loadClients = async () => {
    if (clientsLoaded) return
    setLoadingClients(true)
    const supabase = createClient()
    const { data } = await supabase.from('user_client_assignments').select('client_id').eq('user_id', user.id)
    setAssignedClients((data ?? []).map((r: { client_id: string }) => r.client_id))
    setLoadingClients(false)
    setClientsLoaded(true)
  }

  const toggleCompetency = (c: string) =>
    setCompetencies((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c])

  const saveProfile = async () => {
    setSavingProfile(true)
    const updates = {
      app_role: appRole, area: area || null, job_title: jobTitle || null,
      competencies, is_active: isActive,
      hire_date: hireDate || null, birth_date: birthDate || null,
    }
    try {
      // Tutto via server action (service role): l'RLS su profiles consente
      // l'update solo del proprio profilo, quindi l'admin deve passare da qui.
      // adminUpdateUserProfile allinea anche `role` → aggiorna il portale.
      if (fullName !== user.full_name) await adminChangeUserName(user.id, fullName)
      await adminUpdateUserProfile(user.id, {
        appRole, area: area || null, jobTitle: jobTitle || null, competencies, isActive,
        hireDate: hireDate || null, birthDate: birthDate || null,
      })
    } catch (e) { toast.error((e as Error).message); setSavingProfile(false); return }
    setSavingProfile(false)
    toast.success('Profilo e ruolo aggiornati — il portale si adegua al nuovo ruolo')
    onSaved({ ...updates, full_name: fullName })
  }

  const saveEmail = async () => {
    if (!newEmail.trim()) return
    setSavingEmail(true)
    try {
      await adminChangeUserEmail(user.id, newEmail.trim())
      toast.success('Email aggiornata')
      onSaved({ email: newEmail.trim() })
      setNewEmail('')
    } catch (e) { toast.error((e as Error).message) }
    setSavingEmail(false)
  }

  const sendReset = async () => {
    setSendingReset(true)
    try {
      await adminSendPasswordReset(user.email)
      setResetSent(true)
      toast.success('Email di reset inviata a ' + user.email)
    } catch (e) { toast.error((e as Error).message) }
    setSendingReset(false)
  }

  const toggleClientAssign = async (clientId: string) => {
    const supabase = createClient()
    const isAssigned = assignedClients.includes(clientId)
    if (isAssigned) {
      await supabase.from('user_client_assignments').delete().eq('user_id', user.id).eq('client_id', clientId)
      setAssignedClients((p) => p.filter((id) => id !== clientId))
    } else {
      await supabase.from('user_client_assignments').insert({ user_id: user.id, client_id: clientId, assigned_by: currentProfile.id })
      setAssignedClients((p) => [...p, clientId])
    }
  }

  const MODAL_TABS: { key: EditTab; label: string; icon: React.ReactNode }[] = [
    { key: 'profilo', label: 'Profilo', icon: <User className="w-3.5 h-3.5" /> },
    { key: 'email', label: 'Email', icon: <AtSign className="w-3.5 h-3.5" /> },
    { key: 'password', label: 'Password', icon: <KeyRound className="w-3.5 h-3.5" /> },
    { key: 'clienti', label: 'Clienti', icon: <Users className="w-3.5 h-3.5" /> },
  ]

  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-surface border border-border rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-5 border-b border-border">
          <div className="w-10 h-10 rounded-full bg-gold/20 border border-gold/30 flex items-center justify-center text-base font-black text-gold-text shrink-0">
            {user.avatar_url
              ? <img src={user.avatar_url} className="w-full h-full rounded-full object-cover" alt="" />
              : (user.full_name || user.email)[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-text-primary truncate">{user.full_name}</p>
            <p className="text-xs text-text-secondary truncate">{user.email}</p>
          </div>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary"><X className="w-5 h-5" /></button>
        </div>

        {/* Sub-tabs */}
        <div className="flex border-b border-border px-2">
          {MODAL_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); if (t.key === 'clienti') loadClients() }}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold transition-colors border-b-2 ${tab === t.key ? 'text-gold-text border-gold' : 'text-text-secondary border-transparent hover:text-text-primary'}`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">

          {/* ── PROFILO ── */}
          {tab === 'profilo' && (
            <>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Nome completo</label>
                <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={ic} placeholder="Nome Cognome" />
              </div>
              {!isSA && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">Ruolo</label>
                    <select value={appRole} onChange={(e) => setAppRole(e.target.value as AppRole)} className={ic}>
                      {EDITABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">Area</label>
                    <select value={area} onChange={(e) => setArea(e.target.value)} className={ic}>
                      <option value="">— Nessuna —</option>
                      {AREAS.map((a) => <option key={a} value={a} className="capitalize">{a}</option>)}
                    </select>
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs text-text-secondary mb-1">Titolo / ruolo aziendale</label>
                <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="es. Social Media Manager" className={ic} />
              </div>
              {/* §361 — due date della **persona**, non della busta paga: le
                  omonime di `hr_people` riguardano i contratti possibili e
                  valgono solo per chi è a libro paga. Vuote non fanno danno:
                  quello che manca non viene detto (mai una data inventata). */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor={`hire-${user.id}`} className="block text-xs text-text-secondary mb-1">In TwoBee dal</label>
                  <input id={`hire-${user.id}`} type="date" value={hireDate}
                    onChange={(e) => setHireDate(e.target.value)} className={ic} />
                </div>
                <div>
                  <label htmlFor={`birth-${user.id}`} className="block text-xs text-text-secondary mb-1">Data di nascita</label>
                  <input id={`birth-${user.id}`} type="date" value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)} className={ic} />
                </div>
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-2">Competenze</label>
                <div className="flex flex-wrap gap-1.5">
                  {COMPETENCIES.map((c) => (
                    <button key={c} type="button" onClick={() => toggleCompetency(c)}
                      className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${competencies.includes(c) ? 'bg-gold/20 border-gold/40 text-gold-text' : 'border-border text-text-secondary hover:border-border'}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between pt-2">
                <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                  <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="accent-gold" />
                  Utente attivo
                </label>
                <button onClick={saveProfile} disabled={savingProfile} className="flex items-center gap-1.5 bg-gold text-on-gold text-xs font-bold px-4 py-2 rounded-lg hover:bg-gold/90 disabled:opacity-50">
                  {savingProfile ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Salva
                </button>
              </div>
            </>
          )}

          {/* ── EMAIL ── */}
          {tab === 'email' && (
            <>
              <div className="bg-background border border-border rounded-lg px-4 py-3">
                <p className="text-xs text-text-secondary">Email attuale</p>
                <p className="text-sm font-semibold text-text-primary mt-0.5">{user.email}</p>
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Nuova email</label>
                <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className={ic} placeholder="nuova@email.com" />
              </div>
              <p className="text-xs text-text-secondary">L'email verrà aggiornata immediatamente nel sistema.</p>
              <button onClick={saveEmail} disabled={savingEmail || !newEmail.trim()} className="flex items-center gap-1.5 bg-gold text-on-gold text-xs font-bold px-4 py-2 rounded-lg hover:bg-gold/90 disabled:opacity-50">
                {savingEmail ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <AtSign className="w-3.5 h-3.5" />} Aggiorna email
              </button>
            </>
          )}

          {/* ── PASSWORD ── */}
          {tab === 'password' && (
            <>
              <div className="bg-background border border-border rounded-xl p-5 text-center space-y-3">
                <KeyRound className="w-10 h-10 text-gold-text mx-auto" />
                <div>
                  <p className="text-sm font-bold text-text-primary">Reset password per {user.full_name}</p>
                  <p className="text-xs text-text-secondary mt-1">Verrà inviata un'email a <strong className="text-text-primary">{user.email}</strong> con un link per impostare una nuova password.</p>
                </div>
                {resetSent ? (
                  <div className="flex items-center justify-center gap-2 text-sm text-success bg-success/10 border border-success/20 rounded-lg px-4 py-3">
                    <Check className="w-4 h-4 shrink-0" /> Email inviata!
                  </div>
                ) : (
                  <button onClick={sendReset} disabled={sendingReset}
                    className="flex items-center gap-2 bg-gold text-on-gold text-sm font-bold px-5 py-2.5 rounded-lg hover:bg-gold/90 disabled:opacity-50 mx-auto">
                    {sendingReset ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                    Invia link di reset
                  </button>
                )}
              </div>
            </>
          )}

          {/* ── CLIENTI ── */}
          {tab === 'clienti' && (
            <>
              <p className="text-xs text-text-secondary">{assignedClients.length} cliente/i assegnati</p>
              {loadingClients ? (
                <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-gold-text" /></div>
              ) : (
                <div className="space-y-1">
                  {clients.map((c) => {
                    const assigned = assignedClients.includes(c.id)
                    return (
                      <button key={c.id} onClick={() => toggleClientAssign(c.id)}
                        className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg border transition-colors text-left ${assigned ? 'border-gold/40 bg-gold/5 text-gold-text' : 'border-border text-text-secondary hover:text-text-primary'}`}>
                        <span className="text-sm">{c.company_name}</span>
                        {assigned && <Check className="w-4 h-4" />}
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * §362 — la conferma di un'eliminazione definitiva.
 *
 * Prima di chiedere «sei sicuro?» va detto **di cosa**: la finestra interroga
 * lo schema (`tracce_membro`) e mostra cosa la persona si porta dietro. Tre
 * esiti, e sono diversi fra loro:
 *
 * - **niente**: è un account che non ha mai lavorato — un invito di prova, un
 *   doppione. Si elimina;
 * - **roba che si cancella con lui**: si elimina, ma l'elenco si legge prima.
 *   Nessuno deve scoprire dopo cosa è sparito;
 * - **roba che blocca**: non si elimina, e non perché lo diciamo noi — il
 *   database rifiuterebbe comunque. Qui si disattiva, e la storia resta intera.
 *
 * Il nome da riscrivere non è teatro: è l'unico modo perché un clic partito
 * sulla riga sbagliata non diventi una cancellazione.
 */
function DeleteUserDialog({ user, onClose, onDeleted, onDisattiva }: {
  user: Profile
  onClose: () => void
  onDeleted: (id: string) => void
  /* §418 — la via d'uscita. Senza, questa finestra è un vicolo cieco: spiega
     perché la porta è chiusa e lascia come unica scelta «Annulla», mentre
     l'azione giusta — disattivare — sta scritta nel testo e non si può fare. */
  onDisattiva: (id: string) => Promise<void>
}) {
  const [tracce, setTracce] = useState<Traccia[] | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [conferma, setConferma] = useState('')
  const [pending, setPending] = useState(false)
  const [disattivando, setDisattivando] = useState(false)

  useEffect(() => {
    let vivo = true
    adminUserTraces(user.id)
      .then((t) => { if (vivo) setTracce(t) })
      .catch((e: Error) => { if (vivo) { setErrore(e.message); setTracce([]) } })
    return () => { vivo = false }
  }, [user.id])

  const bloccanti = (tracce ?? []).filter((t) => t.azione === 'no action' || t.azione === 'restrict')
  const inCascata = (tracce ?? []).filter((t) => t.azione === 'cascade')
  const atteso = (user.full_name || user.email).trim()
  const puo = tracce !== null && !errore && bloccanti.length === 0 && conferma.trim() === atteso

  const elimina = async () => {
    setPending(true)
    try {
      await adminDeleteUser(user.id)
      toast.success(`${atteso} eliminato definitivamente`)
      onDeleted(user.id)
    } catch (e) { toast.error((e as Error).message); setPending(false) }
  }

  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-surface border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-5 border-b border-border">
          <ShieldAlert className="w-5 h-5 text-error shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-text-primary">Elimina definitivamente</p>
            <p className="text-xs text-text-secondary truncate">{atteso} · {user.email}</p>
          </div>
          <button onClick={onClose} aria-label="Chiudi" className="text-text-secondary hover:text-text-primary">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {tracce === null ? (
            <div className="flex items-center gap-2 text-xs text-text-secondary">
              <Loader2 className="w-4 h-4 animate-spin" /> Controllo cosa si porta dietro…
            </div>
          ) : errore ? (
            <p className="text-xs text-error">{errore}</p>
          ) : bloccanti.length > 0 ? (
            <>
              <p className="text-sm text-text-primary">
                Ha lasciato qualcosa che resta anche senza di lui, e il database non lo lascia cancellare.
              </p>
              <ul className="space-y-1">
                {bloccanti.map((t) => (
                  <li key={`${t.tabella}.${t.colonna}`} className="text-xs text-text-primary">
                    {etichettaTraccia(t.tabella, t.righe)}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-text-secondary">
                Per eliminarlo davvero bisogna prima togliere queste cose dal posto in cui
                stanno — dalla scheda del progetto o dall&apos;area file del cliente, non da qui:
                sono dati di qualcun altro, e questa finestra non è il posto per cancellarli.
              </p>
              <p className="text-xs text-text-secondary">
                Altrimenti <span className="text-text-primary">disattivalo</span>: esce dagli elenchi
                e non entra più, ma la sua storia resta leggibile.
              </p>
            </>
          ) : (
            <>
              {inCascata.length > 0 ? (
                <>
                  <p className="text-sm text-text-primary">Insieme a lui sparisce:</p>
                  <ul className="space-y-1">
                    {inCascata.map((t) => (
                      <li key={`${t.tabella}.${t.colonna}`} className="text-xs text-text-secondary">
                        <span className="text-text-primary">{t.righe}</span> in {t.tabella}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-sm text-text-primary">
                  Non ha lasciato niente: nessuna task, nessuna cronologia, nessun documento.
                </p>
              )}
              <p className="text-xs text-text-secondary">Non si annulla. Scrivi <span className="text-text-primary">{atteso}</span> per confermare.</p>
              <input value={conferma} onChange={(e) => setConferma(e.target.value)} autoFocus
                aria-label="Riscrivi il nome per confermare" placeholder={atteso}
                className="w-full bg-background border border-border-interactive rounded-lg px-3 py-2 text-sm text-text-primary" />
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">
          <button onClick={onClose} className="text-xs text-text-secondary hover:text-text-primary px-3 py-2">Annulla</button>
          {bloccanti.length > 0 && user.is_active && (
            <button
              onClick={async () => { setDisattivando(true); await onDisattiva(user.id); onClose() }}
              disabled={disattivando}
              className="flex items-center gap-1.5 text-xs font-semibold border border-border-interactive text-text-primary px-4 py-2 rounded-lg hover:bg-surface-hover disabled:opacity-40">
              {disattivando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserMinus className="w-3.5 h-3.5" />}
              Disattiva
            </button>
          )}
          {bloccanti.length === 0 && !errore && (
            <button onClick={elimina} disabled={!puo || pending}
              className="flex items-center gap-1.5 text-xs font-semibold bg-error text-on-error px-4 py-2 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed">
              {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Elimina per sempre
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function UsersTab({ currentProfile, profiles: initialProfiles, clients }: { currentProfile: Profile; profiles: Profile[]; clients: { id: string; company_name: string }[] }) {
  const [profiles, setProfiles] = useState(initialProfiles)
  const [editingUser, setEditingUser] = useState<Profile | null>(null)
  const godMode = isSuperAdmin(currentProfile)

  const [deleting, setDeleting] = useState<Profile | null>(null)

  /* §360 — far partire i saluti a mano. Il cron gira alle 05:30, ma chi tocca
     il prompt deve poter vedere **adesso** cosa produce: aspettare l'alba per
     scoprire che una regola nuova non regge è il modo più lento di scrivere un
     prompt. Il riepilogo resta sotto al bottone, non in un avviso che sparisce:
     `scartate` e `ritentate` sono i numeri da guardare, e si guardano due volte. */
  const [generando, setGenerando] = useState(false)
  const [esito, setEsito] = useState<string | null>(null)

  const generaSaluti = async () => {
    setGenerando(true); setEsito(null)
    try {
      const r = await fetch('/api/person-copy/run', { method: 'POST' })
      const j = await r.json() as {
        error?: string; saltato?: string; motore?: string; modello?: string
        persone?: number; scritte?: number; scartate?: number; ritentate?: number
        taciute?: number; motivi?: string[]
      }
      if (!r.ok) { toast.error(j.error ?? 'Giro fallito'); setEsito(j.error ?? 'Giro fallito'); return }
      if (j.saltato) { toast.error(j.saltato); setEsito(j.saltato); return }
      /* Non «scritte/persone»: da §366 le righe sono dodici a testa, e
         «58/7» non vuol dire niente. Le taciute sono un esito, non un buco. */
      const riga = [
        `${j.persone} persone · ${j.scritte} righe scritte`,
        `${j.scartate} scartate`,
        `${j.ritentate} ritentativi`,
        `${j.taciute} taciute`,
        j.modello,
      ].join(' · ')
      setEsito(j.motivi?.length ? `${riga}\n${j.motivi.join('\n')}` : riga)
      toast.success(`${j.scritte} righe scritte`)
    } catch (e) {
      const m = (e as Error).message
      toast.error(m); setEsito(m)
    } finally { setGenerando(false) }
  }

  const deactivate = async (profileId: string) => {
    try {
      await adminUpdateUserProfile(profileId, { isActive: false })
    } catch (e) { toast.error((e as Error).message); return }
    setProfiles((p) => p.map((u) => u.id === profileId ? { ...u, is_active: false } : u))
    toast.success('Utente disattivato')
  }

  const handleSaved = (profileId: string, updates: Partial<Profile>) => {
    setProfiles((p) => p.map((u) => u.id === profileId ? { ...u, ...updates } as Profile : u))
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-sm text-text-secondary">{profiles.length} utenti totali · {profiles.filter((p) => p.is_active).length} attivi</p>
        {godMode && (
          <button onClick={generaSaluti} disabled={generando}
            title="Riscrive la riga di saluto di tutti per oggi. Se non passa il controllo, resta quella di prima."
            className="flex items-center gap-1.5 text-xs font-semibold text-gold-text border border-gold/30 px-3 py-1.5 rounded-lg hover:bg-gold/10 transition-colors disabled:opacity-40 shrink-0">
            {generando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {generando ? 'Sto scrivendo…' : 'Genera i saluti di oggi'}
          </button>
        )}
      </div>
      {esito && (
        <p className="text-xs text-text-secondary bg-surface border border-border rounded-lg px-3 py-2 mb-4 whitespace-pre-line">{esito}</p>
      )}

      <div className="space-y-2">
        {profiles.map((p) => {
          const isSelf = p.id === currentProfile.id
          const isSA = SUPER_ADMIN_EMAILS.includes(p.email)

          return (
            <div key={p.id} className={`bg-surface border border-border rounded-xl transition-colors ${!p.is_active ? 'opacity-50' : ''}`}>
              <div className="flex items-center gap-4 px-5 py-4">
                <div className="w-9 h-9 rounded-full bg-gold/20 border border-gold/30 flex items-center justify-center text-sm font-bold text-gold-text shrink-0">
                  {p.avatar_url ? <img src={p.avatar_url} className="w-full h-full rounded-full object-cover" alt="" /> : (p.full_name || p.email)[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-text-primary">{p.full_name}</span>
                    {isSA && <span className="flex items-center gap-1 text-xs font-black bg-gold text-on-gold px-2 py-0.5 rounded-full"><Crown className="w-3 h-3" />GOD</span>}
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[p.app_role] ?? 'bg-surface-active text-text-secondary'}`}>
                      {ROLE_LABELS[p.app_role]}
                    </span>
                    {!p.is_active && <span className="text-xs bg-error/20 text-error px-2 py-0.5 rounded-full">Disattivato</span>}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-text-secondary">{p.email}</span>
                    {p.area && <span className="text-xs text-text-secondary capitalize">· {p.area}</span>}
                    {p.job_title && <span className="text-xs text-text-secondary">· {p.job_title}</span>}
                  </div>
                  {(p.competencies ?? []).length > 0 && (
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      {(p.competencies ?? []).map((c) => <span key={c} className="text-2xs bg-surface-active text-text-secondary px-1.5 py-0.5 rounded">{c}</span>)}
                    </div>
                  )}
                </div>
                {godMode && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => setEditingUser(p)}
                      className="flex items-center gap-1.5 text-xs text-gold-text border border-gold/30 px-3 py-1.5 rounded-lg hover:bg-gold/10 transition-colors">
                      <Pencil className="w-3.5 h-3.5" /> Modifica
                    </button>
                    {!isSelf && !isSA && p.is_active && (
                      <button onClick={() => deactivate(p.id)} title="Disattiva: esce dagli elenchi, i suoi dati restano"
                        aria-label={`Disattiva ${p.full_name}`} className="text-text-secondary hover:text-text-primary p-1.5">
                        <UserMinus className="w-4 h-4" />
                      </button>
                    )}
                    {/* §362 — eliminare non è disattivare, e le due cose non
                        possono avere la stessa icona: la prima non si disfa. */}
                    {!isSelf && !isSA && (
                      <button onClick={() => setDeleting(p)} title="Elimina definitivamente"
                        aria-label={`Elimina definitivamente ${p.full_name}`} className="text-error hover:text-error p-1.5">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {deleting && (
        <DeleteUserDialog
          user={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={(id) => { setProfiles((p) => p.filter((u) => u.id !== id)); setDeleting(null) }}
          onDisattiva={deactivate}
        />
      )}

      {editingUser && (
        <UserEditModal
          user={editingUser}
          currentProfile={currentProfile}
          clients={clients}
          onClose={() => setEditingUser(null)}
          onSaved={(updates) => { handleSaved(editingUser.id, updates); }}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Tab: Permessi (matrix editabile)
// ─────────────────────────────────────────────────────────
function PermissionsTab({ currentProfile, permissions: initialPerms }: { currentProfile: Profile; permissions: RolePermission[] }) {
  const [perms, setPerms] = useState(initialPerms)
  const [selectedRole, setSelectedRole] = useState<Exclude<AppRole, 'super_admin'>>('manager')
  const [saving, setSaving] = useState<string | null>(null)
  const godMode = isSuperAdmin(currentProfile)

  const permMap = buildPermMap(perms)

  const getValue = (section: PermissionSection, action: PermissionAction): boolean => {
    return permMap[selectedRole]?.[section]?.[action] ?? false
  }

  const toggle = async (section: PermissionSection, action: PermissionAction) => {
    if (!godMode) return
    const key = `${selectedRole}-${section}-${action}`
    setSaving(key)
    const current = getValue(section, action)
    const supabase = createClient()
    const { error } = await supabase
      .from('role_permissions')
      .upsert({ role: selectedRole, section, action, allowed: !current, updated_by: currentProfile.id, updated_at: new Date().toISOString() }, { onConflict: 'role,section,action' })
    setSaving(null)
    if (error) { toast.error(error.message); return }
    setPerms((prev) => {
      const exists = prev.find((p) => p.role === selectedRole && p.section === section && p.action === action)
      if (exists) return prev.map((p) => p.role === selectedRole && p.section === section && p.action === action ? { ...p, allowed: !current } : p)
      return [...prev, { id: key, role: selectedRole, section, action, allowed: !current, updated_at: new Date().toISOString(), updated_by: currentProfile.id } as RolePermission]
    })
  }

  return (
    <div>
      {!godMode && (
        <div className="mb-4 flex items-center gap-2 bg-surface border border-border rounded-xl px-4 py-3 text-xs text-text-secondary">
          <AlertCircle className="w-4 h-4 shrink-0" /> Solo il Super Admin può modificare i permessi. Stai visualizzando la matrice in sola lettura.
        </div>
      )}

      {/* Role selector */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {EDITABLE_ROLES.map((r) => (
          <button key={r} onClick={() => setSelectedRole(r)}
            className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors ${selectedRole === r ? 'bg-gold/15 border-gold/50 text-gold-text' : 'border-border text-text-secondary hover:text-text-primary'}`}>
            {ROLE_LABELS[r]}
          </button>
        ))}
      </div>

      {/* Permission matrix */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-5 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider w-48">Sezione</th>
              {ACTIONS.map((a) => (
                <th key={a} className="px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider text-center">{ACTION_LABELS[a]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SECTIONS.map((section, i) => (
              <tr key={section} className={`border-b border-border ${i === SECTIONS.length - 1 ? 'border-b-0' : ''}`}>
                <td className="px-5 py-3.5 text-sm font-medium text-text-primary">{SECTION_LABELS[section]}</td>
                {ACTIONS.map((action) => {
                  const val = getValue(section, action)
                  const key = `${selectedRole}-${section}-${action}`
                  const isSaving = saving === key
                  // view-only sections that don't have create/edit/delete
                  const isNA = (section === 'mrr' || section === 'anagrafica_fiscale') && action !== 'view'
                  if (isNA) return <td key={action} className="px-4 py-3.5 text-center"><span className="text-xs text-text-tertiary">—</span></td>
                  return (
                    <td key={action} className="px-4 py-3.5 text-center">
                      <button
                        disabled={!godMode || isSaving}
                        onClick={() => toggle(section, action)}
                        className={`w-8 h-8 rounded-lg border flex items-center justify-center mx-auto transition-all ${val ? 'bg-gold/20 border-gold/50 text-gold-text' : 'bg-background border-border text-text-tertiary'} ${godMode ? 'hover:scale-105 cursor-pointer' : 'cursor-default'} disabled:opacity-50`}>
                        {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : val ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {godMode && <p className="text-xs text-text-secondary mt-3">Le modifiche sono immediate e si applicano a tutti gli utenti con quel ruolo.</p>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
function InvitationsTab({ currentProfile, invitations: initialInvitations }: { currentProfile: Profile; invitations: Invitation[] }) {
  const [invitations, setInvitations] = useState(initialInvitations)
  const [form, setForm] = useState({ email: '', app_role: 'junior' as AppRole, area: '', job_title: '' })
  const [sending, setSending] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const getInviteUrl = (token: string) => {
    const base = typeof window !== 'undefined' ? window.location.origin : ''
    return `${base}/registrati?token=${token}`
  }

  const copyLink = (inv: Invitation) => {
    navigator.clipboard.writeText(getInviteUrl(inv.token))
    setCopiedId(inv.id)
    toast.success('Link copiato!')
    setTimeout(() => setCopiedId(null), 2000)
  }

  const sendInvite = async () => {
    if (!form.email.trim()) return
    setSending(true)
    const supabase = createClient()
    const { data, error } = await supabase.from('invitations').insert({
      email: form.email.trim().toLowerCase(),
      app_role: form.app_role,
      area: form.area || null,
      job_title: form.job_title || null,
      invited_by: currentProfile.id,
    }).select().single()
    setSending(false)
    if (error) { toast.error(error.message); return }
    const inv = data as Invitation
    setInvitations((p) => [inv, ...p])
    setForm({ email: '', app_role: 'junior', area: '', job_title: '' })
    navigator.clipboard.writeText(getInviteUrl(inv.token))
    toast.success('Invito creato — link copiato negli appunti!')
  }

  const revokeInvite = async (id: string) => {
    const supabase = createClient()
    await supabase.from('invitations').delete().eq('id', id)
    setInvitations((p) => p.filter((i) => i.id !== id))
    toast.success('Invito revocato')
  }

  const renewInvite = async (inv: Invitation) => {
    const supabase = createClient()
    const { data, error } = await supabase.from('invitations').insert({
      email: inv.email,
      app_role: inv.app_role,
      area: inv.area,
      job_title: inv.job_title,
      invited_by: currentProfile.id,
    }).select().single()
    if (error) { toast.error(error.message); return }
    // Elimina il vecchio
    await supabase.from('invitations').delete().eq('id', inv.id)
    const newInv = data as Invitation
    setInvitations((p) => [newInv, ...p.filter(i => i.id !== inv.id)])
    navigator.clipboard.writeText(getInviteUrl(newInv.token))
    toast.success('Nuovo invito creato — link copiato!')
  }

  return (
    <div className="space-y-6">
      {/* New invite form */}
      <div className="bg-surface border border-border rounded-xl p-5">
        <h3 className="text-sm font-bold text-text-primary mb-4">Invita nuovo utente</h3>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="col-span-2">
            <label className="block text-xs text-text-secondary mb-1">Email *</label>
            <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="nome@twobee.it" className={ic} />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Ruolo</label>
            <select value={form.app_role} onChange={(e) => setForm((f) => ({ ...f, app_role: e.target.value as AppRole }))} className={ic}>
              {EDITABLE_ROLES.filter((r) => r !== 'client').map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Area</label>
            <select value={form.area} onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))} className={ic}>
              <option value="">— Nessuna —</option>
              {AREAS.map((a) => <option key={a} value={a} className="capitalize">{a}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-text-secondary mb-1">Titolo</label>
            <input value={form.job_title} onChange={(e) => setForm((f) => ({ ...f, job_title: e.target.value }))} placeholder="es. Social Media Manager" className={ic} />
          </div>
        </div>
        <button onClick={sendInvite} disabled={sending || !form.email} className="flex items-center gap-2 bg-gold text-on-gold text-sm font-bold px-4 py-2 rounded-lg hover:bg-gold/90 disabled:opacity-50">
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Crea invito
        </button>
        <p className="text-xs text-text-secondary mt-2 flex items-center gap-1.5">
          <Link2 className="w-3.5 h-3.5" />
          Il link di registrazione verrà copiato automaticamente. Condividilo con l'invitato.
        </p>
      </div>

      {/* List */}
      <div>
        <h3 className="text-sm font-bold text-text-primary mb-3">Inviti ({invitations.length})</h3>
        {invitations.length === 0 ? (
          <div className="text-center py-8 text-text-secondary text-sm border border-dashed border-border rounded-xl">Nessun invito ancora</div>
        ) : (
          <div className="space-y-2">
            {invitations.map((inv) => {
              const expired = new Date(inv.expires_at) < new Date()
              const accepted = !!inv.accepted_at
              const pending = !accepted && !expired
              return (
                <div key={inv.id} className={`bg-surface border rounded-xl px-5 py-4 ${accepted ? 'border-success/30' : expired ? 'border-error/20 opacity-60' : 'border-border'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-text-primary">{inv.email}</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[inv.app_role] ?? ''}`}>{ROLE_LABELS[inv.app_role]}</span>
                        {accepted && <span className="text-xs bg-success/20 text-success px-2 py-0.5 rounded-full">Accettato</span>}
                        {expired && !accepted && <span className="text-xs bg-error/20 text-error px-2 py-0.5 rounded-full">Scaduto</span>}
                        {pending && <span className="text-xs bg-gold/20 text-gold-text px-2 py-0.5 rounded-full">In attesa</span>}
                      </div>
                      <p className="text-xs text-text-secondary mt-1">
                        {accepted ? `Accettato il ${new Date(inv.accepted_at!).toLocaleDateString('it-IT')}` :
                         expired ? `Scaduto il ${new Date(inv.expires_at).toLocaleDateString('it-IT')}` :
                         `Scade il ${new Date(inv.expires_at).toLocaleDateString('it-IT')}`}
                      </p>
                      {pending && (
                        <div className="mt-2 flex items-center gap-1.5">
                          <input
                            readOnly
                            value={getInviteUrl(inv.token)}
                            className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-text-secondary font-mono truncate"
                            onClick={(e) => (e.target as HTMLInputElement).select()}
                          />
                          <button
                            onClick={() => copyLink(inv)}
                            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                              copiedId === inv.id
                                ? 'bg-success/20 border-success/30 text-success'
                                : 'border-border text-text-secondary hover:text-text-primary hover:border-border'
                            }`}
                          >
                            {copiedId === inv.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            {copiedId === inv.id ? 'Copiato' : 'Copia'}
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {expired && !accepted && (
                        <button onClick={() => renewInvite(inv)} title="Rinnova invito"
                          className="flex items-center gap-1 text-xs text-gold-text border border-gold/30 px-2.5 py-1.5 rounded-lg hover:bg-gold/10 transition-colors">
                          <RefreshCw className="w-3.5 h-3.5" /> Rinnova
                        </button>
                      )}
                      {!accepted && (
                        <button onClick={() => revokeInvite(inv.id)} className="text-error hover:text-error p-1.5" title="Elimina invito">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────
export function ImpostazioniClient({ currentProfile, profiles, permissions, invitations, clients }: Props) {
  const [activeTab, setActiveTab] = useState(0)
  const godMode = isSuperAdmin(currentProfile)

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-black text-text-primary font-heading mb-1">Impostazioni</h1>
        <p className="text-text-secondary text-sm">Gestione utenti, ruoli, permessi e approvazioni</p>
      </div>

      {godMode && <GodModeBanner />}

      {/* Tabs */}
      <div className="flex border-b border-border mb-6">
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setActiveTab(i)}
            className={`relative px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${activeTab === i ? 'border-gold text-gold-text' : 'border-transparent text-text-secondary hover:text-text-primary'}`}>
            {t}
          </button>
        ))}
      </div>

      {activeTab === 0 && <UsersTab currentProfile={currentProfile} profiles={profiles} clients={clients} />}
      {activeTab === 1 && <PermissionsTab currentProfile={currentProfile} permissions={permissions} />}
      {activeTab === 2 && <InvitationsTab currentProfile={currentProfile} invitations={invitations} />}
    </div>
  )
}
