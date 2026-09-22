'use client'

/**
 * §404 — «Da dove partiamo», dentro il passo in cui si sceglie il servizio.
 *
 * Erano tre schermate: il servizio al passo 3, il template al 6, le ricorrenze
 * commerciali sopra l'albero al 7. Tre momenti per la stessa domanda — cosa
 * c'è dentro questo progetto — e l'ultimo arrivava quando l'albero era già
 * montato, cioè quando nessuno guarda più niente.
 *
 * **Un modello intero, e sopra le aggiunte.** Il template dà l'ossatura ed è
 * uno solo: due ossature sovrapposte sono due progetti nello stesso progetto, e
 * nessuno se ne accorgerebbe fino al passo Struttura. Corsie, ricorrenze e su
 * misura si aggiungono, quante ne servono, e restano quando il template cambia:
 * sono scelte diverse e non devono cadere insieme.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  FolderTree, FileStack, CalendarHeart, CalendarRange, Sparkles,
  Flag, CheckSquare, Repeat, Clock, Loader2, Plus, Check, Pencil,
} from 'lucide-react'
import { SearchInput } from '@/components/shared/formkit'
import { createClient as createBrowserClient } from '@/lib/supabase/client'
import { corsieDeiTemplate, normalizza, suMisura, type CorsiaProposta } from '@/lib/workstream-presets'
import {
  daProporre, quandoDice,
  type Ricorrenza, type DataScritta, type Occorrenza,
} from '@/lib/ricorrenze-commerciali'
import type { Periodo } from '@/lib/periodi'
import { nk, type WsPick, type CorsiaScelta, type EventoScelto, type ProjectArea } from './types'
import type { ProjectTemplate, ProjectTemplateNode } from '@/lib/types/database'

/** cosa porta dentro un template intero: si legge prima di sceglierlo */
export function contaNodi(nodes: ProjectTemplateNode[], templateId: string) {
  const own = nodes.filter(n => n.template_id === templateId)
  const days = own.map(n => n.relative_due_days).filter((d): d is number => d != null)
  return {
    ws: own.filter(n => n.node_type === 'workstream').length,
    ms: own.filter(n => n.node_type === 'milestone').length,
    tk: own.filter(n => n.node_type === 'task').length,
    rc: own.filter(n => n.node_type === 'recurring_task').length,
    hours: own.reduce((s, n) => s + (n.node_type === 'task' ? n.estimated_hours ?? 0 : 0), 0),
    span: days.length ? Math.max(...days) : 0,
    roles: Array.from(new Set(own.map(n => n.suggested_owner_role).filter((r): r is string => !!r))),
  }
}

/**
 * L'elenco delle ricorrenze si legge dal browser (§393): `commercial_events` ha
 * una policy di lettura aperta perché è un calendario di feste, e farlo passare
 * dalle pagine che montano il wizard sarebbe tre posti in cui dimenticarsene.
 */
function useRicorrenze(area: ProjectArea) {
  const [elenco, setElenco] = useState<Ricorrenza[] | null>(null)
  const [scritte, setScritte] = useState<DataScritta[]>([])

  useEffect(() => {
    let vivo = true
    const sb = createBrowserClient()
    void (async () => {
      const [{ data: ev }, { data: dt }] = await Promise.all([
        sb.from('commercial_events').select('id, slug, name, date_rule, lead_days, areas, description, active'),
        sb.from('commercial_event_dates').select('event_id, year, event_date'),
      ])
      if (!vivo) return
      // senza la 247 la tabella non c'è: il gruppo non compare, invece di un errore
      setElenco((ev ?? []) as Ricorrenza[])
      setScritte((dt ?? []) as DataScritta[])
    })()
    return () => { vivo = false }
  }, [])

  const oggi = new Date().toISOString().slice(0, 10)
  const proposte = useMemo(
    () => elenco ? daProporre(elenco, area, oggi, scritte) : [],
    [elenco, area, oggi, scritte])
  return { proposte, caricando: elenco === null }
}

export function DaDovePartiamo({
  area, servizi, templates, nodes,
  templateId, setTemplateId, corsie, setCorsie, eventi, setEventi,
  periodi, apriPeriodi, setApriPeriodi, strutturaToccata = false,
}: {
  area: ProjectArea
  servizi: WsPick[]
  templates: ProjectTemplate[]
  nodes: ProjectTemplateNode[]
  templateId: string | null
  setTemplateId: (id: string | null) => void
  corsie: CorsiaScelta[]
  setCorsie: React.Dispatch<React.SetStateAction<CorsiaScelta[]>>
  eventi: EventoScelto[]
  setEventi: React.Dispatch<React.SetStateAction<EventoScelto[]>>
  /** i periodi che il motore aprirà alla creazione, se il servizio ne ha */
  periodi: Periodo[]
  apriPeriodi: boolean
  setApriPeriodi: (v: boolean) => void
  strutturaToccata?: boolean
}) {
  const [q, setQ] = useState('')
  const { proposte: occorrenze, caricando } = useRicorrenze(area)

  const cerca = (nome: string) => !q.trim() || normalizza(nome).includes(normalizza(q))

  const modelli = useMemo(() => templates
    .filter(t => t.is_active && (t.kind ?? 'project') !== 'period'
      && servizi.some(s => s.service_type === t.service_type
        && (s.service_subtype ?? null) === (t.service_subtype ?? null)))
    .filter(t => cerca(t.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [templates, servizi, q])

  /* Le corsie che il template scelto porta già dentro non si offrono una
     seconda volta: sarebbero due corsie con lo stesso nome nello stesso
     progetto, e chi ci lavora non saprebbe in quale mettere le task. */
  const dentroIlTemplate = useMemo(() => new Set(
    templateId
      ? nodes.filter(n => n.template_id === templateId && !n.parent_id && n.node_type === 'workstream')
        .map(n => normalizza(n.name))
      : []),
    [nodes, templateId])

  const tutteLeCorsie = useMemo(
    () => corsieDeiTemplate(templates, nodes, servizi),
    [templates, nodes, servizi])
  const proposteCorsie = tutteLeCorsie
    .filter(c => !dentroIlTemplate.has(normalizza(c.nome)))
    .filter(c => cerca(c.nome))

  const eventiVisibili = occorrenze.filter(o => cerca(o.etichetta))

  const nuovo = suMisura(q, [], [
    ...tutteLeCorsie.map(c => c.nome),
    ...corsie.map(c => c.nome),
    ...occorrenze.map(o => o.etichetta),
    ...modelli.map(t => t.name),
  ])

  const scelta = (k: string) => corsie.some(c => c.key === k)
  const evento = (o: Occorrenza) => `ric:${o.ricorrenza.slug}:${o.anno}`
  const scelto = (o: Occorrenza) => eventi.some(e => e.key === evento(o))

  const niente = !modelli.length && !proposteCorsie.length && !eventiVisibili.length && !nuovo

  return (
    <section className="border border-border rounded-xl overflow-hidden">
      <header className="px-3 py-2.5 bg-surface border-b border-border">
        <h3 className="text-xs font-bold text-text-primary">Da dove partiamo?</h3>
        <p className="text-2xs text-text-secondary mt-0.5">
          Un modello dà l&apos;ossatura, e sopra ci aggiungi quello che serve. Tutto si modifica al passo Struttura.
        </p>
      </header>

      {periodi.length > 0 && (
        <label className="flex items-start gap-2.5 px-3 py-2.5 border-b border-border cursor-pointer hover:bg-surface-hover transition-colors">
          <input type="checkbox" checked={apriPeriodi} onChange={e => setApriPeriodi(e.target.checked)}
            className="accent-gold w-3.5 h-3.5 cursor-pointer shrink-0 mt-0.5" />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-text-primary">
              <CalendarRange className="w-3.5 h-3.5 text-gold-text shrink-0" />
              Apri subito {periodi.map(p => p.etichetta).join(' e ')}
            </span>
            <span className="block text-2xs text-text-secondary mt-0.5">
              Il periodo lo apre il motore appena il progetto esiste, con le sue date e le sue tappe: non è una riga dell&apos;albero.
            </span>
          </span>
        </label>
      )}

      {strutturaToccata && (
        <p className="flex items-center gap-1.5 px-3 py-2 text-2xs text-warning border-b border-border">
          <Pencil className="w-3.5 h-3.5 shrink-0" />
          Hai già modificato l&apos;albero: cambiare qui lo riscrive da capo.
        </p>
      )}

      <div className="p-3 border-b border-border">
        <SearchInput value={q} onChange={setQ} placeholder="Cerca fra modelli, corsie e ricorrenze…" />
      </div>

      <div className="max-h-[42vh] overflow-y-auto">
        <Gruppo titolo="Modelli interi" nota="uno solo: dà l'ossatura del progetto" icona={<FileStack className="w-3 h-3" />}>
          <Riga
            scelto={templateId === null}
            tondo
            titolo="Nessun modello"
            sotto="Una corsia per ogni servizio scelto, e le aggiunte qui sotto."
            onClick={() => setTemplateId(null)} />
          {modelli.map(t => {
            const c = contaNodi(nodes, t.id)
            return (
              <Riga key={t.id} scelto={templateId === t.id} tondo
                titolo={t.name}
                sotto={t.description ?? undefined}
                meta={
                  <span className="flex items-center gap-2 text-2xs text-text-secondary tabular shrink-0">
                    <span className="flex items-center gap-1"><FolderTree className="w-3 h-3" />{c.ws}</span>
                    <span className="flex items-center gap-1"><Flag className="w-3 h-3 text-info" />{c.ms}</span>
                    <span className="flex items-center gap-1"><CheckSquare className="w-3 h-3" />{c.tk}</span>
                    {c.rc > 0 && <span className="flex items-center gap-1 text-success"><Repeat className="w-3 h-3" />{c.rc}</span>}
                    {c.hours > 0 && <span className="flex items-center gap-1 text-accent"><Clock className="w-3 h-3" />{c.hours}h</span>}
                  </span>
                }
                onClick={() => setTemplateId(t.id)} />
            )
          })}
        </Gruppo>

        {proposteCorsie.length > 0 && (
          <Gruppo titolo="Corsie da aggiungere" nota="quante ne servono, col loro contenuto" icona={<FolderTree className="w-3 h-3" />}>
            {proposteCorsie.map(c => (
              <Riga key={c.key} scelto={scelta(c.key)}
                titolo={c.nome}
                sotto={contenutoDi(c)}
                meta={c.tipo === 'recurring'
                  ? <span className="flex items-center gap-1 text-2xs text-success shrink-0"><Repeat className="w-3 h-3" />continuativa</span>
                  : undefined}
                onClick={() => setCorsie(cs => scelta(c.key)
                  ? cs.filter(x => x.key !== c.key)
                  : [...cs, { key: c.key, nome: c.nome, tipo: c.tipo, nodeId: c.nodeId }])} />
            ))}
          </Gruppo>
        )}

        {(eventiVisibili.length > 0 || caricando) && (
          <Gruppo titolo="Ricorrenze commerciali" nota="si sanno da un anno, si aprono a novembre" icona={<CalendarHeart className="w-3 h-3" />}>
            {caricando ? (
              <p className="flex items-center gap-2 px-3 py-2 text-2xs text-text-tertiary">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cerco le ricorrenze del periodo…
              </p>
            ) : eventiVisibili.map(o => (
              <Riga key={evento(o)} scelto={scelto(o)}
                titolo={o.etichetta}
                sotto={quandoDice(o)}
                tono={o.data ? undefined : 'warning'}
                onClick={() => setEventi(es => scelto(o)
                  ? es.filter(x => x.key !== evento(o))
                  : [...es, {
                    key: evento(o), nome: o.etichetta, dal: o.dal, al: o.data,
                    descrizione: o.ricorrenza.description ?? null,
                  }])} />
            ))}
          </Gruppo>
        )}

        {nuovo && (
          <Gruppo titolo="Su misura" nota="quando non c'è un modello" icona={<Sparkles className="w-3 h-3" />}>
            <button type="button"
              onClick={() => { setCorsie(cs => [...cs, { key: `custom:${nk()}`, nome: nuovo, tipo: 'project' }]); setQ('') }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-surface-hover transition-colors">
              <Plus className="w-4 h-4 text-gold-text shrink-0" />
              <span className="text-sm font-semibold text-text-primary">Crea «{nuovo}» come corsia</span>
            </button>
          </Gruppo>
        )}

        {niente && (
          <p className="px-3 py-3 text-2xs text-text-tertiary">
            Niente per «{q.trim()}». Cancella la ricerca per rivedere modelli e corsie.
          </p>
        )}
      </div>

      {(corsie.length > 0 || eventi.length > 0) && (
        <footer className="flex items-center gap-2 flex-wrap px-3 py-2.5 border-t border-border bg-surface">
          <span className="text-2xs text-text-tertiary shrink-0">Aggiunte:</span>
          {corsie.map(c => (
            <Chip key={c.key} testo={c.nome} onTogli={() => setCorsie(cs => cs.filter(x => x.key !== c.key))} />
          ))}
          {eventi.map(e => (
            <Chip key={e.key} testo={e.nome} onTogli={() => setEventi(es => es.filter(x => x.key !== e.key))} />
          ))}
        </footer>
      )}
    </section>
  )
}

const contenutoDi = (c: CorsiaProposta) => [
  c.tappe && `${c.tappe} ${c.tappe === 1 ? 'tappa' : 'tappe'}`,
  c.task && `${c.task} task`,
  c.ricorrenti && `${c.ricorrenti} ${c.ricorrenti === 1 ? 'ricorrente' : 'ricorrenti'}`,
].filter(Boolean).join(' · ') || 'corsia vuota'

function Gruppo({ titolo, nota, icona, children }: {
  titolo: string; nota: string; icona: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className="border-b border-border last:border-b-0">
      <div className="flex items-baseline gap-1.5 px-3 pt-2.5 pb-1">
        <span className="flex items-center gap-1 text-2xs font-bold text-text-secondary uppercase tracking-wide">
          {icona}{titolo}
        </span>
        <span className="text-2xs text-text-tertiary truncate">· {nota}</span>
      </div>
      {children}
    </div>
  )
}

/** `tondo` = scelta unica (il modello); altrimenti è una spunta */
function Riga({ scelto, tondo, titolo, sotto, meta, tono, onClick }: {
  scelto: boolean; tondo?: boolean; titolo: string
  sotto?: string; meta?: React.ReactNode; tono?: 'warning'; onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={scelto}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
        scelto ? 'bg-gold-dim' : 'hover:bg-surface-hover'}`}>
      <span className={`w-4 h-4 flex items-center justify-center shrink-0 border ${
        tondo ? 'rounded-full' : 'rounded-md'} ${scelto ? 'bg-gold border-gold' : 'border-border-strong'}`}>
        {scelto && <Check className="w-3 h-3 text-on-gold" strokeWidth={3} />}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-xs font-semibold text-text-primary truncate">{titolo}</span>
        {sotto && (
          <span className={`block text-2xs truncate ${tono === 'warning' ? 'text-warning' : 'text-text-tertiary'}`}>
            {sotto}
          </span>
        )}
      </span>
      {meta}
    </button>
  )
}

function Chip({ testo, onTogli }: { testo: string; onTogli: () => void }) {
  return (
    <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-gold-dim border border-gold/30 text-2xs font-semibold text-text-primary">
      {testo}
      <button type="button" onClick={onTogli} aria-label={`Togli ${testo}`}
        className="text-text-tertiary hover:text-error">×</button>
    </span>
  )
}
