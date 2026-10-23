import { redirect } from 'next/navigation'
import { Check, X, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile, getSessionUser } from '@/lib/auth'
import { puoUsareIlConnettore } from '@/lib/mcp/accesso'
import { autorizzaClaude, rifiutaClaude } from '@/app/actions/oauth-consent'
import { Logo } from '@/components/shared/Logo'

/* §493 — «Autorizza Claude». Supabase Auth (server OAuth 2.1) manda qui chi
   collega il connettore, con un `authorization_id`. Chi non ha fatto login
   passa dal login e torna qui (`portalLoginDestination`). */
export const dynamic = 'force-dynamic'

const PUO = [
  'leggere task, progetti, workstream, milestone, clienti e team',
  'creare e modificare task, milestone, workstream e progetti',
]
const NON_PUO = [
  'eliminare qualcosa',
  'vedere quello che nel gestionale non vedi tu',
]

export default async function ConsensoClaude({ searchParams }: { searchParams: { authorization_id?: string; errore?: string } }) {
  const id = searchParams.authorization_id
  const valido = !!id && /^[A-Za-z0-9_-]{1,200}$/.test(id)
  if (!valido) return <Riquadro titolo="Richiesta non valida" testo="Manca il codice dell'autorizzazione. Ricollega il connettore da Claude." />

  const user = await getSessionUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(`/oauth/consent?authorization_id=${id}`)}`)
  const profile = await getSessionProfile()

  if (!puoUsareIlConnettore(profile)) {
    return (
      <Riquadro titolo="Connettore riservato allo staff" testo="Il connettore di Claude è per lo staff interno di TwoBee. Il tuo account non può collegarlo.">
        <form action={rifiutaClaude}>
          <input type="hidden" name="authorization_id" value={id} />
          <button type="submit" className="w-full mt-6 bg-surface-active text-text-primary font-semibold py-3 rounded-xl hover:bg-surface-hover transition-colors">
            Torna a Claude
          </button>
        </form>
      </Riquadro>
    )
  }

  const sb = await createClient()
  const { data, error } = await sb.auth.oauth.getAuthorizationDetails(id)
  if (error || !data) {
    return <Riquadro titolo="Richiesta scaduta" testo="Questa autorizzazione non è più valida. Ricollega il connettore da Claude e riprova." />
  }
  // già autorizzato in passato: Supabase risponde direttamente con il ritorno
  if ('redirect_url' in data) redirect(data.redirect_url)

  const cliente = data.client?.name || 'Claude'
  return (
    <Riquadro titolo={`Collegare ${cliente} al gestionale?`}
      testo={`${cliente} entrerà come ${profile?.full_name ?? data.user.email} (${data.user.email}), con i tuoi permessi.`}>
      {searchParams.errore && (
        <p role="alert" className="mt-4 text-sm text-error bg-error-dim rounded-xl px-3 py-2">
          Non è andata: riprova, o ricollega il connettore da Claude.
        </p>
      )}
      <div className="mt-6 space-y-4 text-left">
        <Elenco titolo="Potrà" voci={PUO} Icona={Check} tono="text-success" />
        <Elenco titolo="Non potrà" voci={NON_PUO} Icona={X} tono="text-error" />
        <p className="flex items-start gap-2 text-sm text-text-secondary">
          <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-gold-text" aria-hidden />
          Prima di ogni modifica Claude ti chiede il permesso. Puoi scollegarlo quando vuoi dai connettori di Claude.
        </p>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <form action={rifiutaClaude}>
          <input type="hidden" name="authorization_id" value={id} />
          <button type="submit" className="w-full bg-surface-active text-text-primary font-semibold py-3 rounded-xl hover:bg-surface-hover transition-colors">
            Annulla
          </button>
        </form>
        <form action={autorizzaClaude}>
          <input type="hidden" name="authorization_id" value={id} />
          <button type="submit" className="w-full gold-gradient text-on-gold font-bold py-3 rounded-xl hover:brightness-110 transition-all">
            Autorizza
          </button>
        </form>
      </div>
    </Riquadro>
  )
}

function Riquadro({ titolo, testo, children }: { titolo: string; testo: string; children?: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <h1 className="mb-2 flex justify-center">
            <Logo className="h-12" priority />
            <span className="sr-only">TwoBee</span>
          </h1>
        </div>
        <div className="glass-strong rounded-3xl p-8 shadow-pop animate-scale-in text-center">
          <h2 className="text-xl font-bold font-heading text-text-primary">{titolo}</h2>
          <p className="text-sm text-text-secondary mt-2">{testo}</p>
          {children}
        </div>
      </div>
    </div>
  )
}

function Elenco({ titolo, voci, Icona, tono }: { titolo: string; voci: string[]; Icona: typeof Check; tono: string }) {
  return (
    <div>
      <p className="text-2xs font-semibold uppercase tracking-wide text-text-tertiary mb-1.5">{titolo}</p>
      <ul className="space-y-1">
        {voci.map(v => (
          <li key={v} className="flex items-start gap-2 text-sm text-text-primary">
            <Icona className={`w-4 h-4 mt-0.5 shrink-0 ${tono}`} aria-hidden />{v}
          </li>
        ))}
      </ul>
    </div>
  )
}
