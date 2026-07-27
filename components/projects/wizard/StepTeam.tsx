'use client'

import { useState, useMemo, useTransition } from 'react'
import { toast } from 'sonner'
import { UserPlus, Link2, Copy, Check, Loader2, Crown, Users } from 'lucide-react'
import { StepHead, SearchInput, PickRow, Avatar, Empty, Field, inputCls } from '@/components/shared/formkit'
import { createTeamInviteLink } from '@/app/actions/wizard'
import { isExternal, type Person } from './types'

const INVITE_ROLES = [
  { value: 'freelance', label: 'Freelance' },
  { value: 'partner', label: 'Partner' },
  { value: 'junior', label: 'Junior' },
  { value: 'senior', label: 'Senior' },
]

export function StepTeam({
  profiles, team, setTeam, managerId, canInvite,
}: {
  profiles: Person[]
  team: string[]
  setTeam: React.Dispatch<React.SetStateAction<string[]>>
  managerId: string
  canInvite: boolean
}) {
  const [q, setQ] = useState('')
  const [showInvite, setShowInvite] = useState(false)

  const { interni, esterni } = useMemo(() => {
    const t = q.trim().toLowerCase()
    const match = (p: Person) => !t || p.full_name.toLowerCase().includes(t) || (p.app_role ?? '').includes(t)
    const list = profiles.filter(match)
    return { interni: list.filter(p => !isExternal(p)), esterni: list.filter(isExternal) }
  }, [profiles, q])

  const toggle = (id: string) =>
    setTeam(t => t.includes(id) ? t.filter(x => x !== id) : [...t, id])

  const row = (p: Person) => (
    <PickRow key={p.id} selected={team.includes(p.id) || p.id === managerId}
      onClick={() => p.id !== managerId && toggle(p.id)}
      dim={p.id === managerId}
      icon={<Avatar name={p.full_name} url={p.avatar_url} />}
      title={p.full_name}
      subtitle={p.app_role ?? 'ruolo non impostato'}
      meta={p.id === managerId
        ? <span className="flex items-center gap-1 text-2xs font-semibold text-gold-text shrink-0"><Crown className="w-3 h-3" />PM</span>
        : undefined}
    />
  )

  const total = new Set([...team, ...(managerId ? [managerId] : [])]).size

  return (
    <div>
      <StepHead title="Chi ci lavora?" hint="Solo chi è nel team vede il progetto e può essere assegnatario delle task."
        aside={<span className="text-2xs font-semibold text-gold-text tabular shrink-0">{total} persone</span>} />

      <div className="space-y-3">
        <SearchInput value={q} onChange={setQ} placeholder="Cerca persona o ruolo…" autoFocus />

        <div className="max-h-[42vh] overflow-y-auto pr-1 space-y-4">
          <Group icon={<Users className="w-3.5 h-3.5" />} label={`Team interno · ${interni.length}`}>
            {interni.length ? interni.map(row) : <Empty>Nessun risultato.</Empty>}
          </Group>
          <Group icon={<Link2 className="w-3.5 h-3.5" />} label={`Risorse esterne · ${esterni.length}`}>
            {esterni.length
              ? esterni.map(row)
              : <Empty>Nessuna risorsa esterna registrata: invitane una qui sotto.</Empty>}
          </Group>
        </div>

        {canInvite && (
          <div className="border border-border rounded-xl overflow-hidden">
            <button type="button" onClick={() => setShowInvite(s => !s)} aria-expanded={showInvite}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-surface-hover">
              <UserPlus className="w-4 h-4 text-gold-text shrink-0" />
              <span className="flex-1 text-sm font-semibold text-text-primary">Invita qualcuno da fuori</span>
              <span className="text-2xs text-text-tertiary">link valido 7 giorni</span>
            </button>
            {showInvite && <InvitePanel />}
          </div>
        )}
      </div>
    </div>
  )
}

function Group({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-2xs font-semibold text-text-tertiary mb-1.5">{icon}{label}</div>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function InvitePanel() {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('freelance')
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [pending, start] = useTransition()

  const generate = () => start(async () => {
    try {
      const { url } = await createTeamInviteLink({ email, app_role: role })
      setLink(url)
      toast.success('Link d\'invito creato')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
  })

  const copy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    } catch { toast.error('Copia non riuscita: selezionalo a mano') }
  }

  return (
    <div className="p-3 border-t border-border space-y-3 bg-background/40">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Email">
          <input type="email" value={email} onChange={e => { setEmail(e.target.value); setLink(null) }}
            placeholder="nome@studio.it" className={inputCls} />
        </Field>
        <Field label="Ruolo assegnato">
          <select value={role} onChange={e => { setRole(e.target.value); setLink(null) }} className={inputCls} aria-label="Ruolo">
            {INVITE_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </Field>
      </div>

      {link ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 p-2 rounded-lg bg-surface-active">
            <Link2 className="w-3.5 h-3.5 text-gold-text shrink-0" />
            <span className="flex-1 text-2xs text-text-secondary truncate">{link}</span>
            <button type="button" onClick={copy} aria-label="Copia link"
              className="flex items-center gap-1 text-2xs font-semibold text-gold-text shrink-0">
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copiato' : 'Copia'}
            </button>
          </div>
          <p className="text-2xs text-text-tertiary">
            Mandaglielo tu: al primo accesso si registra e compare nell&apos;elenco. Poi torna qui e aggiungilo al team.
          </p>
        </div>
      ) : (
        <button type="button" onClick={generate} disabled={pending || !email.trim()}
          className="flex items-center gap-1.5 text-2xs font-semibold bg-gold text-on-gold px-3 py-2 rounded-lg disabled:opacity-40 press">
          {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
          Genera link d&apos;invito
        </button>
      )}
    </div>
  )
}
