import { readFileSync, readdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
// Motore PGlite installato fuori dal repo: nessuna credenziale né rete.
const engine = process.env.TWOBEE_PGLITE_MODULE
if (!engine) throw Error('Imposta TWOBEE_PGLITE_MODULE al modulo PGlite temporaneo.')
const { PGlite } = await import(pathToFileURL(engine).href)
const db = new PGlite()
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const files = readdirSync('supabase/migrations')
const base = files.find(n => /^\d{3}_bank_invoice_reconciliations\.sql$/.test(n))
const next = files.find(n => /^(XXX|\d{3})_raccordi_righe_costo\.sql$/.test(n))
assert.ok(base && next)
await db.exec(readFileSync('scripts/fixtures/reconciliation-base.sql', 'utf8'))
await db.exec(readFileSync(`supabase/migrations/${base}`, 'utf8'))
const migration = readFileSync(`supabase/migrations/${next}`, 'utf8')
await db.exec(migration); await db.exec(migration)
await db.exec(`set request.jwt.claims='{"role":"service_role"}'; set request.headers='{"x-actor-id":"${id(1)}"}';`)
let command = 5000
const save = (group, movements, invoices, pairs) => db.query('select public.save_bank_invoice_reconciliation($1,0,$2,$3,$4) as value', [id(group), id(++command), 'save',
  { movements: movements.map(id), invoices: invoices.map(id), pairs: pairs.map(([t, d, a]) => ({ movementId: id(t), documentId: id(d), amount: a })), note: 'Prova' }])
const attempt = async (fn, pattern) => { await db.exec('savepoint a'); try { await fn(); throw Error('EXPECTED_FAILURE') } catch (e) { assert.notEqual(e.message, 'EXPECTED_FAILURE'); if (pattern) assert.match(e.message, pattern) } await db.exec('rollback to savepoint a') }
await db.exec('begin')
// movimento -> riga costo pulita (campo diretto + quota) + fattura 101 (300) con movimenti 201 (100) e 202 (200)
await db.exec(`insert into pl_cost_lines values('${id(701)}',null),('${id(702)}','${id(103)}')`)
await db.exec(`update bank_transactions set cost_line_id='${id(701)}' where id='${id(201)}'`)
await db.exec(`insert into payment_allocations(id,tx_id,cost_line_id,amount) values('${id(801)}','${id(201)}','${id(701)}',100)`)
await db.exec(`insert into bank_tx_lines(id,tx_id,cost_line_id,amount) values('${id(802)}','${id(201)}','${id(701)}',100)`)
// 1) consentito: riga costo pulita, quota economica non consuma il movimento
await save(401, [201], [101], [[201, 101, 100]])
assert.equal((await db.query('select count(*)::int n from bank_invoice_reconciliation_items where tx_id=$1', [id(201)])).rows[0].n, 1)
assert.equal((await db.query('select count(*)::int n from payment_allocations where tx_id=$1', [id(201)])).rows[0].n, 1, 'la quota economica non viene toccata')
assert.equal((await db.query('select cost_line_id from bank_transactions where id=$1', [id(201)])).rows[0].cost_line_id, id(701))
// 2) bloccati
await attempt(async () => { await db.exec(`update bank_transactions set cost_line_id='${id(702)}' where id='${id(202)}'`); await save(402, [202], [101], [[202, 101, 200]]) }, /impegnato/)
await attempt(async () => { await db.exec(`insert into payment_allocations(id,tx_id,revenue_line_id,amount) values('${id(803)}','${id(202)}','${id(703)}',50)`); await save(403, [202], [101], [[202, 101, 200]]) }, /impegnato/)
await attempt(async () => { await db.exec(`insert into payment_allocations(id,tx_id,cost_line_id,payout_id,amount) values('${id(804)}','${id(202)}','${id(701)}','${id(704)}',50)`); await save(404, [202], [101], [[202, 101, 200]]) }, /impegnato/)
await attempt(async () => { await db.exec(`insert into payment_allocations(id,tx_id,cost_line_id,f24_id,amount) values('${id(805)}','${id(202)}','${id(701)}','${id(705)}',50)`); await save(405, [202], [101], [[202, 101, 200]]) }, /impegnato/)
await attempt(async () => { await db.exec(`insert into payment_allocations(id,tx_id,cost_line_id,amount) values('${id(806)}','${id(202)}','${id(702)}',50)`); await save(406, [202], [101], [[202, 101, 200]]) }, /impegnato/)
await attempt(async () => { await db.exec(`insert into bank_tx_lines(id,tx_id,revenue_line_id,amount) values('${id(807)}','${id(202)}','${id(703)}',50)`); await save(407, [202], [101], [[202, 101, 200]]) }, /impegnato/)
await attempt(async () => { await db.exec(`insert into bank_tx_payslips values('${id(202)}','${id(706)}',50)`); await save(408, [202], [101], [[202, 101, 200]]) }, /impegnato/)
await attempt(async () => { await db.exec(`update bank_transactions set payslip_id='${id(706)}', cost_line_id='${id(701)}' where id='${id(202)}'`); await save(409, [202], [101], [[202, 101, 200]]) }, /impegnato/)
await attempt(async () => { await db.exec(`update bank_transactions set cost_line_id='${id(999)}' where id='${id(202)}'`); await save(410, [202], [101], [[202, 101, 200]]) }, /impegnato/)
// 3) la guardia lato fattura resta: una riga che punta alla fattura blocca
await attempt(async () => { await db.exec(`update pl_cost_lines set invoice_id='${id(101)}' where id='${id(701)}'`); await save(411, [202], [101], [[202, 101, 200]]) }, /quote economiche|impegnato|già raccordata/)
await db.exec('rollback')
// 4) la guardia di produzione si ferma se la funzione non è la 281
await db.exec(`create or replace function public.save_bank_invoice_reconciliation(p_id uuid,p_version integer,p_command uuid,p_operation text,p_payload jsonb) returns jsonb language sql as $$ select '{}'::jsonb $$;`)
await assert.rejects(() => db.exec(migration), /non è quella della 281/)
console.log('Prove SQL righe costo: tutte passate')
