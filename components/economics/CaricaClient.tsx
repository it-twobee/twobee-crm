'use client'

/**
 * §449 — «Carica»: una porta sola per estratti conto e fatture.
 *
 * Si trascina tutto insieme — CSV, Excel e camt.053 della banca, XML, firmati
 * .p7m e zip interi dello SdI — e ogni file si riconosce dal contenuto
 * (`lib/carica.ts`). Gli estratti vanno sul conto suggerito (si cambia prima di
 * caricare), le fatture tutte insieme nell'import di sempre. Poi il tool
 * aggancia da solo i movimenti **certi** (`confirmSureMatches`: importo al
 * centesimo, nome che torna, uno a uno) e lascia gli altri a Banca, col perché.
 *
 * I file si aprono nel browser: al server arrivano testo e XML, come dalle
 * porte di prima. I PDF si accettano ma non si leggono ancora: per estratti,
 * cedolini e F24 in PDF serve un esempio del tracciato, e un lettore scritto
 * alla cieca darebbe numeri plausibili e sbagliati.
 */

import { useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Upload, Loader2, CheckCircle2, AlertTriangle, FileText, X, Banknote, Receipt } from 'lucide-react'
import { importInvoices } from '@/app/actions/invoices'
import { importBankCsv } from '@/app/actions/bank'
import { confirmSureMatches } from '@/app/actions/reconcile'
import { ETICHETTA_TIPO, contoSuggerito, righeExcelATesto, tipoFile, type Conto, type TipoFile } from '@/lib/carica'
import { xmlDaP7m } from '@/lib/p7m'
import { detectDialect } from '@/lib/bank-import'
import { leggiExcel } from '@/components/shared/leggiExcel'

type Voce = {
  id: string
  nome: string
  tipo: TipoFile
  /** il contenuto pronto per l'import: XML della fattura o testo dell'estratto */
  testo: string | null
  conto: string | null
  stato: 'pronto' | 'caricato' | 'errore' | 'non_si_legge'
  nota: string
}

const TETTO_ZIP = 200 * 1024 * 1024

export function CaricaClient({ conti }: { conti: Conto[] }) {
  const [voci, setVoci] = useState<Voce[]>([])
  const [lavoro, setLavoro] = useState(false)
  const [sopra, setSopra] = useState(false)
  const [esito, setEsito] = useState<string[] | null>(null)
  const input = useRef<HTMLInputElement>(null)

  /** un file → una o più voci (uno zip ne contiene tante) */
  async function leggi(f: File, dentro = ''): Promise<Voce[]> {
    const id = `${dentro}${f.name}-${f.size}-${Math.random().toString(36).slice(2, 7)}`
    const nome = dentro ? `${dentro} › ${f.name}` : f.name
    const inizio = await f.slice(0, 4096).text()
    const tipo = tipoFile(f.name, inizio)
    const voce = (x: Partial<Voce>): Voce => ({ id, nome, tipo, testo: null, conto: null, stato: 'pronto', nota: '', ...x })
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
      if (tipo === 'banca_camt') return [voce({ testo: await f.text(), conto: contoSuggerito('camt', conti), nota: 'camt.053' })]
      if (tipo === 'banca_testo') {
        const testo = await f.text()
        const prima = testo.split(/\r?\n/).find(l => l.trim()) ?? ''
        const sep = prima.includes('\t') ? '\t' : prima.split(';').length > prima.split(',').length ? ';' : ','
        const d = detectDialect(prima.split(sep).map(c => c.replace(/^"|"$/g, '').trim()))
        return [voce({ testo, conto: d ? contoSuggerito(d, conti) : conti[0]?.id ?? null, nota: d ? `tracciato ${d}` : 'tracciato da verificare al caricamento' })]
      }
      if (tipo === 'banca_excel') {
        const r = righeExcelATesto(await leggiExcel(f))
        return 'errore' in r ? [voce({ stato: 'errore', nota: r.errore })]
          : [voce({ testo: r.testo, conto: contoSuggerito(r.dialetto, conti), nota: `Excel, tracciato ${r.dialetto}` })]
      }
      if (tipo === 'pdf') return [voce({ stato: 'non_si_legge', nota: 'I PDF (estratti, cedolini, F24) non si leggono ancora: serve un esempio del tracciato. Caricalo in CSV/Excel/camt, o inseriscilo dalla sua sezione.' })]
      return [voce({ stato: 'errore', nota: 'Formato non riconosciuto' })]
    } catch (e) {
      return [voce({ stato: 'errore', nota: (e as Error).message || 'File non leggibile' })]
    }
  }

  async function aggiungi(files: FileList | File[]) {
    setEsito(null)
    const nuove: Voce[] = []
    for (const f of Array.from(files)) nuove.push(...await leggi(f))
    setVoci(v => [...v, ...nuove])
  }

  async function carica() {
    setLavoro(true)
    const righe: string[] = []
    try {
      const fatture = voci.filter(v => v.stato === 'pronto' && v.tipo === 'fattura' && v.testo)
      if (fatture.length) {
        const r = await importInvoices(fatture.map(v => ({ name: v.nome, xml: v.testo! })))
        righe.push(`Fatture: ${r.nuovi} nuove, ${r.duplicati} già in archivio${r.falliti.length ? `, ${r.falliti.length} non lette` : ''}${r.agganciati ? `, ${r.agganciati} collegate ai clienti` : ''}`)
        setVoci(v => v.map(x => fatture.some(f => f.id === x.id)
          ? { ...x, stato: r.falliti.some(ff => ff.file === x.nome) ? 'errore' : 'caricato', nota: r.falliti.find(ff => ff.file === x.nome)?.motivo ?? x.nota } : x))
      }
      for (const b of voci.filter(v => v.stato === 'pronto' && v.tipo.startsWith('banca') && v.testo)) {
        if (!b.conto) { setVoci(v => v.map(x => x.id === b.id ? { ...x, stato: 'errore', nota: 'Scegli il conto' } : x)); continue }
        try {
          const r = await importBankCsv(b.conto, b.testo!)
          const conto = conti.find(c => c.id === b.conto)?.label ?? 'conto'
          righe.push(`${conto}: ${r.nuovi} movimenti nuovi, ${r.duplicati} già presenti${r.scartati ? `, ${r.scartati} scartati` : ''}${r.dal ? ` (${r.dal} → ${r.al})` : ''}`)
          setVoci(v => v.map(x => x.id === b.id ? { ...x, stato: 'caricato', nota: `${r.nuovi} nuovi, ${r.duplicati} già presenti` } : x))
        } catch (e) {
          setVoci(v => v.map(x => x.id === b.id ? { ...x, stato: 'errore', nota: (e as Error).message } : x))
        }
      }
      /* i casi certi da soli: la stessa regola del bottone in Banca, riletta dal database */
      const m = await confirmSureMatches()
      righe.push(m.fatti ? `Agganciati da soli ${m.fatti} movimenti certi (importo al centesimo, nome che torna)` : 'Nessun abbinamento certo da fare da solo')
      setEsito(righe)
      toast.success('Caricamento finito')
    } catch (e) { toast.error((e as Error).message) } finally { setLavoro(false) }
  }

  const pronte = voci.filter(v => v.stato === 'pronto')
  const conta = (t: (v: Voce) => boolean) => pronte.filter(t).length

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-black text-text-primary font-heading">Carica documenti</h1>
        <p className="text-sm text-text-secondary mt-0.5">Estratti conto e fatture, tutti insieme: il tool riconosce ogni file e lo mette al suo posto.</p>
      </div>

      <label
        onDragOver={e => { e.preventDefault(); setSopra(true) }}
        onDragLeave={() => setSopra(false)}
        onDrop={e => { e.preventDefault(); setSopra(false); void aggiungi(e.dataTransfer.files) }}
        className={`block border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${sopra ? 'border-gold bg-gold-dim' : 'border-border-strong hover:bg-surface-hover'}`}>
        <Upload className="w-7 h-7 mx-auto text-gold-text" aria-hidden />
        <p className="text-sm font-semibold text-text-primary mt-2">Trascina qui i file, o fai clic per sceglierli</p>
        <p className="text-2xs text-text-tertiary mt-1">Banca: CSV, Excel (.xlsx), camt.053 · Fatture: XML, firmate .p7m, archivi .zip dello SdI</p>
        <input ref={input} type="file" multiple className="sr-only" onChange={e => { if (e.target.files) void aggiungi(e.target.files); e.target.value = '' }} />
      </label>

      {voci.length > 0 && (
        <section className="bg-surface border border-border rounded-2xl">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border flex-wrap">
            <span className="text-xs text-text-secondary">
              {conta(v => v.tipo === 'fattura')} fatture · {conta(v => v.tipo.startsWith('banca'))} estratti pronti
              {voci.some(v => v.stato === 'non_si_legge' || v.stato === 'errore') && ` · ${voci.filter(v => v.stato === 'non_si_legge' || v.stato === 'errore').length} da guardare`}
            </span>
            <button type="button" onClick={() => { setVoci([]); setEsito(null) }} className="ml-auto text-2xs text-text-tertiary hover:text-text-primary">Svuota</button>
            <button type="button" onClick={() => void carica()} disabled={lavoro || !pronte.length}
              className="flex items-center gap-1.5 text-sm font-semibold bg-gold text-on-gold px-4 py-2 rounded-xl disabled:opacity-40">
              {lavoro ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}Carica {pronte.length}
            </button>
          </div>
          <ul className="divide-y divide-border">
            {voci.map(v => (
              <li key={v.id} className="flex items-center gap-3 px-4 py-2">
                {v.tipo.startsWith('banca') ? <Banknote className="w-4 h-4 text-info shrink-0" /> : v.tipo === 'fattura' ? <Receipt className="w-4 h-4 text-gold-text shrink-0" /> : <FileText className="w-4 h-4 text-text-tertiary shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-text-primary truncate" title={v.nome}>{v.nome}</p>
                  <p className={`text-2xs ${v.stato === 'errore' ? 'text-error' : v.stato === 'non_si_legge' ? 'text-warning' : 'text-text-tertiary'}`}>
                    {ETICHETTA_TIPO[v.tipo]}{v.nota ? ` · ${v.nota}` : ''}
                  </p>
                </div>
                {v.tipo.startsWith('banca') && v.stato === 'pronto' && (
                  <select value={v.conto ?? ''} aria-label={`Conto per ${v.nome}`}
                    onChange={e => setVoci(vv => vv.map(x => x.id === v.id ? { ...x, conto: e.target.value || null } : x))}
                    className="text-2xs bg-background border border-border-interactive rounded-lg px-2 py-1 text-text-primary">
                    <option value="">Scegli il conto</option>
                    {conti.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                )}
                {v.stato === 'caricato' && <CheckCircle2 className="w-4 h-4 text-success shrink-0" aria-label="caricato" />}
                {(v.stato === 'errore' || v.stato === 'non_si_legge') && <AlertTriangle className="w-4 h-4 text-warning shrink-0" aria-hidden />}
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
        <section role="status" className="bg-success-dim border border-success/30 rounded-2xl p-4 space-y-1">
          {esito.map((r, i) => <p key={i} className="text-xs text-text-primary">{r}</p>)}
          <p className="text-2xs text-text-secondary pt-1">
            I movimenti non certi restano da guardare in <Link href="/economics/banca" className="text-gold-text underline">Banca</Link>, le fatture in <Link href="/economics/fatturazione" className="text-gold-text underline">Fatturazione</Link>.
          </p>
        </section>
      )}
    </div>
  )
}
