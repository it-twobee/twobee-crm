import { createHmac, timingSafeEqual } from 'node:crypto'
import type { EconomicsReport } from '@/lib/lab-economics-report'

const signature = (payload: string, secret: string) => createHmac('sha256', secret).update(`lab-economics-pdf\n${payload}`).digest('hex')
export function signEconomicsReport(report: EconomicsReport, userId: string, secret: string) {
  if (!secret) throw new Error('Esportazione non disponibile')
  const payload = JSON.stringify({ userId, report })
  return { payload, signature: signature(payload, secret) }
}
export function readEconomicsReport(payload: string, token: string, userId: string, secret: string, now: number): EconomicsReport | null {
  if (!secret || payload.length > 1000000 || !/^[a-f0-9]{64}$/.test(token)) return null
  const actual = signature(payload, secret)
  if (!timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(actual, 'hex'))) return null
  try {
    const signed = JSON.parse(payload)
    const observed = Date.parse(signed.report.observedAt)
    if (signed.userId !== userId || signed.report.version !== 'lab-economics-v1' || !Number.isFinite(observed)
      || now < observed || now - observed > 15 * 60 * 1000) return null
    return signed.report
  } catch { return null }
}
