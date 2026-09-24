'use client'

/**
 * §437 — l'editor dei campi personalizzati della scheda lead.
 *
 * Una scheda per campo e non una tabella: un campo ha nome, tipo, riquadro,
 * voci e un suggerimento, e sette colonne strette si compilano male. Il resto è
 * lo stesso gesto degli altri editor (§425): si salva tutto insieme, i problemi
 * si vedono mentre si scrive con la funzione del server, si sposta con due
 * bottoni.
 *
 * Quando un campo ha dei valori sui lead lo dice, e da lì il tipo non si cambia
 * e il campo non si elimina — i bottoni non ci sono, invece di esserci e
 * fallire al salvataggio.
 */

import { useMemo, useState, useTransition } from 'react'
import { ArrowDown, ArrowUp, Loader2, Plus, RotateCcw, Save, SlidersHorizontal, Trash2, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { salvaCampi } from '@/app/actions/sales-fasi'
import {
  ESEMPIO_TIPO, NOME_TIPO, RIQUADRI, TIPI_CAMPO, chiaveCampo, nuovoCampo, opzioniDa, problemiCampi,
  type Campo, type TipoCampo,
} from '@/lib/sales-campi'
import { TITOLO_GRUPPO } from '@/lib/sales-table'

/* Quattro esempi per il primo campo: un editor vuoto chiede di inventarsi
   tutto, un esempio si aggiunge e si corregge. */
const ESEMPI: Pick<Campo, 'etichetta' | 'tipo' | 'riquadro' | 'opzioni'>[] = [
  { etichetta: 'Dipendenti', tipo: 'numero', riquadro: 'azienda', opzioni: [] },
  { etichetta: 'Ha già un sito?', tipo: 'si_no', riquadro: 'azienda', opzioni: [] },
  { etichetta: 'Gestionale usato', tipo: 'scelta', riquadro: 'azienda', opzioni: ['Zucchetti', 'TeamSystem', 'Altro'] },
  { etichetta: 'Cellulare del titolare', tipo: 'telefono', riquadro: 'contatto', opzioni: [] },
]

const inputCls = 'w-full bg-surface border border-border-interactive rounded-lg px-2 py-1.5 text-xs text-text-primary'

export function CampiPersonalizzatiClient({ campi, conta }: { campi: Campo[]; conta: Record<string, number> }) {
  const [righe, setRighe] = useState<Campo[]>(campi)
  /* le voci si scrivono come testo e diventano un elenco al salvataggio: così
     la virgola appena digitata non sparisce sotto le dita */
  const [bozzeVoci, setBozzeVoci] = useState<Record<number, string>>({})
  const [pending, start] = useTransition()
  const salvate = useMemo(() => new Set(campi.map(c => c.chiave)), [campi])

  const effettive = righe.map((c, i) => bozzeVoci[i] !== undefined ? { ...c, opzioni: opzioniDa(bozzeVoci[i]) } : c)
  const problemi = useMemo(() => problemiCampi(effettive), [effettive])
  const cambiato = JSON.stringify(effettive) !== JSON.stringify(campi)

  const chiaviAltre = (i: number, rs: Campo[]) => rs.filter((_, j) => j !== i).map(x => x.chiave)
  const cambia = (i: number, patch: Partial<Campo>) => setRighe(rs => rs.map((r, k) => {
    if (k !== i) return r
    const n = { ...r, ...patch }
    // un campo nuovo prende la chiave dal nome; uno salvato la tiene, perché i valori la puntano
    if (patch.etichetta !== undefined && !salvate.has(r.chiave)) n.chiave = chiaveCampo(patch.etichetta, chiaviAltre(i, rs))
    return n
  }))
  const sposta = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= righe.length) return
    setRighe(rs => { const o = [...rs];[o[i], o[j]] = [o[j], o[i]]; return o })
    setBozzeVoci(b => { const o = { ...b }; const bi = o[i]; const bj = o[j]; delete o[i]; delete o[j]; if (bj !== undefined) o[i] = bj; if (bi !== undefined) o[j] = bi; return o })
  }
  const togli = (i: number) => {
    setRighe(rs => rs.filter((_, k) => k !== i))
    setBozzeVoci(b => Object.fromEntries(Object.entries(b).filter(([k]) => +k !== i).map(([k, v]) => [+k > i ? +k - 1 : +k, v])))
  }
  const aggiungi = (es?: (typeof ESEMPI)[number]) => setRighe(rs => {
    const base = nuovoCampo(rs.map(r => r.chiave))
    return [...rs, es ? { ...base, ...es, chiave: chiaveCampo(es.etichetta, rs.map(r => r.chiave)) } : base]
  })

  const salva = () => start(async () => {
    const esito = await salvaCampi(effettive)
    if (esito.ok) { toast.success('Campi salvati: li trovi nella scheda di ogni lead'); setBozzeVoci({}) }
    else toast.error(esito.errori[0])
  })

  return (
    <section className="max-w-4xl mx-auto space-y-3">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <span className="w-9 h-9 rounded-xl bg-gold-dim flex items-center justify-center shrink-0">
            <SlidersHorizontal className="w-4 h-4 text-gold-text" />
          </span>
          <div>
            <h2 className="text-lg font-black text-text-primary font-heading">Campi personalizzati</h2>
            <p className="text-xs text-text-secondary max-w-xl">
              Campi in più nella scheda del lead, nel riquadro che scegli. Si compilano come gli altri: clic, scrivi, Invio.
              Non compaiono nell&apos;elenco né nei filtri. Un campo con dei valori non cambia tipo e non si elimina: si ritira.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {cambiato && (
            <button onClick={() => { setRighe(campi); setBozzeVoci({}) }} disabled={pending}
              className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary px-3 py-2 rounded-lg">
              <RotateCcw className="w-3.5 h-3.5" /> Annulla
            </button>
          )}
          <button onClick={salva} disabled={!cambiato || problemi.length > 0 || pending}
            className="flex items-center gap-1.5 text-xs font-semibold bg-gold text-on-gold px-4 py-2 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed">
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Salva
          </button>
        </div>
      </header>

      {problemi.length > 0 && (
        <ul className="space-y-1">
          {problemi.map(p => (
            <li key={p} className="flex items-start gap-1.5 text-xs text-warning">
              <TriangleAlert className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden />{p}
            </li>
          ))}
        </ul>
      )}

      {!righe.length && (
        <div className="bg-surface border border-dashed border-border-strong rounded-2xl p-4 space-y-2">
          <p className="text-xs text-text-secondary">Nessun campo ancora. Parti da un esempio e correggilo:</p>
          <div className="flex flex-wrap gap-1.5">
            {ESEMPI.map(es => (
              <button key={es.etichetta} onClick={() => aggiungi(es)}
                className="text-2xs px-2.5 py-1.5 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:bg-surface-hover">
                + {es.etichetta} <span className="text-text-tertiary">· {NOME_TIPO[es.tipo]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {righe.map((c, i) => {
          const quanti = conta[c.chiave] ?? 0
          const bloccato = salvate.has(c.chiave) && quanti > 0
          const voci = bozzeVoci[i] ?? c.opzioni.join(', ')
          return (
            <div key={i} className={`bg-surface border border-border rounded-2xl p-3 space-y-2 ${c.attivo ? '' : 'opacity-60'}`}>
              <div className="flex items-start gap-2 flex-wrap sm:flex-nowrap">
                <div className="flex flex-col shrink-0">
                  <button onClick={() => sposta(i, -1)} disabled={i === 0} aria-label="Sposta su"
                    className="p-1 rounded text-text-tertiary hover:text-text-primary disabled:opacity-25"><ArrowUp className="w-3.5 h-3.5" /></button>
                  <button onClick={() => sposta(i, 1)} disabled={i === righe.length - 1} aria-label="Sposta giù"
                    className="p-1 rounded text-text-tertiary hover:text-text-primary disabled:opacity-25"><ArrowDown className="w-3.5 h-3.5" /></button>
                </div>

                <label className="flex-1 min-w-40">
                  <span className="block text-2xs text-text-tertiary mb-1">Nome</span>
                  <input value={c.etichetta} maxLength={40} placeholder="Come si legge nella scheda"
                    onChange={e => cambia(i, { etichetta: e.target.value })} className={inputCls} />
                </label>

                <label className="w-full sm:w-48 shrink-0">
                  <span className="block text-2xs text-text-tertiary mb-1">Tipo</span>
                  <select value={c.tipo} disabled={bloccato} onChange={e => cambia(i, { tipo: e.target.value as TipoCampo })}
                    title={bloccato ? 'Ha già dei valori: il tipo non si cambia' : undefined} className={`${inputCls} disabled:opacity-60`}>
                    {TIPI_CAMPO.map(t => <option key={t} value={t}>{NOME_TIPO[t]}</option>)}
                  </select>
                  <span className="block text-2xs text-text-tertiary mt-1 leading-snug">{ESEMPIO_TIPO[c.tipo]}</span>
                </label>

                <label className="w-full sm:w-44 shrink-0">
                  <span className="block text-2xs text-text-tertiary mb-1">Riquadro della scheda</span>
                  <select value={c.riquadro} onChange={e => cambia(i, { riquadro: e.target.value as Campo['riquadro'] })} className={inputCls}>
                    {RIQUADRI.map(r => <option key={r} value={r}>{TITOLO_GRUPPO[r]}</option>)}
                  </select>
                </label>

                <div className="flex items-center gap-2 shrink-0 pt-5">
                  <label className="flex items-center gap-1.5 text-2xs text-text-secondary">
                    <input type="checkbox" checked={c.attivo} onChange={e => cambia(i, { attivo: e.target.checked })}
                      className="accent-[var(--color-gold)]" />In uso
                  </label>
                  {!bloccato && (
                    <button onClick={() => togli(i)} aria-label={`Elimina ${c.etichetta || 'campo'}`}
                      className="p-1 rounded text-text-tertiary hover:text-error"><Trash2 className="w-3.5 h-3.5" /></button>
                  )}
                </div>
              </div>

              {c.tipo === 'scelta' && (
                <label className="block pl-8">
                  <span className="block text-2xs text-text-tertiary mb-1">Voci, separate da virgole</span>
                  <input value={voci} placeholder="Zucchetti, TeamSystem, Altro"
                    onChange={e => setBozzeVoci(b => ({ ...b, [i]: e.target.value }))} className={inputCls} />
                  {opzioniDa(voci).length > 0 && (
                    <span className="flex flex-wrap gap-1 mt-1.5">
                      {opzioniDa(voci).map(o => (
                        <span key={o} className="px-1.5 py-0.5 rounded bg-surface-active text-text-secondary text-2xs">{o}</span>
                      ))}
                    </span>
                  )}
                </label>
              )}

              <div className="flex items-center gap-3 pl-8 flex-wrap">
                <input value={c.aiuto ?? ''} maxLength={120} placeholder="Suggerimento sotto il nome (facoltativo)"
                  aria-label={`Suggerimento per ${c.etichetta || 'il campo'}`}
                  onChange={e => cambia(i, { aiuto: e.target.value || null })}
                  className={`${inputCls} flex-1 min-w-48`} />
                {quanti > 0 && (
                  <span className="text-2xs text-text-tertiary shrink-0">compilato su {quanti} lead</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {righe.length > 0 && (
        <button onClick={() => aggiungi()}
          className="w-full flex items-center justify-center gap-1.5 border border-dashed border-border-strong rounded-2xl px-3 py-2.5 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-hover">
          <Plus className="w-3.5 h-3.5" /> Aggiungi un campo
        </button>
      )}
    </section>
  )
}
