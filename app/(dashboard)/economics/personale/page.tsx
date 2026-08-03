import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PersonaleClient } from '@/components/payroll/PersonaleClient'
import { monthKey } from '@/lib/pl'
import {
  rowToParams, rowToPerson, rowToPayslip, rowToInvoice, rowToF24, rowToTfrMovement,
  rowsToIncentives,
} from '@/lib/payroll-map'
import { DEFAULT_PAYROLL_PARAMS } from '@/lib/payroll'

export const revalidate = 0

export default async function PersonalePage({ searchParams }: { searchParams: { m?: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const month = /^\d{4}-\d{2}-01$/.test(searchParams.m ?? '') ? searchParams.m! : monthKey(new Date())
  const year = Number(month.slice(0, 4))

  /* §184: il catalogo degli esoneri e l'aliquota IRES arrivano dal database.
     Se la 184 non è stata eseguita valgono i valori del motore, e la pagina
     continua a funzionare come per le altre migration. */
  const [{ data: people, error: setupErr }, { data: prm }, { data: monthRow }, { data: incentives }, { data: taxCfg }] =
    await Promise.all([
      supabase.from('hr_people').select('*').order('sort_order'),
      supabase.from('hr_payroll_params').select('*').eq('year', year).maybeSingle(),
      supabase.from('pl_months').select('id, status').eq('month', month).maybeSingle(),
      supabase.from('hr_incentives').select('*').order('sort_order'),
      supabase.from('tax_config').select('ires_pct').eq('id', true).maybeSingle(),
    ])
  const catalog = rowsToIncentives(incentives as Record<string, unknown>[] | null)

  const setupNeeded = setupErr?.code === '42P01' || setupErr?.code === 'PGRST205'

  /* La 184 non è stata eseguita: le colonne delle agevolazioni non esistono e
     scrivere su di esse fallirebbe. Meglio dirlo prima che mostrare campi che
     non salvano. */
  const incentivesMissing = !setupNeeded && !!people?.length
    && !('hired_on' in (people[0] as Record<string, unknown>))

  /* I documenti del mese, più tutti i cedolini dell'anno: il registro TFR ha
     bisogno dello storico, non solo del mese aperto. La 182 può non essere
     ancora stata eseguita: in quel caso si degrada a liste vuote. */
  const [{ data: slips }, { data: yearSlips }, { data: invoices }, { data: f24 }, { data: tfrMoves }, { data: revLines }] =
    await Promise.all([
      supabase.from('hr_payslips').select('*').eq('month', month),
      supabase.from('hr_payslips').select('*').gte('month', `${year}-01-01`).lte('month', `${year}-12-01`),
      supabase.from('hr_invoices').select('*').eq('month', month),
      supabase.from('hr_f24').select('*').eq('month', month).maybeSingle(),
      supabase.from('hr_tfr_movements').select('*'),
      monthRow
        ? supabase.from('pl_revenue_lines').select('amount_net').eq('month_id', monthRow.id)
        : Promise.resolve({ data: [] }),
    ])

  const ledgerMissing = !setupNeeded && !slips && !yearSlips

  return (
    <PersonaleClient
      month={month}
      setupNeeded={setupNeeded}
      ledgerMissing={ledgerMissing}
      incentivesMissing={incentivesMissing}
      monthExists={!!monthRow}
      monthLocked={monthRow?.status === 'chiuso'}
      monthRevenue={(revLines ?? []).reduce(
        (t: number, l: Record<string, unknown>) => t + Number(l.amount_net ?? 0), 0)}
      people={(people ?? []).map(r => rowToPerson(r as Record<string, unknown>))}
      params={prm
        ? rowToParams(prm as Record<string, unknown>, catalog)
        : { ...DEFAULT_PAYROLL_PARAMS, year, incentives: catalog }}
      iresPct={Number((taxCfg as { ires_pct?: number } | null)?.ires_pct ?? 0.24)}
      slips={(slips ?? []).map(r => rowToPayslip(r as Record<string, unknown>))}
      yearSlips={(yearSlips ?? []).map(r => rowToPayslip(r as Record<string, unknown>))}
      invoices={(invoices ?? []).map(r => rowToInvoice(r as Record<string, unknown>))}
      f24={f24 ? rowToF24(f24 as Record<string, unknown>) : null}
      tfrMoves={(tfrMoves ?? []).map(r => rowToTfrMovement(r as Record<string, unknown>))}
    />
  )
}
