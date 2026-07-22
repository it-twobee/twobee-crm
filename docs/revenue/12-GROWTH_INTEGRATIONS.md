# 12 — Integrazioni per focus: Shopify, Meta Ads, Google Ads, sito

Audit read-only, 2026-07-19. Nessuna riga di codice scritta.

## Cosa esiste già (e cambia il piano)

| Serve | Esiste? |
|---|---|
| Contenitore lead | ✅ **`lead_contacts`** (083): `source ∈ (meta_ads, google_ads, website, organic, whatsapp, email, referral, other)`, `client_id`, `project_id`, `status`, `metadata JSONB`. **0 righe, nessuna UI** |
| KPI e-commerce | ✅ `client_kpis`: `orders_count`, `avg_order_value`, `revenue_attributed`, `cart_abandonment`, `ltv`, `roas` |
| KPI lead gen | ✅ `client_kpis`: `leads_generated`, `cpl`, `sql_count`, `conversion_rate`, `cpa`, `ad_spend`, `ctr` |
| Pattern credenziali sicuro | ✅ `google_credentials` (091): RLS **deny-all**, solo service role, flag pubblico separato |
| Tabelle nuove per i dati | ❌ **non servono** |

**Conseguenza**: le integrazioni non hanno bisogno di un modello dati nuovo. Shopify
scrive in `client_kpis`, Meta e Google scrivono in `lead_contacts` + `client_kpis`.
Serve solo dove mettere le **credenziali** e come mostrare lo stato.

`leads` (053) è una tabella diversa e più vecchia (1 riga): è il lead *commerciale*
di TwoBee, non il lead *del cliente*. Non vanno confuse. `lead_contacts` è quella giusta.

---

## Schema proposto: due tabelle, segreti separati

La lezione della 091 è che un token non deve stare dove la UI legge. Qui la
applico dividendo stato e segreto.

```sql
client_integrations              -- stato, leggibile dallo staff
  id, client_id, project_id?
  provider ∈ (shopify | meta_ads | google_ads | web_form)
  status ∈ (non_configurata | attiva | errore | scaduta)
  external_account_id   -- dominio shop, ad account id, customer id
  config JSONB          -- impostazioni NON segrete
  last_sync_at, last_error
  is_active

client_integration_secrets       -- RLS deny-all, come google_credentials
  integration_id PK
  access_token, refresh_token, expiry
  extra JSONB
```

La UI legge `client_integrations` per dire «collegato, ultima sincronizzazione
2 ore fa». Non tocca mai i token. Se domani qualcuno aggiunge un `select('*')`
per sbaglio, non espone nulla.

---

## Le quattro integrazioni, in ordine di fattibilità reale

### 1. Sito / landing page — **fattibile subito, zero dipendenze**

Un endpoint `/api/leads/inbound/[token]` che riceve i submit dei form e scrive in
`lead_contacts` con `source='website'`. Il token è per cliente, rigenerabile.

Non dipende da nessun approvvigionamento esterno: si può fare oggi e funziona
domani. Copre landing page, form del sito, Typeform, WordPress, qualunque cosa
sappia fare una POST.

### 2. Shopify — **fattibile, serve un token**

Admin API con token di una custom app creata nel negozio del cliente
(Settings → Apps → Develop apps). Scope in sola lettura:
`read_orders`, `read_products`, `read_customers`.

Sync giornaliera → `client_kpis`: `orders_count`, `revenue_attributed`,
`avg_order_value`, `cart_abandonment`.

Ostacolo: **il token lo deve generare il cliente** nel suo negozio, e va chiesto
una volta per cliente. Nessuna approvazione da Shopify se resta una custom app
privata (l'alternativa — app pubblica con OAuth — richiede la review di Shopify).

### 3. Meta Ads — **fattibile per le metriche, complicato per i lead**

Due cose diverse:

- **Metriche di spesa** (`ad_spend`, `cpl`, `ctr`, `cpa`): Marketing API con un
  system user token del Business Manager. Fattibile.
- **Lead Ads** (i contatti veri dai form Meta): richiede il permesso
  `leads_retrieval`, che passa dalla **App Review di Meta**. Tempi non nostri, e
  serve un'app Facebook configurata con webhook verificato.

Si può partire dalle metriche e aggiungere i lead quando la review passa.

### 4. Google Ads — **il più pesante**

Serve un **developer token** approvato da Google (richiesta separata, con
revisione), OAuth, e il `customer_id` di ogni account cliente. L'API è
notoriamente verbosa.

Realisticamente è l'ultimo dei quattro.

---

## Dove va nella UI

Il tab **🌱 Growth** guadagna una sezione che cambia col focus:

- `project_type = 'ecommerce'` → **Negozio**: ordini, ricavo, valore medio,
  carrelli abbandonati, top prodotti, stato della connessione Shopify
- `project_type = 'lead_gen'` → **Lead**: elenco `lead_contacts` filtrabile per
  fonte, con spesa e costo per lead da Meta/Google accanto al volume

È la stessa logica già applicata ai KPI: il focus decide cosa vedi, non aggiunge
colonne.

---

## Domande bloccanti

**Credenziali — cosa hai già?**
1. Un **Business Manager Meta** con accesso agli ad account dei clienti? Un'app
   Facebook già creata?
2. Un **developer token Google Ads** approvato, o va richiesto?
3. Per Shopify: quanti clienti ce l'hanno, e puoi chiedere loro il token?

**Priorità**
4. Da quale parto? Il webhook del sito è l'unico che dà valore **questa
   settimana**; gli altri tre dipendono da approvazioni esterne.

**Ambito**
5. Le metriche di spesa (Meta/Google) servono davvero in piattaforma, o le
   guardate già nelle dashboard native delle piattaforme? Se la risposta è la
   seconda, l'integrazione si riduce ai soli **lead**, che è molto meno lavoro.
6. Chi collega le integrazioni: solo admin, o anche il manager del cliente?

**Dati**
7. I lead raccolti devono essere visibili al cliente nel suo portale?
8. Serve deduplica (stessa email da Meta e dal sito) o si tengono separati?
