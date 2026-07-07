import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

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

  const protectedPaths = [
    '/dashboard',
    '/clienti',
    '/task',
    '/chat',
    '/report',
    '/impostazioni',
    '/portale',
    '/risorsa',
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

  // Routing per ruolo: i clienti vivono solo nel proprio portale
  if (user) {
    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    const isClient = profile?.role === 'client' || profile?.role === 'guest'
    const home = isClient ? '/portale' : '/dashboard'

    if (isClient) {
      // Il cliente può accedere solo a /portale (+ onboarding e profilo)
      const allowedForClient =
        pathname === '/portale' ||
        pathname.startsWith('/portale/') ||
        pathname.startsWith('/onboarding') ||
        pathname === '/impostazioni/profilo'
      // /portale-cliente è la PREVIEW admin: vietata ai clienti
      if (pathname.startsWith('/portale-cliente') || !allowedForClient) {
        if (pathname !== '/portale') return redirectTo('/portale')
      }
    } else {
      // Lo staff non usa la rotta cliente /portale
      if (pathname === '/portale' || pathname.startsWith('/portale/')) {
        return redirectTo('/dashboard')
      }
    }

    if (pathname === '/login' || pathname === '/') return redirectTo(home)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
