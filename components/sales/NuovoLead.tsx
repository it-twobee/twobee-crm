'use client'

/**
 * §377 — aggiungere lead: uno a mano, o molti da un CSV.
 *
 * Un modale solo con due schede, e non due bottoni diversi in testata: sono
 * la stessa intenzione — «questi lead non ci sono ancora» — e separarle
 * avrebbe messo in cima una scelta che chi apre ha già fatto.
 *
 * **Il controllo dei doppioni è la funzione, non un accessorio.** A mano si
 * ferma e mostra cosa ha trovato, con un «aggiungi comunque» esplicito: solo
 * chi inserisce sa se «Rossi Srl» e «Rossi S.r.l.» sono la stessa azienda o
 * due fratelli. Da CSV non c'è nessun «comunque»: su duecento righe nessuno
 * legge, e un pulsante che importa tutto lo stesso riempirebbe la tabella di
 * doppioni in un clic — le righe saltate restano nel riepilogo e si
 * aggiungono a mano, una per una, con la decisione davanti.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { X, Upload, Loader2, AlertTriangle, Check } from 'lucide-react'
import { creaLead, importaLeadCsv, type EsitoImport } from '@/app/actions/sales'
import { leggiCsv, conIntestazioni } from '@/lib/sales-import'
import { riconosci, converti, spiegaMappa, trovaIntestazione, NOME_CAMPO, type CampoLead, type Mappa } from '@/lib/sales-csv-esterno'
import { eExcel } from '@/lib/sales-xlsx'
import { leggiExcel } from '@/components/shared/leggiExcel'
import { ETICHETTA_GRUPPO, GRUPPI } from '@/lib/sales-stages'
import { useFasi } from './FasiContext'

const input = 'w-full bg-background border border-border-interactive rounded-xl px-3 py-2 text-sm text-text-primary'
const label = 'block text-2xs text-text-tertiary mb-1'

type Doppione = { id: string; testo: string; certo: boolean }

export function NuovoLead({ onChiudi, onFatto }: { onChiudi: () => void; onFatto: () => void }) {
  const { FASI, fasiDelGruppo, faseConRuolo, vociPer } = useFasi()
  const [scheda, setScheda] = useState<'mano' | 'csv'>('mano')

  // ── a mano ───────────────────────────────────────────────────────────────
  const [azienda, setAzienda] = useState('')
  const [referente, setReferente] = useState('')
  const [email, setEmail] = useState('')
  const [telefono, setTelefono] = useState('')
  const [fase, setFase] = useState((faseConRuolo('nuovo')?.chiave ?? FASI[0]?.chiave ?? ''))
  const [priorita, setPriorita] = useState('')
  const [fonte, setFonte] = useState('')
  const [note, setNote] = useState('')
  const [doppioni, setDoppioni] = useState<Doppione[] | null>(null)
  const [salvo, setSalvo] = useState(false)

  const salva = async (forza = false) => {
    if (!azienda.trim()) { toast.error('Il nome azienda è obbligatorio'); return }
    setSalvo(true)
    try {
      const e = await creaLead({
        companyName: azienda, contactName: referente, contactEmail: email,
        contactPhone: telefono, stage: fase, priority: priorita || null,
        source: fonte || null, notes: note || null,
      }, forza)
      if (!e.ok) { setDoppioni(e.doppioni); return }
      toast.success(`${azienda.trim()} aggiunto`)
      onFatto()
    } catch (err) { toast.error((err as Error).message) } finally { setSalvo(false) }
  }

  // ── da CSV ───────────────────────────────────────────────────────────────
  const [nomeFile, setNomeFile] = useState('')
  const [mappa, setMappa] = useState<Mappa | null>(null)
  const [intestazioni, setIntestazioni] = useState<string[]>([])
  const [daImportare, setDaImportare] = useState<ReturnType<typeof converti> | null>(null)
  const [esito, setEsito] = useState<EsitoImport | null>(null)
  const [importo, setImporto] = useState(false)

  const [tabella, setTabella] = useState<Record<string, string>[]>([])
  /** §433 — la riga del file che fa da intestazione: sopra può esserci un titolo */
  const [inizio, setInizio] = useState(0)

  const leggiFile = async (file: File) => {
    setEsito(null)
    setNomeFile(file.name)
    let grezze: string[][]
    try {
      grezze = eExcel(file.name) ? await leggiExcel(file) : leggiCsv(await file.text())
    } catch (err) {
      toast.error((err as Error).message); setMappa(null); setDaImportare(null); return
    }
    const h = trovaIntestazione(grezze)
    const righe = conIntestazioni(grezze.slice(h))
    if (!righe.length) { toast.error('Il file è vuoto'); setMappa(null); setDaImportare(null); return }
    const testa = Object.keys(righe[0]).filter(Boolean)
    const m = riconosci(testa)
    setInizio(h)
    setTabella(righe)
    setIntestazioni(testa)
    setMappa(m)
    setDaImportare(converti(righe, m))
  }

  /* §433 — il riconoscimento indovina quasi sempre, e quando sbaglia si deve
     poter correggere qui: prima l'anteprima mostrava l'errore e l'unica via
     era rinominare la colonna nel file e ricaricarlo. */
  const cambiaColonna = (campo: CampoLead, colonna: string) => {
    if (!mappa) return
    const m: Mappa = { ...mappa }
    for (const k of Object.keys(m) as CampoLead[]) if (colonna && m[k] === colonna) delete m[k]
    if (colonna) m[campo] = colonna
    else delete m[campo]
    setMappa(m)
    setDaImportare(converti(tabella, m))
    setEsito(null)
  }
  /** la riga del file, contata come la conta chi lo apre: da uno, intestazione compresa */
  const rigaDelFile = (n: number) => {
    const i = daImportare?.origine[n - 2]
    return i === undefined ? n : inizio + i + 2
  }

  const importa = async () => {
    if (!daImportare?.lead.length) return
    setImporto(true)
    try {
      const e = await importaLeadCsv(daImportare.lead)
      setEsito(e)
      if (e.errore) toast.error(e.errore)
      else if (e.nuovi) { toast.success(`${e.nuovi} lead importati`); onFatto() }
      else toast.error('Nessun lead nuovo: erano tutti già presenti')
    } catch (err) { toast.error((err as Error).message) } finally { setImporto(false) }
  }

  const spiegata = mappa ? spiegaMappa(intestazioni, mappa) : null

  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onChiudi()}>
      <div className="bg-surface border border-border rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <header className="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
          <p className="flex-1 text-sm font-black text-text-primary">Nuovo lead</p>
          <button onClick={onChiudi} aria-label="Chiudi" className="text-text-secondary hover:text-text-primary">
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="flex border-b border-border px-2 shrink-0">
          {([['mano', 'Uno a mano'], ['csv', 'Da un CSV']] as const).map(([k, t]) => (
            <button key={k} onClick={() => setScheda(k)}
              className={`px-4 py-3 text-xs font-semibold border-b-2 transition-colors ${
                scheda === k ? 'text-gold-text border-gold' : 'text-text-secondary border-transparent hover:text-text-primary'}`}>
              {t}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-3 overflow-y-auto">
          {scheda === 'mano' ? (
            <>
              <div>
                <label className={label} htmlFor="nl-azienda">Azienda *</label>
                <input id="nl-azienda" value={azienda} onChange={e => { setAzienda(e.target.value); setDoppioni(null) }}
                  className={input} placeholder="Ragione sociale" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label} htmlFor="nl-ref">Referente</label>
                  <input id="nl-ref" value={referente} onChange={e => setReferente(e.target.value)} className={input} />
                </div>
                <div>
                  <label className={label} htmlFor="nl-tel">Telefono</label>
                  <input id="nl-tel" value={telefono} onChange={e => { setTelefono(e.target.value); setDoppioni(null) }} className={input} />
                </div>
              </div>
              <div>
                <label className={label} htmlFor="nl-mail">Email</label>
                <input id="nl-mail" type="email" value={email} onChange={e => { setEmail(e.target.value); setDoppioni(null) }} className={input} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={label} htmlFor="nl-fase">Fase</label>
                  <select id="nl-fase" value={fase} onChange={e => setFase(e.target.value)} className={input}>
                    {GRUPPI.map(g => (
                      <optgroup key={g} label={ETICHETTA_GRUPPO[g]}>
                        {fasiDelGruppo(g).map(f => <option key={f.chiave} value={f.chiave}>{f.etichetta}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={label} htmlFor="nl-prio">Priorità</label>
                  <select id="nl-prio" value={priorita} onChange={e => setPriorita(e.target.value)} className={input}>
                    <option value="">—</option>
                    {vociPer('priority').map(p => <option key={p.chiave} value={p.chiave}>{p.etichetta}</option>)}
                  </select>
                </div>
                <div>
                  <label className={label} htmlFor="nl-fonte">Fonte</label>
                  <input id="nl-fonte" value={fonte} onChange={e => setFonte(e.target.value)} className={input} placeholder="Referral" />
                </div>
              </div>
              <div>
                <label className={label} htmlFor="nl-note">Note</label>
                <textarea id="nl-note" rows={2} value={note} onChange={e => setNote(e.target.value)} className={input} />
              </div>

              {/* Non «errore»: dice cosa ha trovato e lascia decidere. */}
              {doppioni && (
                <div className="border border-warning/40 bg-warning-dim rounded-xl p-3 space-y-1.5">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-text-primary">
                    <AlertTriangle className="w-4 h-4 text-warning shrink-0" aria-hidden />
                    {doppioni.length === 1 ? 'Ne esiste già uno simile' : `Ne esistono già ${doppioni.length} simili`}
                  </p>
                  {doppioni.map(d => (
                    <p key={d.id} className="text-2xs text-text-secondary">
                      {d.testo}{!d.certo && <span className="text-text-tertiary"> — solo il nome, potrebbero essere due aziende diverse</span>}
                    </p>
                  ))}
                  <p className="text-2xs text-text-tertiary pt-1">
                    Se è davvero un&apos;altra azienda, aggiungila lo stesso.
                  </p>
                </div>
              )}
            </>
          ) : (
            <>
              <label className="flex flex-col items-center justify-center gap-2 border border-dashed border-border-strong rounded-xl py-8 cursor-pointer hover:bg-surface-hover transition-colors">
                <Upload className="w-5 h-5 text-text-tertiary" aria-hidden />
                <span className="text-xs text-text-secondary">{nomeFile || 'Scegli un file Excel o CSV'}</span>
                <input type="file" accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only"
                  onChange={e => { const f = e.target.files?.[0]; if (f) leggiFile(f) }} />
              </label>

              {/* §377 — si dichiara **cosa è stato riconosciuto**: un errore
                  di colonna si vede qui, prima di importare, invece di
                  scoprirlo chiamando un numero che era un'email. */}
              {spiegata && (
                <div className="border border-border rounded-xl p-3 space-y-2">
                  {inizio > 0 && (
                    <p className="text-2xs text-text-tertiary">
                      Le prime {inizio === 1 ? 'riga è un titolo' : `${inizio} righe sono un titolo`}: la tabella parte dalla riga {inizio + 1}.
                    </p>
                  )}
                  <p className="text-2xs font-semibold text-text-tertiary uppercase tracking-wide">Quale colonna va dove</p>
                  <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5">
                    {(Object.keys(NOME_CAMPO) as CampoLead[]).map(campo => (
                      <label key={campo} className="contents">
                        <span className="text-2xs text-text-primary flex items-center gap-1.5">
                          {mappa?.[campo]
                            ? <Check className="w-3 h-3 text-success shrink-0" aria-hidden />
                            : <span className="w-3 h-3 shrink-0" aria-hidden />}
                          {NOME_CAMPO[campo]}{campo === 'companyName' && ' *'}
                        </span>
                        <select value={mappa?.[campo] ?? ''} onChange={e => cambiaColonna(campo, e.target.value)}
                          aria-label={`Colonna per ${NOME_CAMPO[campo]}`}
                          className="bg-surface border border-border-interactive rounded-lg px-2 py-1 text-2xs text-text-primary min-w-0">
                          <option value="">— non importare</option>
                          {intestazioni.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </label>
                    ))}
                  </div>
                  {!mappa?.companyName ? (
                    <p className="text-xs text-error">
                      Scegli quale colonna contiene il nome dell&apos;azienda: è l&apos;unica obbligatoria.
                    </p>
                  ) : (
                    <>
                      {spiegata && spiegata.ignorate.length > 0 && (
                        <p className="text-2xs text-text-tertiary pt-1">
                          Non importate: {spiegata.ignorate.join(', ')}
                        </p>
                      )}
                      <p className="text-2xs text-text-secondary pt-1">
                        <span className="text-text-primary font-semibold tabular">{daImportare?.lead.length ?? 0}</span> righe pronte
                        {(daImportare?.senzaAzienda ?? 0) > 0 && <> · {daImportare?.senzaAzienda} senza azienda, saltate</>}
                      </p>
                    </>
                  )}
                </div>
              )}

              {esito && (
                <div className="border border-border rounded-xl p-3 space-y-1.5">
                  <p className="text-xs text-text-primary">
                    <span className="font-semibold tabular text-success">{esito.nuovi}</span> importati ·{' '}
                    <span className="tabular">{esito.doppioni.length}</span> già presenti ·{' '}
                    <span className="tabular">{esito.scartati}</span> senza azienda
                  </p>
                  {esito.doppioni.slice(0, 8).map(d => (
                    <p key={d.riga} className="text-2xs text-text-tertiary">
                      riga {rigaDelFile(d.riga)} · {d.azienda} — {d.testo}
                    </p>
                  ))}
                  {esito.doppioni.length > 8 && (
                    <p className="text-2xs text-text-tertiary">e altri {esito.doppioni.length - 8}.</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <footer className="flex justify-end gap-2 px-5 py-4 border-t border-border shrink-0">
          <button onClick={onChiudi} className="text-xs text-text-secondary hover:text-text-primary px-3 py-2">Annulla</button>
          {scheda === 'mano' ? (
            doppioni ? (
              <button onClick={() => salva(true)} disabled={salvo}
                className="flex items-center gap-1.5 text-xs font-semibold bg-warning text-on-gold px-4 py-2 rounded-xl disabled:opacity-40">
                {salvo && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Aggiungi comunque
              </button>
            ) : (
              <button onClick={() => salva(false)} disabled={salvo || !azienda.trim()}
                className="flex items-center gap-1.5 text-xs font-semibold bg-gold text-on-gold px-4 py-2 rounded-xl shadow-soft press disabled:opacity-40">
                {salvo && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Aggiungi
              </button>
            )
          ) : (
            <button onClick={importa} disabled={importo || !daImportare?.lead.length}
              className="flex items-center gap-1.5 text-xs font-semibold bg-gold text-on-gold px-4 py-2 rounded-xl shadow-soft press disabled:opacity-40">
              {importo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Importa {daImportare?.lead.length ? `(${daImportare.lead.length})` : ''}
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}
