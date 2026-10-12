'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { QrCode } from 'lucide-react'
import { vcardDi } from '@/lib/sales-vcard'
import type { RigaCrm } from './CrmTable'

/**
 * Il QR è una vCard: la fotocamera del telefono propone «Aggiungi ai contatti».
 * Il colore è fisso nero su bianco perché un QR a colori di tema non si legge
 * in scuro: è l'eccezione ai token, come un codice a barre.
 */
export function QrContatto({ riga }: { riga: RigaCrm }) {
  const vcard = vcardDi({
    azienda: riga.company_name, persona: riga.contact_name, telefono: riga.contact_phone,
    email: riga.contact_email, sito: riga.website, indirizzo: riga.address,
  })
  const [svg, setSvg] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    setSvg(null)
    if (vcard) {
      QRCode.toString(vcard, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
        .then(s => { if (vivo) setSvg(s) })
        .catch(() => { if (vivo) setSvg(null) })
    }
    return () => { vivo = false }
  }, [vcard])

  if (!vcard) {
    return (
      <p className="flex items-center gap-2 px-3 py-2.5 border border-border rounded-xl text-2xs text-text-tertiary">
        <QrCode className="w-4 h-4 shrink-0" aria-hidden />
        QR contatto non disponibile: servono un nome e un telefono o un&apos;email.
      </p>
    )
  }

  return (
    <section className="flex items-center gap-4 px-3 py-3 border border-border rounded-xl">
      <div
        role="img"
        aria-label={`QR code per salvare ${String(riga.contact_name || riga.company_name || 'il contatto')} in rubrica`}
        className="w-28 h-28 shrink-0 rounded-lg bg-white p-1 [&>svg]:w-full [&>svg]:h-full"
        dangerouslySetInnerHTML={{ __html: svg ?? '' }}
      />
      <div className="min-w-0 text-2xs text-text-secondary space-y-1">
        <p className="font-semibold text-text-primary text-xs">Salva in rubrica</p>
        <p>Inquadra con la fotocamera del telefono e scegli «Aggiungi ai contatti».</p>
      </div>
    </section>
  )
}
