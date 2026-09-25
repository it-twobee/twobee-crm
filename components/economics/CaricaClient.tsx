'use client'

/**
 * §449 — «Carica»: una porta sola per estratti conto, fatture, cedolini e F24.
 *
 * Si trascina tutto insieme — CSV, Excel e camt.053 della banca, XML, firmati
 * .p7m e zip interi dello SdI, i PDF del consulente — e ogni file si riconosce
 * dal contenuto (`lib/carica.ts`). Gli estratti vanno sul conto dell'IBAN o su
 * quello suggerito (si cambia prima di caricare), le fatture tutte insieme
 * nell'import di sempre. Poi il tool aggancia da solo i movimenti **certi**
 * (`confirmSureMatches`) e gli F24 che la banca mostra pagati.
 *
 * §450 — i PDF si leggono per posizione (`lib/pdf-paghe.ts`): un cedolino che
 * **quadra al centesimo** e ha una persona in organico si salva da solo, gli
 * altri restano da confermare col perché. Un F24 si registra, ma versato lo
 * dice la banca. Ogni originale va in archivio (MinIO) con la sua impronta, e
 * un file già caricato si riconosce prima di rifarlo.
 */

import { useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Upload, Loader2, CheckCircle2, AlertTriangle, FileText, X, Banknote, Receipt, Users, Landmark, Archive } from 'lucide-react'
import { importInvoices } from '@/app/actions/invoices'
import { importBankCsv } from '@/app/actions/bank'
import { confirmSureMatches } from '@/app/actions/reconcile'
import { documentiNoti, pagaF24DaBanca, ricordaIban, salvaCedolino, salvaF24Letto } from '@/app/actions/carica'
import {
  ETICHETTA_TIPO, contoSuggerito, esadecimale, ibanDelFile, normIban, righeExcelATesto, tipoFile,
  type Conto, type TipoFile,
} from '@/lib/carica'
import { xmlDaP7m } from '@/lib/p7m'
import { detectDialect } from '@/lib/bank-import'
import { leggiCedolino, leggiF24, stessaPersona, type CedolinoLetto, type F24Letto } from '@/lib/pdf-paghe'
import { pezziDaPagina } from '@/lib/pdf-pezzi'
import { leggiExcel } from '@/components/shared/leggiExcel'

type Stato = 'pronto' | 'da_confermare' | 'solo_archivio' | 'gia' | 'caricato' | 'errore'

type Voce = {
  id: string
  nome: string
  tipo: TipoFile
  /** il contenuto pronto per l'import: XML della fattura o testo dell'estratto */
  testo: string | null
  conto: string | null
  iban: string | null
  cedolino?: CedolinoLetto
  persona?: string | null
  f24?: F24Letto
  /** l'originale, per l'archivio; uno zip archivia i suoi file, non sé stesso */
  file: File
  sha: string
  stato: Stato
  nota: string
}

export type Persona = { id: string; full_name: string }
/** una fonte e da quando non arriva, già in parole: la scrive la pagina */
export type Fonte = { id: string; gruppo: 'banca' | 'fatture' | 'personale'; etichetta: string; quando: string; vecchio: boolean }

const TETTO_ZIP = 200 * 1024 * 1024
const eur = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const meseIt = (m: string) => new Date(`${m.slice(0, 7)}-15`).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
const tipoArchivio = (t: TipoFile) => t === 'fattura' ? 'fattura' : t.startsWith('banca') ? 'estratto' : t === 'cedolino' ? 'cedolino' : t === 'f24' ? 'f24' : 'altro'

async function pagineDelPdf(f: File) {
  const pdfjs = await import('pdfjs-dist/build/pdf.min.mjs')
  // Da `public/`, copiato prima di dev e build (scripts/copia-pdfjs.mjs), come in PdfViewer.
  pdfjs.GlobalWorkerOptions.workerSrc = `/pdfjs/${pdfjs.version}/pdf.worker.min.mjs`
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()), isEvalSupported: false }).promise
  try {
    const out = []
    for (let i = 1; i <= Math.min(doc.numPages, 60); i++) out.push(await pezziDaPagina(await doc.getPage(i)))
    return out
  } finally { void doc.destroy() }
}

export function CaricaClient({ conti, persone, fonti }: { conti: Conto[]; persone: Persona[]; fonti: Fonte[] }) {
  const [voci, setVoci] = useState<Voce[]>([])
  const [lavoro, setLavoro] = useState(false)
  const [sopra, setSopra] = useState(false)
  const [esito, setEsito] = useState<string[] | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const aggiorna = (id: string, x: Partial<Voce>) => setVoci(v => v.map(y => y.id === id ? { ...y, ...x } : y))

  /** un file → una o più voci (uno zip ne contiene tante, un PDF una per pagina) */
  async function leggi(f: File, dentro = ''): Promise<Voce[]> {
    const id = `${dentro}${f.name}-${f.size}-${Math.random().toString(36).slice(2, 7)}`
    const nome = dentro ? `${dentro} › ${f.name}` : f.name
    const inizio = await f.slice(0, 4096).text()
    const tipo = tipoFile(f.name, inizio)
    const sha = tipo === 'zip' ? '' : esadecimale(await crypto.subtle.digest('SHA-256', await f.arrayBuffer()))
    const voce = (x: Partial<Voce>): Voce => ({ id, nome, tipo, testo: null, conto: null, iban: null, file: f, sha, stato: 'pronto', nota: '', ...x })
    try {
      if (tipo === 'zip') {
        if (f.size > TETTO_ZIP) return [voce({ stato: 'errore', nota: 'Archivio troppo grande' })]
        const zip = await import('@zip.js/zip.js')
        zip.configure({ useWebWorkers: false })
        const entries = await new zip.ZipReader(new zip.BlobReader(f)).getEntries()
        const out: Voce[] = []
        for (const e of entries) {
          if (e.directory || !e.getData || /(^|\/)(__MACOSX|\.)/.test(e.filename)) continue
          const blob = await e.getData(new zip.BlobWriter())
          out.push(...await leggi(new File([blob], e.filename.split('/').pop() ?? e.filename), nome))
        }
        return out.length ? out : [voce({ stato: 'errore', nota: 'Archivio vuoto' })]
      }
      if (tipo === 'fattura') return [voce({ testo: await f.text(), nota: 'si importa con le altre fatture' })]
      if (tipo === 'fattura_p7m') {
        const xml = xmlDaP7m(new Uint8Array(await f.arrayBuffer()))
        return xml ? [voce({ tipo: 'fattura', testo: xml, nota: 'firmata: letta la fattura dentro la busta' })]
          : [voce({ stato: 'errore', nota: 'Dentro la busta non c’è una fattura leggibile' })]
      }
      if (tipo === 'banca_camt') {
        const testo = await f.text()
        const iban = ibanDelFile(f.name, testo)
        const noto = !!iban && conti.some(c => normIban(c.iban) === iban)
        return [voce({
          testo, iban, conto: contoSuggerito('camt', conti, iban),
          nota: noto ? 'camt.053 · conto riconosciuto dall’IBAN' : iban ? `camt.053 · IBAN …${iban.slice(-4)} nuovo: scegli il conto, se lo ricorderà` : 'camt.053',
        })]
      }
      if (tipo === 'banca_testo') {
        const testo = await f.text()
        const prima = testo.split(/\r?\n/).find(l => l.trim()) ?? ''
        const sep = prima.includes('\t') ? '\t' : prima.split(';').length > prima.split(',').length ? ';' : ','
        const d = detectDialect(prima.split(sep).map(c => c.replace(/^"|"$/g, '').trim()))
        const iban = ibanDelFile(f.name, '')
        return [voce({ testo, iban, conto: d ? contoSuggerito(d, conti, iban) : conti[0]?.id ?? null, nota: d ? `tracciato ${d}` : 'tracciato da verificare al caricamento' })]
      }
      if (tipo === 'banca_excel') {
        const r = righeExcelATesto(await leggiExcel(f))
        return 'errore' in r ? [voce({ stato: 'errore', nota: r.errore })]
          : [voce({ testo: r.testo, conto: contoSuggerito(r.dialetto, conti), nota: `Excel, tracciato ${r.dialetto}` })]
      }
      if (tipo === 'pdf') {
        const pagine = await pagineDelPdf(f)
        const out: Voce[] = []
        pagine.forEach((p, i) => {
          const suf = pagine.length > 1 ? ` · pag. ${i + 1}` : ''
          const c = leggiCedolino(p)
          if (c.ok) {
            const ced = c.cedolino
            const chi = persone.filter(x => stessaPersona(x.full_name, ced.nome))
            const persona = chi.length === 1 ? chi[0].id : null
            const perche = [...ced.avvisi, ...(persona ? [] : [`«${ced.nome}» non è in organico: scegli la persona`])]
            out.push(voce({
              id: `${id}-${i}`, nome: `${nome}${suf}`, tipo: 'cedolino', cedolino: ced, persona,
              stato: ced.quadra && persona ? 'pronto' : 'da_confermare',
              nota: `${ced.nome} · ${meseIt(ced.mese)} · netto ${eur(ced.campi.net_paid)} €${ced.quadra ? ' · quadra al centesimo' : ''}${perche.length ? ` · ${perche.join(' · ')}` : ''}`,
            }))
            return
          }
          const g = leggiF24(p)
          if (g.ok) {
            const m = g.f24
            out.push(voce({
              id: `${id}-${i}`, nome: `${nome}${suf}`, tipo: 'f24', f24: m,
              stato: m.quadra && m.scadenza && m.competenza ? 'pronto' : 'errore',
              nota: `${m.competenza ? meseIt(m.competenza) : 'mese ?'} · da versare il ${m.scadenza?.split('-').reverse().join('/') ?? '?'} · ${eur(m.saldoFinale)} €${m.avvisi.length ? ` · ${m.avvisi.join(' · ')}` : ' · versato quando la banca mostra l’addebito'}`,
            }))
          }
        })
        return out.length ? out : [voce({ stato: 'solo_archivio', nota: 'PDF non riconosciuto (si leggono i cedolini Ranocchi e gli F24): va solo in archivio' })]
      }
      return [voce({ stato: 'errore', nota: 'Formato non riconosciuto' })]
    } catch (e) {
      return [voce({ stato: 'errore', nota: (e as Error).message || 'File non leggibile' })]
    }
  }

  async function aggiungi(files: FileList | File[]) {
    setEsito(null)
    const nuove: Voce[] = []
    for (const f of Array.from(files)) nuove.push(...await leggi(f))
    /* un file già in archivio non si rifà: lo si dice, e si può ricaricare lo stesso */
    try {
      const noti = await documentiNoti(Array.from(new Set(nuove.map(v => v.sha).filter(Boolean))))
      for (const v of nuove) {
        const n = noti[v.sha]
        if (n && v.stato !== 'errore') { v.stato = 'gia'; v.nota = `Già caricato il ${new Date(n.quando).toLocaleDateString('it-IT')}${n.esito ? ` · ${n.esito}` : ''}` }
      }
    } catch { /* senza archivio si carica lo stesso */ }
    setVoci(v => [...v, ...nuove])
  }

  /** l'originale in archivio; null se è andato, altrimenti il perché */
  async function archivia(v: Voce, esitoVoce: string, extra: Record<string, string | null | undefined> = {}): Promise<string | null> {
    const fd = new FormData()
    fd.set('file', v.file, v.file.name)
    fd.set('kind', tipoArchivio(v.tipo))
    fd.set('esito', esitoVoce)
    const period = v.cedolino?.mese ?? v.f24?.competenza
    if (period) fd.set('period', period)
    for (const [k, x] of Object.entries(extra)) if (x) fd.set(k, x)
    try {
      const r = await fetch('/api/economics/archivio', { method: 'POST', body: fd })
      const j = await r.json() as { archiviato?: boolean; motivo?: string; error?: string }
      return j.archiviato ? null : (j.motivo ?? j.error ?? 'non archiviato')
    } catch { return 'archivio non raggiungibile' }
  }

  async function salvaUnCedolino(v: Voce, confermato: boolean): Promise<boolean> {
    if (!v.cedolino || !v.persona) { aggiorna(v.id, { stato: 'da_confermare', nota: 'Scegli la persona' }); return false }
    try {
      await salvaCedolino({ personId: v.persona, mese: v.cedolino.mese, campi: v.cedolino.campi, confermato })
      const e = `cedolino ${meseIt(v.cedolino.mese)}${confermato && !v.cedolino.quadra ? ', confermato a mano' : ''}`
      const a = await archivia(v, e, { person_id: v.persona })
      aggiorna(v.id, { stato: 'caricato', nota: `${v.cedolino.nome} · ${meseIt(v.cedolino.mese)} · salvato${a ? ` · archivio: ${a}` : ''}` })
      return true
    } catch (e) { aggiorna(v.id, { stato: 'da_confermare', nota: (e as Error).message }); return false }
  }

  async function carica() {
    setLavoro(true)
    const righe: string[] = []
    const archivioKo: string[] = []
    const dopo = (a: string | null) => { if (a) archivioKo.push(a) }
    try {
      const pronte = voci.filter(v => v.stato === 'pronto' || v.stato === 'solo_archivio')
      const fatture = pronte.filter(v => v.tipo === 'fattura' && v.testo)
      if (fatture.length) {
        const r = await importInvoices(fatture.map(v => ({ name: v.nome, xml: v.testo! })))
        righe.push(`Fatture: ${r.nuovi} nuove, ${r.duplicati} già in archivio${r.falliti.length ? `, ${r.falliti.length} non lette` : ''}${r.agganciati ? `, ${r.agganciati} collegate ai clienti` : ''}`)
        for (const v of fatture) {
          const ko = r.falliti.find(ff => ff.file === v.nome)
          if (ko) { aggiorna(v.id, { stato: 'errore', nota: ko.motivo }); continue }
          dopo(await archivia(v, 'fattura importata'))
          aggiorna(v.id, { stato: 'caricato' })
        }
      }
      for (const b of pronte.filter(v => v.tipo.startsWith('banca') && v.testo)) {
        if (!b.conto) { aggiorna(b.id, { stato: 'errore', nota: 'Scegli il conto' }); continue }
        try {
          const r = await importBankCsv(b.conto, b.testo!)
          if (b.iban && !conti.find(c => c.id === b.conto)?.iban) await ricordaIban(b.conto, b.iban).catch(() => {})
          const conto = conti.find(c => c.id === b.conto)?.label ?? 'conto'
          const e = `${r.nuovi} movimenti nuovi, ${r.duplicati} già presenti`
          righe.push(`${conto}: ${e}${r.scartati ? `, ${r.scartati} scartati` : ''}${r.dal ? ` (${r.dal} → ${r.al})` : ''}`)
          dopo(await archivia(b, `${conto}: ${e}`, { account_id: b.conto }))
          aggiorna(b.id, { stato: 'caricato', nota: e })
        } catch (e) {
          aggiorna(b.id, { stato: 'errore', nota: (e as Error).message })
        }
      }
      const ced = pronte.filter(v => v.tipo === 'cedolino')
      let cedOk = 0
      for (const v of ced) if (await salvaUnCedolino(v, false)) cedOk++
      if (ced.length) righe.push(`Cedolini: ${cedOk} salvati da soli (quadrano al centesimo)`)
      for (const v of pronte.filter(v => v.tipo === 'f24' && v.f24)) {
        try {
          const r = await salvaF24Letto(v.f24!)
          const e = r.gia ? 'F24 già registrato' : r.pagato ? 'F24 registrato e già visto in banca: versato' : 'F24 registrato, da versare'
          righe.push(`F24 di ${meseIt(v.f24!.competenza!)}: ${e}`)
          dopo(await archivia(v, e, { f24_id: r.id }))
          aggiorna(v.id, { stato: 'caricato', nota: e })
        } catch (e) { aggiorna(v.id, { stato: 'errore', nota: (e as Error).message }) }
      }
      for (const v of pronte.filter(v => v.stato === 'solo_archivio')) {
        const a = await archivia(v, 'solo archivio')
        aggiorna(v.id, a ? { stato: 'errore', nota: `Archivio: ${a}` } : { stato: 'caricato', nota: 'in archivio' })
      }
      /* i casi certi da soli: la stessa regola del bottone in Banca, riletta dal database */
      const m = await confirmSureMatches()
      righe.push(m.fatti ? `Agganciati da soli ${m.fatti} movimenti certi (importo al centesimo, nome che torna)` : 'Nessun abbinamento certo da fare da solo')
      const p = await pagaF24DaBanca()
      if (p.fatti) righe.push(`${p.fatti} F24 segnati versati: la banca mostra l’addebito`)
      if (archivioKo.length) righe.push(`Archivio: ${Array.from(new Set(archivioKo)).join(', ')}`)
      setEsito(righe)
      toast.success('Caricamento finito')
    } catch (e) { toast.error((e as Error).message) } finally { setLavoro(false) }
  }

  const daFare = voci.filter(v => v.stato === 'pronto' || v.stato === 'solo_archivio')
  const conta = (t: (v: Voce) => boolean) => daFare.filter(t).length
  const guardare = voci.filter(v => v.stato === 'errore' || v.stato === 'da_confermare').length

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-black text-text-primary font-heading">Carica documenti</h1>
        <p className="text-sm text-text-secondary mt-0.5">Estratti conto, fatture, cedolini e F24, tutti insieme: il tool riconosce ogni file, lo mette al suo posto e ne tiene l’originale.</p>
      </div>

      <Aggiornamento fonti={fonti} />

      <label
        onDragOver={e => { e.preventDefault(); setSopra(true) }}
        onDragLeave={() => setSopra(false)}
        onDrop={e => { e.preventDefault(); setSopra(false); void aggiungi(e.dataTransfer.files) }}
        className={`block border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${sopra ? 'border-gold bg-gold-dim' : 'border-border-strong hover:bg-surface-hover'}`}>
        <Upload className="w-7 h-7 mx-auto text-gold-text" aria-hidden />
        <p className="text-sm font-semibold text-text-primary mt-2">Trascina qui i file, o fai clic per sceglierli</p>
        <p className="text-2xs text-text-tertiary mt-1">Banca: CSV, Excel, camt.053 · Fatture: XML, .p7m, zip dello SdI · Consulente: cedolini e F24 in PDF · Altri PDF: in archivio</p>
        <input ref={input} type="file" multiple className="sr-only" onChange={e => { if (e.target.files) void aggiungi(e.target.files); e.target.value = '' }} />
      </label>

      {voci.length > 0 && (
        <section className="bg-surface border border-border rounded-2xl">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border flex-wrap">
            <span className="text-xs text-text-secondary">
              {conta(v => v.tipo === 'fattura')} fatture · {conta(v => v.tipo.startsWith('banca'))} estratti · {conta(v => v.tipo === 'cedolino')} cedolini · {conta(v => v.tipo === 'f24')} F24
              {guardare > 0 && ` · ${guardare} da guardare`}
            </span>
            <button type="button" onClick={() => { setVoci([]); setEsito(null) }} className="ml-auto text-2xs text-text-tertiary hover:text-text-primary">Svuota</button>
            <button type="button" onClick={() => void carica()} disabled={lavoro || !daFare.length}
              className="flex items-center gap-1.5 text-sm font-semibold bg-gold text-on-gold px-4 py-2 rounded-xl disabled:opacity-40">
              {lavoro ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}Carica {daFare.length}
            </button>
          </div>
          <ul className="divide-y divide-border">
            {voci.map(v => (
              <li key={v.id} className="flex items-center gap-3 px-4 py-2 flex-wrap sm:flex-nowrap">
                <Icona tipo={v.tipo} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-text-primary truncate" title={v.nome}>{v.nome}</p>
                  <p className={`text-2xs ${v.stato === 'errore' ? 'text-error' : v.stato === 'da_confermare' || v.stato === 'gia' ? 'text-warning' : 'text-text-tertiary'}`}>
                    {ETICHETTA_TIPO[v.tipo]}{v.nota ? ` · ${v.nota}` : ''}
                  </p>
                </div>
                {v.tipo.startsWith('banca') && v.stato === 'pronto' && (
                  <select value={v.conto ?? ''} aria-label={`Conto per ${v.nome}`}
                    onChange={e => aggiorna(v.id, { conto: e.target.value || null })}
                    className="text-2xs bg-background border border-border-interactive rounded-lg px-2 py-1 text-text-primary">
                    <option value="">Scegli il conto</option>
                    {conti.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                )}
                {v.tipo === 'cedolino' && v.stato === 'da_confermare' && (
                  <div className="flex items-center gap-2">
                    <select value={v.persona ?? ''} aria-label={`Persona per ${v.nome}`}
                      onChange={e => aggiorna(v.id, { persona: e.target.value || null })}
                      className="text-2xs bg-background border border-border-interactive rounded-lg px-2 py-1 text-text-primary">
                      <option value="">Scegli la persona</option>
                      {persone.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                    </select>
                    <button type="button" disabled={!v.persona || lavoro} onClick={() => void salvaUnCedolino(v, true)}
                      className="text-2xs font-semibold bg-gold text-on-gold px-2.5 py-1 rounded-lg disabled:opacity-40">Conferma e salva</button>
                  </div>
                )}
                {v.stato === 'gia' && (
                  <button type="button"
                    onClick={() => aggiorna(v.id, { stato: v.tipo === 'cedolino' && !(v.cedolino?.quadra && v.persona) ? 'da_confermare' : v.tipo === 'pdf' ? 'solo_archivio' : 'pronto', nota: 'si ricarica' })}
                    className="text-2xs text-gold-text hover:underline">Ricarica lo stesso</button>
                )}
                {v.stato === 'caricato' && <CheckCircle2 className="w-4 h-4 text-success shrink-0" aria-label="caricato" />}
                {(v.stato === 'errore' || v.stato === 'da_confermare') && <AlertTriangle className="w-4 h-4 text-warning shrink-0" aria-hidden />}
                {v.stato !== 'caricato' && (
                  <button type="button" onClick={() => setVoci(vv => vv.filter(x => x.id !== v.id))} aria-label={`Togli ${v.nome}`} className="text-text-tertiary hover:text-text-primary">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {esito && (
        <section role="status" className="bg-success-dim border border-border rounded-2xl p-4 space-y-1">
          {esito.map((r, i) => <p key={i} className="text-xs text-text-primary">{r}</p>)}
          <p className="text-2xs text-text-secondary pt-1">
            I movimenti non certi restano da guardare in <Link href="/economics/banca" className="text-gold-text underline">Banca</Link>, le fatture in <Link href="/economics/fatturazione" className="text-gold-text underline">Fatturazione</Link>, cedolini e F24 in <Link href="/economics/personale" className="text-gold-text underline">Personale</Link>.
          </p>
        </section>
      )}
    </div>
  )
}

function Icona({ tipo }: { tipo: TipoFile }) {
  if (tipo.startsWith('banca')) return <Banknote className="w-4 h-4 text-info shrink-0" aria-hidden />
  if (tipo === 'fattura') return <Receipt className="w-4 h-4 text-gold-text shrink-0" aria-hidden />
  if (tipo === 'cedolino') return <Users className="w-4 h-4 text-accent shrink-0" aria-hidden />
  if (tipo === 'f24') return <Landmark className="w-4 h-4 text-orange shrink-0" aria-hidden />
  if (tipo === 'pdf') return <Archive className="w-4 h-4 text-text-tertiary shrink-0" aria-hidden />
  return <FileText className="w-4 h-4 text-text-tertiary shrink-0" aria-hidden />
}

/**
 * Da quando non arriva ogni fonte: il colpo d'occhio che dice cosa caricare.
 * Un estratto fermo da più di una settimana, un mese di cedolini che manca —
 * sono i buchi da cui nascono i numeri plausibili e sbagliati.
 */
function Aggiornamento({ fonti }: { fonti: Fonte[] }) {
  if (!fonti.length) return null
  const gruppi: [Fonte['gruppo'], string][] = [['banca', 'Conti'], ['fatture', 'Fatture'], ['personale', 'Personale']]
  return (
    <section className="bg-surface border border-border rounded-2xl p-4">
      <p className="text-2xs font-semibold uppercase tracking-wide text-text-tertiary mb-2">Ultimo aggiornamento</p>
      <div className="grid gap-4 sm:grid-cols-3">
        {gruppi.map(([g, titolo]) => (
          <div key={g}>
            <p className="text-xs font-semibold text-text-secondary mb-1">{titolo}</p>
            <ul className="space-y-1">
              {fonti.filter(f => f.gruppo === g).map(f => (
                <li key={f.id} className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="text-text-primary truncate" title={f.etichetta}>{f.etichetta}</span>
                  <span className={`shrink-0 ${f.vecchio ? 'text-warning' : 'text-text-tertiary'}`}>{f.quando}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
