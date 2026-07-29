-- 159 — Referenti e stakeholder del cliente leggibili da tutto il team interno.
--
-- Problema: `client_contacts_team` (001) e `stakeholders_team` (002) filtrano su
-- get_my_client_ids(), cioè sulle client_assignments. Dopo la 092/106 il team interno
-- legge TUTTI i clienti ma non le persone che ci stanno dentro: un manager apre dal
-- workspace un cliente a cui non è assegnato, vede la scheda e la sezione referenti
-- vuota — e un referente appena aggiunto sparisce al primo refresh.
--
-- Qui: stesso confine della 148. Team interno = tutti; risorse esterne (freelance,
-- partner) = solo i clienti dei progetti di cui sono membri. La scrittura resta
-- fuori da RLS: passa dalle server action con service role, che ammettono admin e
-- manager per i referenti e solo admin per gli stakeholder.
--
-- L'helper è `get_my_v2_project_ids()` (148): `get_my_project_ids()` della 106 è
-- stato droppato nel reset del modello progetto.
--
-- Additiva e idempotente.

BEGIN;

-- ── REFERENTI CLIENTE ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "client_contacts_team" ON public.client_contacts;
CREATE POLICY "client_contacts_team" ON public.client_contacts
  FOR SELECT USING (
    public.get_my_role() = 'team' AND NOT public.is_external_resource()
  );

DROP POLICY IF EXISTS "client_contacts_external" ON public.client_contacts;
CREATE POLICY "client_contacts_external" ON public.client_contacts
  FOR SELECT USING (
    public.get_my_role() = 'team' AND public.is_external_resource() AND
    client_id IN (
      SELECT p.client_id FROM public.projects p
      WHERE p.id = ANY (public.get_my_v2_project_ids()) AND p.client_id IS NOT NULL
    )
  );

-- ── OWNER / STAKEHOLDER / COLLABORATORI ──────────────────────────────────────
DROP POLICY IF EXISTS "stakeholders_team" ON public.client_stakeholders;
CREATE POLICY "stakeholders_team" ON public.client_stakeholders
  FOR SELECT USING (
    public.get_my_role() = 'team' AND NOT public.is_external_resource()
  );

DROP POLICY IF EXISTS "stakeholders_external" ON public.client_stakeholders;
CREATE POLICY "stakeholders_external" ON public.client_stakeholders
  FOR SELECT USING (
    public.get_my_role() = 'team' AND public.is_external_resource() AND
    client_id IN (
      SELECT p.client_id FROM public.projects p
      WHERE p.id = ANY (public.get_my_v2_project_ids()) AND p.client_id IS NOT NULL
    )
  );

COMMIT;
