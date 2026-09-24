'use client'

/**
 * §372 — i numeri per decidere dove spendere il prossimo euro.
 *
 * Risponde a **una** domanda — *cosa converte?* — e quello che non serve a
 * rispondere non c'è. Un pannello con dodici grafici si guarda una volta;
 * tre tabelle che dicono quale campagna porta clienti si guardano prima di
 * ogni riunione.
 *
 * **Ogni percentuale dichiara il suo denominatore** e, quando il campione è
 * piccolo, lo dice. Una campagna con due lead e un cliente non converte al
 * cinquanta per cento: ha portato un cliente, e scrivere «50%» accanto è il
 * modo più elegante di far spostare del budget per sbaglio.
 */

import { useMemo, useState } from 'react'
import { TrendingUp, AlertTriangle } from 'lucide-react'
import {
  tassoDi, imbuto, perDimensione, daOrigine, giorniPerChiudere, perCento, nelPeriodo,
  PERIODI, SOGLIA_AFFIDABILITA, type Periodo, type RigaAnalisi, type Riga,
} from '@/lib/sales-analytics'
import { ETICHETTA_QUALIFICA } from '@/lib/sales-table'
import { useFasi } from './FasiContext'

function Tabella({ titolo, spiega, righe, nome = v => v }: {
  titolo: string; spiega: string; righe: Riga[]
  /** §431 — il valore raggruppato non è sempre da leggere: gli owner sono id */
  nome?: (valore: string) => string
}) {
  if (!righe.length) return null
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <div className="px-3 py-2 border-b border-border">
        <p className="text-sm font-semibold text-text-primary">{titolo}</p>
        <p className="text-2xs text-text-tertiary">{spiega}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border">
              {['', 'Clienti', 'Persi', 'Aperti', 'Conversione'].map((h, i) => (
                <th key={h || i} className={`px-3 py-1.5 text-2xs font-semibold text-text-tertiary uppercase ${i ? 'text-right' : ''}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {righe.map(r => (
              <tr key={r.valore} className="border-b border-border last:border-0">
                <td className="px-3 py-1.5 text-2xs text-text-primary max-w-56 truncate" title={nome(r.valore)}>{nome(r.valore)}</td>
                <td className="px-3 py-1.5 text-2xs text-right tabular text-success font-semibold">{r.vinti || '—'}</td>
                <td className="px-3 py-1.5 text-2xs text-right tabular text-text-tertiary">{r.persi || '—'}</td>
                <td className="px-3 py-1.5 text-2xs text-right tabular text-text-secondary">{r.aperti || '—'}</td>
                <td className="px-3 py-1.5 text-2xs text-right">
                  <span className={r.affidabile ? 'text-text-primary font-semibold tabular' : 'text-text-tertiary tabular'}>
                    {perCento(r.tasso)}
                  </span>
                  {/* Il numero si mostra e si avvisa: nasconderlo sarebbe
                      decidere al posto di chi legge, mostrarlo nudo sarebbe
                      farlo decidere su un aneddoto. */}
                  {r.tasso !== null && !r.affidabile && (
                    <span className="ml-1 text-2xs text-text-tertiary" title={`Solo ${r.conclusi} conclusi: sotto ${SOGLIA_AFFIDABILITA} il tasso non è indicativo`}>
                      su {r.conclusi}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function CrmAnalytics({ righe: filtrate, totale, nomeDi }: {
  /** già cercate e filtrate come l'elenco (§431) */
  righe: RigaAnalisi[]
  /** quante righe ci sono in tutto, per dire su quante si sta contando */
  totale: number
  nomeDi: Map<string, string>
}) {
  const { TUTTE, classiFase } = useFasi()
  const [periodo, setPeriodo] = useState<Periodo>('tutto')
  const righe = useMemo(() => nelPeriodo(filtrate, periodo, Date.now()), [filtrate, periodo])
  const perOwner = useMemo(() => perDimensione(TUTTE, righe, r => r.owners, 'Nessuno'), [TUTTE, righe])
  const perQualifica = useMemo(() => perDimensione(TUTTE, righe, r => r.qualifica), [TUTTE, righe])
  const t = useMemo(() => tassoDi(TUTTE, righe), [TUTTE, righe])
  const passi = useMemo(() => imbuto(TUTTE, righe).filter(p => p.quante > 0), [TUTTE, righe])
  const tempo = useMemo(() => giorniPerChiudere(TUTTE, righe), [TUTTE, righe])
  const perFonte = useMemo(() => perDimensione(TUTTE, righe, r => r.source), [TUTTE, righe])
  const perCampagna = useMemo(() => perDimensione(TUTTE, righe, daOrigine('campagna')), [TUTTE, righe])
  const perTipologia = useMemo(() => perDimensione(TUTTE, righe, daOrigine('tipologia')), [TUTTE, righe])
  const perTempistica = useMemo(() => perDimensione(TUTTE, righe, daOrigine('tempistica')), [TUTTE, righe])

  const massimo = Math.max(1, ...passi.map(p => p.quante))

  return (
    <div className="space-y-4">
      {/* Su cosa si sta contando, detto prima dei numeri: un tasso letto sotto
          un filtro dimenticato è un tasso sbagliato che sembra giusto. */}
      <div className="flex items-center gap-2 flex-wrap">
        <label className="flex items-center gap-1.5 text-xs text-text-secondary">
          Arrivati
          <select value={periodo} onChange={e => setPeriodo(e.target.value as Periodo)} aria-label="Periodo di arrivo dei lead"
            className="bg-surface border border-border-interactive rounded-xl px-2 py-2 text-xs text-text-primary">
            {PERIODI.map(p => <option key={p.chiave} value={p.chiave}>{p.etichetta}</option>)}
          </select>
        </label>
        <p className="text-2xs text-text-tertiary">
          {righe.length === totale
            ? `Calcolati su tutti i ${totale} lead`
            : `Calcolati su ${righe.length} lead di ${totale}: contano ricerca, filtri e periodo`}
        </p>
      </div>

      {!righe.length ? (
        <p className="text-xs text-text-tertiary border border-border rounded-xl px-3 py-3">
          Nessun lead in questo insieme: allarga il periodo o togli un filtro.
        </p>
      ) : <>
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { v: perCento(t.tasso), l: 'Conversione', h: `${t.vinti} clienti su ${t.conclusi} conclusi`, forte: true },
          { v: String(t.aperti), l: 'Ancora aperti', h: 'su cui si può agire' },
          { v: String(t.vinti), l: 'Clienti', h: 'Active Client' },
          { v: tempo.mediana === null ? 'n/d' : `${tempo.mediana} gg`, l: 'Tempo di chiusura', h: tempo.campione ? `mediana su ${tempo.campione}` : 'nessuna chiusa con le date' },
        ].map(c => (
          <div key={c.l} className="border border-border rounded-xl px-3 py-2.5">
            <p className={`text-xl font-bold tabular ${c.forte ? 'text-gold-text' : 'text-text-primary'}`}>{c.v}</p>
            <p className="text-2xs font-semibold text-text-secondary">{c.l}</p>
            <p className="text-2xs text-text-tertiary">{c.h}</p>
          </div>
        ))}
      </div>

      {!t.affidabile && t.conclusi > 0 && (
        <p className="flex items-start gap-1.5 text-2xs text-text-tertiary">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px text-warning" aria-hidden />
          Solo {t.conclusi} trattative concluse: sotto {SOGLIA_AFFIDABILITA} la percentuale racconta più di quanto sappia.
        </p>
      )}

      <div className="border border-border rounded-xl p-3">
        <p className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
          <TrendingUp className="w-4 h-4 text-gold-text" aria-hidden />Dove sono adesso
        </p>
        {/* Una fotografia, non uno storico: dice dove sono, non quante ne sono
            passate di lì. Per il secondo servirebbe la cronologia dei
            passaggi, che non abbiamo — meglio un numero onesto. */}
        <p className="text-2xs text-text-tertiary mb-2">Quante righe ferme in ogni fase, oggi</p>
        <div className="space-y-1">
          {passi.map(p => (
            <div key={p.chiave} className="flex items-center gap-2">
              <span className={`text-2xs px-2 py-0.5 rounded-full shrink-0 w-44 truncate ${classiFase(p.chiave)}`}>{p.etichetta}</span>
              <span className="h-2 rounded-full bg-gold/40" style={{ width: `${(p.quante / massimo) * 60}%` }} />
              <span className="text-2xs tabular text-text-secondary">{p.quante}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Tabella titolo="Per fonte" spiega="Da dove arrivano quelli che chiudono" righe={perFonte} />
        <Tabella titolo="Per campagna" spiega="Quale annuncio porta clienti, non solo contatti" righe={perCampagna} />
        <Tabella titolo="Per tipo di attività" spiega="Chi dice di essere, e chi poi firma" righe={perTipologia} />
        <Tabella titolo="Per urgenza dichiarata" spiega="«Subito» converte davvero più di «sto valutando»?" righe={perTempistica} />
        <Tabella titolo="Per Account Owner" nome={v => v === 'Nessuno' ? v : nomeDi.get(v) ?? 'Ex collega'}
          spiega="Un lead seguito in due conta per tutti e due: la somma supera il totale" righe={perOwner} />
        <Tabella titolo="Per qualifica" nome={v => ETICHETTA_QUALIFICA[v] ?? v}
          spiega="Quelli in target chiudono davvero più degli altri?" righe={perQualifica} />
      </div>
      </>}
    </div>
  )
}
