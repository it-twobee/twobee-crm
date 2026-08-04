/**
 * Grafici del tool — SVG puro, nessuna libreria, due temi.
 *
 * Perché a mano e non Recharts: questi grafici vivono in pagine server, devono
 * reagire al tema con le stesse variabili CSS del resto dell'app, e devono restare
 * leggibili a 320 pixel di larghezza. Una libreria porta un bundle, un canvas che
 * non conosce i token e un tooltip che va stilizzato comunque.
 *
 * Tre regole di forma, che valgono per tutti:
 *
 * 1. **La forma segue la domanda.** Barre per confrontare quantità in periodi
 *    diversi, linea per una posizione che si muove (il saldo), area per un
 *    cumulato, ciambella per una composizione. Un saldo a barre e un fatturato a
 *    linea si leggono male entrambi.
 *
 * 2. **Lo zero si vede sempre.** Un grafico che parte da un minimo scelto
 *    esagera le differenze: è il modo più comune di mentire con un grafico onesto.
 *
 * 3. **Il numero batte il pixel.** Ogni forma ha il suo valore leggibile — sotto,
 *    accanto o nel tooltip nativo — perché da un grafico si prende la direzione e
 *    da un numero la decisione.
 */

const eur = (n: number) =>
  `€${Math.round(n).toLocaleString('it-IT')}`
const eurFine = (n: number) =>
  `€${n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// ═══════════════════════════════════════════════════════════════════════════
// Fatturato, costi e margine: barre affiancate più la linea del margine
// ═══════════════════════════════════════════════════════════════════════════

export type PeriodPoint = {
  key: string
  label: string
  revenue: number
  costs: number
  margin: number
  /** opzionale: quanto di quel fatturato è stato incassato */
  collected?: number
}

/**
 * Il grafico che risponde a «come stiamo andando».
 *
 * Due barre per periodo — fatturato e costi — e la linea del margine sopra. Le
 * barre affiancate e non impilate: impilate darebbero un totale che non significa
 * niente (fatturato più costi non è una quantità). La parte piena della barra del
 * fatturato è quello che è stato incassato, il resto è credito: è la stessa barra
 * che dice due cose senza aggiungere un grafico.
 */
export function RevenueCostChart({ data, height = 200 }: { data: PeriodPoint[]; height?: number }) {
  if (!data.length) return null

  const W = 900
  const H = height
  const padL = 4, padR = 4, padT = 12, padB = 26
  const max = Math.max(...data.map(d => Math.max(d.revenue, d.costs, d.margin)), 1)
  const min = Math.min(0, ...data.map(d => d.margin))
  const span = max - min || 1

  const slot = (W - padL - padR) / data.length
  const barW = Math.min(26, slot * 0.28)
  const y = (v: number) => padT + (1 - (v - min) / span) * (H - padT - padB)
  const cx = (i: number) => padL + slot * i + slot / 2

  const marginPts = data.map((d, i) => `${cx(i)},${y(d.margin)}`).join(' ')
  const zeroY = y(0)

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} role="img"
        aria-label="Fatturato, costi e margine per periodo">
        <defs>
          <linearGradient id="cg-rev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-gold)" stopOpacity="0.95" />
            <stop offset="100%" stopColor="var(--color-gold)" stopOpacity="0.55" />
          </linearGradient>
          <linearGradient id="cg-cost" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-error)" stopOpacity="0.75" />
            <stop offset="100%" stopColor="var(--color-error)" stopOpacity="0.35" />
          </linearGradient>
        </defs>

        {/* griglia: quattro linee, appena visibili. Servono a leggere, non a decorare */}
        {[0.25, 0.5, 0.75, 1].map(f => (
          <line key={f} x1={padL} x2={W - padR} y1={y(min + span * f)} y2={y(min + span * f)}
            stroke="var(--color-border)" strokeWidth="1" opacity="0.5" />
        ))}
        <line x1={padL} x2={W - padR} y1={zeroY} y2={zeroY}
          stroke="var(--color-border-strong)" strokeWidth="1" />

        {data.map((d, i) => {
          const x0 = cx(i) - barW - 2
          const x1 = cx(i) + 2
          const incassato = d.collected ?? d.revenue
          const hRev = Math.max(1, zeroY - y(d.revenue))
          const hInc = Math.max(0, zeroY - y(Math.min(incassato, d.revenue)))
          const hCost = Math.max(1, zeroY - y(d.costs))
          return (
            <g key={d.key}>
              {/* fatturato: il pieno è incassato, il resto è credito aperto */}
              <rect x={x0} y={y(d.revenue)} width={barW} height={hRev} rx="3"
                fill="url(#cg-rev)" opacity="0.35" />
              <rect x={x0} y={zeroY - hInc} width={barW} height={hInc} rx="3" fill="url(#cg-rev)">
                <title>{`${d.label} · fatturato ${eur(d.revenue)}${d.collected !== undefined ? ` · incassato ${eur(d.collected)}` : ''}`}</title>
              </rect>
              {/* costi */}
              <rect x={x1} y={y(d.costs)} width={barW} height={hCost} rx="3" fill="url(#cg-cost)">
                <title>{`${d.label} · costi ${eur(d.costs)}`}</title>
              </rect>
            </g>
          )
        })}

        {/* la linea del margine, sopra tutto */}
        {data.length > 1 && (
          <polyline points={marginPts} fill="none" stroke="var(--color-success)" strokeWidth="2.5"
            strokeLinejoin="round" strokeLinecap="round" />
        )}
        {data.map((d, i) => (
          <circle key={d.key} cx={cx(i)} cy={y(d.margin)} r="3.5"
            fill="var(--color-surface)" stroke="var(--color-success)" strokeWidth="2">
            <title>{`${d.label} · margine ${eur(d.margin)}`}</title>
          </circle>
        ))}

        {/* etichette: una ogni due periodi se sono tanti, per non impastare */}
        {data.map((d, i) => (
          (data.length <= 8 || i % 2 === 0) ? (
            <text key={d.key} x={cx(i)} y={H - 8} textAnchor="middle"
              fill="var(--color-text-tertiary)" fontSize="11">
              {shortLabel(d.label)}
            </text>
          ) : null
        ))}
      </svg>
      <Legend items={[
        { label: 'fatturato', color: 'var(--color-gold)' },
        { label: 'di cui incassato', color: 'var(--color-gold)', faded: true },
        { label: 'costi', color: 'var(--color-error)' },
        { label: 'margine', color: 'var(--color-success)', line: true },
      ]} />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Andamento: area col cumulato e futuro tratteggiato
// ═══════════════════════════════════════════════════════════════════════════

export type TrendPoint = { date: string; value: number }

/**
 * Una posizione che si muove nel tempo: il saldo, la cassa prevista.
 *
 * L'area sotto la linea non aggiunge informazione, aggiunge peso visivo: serve a
 * far vedere in un colpo d'occhio se il livello sale o scende. La parte dopo
 * «oggi» è tratteggiata perché non è ancora accaduta — un previsionale disegnato
 * pieno si legge come storia, ed è il modo più facile di prendere una previsione
 * per un fatto.
 */
export function TrendChart({
  history, forecast, todayLabel, height = 160, showZero = true,
}: {
  history: TrendPoint[]
  forecast?: TrendPoint[]
  todayLabel?: string
  height?: number
  showZero?: boolean
}) {
  const all = [...history, ...(forecast ?? []).slice(1)]
  if (all.length < 2) return null

  const W = 900, H = height, P = 6, padB = 20
  const xs = all.map(p => new Date(p.date).getTime())
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const vals = all.map(p => p.value)
  const minY = showZero ? Math.min(0, ...vals) : Math.min(...vals)
  const maxY = Math.max(...vals, 1)
  const spanY = maxY - minY || 1

  const x = (t: number) => P + ((t - minX) / Math.max(1, maxX - minX)) * (W - P * 2)
  const y = (v: number) => P + (1 - (v - minY) / spanY) * (H - P - padB)

  const pts = (list: TrendPoint[]) => list.map(p => `${x(new Date(p.date).getTime())},${y(p.value)}`).join(' ')
  const zeroY = y(0)
  const last = history.at(-1)
  const area = history.length
    ? `${x(new Date(history[0].date).getTime())},${zeroY} ${pts(history)} ${x(new Date(last!.date).getTime())},${zeroY}`
    : ''
  const lowest = all.reduce((a, b) => (b.value < a.value ? b : a), all[0])

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} role="img"
        aria-label="Andamento nel tempo, con la previsione">
        <defs>
          <linearGradient id="cg-trend" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-gold)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--color-gold)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {minY < 0 && (
          /* la banda sotto lo zero: quando la linea ci entra, il conto è scoperto */
          <rect x={P} y={zeroY} width={W - P * 2} height={Math.max(0, H - padB - zeroY)}
            fill="var(--color-error)" opacity="0.06" />
        )}
        <line x1={P} x2={W - P} y1={zeroY} y2={zeroY} stroke="var(--color-border-strong)"
          strokeWidth="1" strokeDasharray="3 3" />

        {area && <polyline points={area} fill="url(#cg-trend)" stroke="none" />}
        <polyline points={pts(history)} fill="none" stroke="var(--color-gold)" strokeWidth="2.5"
          strokeLinejoin="round" strokeLinecap="round" />

        {forecast && forecast.length > 1 && (
          <>
            <polyline points={pts(forecast)} fill="none" stroke="var(--color-info)" strokeWidth="2"
              strokeDasharray="5 4" strokeLinejoin="round" />
            <line x1={x(new Date(forecast[0].date).getTime())} y1={P}
              x2={x(new Date(forecast[0].date).getTime())} y2={H - padB}
              stroke="var(--color-border-strong)" strokeWidth="1" />
            <text x={x(new Date(forecast[0].date).getTime()) + 4} y={P + 10}
              fill="var(--color-text-tertiary)" fontSize="11">
              {todayLabel ?? 'oggi'}
            </text>
          </>
        )}

        {/* il punto più basso: è il numero che decide, quindi ha un nome */}
        {lowest && (
          <g>
            <circle cx={x(new Date(lowest.date).getTime())} cy={y(lowest.value)} r="4"
              fill="var(--color-surface)"
              stroke={lowest.value < 0 ? 'var(--color-error)' : 'var(--color-warning)'} strokeWidth="2">
              <title>{`punto più basso · ${eurFine(lowest.value)} il ${new Date(lowest.date).toLocaleDateString('it-IT')}`}</title>
            </circle>
          </g>
        )}

        <text x={P} y={H - 4} fill="var(--color-text-tertiary)" fontSize="11">
          {new Date(all[0].date).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}
        </text>
        <text x={W - P} y={H - 4} textAnchor="end" fill="var(--color-text-tertiary)" fontSize="11">
          {new Date(all.at(-1)!.date).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}
        </text>
      </svg>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Composizione: ciambella
// ═══════════════════════════════════════════════════════════════════════════

export type Slice = { label: string; value: number; color: string }

/**
 * Come si compone un totale.
 *
 * Una ciambella e non una torta: il buco al centro ospita il totale, che è il
 * numero che serve davvero, e i settori si confrontano per angolo comunque. Sopra
 * le sei fette diventa illeggibile, quindi le altre si accorpano in «altro»
 * invece di produrre spicchi da due gradi.
 */
export function DonutChart({
  slices, total, caption, size = 160, max = 6,
}: {
  slices: Slice[]
  total?: number
  caption?: string
  size?: number
  max?: number
}) {
  const clean = slices.filter(s => s.value > 0).sort((a, b) => b.value - a.value)
  if (!clean.length) return null

  const head = clean.slice(0, max)
  const tail = clean.slice(max)
  const list = tail.length
    ? [...head, { label: `altro (${tail.length})`, value: tail.reduce((s, x) => s + x.value, 0), color: 'var(--color-border-strong)' }]
    : head

  const sum = list.reduce((s, x) => s + x.value, 0)
  const R = 52, r = 34, C = 60
  let angle = -Math.PI / 2

  const arc = (v: number) => {
    const sweep = (v / sum) * Math.PI * 2
    const a0 = angle, a1 = angle + sweep
    angle = a1
    const large = sweep > Math.PI ? 1 : 0
    const p = (rad: number, a: number) => `${C + rad * Math.cos(a)},${C + rad * Math.sin(a)}`
    return `M ${p(R, a0)} A ${R} ${R} 0 ${large} 1 ${p(R, a1)} L ${p(r, a1)} A ${r} ${r} 0 ${large} 0 ${p(r, a0)} Z`
  }

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <svg viewBox="0 0 120 120" style={{ width: size, height: size }} role="img"
        aria-label={caption ?? 'Composizione'}>
        {list.map(s => (
          <path key={s.label} d={arc(s.value)} fill={s.color} opacity="0.9">
            <title>{`${s.label} · ${eur(s.value)} · ${Math.round((s.value / sum) * 100)}%`}</title>
          </path>
        ))}
        <text x="60" y="57" textAnchor="middle" fill="var(--color-text-primary)"
          fontSize="15" fontWeight="700">{eur(total ?? sum)}</text>
        {caption && (
          <text x="60" y="72" textAnchor="middle" fill="var(--color-text-tertiary)" fontSize="9">
            {caption}
          </text>
        )}
      </svg>
      <div className="space-y-1 min-w-[140px]">
        {list.map(s => (
          <div key={s.label} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
            <span className="text-2xs text-text-secondary flex-1 truncate">{s.label}</span>
            <span className="text-2xs tabular text-text-primary font-semibold">{eur(s.value)}</span>
            <span className="text-2xs tabular text-text-tertiary w-8 text-right">
              {Math.round((s.value / sum) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Sparkline: il trend dentro un KPI
// ═══════════════════════════════════════════════════════════════════════════

/** Dieci punti dentro un numero: dice la direzione senza chiedere spazio. */
export function Sparkline({ values, tone = 'gold', width = 72, height = 22 }: {
  values: number[]
  tone?: 'gold' | 'success' | 'error' | 'info'
  width?: number
  height?: number
}) {
  if (values.length < 2) return null
  const min = Math.min(0, ...values)
  const max = Math.max(...values, 1)
  const span = max - min || 1
  const pts = values.map((v, i) =>
    `${(i / (values.length - 1)) * width},${height - ((v - min) / span) * height}`).join(' ')
  const color = `var(--color-${tone === 'gold' ? 'gold' : tone})`
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true"
      className="shrink-0">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
    </svg>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Barra di ripartizione: dove finiscono cento euro
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Una barra sola divisa in segmenti: risponde a «di cento euro fatturati, dove
 * vanno». È più leggibile di una ciambella quando i segmenti sono ordinati e
 * pochi, e occupa una riga invece di un riquadro.
 */
export function SplitBar({ segments, total }: {
  segments: { label: string; value: number; color: string }[]
  total?: number
}) {
  const clean = segments.filter(s => s.value > 0)
  const sum = total ?? clean.reduce((s, x) => s + x.value, 0)
  if (!sum) return null
  return (
    <div>
      <div className="flex h-2.5 rounded-full overflow-hidden bg-surface-active">
        {clean.map(s => (
          <div key={s.label} style={{ width: `${(s.value / sum) * 100}%`, background: s.color }}
            title={`${s.label} · ${eur(s.value)} · ${Math.round((s.value / sum) * 100)}%`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
        {clean.map(s => (
          <span key={s.label} className="flex items-center gap-1.5 text-2xs text-text-tertiary">
            <span className="w-2 h-2 rounded-sm" style={{ background: s.color }} />
            {s.label} <span className="tabular text-text-secondary font-semibold">{eur(s.value)}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════

function Legend({ items }: {
  items: { label: string; color: string; faded?: boolean; line?: boolean }[]
}) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
      {items.map(i => (
        <span key={i.label} className="flex items-center gap-1.5 text-2xs text-text-tertiary">
          <span className={i.line ? 'w-3 h-0.5 rounded' : 'w-2.5 h-2.5 rounded-sm'}
            style={{ background: i.color, opacity: i.faded ? 0.35 : 1 }} />
          {i.label}
        </span>
      ))}
    </div>
  )
}

/** «settimana del 3 ago 2026» → «3 ago»: sull'asse ci sta il minimo indispensabile. */
function shortLabel(label: string): string {
  const clean = label.replace('settimana del ', '').replace(' · trimestre ', ' T')
  const words = clean.split(' ')
  if (words.length >= 3) return `${words[0]} ${words[1].slice(0, 3)}`
  if (words.length === 2) return `${words[0].slice(0, 3)} ${words[1].slice(2)}`
  return clean
}
