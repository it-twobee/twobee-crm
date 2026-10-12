import { vcardDi } from './sales-vcard'

let ko = 0
const ok = (c: boolean, m: string) => { if (!c) { ko++; console.error('KO', m) } }

const v = vcardDi({ azienda: 'Rossi; Srl', persona: 'Mario Rossi', telefono: '+39 333 123 4567', email: 'm@r.it' })!
ok(v.includes('FN:Mario Rossi') && v.includes('N:Rossi;Mario;;;'), 'nome e cognome')
ok(v.includes('ORG:Rossi\; Srl'), 'il punto e virgola si protegge')
ok(v.includes('TEL;TYPE=WORK,VOICE:+393331234567'), 'telefono senza spazi')
ok(vcardDi({ azienda: 'X' }) === null, 'senza recapito niente QR')
ok(vcardDi({ telefono: '333' }) === null, 'senza nome niente QR')
ok(vcardDi({ azienda: 'Solo Azienda', email: 'a@b.it' })!.includes('FN:Solo Azienda'), 'senza persona vale l\'azienda')

if (ko) process.exit(1)
console.log('Tutti i controlli passano')
