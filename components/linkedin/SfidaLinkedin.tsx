'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, Download, ExternalLink, Trophy, Upload } from 'lucide-react'
import { caricaCsvLinkedin } from '@/app/actions/linkedin'
import { classifica, ordinaPost, MAX_CARATTERI, type Criterio } from '@/lib/linkedin'
import type { SfidaData } from '@/lib/linkedin-server'

const COLONNE: { key: Criterio; label: string }[] = [
  { key: 'impression', label: 'Impression' },
  { key: 'reazioni', label: 'Reazioni' },
  { key: 'commenti', label: 'Commenti' },
  { key: 'post', label: 'Post' },
]

const num = (n: number) => n.toLocaleString('it-IT')
const giorno = (iso: string) => new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', timeZone: 'Europe/Rome' })
const quando = (iso: string) => new Date(iso).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' })

export function SfidaLinkedin({ data, me, base }: { data: SfidaData; me: string; base: string }) {
  const router = useRouter()
  const [criterio, setCriterio] = useState<Criterio>('impression')
  const [caricando, setCaricando] = useState(false)
  const righe = useMemo(() => classifica(data.posts, criterio), [data.posts, criterio])
  const posts = useMemo(() => ordinaPost(data.posts, criterio).slice(0, 30), [data.posts, criterio])
  const chiuso = data.mese !== data.corrente

  async function carica(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > MAX_CARATTERI) { toast.error('Il file è troppo grande: non è il CSV dell\'estensione.'); return }
    setCaricando(true)
    try {
      const esito = await caricaCsvLinkedin(await file.text())
      if (!esito.ok) { toast.error(esito.error); return }
      const note = [
        esito.fuoriMese ? `${esito.fuoriMese} di mesi chiusi ignorati` : '',
        esito.altrui ? `${esito.altrui} già caricati da un collega` : '',
        esito.scartate.length ? `${esito.scartate.length} righe scartate` : '',
      ].filter(Boolean).join(' · ')
      toast.success(`${esito.aggiornati} post di ${data.etichettaCorrente} aggiornati`, {
        description: [note, ...esito.scartate.slice(0, 3)].filter(Boolean).join('\n') || undefined,
      })
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Caricamento non riuscito')
    } finally {
      setCaricando(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Link href={`${base}?mese=${data.prima}`} aria-label="Mese precedente"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-text-secondary hover:bg-surface-hover">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Link>
          <span className="min-w-[9rem] text-center font-heading text-lg font-semibold capitalize text-text-primary">{data.etichetta}</span>
          {data.dopo ? (
            <Link href={`${base}?mese=${data.dopo}`} aria-label="Mese successivo"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-text-secondary hover:bg-surface-hover">
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          ) : <span className="h-9 w-9" aria-hidden="true" />}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <a href="/api/linkedin/estensione" download
            className="flex min-h-10 items-center gap-1.5 rounded-xl border border-border-interactive px-4 text-sm font-medium text-text-primary hover:bg-surface-hover">
            <Download className="h-4 w-4" aria-hidden="true" /> Scarica l&apos;estensione
          </a>
          <label className={`flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl bg-gold px-4 text-sm font-semibold text-on-gold press btn-gold ${caricando ? 'pointer-events-none opacity-40' : ''}`}>
            <Upload className="h-4 w-4" aria-hidden="true" /> {caricando ? 'Carico…' : 'Carica il CSV'}
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={carica} disabled={caricando} />
          </label>
        </div>
      </div>

      {data.manca && (
        <p className="rounded-xl border border-warning bg-warning-dim px-4 py-3 text-sm text-text-primary">
          Manca la migration della sfida LinkedIn: la classifica non si può leggere né caricare.
        </p>
      )}

      <p className="text-sm text-text-secondary">
        {chiuso
          ? <>Mese chiuso: contano i post pubblicati in {data.etichetta}, con i numeri dell&apos;ultimo caricamento fatto entro la fine del mese.</>
          : <>Contano i post pubblicati in {data.etichetta}. Fino all&apos;ultimo giorno del mese ogni caricamento aggiorna i numeri, poi la classifica si chiude.</>}
      </p>

      <section aria-label="Classifica" className="overflow-x-auto rounded-xl border border-border bg-surface">
        {righe.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-text-tertiary">
            Nessun caricamento per {data.etichetta}.{!chiuso && ' Scarica l\'estensione, raccogli i tuoi post e carica il CSV.'}
          </p>
        ) : (
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-b border-border text-text-tertiary">
                <th scope="col" className="w-12 px-4 py-2 text-left text-2xs font-semibold uppercase tracking-wider">#</th>
                <th scope="col" className="px-4 py-2 text-left text-2xs font-semibold uppercase tracking-wider">Persona</th>
                {COLONNE.map(c => (
                  <th key={c.key} scope="col" aria-sort={criterio === c.key ? 'descending' : 'none'} className="px-4 py-2 text-right">
                    <button type="button" onClick={() => setCriterio(c.key)}
                      className={`text-2xs font-semibold uppercase tracking-wider hover:text-text-primary ${criterio === c.key ? 'text-gold-text' : ''}`}>
                      {c.label}
                    </button>
                  </th>
                ))}
                <th scope="col" className="px-4 py-2 text-right text-2xs font-semibold uppercase tracking-wider">Ultimo caricamento</th>
              </tr>
            </thead>
            <tbody>
              {righe.map((r, i) => (
                <tr key={r.profile_id} className={`border-b border-border last:border-0 ${r.profile_id === me ? 'bg-gold-dim' : ''}`}>
                  <td className="px-4 py-2.5 font-semibold text-text-secondary">
                    {i === 0 ? <Trophy className="h-4 w-4 text-gold-text" aria-label="Primo posto" /> : i + 1}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-text-primary">{r.autore}{r.profile_id === me && <span className="text-text-tertiary"> · tu</span>}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-text-primary">
                    {r.impressionParziali && r.impression === 0 ? <span className="text-text-tertiary">n/d</span>
                      : r.impressionParziali ? <span title="Alcuni post senza impression lette: il totale è almeno questo">≥ {num(r.impression)}</span>
                      : num(r.impression)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-text-primary">{num(r.reazioni)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-text-primary">{num(r.commenti)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-text-primary">{num(r.post)}</td>
                  <td className="px-4 py-2.5 text-right text-2xs text-text-tertiary">{quando(r.ultimoCaricamento)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {posts.length > 0 && (
        <section aria-labelledby="sfida-post" className="space-y-2">
          <h2 id="sfida-post" className="font-heading text-base font-semibold text-text-primary">I post del mese</h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {posts.map(p => (
              <li key={p.post_urn} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-2xs text-text-tertiary">{p.autore} · {giorno(p.published_at)}</p>
                  <p className="line-clamp-2 text-sm text-text-primary">{p.testo || <span className="text-text-tertiary">Senza testo</span>}</p>
                </div>
                <dl className="flex shrink-0 items-center gap-4 text-2xs text-text-secondary">
                  <div><dt className="sr-only">Impression</dt><dd className="tabular-nums">{p.impression === null ? 'n/d' : num(p.impression)} imp.</dd></div>
                  <div><dt className="sr-only">Reazioni</dt><dd className="tabular-nums">{num(p.reazioni)} reaz.</dd></div>
                  <div><dt className="sr-only">Commenti</dt><dd className="tabular-nums">{num(p.commenti)} comm.</dd></div>
                </dl>
                <a href={p.url} target="_blank" rel="noopener noreferrer" aria-label="Apri il post su LinkedIn"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-tertiary hover:bg-surface-hover hover:text-text-primary">
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <details className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text-secondary">
        <summary className="cursor-pointer font-medium text-text-primary">Come si partecipa</summary>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5">
          <li>Scarica l&apos;estensione e decomprimi lo zip: ottieni la cartella <code>twobee-sfida-linkedin</code>.</li>
          <li>In Chrome apri <code>chrome://extensions</code>, attiva «Modalità sviluppatore» in alto a destra, premi «Carica estensione non pacchettizzata» e scegli quella cartella. Si fa una volta sola; vale anche per Edge e Brave.</li>
          <li>Con LinkedIn aperto e il tuo account collegato, clicca l&apos;icona dell&apos;estensione: apre la tua attività, scorre i post del mese e scarica il CSV.</li>
          <li>Torna qui e premi «Carica il CSV». Ricaricalo quando vuoi: i numeri si aggiornano, non si duplicano.</li>
        </ol>
        <p className="mt-3 text-2xs text-text-tertiary">I post sono attribuiti a chi è collegato all&apos;OS quando carica il file. Le impression le vede solo l&apos;autore del post: per questo ognuno carica i propri.</p>
      </details>
    </div>
  )
}
