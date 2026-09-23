'use client'

/**
 * §425 — l'editor delle fasi commerciali.
 *
 * È la prima schermata che cambia la **forma** del lavoro di tutti invece dei
 * dati di una riga: riordinare qui riordina la bacheca ai colleghi, ritirare
 * una fase la toglie dalle scelte di chi sta chiamando. Per questo mostra
 * sempre **quante trattative** stanno su ogni fase — spostare qualcosa senza
 * sapere quanto pesa è il modo di scoprirlo dopo.
 *
 * Tre scelte di forma, e ognuna ha un perché:
 *
 * - **si salva tutto insieme**, perché l'elenco è una forma e non otto righe
 *   indipendenti: «una sola fase vinta» non è una proprietà di una riga, e
 *   salvandone una alla volta si passerebbe da stati che non stanno in piedi;
 * - **i problemi si vedono mentre scrivi**, non dopo aver premuto Salva. È la
 *   stessa funzione che controlla il server e che verifica il gate: se fossero
 *   tre regole diverse, quella giusta sarebbe sempre l'altra;
 * - **si sposta con due bottoni, non trascinando**. Il trascinamento HTML5 non
 *   esiste sul dito, e questa è una schermata che si apre anche dal telefono
 *   quando serve aggiungere una fase al volo.
 */

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowUp, GitBranch, Loader2, Plus, RotateCcw, Save, Trash2, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { salvaFasi } from '@/app/actions/sales-fasi'
import {
  CLASSI_TINTA, ETICHETTA_RUOLO, RUOLI, TINTE, ordinate, problemiFasi,
  type Fase, type Ruolo, type Tinta,
} from '@/lib/sales-stages'

interface Props {
  fasi: Fase[]
  /** quante trattative stanno su ogni fase, per chiave */
  conta: Record<string, number>
}

const chiaveDa = (etichetta: string) =>
  etichetta.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'fase_nuova'

export function FasiCommercialiClient({ fasi, conta }: Props) {
  const [righe, setRighe] = useState<Fase[]>(() => ordinate(fasi))
  const [pending, start] = useTransition()

  const problemi = useMemo(() => problemiFasi(righe), [righe])
  const cambiato = useMemo(() => JSON.stringify(righe) !== JSON.stringify(ordinate(fasi)), [righe, fasi])
  const puoSalvare = cambiato && problemi.length === 0 && !pending

  const modifica = (i: number, patch: Partial<Fase>) =>
    setRighe(r => r.map((f, j) => (j === i ? { ...f, ...patch } : f)))

  const sposta = (i: number, verso: -1 | 1) => setRighe(r => {
    const j = i + verso
    if (j < 0 || j >= r.length) return r
    const copia = [...r]
    const [x] = copia.splice(i, 1)
    copia.splice(j, 0, x)
    /* Rinumerati a decine: lascia spazio per infilarne una in mezzo domani
       senza dover riscrivere tutta la colonna. */
    return copia.map((f, k) => ({ ...f, ordine: (k + 1) * 10 }))
  })

  const aggiungi = () => setRighe(r => [
    ...r,
    { chiave: `fase_${r.length + 1}`, etichetta: '', ruolo: 'in_corso', tinta: 'neutro', ordine: (r.length + 1) * 10, attiva: true },
  ])

  const elimina = (i: number) => setRighe(r => r.filter((_, j) => j !== i).map((f, k) => ({ ...f, ordine: (k + 1) * 10 })))

  const salva = () => start(async () => {
    const esito = await salvaFasi(righe).catch((e: Error) => ({ ok: false as const, errori: [e.message] }))
    if (!esito.ok) { toast.error(esito.errori[0]); return }
    toast.success('Fasi salvate')
  })

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <span className="w-9 h-9 rounded-xl bg-gold-dim flex items-center justify-center shrink-0">
            <GitBranch className="w-4 h-4 text-gold-text" />
          </span>
          <div>
            <h1 className="text-xl font-black text-text-primary font-heading">Fasi del commerciale</h1>
            <p className="text-xs text-text-secondary max-w-xl">
              Il percorso che vedono tutti: l&apos;ordine qui è l&apos;ordine delle colonne in bacheca
              e delle voci nel menu. <Link href="/commerciale" className="text-gold-text hover:underline">Vai all&apos;area commerciale</Link>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {cambiato && (
            <button onClick={() => setRighe(ordinate(fasi))} disabled={pending}
              className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary px-3 py-2 rounded-lg">
              <RotateCcw className="w-3.5 h-3.5" /> Annulla
            </button>
          )}
          <button onClick={salva} disabled={!puoSalvare}
            className="flex items-center gap-1.5 text-xs font-semibold bg-gold text-on-gold px-4 py-2 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed">
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Salva
          </button>
        </div>
      </header>

      {/* I problemi stanno sopra al bottone e non dentro un avviso che sparisce:
          sono la ragione per cui non si può salvare, e vanno letti. */}
      {problemi.length > 0 && (
        <ul className="bg-warning-dim border border-warning/30 rounded-xl px-3 py-2.5 space-y-1">
          {problemi.map(p => (
            <li key={p} className="flex items-start gap-2 text-2xs text-warning">
              <TriangleAlert className="w-3.5 h-3.5 shrink-0 mt-px" /> {p}
            </li>
          ))}
        </ul>
      )}

      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-xs">
            <thead>
              <tr className="bg-surface-hover text-2xs font-bold text-text-tertiary uppercase tracking-wider">
                <th className="w-16 px-2 py-2.5" />
                <th scope="col" className="px-3 py-2.5 text-left">Nome</th>
                <th scope="col" className="px-3 py-2.5 text-left w-44">Ruolo</th>
                <th scope="col" className="px-3 py-2.5 text-left w-32">Colore</th>
                <th scope="col" className="px-3 py-2.5 text-right w-28">Trattative</th>
                <th scope="col" className="px-3 py-2.5 text-center w-24">In uso</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {righe.map((f, i) => {
                const quante = conta[f.chiave] ?? 0
                return (
                  <tr key={`${f.chiave}-${i}`} className={`border-t border-border ${f.attiva ? '' : 'opacity-60'}`}>
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
                      <input value={f.etichetta} placeholder="Nome della fase"
                        onChange={e => {
                          /* La chiave segue il nome finché la fase è nuova: su una
                             che ha già delle righe cambiarla è una cascata vera, e
                             si fa apposta, non digitando. */
                          const etichetta = e.target.value
                          modifica(i, quante === 0 && !fasi.some(x => x.chiave === f.chiave)
                            ? { etichetta, chiave: chiaveDa(etichetta) }
                            : { etichetta })
                        }}
                        className="w-full bg-background border border-border-interactive rounded-lg px-2.5 py-1.5 text-xs text-text-primary" />
                      <p className="text-2xs text-text-tertiary mt-1 font-mono">{f.chiave}</p>
                    </td>

                    <td className="px-3 py-2">
                      <select value={f.ruolo} onChange={e => modifica(i, { ruolo: e.target.value as Ruolo })}
                        aria-label={`Ruolo di ${f.etichetta || f.chiave}`}
                        className="w-full bg-background border border-border-interactive rounded-lg px-2 py-1.5 text-xs text-text-primary">
                        {RUOLI.map(r => <option key={r} value={r}>{ETICHETTA_RUOLO[r]}</option>)}
                      </select>
                    </td>

                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <span className={`px-2 py-0.5 rounded-full text-2xs font-semibold shrink-0 ${CLASSI_TINTA[f.tinta]}`}>Aa</span>
                        <select value={f.tinta} onChange={e => modifica(i, { tinta: e.target.value as Tinta })}
                          aria-label={`Colore di ${f.etichetta || f.chiave}`}
                          className="flex-1 min-w-0 bg-background border border-border-interactive rounded-lg px-2 py-1.5 text-xs text-text-primary">
                          {TINTE.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                    </td>

                    <td className="px-3 py-2 text-right tabular-nums text-text-secondary">
                      {quante > 0 ? quante : <span className="text-text-tertiary">—</span>}
                    </td>

                    <td className="px-3 py-2 text-center">
                      {/* Ritirare non è eliminare: la fase resta leggibile sulle
                          righe vecchie e sparisce dalle scelte nuove. */}
                      <button onClick={() => modifica(i, { attiva: !f.attiva })}
                        aria-pressed={f.attiva}
                        className={`text-2xs font-semibold px-2 py-1 rounded-lg border transition-colors ${
                          f.attiva ? 'bg-success-dim border-success/30 text-success' : 'bg-surface-hover border-border text-text-tertiary'}`}>
                        {f.attiva ? 'attiva' : 'ritirata'}
                      </button>
                    </td>

                    <td className="px-2 py-2">
                      <button onClick={() => elimina(i)} disabled={quante > 0}
                        title={quante > 0
                          ? `Ha ${quante} trattative: spostale altrove, oppure ritirala invece di eliminarla`
                          : 'Elimina questa fase'}
                        aria-label={`Elimina ${f.etichetta || f.chiave}`}
                        className="p-1.5 rounded text-error hover:bg-error-dim disabled:opacity-25 disabled:cursor-not-allowed">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="border-t border-border px-3 py-2.5">
          <button onClick={aggiungi}
            className="flex items-center gap-1.5 text-xs font-semibold text-gold-text hover:bg-gold/10 px-3 py-1.5 rounded-lg transition-colors">
            <Plus className="w-3.5 h-3.5" /> Aggiungi una fase
          </button>
        </div>
      </div>

      <details className="group bg-surface border border-border rounded-xl">
        <summary className="px-3 py-2.5 text-xs font-semibold text-text-secondary cursor-pointer select-none hover:text-text-primary">
          Cosa vuol dire «ruolo», e perché conta
        </summary>
        <div className="px-3 pb-3 space-y-1.5 text-xs text-text-secondary">
          <p>
            Il nome di una fase lo leggi tu; il <strong className="text-text-primary font-semibold">ruolo</strong> lo legge il tool.
            Serve a sapere qual è la fase da cui si converte un lead in cliente, quale conta come persa
            nel tasso di conversione e da quale entrano i lead che arrivano dal foglio.
          </p>
          <p>
            Per questo puoi rinominare «Cliente acquisito» come vuoi senza rompere niente — ma
            <strong className="text-text-primary font-semibold"> una sola fase</strong> può avere il ruolo «chiusa vinta»,
            e una sola quello di porta d&apos;ingresso.
          </p>
          <p>
            I colori vengono dai sette del tema e non da una tavolozza libera: un colore inventato
            diventa illeggibile in tema chiaro. Due fasi <em>vicine</em> non possono avere lo stesso —
            lontane sì, perché il colore dice a che punto sei e il nome dice quale.
          </p>
        </div>
      </details>
    </div>
  )
}
