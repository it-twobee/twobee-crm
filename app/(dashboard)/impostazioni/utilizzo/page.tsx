import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasUsageAccess } from '@/lib/presenza-guard'
import {
  componiUtilizzo, ordinaPerPresenza, modificheParziali, SESSIONI_MOSTRATE,
  type SessioneRow, type TotaliRow,
} from '@/lib/presenza'
import { UtilizzoClient, type RigaUtilizzo } from '@/components/impostazioni/UtilizzoClient'
import type { AppRole } from '@/lib/types/database'

export const revalidate = 0

const GIORNI_AMMESSI = [7, 30, 90] as const

export default async function UtilizzoPage({
  searchParams,
}: {
  searchParams: Promise<{ giorni?: string }>
}) {
  // Il gate non è la voce di menu: `os_sessions` si legge col service role, e
  // il service role bypassa la RLS. L'unica barriera è questa riga.
  if (!(await hasUsageAccess())) redirect('/dashboard')

  const richiesti = Number((await searchParams).giorni)
  const giorni = (GIORNI_AMMESSI as readonly number[]).includes(richiesti) ? richiesti : 30
  const da = new Date(Date.now() - giorni * 86_400_000).toISOString()

  const admin = createAdminClient()
  const [profiliRes, sessioniRes, totaliRes, primaRes, configRes] = await Promise.all([
    admin.from('profiles')
      .select('id, full_name, email, app_role, avatar_url, is_active, created_at')
      .order('full_name'),
    admin.rpc('ultime_sessioni', { p_quante: SESSIONI_MOSTRATE }),
    admin.rpc('presenza_totali', { p_da: da }),
    /* Da quando esiste questa misura: la prima sessione mai registrata. Senza
       questa data una riga vuota direbbe «mai entrato» di qualcuno che non è
       ancora stato guardato — e un'assenza dichiarata vale più di uno zero. */
    admin.from('os_sessions').select('started_at').order('started_at', { ascending: true }).limit(1),
    /* Quanto indietro arriva la cronologia: oltre la conservazione non c'è
       «zero modifiche», non c'è niente. */
    admin.from('activity_config').select('retention_days').maybeSingle()
      .then(r => (r.error ? { data: null } : r)),
  ])

  type ProfiloRiga = {
    id: string; full_name: string | null; email: string | null
    app_role: AppRole | null; avatar_url: string | null; is_active: boolean | null; created_at: string
  }

  /* Le persone, non gli account del portale: la domanda è «chi lavora nel
     tool», e un cliente che apre il suo spazio non è una risorsa nostra. Il
     battito nel portale cliente non è nemmeno montato, quindi qui non ci
     sarebbe niente da mostrare: la riga direbbe «mai entrato» di qualcuno che
     non stiamo misurando, ed è il tipo di zero che sembra un dato. */
  const profili = ((profiliRes.data ?? []) as ProfiloRiga[])
    .filter(p => p.app_role !== 'client' && p.app_role !== 'guest')

  const sessioni = (sessioniRes.data ?? []) as SessioneRow[]
  const totali = (totaliRes.data ?? []) as TotaliRow[]

  const utilizzo = componiUtilizzo(profili.map(p => p.id), sessioni, totali, Date.now())
  const perId = new Map(utilizzo.map(u => [u.profileId, u]))

  const righe: RigaUtilizzo[] = profili
    .map(p => ({
      ...perId.get(p.id)!,
      nome: p.full_name || p.email || 'Senza nome',
      email: p.email ?? '',
      ruolo: (p.app_role ?? 'viewer') as AppRole,
      avatar: p.avatar_url,
      attivo: p.is_active !== false,
      creato: p.created_at,
    }))
    .sort(ordinaPerPresenza)

  const misuraDa = ((primaRes.data ?? []) as { started_at: string }[])[0]?.started_at ?? null
  const retentionGiorni = (configRes.data as { retention_days: number } | null)?.retention_days ?? 0

  return (
    <div className="p-4 sm:p-6">
      <UtilizzoClient
        righe={righe}
        giorni={giorni}
        opzioniGiorni={[...GIORNI_AMMESSI]}
        misuraDa={misuraDa}
        retentionGiorni={retentionGiorni}
        /* calcolata qui: `Date.now()` dentro il componente darebbe due risposte
           diverse fra server e browser, e React se ne lamenta in idratazione */
        modificheParziali={modificheParziali(da, retentionGiorni, Date.now())}
      />
    </div>
  )
}
