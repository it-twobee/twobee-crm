-- 176 — Un cliente fermo non è un cliente perso.
--
-- Fra «stabile» e «perso» manca lo stato in cui le agenzie vivono davvero: il
-- cliente che ha sospeso le lavorazioni. Non fattura, quindi tenerlo fra gli
-- attivi gonfia l'MRR e il conto economico; non se n'è andato, quindi metterlo
-- fra i persi cancella un rapporto che può ripartire domani — e sporca il churn,
-- che è la metrica su cui si giudica se l'agenzia tiene i clienti.
--
-- `pending` è quel terzo stato: fuori dai conti, dentro la relazione.
--
-- `paused_at` è la data dell'**ultima** sospensione, non della prima: qui
-- serve sapere da quanto è fermo, che è la domanda che fa scattare la
-- telefonata. È l'opposto di `lost_at`, che invece tiene la prima perdita
-- perché serve a non rinotificare due volte lo stesso addio.

ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_client_label_check;
ALTER TABLE public.clients ADD CONSTRAINT clients_client_label_check
  CHECK (client_label IN ('stabile', 'in_bilico', 'pending', 'perso', 'partner'));

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS paused_at DATE;

COMMENT ON COLUMN public.clients.paused_at IS
  'Data dell''ultima sospensione delle lavorazioni. Si azzera quando il cliente riparte.';

-- chi è già in pending (nessuno, oggi) avrebbe la data vuota: la si mette al
-- passaggio, non si inventa retroattivamente
UPDATE public.clients SET paused_at = CURRENT_DATE
WHERE client_label = 'pending' AND paused_at IS NULL;

NOTIFY pgrst, 'reload schema';
