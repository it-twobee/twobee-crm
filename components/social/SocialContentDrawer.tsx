'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Check, ExternalLink, FileText, Film, ImageIcon, Loader2, Trash2, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  CANALI, CANALI_ELENCO, FORMATI, FORMATI_ELENCO, STATI, STATI_ELENCO, SOCIAL_MEDIA_MAX, avvisi, dirittiSocial,
  isCanale, meseDi, puoPassareA, rejectSocialMedia, servonoLink, socialMediaHref, socialThumbHref,
  suggerisciMilestone, validaLinkPost, type Canale, type StatoSocial,
} from '@/lib/social'
import { humanBytes } from '@/lib/portal/materials'
import { progettoBreve } from '@/lib/task-board'
import { Field, inputCls } from '@/components/shared/formkit'
import { MaterialThumb } from '@/components/shared/MaterialThumb'
import { MaterialPreview } from '@/components/shared/MaterialPreview'
import {
  createSocialContent, deleteSocialContent, markSocialPublished, reorderSocialMedia, setSocialStatus, updateSocialContent,
} from '@/app/actions/social'
import type { SocialBoardData, SocialContentRow, SocialMediaItem } from '@/lib/social-types'
import type { SocialViewer } from './SocialBoard'

/** `creato`: appena salvato, la riga arriva col prossimo giro del server. */
export type DrawerState = { id: string; creato?: boolean } | { nuovo: true; giorno: string; projectId: string | null }

type Form = {
  project_id: string
  planned_date: string
  planned_time: string
  channels: Canale[]
  format: string
  title: string
  caption: string
  owner_id: string
  milestone_id: string
}

function formDi(c: SocialContentRow): Form {
  return {
    project_id: c.project_id, planned_date: c.planned_date, planned_time: c.planned_time ?? '',
    channels: c.channels.filter(isCanale), format: c.format, title: c.title, caption: c.caption ?? '',
    owner_id: c.owner_id ?? '', milestone_id: c.milestone_id ?? '',
  }
}

/* §467 — Il dettaglio di un contenuto. Chi governa crea ed elimina; chi l'ha in
   carico lo modifica (§322); gli altri lo leggono. Le creatività si caricano
   dopo il primo salvataggio, perché vivono sotto il contenuto. */
export function SocialContentDrawer({ state, data, me, progetti, onClose, onSaved, onDeleted, onChanged }: {
  state: DrawerState
  data: SocialBoardData
  me: SocialViewer
  progetti: SocialBoardData['projects']
  onClose: () => void
  onSaved: (id: string, giorno?: string) => void
  onDeleted: () => void
  onChanged: () => void
}) {
  const content = 'id' in state ? data.contents.find(c => c.id === state.id) ?? null : null
  const isNew = 'nuovo' in state
  const diritti = dirittiSocial({ governa: me.governa && !me.lettore, userId: me.id, contenuto: content })
  const editable = isNew ? diritti.crea : diritti.modifica && !me.lettore

  const [form, setForm] = useState<Form>(() => content ? formDi(content) : {
    project_id: isNew && state.projectId ? state.projectId : '', planned_date: isNew ? state.giorno : data.oggi,
    planned_time: '', channels: ['instagram'], format: 'post', title: '', caption: '', owner_id: me.id, milestone_id: '',
  })
  const [pending, setPending] = useState(false)
  const [pubblica, setPubblica] = useState(false)
  const [links, setLinks] = useState<Record<string, string>>(() =>
    Object.fromEntries((content?.links ?? []).map(l => [l.channel, l.url])))
  const [preview, setPreview] = useState<SocialMediaItem | null>(null)
  const dialog = useRef<HTMLDivElement>(null)

  // quando il contenuto torna dal server (salvato, ricaricato) il modulo si riallinea
  const versione = content?.updated_at
  useEffect(() => { if (content) setForm(formDi(content)) }, [versione]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !preview) onClose() }
    window.addEventListener('keydown', onKey)
    dialog.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, preview])

  const milestones = data.milestones.filter(m => m.project_id === form.project_id)
  // il PED del mese, proposto a un contenuto nuovo quando si sceglie il progetto o la data
  useEffect(() => {
    if (!isNew || !form.project_id) return
    setForm(f => ({ ...f, milestone_id: suggerisciMilestone(milestones, meseDi(f.planned_date)) ?? '' }))
  }, [form.project_id, meseDi(form.planned_date)]) // eslint-disable-line react-hooks/exhaustive-deps

  const progetto = data.projects.find(p => p.id === form.project_id)
  const media = content?.media ?? []
  const consigli = avvisi({ channels: form.channels, format: form.format, caption: form.caption || null }, media)
  const limite = Math.min(...form.channels.map(c => CANALI[c].limite), 63206)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm(f => ({ ...f, [k]: v }))

  if ('id' in state && !content) {
    return <Shell onClose={onClose} title="Contenuto">
      {state.creato
        ? <p className="flex items-center gap-2 text-sm text-text-secondary"><Loader2 className="h-4 w-4 animate-spin" />Apro il contenuto…</p>
        : <p className="text-sm text-text-secondary">Il contenuto non è in questo mese, o non c’è più.</p>}
    </Shell>
  }

  async function salva() {
    setPending(true)
    const payload = { ...form, planned_time: form.planned_time || null, owner_id: form.owner_id || null, milestone_id: form.milestone_id || null, caption: form.caption || null }
    const r = content
      ? await updateSocialContent(content.id, payload, content.updated_at)
      : await createSocialContent(payload)
    setPending(false)
    if (!r.ok) { toast.error(r.error); return }
    toast.success(content ? 'Salvato' : 'Contenuto creato: ora puoi caricare le creatività')
    onSaved(content ? content.id : (r.data as { id: string }).id, form.planned_date)
  }

  async function cambiaStato(s: StatoSocial) {
    if (!content) return
    if (s === 'pubblicato') { setPubblica(true); return }
    setPending(true)
    const r = await setSocialStatus(content.id, s)
    setPending(false)
    if (!r.ok) { toast.error(r.error); return }
    onChanged()
  }

  async function confermaPubblicato() {
    if (!content) return
    for (const ch of content.channels.filter(isCanale)) {
      if (!servonoLink(content.format) && !links[ch]) continue
      const e = validaLinkPost(ch, links[ch])
      if (e) { toast.error(e); return }
    }
    setPending(true)
    const r = await markSocialPublished(content.id, links)
    setPending(false)
    if (!r.ok) { toast.error(r.error); return }
    setPubblica(false)
    toast.success('Segnato come pubblicato')
    onChanged()
  }

  async function elimina() {
    if (!content || !window.confirm(`Eliminare «${content.title}» e le sue creatività?`)) return
    setPending(true)
    const r = await deleteSocialContent(content.id)
    setPending(false)
    if (!r.ok) { toast.error(r.error); return }
    if (r.data.orfani) toast.warning(`Eliminato. ${r.data.orfani} file sono rimasti sullo storage: avvisa l’amministratore.`)
    else toast.success('Eliminato')
    onDeleted()
  }

  async function sposta(i: number, verso: -1 | 1) {
    if (!content) return
    const ids = media.map(m => m.id)
    const j = i + verso
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    const r = await reorderSocialMedia(content.id, ids)
    if (!r.ok) { toast.error(r.error); return }
    onChanged()
  }

  async function eliminaMedia(m: SocialMediaItem) {
    if (!window.confirm(`Togliere «${m.name}»?`)) return
    const res = await fetch(socialMediaHref(m.id), { method: 'DELETE' })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(body.error ?? 'Non è stato possibile togliere il file.'); return }
    if (body.orfani) toast.warning('Tolto dal contenuto, ma il file è rimasto sullo storage.')
    onChanged()
  }

  return (<>
    <Shell onClose={onClose} title={isNew ? 'Nuovo contenuto' : content!.title} dialogRef={dialog}
      sub={progetto ? `${progetto.client_name ?? ''} · ${progettoBreve(progetto.name, progetto.client_name)}` : undefined}
      footer={editable ? (
        <>
          {!isNew && diritti.elimina && (
            <button onClick={elimina} disabled={pending} className="flex items-center gap-1.5 text-sm text-error hover:underline disabled:opacity-40">
              <Trash2 className="h-4 w-4" aria-hidden="true" />Elimina
            </button>
          )}
          <button onClick={onClose} className="ml-auto text-sm text-text-secondary hover:text-text-primary">Chiudi</button>
          <button onClick={salva} disabled={pending || !form.title.trim() || !form.project_id || !form.channels.length}
            className="flex items-center gap-1.5 rounded-xl bg-gold px-4 py-2 text-sm font-semibold text-on-gold disabled:opacity-40 press btn-gold">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{isNew ? 'Crea' : 'Salva'}
          </button>
        </>
      ) : undefined}>
      {!editable && <p className="rounded-lg bg-info-dim px-3 py-2 text-2xs text-info">Sola lettura: lo modifica chi governa i progetti o chi ha il contenuto in carico.</p>}

      {isNew ? (
        <Field label="Progetto">
          <select value={form.project_id} onChange={e => set('project_id', e.target.value)} disabled={!editable} className={inputCls}>
            <option value="">Scegli il progetto…</option>
            {progetti.map(p => <option key={p.id} value={p.id}>{p.client_name ?? ''} · {progettoBreve(p.name, p.client_name)}</option>)}
          </select>
        </Field>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Giorno">
          <input type="date" value={form.planned_date} onChange={e => set('planned_date', e.target.value)} disabled={!editable} className={inputCls} />
        </Field>
        <Field label="Ora" hint="facoltativa">
          <input type="time" value={form.planned_time} onChange={e => set('planned_time', e.target.value)} disabled={!editable} className={inputCls} />
        </Field>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-2xs font-semibold text-text-secondary">Canali</legend>
        <div className="flex flex-wrap gap-1.5">
          {CANALI_ELENCO.map(c => {
            const on = form.channels.includes(c)
            return (
              <button key={c} type="button" aria-pressed={on} disabled={!editable}
                onClick={() => set('channels', on ? form.channels.filter(x => x !== c) : CANALI_ELENCO.filter(x => x === c || form.channels.includes(x)))}
                className={`rounded-lg border px-2.5 py-1.5 text-2xs font-semibold ${on ? 'border-gold bg-gold-dim text-gold-text' : 'border-border text-text-secondary hover:bg-surface-hover'} disabled:opacity-60`}>
                {CANALI[c].label}
              </button>
            )
          })}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Formato">
          <select value={form.format} onChange={e => set('format', e.target.value)} disabled={!editable} className={inputCls}>
            {FORMATI_ELENCO.map(f => <option key={f} value={f}>{FORMATI[f]}</option>)}
          </select>
        </Field>
        <Field label="Responsabile">
          <select value={form.owner_id} onChange={e => set('owner_id', e.target.value)} disabled={!editable} className={inputCls}>
            <option value="">Nessuno</option>
            {data.staff.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
        </Field>
      </div>

      <Field label="Tema" hint="cosa racconta, in una riga">
        <input value={form.title} onChange={e => set('title', e.target.value)} maxLength={160} disabled={!editable} className={inputCls}
          placeholder="Es. Dietro le quinte dello shooting" />
      </Field>

      <Field label="Didascalia" hint={`${form.caption.length.toLocaleString('it-IT')} / ${limite.toLocaleString('it-IT')}`}>
        <textarea value={form.caption} onChange={e => set('caption', e.target.value)} rows={6} maxLength={5000} disabled={!editable}
          className={`${inputCls} resize-y`} placeholder="Il testo del post, con hashtag e menzioni" />
      </Field>

      <Field label="PED del mese" hint="la milestone del progetto">
        <select value={form.milestone_id} onChange={e => set('milestone_id', e.target.value)} disabled={!editable || !form.project_id} className={inputCls}>
          <option value="">Nessuna</option>
          {milestones.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
        </select>
      </Field>

      {consigli.length > 0 && (
        <ul className="space-y-1 rounded-lg bg-warning-dim px-3 py-2 text-2xs text-warning">
          {consigli.map(a => <li key={a}>{a}</li>)}
        </ul>
      )}

      {content && (
        <>
          <div>
            <span className="mb-1.5 block text-2xs font-semibold text-text-secondary">Stato</span>
            <div className="flex flex-wrap gap-1.5">
              {STATI_ELENCO.map(s => {
                const on = content.status === s
                const motivo = s === 'pubblicato' ? null : puoPassareA({ format: content.format, channels: content.channels, links: content.links.map(l => l.channel) }, s)
                return (
                  <button key={s} type="button" aria-pressed={on} disabled={!editable || pending || on || !!motivo}
                    onClick={() => cambiaStato(s)} title={motivo ?? undefined}
                    className={`rounded-lg px-2.5 py-1.5 text-2xs font-semibold ${on ? `${STATI[s].bg} ${STATI[s].text} ring-1 ring-border-strong` : 'border border-border text-text-secondary hover:bg-surface-hover'} disabled:cursor-default`}>
                    {STATI[s].label}
                  </button>
                )
              })}
            </div>
          </div>

          {(pubblica || content.links.length > 0) && (
            <div className="space-y-2 rounded-xl border border-border p-3">
              <p className="text-2xs font-semibold text-text-secondary">
                {pubblica ? 'Dove è uscito: il link del post su ogni canale' : 'Link dei post'}
                {pubblica && !servonoLink(content.format) && <span className="font-normal text-text-tertiary"> · per una story non serve</span>}
              </p>
              {content.channels.filter(isCanale).map(ch => pubblica ? (
                <Field key={ch} label={CANALI[ch].label}>
                  <input type="url" inputMode="url" value={links[ch] ?? ''} onChange={e => setLinks(l => ({ ...l, [ch]: e.target.value }))}
                    placeholder={`https://${CANALI[ch].host[0]}/…`} className={inputCls} />
                </Field>
              ) : content.links.find(l => l.channel === ch) ? (
                <a key={ch} href={content.links.find(l => l.channel === ch)!.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm text-text-primary hover:text-gold-text">
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />Vedi su {CANALI[ch].label}
                </a>
              ) : null)}
              {pubblica && (
                <div className="flex justify-end gap-2">
                  <button onClick={() => setPubblica(false)} className="text-sm text-text-secondary hover:text-text-primary">Annulla</button>
                  <button onClick={confermaPubblicato} disabled={pending}
                    className="rounded-xl bg-gold px-3 py-1.5 text-sm font-semibold text-on-gold disabled:opacity-40">Segna pubblicato</button>
                </div>
              )}
            </div>
          )}

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-2xs font-semibold text-text-secondary">Creatività · {media.length}/{SOCIAL_MEDIA_MAX}</span>
              {editable && media.length < SOCIAL_MEDIA_MAX && <Uploader contentId={content.id} posti={SOCIAL_MEDIA_MAX - media.length} onDone={onChanged} />}
            </div>
            {media.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-2xs text-text-tertiary">Nessuna creatività caricata.</p>
            ) : (
              <ul className="space-y-1.5">
                {media.map((m, i) => (
                  <li key={m.id} className="flex items-center gap-2 rounded-lg border border-border p-1.5">
                    <button onClick={() => setPreview(m)} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-label={`Apri ${m.name}`}>
                      <MaterialThumb file={m} size={44} thumbHrefOf={socialThumbHref}
                        fallback={m.kind === 'video' ? <Film className="h-5 w-5 text-text-tertiary" /> : m.kind === 'documento' ? <FileText className="h-5 w-5 text-text-tertiary" /> : <ImageIcon className="h-5 w-5 text-text-tertiary" />} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-text-primary">{m.name}</span>
                        <span className="block text-2xs text-text-tertiary">{humanBytes(Number(m.size))}</span>
                      </span>
                    </button>
                    {editable && (
                      <span className="flex shrink-0 items-center">
                        <button onClick={() => sposta(i, -1)} disabled={i === 0} aria-label="Sposta su" className="flex h-8 w-8 items-center justify-center rounded-md text-text-tertiary hover:bg-surface-hover disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                        <button onClick={() => sposta(i, 1)} disabled={i === media.length - 1} aria-label="Sposta giù" className="flex h-8 w-8 items-center justify-center rounded-md text-text-tertiary hover:bg-surface-hover disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                        <button onClick={() => eliminaMedia(m)} aria-label={`Togli ${m.name}`} className="flex h-8 w-8 items-center justify-center rounded-md text-text-tertiary hover:bg-error-dim hover:text-error"><Trash2 className="h-4 w-4" /></button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

    </Shell>
    {/* fuori dal pannello: dentro un antenato animato con `transform`, un
        `fixed` resterebbe chiuso nel pannello invece di coprire lo schermo */}
    {preview && (
      <MaterialPreview file={{ ...preview, size: Number(preview.size) }} files={media.map(m => ({ ...m, size: Number(m.size) }))}
        onNavigate={f => setPreview(media.find(m => m.id === f.id) ?? null)} onClose={() => setPreview(null)} hrefOf={socialMediaHref} />
    )}
  </>)
}

function Shell({ title, sub, onClose, footer, children, dialogRef }: {
  title: string; sub?: string; onClose: () => void; footer?: React.ReactNode; children: React.ReactNode
  dialogRef?: React.RefObject<HTMLDivElement>
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-scrim animate-fade-in" onClick={onClose}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}
        className="flex h-full w-full max-w-xl flex-col border-l border-border bg-surface shadow-drawer animate-slide-in-right pt-safe">
        <div className="flex items-start gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-heading text-base font-bold text-text-primary">{title}</h2>
            {sub && <p className="truncate text-2xs text-text-tertiary">{sub}</p>}
          </div>
          <button onClick={onClose} aria-label="Chiudi" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-tertiary hover:bg-surface-hover hover:text-text-primary">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">{children}</div>
        {footer && <div className="flex items-center gap-3 border-t border-border px-4 py-3 pb-safe">{footer}</div>}
      </div>
    </div>
  )
}

/** Caricamento a uno a uno, con la barra: un video da 300 MB non è un clic che finisce subito. */
function Uploader({ contentId, posti, onDone }: { contentId: string; posti: number; onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [stato, setStato] = useState<{ nome: string; perc: number } | null>(null)

  async function carica(files: FileList | null) {
    if (!files?.length) return
    const lista = Array.from(files).slice(0, posti)
    if (files.length > posti) toast.warning(`Ne carico ${posti}: un contenuto ha al massimo ${SOCIAL_MEDIA_MAX} creatività.`)
    let caricati = 0
    for (const f of lista) {
      const no = rejectSocialMedia({ name: f.name, mime: f.type || null, size: f.size })
      if (no) { toast.error(`${f.name}: ${no}`); continue }
      const ok = await new Promise<boolean>(resolve => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', `/api/social/media?contenuto=${contentId}`)
        xhr.setRequestHeader('x-file-name', encodeURIComponent(f.name))
        xhr.setRequestHeader('x-idempotency-key', crypto.randomUUID())
        if (f.type) xhr.setRequestHeader('content-type', f.type)
        xhr.upload.onprogress = e => { if (e.lengthComputable) setStato({ nome: f.name, perc: Math.round((e.loaded / e.total) * 100) }) }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) return resolve(true)
          let msg = 'Caricamento non riuscito.'
          try { msg = JSON.parse(xhr.responseText).error ?? msg } catch { /* risposta non JSON */ }
          toast.error(`${f.name}: ${msg}`)
          resolve(false)
        }
        xhr.onerror = () => { toast.error(`${f.name}: connessione interrotta.`); resolve(false) }
        setStato({ nome: f.name, perc: 0 })
        xhr.send(f)
      })
      if (ok) caricati++
    }
    setStato(null)
    if (input.current) input.current.value = ''
    if (caricati) onDone()
  }

  return (
    <>
      <input ref={input} type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,image/avif,video/mp4,video/quicktime,video/webm,application/pdf"
        className="sr-only" onChange={e => carica(e.target.files)} aria-label="Carica creatività" />
      {stato ? (
        <span className="flex items-center gap-2 text-2xs text-text-secondary" aria-live="polite">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />{stato.nome} · {stato.perc}%
        </span>
      ) : (
        <button onClick={() => input.current?.click()} className="flex items-center gap-1.5 rounded-lg border border-border-interactive px-2.5 py-1.5 text-2xs font-semibold text-text-secondary hover:bg-surface-hover">
          <Upload className="h-3.5 w-3.5" aria-hidden="true" />Carica
        </button>
      )}
    </>
  )
}

