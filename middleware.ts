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
    '/task',
    '/chat',
    '/report',
    '/impostazioni',
    '/portale',
    '/risorsa',
    '/workspace',
    '/reparti',
    '/commerciale',
    '/fatturazione',
    '/hr',
    '/strategia',
  ]

  const isProtected = protectedPaths.some((p) => pathname.startsWith(p))

  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone()
    url.pathname = path
    return NextResponse.redirect(url)
  }

  if (!user && isProtected) return redirectTo('/login')

  // Routing per ruolo: client → /portale · workspace → /workspace · risorsa esterna → /risorsa · staff → /dashboard
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

    // Solo il super admin entra nel portale cliente per ispezionarlo: /portale
    // mostra i dati di un singolo cliente, non è una vista aggregata.
    if (isSuper && (pathname === '/portale' || pathname.startsWith('/portale/'))) {
      return supabaseResponse
    }

    // Admin/super_admin possono visitare /workspace senza restrizioni
    if (isAdminLevel && (pathname === '/workspace' || pathname.startsWith('/workspace/'))) {
      return supabaseResponse
    }

    // Distinzione risorsa esterna vs guest-cliente (solo per i guest)
    let isResource = false
    if (role === 'guest') {
      const { data: rp } = await supabase
        .from('resource_profiles').select('can_access_resource_portal').eq('profile_id', user.id).maybeSingle()
      isResource = !!rp?.can_access_resource_portal
    }

    const isClient = (role === 'client' || role === 'guest') && !isResource

    if (isResource) {
      // La risorsa vive solo nel proprio portale (+ onboarding e profilo)
      const allowedForResource =
        pathname === '/risorsa' ||
        pathname.startsWith('/risorsa/') ||
        pathname.startsWith('/onboarding') ||
        pathname === '/impostazioni/profilo'
      if (!allowedForResource && pathname !== '/risorsa') return redirectTo('/risorsa')
    } else if (isClient) {
      // Il cliente può accedere solo a /portale (+ onboarding e profilo)
      const allowedForClient =
        pathname === '/portale' ||
        pathname.startsWith('/portale/') ||
        pathname.startsWith('/onboarding') ||
        pathname === '/impostazioni/profilo'
      if (pathname.startsWith('/portale-cliente') || !allowedForClient) {
        if (pathname !== '/portale') return redirectTo('/portale')
      }
    } else {
      // Lo staff non usa la rotta cliente /portale
      if (pathname === '/portale' || pathname.startsWith('/portale/')) {
        return redirectTo('/dashboard')
      }
    }

    const home = isResource ? '/risorsa' : isClient ? '/portale' : '/dashboard'
    if (pathname === '/login' || pathname === '/') return redirectTo(home)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
