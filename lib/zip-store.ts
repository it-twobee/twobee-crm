/* Uno zip senza compressione (metodo «store»): basta a spedire una cartella di
   pochi kB, e non vale una dipendenza. Nomi in UTF-8 (bit 11). */

const TABELLA = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(dati: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < dati.length; i++) c = TABELLA[(c ^ dati[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export function zipStore(file: { name: string; data: Uint8Array }[]): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder()
  const ora = 0
  const data = ((2026 - 1980) << 9) | (1 << 5) | 1
  const locali: Uint8Array[] = []
  const centrali: Uint8Array[] = []
  let offset = 0

  for (const f of file) {
    const nome = enc.encode(f.name)
    const crc = crc32(f.data)
    const loc = new DataView(new ArrayBuffer(30))
    loc.setUint32(0, 0x04034b50, true)
    loc.setUint16(4, 20, true)
    loc.setUint16(6, 0x0800, true)
    loc.setUint16(8, 0, true)
    loc.setUint16(10, ora, true)
    loc.setUint16(12, data, true)
    loc.setUint32(14, crc, true)
    loc.setUint32(18, f.data.length, true)
    loc.setUint32(22, f.data.length, true)
    loc.setUint16(26, nome.length, true)
    loc.setUint16(28, 0, true)
    locali.push(new Uint8Array(loc.buffer), nome, f.data)

    const cen = new DataView(new ArrayBuffer(46))
    cen.setUint32(0, 0x02014b50, true)
    cen.setUint16(4, 20, true)
    cen.setUint16(6, 20, true)
    cen.setUint16(8, 0x0800, true)
    cen.setUint16(10, 0, true)
    cen.setUint16(12, ora, true)
    cen.setUint16(14, data, true)
    cen.setUint32(16, crc, true)
    cen.setUint32(20, f.data.length, true)
    cen.setUint32(24, f.data.length, true)
    cen.setUint16(28, nome.length, true)
    cen.setUint32(42, offset, true)
    centrali.push(new Uint8Array(cen.buffer), nome)
    offset += 30 + nome.length + f.data.length
  }

  const dimCentrale = centrali.reduce((s, b) => s + b.length, 0)
  const fine = new DataView(new ArrayBuffer(22))
  fine.setUint32(0, 0x06054b50, true)
  fine.setUint16(8, file.length, true)
  fine.setUint16(10, file.length, true)
  fine.setUint32(12, dimCentrale, true)
  fine.setUint32(16, offset, true)

  const parti = [...locali, ...centrali, new Uint8Array(fine.buffer)]
  const out = new Uint8Array(new ArrayBuffer(parti.reduce((s, b) => s + b.length, 0)))
  let p = 0
  for (const b of parti) { out.set(b, p); p += b.length }
  return out
}
