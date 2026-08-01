import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PersonaleClient } from '@/components/payroll/PersonaleClient'
import { monthKey } from '@/lib/pl'
import {
  rowToParams, rowToPerson, rowToPayslip, rowToInvoice, rowToF24, rowToTfrMovement,
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

  const [{ data: people, error: setupErr }, { data: prm }, { data: monthRow }] = await Promise.all([
    supabase.from('hr_people').select('*').order('sort_order'),
    supabase.from('hr_payroll_params').select('*').eq('year', year).maybeSingle(),
    supabase.from('pl_months').select('id, status').eq('month', month).maybeSingle(),
  ])

  const setupNeeded = setupErr?.code === '42P01' || setupErr?.code === 'PGRST205'

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
      monthExists={!!monthRow}
      monthLocked={monthRow?.status === 'chiuso'}
      monthRevenue={(revLines ?? []).reduce(
        (t: number, l: Record<string, unknown>) => t + Number(l.amount_net ?? 0), 0)}
      people={(people ?? []).map(r => rowToPerson(r as Record<string, unknown>))}
      params={prm ? rowToParams(prm as Record<string, unknown>) : { ...DEFAULT_PAYROLL_PARAMS, year }}
      slips={(slips ?? []).map(r => rowToPayslip(r as Record<string, unknown>))}
      yearSlips={(yearSlips ?? []).map(r => rowToPayslip(r as Record<string, unknown>))}
      invoices={(invoices ?? []).map(r => rowToInvoice(r as Record<string, unknown>))}
      f24={f24 ? rowToF24(f24 as Record<string, unknown>) : null}
      tfrMoves={(tfrMoves ?? []).map(r => rowToTfrMovement(r as Record<string, unknown>))}
    />
  )
}
