-- 232 — una notifica, un destinatario, una colonna sola che conta (§350)
--
-- `notifications` porta **due** colonne per la stessa cosa: `profile_id`
-- (dalla 001) e `user_id` (arrivato dopo). La RLS le guarda tutte e due —
-- `profile_id = auth.uid() OR user_id = auth.uid()` (009) — ma la campanella
-- filtrava sul solo `user_id`, e chi scriveva sceglieva una delle due a caso.
--
-- Misurato il 18 settembre 2026: **11 notifiche su 23** hanno `user_id` nullo.
-- Sono le `task_request` e `task_request_accepted` di luglio, quelle indirizzate
-- ai manager e a un junior: leggibili dal database, invisibili sullo schermo. Una
-- notifica che il database consegna e l'interfaccia non mostra è peggio di una
-- che non esiste — il sistema sembra funzionare, e chi aspettava la richiesta
-- pensa che nessuno gliel'abbia mandata.
--
-- Qui non si sceglie quale colonna vince: **si tengono uguali**. Il trigger
-- riempie quella che manca a ogni inserimento, così un produttore nuovo non può
-- più sbagliare, e il backfill allinea le undici righe vecchie. La campanella,
-- dal canto suo, legge adesso come legge la RLS.
--
-- Rilanciabile: `CREATE OR REPLACE` + `DROP TRIGGER IF EXISTS` + un UPDATE che
-- al secondo giro non trova più niente.

BEGIN;

CREATE OR REPLACE FUNCTION public.tbv2_notification_recipient()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN NEW.user_id := NEW.profile_id; END IF;
  IF NEW.profile_id IS NULL THEN NEW.profile_id := NEW.user_id; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notification_recipient ON public.notifications;
CREATE TRIGGER trg_notification_recipient
  BEFORE INSERT OR UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.tbv2_notification_recipient();

-- le undici di luglio tornano visibili a chi erano indirizzate
UPDATE public.notifications SET user_id = profile_id
 WHERE user_id IS NULL AND profile_id IS NOT NULL;
UPDATE public.notifications SET profile_id = user_id
 WHERE profile_id IS NULL AND user_id IS NOT NULL;

COMMIT;

-- verifica: nessuna riga con un destinatario solo a metà
SELECT
  count(*)                                        AS notifiche,
  count(*) FILTER (WHERE user_id IS NULL)         AS senza_user_id,
  count(*) FILTER (WHERE profile_id IS NULL)      AS senza_profile_id,
  count(*) FILTER (WHERE user_id <> profile_id)   AS discordanti
FROM public.notifications;
