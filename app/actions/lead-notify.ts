'use server'

// Invio SMS opzionale all'arrivo di un nuovo lead.
// No-op sicuro se le variabili Twilio non sono configurate — le notifiche
// in-app restano comunque garantite dal trigger DB (migration 062).

export interface LeadSmsPayload {
  name: string
  company?: string | null
  source: string
  phone?: string | null
}

export async function sendLeadSms(lead: LeadSmsPayload): Promise<{ sent: boolean; reason?: string }> {
  const sid   = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from  = process.env.TWILIO_FROM
  const to    = process.env.LEAD_SMS_TO

  if (!sid || !token || !from || !to) return { sent: false, reason: 'sms_non_configurato' }

  const body = `🐝 Nuovo lead: ${lead.name}${lead.company ? ` (${lead.company})` : ''} — via ${lead.source}`

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    })
    if (!res.ok) {
      console.error('[lead-sms] Twilio error', res.status, await res.text())
      return { sent: false, reason: 'twilio_error' }
    }
    return { sent: true }
  } catch (e) {
    console.error('[lead-sms] throw', e)
    return { sent: false, reason: 'network_error' }
  }
}
