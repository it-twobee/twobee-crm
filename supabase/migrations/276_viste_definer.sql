-- 276 — Le viste che leggono coi permessi di chi le ha create (§490).
-- Avvisi «critical» del linter di Supabase (security_definer_view), uno per uno:
--
-- · invoice_hr_hints (199) — **nessun filtro e leggibile da anon**: con la sola
--   chiave pubblica, quella che ogni browser scarica, rispondeva con id fattura,
--   id persona e nome dei collaboratori agganciati alle fatture ricevute
--   (verificato il 21 ottobre 2026: 10 righe senza login). L'app non la usa.
--   Passa a security_invoker e si chiude ad anon e authenticated: resta al
--   service role, dietro requireEconomicsAdmin.
-- · clients_workspace (§211) — filtra con is_staff(), quindi a anon restituiva
--   zero righe; il permesso però non serve a nessuno e si toglie.
-- · portal_projects, portal_companies — definer **di proposito**: il portale non
--   legge le tabelle base, e queste viste filtrano da sole su chi chiama
--   (anteprima staff o accesso al portale di quell'azienda), con security_barrier
--   e senza permesso per anon. Restano; lo dice un commento.
-- Rilanciabile.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER VIEW public.invoice_hr_hints SET (security_invoker = true);
REVOKE ALL ON public.invoice_hr_hints FROM anon, authenticated;

REVOKE ALL ON public.clients_workspace FROM anon;

COMMENT ON VIEW public.portal_projects IS
  'Definer di proposito: il portale cliente non legge projects; la vista filtra su portal_can_preview/portal_can_access e mostra solo i campi pubblicati.';
COMMENT ON VIEW public.portal_companies IS
  'Definer di proposito: il portale cliente non legge clients; la vista filtra su anteprima staff o accesso al portale di quell''azienda.';

NOTIFY pgrst, 'reload schema';
COMMIT;
