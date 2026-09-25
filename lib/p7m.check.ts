/* L'XML dentro una fattura firmata (§449).
   Esegui: npx tsx lib/p7m.check.ts

   Si costruiscono buste CMS a mano — DER a lunghezza definita, BER spezzato a
   lunghezza indefinita, base64 — e si controlla che ne esca la fattura intera,
   senza i byte delle intestazioni in mezzo. */

import { xmlDaP7m } from '@/lib/p7m'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(58)} ${ok ? '' : `${JSON.stringify(got)?.slice(0, 80)}  atteso ${JSON.stringify(want)?.slice(0, 80)}`}`)
}

const enc = new TextEncoder()
const len = (n: number) => n < 128 ? [n] : n < 256 ? [0x81, n] : [0x82, n >> 8, n & 0xff]
const tlv = (tag: number, body: number[]) => [tag, ...len(body.length), ...body]
const indef = (tag: number, parti: number[][]) => [tag, 0x80, ...parti.flat(), 0, 0]
const OID_SIGNED = [0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x02]
const OID_DATA = [0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x01]

const XML = `<?xml version="1.0" encoding="UTF-8"?><p:FatturaElettronica versione="FPR12" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2"><FatturaElettronicaHeader><X>Café 12,50 €</X></FatturaElettronicaHeader></p:FatturaElettronica>`
const byte = Array.from(enc.encode(XML))

/* SignedData { version, digestAlgorithms, encapContentInfo { eContentType, [0] eContent } , ... } */
const busta = (eContent: number[]) => tlv(0x30, [...OID_SIGNED, ...tlv(0xa0, tlv(0x30, [
  0x02, 0x01, 0x01,
  ...tlv(0x31, []),
  ...tlv(0x30, [...OID_DATA, ...tlv(0xa0, eContent)]),
  ...tlv(0x31, [0x30, 0x03, 0x02, 0x01, 0x01]),   // signerInfos finti: non si guardano
]))])

is('DER: OCTET STRING intero', xmlDaP7m(new Uint8Array(busta(tlv(0x04, byte)))), XML)

// BER: OCTET STRING costruito a lunghezza indefinita, in pezzi da 40 byte
const pezzi: number[][] = []
for (let i = 0; i < byte.length; i += 40) pezzi.push(tlv(0x04, byte.slice(i, i + 40)))
const ber = [0x30, 0x80, ...OID_SIGNED, 0xa0, 0x80, 0x30, 0x80, 0x02, 0x01, 0x01, 0x31, 0x00,
  0x30, 0x80, ...OID_DATA, 0xa0, 0x80, ...indef(0x24, pezzi), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
is('BER spezzato a lunghezza indefinita: ricomposto, senza intestazioni in mezzo', xmlDaP7m(new Uint8Array(ber)), XML)

const b64 = btoa(String.fromCharCode(...busta(tlv(0x04, byte))))
is('in base64, anche a righe', xmlDaP7m(enc.encode(b64.replace(/(.{64})/g, '$1\r\n'))), XML)

is('un XML qualunque non è una fattura', xmlDaP7m(new Uint8Array(busta(tlv(0x04, Array.from(enc.encode('<ciao/>')))))), null)
is('un file rotto non fa esplodere niente', xmlDaP7m(new Uint8Array([0x30, 0x84, 0xff, 0xff, 0xff, 0xff, 1, 2])), null)
is('non è una busta', xmlDaP7m(enc.encode('ciao mondo')), null)

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
