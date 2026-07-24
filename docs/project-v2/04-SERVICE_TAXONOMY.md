# 04 — Service Taxonomy

Tassonomia **configurabile**, non hardcoded nei componenti. Vive in una tabella di
catalogo (`service_catalog` v2, vedi doc 05) letta dal wizard e dai filtri. I
valori tecnici (enum-like) sono stabili; le label sono editabili dal super_admin.

## Aree (3)

| Valore | Label UI |
|---|---|
| `marketing` | Marketing |
| `growth` | Growth |
| `digital` | Digital |

## Servizi per area (`service_type`)

### Marketing
| Valore | Label |
|---|---|
| `branding` | Branding |
| `social_media_management` | Social Media Management |
| `audit` | Audit |
| `continuing_design` | Continuing Design |
| `event` | Evento |

### Growth
| Valore | Label |
|---|---|
| `lead_generation` | Lead Generation |
| `saas` | SaaS |
| `ecommerce` | E-commerce |

### Digital
| Valore | Label | Sottotipi (`service_subtype`) |
|---|---|---|
| `ai_project` | AI Project | — |
| `digital_transformation` | Digitalizzazione | `crm` (CRM), `management_software` (Gestionale), `custom_application` (Applicativo ad hoc) |

## Modello: catalogo vs template

- **Catalogo servizi** (`service_catalog`): definisce area → servizio → sottotipo,
  label, attivo/disattivo, ordinamento. È la tassonomia.
- **Template di progetto** (`project_templates` + righe figlie): per ogni servizio,
  la struttura suggerita di sottoprogetti/milestone/task/ricorrenze. È il contenuto.
  Dettaglio nei doc 16 (workstream ricorrenti) e 17 (task template).

Un servizio può avere **0..N template**. Il wizard (doc 07 step 6) propone i
template del servizio scelto; l'utente li personalizza.

## Regole

- Nuovi servizi/sottotipi si aggiungono da DB/UI super_admin, **senza deploy**.
- I filtri della sezione `/progetti` (doc globale) leggono il catalogo per popolare
  i menu Area/Servizio.
- Il badge Growth/Digital storico (`project_kind`) è **superato** da `area` +
  `service_type`: non reintrodurre `project_kind`.

## Seed iniziale

Il catalogo va inizializzato con le tabelle sopra (migration 147+, `INSERT`).
Fonte per eventuale arricchimento: `service_catalog` (17 righe) nel backup JSON
`supabase/backup/2026-07-22-pre-reset/`.
