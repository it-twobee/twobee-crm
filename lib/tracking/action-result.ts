import { errorMessage, isTrackingError } from './errors'

/**
 * Le action del modulo Tracking rispondono con un risultato, non con un throw:
 * in produzione Next maschera il messaggio di un errore lanciato da una server
 * action, e qui i messaggi sono la sostanza («Pixel ID non valido», «manca il
 * service account»). La UI legge `ok` e mostra `error` così com'è.
 */
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number }

export async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (e) {
    const status = isTrackingError(e) ? e.status : 500
    if (status >= 500) console.error('[tracking]', e)
    return { ok: false, error: errorMessage(e), status }
  }
}
