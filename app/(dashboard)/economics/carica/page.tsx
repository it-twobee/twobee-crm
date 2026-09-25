import { createClient } from '@/lib/supabase/server'
import { CaricaClient, type Fonte, type Persona } from '@/components/economics/CaricaClient'
import { daQuanto, type Conto } from '@/lib/carica'

export const revalidate = 0

const meseIt = (m: string) => new Date(`${m.slice(0, 7)}-15`).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })

/**
 * §449 — la pagina unica di caricamento. Il gate è quello del layout di
 * `economics/` (`hasEconomicsAccess`), e ogni import ripassa dal suo
 * `requireEconomicsAdmin`: la pagina non apre porte nuove, le mette in fila.
 *
 * §450 — sopra, da quando non arriva ogni fonte: è la domanda «cosa devo
 * caricare?», e ha una risposta per conto, per fatture e per personale.
 */
export default async function CaricaPage() {
  const supabase = await createClient()
  const oggi = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' })

  const conAiban = await supabase.from('bank_accounts').select('id, label, bank_name, is_primary, iban').eq('is_active', true).order('is_primary', { ascending: false })
  const conti = (conAiban.error
    ? (await supabase.from('bank_accounts').select('id, label, bank_name, is_primary').eq('is_active', true).order('is_primary', { ascending: false })).data
    : conAiban.data) ?? []

  const ultimo = async (q: PromiseLike<{ data: unknown }>, campo: string) => {
    const { data } = await q
    const r = (data as Record<string, unknown>[] | null)?.[0]
    return r?.[campo] ? String(r[campo]).slice(0, 10) : null
  }
  const [perConto, emessa, ricevuta, cedolino, f24, persone] = await Promise.all([
    Promise.all(conti.map(c => ultimo(supabase.from('bank_transactions').select('booked_on').eq('account_id', c.id).eq('source', 'banca').order('booked_on', { ascending: false }).limit(1), 'booked_on'))),
    ultimo(supabase.from('invoices').select('issued_on').eq('direction', 'emessa').order('issued_on', { ascending: false }).limit(1), 'issued_on'),
    ultimo(supabase.from('invoices').select('issued_on').eq('direction', 'ricevuta').order('issued_on', { ascending: false }).limit(1), 'issued_on'),
    ultimo(supabase.from('hr_payslips').select('month').order('month', { ascending: false }).limit(1), 'month'),
    supabase.from('f24_documents').select('due_date, paid_on').order('due_date', { ascending: false }).limit(12),
    supabase.from('hr_people').select('id, full_name').eq('is_active', true).order('full_name'),
  ])

  const giorni = (d: string | null, soglia: number) => {
    const q = daQuanto(d, oggi)
    return { quando: d ? `${d.split('-').reverse().join('/')} · ${q.testo}` : 'mai', vecchio: q.giorni === null || q.giorni > soglia }
  }
  /* il cedolino di un mese arriva nei primi giorni del successivo: a settembre si aspetta agosto */
  const [a, m] = oggi.split('-').map(Number)
  const atteso = `${m === 1 ? a - 1 : a}-${String(m === 1 ? 12 : m - 1).padStart(2, '0')}-01`
  const docs = (f24.data ?? []) as { due_date: string; paid_on: string | null }[]
  const scoperti = docs.filter(d => !d.paid_on && d.due_date < oggi).length

  const fonti: Fonte[] = [
    ...conti.map((c, i) => ({ id: `c-${c.id}`, gruppo: 'banca' as const, etichetta: c.label, ...giorni(perConto[i], 7) })),
    { id: 'fe', gruppo: 'fatture', etichetta: 'Emesse', ...giorni(emessa, 35) },
    { id: 'fr', gruppo: 'fatture', etichetta: 'Ricevute', ...giorni(ricevuta, 35) },
    { id: 'ced', gruppo: 'personale', etichetta: 'Cedolini', quando: cedolino ? meseIt(cedolino) : 'mai', vecchio: !cedolino || cedolino < atteso },
    {
      id: 'f24', gruppo: 'personale', etichetta: 'F24',
      quando: docs[0] ? `${docs[0].due_date.split('-').reverse().join('/')} · ${docs[0].paid_on ? 'versato' : 'da versare'}${scoperti ? ` · ${scoperti} scaduti senza addebito` : ''}` : 'mai',
      vecchio: !docs[0] || scoperti > 0,
    },
  ]

  return <CaricaClient conti={conti as Conto[]} persone={(persone.data ?? []) as Persona[]} fonti={fonti} />
}
