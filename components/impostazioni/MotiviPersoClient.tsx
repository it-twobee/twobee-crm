'use client'

/**
 * §435 — l'editor dei motivi del perso.
 *
 * Lo stesso gesto delle fasi (§425): si salva tutto insieme, i problemi si
 * vedono mentre si scrive con la stessa funzione del server, si sposta con due
 * bottoni. E accanto a ogni motivo **quanti persi lo usano**, perché è quel
 * numero a decidere se si può eliminare o solo ritirare.
 */

import { useMemo, useState, useTransition } from 'react'
import { ArrowDown, ArrowUp, Ban, Loader2, Plus, RotateCcw, Save, Trash2, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { salvaMotivi } from '@/app/actions/sales-fasi'
import { chiaveDa, problemiMotivi, rinumera, MAX_ETICHETTA, type Motivo } from '@/lib/sales-motivi'

export function MotiviPersoClient({ motivi, conta }: { motivi: Motivo[]; conta: Record<string, number> }) {
  const [righe, setRighe] = useState<Motivo[]>(motivi)
  const [pending, start] = useTransition()
  const problemi = useMemo(() => problemiMotivi(righe), [righe])
  const cambiato = JSON.stringify(rinumera(righe)) !== JSON.stringify(rinumera(motivi))

  /* Un motivo nuovo prende la chiave dal nome mentre lo si scrive; uno che
     esiste già la tiene, perché i persi la puntano. */
  const salvate = useMemo(() => new Set(motivi.map(m => m.chiave)), [motivi])
  const cambia = (i: number, patch: Partial<Motivo>) => setRighe(rs => rs.map((r, k) => {
    if (k !== i) return r
    const nuova = { ...r, ...patch }
    if (patch.etichetta !== undefined && !salvate.has(r.chiave)) {
      nuova.chiave = chiaveDa(patch.etichetta || 'motivo', rs.filter((_, j) => j !== i).map(x => x.chiave))
    }
    return nuova
  }))
  const sposta = (i: number, d: -1 | 1) => setRighe(rs => {
    const j = i + d
    if (j < 0 || j >= rs.length) return rs
    const out = [...rs];[out[i], out[j]] = [out[j], out[i]]
    return out
  })
  const aggiungi = () => setRighe(rs => [...rs, { chiave: chiaveDa('Nuovo motivo', rs.map(r => r.chiave)), etichetta: '', ordine: 0, attivo: true }])

  const salva = () => start(async () => {
    const esito = await salvaMotivi(rinumera(righe))
    if (esito.ok) toast.success('Motivi salvati')
    else toast.error(esito.errori[0])
  })

  return (
    <section className="max-w-4xl mx-auto space-y-3">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <span className="w-9 h-9 rounded-xl bg-gold-dim flex items-center justify-center shrink-0">
            <Ban className="w-4 h-4 text-gold-text" />
          </span>
          <div>
            <h2 className="text-lg font-black text-text-primary font-heading">Motivi del perso</h2>
            <p className="text-xs text-text-secondary max-w-xl">
              Le risposte fra cui si sceglie quando un lead si chiude senza esito, e le righe di «perché perdiamo».
              Un motivo già usato non si elimina: si ritira, e resta scritto sui persi che lo hanno.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {cambiato && (
            <button onClick={() => setRighe(motivi)} disabled={pending}
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

      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-xs">
            <thead>
              <tr className="bg-surface-hover text-2xs font-bold text-text-tertiary uppercase tracking-wider">
                <th className="w-16 px-2 py-2.5" />
                <th scope="col" className="px-3 py-2.5 text-left">Motivo</th>
                <th scope="col" className="px-3 py-2.5 text-right w-24">Persi</th>
                <th scope="col" className="px-3 py-2.5 text-center w-24">In uso</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {righe.map((m, i) => {
                const quanti = conta[m.chiave] ?? 0
                return (
                  <tr key={i} className={`border-t border-border ${m.attivo ? '' : 'opacity-60'}`}>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-0.5">
                        <button onClick={() => sposta(i, -1)} disabled={i === 0} aria-label="Sposta su"
                          className="p-1 rounded text-text-tertiary hover:text-text-primary disabled:opacity-25">
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => sposta(i, 1)} disabled={i === righe.length - 1} aria-label="Sposta giù"
                          className="p-1 rounded text-text-tertiary hover:text-text-primary disabled:opacity-25">
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <input value={m.etichetta} maxLength={MAX_ETICHETTA} placeholder="Perché si è chiuso"
                        aria-label="Nome del motivo" onChange={e => cambia(i, { etichetta: e.target.value })}
                        className="w-full bg-surface border border-border-interactive rounded-lg px-2 py-1.5 text-xs text-text-primary" />
                    </td>
                    <td className="px-3 py-2 text-right tabular text-text-secondary">{quanti || '—'}</td>
                    <td className="px-3 py-2 text-center">
                      <input type="checkbox" checked={m.attivo} onChange={e => cambia(i, { attivo: e.target.checked })}
                        aria-label={`${m.etichetta || 'Motivo'} in uso`} className="accent-[var(--color-gold)]" />
                    </td>
                    <td className="px-2 py-2 text-center">
                      {/* Eliminare si può solo quando nessun perso lo usa: il
                          bottone non c'è, invece di esserci e fallire. */}
                      {quanti === 0 && (
                        <button onClick={() => setRighe(rs => rs.filter((_, k) => k !== i))}
                          aria-label={`Elimina ${m.etichetta || 'motivo'}`}
                          className="p-1 rounded text-text-tertiary hover:text-error">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <button onClick={aggiungi}
          className="w-full flex items-center justify-center gap-1.5 border-t border-border px-3 py-2.5 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-hover">
          <Plus className="w-3.5 h-3.5" /> Aggiungi un motivo
        </button>
      </div>
    </section>
  )
}
