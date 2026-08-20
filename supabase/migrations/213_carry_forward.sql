-- §290 — Una riga non saldata non si perde alla chiusura del mese.
--
-- Il conto economico dice **in che mese il lavoro è stato fatto**, e quella
-- appartenenza non cambia perché il cliente paga in ritardo: la fattura 50/26 è
-- stata emessa il 4 agosto, l'IVA di quel trimestre la contiene, e i compensi di
-- agosto sono stati calcolati su quel ricavo. Spostare la riga a settembre
-- vorrebbe dire riscrivere tre cose che sono già state dichiarate fuori.
--
-- Quello che serve davvero è un'altra cosa: **che nessuno la perda di vista**.
-- Finora la riga scoperta compariva nel mese nuovo perché `openAt` la deduceva
-- ogni volta dalle date — funzionava, ma era una deduzione, non un fatto: non
-- si sapeva *quando* era stata trascinata né *quante volte*, e una riga che si
-- trascina da tre mesi si legge identica a una scaduta ieri.
--
-- Perciò la chiusura lascia un segno:
--   · `carried_at`    il giorno in cui la chiusura l'ha trascinata
--   · `carried_from`  da quale mese arriva (il suo, la prima volta)
--   · `carry_count`   quante chiusure si è portata dietro
--
-- La riga resta nel suo mese. Riaprire il mese cancella il segno, perché
-- riaprire vuol dire che quella chiusura non è più successa.

alter table public.pl_revenue_lines
  add column if not exists carried_at   date,
  add column if not exists carried_from date,
  add column if not exists carry_count  integer not null default 0;

alter table public.pl_cost_lines
  add column if not exists carried_at   date,
  add column if not exists carried_from date,
  add column if not exists carry_count  integer not null default 0;

comment on column public.pl_revenue_lines.carried_at is
  '§290 — giorno in cui la chiusura del mese ha trascinato avanti la riga scoperta. La riga resta nel suo mese: cambia solo dove si va a spuntarla.';
comment on column public.pl_cost_lines.carried_at is
  '§290 — giorno in cui la chiusura del mese ha trascinato avanti la riga scoperta. La riga resta nel suo mese: cambia solo dove si va a spuntarla.';

-- Le righe scoperte dei mesi già chiusi: sono trascinate da sempre, e senza
-- questo backfill il mese in corso le mostrerebbe come se fossero arrivate oggi.
update public.pl_revenue_lines l
   set carried_at   = coalesce(m.closed_at::date, current_date),
       carried_from = m.month,
       carry_count  = greatest(1, l.carry_count)
  from public.pl_months m
 where m.id = l.month_id
   and m.status = 'chiuso'
   and l.paid = false
   and l.carried_at is null;

update public.pl_cost_lines l
   set carried_at   = coalesce(m.closed_at::date, current_date),
       carried_from = m.month,
       carry_count  = greatest(1, l.carry_count)
  from public.pl_months m
 where m.id = l.month_id
   and m.status = 'chiuso'
   and l.paid = false
   and (coalesce(l.actual, 0) > 0 or l.budget > 0)
   and l.carried_at is null;

create index if not exists idx_pl_revenue_carried on public.pl_revenue_lines(carried_at)
  where carried_at is not null;
create index if not exists idx_pl_cost_carried on public.pl_cost_lines(carried_at)
  where carried_at is not null;
