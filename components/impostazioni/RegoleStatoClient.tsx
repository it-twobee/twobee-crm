'use client'

/**
 * §461 — dove porta ogni interazione.
 *
 * Una riga per combinazione tipo/esito che il diario sa produrre. Si sceglie la
 * fase di arrivo fra le sole trattative vive, o «nessun cambio», e se il cambio
 * avvisa i super admin. L'ultima interazione per data decide; note e voci di
 * stato non contano; Perso, Cliente acquisito e Pending restano manuali.
 */

import { useMemo, useState, useTransition } from 'react'
import { GitBranch, Loader2, RotateCcw, Save, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { salvaRegoleStato } from '@/app/actions/sales-fasi'
import { fasiDiArrivo, problemiRegole, type RegolaStato } from '@/lib/sales-regole-stato'
import type { Fase } from '@/lib/sales-stages'

export function RegoleStatoClient({ regole: iniziali, fasi }: { regole: RegolaStato[]; fasi: Fase[] }) {
  const [righe, setRighe] = useState<RegolaStato[]>(iniziali)
  const [pending, start] = useTransition()
  const arrivo = useMemo(() => fasiDiArrivo(fasi), [fasi])
  const problemi = useMemo(() => problemiRegole(righe, fasi, iniziali.map(r => r.chiave)), [righe, fasi, iniziali])
  const cambiato = JSON.stringify(righe) !== JSON.stringify(iniziali)

  const cambia = (chiave: string, patch: Partial<RegolaStato>) =>
    setRighe(rs => rs.map(r => r.chiave === chiave ? { ...r, ...patch, ...(patch.fase === null ? { avvisa: false } : {}) } : r))

  const salva = () => start(async () => {
    const esito = await salvaRegoleStato(righe)
    if (esito.ok) toast.success('Regole di stato: salvate')
    else toast.error(esito.errori[0])
  })

  return (
    <section className="max-w-4xl mx-auto space-y-3">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <span className="w-9 h-9 rounded-xl bg-gold-dim flex items-center justify-center shrink-0">
            <GitBranch className="w-4 h-4 text-gold-text" />
          </span>
          <div>
            <h2 className="text-lg font-black text-text-primary font-heading">Stato dalle interazioni</h2>
            <p className="text-xs text-text-secondary max-w-xl">
              Quando registri un’interazione, la fase del lead segue l’ultima per data. Qui scegli dove porta ognuna.
              Le note non spostano niente; Perso, Cliente acquisito e Pending restano scelte tue.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {cambiato && (
            <button onClick={() => setRighe(iniziali)} disabled={pending}
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
              <TriangleAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {p}
            </li>
          ))}
        </ul>
      )}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-text-tertiary border-b border-border">
              <th className="px-3 py-2 font-medium">Interazione</th>
              <th className="px-3 py-2 font-medium">Porta il lead a</th>
              <th className="px-3 py-2 font-medium">Avvisa i super admin</th>
            </tr>
          </thead>
          <tbody>
            {righe.map(r => (
              <tr key={r.chiave} className="border-b border-border last:border-0">
                <td className="px-3 py-2 text-text-primary">{r.etichetta}</td>
                <td className="px-3 py-2">
                  <select value={r.fase ?? ''} onChange={e => cambia(r.chiave, { fase: e.target.value || null })}
                    aria-label={`Fase di arrivo: ${r.etichetta}`}
                    className="bg-background border border-border-interactive rounded-lg px-2 py-1 text-xs text-text-primary">
                    <option value="">Nessun cambio</option>
                    {arrivo.map(f => <option key={f.chiave} value={f.chiave}>{f.etichetta}</option>)}
                    {r.fase && !arrivo.some(f => f.chiave === r.fase) && <option value={r.fase}>{r.fase} (non più valida)</option>}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input type="checkbox" checked={r.avvisa} disabled={!r.fase} onChange={e => cambia(r.chiave, { avvisa: e.target.checked })}
                    aria-label={`Avvisa: ${r.etichetta}`} className="accent-gold" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
