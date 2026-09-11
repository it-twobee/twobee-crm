-- §329 — il ruolo di autorizzazione non si scrive dai metadati dell'invito.
--
-- `handle_new_user` (001) copiava `raw_user_meta_data->>'role'` dentro
-- `profiles.role`, che è la colonna che `get_my_role()` legge per la RLS e che
-- il middleware usa per decidere il portale. I metadati dell'utente li scrive
-- chi crea l'invito — e nel Customer Care il ruolo era un **campo di testo
-- libero** del form «ospite esterno», passato dritto a `inviteUserByEmail`.
-- Chiunque avesse una sessione poteva scrivere «admin» in quel campo, invitare
-- un proprio indirizzo, e ritrovarsi un account con la RLS di un admin.
--
-- Il lato applicativo è già chiuso (l'azione chiede staff e non passa più il
-- ruolo). Questa migration chiude il lato database, che è quello che conta: una
-- riga in `auth.users` può nascere anche da un altro percorso — un signup, un
-- provider OAuth, un invito spedito dalla dashboard di Supabase — e il trigger
-- è l'unico punto in cui passano tutti.
--
-- **Il nuovo default è `guest`, non `team`.** Un account che nasce senza che
-- nessuno ne abbia dichiarato il ruolo non è un collega: `team` apre tutto il
-- portale operativo, e nel dubbio si dà il meno, non il più. I due percorsi
-- legittimi scrivono il ruolo **dopo**, con il service role, leggendolo da una
-- riga: `/api/invite/accept` dalla `invitations` e il cambio ruolo admin dal
-- profilo. Nessuno dei due dipende da questo default.
--
-- `app_role` resta leggibile dai metadati **solo** se è uno dell'elenco chiuso,
-- e non decide niente da solo: `role` lo deriva la mappa in `lib/permissions.ts`
-- lato applicazione. Un valore inventato diventa NULL, non un ruolo.

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_app_role TEXT := NEW.raw_user_meta_data->>'app_role';
BEGIN
  IF v_app_role IS NOT NULL AND v_app_role NOT IN (
    'super_admin','founder','admin','manager','senior','junior',
    'stage','freelance','partner','viewer','client','guest'
  ) THEN
    v_app_role := NULL;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role, app_role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'guest',
    v_app_role
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── Le due tabelle che erano aperte a chiunque avesse una sessione ──────────
--
-- `FOR ALL USING (auth.uid() IS NOT NULL)` non è una policy: è la RLS accesa e
-- lasciata passare. Su `channel_guests` vuol dire che un utente del portale
-- cliente poteva leggere gli ospiti di qualunque canale; su `ticket_portals`
-- che poteva leggere — e cancellare — i token dei portali ticket di tutti i
-- clienti, e il token è la sola credenziale di quel portale.
--
-- Gli ospiti veri non passano di qui: le funzioni del portale sono
-- SECURITY DEFINER e autorizzano col token, quindi restringere la tabella allo
-- staff non toglie niente a chi arriva dal magic link.

ALTER TABLE public.channel_guests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth manage channel_guests" ON public.channel_guests;
CREATE POLICY "channel_guests_staff" ON public.channel_guests
  FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

ALTER TABLE public.ticket_portals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ticket_portals_team" ON public.ticket_portals;
CREATE POLICY "ticket_portals_staff" ON public.ticket_portals
  FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── Verifica dopo l'esecuzione ─────────────────────────────────────────────
-- 1) Il trigger non guarda più `role`:
--      SELECT prosrc LIKE '%raw_user_meta_data->>''role''%' AS legge_role
--        FROM pg_proc WHERE proname = 'handle_new_user';
--      -- atteso: false
-- 2) Le due policy sono sullo staff:
--      SELECT tablename, policyname, qual FROM pg_policies
--       WHERE tablename IN ('channel_guests','ticket_portals');
--      -- atteso: qual = is_staff()
-- 3) Nessun profilo esistente è nato da metadati non dichiarati (controllo, non
--    correzione: i ruoli attuali non si toccano da una migration):
--      SELECT id, email, role, app_role FROM public.profiles
--       WHERE role = 'admin' AND app_role IS NULL;
--      -- atteso: nessuna riga. Se ce ne sono, sono da verificare a mano.
