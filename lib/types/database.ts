export type Role = 'admin' | 'team' | 'client' | 'guest'
export type AppRole =
  | 'super_admin' | 'founder' | 'admin' | 'manager'
  | 'senior' | 'junior' | 'stage' | 'freelance'
  | 'partner' | 'viewer' | 'client' | 'guest'

export type ResourceTypePrimary =
  | 'dipendente' | 'piva' | 'freelance_continuativo'
  | 'collaboratore_una_tantum' | 'partner_aziendale'

export type SeniorityLevel = 'lead' | 'senior' | 'mid' | 'junior' | 'stage'

export type DocumentVisibility =
  | 'internal' | 'operations_visible' | 'partner_visible' | 'client_visible'
  | 'private_admin' | 'private_founder' | 'shared_in_report' | 'draft'

export type HrRequestType = 'ferie' | 'permesso' | 'malattia' | 'spesa' | 'documento_hr'
export type HrRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'


export type ProfilePermissionKey =
  | 'can_view_full_financials' | 'can_view_macro_revenue' | 'can_view_manager_economics'
  | 'can_view_deals' | 'can_view_team_data' | 'can_view_strategy'
  | 'can_approve_hr' | 'can_configure_workspace' | 'can_manage_partners'
export type PermissionSection = 'clienti' | 'fatturazione' | 'task' | 'chat' | 'report' | 'customer_care' | 'impostazioni' | 'mrr' | 'anagrafica_fiscale'
export type PermissionAction = 'view' | 'create' | 'edit' | 'delete'
export type ClientPackage =
  | 'Worker Bee Start'
  | 'Worker Bee Basic'
  | 'Hive Basic'
  | 'Hive Custom'
  | 'Royal Queen'
  | 'IT Digital Partner'
  | 'Partner Quota'
export type PaymentStatus = 'pagato' | 'in_attesa' | 'scaduto'
export type ClientStatus = 'verde' | 'giallo' | 'rosso'
export type ClientType = 'growth' | 'digital' | 'growth_digital'
export type ClientLabel = 'stabile' | 'in_bilico' | 'perso' | 'partner'
export type StakeholderRole = 'owner' | 'stakeholder' | 'collaboratore_esterno' | 'agenzia_supporto'
export type Priority = 'alta' | 'media' | 'bassa'
// 'customer_care'/'cliente' esistono ancora ma la chat non li mostra più: vivono
// nella sezione Customer Care. I canali di progetto ('interno', 'task',
// 'cliente_interno') sono stati eliminati dalla migration 146.
export type ChannelType =
  | 'cliente' | 'customer_care' | 'partner_customer_care' | 'team' | 'dm'

/** Sottotipo dei tre canali aziendali fissi (chat_channels.team_key) */
export type TeamChannelKey = 'team_intern' | 'angolo_informativo' | 'best_ideas'

export type NotificationType = 'task_assigned' | 'task_due' | 'message' | 'mention'
export type InteractionType = 'call' | 'meeting' | 'email' | 'demo' | 'visit' | 'slack' | 'proposta' | 'altro'
export type InteractionOutcome = 'positivo' | 'neutro' | 'negativo' | 'da_seguire'

export interface ClientInteraction {
  id: string
  client_id: string
  type: InteractionType
  date: string
  title: string
  summary: string | null
  outcome: InteractionOutcome
  is_milestone: boolean
  conducted_by: string | null
  created_by: string | null
  created_at: string
  // join
  conductor?: Profile | null
}

export interface Profile {
  id: string
  full_name: string
  role: Role
  app_role: AppRole
  avatar_url: string | null
  email: string
  phone: string | null
  area: string | null
  competencies: string[]
  job_title: string | null
  is_active: boolean
  invited_by: string | null
  last_seen_at: string | null
  created_at: string
  resource_type: ResourceTypePrimary | null
  seniority: SeniorityLevel | null
  hire_date: string | null
  birth_date: string | null
  contract_type: ContractType | null
  // NB: `monthly_cost` esiste in tabella ma è deliberatamente fuori da questo
  // tipo: è un costo risorsa (founder/super_admin only). Chi ne ha bisogno lo
  // seleziona esplicitamente, così non finisce in un client component per sbaglio.
}

export type ResourceProfileType =
  | 'internal_employee' | 'vat_consultant' | 'external_freelancer'
  | 'partner_company' | 'partner_user' | 'agency_supplier' | 'contractor' | 'consultant'

export interface ResourceProfile {
  id: string
  profile_id: string
  resource_type: ResourceProfileType
  company_name: string | null
  partner_company_id: string | null
  is_external: boolean
  can_access_resource_portal: boolean
  can_view_own_compensation: boolean
  can_view_project_context: boolean
  can_view_client_context: boolean
  can_log_time: boolean
  can_upload_documents: boolean
  created_at: string
  updated_at: string
}

export interface OrgUnit {
  id: string
  name: string
  color: string
  responsibilities: string | null
  lead_id: string | null
  position: number
  created_at: string
}

export interface OrgMember {
  id: string
  unit_id: string
  profile_id: string
  role_in_unit: string | null
  created_at: string
}

export interface RolePermission {
  id: string
  role: Exclude<AppRole, 'super_admin'>
  section: PermissionSection
  action: PermissionAction
  allowed: boolean
  updated_at: string
  updated_by: string | null
}

export interface Notification {
  id: string
  user_id: string
  type: string
  title: string
  body: string | null
  link: string | null
  read: boolean
  entity_type: string | null
  entity_id: string | null
  created_at: string
}

export interface Invitation {
  id: string
  email: string
  app_role: AppRole
  area: string | null
  job_title: string | null
  token: string
  invited_by: string | null
  accepted_at: string | null
  expires_at: string
  created_at: string
}

export interface Client {
  id: string
  /** Colonna storica. Per mostrare il nome usa `clientName()` (display_name con fallback). */
  company_name: string
  /** §24: nome con cui il cliente è chiamato nell'app (backfill da company_name). */
  display_name?: string | null
  /** §24: ragione sociale legale — fatture, preventivi, documenti fiscali. */
  legal_name?: string | null
  package: ClientPackage
  mrr: number
  contract_start: string
  contract_end: string
  payment_status: PaymentStatus
  active_channels: string[]
  status: ClientStatus
  client_type: ClientType
  client_label: ClientLabel
  notes: string | null
  is_internal: boolean
  created_at: string
  created_by: string | null
  // Obiettivi (migration 008)
  industry: string | null
  market_area: string | null
  target_leads_monthly: number | null
  target_roas: number | null
  target_revenue_monthly: number | null
  target_cpa: number | null
  target_followers_monthly: number | null
  target_ctr: number | null
  target_conv_rate: number | null
  goals_notes: string | null
  ad_budget_monthly: number | null
  // Dati fiscali (migration 006)
  piva: string | null
  fiscal_code: string | null
  address: string | null
  city: string | null
  cap: string | null
  country: string | null
  sdi_code: string | null
  pec: string | null
  email_pec: string | null
  phone: string | null
  website: string | null
  // AI Risk Engine (migration 014)
  risk_score:      number | null
  prev_risk_score: number | null
  risk_factors:    Record<string, { score: number; msg: string }> | null
  risk_trend:      'migliora' | 'stabile' | 'peggiora' | null
  risk_updated_at: string | null
}

export interface ClientStakeholder {
  id: string
  client_id: string
  full_name: string
  email: string
  phone: string | null
  role: StakeholderRole
  company: string | null
  piva: string | null
  notes: string | null
  created_at: string
}

export interface ClientContact {
  id: string
  client_id: string
  full_name: string
  email: string
  phone: string | null
  role: string | null
  is_primary: boolean
}

export interface ClientAssignment {
  id: string
  client_id: string
  profile_id: string
}

export interface ClientKpi {
  id: string
  client_id: string
  month: string
  // Growth — Advertising
  mer: number | null
  roas: number | null
  ctr: number | null
  cpa: number | null
  ad_spend: number | null
  // Growth — Lead Generation
  leads_generated: number | null
  cpl: number | null
  conversion_rate: number | null
  sql_count: number | null
  // Growth — Revenue & Ecommerce
  revenue_attributed: number | null
  ltv: number | null
  orders_count: number | null
  avg_order_value: number | null
  cart_abandonment: number | null
  // Growth — Marketing Automation
  email_open_rate: number | null
  email_click_rate: number | null
  unsubscribe_rate: number | null
  // Digital — Social & Community
  followers_gained: number | null
  reach: number | null
  engagement_rate: number | null
  mentions_count: number | null
  // Digital — Web & SEO
  organic_sessions: number | null
  new_users: number | null
  seo_avg_position: number | null
  bounce_rate: number | null
  // Digital — Prodotto / App / Gestionale
  active_users: number | null
  feature_adoption: number | null
  support_tickets: number | null
  uptime: number | null
  // Digital — AI & CRM
  ai_interactions: number | null
  crm_contacts: number | null
  automation_runs: number | null
  // Shared
  notes: string | null
  created_by: string | null
  custom_data: Record<string, number> | null
}

export interface CustomKpiDef {
  id: string
  name: string
  unit: string
  target: number | null
  lower_is_better: boolean
}

export interface ClientKpiConfig {
  id: string
  client_id: string
  enabled: string[]
  custom_kpis: CustomKpiDef[]
}

export interface Document {
  id: string
  client_id: string
  name: string
  file_url: string
  file_type: string | null
  uploaded_by: string | null
  created_at: string
}

export interface ChatChannel {
  id: string
  name: string
  type: ChannelType
  client_id: string | null
  created_at: string
  created_by: string | null
  is_archived: boolean
  is_read_only: boolean
  topic: string | null
  pinned_message_ids: string[]
  position: number
  last_message_at: string | null
  /** Solo per i canali 'team' (migration 090) */
  team_key?: TeamChannelKey | null
}

export interface ClientAccount {
  id: string
  client_id: string
  full_name: string
  email: string
  role: string | null
  invite_token: string
  accepted_at: string | null
  created_at: string
}

export interface ChatMessage {
  id: string
  channel_id: string
  sender_id: string | null
  content: string
  attachments: string[] | null
  created_at: string
  edited_at: string | null
  is_deleted: boolean
  is_pinned: boolean
}

export interface ChannelGuest {
  id: string
  channel_id: string
  email: string
  full_name: string | null
  role: string | null
  guest_type: 'cliente' | 'partner'
  status: 'pending' | 'active' | 'revoked'
  invite_token: string
  profile_id: string | null
  invited_by: string | null
  invited_at: string
  accepted_at: string | null
}

export interface ChannelMember {
  channel_id: string
  profile_id: string
  last_read_at: string
}

export interface ClientNote {
  id: string
  client_id: string
  author_id: string | null
  content: string
  created_at: string
  updated_at: string
  author?: { id: string; full_name: string; avatar_url: string | null }
}

export interface NotificationLegacy {
  id: string
  profile_id: string
  type: NotificationType
  title: string
  body: string | null
  link: string | null
  read: boolean
  created_at: string
}

// Tipi join comuni
export interface ClientWithContacts extends Client {
  client_contacts: ClientContact[]
}

export interface ChatMessageWithSender extends ChatMessage {
  sender: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null
}

export interface ClientKnowledge {
  id: string
  client_id: string
  business_model: string | null
  main_offer: string | null
  target_audience: string | null
  competitors: string | null
  tone_of_voice: string | null
  brand_assets_url: string | null
  access_status: string | null
  pain_points: string | null
  strategic_notes: string | null
  buyer_personas: string | null
  services_active: string | null
  do_not_do: string | null
  opportunities: string | null
  // §26 (migration 107): aree strutturate. Tutti opzionali — la 107 è additiva.
  market_sector: string | null
  market_scenario: string | null
  market_size: string | null
  market_trends: string | null
  market_geography: string | null
  market_seasonality: string | null
  market_regulations: string | null
  brand_values: string | null
  brand_mission: string | null
  brand_vision: string | null
  brand_distinctive: string | null
  brand_perception: string | null
  brand_promises: string | null
  swot_strengths: string | null
  swot_weaknesses: string | null
  swot_opportunities: string | null
  swot_threats: string | null
  offer_value_prop: string | null
  offer_pricing: string | null
  offer_objections: string | null
  offer_differentiators: string | null
  strat_objectives: string | null
  strat_risks: string | null
  strat_dependencies: string | null
  strat_next_steps: string | null
  created_at: string
  updated_at: string
}

export type IdeaCategory = 'growth' | 'digital' | 'ai' | 'contenuti' | 'advertising' | 'prodotto' | 'altro'
export type IdeaStatus = 'proposta' | 'in_valutazione' | 'approvata' | 'scartata' | 'realizzata'

export interface ClientCompetitor {
  id: string
  client_id: string
  name: string
  website: string | null
  positioning: string | null
  strengths: string | null
  weaknesses: string | null
  pricing: string | null
  channels: string | null
  notes: string | null
  links: string | null
  position: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ClientIdea {
  id: string
  client_id: string
  title: string
  description: string | null
  category: IdeaCategory
  priority: Priority
  status: IdeaStatus
  position: number
  created_by: string | null
  created_at: string
  updated_at: string
}

// ─── Area Customer Care ──────────────────────────────────────
export type TicketStatus = 'aperto' | 'in_lavorazione' | 'in_attesa' | 'risolto' | 'chiuso'
export type TicketPriority = 'bassa' | 'normale' | 'alta' | 'urgente'

export interface Ticket {
  id: string
  client_id: string | null
  title: string
  description: string | null
  status: TicketStatus
  priority: TicketPriority
  category: 'tecnico' | 'billing' | 'strategia' | 'altro' | null
  assigned_to: string | null
  sla_hours: number
  first_response_at: string | null
  resolved_at: string | null
  source: 'manuale' | 'email' | 'chat'
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface TicketMessage {
  id: string
  ticket_id: string
  content: string
  is_internal: boolean
  sender_id: string | null
  created_at: string
}

// ─── HR & Team ───────────────────────────────────────────────
export type LeaveType = 'ferie' | 'permesso' | 'malattia' | 'straordinario' | 'altro'
export type LeaveStatus = 'in_attesa' | 'approvato' | 'rifiutato'
export type LegacyContractType = 'dipendente' | 'collaboratore' | 'partita_iva' | 'stage'

export interface TeamLeave {
  id: string
  user_id: string
  type: LeaveType
  start_date: string
  end_date: string
  days_count: number
  notes: string | null
  status: LeaveStatus
  approved_by: string | null
  approved_at: string | null
  created_at: string
}

export interface PerformanceReview {
  id: string
  reviewee_id: string
  reviewer_id: string
  quarter: string
  score_quality: number | null
  score_speed: number | null
  score_communication: number | null
  score_initiative: number | null
  strengths: string | null
  improvements: string | null
  goals_next_quarter: string | null
  overall_note: string | null
  created_at: string
  updated_at: string
}

// ─── Buste paga (088) ────────────────────────────────────────
export interface Payslip {
  id: string
  profile_id: string
  year: number
  month: number
  file_path: string
  file_name: string | null
  notes: string | null
  uploaded_by: string | null
  uploaded_at: string
}

// ─── Documenti personali (089) ───────────────────────────────
export interface PersonalDocument {
  id: string
  profile_id: string
  doc_type: string
  label: string
  file_path: string | null
  file_name: string | null
  issued_at: string | null
  expires_at: string | null
  reminder_days_before: number
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

// ─── Activity Log ────────────────────────────────────────────
export type ActivityAction = 'create' | 'update' | 'delete'

export interface ActivityLog {
  id: string
  user_id: string | null
  entity_type: string
  entity_id: string
  entity_label: string | null
  action: ActivityAction
  snapshot: Record<string, unknown>
  diff: Record<string, { old: unknown; new: unknown }> | null
  created_at: string
}

export interface ChatBridgeEvent {
  id: string
  source_message_id: string
  source_channel_id: string
  target_channel_id: string
  status: 'pending' | 'accepted' | 'declined'
  ai_summary: string | null
  handled_by: string | null
  handled_at: string | null
  created_at: string
}

// ─── TwoBee OS — Fase 1 ──────────────────────────────────────────────────────

export interface ProfilePermission {
  id: string
  profile_id: string
  permission: ProfilePermissionKey
  granted: boolean
  granted_by: string | null
  created_at: string
}

export interface WorkspaceSection {
  id: string
  key: string
  label: string
  description: string | null
  route: string
  icon: string | null
  sort_order: number
  is_active: boolean
  is_beta: boolean
  is_phase2: boolean
  requires_permission: ProfilePermissionKey | null
  created_at: string
  updated_at: string
}

export interface WorkspaceSectionPermission {
  id: string
  section_id: string
  app_role: AppRole | null
  resource_type: ResourceTypePrimary | null
  seniority: SeniorityLevel | null
  can_view: boolean
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
  created_at: string
}

export interface HrRequest {
  id: string
  profile_id: string
  type: HrRequestType
  status: HrRequestStatus
  start_date: string | null
  end_date: string | null
  is_full_day: boolean
  start_time: string | null
  end_time: string | null
  notes: string | null
  amount: number | null
  attachment_url: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  review_note: string | null
  created_at: string
  updated_at: string
  // cosa ha prodotto l'approvazione (migration 157)
  calendar_event_id?: string | null
  payslip_id?: string | null
  personal_document_id?: string | null
  // join
  profile?: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null
  reviewer?: Pick<Profile, 'id' | 'full_name'> | null
}

export type ContractType = 'indeterminato' | 'determinato' | 'stage' | 'freelance' | 'collaborazione' | 'apprendistato'

export interface EmployeeContract {
  id: string
  profile_id: string
  contract_type: ContractType
  start_date: string
  end_date: string | null
  annual_vacation_days: number
  annual_leave_hours: number
  weekly_hours: number
  ral: number | null
  level: string | null
  ccnl: string | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface VacationBalance {
  annual_days: number
  accrued_days: number
  used_days: number
  remaining_days: number
  annual_leave_hours: number
  used_leave_hours: number
  remaining_leave_hours: number
}

// ============================================================
// PROJECT V2 — nuovo motore PM (schema mig 147+)
// Gerarchia: Cliente → Progetto → Sottoprogetto → Milestone → Task (+ Ad Hoc)
// ============================================================

export type ProjectArea = 'marketing' | 'growth' | 'digital'
export type ProjectStatus = 'draft' | 'active' | 'on_hold' | 'completed' | 'archived'
export type WorkstreamType = 'project' | 'recurring'
export type WorkstreamStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived'
export type MilestoneType = 'delivery' | 'system'
export type MilestoneStatus = 'da_fare' | 'in_corso' | 'in_approvazione' | 'completata'
/** 'ad_hoc' = attività nostra fuori progetto · 'cliente' = cosa deve fare il cliente */
export type TaskType = 'project' | 'ad_hoc' | 'cliente'
export type TaskStatusV2 = 'da_fare' | 'in_corso' | 'in_review' | 'richiesta_supporto' | 'completato'
export type RecurrenceFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'custom'
export type Visibility = 'internal' | 'client_visible'
export type ServiceSubtype = 'crm' | 'management_software' | 'custom_application'

export interface ServiceCatalogEntry {
  id: string
  area: ProjectArea
  service_type: string
  service_subtype: string | null
  label: string
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface Project {
  id: string
  client_id: string | null
  name: string
  description: string | null
  area: ProjectArea
  service_type: string
  service_subtype: string | null
  operating_model: 'una_tantum' | 'continuativo' | 'misto' | null
  revenue_model: 'fixed' | 'retainer' | 'performance' | 'misto' | null
  status: ProjectStatus
  manager_id: string | null
  priority: Priority
  visibility: Visibility
  start_date: string | null
  target_end_date: string | null
  actual_end_date: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface ProjectMember {
  id: string
  project_id: string
  profile_id: string
  role_in_project: string | null
  created_at: string
}

export interface ProjectWorkstream {
  id: string
  project_id: string
  name: string
  description: string | null
  workstream_type: WorkstreamType
  status: WorkstreamStatus
  owner_id: string | null
  priority: Priority
  visibility: Visibility
  start_date: string | null
  end_date: string | null
  sort_order: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface Milestone {
  id: string
  project_id: string
  workstream_id: string
  title: string
  description: string | null
  milestone_type: MilestoneType
  status: MilestoneStatus
  owner_id: string | null
  due_date: string | null
  completed_at: string | null
  approval_required: boolean
  approved_by: string | null
  approved_at: string | null
  deliverable: string | null
  completion_criteria: string | null
  visibility: Visibility
  sort_order: number
  created_at: string
  updated_at: string
}

export interface RecurringTaskTemplate {
  id: string
  client_id: string | null
  project_id: string | null
  workstream_id: string | null
  milestone_id: string | null
  title: string
  description: string | null
  frequency: RecurrenceFrequency
  interval: number
  recurrence_rule: string | null
  weekdays: number[] | null
  day_of_month: number | null
  start_date: string
  end_date: string | null
  generation_lead_days: number
  owner_id: string | null
  priority: Priority
  estimated_hours: number | null
  visibility: Visibility
  active: boolean
  last_generated_at: string | null
  next_generation_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface Task {
  id: string
  client_id: string | null
  task_type: TaskType
  project_id: string | null
  workstream_id: string | null
  milestone_id: string | null
  title: string
  description: string | null
  status: TaskStatusV2
  priority: Priority
  assignee_id: string | null
  start_date: string | null
  due_date: string | null
  estimated_hours: number | null
  logged_hours: number
  visibility: Visibility
  recurring_template_id: string | null
  is_recurring_instance: boolean
  generated_for_date: string | null
  parent_task_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface TaskAssignee {
  id: string
  task_id: string
  profile_id: string
  is_primary_owner: boolean
  role_in_task: string | null
  created_at: string
  updated_at: string
}

export interface TaskComment {
  id: string
  task_id: string
  author_id: string
  content: string
  visibility: Visibility
  created_at: string
  updated_at: string
}

export interface TaskChecklistItem {
  id: string
  task_id: string
  content: string
  is_done: boolean
  sort_order: number
  created_at: string
}

export interface ProjectTemplate {
  id: string
  service_type: string
  service_subtype: string | null
  name: string
  description: string | null
  is_active: boolean
  sort_order: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ProjectTemplateNode {
  id: string
  template_id: string
  parent_id: string | null
  node_type: 'workstream' | 'milestone' | 'task' | 'recurring_task'
  name: string
  description: string | null
  workstream_type: WorkstreamType | null
  milestone_type: MilestoneType | null
  frequency: RecurrenceFrequency | null
  suggested_owner_role: string | null
  relative_due_days: number | null
  priority: Priority | null
  visibility: Visibility
  estimated_hours: number | null
  sort_order: number
  created_at: string
}

