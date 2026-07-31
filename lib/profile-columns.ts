/**
 * Colonne di `profiles` da selezionare al posto di `select('*')`.
 *
 * In tabella esiste `monthly_cost`, il costo della risorsa: è dato riservato a
 * founder e super admin, e infatti il tipo `Profile` lo esclude apposta. Ma il
 * tipo non filtra la query: un `select('*')` lo carica comunque e, quando la
 * lista finisce in un client component, lo spedisce al browser di chiunque
 * possa aprire quella pagina.
 *
 * Chi ha davvero bisogno del costo lo seleziona a mano, così resta una scelta
 * esplicita e visibile in code review.
 *
 * Una stringa sola e `as const`: supabase-js analizza il `select` a livello di
 * tipi, e una concatenazione perderebbe l'inferenza sulle colonne.
 */
export const PROFILE_COLUMNS = 'id, full_name, role, app_role, avatar_url, email, phone, area, competencies, job_title, is_active, invited_by, last_seen_at, created_at, resource_type, seniority, hire_date, birth_date, contract_type' as const

/** Versione ridotta per le tendine: nome e volto, niente altro. */
export const PROFILE_PICKER_COLUMNS = 'id, full_name, avatar_url, app_role, is_active' as const
