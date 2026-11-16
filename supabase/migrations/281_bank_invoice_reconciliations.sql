-- 281 — Raccordi bancari/documentali espliciti, versionati e revocabili.
begin;
create table if not exists public.bank_invoice_reconciliations (
 id uuid primary key, version integer not null default 1 check(version > 0),
 status text not null default 'active' check(status in ('active','cancelled')),
 note text not null default '' check(length(note)<=1000), created_by uuid not null, updated_by uuid not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 verified_at timestamptz, verified_by uuid
);
create table if not exists public.bank_invoice_reconciliation_items (
 id uuid primary key default gen_random_uuid(), reconciliation_id uuid not null references public.bank_invoice_reconciliations(id),
 tx_id uuid not null references public.bank_transactions(id), invoice_id uuid not null references public.invoices(id),
 amount numeric(14,2) not null check(amount > 0 and amount <= 999999999999.99), unique(reconciliation_id,tx_id,invoice_id)
);
create table if not exists public.bank_invoice_reconciliation_events (
 id uuid primary key, reconciliation_id uuid not null references public.bank_invoice_reconciliations(id),
 actor_id uuid not null, actor_label text not null, operation text not null,
 request jsonb not null, before_snapshot jsonb, after_snapshot jsonb not null, created_at timestamptz not null default now()
);
create index if not exists bank_invoice_items_tx on public.bank_invoice_reconciliation_items(tx_id);
create index if not exists bank_invoice_items_invoice on public.bank_invoice_reconciliation_items(invoice_id);
create index if not exists bank_invoice_events_group on public.bank_invoice_reconciliation_events(reconciliation_id,created_at);
alter table public.bank_invoice_reconciliations enable row level security;
alter table public.bank_invoice_reconciliation_items enable row level security;
alter table public.bank_invoice_reconciliation_events enable row level security;
revoke all on public.bank_invoice_reconciliations,public.bank_invoice_reconciliation_items,public.bank_invoice_reconciliation_events from public,anon,authenticated;
grant select,insert,update,delete on public.bank_invoice_reconciliations,public.bank_invoice_reconciliation_items,public.bank_invoice_reconciliation_events to service_role;

create or replace function public.lock_bank_invoice_reconciliations() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin perform pg_advisory_xact_lock(20261117,1); return null; end $$;
revoke all on function public.lock_bank_invoice_reconciliations() from public,anon,authenticated;

-- All competing legacy writers take the same transaction lock; no new reconciliation can race them.
create or replace function public.guard_bank_invoice_reconciliations() returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_tx uuid; v_invoice uuid; v_old_tx uuid; v_old_invoice uuid;
begin
 perform pg_advisory_xact_lock(20261117,1);
 if tg_table_name='bank_invoice_reconciliation_events' and tg_op<>'INSERT' then raise exception 'Lo storico raccordi non si modifica o cancella.'; end if;
 if current_setting('twobee.reconciliation_write',true)='on' and coalesce(current_setting('request.jwt.claims',true),'{}')::jsonb->>'role'='service_role' then
   if tg_op='DELETE' then return old; else return new; end if;
 end if;
 if tg_table_name like 'bank_invoice_reconcil%' then raise exception 'Usare il comando atomico dei raccordi.'; end if;
 if tg_table_name='bank_transactions' then
   if tg_op='UPDATE' and jsonb_build_array(new.amount,new.account_id,new.booked_on,new.source,new.kind,new.invoice_id,new.revenue_line_id,new.cost_line_id,new.payslip_id,new.hr_invoice_id,new.transfer_pair_id,new.no_match_needed)=jsonb_build_array(old.amount,old.account_id,old.booked_on,old.source,old.kind,old.invoice_id,old.revenue_line_id,old.cost_line_id,old.payslip_id,old.hr_invoice_id,old.transfer_pair_id,old.no_match_needed) then return new; end if;
   if tg_op<>'INSERT' then v_tx:=old.id; end if;
   if tg_op<>'DELETE' then v_invoice:=new.invoice_id; end if;
 elsif tg_table_name='invoices' then
   if tg_op='UPDATE' and jsonb_build_array(new.total,new.currency,new.direction,new.sign,new.withholding,new.excluded_reason,new.rectifies_id,new.issued_on)=jsonb_build_array(old.total,old.currency,old.direction,old.sign,old.withholding,old.excluded_reason,old.rectifies_id,old.issued_on) then return new; end if;
   if tg_op<>'INSERT' then v_invoice:=old.id; v_old_invoice:=old.rectifies_id; end if;
   if tg_op<>'DELETE' then
     if exists(select 1 from public.bank_invoice_reconciliation_items i join public.bank_invoice_reconciliations h on h.id=i.reconciliation_id where h.status='active' and i.invoice_id in(new.id,new.rectifies_id)) then raise exception 'Prima modifica o rimuovi i raccordi della fattura.'; end if;
   end if;
 elsif tg_table_name='bank_accounts' then
   if tg_op='UPDATE' and new.currency is not distinct from old.currency then return new; end if;
   if exists(select 1 from public.bank_invoice_reconciliation_items i join public.bank_invoice_reconciliations h on h.id=i.reconciliation_id join public.bank_transactions t on t.id=i.tx_id where h.status='active' and t.account_id=old.id) then raise exception 'Conto utilizzato da raccordi attivi.'; end if;
 elsif tg_table_name in ('pl_revenue_lines','pl_cost_lines') then
   if tg_op='UPDATE' and new.invoice_id is not distinct from old.invoice_id then return new; end if;
   if tg_op<>'DELETE' and exists(select 1 from public.bank_invoice_reconciliation_items i join public.bank_invoice_reconciliations h on h.id=i.reconciliation_id where h.status='active' and i.invoice_id=new.invoice_id) then
     if exists(select 1 from public.bank_transactions t where t.revenue_line_id=new.id or t.cost_line_id=new.id)
       or exists(select 1 from public.payment_allocations a where a.revenue_line_id=new.id or a.cost_line_id=new.id)
       or exists(select 1 from public.bank_tx_lines a where a.revenue_line_id=new.id or a.cost_line_id=new.id) then raise exception 'Il collegamento economico interessa una fattura già raccordata: verifica prima i raccordi.'; end if;
   end if;
 else
   if tg_op<>'INSERT' then v_old_tx:=old.tx_id; end if;
   if tg_op<>'DELETE' then v_tx:=new.tx_id; end if;
 end if;
 if exists(select 1 from public.bank_invoice_reconciliation_items i join public.bank_invoice_reconciliations h on h.id=i.reconciliation_id where h.status='active' and (i.tx_id in(v_tx,v_old_tx) or i.invoice_id in(v_invoice,v_old_invoice))) then raise exception 'Prima modifica o rimuovi il raccordo esistente: le quote non possono essere sovrascritte da un altro percorso.'; end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function public.guard_bank_invoice_reconciliations() from public,anon,authenticated;
do $$ declare t text; begin
 foreach t in array array['bank_invoice_reconciliations','bank_invoice_reconciliation_items','bank_invoice_reconciliation_events','bank_transactions','invoices','bank_accounts','payment_allocations','bank_tx_lines','bank_tx_payslips','pl_revenue_lines','pl_cost_lines'] loop
   execute format('drop trigger if exists trg_bank_invoice_reconciliation_lock on public.%I',t);
   execute format('create trigger trg_bank_invoice_reconciliation_lock before insert or update or delete on public.%I for each statement execute function public.lock_bank_invoice_reconciliations()',t);
   execute format('drop trigger if exists trg_bank_invoice_reconciliations on public.%I',t);
   execute format('create trigger trg_bank_invoice_reconciliations before insert or update or delete on public.%I for each row execute function public.guard_bank_invoice_reconciliations()',t);
 end loop;
end $$;

create or replace function public.save_bank_invoice_reconciliation(p_id uuid,p_version integer,p_command uuid,p_operation text,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
 actor uuid; actor_name text; h public.bank_invoice_reconciliations%rowtype; old_snapshot jsonb; new_snapshot jsonb; prior public.bank_invoice_reconciliation_events%rowtype;
 txs uuid[]; docs uuid[]; tx_count integer; doc_count integer; total_free numeric; total_due numeric; txrow record; docrow record; free numeric; due numeric; quota numeric; expected_pairs jsonb:='[]'; old_invoice uuid;
 today date := (now() at time zone 'Europe/Rome')::date;
begin
 if coalesce(current_setting('request.jwt.claims',true),'{}')::jsonb->>'role' is distinct from 'service_role' then raise exception 'Permesso negato'; end if;
 actor:=nullif(coalesce(current_setting('request.headers',true),'{}')::jsonb->>'x-actor-id','')::uuid;
 select coalesce(email,id::text) into actor_name from public.profiles where id=actor and is_active is distinct from false and (app_role='super_admin' or lower(email)='m.lucci@twobee.it');
 if actor_name is null then raise exception 'Permesso negato'; end if;
 if p_operation not in ('save','verify','cancel','unlink_legacy') or p_payload is null or length(p_payload::text)>16000 or length(coalesce(p_payload->>'note',''))>1000 then raise exception 'Richiesta non valida'; end if;
 perform pg_advisory_xact_lock(20261117,1);
 select * into prior from public.bank_invoice_reconciliation_events where id=p_command;
 if found then
   if prior.actor_id<>actor or prior.reconciliation_id<>p_id or prior.operation<>p_operation or prior.request<>p_payload then raise exception 'Richiesta ripetuta con contenuto diverso'; end if;
   return prior.after_snapshot;
 end if;
 select * into h from public.bank_invoice_reconciliations where id=p_id for update;
 if found then
   if h.version<>p_version or h.status<>'active' then raise exception 'Raccordo aggiornato da un’altra sessione. Ricarica prima di confermare.'; end if;
   old_snapshot:=jsonb_build_object('head',to_jsonb(h),'items',(select coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]') from public.bank_invoice_reconciliation_items i where reconciliation_id=p_id));
 elsif p_version<>0 or p_operation not in ('save','unlink_legacy') then raise exception 'Raccordo non disponibile'; end if;
 perform set_config('twobee.reconciliation_write','on',true);
 if p_operation='unlink_legacy' then
   if h.id is not null then raise exception 'Raccordo storico già acquisito'; end if;
   select * into txrow from public.bank_transactions where id=(p_payload->>'adoptMovement')::uuid for update;
   if not found or txrow.invoice_id::text is distinct from p_payload->>'adoptInvoice' or txrow.invoice_id is null or txrow.source<>'banca' or txrow.amount=0
     or txrow.revenue_line_id is not null or txrow.cost_line_id is not null or txrow.payslip_id is not null or txrow.hr_invoice_id is not null
     or exists(select 1 from public.payment_allocations where tx_id=txrow.id) or exists(select 1 from public.bank_tx_lines where tx_id=txrow.id) or exists(select 1 from public.bank_tx_payslips where tx_id=txrow.id)
     or exists(select 1 from public.bank_invoice_reconciliation_items i join public.bank_invoice_reconciliations h2 on h2.id=i.reconciliation_id where h2.status='active' and i.tx_id=txrow.id) then raise exception 'Raccordo storico cambiato o con riferimenti economici: verifica prima le prove.'; end if;
   old_snapshot:=jsonb_build_object('legacyMovement',txrow.id,'legacyInvoice',txrow.invoice_id,'legacyAmount',txrow.amount);
   insert into public.bank_invoice_reconciliations(id,status,created_by,updated_by,note) values(p_id,'cancelled',actor,actor,coalesce(p_payload->>'note',''));
   insert into public.bank_invoice_reconciliation_items(reconciliation_id,tx_id,invoice_id,amount) values(p_id,txrow.id,txrow.invoice_id,abs(txrow.amount));
   update public.bank_transactions set invoice_id=null where id=txrow.id;
 elsif p_operation='save' then
   select array_agg(distinct value::uuid) into txs from jsonb_array_elements_text(p_payload->'movements');
   select array_agg(distinct value::uuid) into docs from jsonb_array_elements_text(p_payload->'invoices');
   tx_count:=coalesce(cardinality(txs),0);doc_count:=coalesce(cardinality(docs),0);
   if tx_count<1 or doc_count<1 or tx_count>50 or doc_count>50 or tx_count>1 and doc_count>1 then raise exception 'Seleziona un movimento e più fatture, oppure una fattura e più movimenti.'; end if;
   if p_payload->>'adoptMovement' is not null and not ((p_payload->>'adoptMovement')::uuid=any(txs)) then raise exception 'Mantieni selezionato il movimento storico da modificare.'; end if;
   perform 1 from public.bank_transactions where id=any(txs) order by id for update;
   perform 1 from public.invoices where id=any(docs) order by id for update;
   if (select count(*) from public.bank_transactions where id=any(txs))<>tx_count or (select count(*) from public.invoices where id=any(docs))<>doc_count then raise exception 'Una fonte non è più disponibile'; end if;
   if exists(select 1 from public.bank_transactions t left join public.bank_accounts a on a.id=t.account_id where t.id=any(txs) and a.id is null) then raise exception 'Conto del movimento non disponibile'; end if;
   for txrow in select t.*,a.currency as account_currency from public.bank_transactions t join public.bank_accounts a on a.id=t.account_id where t.id=any(txs) loop
     if txrow.source is distinct from 'banca' or txrow.booked_on is null or txrow.booked_on>today or txrow.amount is null or not(abs(txrow.amount)>0 and abs(txrow.amount)<=999999999999.99) or txrow.kind in ('giroconto','finanziamento') or txrow.transfer_pair_id is not null or txrow.no_match_needed
       or txrow.revenue_line_id is not null or txrow.cost_line_id is not null or txrow.payslip_id is not null or txrow.hr_invoice_id is not null
       or exists(select 1 from public.payment_allocations where tx_id=txrow.id) or exists(select 1 from public.bank_tx_lines where tx_id=txrow.id) or exists(select 1 from public.bank_tx_payslips where tx_id=txrow.id) then raise exception 'Movimento già impegnato o non utilizzabile. Verifica i riferimenti esistenti.'; end if;
     if txrow.invoice_id is not null then
       if p_payload->>'adoptMovement' is distinct from txrow.id::text or p_payload->>'adoptInvoice' is distinct from txrow.invoice_id::text then raise exception 'Il movimento ha già una fattura: apri Modifica dal registro raccordi.'; end if;
       old_invoice:=txrow.invoice_id;
       old_snapshot:=coalesce(old_snapshot,'{}')||jsonb_build_object('legacyMovement',txrow.id,'legacyInvoice',old_invoice,'legacyAmount',txrow.amount);
     end if;
   end loop;
   for docrow in select * from public.invoices where id=any(docs) loop
     if docrow.total is null or not(docrow.total>0 and docrow.total<=999999999999.99) or docrow.currency is null or trim(docrow.currency)='' or docrow.direction is null or docrow.direction not in('emessa','ricevuta') or docrow.sign is null or docrow.sign not in(-1,1) or coalesce(docrow.withholding,0)<>0 or docrow.excluded_reason is not null or docrow.sign>0 and exists(select 1 from public.invoices where rectifies_id=docrow.id and sign<0) or docrow.issued_on is null or docrow.issued_on>today then raise exception 'Fattura rettificata, con ritenute o incompleta: verifica prima il documento.'; end if;
     if exists(select 1 from public.bank_transactions t left join public.pl_revenue_lines r on r.id=t.revenue_line_id left join public.pl_cost_lines c on c.id=t.cost_line_id left join public.hr_invoices hr on hr.id=t.hr_invoice_id where r.invoice_id=docrow.id or c.invoice_id=docrow.id or hr.invoice_id=docrow.id)
       or exists(select 1 from public.payment_allocations a left join public.pl_revenue_lines r on r.id=a.revenue_line_id left join public.pl_cost_lines c on c.id=a.cost_line_id where r.invoice_id=docrow.id or c.invoice_id=docrow.id)
       or exists(select 1 from public.bank_tx_lines a left join public.pl_revenue_lines r on r.id=a.revenue_line_id left join public.pl_cost_lines c on c.id=a.cost_line_id where r.invoice_id=docrow.id or c.invoice_id=docrow.id) then raise exception 'La fattura ha quote economiche storiche: verifica questi raccordi prima di aggiungerne altri.'; end if;
     if exists(select 1 from public.bank_transactions t join public.bank_accounts a on a.id=t.account_id where t.invoice_id=docrow.id and t.source='banca' and (t.booked_on>today or sign(t.amount)<>(case when docrow.direction='emessa' then 1 else -1 end)*docrow.sign or a.currency is distinct from docrow.currency or t.kind in('giroconto','finanziamento') or t.transfer_pair_id is not null or t.payslip_id is not null or t.hr_invoice_id is not null or t.revenue_line_id is not null or t.cost_line_id is not null or exists(select 1 from public.payment_allocations where tx_id=t.id) or exists(select 1 from public.bank_tx_lines where tx_id=t.id) or exists(select 1 from public.bank_tx_payslips where tx_id=t.id))) then raise exception 'Riferimenti bancari della fattura da verificare'; end if;
     if exists(select 1 from public.bank_transactions t join public.bank_accounts a on a.id=t.account_id where t.id=any(txs) and (a.currency is distinct from docrow.currency or sign(t.amount)<>(case when docrow.direction='emessa' then 1 else -1 end)*docrow.sign)) then raise exception 'Verso o valuta incompatibili'; end if;
   end loop;
   create temporary table if not exists reconciliation_free(id uuid primary key,amount numeric) on commit drop;
   create temporary table if not exists reconciliation_due(id uuid primary key,amount numeric) on commit drop;
   truncate reconciliation_free,reconciliation_due;
   insert into reconciliation_free select t.id,abs(t.amount)-coalesce((select sum(i.amount) from public.bank_invoice_reconciliation_items i join public.bank_invoice_reconciliations h2 on h2.id=i.reconciliation_id where h2.status='active' and h2.id<>p_id and i.tx_id=t.id),0) from public.bank_transactions t where t.id=any(txs);
   insert into reconciliation_due select d.id,d.total-coalesce((select sum(i.amount) from public.bank_invoice_reconciliation_items i join public.bank_invoice_reconciliations h2 on h2.id=i.reconciliation_id where h2.status='active' and h2.id<>p_id and i.invoice_id=d.id),0)-coalesce((select sum(abs(t.amount)) from public.bank_transactions t where t.invoice_id=d.id and t.source='banca' and t.booked_on<=today and (p_payload->>'adoptMovement' is null or t.id::text<>p_payload->>'adoptMovement')),0) from public.invoices d where d.id=any(docs);
   if exists(select 1 from reconciliation_free where amount<=0) or exists(select 1 from reconciliation_due where amount<=0) then raise exception 'Disponibilità cambiata: ricarica i dati'; end if;
   select sum(amount) into total_free from reconciliation_free;select sum(amount) into total_due from reconciliation_due;
   if doc_count>1 and total_due>total_free or tx_count>1 and total_free>total_due then raise exception 'Ripartizione non univoca: verifica la distinta e seleziona le componenti corrette.'; end if;
   select jsonb_agg(jsonb_build_object('movementId',t.id,'documentId',d.id,'amount',least(t.amount,d.amount)) order by t.id,d.id) into expected_pairs from reconciliation_free t cross join reconciliation_due d;
   if (select jsonb_agg(value order by value->>'movementId',value->>'documentId') from jsonb_array_elements(p_payload->'pairs')) is distinct from expected_pairs then raise exception 'Le quote sono cambiate: ricarica e controlla prima di confermare.'; end if;
   if h.id is null then insert into public.bank_invoice_reconciliations(id,created_by,updated_by,note) values(p_id,actor,actor,coalesce(p_payload->>'note','')); else update public.bank_invoice_reconciliations set version=version+1,updated_by=actor,updated_at=now(),verified_at=null,verified_by=null,note=coalesce(p_payload->>'note','') where id=p_id; end if;
   delete from public.bank_invoice_reconciliation_items where reconciliation_id=p_id;
   insert into public.bank_invoice_reconciliation_items(reconciliation_id,tx_id,invoice_id,amount) select p_id,(value->>'movementId')::uuid,(value->>'documentId')::uuid,(value->>'amount')::numeric from jsonb_array_elements(expected_pairs);
   if old_invoice is not null then update public.bank_transactions set invoice_id=null where id=(p_payload->>'adoptMovement')::uuid; end if;
 elsif p_operation='cancel' then
   update public.bank_invoice_reconciliations set status='cancelled',version=version+1,updated_by=actor,updated_at=now(),verified_at=null,verified_by=null where id=p_id;
 else
   update public.bank_invoice_reconciliations set version=version+1,updated_by=actor,updated_at=now(),verified_at=now(),verified_by=actor where id=p_id;
 end if;
 select jsonb_build_object('head',to_jsonb(h2),'items',(select coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]') from public.bank_invoice_reconciliation_items i where reconciliation_id=p_id)) into new_snapshot from public.bank_invoice_reconciliations h2 where id=p_id;
 insert into public.bank_invoice_reconciliation_events(id,reconciliation_id,actor_id,actor_label,operation,request,before_snapshot,after_snapshot) values(p_command,p_id,actor,actor_name,p_operation,p_payload,old_snapshot,new_snapshot);
 perform set_config('twobee.reconciliation_write','off',true);
 return new_snapshot;
end $$;
revoke all on function public.save_bank_invoice_reconciliation(uuid,integer,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.save_bank_invoice_reconciliation(uuid,integer,uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
