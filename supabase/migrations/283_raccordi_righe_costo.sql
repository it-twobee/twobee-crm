-- 283 — raccordi banca–fatture su addebiti con sole righe costo
--
-- La 281 rifiuta ogni movimento con `cost_line_id`, `payment_allocations` o
-- `bank_tx_lines`. Gli addebiti Meta di luglio-agosto 2026 stanno nel conto
-- economico come righe costo (campo diretto e quote) e **non hanno fattura**:
-- il raccordo documentale non duplica niente, perché non tocca righe, quote,
-- spunte né `paid_on` e la quota raccordata si somma soltanto ai raccordi attivi
-- (`reconciliation_free` non sottrae le quote economiche).
--
-- Cambia **solo** il controllo del movimento nel ramo `save`: passa chi ha come
-- unici riferimenti economici righe costo senza fattura propria
-- (`pl_cost_lines.invoice_id is null`). Restano bloccati ricavi, compensi
-- (`payout_id`), F24, cedolini, fatture risorse, riga che punta già a una
-- fattura, e il ramo `unlink_legacy` non cambia. Il controllo lato fattura
-- (righe che puntano alla fattura) resta com'è.
--
-- La regola è scritta anche in `costLineOnlyMovement` (lib/lab-matching.ts): le
-- due devono dire la stessa cosa.
--
-- Si ferma da sola se in produzione la funzione non è quella della 281.

begin;

do $$
declare def text;
begin
  select pg_get_functiondef('public.save_bank_invoice_reconciliation(uuid,integer,uuid,text,jsonb)'::regprocedure) into def;
  if def is null
     or position('Movimento già impegnato o non utilizzabile' in def)=0
     or position('txrow.cost_line_id is not null or txrow.payslip_id is not null' in def)=0
     or position('where r.invoice_id=docrow.id or c.invoice_id=docrow.id' in def)=0 then
    raise exception 'save_bank_invoice_reconciliation in produzione non è quella della 281: confronta con pg_get_functiondef prima di applicare.';
  end if;
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
       or txrow.revenue_line_id is not null or txrow.payslip_id is not null or txrow.hr_invoice_id is not null
       or (txrow.cost_line_id is not null and not exists(select 1 from public.pl_cost_lines c where c.id=txrow.cost_line_id and c.invoice_id is null))
       or exists(select 1 from public.payment_allocations a where a.tx_id=txrow.id and not (a.cost_line_id is not null and a.revenue_line_id is null and a.payout_id is null and a.f24_id is null and exists(select 1 from public.pl_cost_lines c where c.id=a.cost_line_id and c.invoice_id is null)))
       or exists(select 1 from public.bank_tx_lines a where a.tx_id=txrow.id and not (a.cost_line_id is not null and a.revenue_line_id is null and exists(select 1 from public.pl_cost_lines c where c.id=a.cost_line_id and c.invoice_id is null)))
       or exists(select 1 from public.bank_tx_payslips where tx_id=txrow.id) then raise exception 'Movimento già impegnato o non utilizzabile. Verifica i riferimenti esistenti.'; end if;
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
