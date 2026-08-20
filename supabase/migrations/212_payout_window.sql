-- §285 — Il subappalto sa quale rata finanzia, e l'erogazione ha una data.
--
-- Due fatti che il tool sapeva raccontare ma non sapeva scrivere.
--
-- 1) **Il subappalto è legato alla rata**, non al mese. `splitCostLikeClient`
--    genera una tranche per ogni rata del cliente, con la stessa percentuale e
--    lo stesso mese, e poi butta via il legame: resta il nome («— Rata 1 di 6»),
--    che è una stringa e non un vincolo. Da lì due danni. Il primo è
--    l'attribuzione: due rate dello stesso progetto nello stesso mese si
--    dividevano i subappalti **in proporzione all'imponibile** invece di
--    prendersi il proprio — su Seven a luglio l'acconto avrebbe portato 2.463,14
--    invece di 2.459,33 e la rata 2.668,41 invece di 2.672,22. Il secondo è
--    peggio: una tranche datata in un mese diverso da quello della sua rata
--    (il grafico di Fatima, 650 € su agosto contro la rata 1/4 di luglio) esce
--    dal margine di un mese in cui non c'è il ricavo che deve nettare, e ne
--    lascia scoperto un altro. La colonna rende il legame un dato.
--
-- 2) **L'erogazione ha un giorno**, normalmente il 20. Da quel giorno dipende
--    quali incassi entrano nella distribuzione: «fatturato nel mese prima e
--    incassato entro la data in cui eroghiamo». Senza una data scritta, la
--    finestra del mese dopo non sa da dove ripartire, e una fattura di luglio
--    incassata il 25 agosto o si perde o si conta due volte.
--
-- Nessuna delle due rompe niente finché non è eseguita: senza `installment_id`
-- l'attribuzione resta quella proporzionale di §208, senza `payout_date` la
-- data cade sul giorno di default.

-- ── 1 · il subappalto dichiara la rata che finanzia ──────────────────────────

alter table cost_items
  add column if not exists installment_id uuid
    references revenue_installments(id) on delete set null;

alter table pl_cost_lines
  add column if not exists installment_id uuid
    references revenue_installments(id) on delete set null;

comment on column cost_items.installment_id is
  '§285 — la rata del cliente che questa tranche di subappalto finanzia. '
  'ON DELETE SET NULL: se la rata sparisce il costo resta (il fornitore va pagato '
  'lo stesso) e torna ad attribuirsi per mese, come prima.';
comment on column pl_cost_lines.installment_id is
  '§285 — copiata dalla voce di piano quando l''occorrenza entra nel mese. '
  'Il margine digital toglie questo costo **dalla riga di quella rata**, non '
  'dalle righe del progetto in proporzione.';

create index if not exists idx_cost_items_installment on cost_items(installment_id)
  where installment_id is not null;
create index if not exists idx_pl_cost_lines_installment on pl_cost_lines(installment_id)
  where installment_id is not null;

-- Backfill: la tranche porta il **nome** della rata che finanzia, perché
-- `materializeCostPlan` lo compone come «<voce> — <label della rata>». È una
-- stringa e per questo si sta aggiungendo la colonna, ma è anche l'unico legame
-- esistente e buttarlo via vorrebbe dire riscrivere a mano dodici anni di
-- subappalti. Si aggancia solo dove la corrispondenza è **una sola**: stesso
-- progetto, stessa coda del nome, una rata sola che la porta.
with candidati as (
  select ci.id as item_id, ri.id as inst_id,
         count(*) over (partition by ci.id) as quante
    from cost_items ci
    join revenue_streams rs on rs.project_id = ci.project_id
    join revenue_installments ri on ri.stream_id = rs.id
   where ci.project_id is not null
     and ci.installment_id is null
     and ri.label is not null
     -- `right(...)` e non `like`: le etichette contengono «%» («30% all'ordine»),
     -- che in un pattern LIKE è un jolly e farebbe combaciare quello che capita.
     and right(ci.label, length(ri.label) + 2) = '— ' || ri.label
)
update cost_items ci set installment_id = c.inst_id
  from candidati c
 where c.item_id = ci.id and c.quante = 1;

with candidati as (
  select cl.id as line_id, ci.installment_id as inst_id
    from pl_cost_lines cl
    join cost_items ci on ci.id = cl.cost_item_id
   where cl.installment_id is null and ci.installment_id is not null
)
update pl_cost_lines cl set installment_id = c.inst_id
  from candidati c where c.line_id = cl.id;

-- ── 2 · la data dell'erogazione ──────────────────────────────────────────────

alter table pl_config
  add column if not exists payout_day smallint not null default 20;

alter table pl_months
  add column if not exists payout_date date;

comment on column pl_config.payout_day is
  '§285 — il giorno del mese in cui si eroga quello che è maturato nel mese '
  'prima. Vale come default; il singolo mese può scrivere la sua data in '
  'pl_months.payout_date (ad agosto 2026 si è anticipata al 13).';
comment on column pl_months.payout_date is
  '§285 — la data in cui si eroga quello che è maturato in **questo** mese. '
  'Chiude la finestra degli incassi che entrano nella distribuzione, e apre '
  'quella del mese dopo: senza, un incasso in ritardo si perde o si conta due '
  'volte. NULL = il giorno di default di pl_config.';

alter table pl_config drop constraint if exists pl_config_payout_day_ck;
alter table pl_config add constraint pl_config_payout_day_ck
  check (payout_day between 1 and 28);
