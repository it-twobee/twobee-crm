'use client'

import { useId, useMemo, useRef, useState } from 'react'
import Link from '@/components/lab/LabLink'
import { chartCsv, chartValue, filterChartRows, type ChartRow, type ChartSeries } from '@/lib/lab-chart'

type Props = { title: string; note: string; rows: ChartRow[]; series: ChartSeries[]; context: string; initialType?: 'bar' | 'line'; chartId?: string; singleGroup?: boolean; groupLabel?: string; initialGroup?: string }
const palette = ['--color-info', '--color-gold-text', '--color-accent', '--color-success', '--color-orange']
const format = (n: number | null) => n == null ? 'n/d' : new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n)
const short = (n: number) => new Intl.NumberFormat('it-IT', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
const control = 'min-h-11 w-full rounded-xl border border-border-interactive bg-surface px-3 py-2 text-sm text-text-primary'
const button = 'min-h-11 rounded-xl border border-border-interactive px-3 py-2 text-sm text-text-primary hover:bg-surface-hover disabled:opacity-50'
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), a = document.createElement('a')
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export default function LabChart({ title, note, rows, series, context, initialType = 'bar', chartId, singleGroup = false, groupLabel = 'Conto del grafico', initialGroup }: Props) {
  const chartAnchor = chartId ?? `grafico-${title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  const defaultGroup = singleGroup ? (initialGroup && rows.some(r => (r.groupId ?? r.group) === initialGroup) ? initialGroup : rows.find(r => r.group)?.groupId ?? rows.find(r => r.group)?.group ?? '') : ''
  const temporal = initialType === 'line'
  const id = useId(), svg = useRef<SVGSVGElement>(null)
  const [heading, setHeading] = useState(title), [type, setType] = useState(initialType)
  const [keys, setKeys] = useState(series.map(s => s.key)), [query, setQuery] = useState(''), [group, setGroup] = useState(defaultGroup)
  const [from, setFrom] = useState(''), [to, setTo] = useState(''), [sort, setSort] = useState('source')
  const [selected, setSelected] = useState<string | null>(null), [page, setPage] = useState(0), [message, setMessage] = useState('')
  const active = series.filter(s => keys.includes(s.key))
  const filtered = useMemo(() => filterChartRows(rows, { query, group, from, to, sort: type === 'line' ? 'source' : sort }, keys).sort((a, b) => type === 'line' ? (a.date ?? '').localeCompare(b.date ?? '') : 0), [rows, query, group, from, to, sort, keys, type])
  const groups = Array.from(new Map(rows.filter(r => r.group).map(r => [r.groupId ?? r.group!, r.group!])).entries()).map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label, 'it'))
  const pageSize = temporal ? 36 : 12
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize)), current = Math.min(page, pages - 1), shown = filtered.slice(current * pageSize, current * pageSize + pageSize)
  const values = shown.flatMap(r => active.map(s => chartValue(r.values[s.key])).filter((n): n is number => n != null))
  const min = Math.min(0, ...values), max = Math.max(0, ...values), span = max - min || 1
  const x = (n: number) => 240 + (n - min) / span * 620
  const y = (n: number) => 248 - (n - min) / span * 208
  const dateAt = (n: number) => Date.parse(`${shown[n]?.date}T00:00:00Z`)
  const dateSpan = dateAt(shown.length - 1) - dateAt(0)
  const pointX = (n: number) => shown.length === 1 ? 465 : 80 + (Number.isFinite(dateSpan) && dateSpan > 0 ? (dateAt(n) - dateAt(0)) / dateSpan : n / Math.max(shown.length - 1, 1)) * 770
  const height = type === 'bar' ? Math.max(180, shown.length * (32 + active.length * 17) + 65) : 360
  const chosen = filtered.find(r => r.id === selected)
  const dates = rows.some(r => r.date)
  const filterContext = `${context} · filtro: ${query || 'tutte le voci'} · gruppo: ${groups.find(g => g.key === group)?.label ?? 'tutti'} · dal ${from || 'inizio'} al ${to || 'fine'} · ${filtered.length} voci · ordine ${sort} · serie ${active.map(s => s.label).join(', ')}`
  const reset = () => { setHeading(title); setType(initialType); setKeys(series.map(s => s.key)); setQuery(''); setGroup(defaultGroup); setFrom(''); setTo(''); setSort('source'); setSelected(null); setPage(0) }
  const exportImage = async (png: boolean) => {
    try {
      const source = svg.current
      if (!source) return
      const clone = source.cloneNode(true) as SVGSVGElement
      // Freeze theme tokens so the downloaded SVG/PNG remains readable outside the app.
      const original = [source, ...Array.from(source.querySelectorAll('*'))]
      const copied = [clone, ...Array.from(clone.querySelectorAll('*'))]
      original.forEach((el, n) => { const css = getComputedStyle(el); for (const p of ['fill', 'stroke', 'color', 'font-family', 'font-size']) (copied[n] as SVGElement).style.setProperty(p, css.getPropertyValue(p)) })
      const wrap = (value: string) => value.split(' ').reduce<string[]>((lines, word) => {
        if ((lines.at(-1)?.length ?? 0) + word.length < 115) lines[lines.length - 1] += `${lines.at(-1) ? ' ' : ''}${word}`
        else lines.push(word)
        return lines
      }, [''])
      const headerLines = wrap(filterContext), noteLines = wrap(note)
      const top = 70 + headerLines.length * 18 + active.length * 20
      const exportHeight = height + top + noteLines.length * 18 + 25
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); clone.setAttribute('width', '1000'); clone.setAttribute('height', String(exportHeight))
      clone.setAttribute('viewBox', `0 ${-top} 1000 ${exportHeight}`)
      const text = (value: string, at: number, size: number, color = getComputedStyle(source).color) => { const e = document.createElementNS('http://www.w3.org/2000/svg', 'text'); e.setAttribute('x', '20'); e.setAttribute('y', String(at)); e.setAttribute('font-size', String(size)); e.setAttribute('fill', color); e.textContent = value; clone.append(e) }
      text(heading || title, -top + 30, 20)
      headerLines.forEach((line, n) => text(line, -top + 54 + n * 18, 12))
      active.forEach((s, n) => text(`● ${s.label} · EUR`, -top + 60 + headerLines.length * 18 + n * 20, 13, getComputedStyle(source).getPropertyValue(palette[series.indexOf(s) % palette.length]).trim()))
      text(`Vista ${current + 1}/${pages}`, height + 15, 12)
      noteLines.forEach((line, n) => text(line, height + 35 + n * 18, 12))
      const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect'); background.setAttribute('x', '0'); background.setAttribute('y', String(-top)); background.setAttribute('width', '1000'); background.setAttribute('height', String(exportHeight)); background.setAttribute('fill', getComputedStyle(source).backgroundColor); clone.prepend(background)
      const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' })
      if (!png) { download(blob, 'grafico.svg'); setMessage('SVG esportato: vista corrente.'); return }
      const url = URL.createObjectURL(blob)
      try {
        const img = new Image(); img.src = url; await img.decode()
        const canvas = document.createElement('canvas'); canvas.width = 2000; canvas.height = exportHeight * 2
        const ctx = canvas.getContext('2d'); if (!ctx) throw new Error()
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        const result = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
        if (!result) throw new Error()
        download(result, 'grafico.png'); setMessage('PNG esportato: vista corrente.')
      } finally { URL.revokeObjectURL(url) }
    } catch { setMessage('Esportazione immagine non riuscita. Puoi esportare il CSV.'); }
  }
  return <section id={chartAnchor} aria-labelledby={`${id}-title`} className="min-w-0 rounded-2xl border border-border bg-surface p-4 sm:p-5 space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 id={`${id}-title`} className="text-base font-semibold text-text-primary">{heading || title}</h2><p className="mt-1 text-2xs text-text-secondary">{note}</p></div>{(query || group !== defaultGroup || from || to || heading !== title || type !== initialType || keys.length !== series.length || sort !== 'source') && <button type="button" onClick={reset} className={button}>Ripristina vista</button>}</div>
    {singleGroup && groups.length > 0 && <label className="block max-w-sm text-2xs text-text-secondary">{groupLabel}<select className={control} value={group} onChange={e => { setGroup(e.target.value); setPage(0) }}>{groups.map(g => <option key={g.key} value={g.key}>{g.label}</option>)}</select></label>}
    <details className="rounded-xl border border-border p-3"><summary className="cursor-pointer py-1 text-sm text-gold-text">Filtra il grafico{query || from || to || group !== defaultGroup ? ' · filtri attivi' : ''}</summary><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-2xs text-text-secondary">Cerca nel grafico<input className={control} value={query} onChange={e => { setQuery(e.target.value); setPage(0) }} placeholder="Nome o descrizione" /></label>
      {!singleGroup && groups.length > 0 && <label className="text-2xs text-text-secondary">Gruppo<select className={control} value={group} onChange={e => { setGroup(e.target.value); setPage(0) }}>{!singleGroup && <option value="">Tutti i gruppi</option>}{groups.map(g => <option key={g.key} value={g.key}>{g.label}</option>)}</select></label>}
      {dates && <><label className="text-2xs text-text-secondary">Dal<input type="date" className={control} value={from} onChange={e => { setFrom(e.target.value); setPage(0) }} /></label><label className="text-2xs text-text-secondary">Al<input type="date" className={control} value={to} onChange={e => { setTo(e.target.value); setPage(0) }} /></label></>}
    </div></details>
    <details className="rounded-xl border border-border p-3"><summary className="cursor-pointer py-1 text-sm text-gold-text">Personalizza titolo, vista e serie</summary><div className="mt-3 grid gap-3 sm:grid-cols-3"><label className="text-2xs text-text-secondary">Titolo<input maxLength={100} className={control} value={heading} onChange={e => setHeading(e.target.value)} /></label><label className="text-2xs text-text-secondary">Visualizzazione<select className={control} value={type} onChange={e => setType(e.target.value as 'bar' | 'line')}><option value="bar">Barre a confronto</option>{temporal && <option value="line">Andamento nel tempo</option>}</select></label><label className="text-2xs text-text-secondary">Ordine<select className={control} disabled={type === 'line'} value={sort} onChange={e => { setSort(e.target.value); setPage(0) }}><option value="source">Ordine della sezione</option><option value="label">Nome</option><option value="value">Valore assoluto decrescente</option></select></label></div><p className="mt-2 text-2xs text-text-secondary">Personalizzazione per questa apertura. Le linee mantengono l’ordine delle date; i confronti tra voci usano barre. I valori si modificano dal registro di origine.</p></details>
    <fieldset className="flex flex-wrap gap-2"><legend className="sr-only">Serie visibili</legend>{series.map((s, n) => <label key={s.key} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border px-3 text-2xs text-text-primary"><input type="checkbox" checked={keys.includes(s.key)} onChange={e => setKeys(e.target.checked ? [...keys, s.key] : keys.filter(k => k !== s.key))} /><span aria-hidden="true" className="h-3 w-3 rounded-sm" style={{ backgroundColor: `var(${palette[n % palette.length]})` }} />{s.label}</label>)}</fieldset>
    <p role="status" className="text-2xs text-text-secondary">{filtered.length} di {rows.length} voci · {active.length} serie. {filtered.reduce((count, r) => count + active.filter(s => chartValue(r.values[s.key]) == null).length, 0)} valori n/d. Filtri del grafico indipendenti dai totali della sezione. Clicca un punto o una barra per il dettaglio.</p>
    {from && to && from > to && <p role="alert" className="text-sm text-warning">La data iniziale supera quella finale.</p>}
    {!filtered.length || !active.length || !values.length ? <p className="py-8 text-center text-sm text-text-secondary">{!active.length ? 'Seleziona almeno una serie.' : !filtered.length ? 'Nessuna voce con questi filtri.' : 'Importi non determinati nella vista corrente: consulta la tabella o passa alla vista successiva.'}</p> : <>
      <div className={temporal ? 'hidden' : 'space-y-3 sm:hidden'}><p className="text-2xs text-text-secondary">Vista compatta: lunghezza delle barre sul valore assoluto; segno e importo sono indicati accanto.</p>{shown.map(r => <button key={r.id} type="button" onClick={() => setSelected(r.id)} aria-pressed={selected === r.id} className="block w-full rounded-xl border border-border p-3 text-left hover:bg-surface-hover"><span className="block text-sm font-semibold text-text-primary">{r.label}</span>{active.map(s => { const v = chartValue(r.values[s.key]); return <span key={s.key} className="mt-3 block"><span className="flex flex-wrap justify-between gap-2 text-2xs text-text-secondary"><span>{s.label}</span><strong className="tabular-nums text-text-primary">{format(v)}</strong></span>{v != null && <span className="mt-1 block h-2 rounded-full bg-surface-active"><span className="block h-2 rounded-full" style={{ width: `${Math.abs(v) / Math.max(Math.abs(min), Math.abs(max), 1) * 100}%`, backgroundColor: `var(${palette[series.indexOf(s) % palette.length]})` }} /></span>}</span> })}</button>)}</div>
      <div className={`${temporal ? 'block' : 'hidden sm:block'} overflow-x-auto rounded-xl border border-border`}>
        <svg ref={svg} viewBox={`0 0 940 ${height}`} className="block w-full min-w-[840px] bg-surface text-text-primary" role="img" aria-labelledby={`${id}-svg-title ${id}-svg-desc`}>
          <title id={`${id}-svg-title`}>{heading || title}</title><desc id={`${id}-svg-desc`}>{note} Importi in euro. Dettagli accessibili anche nella tabella sotto il grafico. Dati mancanti indicati n/d, mai zero.</desc>
          {[0, 0.25, 0.5, 0.75, 1].map(p => { const v = min + p * span; return type === 'bar' ? <g key={p}><line x1={x(v)} x2={x(v)} y1={20} y2={height - 35} stroke="var(--color-border)" /><text x={x(v)} y={height - 12} textAnchor="middle" fill="var(--color-text-secondary)" fontSize={14}>{short(v)} €</text></g> : <g key={p}><line x1={75} x2={865} y1={y(v)} y2={y(v)} stroke="var(--color-border)" /><text x={65} y={y(v) + 4} textAnchor="end" fill="var(--color-text-secondary)" fontSize={14}>{short(v)} €</text></g> })}
          {type === 'bar' ? shown.map((r, n) => { const top = 25 + n * (32 + active.length * 17); return <g key={r.id}>
            <text x={12} y={top + 14} fill="var(--color-text-primary)" fontSize={14}><title>{r.label}</title>{r.label.length > 28 ? `${r.label.slice(0, 27)}…` : r.label}</text>
            {active.map((s, j) => { const v = chartValue(r.values[s.key]), color = `var(${palette[series.indexOf(s) % palette.length]})`; return <g key={s.key}>
              {v != null && <rect x={Math.min(x(0), x(v))} y={top + j * 17} width={Math.max(2, Math.abs(x(v) - x(0)))} height={12} rx={3} fill={color} />}
              <text x={880} y={top + j * 17 + 11} fontSize={14} fill="var(--color-text-secondary)">{v == null ? 'n/d' : short(v)}</text>
              <rect x={235} y={top + j * 17 - 2} width={695} height={17} fill="transparent" role="button" tabIndex={0} aria-label={`${r.label}, ${s.label}: ${format(v)}`} onClick={() => setSelected(r.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(r.id) } }}><title>{`${r.label} · ${s.label}: ${format(v)}`}</title></rect>
            </g> })}
          </g> }) : <>
            {active.map(s => { const color = `var(${palette[series.indexOf(s) % palette.length]})`; return <g key={s.key}>
              {shown.slice(1).map((r, n) => { const a = chartValue(shown[n].values[s.key]), b = chartValue(r.values[s.key]); return a != null && b != null ? <line key={r.id} x1={pointX(n)} y1={y(a)} x2={pointX(n + 1)} y2={y(b)} stroke={color} strokeWidth={2} /> : null })}
              {shown.map((r, n) => { const v = chartValue(r.values[s.key]); return v == null ? null : <circle key={r.id} cx={pointX(n)} cy={y(v)} r={7} fill={color} stroke="var(--color-surface)" strokeWidth={2} role="button" tabIndex={0} aria-label={`${r.label}, ${s.label}: ${format(v)}`} onClick={() => setSelected(r.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(r.id) } }}><title>{`${r.label} · ${s.label}: ${format(v)}`}</title></circle> })}
            </g> })}
            {shown.map((r, n) => n % Math.max(1, Math.ceil(shown.length / 10)) === 0 || n === shown.length - 1 ? <text key={r.id} transform={`translate(${pointX(n)},272) rotate(-40)`} textAnchor="end" fontSize={14} fill="var(--color-text-secondary)"><title>{r.label}</title>{r.label.slice(0, 14)}</text> : null)}
          </>}
        </svg>
      </div>
    </>}
    {temporal && <p className="text-2xs text-text-secondary sm:hidden">Scorri il grafico in orizzontale oppure apri la tabella per leggere tutti gli importi.</p>}
    {pages > 1 && <div className="flex flex-wrap items-center justify-between gap-2"><button type="button" className={button} disabled={!current} onClick={() => setPage(current - 1)}>Precedenti</button><span className="text-2xs text-text-secondary">Vista {current + 1} di {pages} · massimo {pageSize} voci per grafico</span><button type="button" className={button} disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>Successive</button></div>}
    {chosen && <div className="rounded-xl bg-surface-hover p-3 space-y-2"><h3 className="text-sm font-semibold text-text-primary">{chosen.label}</h3><dl className="flex flex-wrap gap-4 text-sm">{active.map(s => <div key={s.key}><dt className="text-text-secondary">{s.label}</dt><dd className="font-semibold text-text-primary">{format(chartValue(chosen.values[s.key]))}</dd></div>)}</dl>{chosen.href && <Link originAnchor={chartAnchor} className="inline-flex min-h-11 items-center text-sm text-gold-text underline" href={chosen.href}>Apri i dati di origine</Link>}</div>}
    <details><summary className="cursor-pointer py-2 text-sm text-gold-text">Tabella accessibile · tutti i dati filtrati</summary><div className="max-h-96 overflow-auto"><table className="w-full text-left text-2xs text-text-primary"><caption className="sr-only">{heading || title} · {note}</caption><thead><tr><th className="p-2">Voce</th>{active.map(s => <th key={s.key} className="p-2">{s.label}</th>)}</tr></thead><tbody>{filtered.map(r => <tr key={r.id} className="border-t border-border"><th className="p-2 font-normal">{r.href ? <Link originAnchor={chartAnchor} className="text-gold-text underline" href={r.href}>{r.label}</Link> : r.label}</th>{active.map(s => <td key={s.key} className="p-2 whitespace-nowrap tabular-nums">{format(chartValue(r.values[s.key]))}</td>)}</tr>)}</tbody></table></div></details>
    <details className="rounded-xl border border-border p-3"><summary className="cursor-pointer py-1 text-sm text-gold-text">Esporta dati o immagine</summary><div className="mt-3 flex flex-wrap gap-2"><button type="button" className={button} disabled={!filtered.length || !active.length} onClick={() => { download(new Blob([chartCsv(heading || title, note, filtered.map(r => ({ ...r, href: r.href ? new URL(r.href, window.location.href).href : undefined })), active, filterContext)], { type: 'text/csv;charset=utf-8' }), 'dati-grafico.csv'); setMessage('CSV esportato: tutte le voci filtrate e le serie visibili.') }}>Esporta dati CSV</button><button type="button" className={button} disabled={!values.length || !active.length} onClick={() => void exportImage(false)}>Esporta vista SVG</button><button type="button" className={button} disabled={!values.length || !active.length} onClick={() => void exportImage(true)}>Esporta vista PNG</button></div></details>
    <p aria-live="polite" className="text-2xs text-text-secondary">{message || 'CSV: tutte le voci filtrate. SVG e PNG: la vista corrente del grafico. Gli originali restano nei registri.'}</p>
  </section>
}
