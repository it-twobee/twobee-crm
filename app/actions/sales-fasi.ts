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
import { problemiMotivi, rinumera, type Motivo } from '@/lib/sales-motivi'
import { TABELLA, eLista, problemiDi, type Lista, type Voce } from '@/lib/sales-scelte'
import { opzioniDa, problemiCampi, type Campo } from '@/lib/sales-campi'

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

/**
 * §435 — i motivi del perso, salvati insieme come le fasi.
 *
 * La differenza che conta è nella cancellazione: la chiave esterna dei motivi è
 * `ON DELETE SET NULL`, quindi il database **non** fermerebbe l'eliminazione di
 * un motivo usato — la farebbe passare e svuoterebbe il motivo su ogni perso
 * che lo aveva. Il conteggio qui non è un messaggio più gentile, come per le
 * fasi: è l'unica barriera.
 */
export async function salvaMotivi(motivi: Motivo[]): Promise<EsitoFasi> {
  try {
    await requireSalesConfig()

    const puliti: Motivo[] = rinumera((Array.isArray(motivi) ? motivi : []).map(m => ({
      chiave: String(m?.chiave ?? '').trim(),
      etichetta: String(m?.etichetta ?? '').trim(),
      ordine: 0,
      attivo: m?.attivo !== false,
    })))
    const errori = problemiMotivi(puliti)
    if (errori.length) return { ok: false, errori }

    const admin = createAdminClient()
    const { data: esistenti } = await admin.from('sales_motivi_perso').select('chiave')
    const dopo = new Set(puliti.map(m => m.chiave))
    const sparite = ((esistenti ?? []) as { chiave: string }[]).map(x => x.chiave).filter(k => !dopo.has(k))
    if (sparite.length) {
      const { data: usate } = await admin.from('deals').select('motivo_perso').in('motivo_perso', sparite)
      const conta = new Map<string, number>()
      for (const r of (usate ?? []) as { motivo_perso: string }[]) conta.set(r.motivo_perso, (conta.get(r.motivo_perso) ?? 0) + 1)
      if (conta.size) {
        return {
          ok: false,
          errori: Array.from(conta.entries()).map(([k, n]) =>
            `Il motivo «${k}» è su ${n} ${n === 1 ? 'lead perso' : 'lead persi'}: ritiralo invece di eliminarlo, o resterebbero senza motivo.`),
        }
      }
      const { error } = await admin.from('sales_motivi_perso').delete().in('chiave', sparite)
      if (error) return { ok: false, errori: [error.message] }
    }

    const { error } = await admin.from('sales_motivi_perso').upsert(puliti, { onConflict: 'chiave' })
    if (error) return { ok: false, errori: [error.message] }

    rinfresca()
    return { ok: true }
  } catch (e) {
    console.error('[motivi del perso]', e)
    return { ok: false, errori: [(e as Error).message] }
  }
}

/**
 * §436 — priorità e membership. Lo stesso salvataggio dei motivi, con una
 * differenza: qui la chiave esterna è `ON DELETE RESTRICT`, quindi il database
 * rifiuterebbe comunque di cancellare una voce usata — il conteggio serve a
 * dirlo in parole, e a dire quante righe la usano.
 */
export async function salvaScelte(lista: Lista, voci: Voce[]): Promise<EsitoFasi> {
  try {
    await requireSalesConfig()
    if (!eLista(lista)) return { ok: false, errori: ['Elenco sconosciuto'] }

    const puliti: Voce[] = rinumera((Array.isArray(voci) ? voci : []).map(v => ({
      chiave: String(v?.chiave ?? '').trim(),
      etichetta: String(v?.etichetta ?? '').trim(),
      ordine: 0,
      attivo: v?.attivo !== false,
    })))
    const errori = problemiDi(lista, puliti)
    if (errori.length) return { ok: false, errori }

    const admin = createAdminClient()
    const { data: esistenti, error: eLettura } = await admin.from(TABELLA[lista]).select('chiave')
    if (eLettura) return { ok: false, errori: ['Elenco non ancora attivo: manca la migration sul database.'] }
    const dopo = new Set(puliti.map(v => v.chiave))
    const sparite = ((esistenti ?? []) as { chiave: string }[]).map(x => x.chiave).filter(k => !dopo.has(k))
    if (sparite.length) {
      const { data: usate } = await admin.from('deals').select(lista).in(lista, sparite)
      const conta = new Map<string, number>()
      for (const r of (usate ?? []) as unknown as Record<string, string>[]) conta.set(r[lista], (conta.get(r[lista]) ?? 0) + 1)
      if (conta.size) {
        return {
          ok: false,
          errori: Array.from(conta.entries()).map(([k, n]) =>
            `«${k}» è su ${n} lead: ritirala invece di eliminarla.`),
        }
      }
      const { error } = await admin.from(TABELLA[lista]).delete().in('chiave', sparite)
      if (error) return { ok: false, errori: [error.message] }
    }

    const { error } = await admin.from(TABELLA[lista]).upsert(puliti, { onConflict: 'chiave' })
    if (error) return { ok: false, errori: [error.message] }

    rinfresca()
    return { ok: true }
  } catch (e) {
    console.error('[scelte commerciali]', e)
    return { ok: false, errori: [(e as Error).message] }
  }
}

/**
 * §437 — l'elenco dei campi personalizzati, salvato insieme.
 *
 * Due cose non si fanno su un campo che ha dei valori sui lead, e il server lo
 * conta prima invece di fidarsi della schermata: **eliminarlo**, che lascerebbe
 * i valori orfani e invisibili, e **cambiargli tipo**, che renderebbe «tanti»
 * il valore di un campo diventato numero. Chi vuole smettere di usarlo lo
 * ritira: sparisce dalle schede vuote e resta leggibile su quelle compilate.
 */
export async function salvaCampi(campi: Campo[]): Promise<EsitoFasi> {
  try {
    await requireSalesConfig()
    const puliti: Campo[] = (Array.isArray(campi) ? campi : []).map((c, i) => ({
      chiave: String(c?.chiave ?? '').trim(),
      etichetta: String(c?.etichetta ?? '').trim(),
      tipo: c?.tipo,
      opzioni: c?.tipo === 'scelta' ? opzioniDa((Array.isArray(c?.opzioni) ? c.opzioni : []).join(',')) : [],
      riquadro: c?.riquadro,
      aiuto: c?.aiuto ? String(c.aiuto).trim().slice(0, 120) || null : null,
      ordine: (i + 1) * 10,
      attivo: c?.attivo !== false,
    })) as Campo[]
    const errori = problemiCampi(puliti)
    if (errori.length) return { ok: false, errori }

    const admin = createAdminClient()
    const { data: prima, error: eLettura } = await admin.from('sales_campi').select('chiave, tipo, etichetta')
    if (eLettura) return { ok: false, errori: ['Campi personalizzati non ancora attivi: manca la migration sul database.'] }
    const esistenti = (prima ?? []) as { chiave: string; tipo: string; etichetta: string }[]
    const dopo = new Map(puliti.map(c => [c.chiave, c]))
    const toccati = esistenti.filter(e => !dopo.has(e.chiave) || dopo.get(e.chiave)!.tipo !== e.tipo)

    if (toccati.length) {
      const { data: righe } = await admin.from('deals').select('campi_extra')
      const usati = new Map<string, number>()
      for (const r of (righe ?? []) as { campi_extra: Record<string, unknown> | null }[]) {
        for (const e of toccati) if (r.campi_extra && r.campi_extra[e.chiave] !== undefined) usati.set(e.chiave, (usati.get(e.chiave) ?? 0) + 1)
      }
      const bloccati = toccati.filter(e => usati.get(e.chiave))
      if (bloccati.length) {
        return {
          ok: false,
          errori: bloccati.map(e => dopo.has(e.chiave)
            ? `«${e.etichetta}» ha già un valore su ${usati.get(e.chiave)} lead: il tipo non si cambia. Crea un campo nuovo e ritira questo.`
            : `«${e.etichetta}» ha un valore su ${usati.get(e.chiave)} lead: ritiralo invece di eliminarlo.`),
        }
      }
      const via = toccati.filter(e => !dopo.has(e.chiave)).map(e => e.chiave)
      if (via.length) {
        const { error } = await admin.from('sales_campi').delete().in('chiave', via)
        if (error) return { ok: false, errori: [error.message] }
      }
    }

    if (puliti.length) {
      const { error } = await admin.from('sales_campi').upsert(puliti, { onConflict: 'chiave' })
      if (error) return { ok: false, errori: [error.message] }
    }
    rinfresca()
    return { ok: true }
  } catch (e) {
    console.error('[campi personalizzati]', e)
    return { ok: false, errori: [(e as Error).message] }
  }
}
