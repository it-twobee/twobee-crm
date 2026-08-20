-- §313 — Due indici unici che il registro dava per esistenti e non c'erano.
--
-- Caricare una busta paga fallisce con `42P10 — there is no unique or exclusion
-- constraint matching the ON CONFLICT specification`: `uploadPayslip` fa un
-- upsert su `(profile_id, year, month)`, la 088 quell'indice lo crea, e il
-- registro delle migration la dà applicata. Sul database **non c'è**.
--
-- È il caso di §222 nella sua forma pura: «applicata» non vuol dire «c'è
-- ancora». La 088 è passata prima del reset del 2026-07-23, il reset ha
-- ricreato le tabelle e si è portato via gli indici, e nel registro la riga è
-- rimasta — perché applicata lo era, allora. Lo stesso vale per `item_views`
-- (la 109), che regge il badge «Nuovo» per utente.
--
-- Non è un difetto solo di scrittura. Senza l'indice **due righe identiche
-- possono esistere**: due buste paga per lo stesso mese e la stessa persona,
-- e chi apre il workspace non sa quale delle due è quella vera. L'upsert
-- fallisce ed è la parte fortunata: fallire è meglio che scrivere il doppione.
--
-- Perciò prima si deduplica e poi si vincola: creare l'indice su una tabella
-- che contiene già duplicati non fallisce a metà — fallisce del tutto, e la
-- migration non passerebbe.

-- ── Buste paga: una per persona e per mese ─────────────────────────────────
--
-- Sopravvive la più recente: se qualcuno ha ricaricato il documento, quello
-- caricato dopo è la versione buona. Il file su MinIO **non** si tocca — la
-- chiave è `payslips/<profilo>/<anno>-<mese>.<ext>`, quindi la seconda ha già
-- sovrascritto la prima e cancellarlo qui vorrebbe dire togliere l'allegato
-- alla riga che resta.
DELETE FROM public.payslips p
 USING public.payslips q
 WHERE p.profile_id = q.profile_id
   AND p.year = q.year
   AND p.month = q.month
   AND (p.uploaded_at, p.id) < (q.uploaded_at, q.id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payslips_profile_period
  ON public.payslips(profile_id, year, month);

COMMENT ON INDEX public.idx_payslips_profile_period IS
  '§313 — una busta paga per persona e per mese. Regge l''upsert di uploadPayslip: senza, ricaricare lo stesso mese crea un doppione e il dipendente non sa quale sia il suo cedolino.';

-- ── Item views: una riga per (persona, elemento) ────────────────────────────
--
-- Il badge «Nuovo» è per utente e per elemento (§109): un secondo `seen_at`
-- sullo stesso elemento non aggiunge informazione, e sopravvive il più
-- recente perché «l'ho visto» è un fatto che si aggiorna, non si accumula.
DELETE FROM public.item_views a
 USING public.item_views b
 WHERE a.profile_id = b.profile_id
   AND a.item_id = b.item_id
   AND a.item_type = b.item_type
   AND (a.seen_at, a.id) < (b.seen_at, b.id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_item_views_unique
  ON public.item_views(profile_id, item_id, item_type);
