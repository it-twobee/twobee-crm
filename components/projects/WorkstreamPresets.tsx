'use client'

/**
 * §394 — l'elenco dei workstream preimpostati, uno solo per quattro posti.
 *
 * Lo montano il wizard (passo «Cosa consegniamo» e albero del lavoro), la
 * modale «Nuova workstream» della scheda progetto e quella rapida dell'header:
 * erano quattro strade per la stessa decisione e tre partivano da un campo
 * vuoto. La scelta — cosa proporre, in che ordine, quando il testo scritto è un
 * nome nuovo — sta in `lib/workstream-presets.ts`; qui ci sono le righe.
 *
 * Il catalogo si legge **dal browser**, come le ricorrenze commerciali (§393):
 * `service_catalog` è in lettura a tutto lo staff, e farlo passare dalle pagine
 * che montano questi modali sarebbe stato quattro posti in cui dimenticarsene.
 */

import { useEffect, useState, useMemo, useTransition } from 'react'
import { toast } from 'sonner'
import { FolderTree, Plus, Loader2, CalendarRange } from 'lucide-react'
import { createClient as createBrowserClient } from '@/lib/supabase/client'
import { PickRow, Empty } from '@/components/shared/formkit'
import { createCatalogService } from '@/app/actions/wizard'
import { areaLabel } from '@/lib/project-naming'
import {
  proposte, suMisura, tipoServizio, trimestriMancanti,
  type Preset, type Forma, type CorsiaEsistente,
} from '@/lib/workstream-presets'
import type { ProjectArea, ServiceCatalogEntry } from '@/lib/types/database'

export type WorkstreamPick = {
  label: string
  area: ProjectArea
  service_type: string
  service_subtype: string | null
  custom: boolean
}

let catalogo: ServiceCatalogEntry[] | null = null
let inCorso: Promise<ServiceCatalogEntry[]> | null = null

/** Una voce appena creata entra subito in cache: riaprire il modale deve mostrarla. */
export function ricordaServizio(s: ServiceCatalogEntry) {
  if (catalogo && !catalogo.some(x => x.id === s.id)) catalogo = [...catalogo, s]
}

/**
 * Il catalogo, una volta per sessione. Senza cache ogni apertura di modale è un
 * giro di rete su una lista di dodici righe che cambia due volte l'anno.
 */
export function useServiceCatalog(enabled = true) {
  const [services, setServices] = useState<ServiceCatalogEntry[]>(catalogo ?? [])
  const [loading, setLoading] = useState(enabled && !catalogo)

  useEffect(() => {
    if (!enabled || catalogo) return
    let vivo = true
    // l'attesa comincia adesso: quando l'elenco si accende dopo (scelto il
    // progetto) il riquadro diceva «nessun workstream a catalogo» per un attimo
    setLoading(true)
    const giro = inCorso ?? (async () => {
      const { data } = await createBrowserClient()
        .from('service_catalog').select('*').eq('is_active', true)
        .order('area').order('sort_order')
      const list = (data ?? []) as ServiceCatalogEntry[]
      catalogo = list
      inCorso = null
      return list
    })()
    inCorso = giro
    void giro.then(list => { if (vivo) { setServices(list); setLoading(false) } })
    return () => { vivo = false }
  }, [enabled])

  return { services, loading }
}

export function WorkstreamPresets({
  area, services, loading = false, query, presenti = [], altreAree = true,
  scelto, metaOf, notaPresente = 'già nel progetto', canPersist = false,
  maxH = 'max-h-[32vh]', onPick,
}: {
  area: ProjectArea
  services: ServiceCatalogEntry[]
  loading?: boolean
  /** il testo scritto: filtra il catalogo e, se non corrisponde a niente, diventa il su misura */
  query: string
  /** i workstream che ci sono già: si marcano, e bloccano un su misura con lo stesso nome */
  presenti?: string[]
  altreAree?: boolean
  scelto?: (p: Preset) => boolean
  metaOf?: (p: Preset) => React.ReactNode
  notaPresente?: string
  /** solo admin e manager possono aggiungere al catalogo: la porta vera è nell'azione */
  canPersist?: boolean
  maxH?: string
  onPick: (pick: WorkstreamPick) => void
}) {
  const [persist, setPersist] = useState(true)
  const [pending, start] = useTransition()

  const lista = useMemo(
    () => proposte(services, { area, query, altreAree, presenti }),
    [services, area, query, altreAree, presenti])
  const nuovo = suMisura(query, lista, presenti)

  const creaSuMisura = () => {
    if (!nuovo) return
    const fatto = (service_type: string) =>
      onPick({ label: nuovo, area, service_type, service_subtype: null, custom: true })
    if (!persist || !canPersist) { fatto(tipoServizio(nuovo) || 'workstream'); return }
    start(async () => {
      try {
        const svc = await createCatalogService({ area, label: nuovo }) as ServiceCatalogEntry
        ricordaServizio(svc)
        fatto(svc.service_type)
        toast.success('Workstream aggiunto al catalogo')
      } catch (e) {
        // il catalogo è un di più: se fallisce, il workstream nasce lo stesso
        fatto(tipoServizio(nuovo) || 'workstream')
        toast.message('Aggiunto solo qui', { description: e instanceof Error ? e.message : undefined })
      }
    })
  }

  return (
    <div className="space-y-2.5">
      {nuovo && (
        <div className="rounded-xl border border-gold/40 bg-gold-dim p-3">
          <button type="button" onClick={creaSuMisura} disabled={pending}
            className="flex items-center gap-2 text-sm font-semibold text-text-primary disabled:opacity-50">
            {pending ? <Loader2 className="w-4 h-4 animate-spin text-gold-text" /> : <Plus className="w-4 h-4 text-gold-text" />}
            Crea «{nuovo}» come workstream
          </button>
          {canPersist && (
            <label className="flex items-center gap-2 mt-2 cursor-pointer">
              <input type="checkbox" checked={persist} onChange={e => setPersist(e.target.checked)}
                className="accent-gold w-3.5 h-3.5 cursor-pointer" />
              <span className="text-2xs text-text-secondary">Salvalo anche a catalogo, così lo ritrovi nei prossimi progetti</span>
            </label>
          )}
        </div>
      )}

      {loading ? (
        <p className="flex items-center gap-2 text-2xs text-text-tertiary">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cerco i workstream a catalogo…
        </p>
      ) : lista.length === 0 ? (
        nuovo ? null : (
          <Empty>Nessun workstream a catalogo: scrivi qui sopra come si chiama questo.</Empty>
        )
      ) : (
        <div className={`space-y-1.5 overflow-y-auto pr-1 ${maxH}`}>
          {lista.map((p, i) => {
            const stacco = p.altraArea && !lista[i - 1]?.altraArea
            const sotto = [
              p.service_subtype ? p.service_subtype.replace(/_/g, ' ') : null,
              p.altraArea ? areaLabel(p.area) : null,
            ].filter(Boolean).join(' · ')
            return (
              <div key={p.key} className={stacco ? 'pt-1.5' : undefined}>
                {stacco && <div className="text-2xs font-semibold text-text-tertiary mb-1.5">Altre aree</div>}
                <PickRow selected={scelto?.(p) ?? false} dim={p.presente && !scelto?.(p)}
                  onClick={() => onPick({
                    label: p.label, area: p.area as ProjectArea,
                    service_type: p.service_type, service_subtype: p.service_subtype, custom: false,
                  })}
                  icon={<FolderTree className="w-4 h-4 text-gold-text shrink-0" />}
                  title={p.label}
                  subtitle={sotto || undefined}
                  meta={metaOf?.(p) ?? (p.presente && notaPresente
                    ? <span className="text-2xs text-text-tertiary shrink-0">{notaPresente}</span>
                    : undefined)} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * §396 — dove la corsia non si scrive: si apre.
 *
 * Sul Growth (`period_shape='quarter'`) una corsia nuova è il trimestre
 * successivo, e non nasce da un nome: nasce da `apriPeriodi`, che scrive anche
 * la riga in `project_periods` e ci semina dentro lo scheletro. Sul Marketing a
 * mese il periodo non è nemmeno una corsia — è una tappa dentro la
 * continuativa — e chiederlo qui sarebbe chiederlo nel posto sbagliato.
 *
 * Quello che questo riquadro **non** fa è aprire i periodi per conto suo: mostra
 * quali mancano e passa la parola alla stessa azione del bottone «Apri i
 * periodi», perché a mano e in automatico devono fare la stessa cosa (§392).
 */
export function PeriodiDelProgetto({ forma, corsie, pending, onApri }: {
  forma: Forma
  corsie: CorsiaEsistente[]
  pending: boolean
  onApri: () => void
}) {
  if (forma === 'none') return null
  const oggi = new Date().toISOString().slice(0, 10)
  const { mancanti, coperti } = trimestriMancanti({ oggi, forma, corsie })
  const giorno = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })

  return (
    <section className="rounded-xl border border-gold/40 bg-gold-dim p-3">
      <header className="flex items-start gap-2">
        <CalendarRange className="w-4 h-4 text-gold-text shrink-0 mt-0.5" aria-hidden />
        <div className="min-w-0">
          <h3 className="text-xs font-bold text-text-primary">
            {forma === 'quarter' ? 'Qui le corsie sono i trimestri' : 'Qui i mesi sono tappe, non corsie'}
          </h3>
          <p className="text-2xs text-text-secondary mt-0.5">
            {forma === 'quarter'
              ? 'Questo servizio lavora a trimestri della stagione: la corsia nuova è il periodo, con le sue date e lo scheletro dentro.'
              : 'Il piano del mese nasce come tappa dentro la continuativa del progetto, non come corsia a sé.'}
          </p>
        </div>
      </header>

      {forma === 'quarter' && (
        <div className="mt-2.5 space-y-1.5">
          {mancanti.map(p => (
            <div key={p.chiave} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface">
              <span className="flex-1 text-sm font-semibold text-text-primary truncate">{p.etichetta}</span>
              <span className="text-2xs text-text-tertiary tabular shrink-0">{giorno(p.dal)} – {giorno(p.al)}</span>
            </div>
          ))}
          {!mancanti.length && (
            <p className="text-2xs text-text-tertiary">
              {coperti.length
                ? `I trimestri di adesso ci sono già${coperti.find(c => c.corsia) ? `: «${coperti.find(c => c.corsia)!.corsia}»` : ''}.`
                : 'Nessun trimestre da aprire adesso.'}
            </p>
          )}
        </div>
      )}

      {/* Il bottone resta anche quando non manca niente: l'azione è la stessa del
          giro notturno e risponde «ci sono già tutti» invece di far dubitare. */}
      <button type="button" onClick={onApri} disabled={pending}
        className="mt-2.5 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gold text-on-gold text-2xs font-semibold press disabled:opacity-50">
        {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarRange className="w-3.5 h-3.5" />}
        {mancanti.length > 1 ? `Apri i ${mancanti.length} periodi` : 'Apri i periodi'}
      </button>
    </section>
  )
}
