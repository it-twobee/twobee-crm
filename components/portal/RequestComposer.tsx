'use client'

import { useEffect, useState } from 'react'
import { REQUEST_KINDS, type PortalProject } from '@/lib/portal/model'

type Draft = { kind: keyof typeof REQUEST_KINDS; project: string; title: string; body: string; detail: string }
const INPUT = 'mt-2 min-h-11 w-full rounded-lg border border-border-interactive bg-background px-3 py-2 text-sm text-text-primary'

export function RequestComposer({ companyName, projects, initialProject, draftKey }: {
  companyName: string; projects: Pick<PortalProject, 'id' | 'title'>[]; initialProject?: string; draftKey: string
}) {
  const [draft, setDraft] = useState<Draft>({ kind: 'supporto', project: initialProject ?? '', title: '', body: '', detail: '' })
  const [ready, setReady] = useState(false)
  const [storageError, setStorageError] = useState(false)
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(draftKey)
      if (saved) {
        const parsed = JSON.parse(saved) as Draft
        if (Object.hasOwn(REQUEST_KINDS, parsed.kind) && ['title', 'body', 'detail', 'project'].every(k => typeof parsed[k as keyof Draft] === 'string')) {
          setDraft({ kind: parsed.kind, title: parsed.title.slice(0, 160), body: parsed.body.slice(0, 5000), detail: parsed.detail.slice(0, 500), project: initialProject ?? (projects.some(p => p.id === parsed.project) ? parsed.project : '') })
        }
      }
    } catch { setStorageError(true) }
    setReady(true)
  // Il chiamante usa la chiave account/azienda anche come key React.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey])
  useEffect(() => {
    if (!ready) return
    try { sessionStorage.setItem(draftKey, JSON.stringify(draft)) } catch { setStorageError(true) }
  }, [draft, draftKey, ready])
  function update(field: keyof Draft, value: string) { setDraft(d => ({ ...d, [field]: value })) }

  return <section id="nuova-richiesta" className="mb-12 max-w-3xl rounded-xl border border-border bg-surface p-5 sm:p-8">
    <h2 className="font-heading text-2xl font-semibold">Di cosa hai bisogno?</h2>
    <p className="mt-2 text-sm text-text-secondary">Per {companyName}. Puoi preparare una bozza; l’invio al team non è ancora attivo.</p>
    <form onSubmit={e => e.preventDefault()} className="mt-6 space-y-5">
      <div className="grid gap-5 sm:grid-cols-2"><label className="text-sm font-medium">Tipo di richiesta<select value={draft.kind} onChange={e => setDraft(d => ({ ...d, kind: e.target.value as Draft['kind'], detail: '' }))} className={INPUT}>{Object.entries(REQUEST_KINDS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label><label className="text-sm font-medium">Progetto<select value={draft.project} onChange={e => update('project', e.target.value)} className={INPUT}><option value="">Richiesta generale</option>{projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label></div>
      <label className="block text-sm font-medium">In poche parole<input value={draft.title} onChange={e => update('title', e.target.value)} maxLength={160} placeholder="Un titolo per ritrovare la richiesta" className={INPUT} /></label>
      <label className="block text-sm font-medium">{REQUEST_KINDS[draft.kind].prompt}<textarea value={draft.body} onChange={e => update('body', e.target.value)} maxLength={5000} rows={5} className={`${INPUT} resize-y`} /></label>
      {(draft.kind === 'bug' || draft.kind === 'report' || draft.kind === 'audit') && <label className="block text-sm font-medium">{draft.kind === 'bug' ? 'Pagina in cui accade' : draft.kind === 'report' ? 'Periodo di riferimento' : 'Area da analizzare'}<input value={draft.detail} onChange={e => update('detail', e.target.value)} maxLength={500} className={INPUT} /></label>}
      {draft.kind === 'bug' && <p className="text-xs text-text-secondary">L’allegato facoltativo sarà disponibile quando il caricamento protetto sarà attivo.</p>}
      {['attivita', 'audit', 'report'].includes(draft.kind) && <p className="text-sm text-text-secondary">La richiesta sarà valutata dal team. Perimetro, tempi ed eventuali costi saranno concordati prima di iniziare.</p>}
      <div className="border-t border-border pt-5"><button disabled type="submit" className="min-h-11 rounded-lg border border-border-strong px-5 text-sm text-text-secondary disabled:cursor-not-allowed">Invio non ancora attivo</button><p role="status" className={`mt-3 text-xs ${storageError ? 'text-warning' : 'text-text-secondary'}`}>{storageError ? 'Non è possibile conservare la bozza nella sessione del browser. Il testo resta in questa pagina finché non la chiudi.' : 'Bozza conservata solo nella sessione di questo browser, per questo account e questa azienda. Non viene inviata a TwoBee.'}</p></div>
    </form>
  </section>
}
