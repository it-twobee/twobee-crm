# 05 — Tassonomia dei servizi

## Cosa esiste già

`service_catalog` (migration 133) ha **14 servizi** e i quattro assi separati
richiesti dal §4: `service_line` (area), `key` (servizio),
`delivery_engine` (motore), `default_revenue_model` (economia).

| key | linea | motore | economia |
|---|---|---|---|
| `growth_ecommerce` | growth | growth_program | recurring |
| `growth_lead_gen` | growth | growth_program | recurring |
| `brand_identity` | marketing | structured_one_off | one_off |
| `continuing_designer` | marketing | recurring_service | recurring |
| `analisi_mercato` | marketing | structured_one_off | one_off |
| `creazione_evento` | marketing | structured_one_off | one_off |
| `marketing_automation` | marketing | structured_one_off | one_off |
| `social_media_management` | marketing | recurring_service | recurring |
| `sito_web` | digital | digital_project | one_off |
| `sito_ecommerce` | digital | digital_project | milestone_based |
| `crm` | digital | digital_project | milestone_based |
| `gestionale` | digital | digital_project | milestone_based |
| `ai_automation` | ai | digital_project | milestone_based |
| `consulenza_strategica` | consulting | recurring_service | retainer |

## Scarti rispetto al brief

| Brief | Catalogo | Azione |
|---|---|---|
| aree = marketing, growth, digital | esistono anche `ai` e `consulting` | **decisione richiesta (D-A)**: `ai` è area o servizio dentro `digital`? Il brief lo mette dentro digital |
| `audit` (marketing) | c'è `analisi_mercato` | probabile stesso servizio, nome diverso → confermare |
| `saas_growth` | **assente** | da aggiungere |
| `service_subtype` per digital_transformation (crm/gestionale/custom_application/integration/automation) | modellato come **servizi separati** (`crm`, `gestionale`…) | ✅ funzionalmente equivalente e più semplice: nessun sottotipo, il servizio è già foglia. Mancano `custom_application` e `integration` |
| `event_management` | `creazione_evento` | ✅ stesso |
| `continuing_design` | `continuing_designer` | ✅ stesso |
| modello economico `maintenance` | assente dal catalogo, presente in `RevenueModel` | ok |

**Non introdurre `service_subtype`.** Il brief lo chiede, ma il catalogo ha già
risolto lo stesso problema con servizi-foglia: `area=digital, service=crm` porta
la stessa informazione di `area=digital, type=digital_transformation, subtype=crm`
con un asse in meno. Segnalo lo scarto perché è una deviazione consapevole dal §4.4.

## Da aggiungere
`saas_growth`, `custom_application`, `integration`. E i template di Workstream
per ciascun servizio (§19) — oggi `startup_tasks` JSONB esiste ma è quasi vuoto.
