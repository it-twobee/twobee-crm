/**
 * §449 — l'XML dentro una fattura firmata (.p7m).
 *
 * Una FatturaPA firmata CAdES è una busta PKCS#7 (CMS SignedData): l'XML sta
 * nell'`eContent`, un OCTET STRING che molti software spezzano in pezzi
 * (codifica BER «costruita», anche a lunghezza indefinita). Cercare «<?xml»
 * nei byte funziona finché il file non è spezzato — e allora in mezzo
 * all'XML restano le intestazioni dei pezzi, e la fattura non si legge. Qui si
 * legge la struttura: si scorre l'albero ASN.1 e si ricompone l'OCTET STRING
 * che contiene la fattura. La firma non si verifica: l'SdI l'ha già fatto, e il
 * documento si conserva comunque intero.
 *
 * Puro, niente dipendenze: gira nel browser, dove i file si aprono.
 */

type Nodo = { tag: number; costruito: boolean; inizio: number; fine: number; figli?: Nodo[] }

const MAX_PROFONDITA = 64

function leggiNodo(b: Uint8Array, pos: number, fineMax: number, prof: number): Nodo {
  if (prof > MAX_PROFONDITA) throw new Error('struttura troppo profonda')
  const t = b[pos++]
  const costruito = (t & 0x20) !== 0
  let tag = t & 0x1f
  if (tag === 0x1f) { tag = 0; let x; do { x = b[pos++]; tag = (tag << 7) | (x & 0x7f) } while (x & 0x80) }
  const classe = t & 0xc0
  let len = b[pos++]
  let indefinita = false
  if (len === 0x80) indefinita = true
  else if (len & 0x80) {
    const n = len & 0x7f
    if (n > 4) throw new Error('lunghezza non valida')
    len = 0
    for (let i = 0; i < n; i++) len = len * 256 + b[pos++]
  }
  const inizio = pos
  const nodo: Nodo = { tag: classe | tag, costruito, inizio, fine: indefinita ? fineMax : inizio + len }
  if (!indefinita && nodo.fine > fineMax) throw new Error('lunghezza oltre il file')
  if (costruito) {
    nodo.figli = []
    let p = inizio
    while (p < nodo.fine) {
      if (indefinita && b[p] === 0 && b[p + 1] === 0) { nodo.fine = p + 2; break }
      const f = leggiNodo(b, p, nodo.fine, prof + 1)
      nodo.figli.push(f)
      p = f.fine
    }
  }
  return nodo
}

/** i byte di un OCTET STRING, anche spezzato in pezzi */
function contenuto(b: Uint8Array, n: Nodo): Uint8Array {
  if (!n.costruito) return b.subarray(n.inizio, n.fine)
  const pezzi = (n.figli ?? []).map(f => contenuto(b, f))
  const out = new Uint8Array(pezzi.reduce((s, p) => s + p.length, 0))
  let o = 0
  for (const p of pezzi) { out.set(p, o); o += p.length }
  return out
}

const OCTET = 0x04
const testo = (u: Uint8Array) => new TextDecoder('utf-8', { fatal: false }).decode(u)

/** true se i byte sembrano una FatturaPA */
const eFattura = (s: string) => /<(?:\w+:)?FatturaElettronica[\s>]/.test(s)

/** base64 → byte: un .p7m a volte arriva codificato come testo */
function daBase64(s: string): Uint8Array | null {
  const pulito = s.replace(/[\r\n\s]/g, '')
  if (!/^[A-Za-z0-9+/=]+$/.test(pulito) || pulito.length < 64) return null
  try {
    const bin = atob(pulito)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch { return null }
}

/**
 * L'XML della fattura dentro un .p7m, o null se non c'è. Accetta la busta in
 * binario (DER/BER) o codificata base64.
 */
export function xmlDaP7m(file: Uint8Array): string | null {
  let b = file
  if (b[0] !== 0x30) {
    const dec = daBase64(testo(b))
    if (!dec || dec[0] !== 0x30) return null
    b = dec
  }
  let radice: Nodo
  try { radice = leggiNodo(b, 0, b.length, 0) } catch { return null }
  // si cerca, in ordine di documento, il primo OCTET STRING che contiene una fattura
  const coda: Nodo[] = [radice]
  while (coda.length) {
    const n = coda.shift()!
    if ((n.tag & 0x1f) === OCTET && (n.tag & 0xc0) === 0) {
      const s = testo(contenuto(b, n))
      if (eFattura(s)) return s.replace(/^﻿/, '').replace(/[\s\u0000]+$/, '')
      continue
    }
    if (n.figli) coda.unshift(...n.figli)
  }
  return null
}
