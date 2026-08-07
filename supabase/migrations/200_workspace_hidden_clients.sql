-- ═══════════════════════════════════════════════════════════════════════════
-- §213 · Nascondere un cliente al workspace
-- ═══════════════════════════════════════════════════════════════════════════
--
-- GAV Sistemi non è un cliente: è un giro di fatture fra società collegate.
-- Nel portale operativo compariva in elenco, nella ricerca, nel selettore delle
-- task ad hoc e nel customer care — undici clienti di cui uno non esiste, e chi
-- lavora non ha modo di saperlo. Il costo non è estetico: qualcuno prima o poi
-- ci apre un ticket o ci assegna una task.
--
-- **Perché una colonna nuova e non `is_internal`.** Sono due domande diverse:
-- `is_internal` dice «non conta nelle statistiche» (`countsInStats`), e la
-- risposta riguarda i **numeri**; `workspace_hidden` dice «il team operativo non
-- lo vede», e riguarda le **persone**. Un cliente interno può avere lavorazioni
-- vere da mostrare, e un cliente vero può essere riservato — una trattativa in
-- corso, un contenzioso — senza per questo uscire dai conti. Farli coincidere
-- avrebbe legato due decisioni che si prendono in momenti diversi.
--
-- **Perché nella VIEW e non nelle pagine.** `clients_workspace` è già l'unica
-- porta da cui il workspace legge i clienti (§211): elenco, scheda, ricerca
-- globale, task ad hoc, customer care e ticket passano tutti di lì. Un filtro
-- qui vale per tutti e non si può dimenticare in una pagina nuova. Quindici
-- `.neq('workspace_hidden', true)` sparsi sarebbero quindici occasioni di
-- scordarsene una.
--
-- **Cosa NON nasconde**, e sta scritto anche nella UI: il lavoro. Se un cliente
-- nascosto ha progetti o task assegnate, quelle restano visibili a chi le ha in
-- carico. Toglierle di mezzo farebbe sparire attività dalla lista di qualcuno
-- senza dirglielo, che è il modo peggiore di far perdere una consegna.
--
-- Idempotente.

BEGIN;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS workspace_hidden BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.clients.workspace_hidden IS
  '§213 — fuori dal portale operativo: non compare in elenco, ricerca, ad hoc, customer care né ticket. Diverso da is_internal, che riguarda le statistiche. Il lavoro già assegnato resta visibile a chi lo ha in carico.';

/* Backfill dichiarato: i clienti interni nascono nascosti, perché è il caso per
   cui la colonna esiste. Non è irreversibile — l'admin la riapre dall'anagrafica
   con una spunta, e da lì in poi decide caso per caso. */
UPDATE public.clients SET workspace_hidden = true
 WHERE is_internal AND NOT workspace_hidden;

-- CREATE OR REPLACE VIEW non permette di cambiare l'elenco delle colonne, e qui
-- cambia solo il WHERE: la ricreiamo comunque, identica alla 197 più il filtro.
DROP VIEW IF EXISTS public.clients_workspace;

CREATE VIEW public.clients_workspace WITH (security_invoker = false) AS
SELECT
  id, company_name, display_name,
  contract_start, contract_end, payment_status,
  active_channels, status, client_type, client_label, is_internal, created_at, created_by,
  industry, market_area,
  target_leads_monthly, target_roas, target_followers_monthly, target_ctr, target_conv_rate,
  phone, website,
  -- AZZERATI: economico/fiscale, non visibile al workspace
  0::numeric               AS mrr,
  NULL::text               AS legal_name,
  NULL::numeric            AS target_revenue_monthly,
  NULL::numeric            AS target_cpa,
  NULL::numeric            AS ad_budget_monthly,
  NULL::text               AS piva,
  NULL::text               AS fiscal_code,
  NULL::text               AS address,
  NULL::text               AS city,
  NULL::text               AS cap,
  NULL::text               AS country,
  NULL::text               AS sdi_code,
  NULL::text               AS pec,
  NULL::text               AS email_pec,
  NULL::text               AS notes,
  NULL::text               AS goals_notes
FROM public.clients c
WHERE public.is_staff()
  AND NOT c.workspace_hidden
  AND (
    NOT public.is_external_resource()
    OR c.id IN (
      SELECT p.client_id FROM public.projects p
      WHERE p.id = ANY (public.get_my_v2_project_ids()) AND p.client_id IS NOT NULL
    )
  );

GRANT SELECT ON public.clients_workspace TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
