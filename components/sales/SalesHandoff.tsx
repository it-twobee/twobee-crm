import { createClient } from '@/lib/supabase/server'
import type { Delivery } from '@/lib/sales'

export async function SalesHandoff({ projectId }: { projectId: string }) {
  const sb = await createClient()
  const { data, error } = await sb.from('sales_handoffs').select('deal_id,summary,proposal_ref,created_at')
    .eq('project_id', projectId).order('created_at')
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return null
    return <p role="alert" className="px-6 pt-4 text-sm text-warning">Riepilogo commerciale temporaneamente non disponibile.</p>
  }
  if (!data?.length) return null
  const labels: [keyof Delivery, string][] = [['goals', 'Obiettivi'], ['services', 'Servizi venduti'], ['included', 'Inclusioni'], ['excluded', 'Esclusioni'], ['promises', 'Promesse e dipendenze'], ['materials', 'Materiali necessari']]
  return <section className="mx-4 mt-4 rounded-xl border border-border bg-surface p-4 sm:mx-6">
    {data.map(row => <details key={row.deal_id} className="py-2"><summary className="cursor-pointer font-medium text-gold-text">Passaggio commerciale · {row.proposal_ref}</summary><dl className="mt-4 grid gap-4 sm:grid-cols-2">{labels.map(([key, label]) => <div key={key}><dt className="text-2xs text-text-tertiary">{label}</dt><dd className="whitespace-pre-wrap text-sm text-text-primary">{(row.summary as Delivery)[key]}</dd></div>)}</dl></details>)}
  </section>
}
