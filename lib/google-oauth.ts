export const GOOGLE_OAUTH_COOKIE = 'twobee_google_oauth'

export function googleReturnTo(value: string | null | undefined) {
  return ['/commerciale', '/workspace/commerciale', '/calendario', '/workspace/calendario', '/impostazioni/profilo'].includes(value ?? '')
    ? value! : '/workspace/calendario'
}

export function readGoogleOAuthCookie(value: string | undefined): { userId: string; state: string; returnTo: string } | null {
  try {
    const parsed = JSON.parse(value ?? '')
    if (typeof parsed.userId !== 'string' || typeof parsed.state !== 'string' || !/^[a-f0-9]{64}$/.test(parsed.state)) return null
    return { userId: parsed.userId, state: parsed.state, returnTo: googleReturnTo(parsed.returnTo) }
  } catch { return null }
}
