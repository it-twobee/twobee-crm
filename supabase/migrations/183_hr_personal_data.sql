-- 183 — Età e famiglia: due dati che cambiano i conti, non due campi d'archivio.
--
-- L'ETÀ decide quali contratti si possono usare. L'apprendistato professionaliz-
-- zante è per chi non ha ancora compiuto trent'anni: assumere un junior a tempo
-- indeterminato quando l'apprendistato sarebbe ancora possibile costa quasi il
-- 19% in più di contributi, ogni mese, per anni. Senza la data di nascita il
-- tool non può accorgersene e il suggerimento resta generico.
--
-- I FIGLI A CARICO alzano la soglia dei fringe benefit esenti: sotto quel tetto
-- beni e servizi non fanno reddito né contributi, e la differenza fra le due
-- soglie è denaro che arriva intero invece che dimezzato dal cuneo.
--
-- Si registra la **data di nascita**, non l'età: un'età scritta nel database
-- invecchia male e nessuno la aggiorna al compleanno.

ALTER TABLE public.hr_people
  ADD COLUMN IF NOT EXISTS birth_date       DATE,
  ADD COLUMN IF NOT EXISTS has_children     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS children_count   INT NOT NULL DEFAULT 0 CHECK (children_count >= 0 AND children_count <= 20),
  -- il coniuge a carico incide sulle detrazioni, quindi sul netto
  ADD COLUMN IF NOT EXISTS dependent_spouse BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.hr_people.birth_date IS
  'Serve all''eleggibilità contrattuale (apprendistato under 30), non all''anagrafe.';
COMMENT ON COLUMN public.hr_people.has_children IS
  'Alza la soglia dei fringe benefit esenti. I figli under 21 prendono l''Assegno Unico, non le detrazioni.';

NOTIFY pgrst, 'reload schema';
