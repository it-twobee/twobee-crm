import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isWorkspaceRole, isAdminRole, isSuperAdminRaw } from '@/lib/permissions'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

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
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  // Le rotte API gestiscono da sole l'autenticazione: non devono passare dal
  // routing per ruolo, altrimenti un utente workspace verrebbe reindirizzato a
  // /workspace anche quando chiama /api/google/* (collegamento ed eventi).
  if (pathname.startsWith('/api/')) return supabaseResponse

  const protectedPaths = [
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

  const isProtected = protectedPaths.some((p) => pathname.startsWith(p))

  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone()
    url.pathname = path
    return NextResponse.redirect(url)
  }

  if (!user && isProtected) return redirectTo('/login')

  // Routing per ruolo: workspace → /workspace · staff → /dashboard · client/guest → solo profilo
  if (user) {
    const { data: profile } = await supabase
      .from('profiles').select('role, app_role, email').eq('id', user.id).single()
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
      if (pathname === '/login' || pathname === '/') return redirectTo('/workspace')
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

    if (pathname === '/login' || pathname === '/') return redirectTo('/dashboard')
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
