create role anon; create role authenticated; create role service_role bypassrls;
create table profiles(id uuid primary key,email text,app_role text,is_active boolean default true);
create table bank_accounts(id uuid primary key,currency text);
create table invoices(id uuid primary key,total numeric,currency text,direction text,sign integer,withholding numeric default 0,excluded_reason text,rectifies_id uuid,issued_on date);
create table bank_transactions(id uuid primary key,account_id uuid,booked_on date,amount numeric,source text,kind text,invoice_id uuid,revenue_line_id uuid,cost_line_id uuid,payslip_id uuid,hr_invoice_id uuid,transfer_pair_id uuid,no_match_needed boolean default false);
create table payment_allocations(id uuid,tx_id uuid,revenue_line_id uuid,cost_line_id uuid,payout_id uuid,f24_id uuid,amount numeric);
create table bank_tx_lines(id uuid,tx_id uuid,revenue_line_id uuid,cost_line_id uuid,amount numeric);
create table bank_tx_payslips(tx_id uuid,payslip_id uuid,amount numeric);
create table pl_revenue_lines(id uuid,invoice_id uuid);
create table pl_cost_lines(id uuid,invoice_id uuid);
create table hr_invoices(id uuid,invoice_id uuid);
insert into profiles values('00000000-0000-4000-8000-000000000001','m.lucci@twobee.it','super_admin',true);
insert into bank_accounts values('00000000-0000-4000-8000-000000000010','EUR');
insert into invoices(id,total,currency,direction,sign,issued_on) values
('00000000-0000-4000-8000-000000000101',300,'EUR','emessa',1,'2026-01-01'),
('00000000-0000-4000-8000-000000000102',200,'EUR','emessa',1,'2026-01-01'),
('00000000-0000-4000-8000-000000000103',100,'EUR','emessa',1,'2026-01-01');
insert into bank_transactions(id,account_id,amount,source,kind,booked_on) values
('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000010',100,'banca','incasso','2026-01-02'),
('00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000010',200,'banca','incasso','2026-01-02'),
('00000000-0000-4000-8000-000000000203','00000000-0000-4000-8000-000000000010',300,'banca','incasso','2026-01-02');

grant select,insert,update,delete on all tables in schema public to service_role;

insert into invoices(id,total,currency,direction,sign,issued_on,rectifies_id) values
('00000000-0000-4000-8000-000000000105',100,'EUR','emessa',1,'2026-01-01',null),
('00000000-0000-4000-8000-000000000104',100,'EUR','emessa',-1,'2026-01-01','00000000-0000-4000-8000-000000000105');
insert into bank_transactions(id,account_id,amount,source,kind,booked_on) values('00000000-0000-4000-8000-000000000205','00000000-0000-4000-8000-000000000010',-100,'banca','pagamento','2026-01-02');
