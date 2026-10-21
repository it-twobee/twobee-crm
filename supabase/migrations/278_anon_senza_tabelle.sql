-- 278 — Chi non ha fatto login non tocca nessuna tabella (§492).
-- Di fabbrica Supabase dà al ruolo `anon` — chiunque abbia la chiave pubblica,
-- che sta nel JavaScript di ogni browser — tutti i permessi su tutte le tabelle
-- di `public`, TRUNCATE compreso, e lascia alla RLS il compito di fermarlo riga
-- per riga. Qui la RLS reggeva, ma bastava una policy scritta male su una
-- tabella nuova per aprirla a internet. Verificato il 21 ottobre 2026: nessuna
-- pagina pubblica legge tabelle senza login (login e reset usano solo l'auth,
-- gli inviti passano dal service role in /api/invite/*, i link pubblici dei
-- file pure), quindi ad anon non serve niente.
--
-- · anon: nessun permesso su tabelle, viste e sequenze, oggi e per quelle future.
-- · le cinque policy `true` scritte per `public` valgono solo per authenticated
--   (menu del workspace, date commerciali, titolari delle trattative).
-- · authenticated: via TRUNCATE, REFERENCES e TRIGGER — l'API non li usa, e
--   TRUNCATE non passa dalla RLS. Lettura e scrittura restano come sono.
-- Rilanciabile.
BEGIN;
SET LOCAL lock_timeout = '5s';

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;

ALTER POLICY commercial_events_leggo ON public.commercial_events TO authenticated;
ALTER POLICY commercial_event_dates_leggo ON public.commercial_event_dates TO authenticated;
ALTER POLICY wsp_read_all ON public.workspace_section_permissions TO authenticated;
ALTER POLICY workspace_sections_read_all ON public.workspace_sections TO authenticated;
ALTER POLICY deal_owners_leggo ON public.deal_owners TO authenticated;

REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
