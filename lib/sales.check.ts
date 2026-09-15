import assert from 'node:assert/strict'
import { canReadDeal, isClosed, plusDays, salesAccess, salesMetrics, salesPriority, salesToday, salesSourceOptions, validDate, validateDeal, type DealInput, type SalesDeal } from './sales'

const owner = '00000000-0000-4000-8000-000000000001'
const other = '00000000-0000-4000-8000-000000000002'
const base: SalesDeal = {
  id: owner, title: 'Sito', company_name: 'Azienda', client_id: other, contact_id: null,
  assigned_to: owner, stage: 'lead', source: null, need: null, blocker: null,
  next_action: 'Chiamare', next_action_on: '2026-09-20', resume_on: null,
  monthly_value: null, setup_value: null, one_off_value: null, proposal_ref: null,
  loss_reason: null, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
  closed_at: null, last_interaction_at: null, revision: 0, delivery: {}, delivery_project_id: null,
  delivery_completed_at: null, delivery_owner_id: null,
}
let checks = 0
function test(name: string, run: () => void) { run(); checks++; console.log(`OK ${name}`) }

test('Fonti guidate, nessuna perdita delle fonti storiche', () => {
  const expected = ['Meta Ads', 'Sito', 'Volantino', 'Passaparola', 'Referral', 'Telefonico', 'Network', 'Altro']
  assert.deepEqual(salesSourceOptions(), expected)
  assert.deepEqual(salesSourceOptions('Meta Ads'), expected)
  assert.deepEqual(salesSourceOptions('Fiera 2025'), [...expected, 'Fiera 2025'])
  assert.deepEqual(salesSourceOptions(''), expected)
})

test('Un ruolo workspace non abilita automaticamente il commerciale', () => {
  for (const role of ['manager', 'senior', 'junior', 'stage', 'freelance', 'partner']) assert.equal(salesAccess(role, false), null)
})
test('Guest, cliente e viewer restano fuori anche con un vecchio grant', () => {
  for (const role of ['guest', 'client', 'viewer', '', undefined]) assert.equal(salesAccess(role, true), null)
})
test('Solo il manager abilitato coordina le trattative degli altri', () => {
  assert.equal(salesAccess('manager', true), 'manager')
  assert.equal(salesAccess('senior', true), 'owner')
  assert.equal(canReadDeal('owner', owner, other), false)
  assert.equal(canReadDeal('owner', owner, null), false)
  assert.equal(canReadDeal('owner', owner, owner), true)
  assert.equal(canReadDeal('manager', owner, other), true)
  assert.equal(canReadDeal(null, owner, owner), false)
})
test('Disattivare il profilo revoca anche gli admin', () => assert.equal(salesAccess('admin', true, false), null))
test('La giornata segue Roma anche dopo la mezzanotte locale', () => assert.equal(salesToday(new Date('2026-09-14T23:10:00Z')), '2026-09-15'))
test('Date reali, anni bisestili e passaggio di mese', () => {
  assert.equal(validDate('2026-02-30'), false)
  assert.equal(validDate('2024-02-29'), true)
  assert.equal(validDate('2026-2-9'), false)
  assert.equal(plusDays('2026-12-31', 1), '2027-01-01')
})
test('Una pausa futura non genera follow-up scaduti', () => {
  assert.equal(salesPriority({ ...base, resume_on: '2026-09-20', next_action_on: '2026-09-01' }, '2026-09-15'), null)
  assert.equal(salesPriority({ ...base, resume_on: '2026-09-15' }, '2026-09-15'), 'Da riprendere')
})
test('Gli scaduti e le schede prive di prossima azione sono visibili', () => {
  assert.equal(salesPriority({ ...base, next_action_on: '2026-09-14' }, '2026-09-15'), 'Follow-up scaduto')
  assert.equal(salesPriority({ ...base, next_action: null }, '2026-09-15'), 'Prossima azione da definire')
  assert.equal(salesPriority(base, '2026-09-15'), 'Nessuna interazione da 14 giorni')
})
test('La vittoria resta in Oggi fino al completamento della delivery', () => {
  const won = { ...base, stage: 'chiuso_vinto' as const }
  assert.equal(salesPriority(won, '2026-09-15'), 'Passaggio alla delivery da completare')
  assert.equal(salesPriority({ ...won, delivery_completed_at: '2026-09-15' }, '2026-09-15'), null)
  assert.equal(salesPriority({ ...base, stage: 'chiuso_perso' }, '2026-09-15'), null)
})
test('Senza chiusure e senza stime le metriche sono n/d', () => {
  const m = salesMetrics([base], '2026-09-01', '2026-09-30')
  assert.equal(m.winRate, null); assert.equal(m.cycleDays, null)
  assert.deepEqual(m.monthly, { value: null, missing: 1 })
})
test('Win rate per chiusura, acquisizione per apertura, ciclo sulla vittoria', () => {
  const m = salesMetrics([
    { ...base, created_at: '2026-08-31T00:00:00Z', stage: 'chiuso_vinto', closed_at: '2026-09-10T00:00:00Z' },
    { ...base, stage: 'chiuso_perso', closed_at: '2026-09-15T00:00:00Z' },
    { ...base, stage: 'chiuso_vinto', closed_at: '2026-10-01T00:00:00Z' },
    { ...base, stage: 'chiuso_vinto', closed_at: null },
  ], '2026-09-01', '2026-09-30')
  assert.equal(m.winRate, 50); assert.equal(m.cycleDays, 10); assert.equal(m.opened, 3)
})
test('Canoni, setup e una tantum non si sommano; pause e chiuse fuori dal forecast', () => {
  const m = salesMetrics([
    { ...base, monthly_value: 1000, setup_value: 250, one_off_value: 8000 },
    { ...base, stage: 'trattativa', monthly_value: 2000, setup_value: 0 },
    { ...base, resume_on: '2026-10-01', monthly_value: 90000 },
    { ...base, stage: 'chiuso_vinto', monthly_value: 90000 },
  ], '2026-09-01', '2026-09-30')
  assert.deepEqual(m.monthly, { value: 1700, missing: 0 })
  assert.deepEqual(m.setup, { value: 25, missing: 0 })
  assert.deepEqual(m.oneOff, { value: 800, missing: 1 })
})

const input: DealInput = {
  title: 'Nuovo cliente', company_name: 'Azienda', client_id: null, contact_id: null,
  contact_name: '', contact_email: '', contact_phone: '021234567', assigned_to: owner,
  stage: 'lead', source: '', need: '', blocker: '', next_action: 'Primo contatto',
  next_action_on: '2026-09-15', monthly_value: null, setup_value: null, one_off_value: null, proposal_ref: '',
}
test('Lead rapido con il solo telefono e senza dati fiscali', () => assert.doesNotThrow(() => validateDeal(input, true)))
test('Un contatto senza recapito non crea anagrafiche vuote', () => assert.throws(() => validateDeal({ ...input, contact_phone: '' }, true)))
test('UUID, data, valori infiniti, negativi e precisione sono validati', () => {
  for (const patch of [{ assigned_to: 'admin' }, { next_action_on: '2026-02-30' }, { monthly_value: NaN }, { setup_value: -1 }, { one_off_value: 1.234 }, { title: '' }]) assert.throws(() => validateDeal({ ...input, ...patch }, true))
})
test('La chiusura passa da un esito, non dall’editing della scheda', () => {
  assert.throws(() => validateDeal({ ...input, stage: 'chiuso_vinto' }))
  assert.equal(isClosed('qualificata'), false)
})
test('Proposta e qualificazione richiedono le loro evidenze', () => {
  assert.throws(() => validateDeal({ ...input, stage: 'qualificata' }))
  assert.throws(() => validateDeal({ ...input, stage: 'proposta', need: 'Nuovo sito' }))
})
console.log(`\nTutti i controlli passano. ${checks} scenari commerciali.`)
