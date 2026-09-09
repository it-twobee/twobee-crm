/**
 * §324 — Ripara gli agganci movimento↔fattura impossibili.
 *
 *   npx tsx scripts/fix-invoice-links.ts            → dice cosa farebbe
 *   npx tsx scripts/fix-invoice-links.ts --apply    → lo scrive
 *
 * Un movimento non può pagare una fattura che a quella data non esisteva. Un
 * anticipo di pochi giorni è normale — con la fatturazione differita si paga
 * prima di ricevere il documento, e sui dati veri sono GIALEDA a dieci giorni e
 * Talenti a uno — ma oltre il mese e mezzo il movimento è **di un'altra
 * fattura**, quasi sempre quella dello stesso importo del mese precedente.
 *
 * Sui dati veri erano tre agganci su cinquantanove, tutti con la stessa forma:
 *
 *   · Tailors — il bonifico del 17 giugno su una fattura del 4 agosto
 *   · iCura — quello del 21 luglio su una fattura del 4 agosto
 *   · Saraiello — quello del 17 luglio su una fattura del 5 agosto
 *
 * Nei primi due la fattura giusta portava **già** la data giusta in `paid_on`:
 * il legame era l'unica cosa sbagliata, e ripararlo non muove un euro. Nel terzo
 * anche `paid_on` era sbagliata, e va spostata sulla fattura più vecchia ancora
 * aperta — che è la regola con cui si imputa un pagamento quando il fornitore
 * non dice a cosa si riferisce.
 *
 * Non indovina: propone solo dove il candidato è **unico** — stesso verso,
 * stessa controparte, stesso importo lordo, emessa prima del movimento — e dove
 * quel candidato non ha già un altro movimento addosso. Il resto lo stampa e lo
 * lascia a chi guarda.
 */
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync(`${process.cwd()}/.env.local`, 'utf8').split('\n')
    .map(l => l.match(/^([A-Z_0-9]+)=(.*)$/)).filter(Boolean)
    .map(m => [m![1], m![2].trim().replace(/^["']|["']$/g, '')]))

const URL = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '')
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
const APPLY = process.argv.includes('--apply')

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY, Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=representation',
      ...(init?.headers ?? {}),
    },
  })
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`)
  const t = await r.text()
  return (t ? JSON.parse(t) : null) as T
}

const eur = (n: number) =>
  `${n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
const D = 86400000
const gg = (a: string, b: string) =>
  Math.round((+new Date(`${b}T00:00:00Z`) - +new Date(`${a}T00:00:00Z`)) / D)
const key = (n: string) => n.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)

type Inv = {
  id: string; direction: string; number: string; issued_on: string
  total: number; paid_on: string | null; counterparty_name: string
}
type Tx = {
  id: string; booked_on: string; amount: number; source: string
  counterparty: string | null; description: string; invoice_id: string | null
}

async function main() {
  const inv = await api<Inv[]>('invoices?select=id,direction,number,issued_on,total,paid_on,counterparty_name')
  const txs = await api<Tx[]>('bank_transactions?select=id,booked_on,amount,source,counterparty,description,invoice_id&invoice_id=not.is.null&order=booked_on')
  const byId = new Map(inv.map(i => [i.id, i]))
  const txOf = new Map<string, Tx[]>()
  for (const t of txs) txOf.set(t.invoice_id!, [...(txOf.get(t.invoice_id!) ?? []), t])

  /* Tre firme, e la sola distanza non basta a riconoscerle tutte.
       1. il movimento è oltre 45 giorni prima: passato il termine della
          differita, non è più un ritardo di emissione
       2. **due fatture si dichiarano pagate dallo stesso movimento**: una lo
          tiene agganciato, l'altra ne porta la data in `paid_on`. È la firma
          più netta e non ha bisogno di soglie — sui dati veri prende i due casi
          che la distanza si lasciava scappare (14 e 19 giorni)
       3. `paid_on` è anteriore all'emissione **di oltre 45 giorni**: falso in
          sé, senza guardare i movimenti. La soglia serve anche qui: GIALEDA ha
          incassato il 19 maggio una fattura datata 29, e Talenti a un giorno di
          distanza — sono differite legittime, e segnalarle insegnerebbe a
          ignorare l'avviso. */
  const contesa = (t: Tx, i: Inv) => inv.find(x =>
    x.id !== i.id
    && x.direction === i.direction
    && key(x.counterparty_name) === key(i.counterparty_name)
    && Math.abs(Number(x.total) - Math.abs(Number(t.amount))) < 0.01
    && x.paid_on === t.booked_on)

  const rotti = txs
    .map(t => ({ t, i: byId.get(t.invoice_id!) }))
    .filter((p): p is { t: Tx; i: Inv } => {
      if (!p.i) return false
      const d = gg(p.i.issued_on, p.t.booked_on)
      return d < -45
        || (d < 0 && !!contesa(p.t, p.i))
        || (!!p.i.paid_on && gg(p.i.issued_on, p.i.paid_on) < -45)
    })

  console.log(`${txs.length} movimenti agganciati · ${rotti.length} impossibili\n`)
  if (!rotti.length) { console.log('Niente da riparare.\n'); return }

  const patch: { path: string; body: string; detta: string }[] = []

  for (const { t, i } of rotti) {
    console.log(`✗ ${i.number} del ${i.issued_on} ← movimento del ${t.booked_on} `
      + `${eur(Number(t.amount))} (${-gg(i.issued_on, t.booked_on)} giorni prima che esistesse)`)

    /* Il candidato vero: stessa controparte e stesso importo lordo, già emessa
       quando il movimento è passato, e senza un altro movimento già addosso. */
    const cand = inv.filter(x =>
      x.id !== i.id
      && x.direction === i.direction
      && key(x.counterparty_name) === key(i.counterparty_name)
      && Math.abs(Number(x.total) - Math.abs(Number(t.amount))) < 0.01
      && x.issued_on <= t.booked_on
      && !(txOf.get(x.id) ?? []).some(o => o.id !== t.id && o.source === 'banca'))

    /* Fra più candidate ne decide una sola cosa: che **quella data ce l'abbia
       già scritta**. È la fattura che si dichiarava pagata da questo movimento
       mentre il movimento guardava altrove — e allora il legame è l'unica cosa
       da spostare. Senza quel segno la scelta è un'ipotesi, e le ipotesi non si
       scrivono da sole. */
    const certa = cand.filter(c => c.paid_on === t.booked_on)
    const scelte = certa.length === 1 ? certa : cand
    if (scelte.length !== 1) {
      console.log(`  → ${scelte.length} candidate, nessuna porta già quella data: lasciata a mano`
        + (scelte.length ? ` (${scelte.map(c => c.number).join(', ')})` : ''))
      continue
    }
    const c = scelte[0]
    const giàGiusta = c.paid_on === t.booked_on
    console.log(`  → è la ${c.number} del ${c.issued_on}`
      + (giàGiusta
        ? ', che porta già quella data di pagamento: si sposta solo il legame'
        : `, che risulta pagata ${c.paid_on ?? 'mai'}: si sposta anche la data`))

    patch.push({
      path: `bank_transactions?id=eq.${t.id}`,
      body: JSON.stringify({ invoice_id: c.id }),
      detta: `movimento ${t.booked_on} → ${c.number}`,
    })
    if (!giàGiusta) {
      patch.push({
        path: `invoices?id=eq.${c.id}`,
        body: JSON.stringify({ paid_on: t.booked_on }),
        detta: `${c.number}: pagata il ${t.booked_on}`,
      })
    }
    /* La data sulla fattura sbagliata va tolta: era il fatto falso, non solo il
       legame. Una fattura non può essere stata pagata prima di esistere. */
    if (i.paid_on && i.paid_on < i.issued_on) {
      patch.push({
        path: `invoices?id=eq.${i.id}`,
        body: JSON.stringify({ paid_on: null }),
        detta: `${i.number}: tolta la data ${i.paid_on}, anteriore alla sua emissione`,
      })
    }
  }

  /* ── Da guardare: vero ma non certo ──────────────────────────────────────
     Una fattura pagata **prima di esistere** mentre una più vecchia dello stesso
     fornitore è ancora aperta. Che la data sia sbagliata è quasi sicuro; **quale
     sia la fattura giusta** non lo è — di solito è la più vecchia scoperta, ma è
     una regola di imputazione, non un fatto del documento. Si stampa e si lascia
     decidere: scriverla sarebbe mettere in archivio un'ipotesi con l'aria di un
     dato. */
  const dubbi = inv.filter(i => {
    if (!i.paid_on || i.paid_on >= i.issued_on) return false
    return inv.some(x =>
      x.id !== i.id
      && x.direction === i.direction
      && key(x.counterparty_name) === key(i.counterparty_name)
      && !x.paid_on
      && x.issued_on < i.issued_on)
  })
  if (dubbi.length) {
    console.log('\n── DA GUARDARE — pagata prima di esistere, con una più vecchia ancora aperta')
    for (const i of dubbi) {
      const aperte = inv
        .filter(x => x.direction === i.direction && key(x.counterparty_name) === key(i.counterparty_name)
          && !x.paid_on && x.issued_on < i.issued_on)
        .sort((a, b) => a.issued_on.localeCompare(b.issued_on))
      console.log(`  ${i.number} del ${i.issued_on} risulta pagata il ${i.paid_on}`
        + ` — ${-gg(i.issued_on, i.paid_on!)} giorni prima di essere emessa.`)
      console.log('    più vecchie ancora aperte: '
        + aperte.map(a => `${a.number} del ${a.issued_on}`).join(' · '))
      console.log('    quel pagamento è quasi certamente di una di queste, ma quale lo decidi tu.')
    }
  }

  console.log(`\n${patch.length} scritture:`)
  for (const p of patch) console.log(`  · ${p.detta}`)

  if (APPLY) {
    for (const p of patch) await api(p.path, { method: 'PATCH', body: p.body })
    console.log('\nScritto.\n')
  } else console.log('\nNiente scritto: rilancia con --apply.\n')
}

main().catch(e => { console.error(e.message); process.exit(1) })
