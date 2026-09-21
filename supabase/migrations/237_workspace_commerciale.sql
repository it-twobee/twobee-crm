-- §373 — la voce «Commerciale» nella barra del workspace.
--
-- Non c'era. La pagina `/workspace/commerciale` esiste da §223 e chi poteva
-- vederla non aveva un link per arrivarci: si entrava scrivendo l'indirizzo a
-- mano, che è come dire che non si entrava. La sezione stava solo nella barra
-- del portale admin, che è un file TypeScript (`nav-config.ts`), mentre quella
-- del workspace vive in questa tabella — ed è il genere di asimmetria per cui
-- una pagina nuova risulta «non funzionante» senza che niente sia rotto.
--
-- **L'icona è `Target`, la stessa del portale admin.** Due icone per la stessa
-- sezione sono due sezioni, per chi le guarda: chi passa da un portale
-- all'altro (§234: admin e super admin lo fanno di continuo) deve ritrovare la
-- stessa cosa nello stesso posto con lo stesso segno.
--
-- Il permesso resta dove stava: la voce compare, ma la pagina la apre solo chi
-- passa `getSalesAccess` — admin sempre, gli altri con `can_view_deals`.
-- Mostrare una voce che rimbalza sarebbe peggio di non mostrarla (§211), ma
-- qui non rimbalza: `workspace_section_permissions` decide chi la vede, e
-- senza righe la vedono solo gli admin.
--
-- Rilanciabile: `ON CONFLICT (key) DO UPDATE`.

BEGIN;

INSERT INTO public.workspace_sections (key, label, route, icon, sort_order, is_active)
VALUES ('commerciale', 'Commerciale', '/workspace/commerciale', 'Target', 45, true)
ON CONFLICT (key) DO UPDATE
  SET label = EXCLUDED.label,
      route = EXCLUDED.route,
      icon  = EXCLUDED.icon,
      is_active = true;

COMMIT;

-- verifica: la voce c'è, punta alla pagina giusta e ha l'icona del portale admin
SELECT key, label, route, icon, is_active
FROM public.workspace_sections
WHERE key = 'commerciale';
