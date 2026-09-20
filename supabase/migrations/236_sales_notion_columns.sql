-- §369 — le colonne di Notion, tutte, e la provenienza del lead.
--
-- L'export del CRM ha ventiquattro colonne su cinquantacinque righe. Otto le
-- aveva già `deals`; dodici mancavano. Ci vanno tutte: la fedeltà al
-- millimetro è il motivo per cui qualcuno smetterà di aprire Notion, e una
-- colonna lasciata fuori «perché ora non serve» è la riga per cui si torna là.
--
-- **Tre colonne di Notion non arrivano, e si dichiara quali**: `Contacted
-- button` (un pulsante dell'interfaccia, zero valori), `Interactions` (un
-- rollup calcolato, zero valori) e `Deals` (una relazione interna a Notion,
-- due valori che puntano a pagine di Notion). Non sono dati: sono modi in cui
-- Notion mostra altri dati, e portarli qui vorrebbe dire portarsi dietro
-- Notion.
--
-- **`Owner` e `Account Owner` sono due persone diverse** e vanno tenute
-- separate o si confondono per sempre: `Owner` è il titolare dell'azienda
-- cliente — ventinove nomi distinti, gente che non ha un account qui — e
-- resta un testo. `Account Owner` siete voi, è **multi-persona** («Marco
-- Lucci, salvatore piacente») e diventa una tabella di raccordo: schiacciarlo
-- su `assigned_to` avrebbe buttato via il secondo nome senza dirlo.
--
-- **La provenienza Meta sta in `jsonb`, non in dodici colonne.** Campagna,
-- adset, annuncio, form, piattaforma e le tre risposte del modulo sono
-- **tracciabilità**: si leggono quando ci si chiede da dove è arrivato un
-- lead, non si modificano mai in cella. Colonne vere sono quelle che
-- qualcuno edita; il resto sarebbe larghezza senza uso.
--
-- Rilanciabile: `IF NOT EXISTS` ovunque.

BEGIN;

-- ── Le dodici di Notion ──────────────────────────────────────────────────

ALTER TABLE public.deals
  -- Priority e Membership hanno un elenco chiuso su Notion: qui è un CHECK,
  -- così un valore inventato viene rifiutato invece di finire in un filtro
  -- che poi non trova niente.
  ADD COLUMN IF NOT EXISTS priority          text,
  ADD COLUMN IF NOT EXISTS membership        text,
  -- Tags e Services sono multi-select: array, non testo con le virgole —
  -- «Beauty, Marketing» come stringa non si filtra e non si conta.
  ADD COLUMN IF NOT EXISTS tags              text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS services          text[] NOT NULL DEFAULT '{}',
  -- chi ha segnalato: sei nomi ricorrenti, ma è testo libero su Notion
  ADD COLUMN IF NOT EXISTS referral          text,
  -- il fatturato **dell'azienda**, non nostro: non è un valore economico di
  -- TwoBee e non entra da nessuna parte in Economics (§ invariante)
  ADD COLUMN IF NOT EXISTS fatturato         numeric,
  -- il titolare dell'azienda cliente: una persona che qui non ha un account
  ADD COLUMN IF NOT EXISTS owner_name        text,
  ADD COLUMN IF NOT EXISTS website           text,
  ADD COLUMN IF NOT EXISTS address           text,
  ADD COLUMN IF NOT EXISTS drive_url         text,
  -- «Start»: da quando è cliente. Diverso da `created_at`, che è da quando
  -- esiste la riga — su Notion dodici righe hanno l'uno e non l'altro.
  ADD COLUMN IF NOT EXISTS started_on        date,
  ADD COLUMN IF NOT EXISTS audit_requested   boolean NOT NULL DEFAULT false;

ALTER TABLE public.deals DROP CONSTRAINT IF EXISTS deals_priority_check;
ALTER TABLE public.deals ADD CONSTRAINT deals_priority_check
  CHECK (priority IS NULL OR priority IN ('High', 'Medium', 'Low'));

ALTER TABLE public.deals DROP CONSTRAINT IF EXISTS deals_membership_check;
ALTER TABLE public.deals ADD CONSTRAINT deals_membership_check
  CHECK (membership IS NULL OR membership IN ('Member', 'Not Member', 'Potential'));

-- ── La provenienza, per intero e in un posto solo ───────────────────────

-- Il foglio è un export di Meta Lead Ads: campagna, adset, annuncio, form,
-- piattaforma e le tre risposte del modulo. Si legge per sapere da dove è
-- arrivato un lead; non si edita. In `jsonb` invece che in dodici colonne
-- perché dodici colonne che nessuno modifica sono larghezza senza uso.
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS lead_origine jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- lo STATUS scritto a mano sul foglio, com'era. Il nostro `stage` ne è la
  -- traduzione, e quando la traduzione è incerta questa colonna è l'unico
  -- posto dove qualcuno può andare a vedere cosa c'era scritto davvero.
  ADD COLUMN IF NOT EXISTS sheet_status text;

CREATE INDEX IF NOT EXISTS deals_stage_idx ON public.deals (stage);
CREATE INDEX IF NOT EXISTS deals_priority_idx ON public.deals (priority) WHERE priority IS NOT NULL;

-- ── Account Owner: più di uno, e non si sceglie il primo ────────────────

CREATE TABLE IF NOT EXISTS public.deal_owners (
  deal_id    uuid NOT NULL REFERENCES public.deals(id)    ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (deal_id, profile_id)
);
CREATE INDEX IF NOT EXISTS deal_owners_profile_idx ON public.deal_owners (profile_id);

ALTER TABLE public.deal_owners ENABLE ROW LEVEL SECURITY;

-- Chi vede la trattativa vede chi la segue: la stessa porta di `deals`, o
-- l'elenco degli owner direbbe più di quanto dica la riga a cui appartiene.
DROP POLICY IF EXISTS deal_owners_leggo ON public.deal_owners;
CREATE POLICY deal_owners_leggo ON public.deal_owners
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_id));

-- Scrive solo il service role, dalle server action che passano da
-- `requireSalesAccess`: nessuna policy di scrittura, e non è una dimenticanza.

COMMIT;

-- verifica: le dodici colonne ci sono, i vincoli reggono, la tabella owner esiste
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='deals'
      AND column_name IN ('priority','membership','tags','services','referral','fatturato',
                          'owner_name','website','address','drive_url','started_on','audit_requested'))
                                                                           AS colonne_notion,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='deals'
      AND column_name IN ('lead_origine','sheet_status','sheet_row_id','imported_at'))
                                                                           AS colonne_provenienza,
  (SELECT count(*) FROM information_schema.tables
    WHERE table_schema='public' AND table_name='deal_owners')              AS tabella_owner,
  (SELECT count(*) FROM pg_constraint
    WHERE conname IN ('deals_priority_check','deals_membership_check'))    AS vincoli;
