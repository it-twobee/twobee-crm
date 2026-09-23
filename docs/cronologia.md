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

**Il buco del 20 luglio 2026** (§412). Dal 20 luglio al 23 settembre 2026
`activity_log` **non ha ricevuto una riga da `tasks`, `projects` e `invoices`**,
mentre quelle tabelle cambiavano ogni giorno — 149 task toccate nei soli trenta
giorni prima che qualcuno se ne accorgesse. La causa è meccanica: la **144** ha
droppato il dominio progetti con `CASCADE`, che porta via anche i trigger, e la
**147** l'ha ricostruito rimettendo solo quelli di `updated_at`.
`trg_log_tasks` e `trg_log_projects` non sono mai tornati.

Nessuno se n'è accorto perché **una cronologia che si svuota non dà errore**:
dà una pagina vuota, che somiglia a una giornata tranquilla. È venuto fuori da
un'altra parte — la vista sull'utilizzo (§410) diceva «0 modifiche» per chi
lavora in workspace, che è dove le task si muovono.

La **253** rimette i trigger su tutte le tabelle con cronologia che *esistono
davvero*, chiedendole a `to_regclass` invece di fidarsi di un elenco scritto a
mano: è un elenco scritto a mano che si è disallineato la prima volta. Ci entrano
anche `milestones` e `project_workstreams`, che sono il dominio progetti di
adesso, con la loro etichetta in `log_activity()`. **Il passato non si
ricostruisce**: chi legge una finestra che comincia prima del 23 settembre 2026
vede un conteggio parziale, e la vista sull'utilizzo lo dichiara invece di
mostrare uno zero.

La lezione, che vale oltre questo caso: **un `DROP ... CASCADE` porta via i
trigger, e una migration che ricostruisce una tabella deve rimettere anche
quello che non ha scritto lei.**

**Versioni** — `os_versions` + `os_version_changes`, changelog di prodotto
scritto a mano: un changelog generato dai commit racconta i commit, non il
prodotto. Un ciclo ogni **15 giorni** dal 2026-08-01 (v1.0.0): chiudere un ciclo
alza la minore, una modifica sostanziale a metà ciclo alza la patch, la maggiore
la decide una persona. `lib/os-version.ts` = calendario e numeri (puri,
verificati da `os-version.check.ts`). Ogni voce ha tipo, area, impatto e le due
colonne **prima/adesso**: è quello che rende leggibile il confronto con la
versione precedente. Le bozze le vedono solo gli admin; il workspace mostra in
sola lettura l'ultima pubblicata.


