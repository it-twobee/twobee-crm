'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { getClientTracking, upsertClientTracking, updateClientWebsite, type ClientTrackingPatch } from '@/app/actions/tracking'
import { Field, inputCls, Segmented } from '@/components/shared/formkit'
import {
  ARCHETYPES, CHANNELS, GSC_CHANNEL, STATUSES, CMS_SUGGESTIONS, channelsFor, trackingBadge, statusByValue,
  type TrackingStatus,
} from '@/lib/tracking/vocab'
import type { ClientTracking } from '@/lib/types/database'
import { Card, Chip, GoldButton, Loading, StatusChip } from './ui'
import { ChecklistSection } from './ChecklistSection'
import { SiteCheckSection } from './SiteCheckSection'
import { QaSection } from './QaSection'

const EMPTY: Omit<ClientTracking, 'client_id' | 'created_at' | 'updated_at' | 'updated_by'> = {
  archetype: null, cms: '', gtm_container_id: '', meta_pixel_id: '', ga4_property_id: '', lead_event: '',
  status_gtm: 'todo', status_ga4: 'todo', status_meta_pixel: 'todo', status_klaviyo: 'todo', status_gsc: 'todo',
}

type Form = { archetype: string; cms: string; gtm_container_id: string; meta_pixel_id: string; website: string }

export function ClientTrackingTab({ clientId, website: initialWebsite }: { clientId: string; website: string }) {
  const [tracking, setTracking] = useState<ClientTracking | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [form, setForm] = useState<Form>({ archetype: '', cms: '', gtm_container_id: '', meta_pixel_id: '', website: initialWebsite })
  const [website, setWebsite] = useState(initialWebsite)
  const [pending, start] = useTransition()
  /* la verifica del sito e il QA aggiornano gli stati: quando finiscono si ricarica */
  const [version, setVersion] = useState(0)

  const reload = useCallback(async () => {
    const res = await getClientTracking(clientId)
    if (!res.ok) { toast.error(res.error); return }
    setTracking(res.data.tracking)
    setWebsite(res.data.website)
    const t = res.data.tracking ?? EMPTY
    setForm({
      archetype: t.archetype ?? '', cms: t.cms, gtm_container_id: t.gtm_container_id, meta_pixel_id: t.meta_pixel_id,
      website: res.data.website,
    })
    setLoaded(true)
  }, [clientId])

  useEffect(() => { reload() }, [reload, version])

  const current = tracking ?? { ...EMPTY, client_id: clientId, created_at: '', updated_at: '', updated_by: null }
  const relevant = new Set(channelsFor(current.archetype))
  const badge = statusByValue(trackingBadge(current))!

  const save = () => start(async () => {
    const patch: ClientTrackingPatch = {
      archetype: (form.archetype || null) as ClientTracking['archetype'],
      cms: form.cms, gtm_container_id: form.gtm_container_id, meta_pixel_id: form.meta_pixel_id,
    }
    const res = await upsertClientTracking(clientId, patch)
    if (!res.ok) { toast.error(res.error); return }
    setTracking(res.data)
    if (form.website !== website) {
      const w = await updateClientWebsite(clientId, form.website)
      if (!w.ok) { toast.error(w.error); return }
      setWebsite(w.data)
      setForm(f => ({ ...f, website: w.data }))
    }
    toast.success('Tracking salvato')
  })

  const setStatus = (field: keyof ClientTrackingPatch, value: TrackingStatus) => start(async () => {
    const res = await upsertClientTracking(clientId, { [field]: value })
    if (!res.ok) { toast.error(res.error); return }
    setTracking(res.data)
  })

  if (!loaded) return <Loading />

  const statusOptions = STATUSES.map(s => ({ value: s.value, label: s.label }))
  const dirty = form.archetype !== (current.archetype ?? '') || form.cms !== current.cms ||
    form.gtm_container_id !== current.gtm_container_id || form.meta_pixel_id !== current.meta_pixel_id || form.website !== website

  return (
    <div className="space-y-4">
      <QaSection clientId={clientId} onChanged={() => setVersion(v => v + 1)} />

      <Card title="Configurazione" hint="Archetipo, sito e identificativi usati da verifica e controllo giornaliero"
        aside={<Chip tone={badge.tone}>Tracking: {badge.label}</Chip>}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Archetipo" hint="decide checklist e canali pertinenti">
            <select value={form.archetype} onChange={e => setForm(f => ({ ...f, archetype: e.target.value }))} className={inputCls}>
              <option value="">— non assegnato —</option>
              {ARCHETYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </Field>
          <Field label="CMS">
            <input list="tracking-cms" value={form.cms} onChange={e => setForm(f => ({ ...f, cms: e.target.value }))}
              className={inputCls} placeholder="Shopify, WordPress…" />
            <datalist id="tracking-cms">{CMS_SUGGESTIONS.map(c => <option key={c} value={c} />)}</datalist>
          </Field>
          <Field label="URL sito" hint="la verifica scarica la homepage">
            <input value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))}
              className={inputCls} placeholder="https://www.sito.it/" inputMode="url" />
          </Field>
          <Field label="ID container GTM" hint="GTM-XXXXXXX">
            <input value={form.gtm_container_id} onChange={e => setForm(f => ({ ...f, gtm_container_id: e.target.value }))}
              className={`${inputCls} font-mono`} placeholder="GTM-ABC1234" />
          </Field>
          <Field label="Pixel ID Meta" hint="solo cifre, non è un segreto">
            <input value={form.meta_pixel_id} onChange={e => setForm(f => ({ ...f, meta_pixel_id: e.target.value }))}
              className={`${inputCls} font-mono`} placeholder="1234567890123456" inputMode="numeric" />
          </Field>
        </div>
        <div className="flex justify-end mt-4">
          <GoldButton onClick={save} pending={pending} disabled={!dirty}>Salva</GoldButton>
        </div>
      </Card>

      <Card title="Stato canali" hint="Il badge guarda solo i canali pertinenti all'archetipo e ignora i «N/A». Search Console è SEO: resta fuori.">
        <div className="space-y-3">
          {[...CHANNELS, GSC_CHANNEL].map(ch => {
            const field = `status_${ch.key}` as keyof ClientTrackingPatch
            const value = current[field as keyof ClientTracking] as TrackingStatus
            const pertinent = ch.key === 'gsc' ? true : relevant.has(ch.key)
            return (
              <div key={ch.key} className={`flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 ${pertinent ? '' : 'opacity-60'}`}>
                <div className="sm:w-56 flex items-center gap-2">
                  <span className="text-sm font-semibold text-text-primary">{ch.label}</span>
                  <StatusChip value={value} />
                </div>
                <div className="flex-1 max-w-md">
                  <Segmented value={value} onChange={v => setStatus(field, v)} options={statusOptions} ariaLabel={`Stato ${ch.label}`} />
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      <SiteCheckSection clientId={clientId} website={website} onChanged={() => setVersion(v => v + 1)} />
      <ChecklistSection clientId={clientId} archetype={current.archetype} />
    </div>
  )
}
