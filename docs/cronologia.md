# Cronologia e versioni (§179)

## Cronologia e versioni (§179)
`/impostazioni/cronologia` ha due tab.

**Attività** — `activity_log`, scritta dal trigger `log_activity()` su clients,
projects, tasks, deals, invoices, tickets, objectives, key_results. Filtri
(persona, tipo, azione, periodo, testo) applicati **sul database**, non sulla
pagina caricata: filtrare le ultime 200 righe su settemila è un filtro che
mente. Il ripristino di un `update` riscrive i **valori vecchi presi dal diff**,
non lo snapshot — lo snapshot è lo stato *dopo*, riapplicarlo non fa niente — e
tocca solo i campi di quella modifica, per non annullare il lavoro fatto dopo da
qualcun altro. `previewRestore` mostra prima cosa torna indietro.

**Attribuzione**: il service role non ha `auth.uid()`, quindi ogni scrittura da
server action risultava «Sistema». Le server action che toccano tabelle con
cronologia usano `createActorClient(userId)` (`lib/supabase/admin.ts`), che
manda l'id in `x-actor-id`; il trigger lo legge da `request.headers`. **Se
aggiungi una scrittura su una tabella loggata, usa quello, non
`createAdminClient()`** — altrimenti la modifica non ha un nome sopra.

**Versioni** — `os_versions` + `os_version_changes`, changelog di prodotto
scritto a mano: un changelog generato dai commit racconta i commit, non il
prodotto. Un ciclo ogni **15 giorni** dal 2026-08-01 (v1.0.0): chiudere un ciclo
alza la minore, una modifica sostanziale a metà ciclo alza la patch, la maggiore
la decide una persona. `lib/os-version.ts` = calendario e numeri (puri,
verificati da `os-version.check.ts`). Ogni voce ha tipo, area, impatto e le due
colonne **prima/adesso**: è quello che rende leggibile il confronto con la
versione precedente. Le bozze le vedono solo gli admin; il workspace mostra in
sola lettura l'ultima pubblicata.


