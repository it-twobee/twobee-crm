'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ChevronDown, ChevronLeft, ChevronRight, Crown, Download, ExternalLink, Flame, Hourglass, Upload, Users } from 'lucide-react'
import { caricaCsvLinkedin } from '@/app/actions/linkedin'
import {
  classifica, ordinaPost, distacco, giorniAllaChiusura, ultimoGiorno, MAX_CARATTERI,
  type Criterio, type RigaClassifica,
} from '@/lib/linkedin'
import type { SfidaData } from '@/lib/linkedin-server'
import { Avatar } from '@/components/shared/formkit'

/* §477 — la pagina è una gara: chi è in testa, di quanto, quanto manca alla
   chiusura. I post sono il dettaglio, e stanno dietro un bottone. */

type Metrica = Exclude<Criterio, 'post'>
const METRICHE: { key: Metrica; label: string; unita: string }[] = [
  { key: 'impression', label: 'Impression', unita: 'impression' },
  { key: 'reazioni', label: 'Reazioni', unita: 'reazioni' },
  { key: 'commenti', label: 'Commenti', unita: 'commenti' },
]

// oro, argento, bronzo: il fondo della medaglia e il piedistallo del podio
const MEDAGLIA = ['bg-gold text-on-gold', 'bg-surface-active text-text-primary ring-1 ring-border-strong', 'bg-orange-dim text-orange']
const PIEDISTALLO = ['h-28 bg-gold-dim border-gold', 'h-20 bg-surface-hover border-border-strong', 'h-14 bg-orange-dim border-orange']
const ORDINE_PODIO = [1, 0, 2]

// `always`: in italiano il CLDR non raggruppa le quattro cifre, e «7400» accanto a «23.900» sembra un altro numero
const num = (n: number) => n.toLocaleString('it-IT', { useGrouping: 'always' } as Intl.NumberFormatOptions)
const giorno = (iso: string) => new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', timeZone: 'Europe/Rome' })
const quando = (iso: string) => new Date(iso).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' })
const nome = (autore: string) => autore.split(' ')[0] || autore

function Valore({ r, m }: { r: RigaClassifica; m: Metrica }) {
  if (m === 'impression' && r.impressionParziali) {
    return r.impression === 0
      ? <span className="text-text-tertiary">n/d</span>
      : <span title="Alcuni post senza impression lette: il totale è almeno questo">≥ {num(r.impression)}</span>
  }
  return <>{num(r[m])}</>
}

function Medaglia({ i, size = 'h-7 w-7 text-2xs' }: { i: number; size?: string }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full font-bold tabular-nums ${size} ${MEDAGLIA[i] ?? 'bg-surface-hover text-text-secondary'}`}>
      {i + 1}
    </span>
  )
}

export function SfidaLinkedin({ data, me, base }: { data: SfidaData; me: string; base: string }) {
  const router = useRouter()
  const [metrica, setMetrica] = useState<Metrica>('impression')
  const [mostraPost, setMostraPost] = useState(false)
  const [caricando, setCaricando] = useState(false)

  const righe = useMemo(() => classifica(data.posts, metrica), [data.posts, metrica])
  const posts = useMemo(() => ordinaPost(data.posts, metrica), [data.posts, metrica])
  const unita = METRICHE.find(x => x.key === metrica)!.unita
  const giorni = giorniAllaChiusura(data.mese, data.oggi)
  const chiuso = giorni === null
  const io = righe.findIndex(r => r.profile_id === me)
  const max = righe.length ? Math.max(1, righe[0][metrica]) : 1
  const postDelMese = posts[0]
  const totali = useMemo(() => data.posts.reduce(
    (s, p) => ({ post: s.post + 1, impression: s.impression + (p.impression ?? 0), reazioni: s.reazioni + p.reazioni }),
    { post: 0, impression: 0, reazioni: 0 }), [data.posts])

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

  const primo = righe[0]
  const titolo = !primo
    ? (chiuso ? `Nessuno in gara a ${data.etichetta}` : 'La gara è aperta, e nessuno è ancora partito')
    : chiuso ? `Ha vinto ${primo.autore}` : `${primo.autore} è in testa`
  const d0 = primo ? distacco(righe, 0, metrica) : null
  const sottotitolo = !primo
    ? (chiuso ? 'Il mese si è chiuso senza caricamenti.' : 'Raccogli i tuoi post con l\'estensione e carica il CSV: il primo posto è libero.')
    : d0?.tipo === 'vantaggio'
      ? `${num(primo[metrica])} ${unita}, ${num(d0.di)} più di ${nome(d0.su)}.`
      : `${num(primo[metrica])} ${unita}, e nessuno dietro: il podio aspetta gli altri.`

  let posizione: React.ReactNode
  if (io < 0) posizione = chiuso ? 'Questo mese non eri in gara.' : 'Non sei ancora in gara: carica il CSV e prendi posto.'
  else {
    const d = distacco(righe, io, metrica)
    posizione = d.tipo === 'insegue'
      ? <>Sei <strong className="text-text-primary">{io + 1}°</strong>: ti mancano <strong className="text-text-primary">{num(d.di)} {unita}</strong> per superare {nome(d.chi)}.</>
      : d.tipo === 'vantaggio'
        ? <>Sei <strong className="text-text-primary">1°</strong>, con {num(d.di)} {unita} di vantaggio su {nome(d.su)}.</>
        : <>Sei <strong className="text-text-primary">1°</strong>. Per ora nessuno ti insegue.</>
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
            <Download className="h-4 w-4" aria-hidden="true" /> Estensione
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

      <section aria-labelledby="sfida-titolo" className="relative overflow-hidden rounded-2xl border border-border bg-surface p-5 sm:p-7"
        style={{ backgroundImage: 'radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--color-gold) 16%, transparent), transparent 55%)' }}>
        <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-gold-text">
          <Flame className="h-4 w-4" aria-hidden="true" /> {chiuso ? 'Sfida chiusa' : 'Sfida in corso'} · <span className="capitalize">{data.etichetta}</span>
        </p>
        <h2 id="sfida-titolo" className="mt-2 font-heading text-2xl font-bold text-text-primary sm:text-3xl">{titolo}</h2>
        <p className="mt-1 text-sm text-text-secondary">{sottotitolo}</p>

        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-surface-hover px-4 py-3">
            <dt className="flex items-center gap-1.5 text-2xs text-text-tertiary"><Hourglass className="h-3.5 w-3.5" aria-hidden="true" /> Chiusura</dt>
            <dd className="mt-1 font-heading text-xl font-bold text-text-primary">
              {chiuso ? `Chiusa il ${giorno(`${ultimoGiorno(data.mese)}T12:00:00Z`)}` : giorni === 0 ? 'Ultimo giorno' : `${giorni} ${giorni === 1 ? 'giorno' : 'giorni'}`}
            </dd>
          </div>
          <div className="rounded-xl bg-surface-hover px-4 py-3">
            <dt className="flex items-center gap-1.5 text-2xs text-text-tertiary"><Users className="h-3.5 w-3.5" aria-hidden="true" /> In gara</dt>
            <dd className="mt-1 font-heading text-xl font-bold tabular-nums text-text-primary">{righe.length}</dd>
          </div>
          <div className="rounded-xl bg-surface-hover px-4 py-3">
            <dt className="text-2xs text-text-tertiary">Post del team</dt>
            <dd className="mt-1 font-heading text-xl font-bold tabular-nums text-text-primary">{num(totali.post)}</dd>
          </div>
          <div className="rounded-xl bg-surface-hover px-4 py-3">
            <dt className="text-2xs text-text-tertiary">Impression del team</dt>
            <dd className="mt-1 font-heading text-xl font-bold tabular-nums text-text-primary">{num(totali.impression)}</dd>
          </div>
        </dl>

        <p className="mt-4 text-sm text-text-secondary">{posizione}</p>
      </section>

      <div role="group" aria-label="Classifica per" className="inline-flex rounded-xl border border-border bg-surface p-1">
        {METRICHE.map(m => (
          <button key={m.key} type="button" aria-pressed={metrica === m.key} onClick={() => setMetrica(m.key)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium ${metrica === m.key ? 'bg-gold text-on-gold' : 'text-text-secondary hover:text-text-primary'}`}>
            {m.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section aria-label={`Podio per ${unita}`} className="rounded-2xl border border-border bg-surface p-5 lg:col-span-2">
          <div className="grid grid-cols-3 items-end gap-2 sm:gap-4">
            {ORDINE_PODIO.map(i => {
              const r = righe[i]
              return (
                <div key={i} className="flex min-w-0 flex-col items-center text-center">
                  {r ? (
                    <>
                      {i === 0 && <Crown className="mb-1 h-6 w-6 text-gold-text" aria-hidden="true" />}
                      <span className={`rounded-full ${i === 0 ? 'ring-2 ring-gold' : ''}`}>
                        <Avatar name={r.autore} url={r.avatar} size={i === 0 ? 64 : 48} />
                      </span>
                      <p className="mt-2 w-full truncate text-sm font-semibold text-text-primary">
                        {r.autore}{r.profile_id === me && <span className="font-normal text-text-tertiary"> · tu</span>}
                      </p>
                      <p className={`font-heading font-bold tabular-nums text-text-primary ${i === 0 ? 'text-2xl' : 'text-lg'}`}><Valore r={r} m={metrica} /></p>
                      <p className="text-2xs text-text-tertiary">{unita}</p>
                    </>
                  ) : (
                    <>
                      <span className={`flex items-center justify-center rounded-full border-2 border-dashed border-border-strong text-text-tertiary ${i === 0 ? 'h-16 w-16' : 'h-12 w-12'}`} aria-hidden="true">?</span>
                      <p className="mt-2 text-sm font-medium text-text-tertiary">Posto libero</p>
                      <p className="text-2xs text-text-tertiary">{chiuso ? '—' : 'carica il CSV'}</p>
                    </>
                  )}
                  <div className={`mt-3 flex w-full items-start justify-center rounded-t-xl border-t-2 pt-2 ${PIEDISTALLO[i]}`}>
                    <Medaglia i={i} size="h-8 w-8 text-sm" />
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <section aria-labelledby="post-del-mese" className="flex flex-col rounded-2xl border border-border bg-surface p-5">
          <h2 id="post-del-mese" className="font-heading text-base font-semibold text-text-primary">Il post del mese</h2>
          <p className="text-2xs text-text-tertiary">quello con più {unita}</p>
          {postDelMese ? (
            <>
              <div className="mt-4 flex items-center gap-2">
                <Avatar name={postDelMese.autore} url={postDelMese.avatar} size={32} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text-primary">{postDelMese.autore}</p>
                  <p className="text-2xs text-text-tertiary">{giorno(postDelMese.published_at)}</p>
                </div>
              </div>
              <p className="mt-3 line-clamp-4 text-sm text-text-secondary">{postDelMese.testo || 'Senza testo'}</p>
              <p className="mt-4 font-heading text-3xl font-bold tabular-nums text-text-primary">
                {metrica === 'impression' && postDelMese.impression === null ? 'n/d' : num(postDelMese[metrica] ?? 0)}
                <span className="ml-1.5 text-sm font-normal text-text-tertiary">{unita}</span>
              </p>
              <a href={postDelMese.url} target="_blank" rel="noopener noreferrer"
                className="mt-auto inline-flex items-center gap-1.5 pt-4 text-sm font-medium text-gold-text hover:underline">
                Apri su LinkedIn <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </>
          ) : (
            <p className="mt-4 text-sm text-text-tertiary">Ancora nessun post in gara.</p>
          )}
        </section>
      </div>

      {righe.length > 0 && (
        <section aria-labelledby="classifica" className="rounded-2xl border border-border bg-surface">
          <div className="flex items-baseline justify-between gap-3 border-b border-border px-5 py-3">
            <h2 id="classifica" className="font-heading text-base font-semibold text-text-primary">Classifica</h2>
            <p className="text-2xs text-text-tertiary">per {unita}</p>
          </div>
          <ol>
            {righe.map((r, i) => {
              const d = distacco(righe, i, metrica)
              return (
                <li key={r.profile_id} className={`flex items-center gap-3 border-b border-border px-4 py-3 last:border-0 sm:gap-4 sm:px-5 ${r.profile_id === me ? 'bg-gold-dim' : ''}`}>
                  <Medaglia i={i} />
                  <span className="hidden sm:block"><Avatar name={r.autore} url={r.avatar} size={36} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text-primary">
                      {r.autore}{r.profile_id === me && <span className="font-normal text-text-tertiary"> · tu</span>}
                    </p>
                    <div className="mt-1.5 h-1.5 w-full max-w-md rounded-full bg-surface-active" title={`${num(r[metrica])} ${unita}`}>
                      <div className="h-full rounded-full bg-gold" style={{ width: `${Math.max(2, (r[metrica] / max) * 100)}%` }} />
                    </div>
                    <p className="mt-1 text-2xs text-text-tertiary">
                      {r.post} post · {METRICHE.filter(m => m.key !== metrica).map(m => `${num(r[m.key])} ${m.unita}`).join(' · ')} · aggiornato {quando(r.ultimoCaricamento)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-heading text-lg font-bold tabular-nums text-text-primary"><Valore r={r} m={metrica} /></p>
                    <p className="text-2xs text-text-tertiary">
                      {d.tipo === 'insegue' ? `${num(d.di)} al sorpasso` : d.tipo === 'vantaggio' ? `+${num(d.di)} sul 2°` : 'in testa'}
                    </p>
                  </div>
                </li>
              )
            })}
          </ol>
        </section>
      )}

      {posts.length > 0 && (
        <section aria-label="I post del mese">
          <button type="button" onClick={() => setMostraPost(v => !v)} aria-expanded={mostraPost}
            className="flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary">
            <ChevronDown className={`h-4 w-4 transition-transform ${mostraPost ? 'rotate-180' : ''}`} aria-hidden="true" />
            {mostraPost ? 'Nascondi i post' : `Tutti i post del mese (${posts.length})`}
          </button>
          {mostraPost && (
            <ul className="mt-3 divide-y divide-border rounded-2xl border border-border bg-surface">
              {posts.map(p => (
                <li key={p.post_urn} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-text-primary">{p.testo || <span className="text-text-tertiary">Senza testo</span>}</p>
                    <p className="text-2xs text-text-tertiary">{p.autore} · {giorno(p.published_at)}</p>
                  </div>
                  <p className="shrink-0 text-right text-2xs tabular-nums text-text-secondary">
                    {p.impression === null ? 'n/d' : num(p.impression)} imp. · {num(p.reazioni)} reaz. · {num(p.commenti)} comm.
                  </p>
                  <a href={p.url} target="_blank" rel="noopener noreferrer" aria-label="Apri il post su LinkedIn"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-tertiary hover:bg-surface-hover hover:text-text-primary">
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <details className="rounded-2xl border border-border bg-surface px-5 py-3 text-sm text-text-secondary">
        <summary className="cursor-pointer font-medium text-text-primary">Regole e come si partecipa</summary>
        <p className="mt-3">
          Contano i post pubblicati nel mese, ora di Roma. Fino all&apos;ultimo giorno ogni caricamento aggiorna i numeri, poi la classifica si chiude:
          carica il CSV anche il {giorno(`${ultimoGiorno(data.mese)}T12:00:00Z`)}, o restano quelli dell&apos;ultima volta.
        </p>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5">
          <li>Scarica l&apos;estensione e decomprimi lo zip: ottieni la cartella <code>twobee-sfida-linkedin</code>.</li>
          <li>In Chrome apri <code>chrome://extensions</code>, attiva «Modalità sviluppatore» in alto a destra, premi «Carica estensione non pacchettizzata» e scegli quella cartella. Si fa una volta sola; vale anche per Edge e Brave.</li>
          <li>Con LinkedIn aperto e il tuo account collegato, clicca l&apos;icona dell&apos;estensione: nella finestrella le date sono già quelle del mese, premi «Raccogli i post». Apre la tua attività, scorre i post e scarica il CSV.</li>
          <li>Torna qui e premi «Carica il CSV». Ricaricalo quando vuoi: i numeri si aggiornano, non si duplicano.</li>
        </ol>
        <p className="mt-3 text-2xs text-text-tertiary">Avevi già l&apos;estensione? Scaricala di nuovo, sostituisci la cartella e premi l&apos;icona di ricarica sulla sua scheda in <code>chrome://extensions</code>: la versione giusta ha la finestrella con le date.</p>
        <p className="mt-2 text-2xs text-text-tertiary">I post sono attribuiti a chi è collegato all&apos;OS quando carica il file. Le impression le vede solo l&apos;autore del post: per questo ognuno carica i propri.</p>
      </details>
    </div>
  )
}
