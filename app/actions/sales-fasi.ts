'use server'

/**
 * §425 — l'editor delle fasi commerciali, dal lato del server.
 *
 * Le fasi sono diventate dati (§424) e questa è la porta da cui si cambiano.
 * Tre cose la tengono in piedi, e nessuna è una cautela di troppo:
 *
 * - **la validazione è la stessa del gate.** `problemiFasi` gira qui e gira in
 *   `lib/sales-stages.check.ts`: se le regole fossero scritte due volte, la
 *   seconda volta sarebbero due regole diverse e quella che conta sarebbe
 *   sempre l'altra. Non ci si fida di quello che dice il browser — un file
 *   `'use server'` esporta un endpoint (§329) e chi ha il codice davanti sa
 *   come chiamarlo senza passare dalla schermata;
 *
 * - **una fase con delle righe sopra non si cancella.** Lo impedisce già la
 *   chiave esterna (`ON DELETE RESTRICT`), ma un vincolo che scatta dà un
 *   messaggio da database: qui si conta prima e si dice **quante** righe ci
 *   sono e dove spostarle. Chi vuole solo smettere di usarla la **ritira** —
 *   resta leggibile sulle righe vecchie e sparisce dalle scelte;
 *
 * - **rinominare una chiave non spezza niente**, perché la chiave esterna è
 *   `ON UPDATE CASCADE`: le righe seguono. È l'unica ragione per cui si può
 *   permettere di cambiarla invece di congelarla per sempre.
 */

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireSalesConfig } from '@/lib/sales-guard'
import { problemiFasi, type Fase } from '@/lib/sales-stages'

export type EsitoFasi = { ok: true } | { ok: false; errori: string[] }

const CHIAVE = /^[a-z][a-z0-9_]{1,40}$/

function rinfresca() {
  for (const p of ['/commerciale', '/workspace/commerciale', '/impostazioni/commerciale']) revalidatePath(p)
}

/**
 * Salva l'elenco intero: è una forma, non otto righe indipendenti.
 *
 * L'ordine, i colori vicini e i ruoli si giudicano **insieme** — «una sola fase
 * vinta» non è una proprietà di una riga — quindi salvare una alla volta
 * vorrebbe dire passare da stati intermedi non validi, e il primo che si ferma
 * a metà lascia il percorso senza porta d'ingresso.
 */
export async function salvaFasi(fasi: Fase[]): Promise<EsitoFasi> {
  try {
    await requireSalesConfig()

    const puliti: Fase[] = (Array.isArray(fasi) ? fasi : []).map((f, i) => ({
      chiave: String(f?.chiave ?? '').trim(),
      etichetta: String(f?.etichetta ?? '').trim(),
      ruolo: f?.ruolo,
      tinta: f?.tinta,
      ordine: Number.isFinite(f?.ordine) ? Number(f.ordine) : (i + 1) * 10,
      attiva: f?.attiva !== false,
      descrizione: f?.descrizione ? String(f.descrizione).slice(0, 200) : null,
    })) as Fase[]

    const formali = puliti
      .filter(f => !CHIAVE.test(f.chiave))
      .map(f => `«${f.etichetta || f.chiave}» ha una chiave non valida: minuscole, numeri e trattino basso.`)
    const errori = [...formali, ...problemiFasi(puliti)]
    if (errori.length) return { ok: false, errori }

    const admin = createAdminClient()
    const { data: esistenti } = await admin.from('sales_stages').select('chiave')
    const prima = new Set(((esistenti ?? []) as { chiave: string }[]).map(x => x.chiave))
    const dopo = new Set(puliti.map(f => f.chiave))

    /* Quelle sparite dall'elenco: si cancellano solo se non le usa nessuno.
       Il conteggio si fa qui e non si aspetta il vincolo, perché «violates
       foreign key constraint» non dice a chi legge cosa deve fare. */
    const sparite = Array.from(prima).filter(k => !dopo.has(k))
    if (sparite.length) {
      const { data: usate } = await admin.from('deals').select('stage').in('stage', sparite)
      const conta = new Map<string, number>()
      for (const r of (usate ?? []) as { stage: string }[]) conta.set(r.stage, (conta.get(r.stage) ?? 0) + 1)
      const bloccate = Array.from(conta.entries())
      if (bloccate.length) {
        return {
          ok: false,
          errori: bloccate.map(([k, n]) =>
            `La fase «${k}» ha ancora ${n} ${n === 1 ? 'trattativa' : 'trattative'}: spostale altrove, oppure ritirala invece di eliminarla.`),
        }
      }
      const { error } = await admin.from('sales_stages').delete().in('chiave', sparite)
      if (error) return { ok: false, errori: [error.message] }
    }

    /* `upsert` e non update: la riga nuova nasce e la vecchia cambia con la
       stessa chiamata. L'ordine arriva già rinumerato a decine da chi chiama —
       il vincolo sull'ordine è differito, quindi uno scambio non si rompe a
       metà transazione. */
    const { error } = await admin.from('sales_stages').upsert(
      puliti.map(f => ({ ...f, updated_at: new Date().toISOString() })),
      { onConflict: 'chiave' },
    )
    if (error) return { ok: false, errori: [error.message] }

    rinfresca()
    return { ok: true }
  } catch (e) {
    console.error('[fasi commerciali]', e)
    return { ok: false, errori: [(e as Error).message] }
  }
}
