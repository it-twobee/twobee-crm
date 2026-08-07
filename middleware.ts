import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isWorkspaceRole, isAdminRole, isSuperAdminRaw } from '@/lib/permissions'

/**
 * Il middleware gira su **ogni** navigazione e su ogni prefetch che Next fa per
 * i link visibili: quello che costa qui si paga decine di volte per pagina.
 * Faceva due andate e ritorni in fila — il server di auth per verificare il
 * token, poi il database per leggere il ruolo — prima ancora che la pagina
 * iniziasse a comporsi.
 *
 * La riga del ruolo cambia forse una volta al mese, quindi si tiene in memoria
 * per mezzo minuto. Il rischio è dichiarato: chi viene retrocesso conserva il
 * vecchio instradamento fino a 30 secondi. Per questo il gate non è solo qui —
 * il layout della dashboard rilegge il ruolo dal database senza cache, ed è lì
 * che un utente workspace viene rimandato indietro.
 */
const ROLE_TTL_MS = 30_000
const ROLE_CACHE_MAX = 500
type CachedRole = { role?: string | null; app_role?: string | null; email?: string | null; at: number }
const roleCache = new Map<string, CachedRole>()

function readRole(userId: string): CachedRole | null {
  const hit = roleCache.get(userId)
  if (!hit) return null
  if (Date.now() - hit.at > ROLE_TTL_MS) { roleCache.delete(userId); return null }
  return hit
}

function writeRole(userId: string, row: Omit<CachedRole, 'at'>) {
  // Mappa in memoria di un processo che vive a lungo: senza un tetto cresce
  // con ogni utente che è passato di qui. La prima chiave è la più vecchia.
  if (roleCache.size >= ROLE_CACHE_MAX) {
    const oldest = roleCache.keys().next().value
    if (oldest) roleCache.delete(oldest)
  }
  roleCache.set(userId, { ...row, at: Date.now() })
}

const PROTECTED_PATHS = [
  '/dashboard',
  '/clienti',
  '/customer-care',
  '/calendario',
  '/documenti',
  '/chat',
  '/impostazioni',
  '/workspace',
  '/hr',
  '/feedback',
]

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Il percorso viaggia in un header perché i layout non lo conoscono: quello
  // della dashboard deve poter lasciar passare /impostazioni/profilo, che la
  // sidebar del workspace linka, e fermare tutto il resto.
  const forward = () => {
    const headers = new Headers(request.headers)
    headers.set('x-pathname', pathname)
    return NextResponse.next({ request: { headers } })
  }

  // Le rotte API gestiscono da sole l'autenticazione: non devono passare dal
  // routing per ruolo, altrimenti un utente workspace verrebbe reindirizzato a
  // /workspace anche quando chiama /api/google/* (collegamento ed eventi).
  // Il controllo sta **prima** di getUser: una chiamata API non deve pagare la
  // verifica del token due volte, una qui e una nella rotta.
  if (pathname.startsWith('/api/')) return forward()

  const isProtected = PROTECTED_PATHS.some((p) => pathname.startsWith(p))
  const isEntryPoint = pathname === '/login' || pathname === '/'

  let supabaseResponse = forward()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Parameters<typeof supabaseResponse.cookies.set>[2] }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          // `forward()` ricostruisce gli header da `request`, che qui ha già i
          // cookie nuovi: il token appena rinnovato arriva alla pagina.
          supabaseResponse = forward()
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone()
    url.pathname = path
    return NextResponse.redirect(url)
  }

  if (!user) return isProtected ? redirectTo('/login') : supabaseResponse

  // Il ruolo serve solo dove c'è una decisione da prendere: rotte protette e
  // porte d'ingresso. Su tutto il resto la query non cambierebbe la risposta.
  if (!isProtected && !isEntryPoint) return supabaseResponse

  // Routing per ruolo: workspace → /workspace · staff → /dashboard · client/guest → solo profilo
  let profile = readRole(user.id)
  if (!profile) {
    const { data } = await supabase
      .from('profiles').select('role, app_role, email').eq('id', user.id).single()
    profile = { ...(data ?? {}), at: Date.now() }
    if (data) writeRole(user.id, data)
  }

  const role = profile?.role
  const appRole = profile?.app_role

  const isSuper = isSuperAdminRaw(profile?.email, appRole)
  const isAdminLevel = isSuper || role === 'admin' || isAdminRole(appRole)
  // Confinato a /workspace: chiunque sia staff non-admin. Non basta guardare
  // WORKSPACE_ROLES (manager…partner): un `viewer`, o un legacy con role='team'
  // e app_role fuori lista, altrimenti raggiungerebbe il tool admin completo.
  const isWorkspace = !isAdminLevel && (isWorkspaceRole(appRole) || role === 'team')

  if (isWorkspace) {
    const allowedForWorkspace =
      pathname === '/workspace' ||
      pathname.startsWith('/workspace/') ||
      pathname.startsWith('/onboarding') ||
      pathname === '/impostazioni/profilo'
    if (!allowedForWorkspace) return redirectTo('/workspace')
    if (isEntryPoint) return redirectTo('/workspace')
    return supabaseResponse
  }

  // Admin/super_admin possono visitare /workspace senza restrizioni
  if (isAdminLevel && (pathname === '/workspace' || pathname.startsWith('/workspace/'))) {
    return supabaseResponse
  }

  // Portale cliente e portale risorsa sono stati demoliti insieme al flusso
  // progetto: finché non vengono ricostruiti, client/guest vedono solo il
  // proprio profilo. Nessun redirect verso rotte inesistenti.
  const isPortalUser = role === 'client' || role === 'guest'
  if (isPortalUser) {
    const allowed =
      pathname === '/impostazioni/profilo' ||
      pathname.startsWith('/onboarding')
    if (!allowed) return redirectTo('/impostazioni/profilo')
    return supabaseResponse
  }

  if (isEntryPoint) return redirectTo('/dashboard')

  return supabaseResponse
}

export const config = {
  matcher: [
    // Fuori: gli asset serviti dal filesystem. Ognuno che entrava qui pagava
    // una verifica del token per un file che non ha sessione.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff|woff2|ttf|otf|txt|xml|webmanifest|mp4|webm|pdf)$).*)',
  ],
}
