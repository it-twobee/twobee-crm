'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { FileText, Plus, X, Loader2, Trash2, AlertTriangle, CheckCircle2, Clock, Download, Paperclip } from 'lucide-react'
import { docState, DOC_TYPES, type DocStatus } from '@/lib/personal-documents'
import { upsertPersonalDoc, getPersonalDocUrl, deletePersonalDoc } from '@/app/actions/personal-documents'
import type { PersonalDocument } from '@/lib/types/database'

const STATUS_UI: Record<DocStatus, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  valido:         { label: 'Valido',        cls: 'text-success bg-success-dim', Icon: CheckCircle2 },
  in_scadenza:    { label: 'In scadenza',   cls: 'text-warning bg-warning-dim', Icon: Clock },
  scaduto:        { label: 'Scaduto',       cls: 'text-error bg-error-dim',     Icon: AlertTriangle },
  senza_scadenza: { label: 'Senza scadenza', cls: 'text-text-tertiary bg-surface-active', Icon: FileText },
}

export function PersonalDocsClient({ documents, profileId }: {
  documents: PersonalDocument[]
  profileId: string
}) {
  const router = useRouter()
  const [showNew, setShowNew] = useState(false)
  const [downloading, setDownloading] = useState<string | null>(null)

  const withState = documents.map(d => ({ doc: d, state: docState(d) }))
  const urgent = withState.filter(x => x.state.status === 'scaduto' || x.state.status === 'in_scadenza')

  const download = async (doc: PersonalDocument) => {
    setDownloading(doc.id)
    const res = await getPersonalDocUrl(doc.id)
    setDownloading(null)
    if ('error' in res) { toast.error(res.error); return }
    window.open(res.url, '_blank', 'noopener,noreferrer')
  }

  const remove = async (id: string) => {
    const res = await deletePersonalDoc(id)
    if ('error' in res) { toast.error(res.error); return }
    toast.success('Documento eliminato')
    router.refresh()
  }

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <FileText className="w-5 h-5 text-gold-text" aria-hidden="true" />
            Documenti Personali
          </h1>
          <p className="text-text-tertiary text-sm mt-0.5">
            Scadenze e rinnovi. Solo tu vedi questi documenti.
          </p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gold text-on-gold text-sm font-semibold rounded-xl hover:bg-gold/90 transition-colors shrink-0">
          <Plus className="w-4 h-4" aria-hidden="true" />
          Aggiungi
        </button>
      </header>

      {urgent.length > 0 && (
        <div role="status" className="rounded-xl border border-warning/30 bg-warning-dim px-4 py-3 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-sm text-text-primary">
            <strong>{urgent.length}</strong>{' '}
            {urgent.length === 1 ? 'documento richiede attenzione' : 'documenti richiedono attenzione'}:
            controlla scadenze e rinnovi.
          </p>
        </div>
      )}

      {documents.length === 0 && (
        <div className="text-center py-20 text-text-tertiary text-sm">
          Nessun documento registrato. Aggiungi carta d’identità, visita medica, certificazioni…
        </div>
      )}

      <ul className="space-y-2">
        {withState.map(({ doc, state }) => {
          const ui = STATUS_UI[state.status]
          return (
            <li key={doc.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
              <ui.Icon className="w-4 h-4 text-text-tertiary shrink-0" aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary truncate flex items-center gap-1.5">
                  {doc.label}
                  {doc.file_path && <Paperclip className="w-3 h-3 text-text-tertiary shrink-0" aria-label="Con allegato" />}
                </p>
                <p className="text-2xs text-text-tertiary">
                  {doc.doc_type}
                  {doc.expires_at && ` · scade il ${new Date(doc.expires_at).toLocaleDateString('it-IT')}`}
                </p>
              </div>
              <span className={`shrink-0 text-2xs font-semibold px-2 py-1 rounded-full ${ui.cls}`}>
                {state.status === 'in_scadenza' && state.daysLeft !== null
                  ? `Fra ${state.daysLeft} ${state.daysLeft === 1 ? 'giorno' : 'giorni'}`
                  : state.status === 'scaduto' && state.daysLeft !== null
                    ? `Scaduto da ${Math.abs(state.daysLeft)} gg`
                    : ui.label}
              </span>
              {doc.file_path && (
                <button onClick={() => download(doc)} disabled={downloading === doc.id}
                  aria-label={`Scarica ${doc.label}`}
                  className="p-2 rounded-lg text-text-tertiary hover:text-gold-text hover:bg-surface-hover transition-colors shrink-0 disabled:opacity-50">
                  {downloading === doc.id
                    ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    : <Download className="w-4 h-4" aria-hidden="true" />}
                </button>
              )}
              <button onClick={() => remove(doc.id)} aria-label={`Elimina ${doc.label}`}
                className="p-2 rounded-lg text-text-tertiary hover:text-error hover:bg-error-dim transition-colors shrink-0">
                <Trash2 className="w-4 h-4" aria-hidden="true" />
              </button>
            </li>
          )
        })}
      </ul>

      {showNew && (
        <NewDocModal profileId={profileId} onClose={() => setShowNew(false)}
          onSaved={() => { setShowNew(false); router.refresh() }} />
      )}
    </div>
  )
}

function NewDocModal({ profileId, onClose, onSaved }: {
  profileId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [label, setLabel] = useState('')
  const [docType, setDocType] = useState<string>(DOC_TYPES[0])
  const [expiresAt, setExpiresAt] = useState('')
  const [reminder, setReminder] = useState(30)
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!label.trim()) { toast.error('Il nome del documento è obbligatorio'); return }
    setSaving(true)
    const fd = new FormData()
    fd.append('profile_id', profileId)
    fd.append('label', label.trim())
    fd.append('doc_type', docType)
    fd.append('expires_at', expiresAt)
    fd.append('reminder_days_before', String(reminder))
    if (file) fd.append('file', file)
    const res = await upsertPersonalDoc(fd)
    setSaving(false)
    if ('error' in res) { toast.error(res.error); return }
    toast.success('Documento aggiunto')
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface border border-border rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-bold text-text-primary">Nuovo documento</h2>
          <button onClick={onClose} aria-label="Chiudi" className="text-text-tertiary hover:text-text-primary">
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label htmlFor="label" className="text-text-tertiary text-xs mb-1.5 block">Nome *</label>
            <input id="label" value={label} onChange={e => setLabel(e.target.value)}
              placeholder="Es. Carta d’identità"
              className="w-full bg-background border border-border-interactive rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold/40" />
          </div>

          <div>
            <label htmlFor="doc_type" className="text-text-tertiary text-xs mb-1.5 block">Tipo</label>
            <select id="doc_type" value={docType} onChange={e => setDocType(e.target.value)}
              className="w-full bg-background border border-border-interactive rounded-xl px-3 py-2 text-sm text-text-primary">
              {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="expires_at" className="text-text-tertiary text-xs mb-1.5 block">Scadenza</label>
              <input id="expires_at" type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)}
                className="w-full bg-background border border-border-interactive rounded-xl px-3 py-2 text-sm text-text-primary" />
            </div>
            <div>
              <label htmlFor="reminder" className="text-text-tertiary text-xs mb-1.5 block">Avvisami (giorni prima)</label>
              <input id="reminder" type="number" min={0} max={365} value={reminder}
                onChange={e => setReminder(Number(e.target.value))}
                className="w-full bg-background border border-border-interactive rounded-xl px-3 py-2 text-sm text-text-primary tabular" />
            </div>
          </div>

          <div>
            <label htmlFor="file" className="text-text-tertiary text-xs mb-1.5 block">File (opzionale)</label>
            <input id="file" type="file" accept="application/pdf,image/*"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-text-secondary file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-surface-active file:text-text-primary file:text-xs" />
            <p className="text-2xs text-text-tertiary mt-1">Se alleghi il file, resta privato sullo storage interno (VPS).</p>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-border flex gap-2">
          <button onClick={save} disabled={saving || !label.trim()}
            className="flex-1 py-2.5 bg-gold text-on-gold text-sm font-semibold rounded-xl hover:bg-gold/90 disabled:opacity-40 transition-colors">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" aria-hidden="true" /> : 'Aggiungi'}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 text-text-tertiary text-sm rounded-xl hover:text-text-primary transition-colors">
            Annulla
          </button>
        </div>
      </div>
    </div>
  )
}
