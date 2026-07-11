# 01 — System Map

> Audit verificato su codice + database reali. Fonte di verità: codice e DB, non
> la documentazione. Nessun codice modificato in questa fase.

## Stack
- **Next.js 14** App Router, TypeScript strict, Tailwind (design token light/dark).
- **Supabase**: Postgres + Auth + RLS. Client: `@/lib/supabase/{server,client,admin}`.
- **AI**: Groq `llama-3.3-70b-versatile` (+ route Gemini/Anthropic sparse).
- **Integrazioni**: Google Calendar (OAuth), Asana (sync/webhook), Twilio (SMS lead).

## Quattro portali, un gate
Il routing per ruolo è imposto in **`middleware.ts`** (server) + layout.

| Portale | Rotte | `app_role` | `role` | Layout |
|---|---|---|---|---|
| Admin | `/dashboard` + tutto | super_admin, founder, admin | admin | `app/(dashboard)/layout.tsx` |
| Operativo (Workspace) | `/workspace/**` | manager, senior, junior, stage, freelance, partner, viewer | team | `app/(workspace)/layout.tsx` |
| Cliente | `/portale/**` | client, guest-cliente | client/guest | `app/portale/layout.tsx` |
| Risorsa esterna | `/risorsa/**` | guest con resource profile | guest | `app/risorsa/layout.tsx` |

**Regola di confinamento (verificata, middleware.ts:77):**
`isWorkspace = !isAdminLevel && (isWorkspaceRole(appRole) || role === 'team')`
→ ogni non-admin `role='team'` (incluso `viewer`) è confinato a `/workspace`.

`coarseRole(app_role) → role` in `lib/permissions.ts` è l'unica fonte per la mappa
granulare→grezzo (usata da registrazione, cambio ruolo admin, middleware).

## Superfici applicative (conteggi reali)
- **~40 rotte** con `page.tsx` (dettaglio in `02-ROUTES_AND_PORTALS.md`).
- **28 file di server action**, ~90 funzioni esportate.
- **38 API route** (16 AI, 5 Asana, 4 Google, 3 invite, altre).
- **87 tabelle** Postgres (dettaglio in `03-DATABASE_RELATION_MAP.md`).
- **~193 componenti** `.tsx`; 15 superano 500 righe (god-components, vedi §UX).

## Volumi dati reali (fotografia DB)
| Entità | Righe | Nota |
|---|--:|---|
| clients | 12 | 9 senza progetti, 0 marcati `is_internal` |
| projects | 4 | tutti `attivo`, **0 con manager_id (PM)** |
| sprints | 4 | tutti con date e task |
| tasks | 46 | 8 milestone; **38/38 senza stima ore**, 37/38 senza sprint |
| task_assignees | 3 | multi-assegnatario appena introdotto |
| profiles | 8 | il team |
| chat_channels | 33 | chat_messages: **0** |
| activity_log | 768 | audit trail attivo ✅ |
| client_assignments | **0** | 🔴 nessun cliente collegato al portale |
| invoices / deals / hr_requests | 0 | moduli non ancora popolati |
| payslips / personal_documents / notifications | 0 | idem |

**Lettura d'insieme:** lo **schema è ricco e maturo**; i **dati reali sono sparsi**
(fase seed/early). Il rischio principale non è strutturale ma di *popolamento e
qualità del dato* — vedi `11-DATA_QUALITY_ISSUES.md`.

## Stato migrazioni & infra
- Migration `086–095` **applicate** (tabelle verificate presenti sul DB).
- Numerazione: `080/081/092` duplicati → prossimo libero **096**.
- **Da verificare a mano**: bucket privati `payslips`, `personal-documents`,
  `best-ideas`. Env Google sul deploy (`GOOGLE_CLIENT_ID/SECRET`, `NEXT_PUBLIC_APP_URL`).

## Documenti dell'audit
`02` rotte · `03` database · `04` permessi/RLS · `05` gerarchia · `06–09` portali ·
`10` UX/micro-azioni · `11` data quality · `12` valore strategico ·
`13` backlog · `14` roadmap.
