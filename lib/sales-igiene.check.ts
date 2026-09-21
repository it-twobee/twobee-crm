/* §385 — i controlli sul commerciale. Esegui: npx tsx lib/sales-igiene.check.ts

   Quello che conta qui è che un controllo **non gridi al lupo**: un elenco
   di rilievi con dentro dei falsi si smette di guardare dopo due giorni, e
   allora tanto vale non averlo. Per questo metà di queste prove sono al
   contrario — righe che si somigliano e non devono finire insieme. */
import {
  gruppiDoppioni, controlla, quanteGravi, confronta, completezza, rangoFase, mostra,
  type RigaIgiene, type RigaConfronto,
} from '@/lib/sales-igiene'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(58)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}
const r = (id: string, o: Partial<RigaIgiene> = {}): RigaIgiene => ({
  id, company_name: id, stage: 'new_lead', created_at: '2026-09-01', ...o,
})
const OGGI = '2026-09-21'

console.log('\n— I doppioni si trovano a gruppi, non a coppie —')
{
  /* Tre righe della stessa azienda fanno tre coppie: mostrarle come tre
     problemi separati porta a risolverne una e credere di aver finito. */
  const g = gruppiDoppioni([
    r('a', { contact_phone: '+39 320 267 7770' }),
    r('b', { contact_phone: '3202677770' }),
    r('c', { contact_phone: '0039 320 2677770' }),
  ])
  is('tre righe dello stesso telefono sono un gruppo solo', g.length, 1)
  is('e ci stanno tutte e tre', g[0].ids.sort(), ['a', 'b', 'c'])
  is('il telefono identifica una persona: è certo', g[0].certo, true)
}
{
  /* Il contagio: A col telefono di B, B con la mail di C. Sono la stessa
     storia anche se A e C non hanno niente in comune fra loro. */
  const g = gruppiDoppioni([
    r('a', { contact_phone: '3331112222' }),
    r('b', { contact_phone: '3331112222', contact_email: 'x@y.it' }),
    r('c', { contact_email: 'X@Y.IT' }),
  ])
  is('si uniscono per contagio', g.length && g[0].ids.sort(), ['a', 'b', 'c'])
  is('e dice tutte e due le ragioni', g[0].motivi.sort(), ['email', 'telefono'])
}
{
  const g = gruppiDoppioni([r('a', { company_name: 'Rossi S.r.l.' }), r('b', { company_name: 'ROSSI SRL' })])
  is('«Rossi S.r.l.» e «ROSSI SRL» si trovano', g.length, 1)
  /* Ma il nome identifica un nome, non una persona: due fratelli in due
     capannoni si chiamano uguale, e unirli sarebbe irreversibile (§377). */
  is('e il gruppo non è certo: è solo il nome', g[0].certo, false)
}

console.log('\n— E soprattutto non si trovano dove non ci sono —')
{
  is('due aziende diverse restano due',
    gruppiDoppioni([r('a', { company_name: 'Verdi Srl' }), r('b', { company_name: 'Bianchi Spa' })]).length, 0)
  /* Un telefono vuoto non è un telefono uguale a un altro vuoto: senza
     questo, tutte le righe senza recapito diventerebbero un unico doppione
     gigante — il modo più veloce di rendere inutile il controllo. */
  is('i recapiti vuoti non uniscono niente',
    gruppiDoppioni([r('a'), r('b'), r('c')]).length, 0)
  is('e nemmeno un telefono troppo corto per essere un telefono',
    gruppiDoppioni([r('a', { contact_phone: '123' }), r('b', { contact_phone: '123' })]).length, 0)
  is('una mail malformata non è una chiave',
    gruppiDoppioni([r('a', { contact_email: 'non-una-mail' }), r('b', { contact_email: 'non-una-mail' })]).length, 0)
  is('un nome di due lettere nemmeno',
    gruppiDoppioni([r('a', { company_name: 'AB' }), r('b', { company_name: 'AB' })]).length, 0)
}

console.log('\n— Gli altri controlli —')
{
  const chiavi = (righe: RigaIgiene[]) => controlla(righe, OGGI).map(x => x.chiave)

  is('senza telefono né mail, e aperto',
    chiavi([r('a')]).includes('senza_recapito'), true)
  /* Un perso senza recapito non è un problema: non lo deve chiamare nessuno. */
  is('ma non se la trattativa è chiusa',
    chiavi([r('a', { stage: 'lost' })]).includes('senza_recapito'), false)

  is('«Active Client» senza anagrafica collegata',
    chiavi([r('a', { stage: 'active_client', contact_phone: '3331112222' })])
      .includes('cliente_senza_anagrafica'), true)
  is('e non si lamenta se il cliente c\'è',
    chiavi([r('a', { stage: 'active_client', client_id: 'cli', contact_phone: '3331112222' })])
      .includes('cliente_senza_anagrafica'), false)

  is('collegato a un cliente ma ancora in lavorazione',
    chiavi([r('a', { stage: 'qualified', client_id: 'cli', contact_phone: '3331112222' })])
      .includes('collegato_ma_aperto'), true)

  is('una fase che non esiste più',
    chiavi([r('a', { stage: 'boh', contact_phone: '3331112222' })]).includes('fase_sconosciuta'), true)

  /* I fermi si contano dall'ultimo contatto, e se non c'è dalla creazione:
     un lead arrivato a luglio e mai toccato è fermo da luglio, non da oggi. */
  is('fermo da troppo, contato dall\'ultimo contatto',
    chiavi([r('a', { contact_phone: '3331112222', last_interaction_at: '2026-06-01' })])
      .includes('fermi'), true)
  is('e un contatto di ieri non è fermo',
    chiavi([r('a', { contact_phone: '3331112222', last_interaction_at: '2026-09-20' })])
      .includes('fermi'), false)
  is('senza contatti si guarda la data di arrivo',
    chiavi([r('a', { contact_phone: '3331112222', created_at: '2026-05-01' })]).includes('fermi'), true)

  /* Un archivio pulito non deve produrre nessun rilievo, o il pannello
     mostra sempre qualcosa e si smette di aprirlo. */
  is('un lead sano non produce rilievi',
    controlla([r('a', { contact_phone: '3331112222', last_interaction_at: '2026-09-20' })], OGGI).length, 0)
  is('e nemmeno una tabella vuota', controlla([], OGGI).length, 0)
}

console.log('\n— Il conteggio in testata —')
{
  /* Conta le **righe** toccate, non i rilievi: una riga che sbaglia tre cose
     è un problema, e dire «tre» farebbe sembrare l'archivio peggio di com'è. */
  const righe = [
    r('a', { stage: 'active_client' }),
    r('b', { stage: 'active_client' }),
  ]
  const ril = controlla(righe, OGGI)
  is('due righe con due problemi ciascuna contano due', quanteGravi(ril), 2)
  is('e i gravi vengono prima', ril[0].peso, 'grave')
}

console.log('\n— §386 · quale delle due tenere, e cosa si perde —')
{
  const c = (id: string, o: Record<string, unknown> = {}): RigaConfronto =>
    ({ id, company_name: id, stage: 'new_lead', created_at: '2026-09-01', ...o })

  /* 1 · Il collegamento all'anagrafica è l'unica cosa che non si ricostruisce
     guardando i campi: chi ce l'ha vince anche se è più spoglio. */
  const cliente = confronta([
    c('vuota', { client_id: 'cli', stage: 'active_client' }),
    c('piena', { contact_phone: '333', contact_email: 'a@b.it', notes: 'tante note', website: 'x.it' }),
  ])
  is('chi è collegato a un cliente vince', cliente?.tieni, 'vuota')
  is('e lo dice', cliente?.perche[0].includes('collegata a un cliente'), true)
  /* …e proprio per questo l'elenco di cosa ricopiare diventa lungo: è la
     ragione per cui non basta dire «tieni questa». */
  is('ma avvisa di cosa c\'è sull\'altra',
    (cliente?.daPortare ?? []).map(d => d.campo).includes('contact_phone'), true)

  // 2 · più avanti nel percorso
  is('a pari campi vince chi è più avanti',
    confronta([c('nuovo'), c('proposta', { stage: 'strategia_preventivo' })])?.tieni, 'proposta')

  // 3 · più campi pieni
  is('poi vince chi ha più campi',
    confronta([c('scarna'), c('ricca', { contact_phone: '333', notes: 'x' })])?.tieni, 'ricca')

  // 4 · a parità, la più vecchia: è quella con la storia più lunga
  is('a parità vince la più vecchia',
    confronta([c('nuova', { created_at: '2026-09-10' }), c('vecchia', { created_at: '2026-01-10' })])?.tieni,
    'vecchia')

  /* Il caso vero del 21 settembre: l'import CSV ha ricopiato righe arrivate
     dal foglio il giorno prima. La riga del foglio ha l'ultimo contatto, la
     copia no — e vince quella giusta. */
  const vero = confronta([
    c('csv', { source: 'CSV', contact_phone: 'p:+393396786964', contact_email: 'a@b.it', created_at: '2026-09-21' }),
    c('meta', { source: 'Meta Ads', contact_phone: '+393396786964', contact_email: 'a@b.it',
      last_interaction_at: '2026-09-20', created_at: '2026-09-20' }),
  ])
  is('fra la riga del foglio e la copia da CSV vince il foglio', vero?.tieni, 'meta')

  /* In parallelo si mostrano **solo** i campi che dicono cose diverse:
     ventitré righe uguali nascondono le tre che contano. */
  const diff = confronta([
    c('a', { company_name: 'Uguale', notes: 'x' }),
    c('b', { company_name: 'Uguale', notes: 'x', website: 'y.it' }),
  ])
  is('affianca solo i campi che differiscono',
    (diff?.campi ?? []).map(x => x.campo), ['website'])

  // e i vuoti sono vuoti, in tutte le forme in cui si presentano
  is('array vuoto, stringa vuota, zero e trattino sono vuoti',
    [mostra([]), mostra(''), mostra(0), mostra('-'), mostra(null)], [null, null, null, null, null])
  is('ma un array pieno si legge', mostra(['a', 'b']), 'a, b')
  /* Quattro: nome azienda, data di arrivo, note e sito. La data di arrivo
     c'è sempre, quindi entra nel conto di tutte e non sposta il confronto. */
  is('completezza conta i campi veri', completezza(c('x', { notes: 'n', website: 'w' })), 4)

  /* `lost` sta in cima alla colonna di Notion (§367): ordinare per indice
     direbbe che un lead nuovo è più indietro di un perso. */
  is('un perso non è «più avanti» di un lead vivo',
    rangoFase('qualified') > rangoFase('lost'), true)
  is('e il cliente attivo è in fondo a tutti',
    rangoFase('active_client') > rangoFase('qualified'), true)

  is('una riga sola non è un confronto', confronta([c('a')]), null)
}

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
