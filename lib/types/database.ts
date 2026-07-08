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

export type LeadContactSource = 'meta_ads' | 'google_ads' | 'website' | 'organic' | 'whatsapp' | 'email' | 'referral' | 'other'
export type LeadContactStatus = 'nuovo' | 'contattato' | 'qualificato' | 'in_trattativa' | 'convertito' | 'perso'

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
export type InvoiceStatus = 'da_inviare' | 'inviata' | 'pagata' | 'in_ritardo' | 'accettata'
export type InvoiceType = 'fattura' | 'nota_credito'
export type StakeholderRole = 'owner' | 'stakeholder' | 'collaboratore_esterno' | 'agenzia_supporto'
export type ProjectStatus = 'attivo' | 'in_pausa' | 'completato' | 'archiviato'
export type SprintStatus = 'pianificato' | 'in_corso' | 'completato'
export type TaskPriority = 'alta' | 'media' | 'bassa'
export type TaskStatus = 'da_fare' | 'in_corso' | 'in_revisione' | 'completato'
export type ChannelType = 'cliente' | 'interno' | 'task' | 'customer_care' | 'cliente_interno' | 'partner_customer_care'

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

export type ResourceType = 'internal_employee' | 'external_freelancer' | 'partner' | 'agency_supplier' | 'consultant' | 'contractor'
export type ResourceCostType = 'monthly_salary' | 'hourly' | 'daily' | 'project_fee' | 'retainer' | 'partner_percentage'

export interface ResourceCost {
  id: string
  profile_id: string | null
  name: string
  resource_type: ResourceType
  role_title: string | null
  department: string | null
  seniority: string | null
  cost_type: ResourceCostType
  monthly_cost: number | null
  hourly_cost: number | null
  daily_cost: number | null
  project_fee: number | null
  partner_percentage: number | null
  tools_cost_monthly: number
  overhead_percentage: number
  availability_hours_month: number
  billable_target_hours_month: number
  calculated_hourly_cost: number | null
  markup_default: number
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export type ProjectCostCategory = 'risorsa' | 'software' | 'provvigione' | 'cac' | 'produzione' | 'indiretto' | 'altro'

export interface ProjectCostEntry {
  id: string
  project_id: string
  client_id: string | null
  category: ProjectCostCategory
  description: string
  amount: number
  resource_cost_id: string | null
  hours: number | null
  hourly_rate: number | null
  month: string | null
  is_recurring: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export type BusinessCostCategory = 'affitto' | 'software' | 'amministrazione' | 'marketing' | 'personale' | 'formazione' | 'altro'

export interface BusinessCost {
  id: string
  category: BusinessCostCategory
  description: string
  monthly_amount: number
  is_active: boolean
  notes: string | null
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

export interface Approval {
  id: string
  type: string
  title: string
  description: string | null
  requested_by: string
  approver_id: string | null
  status: 'pending' | 'approved' | 'rejected'
  entity_type: string | null
  entity_id: string | null
  payload: Record<string, unknown> | null
  resolved_at: string | null
  resolved_by: string | null
  notes: string | null
  created_at: string
}

export interface Client {
  id: string
  company_name: string
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

export interface Invoice {
  id: string
  client_id: string
  month: string
  amount: number
  invoice_number: string | null
  sent_at: string | null
  paid_at: string | null
  status: InvoiceStatus
  notes: string | null
  created_by: string | null
  invoice_type: InvoiceType
  due_date: string | null
  aruba_id: string | null
  description: string | null
  pdf_url: string | null
  created_at: string
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

export type ProjectType = 'ecommerce' | 'lead_gen' | 'sito_web' | 'app_ai' | 'campagna' | 'custom'
export type ProjectKind = 'growth' | 'marketing' | 'digital' | 'ai'

export interface Project {
  id: string
  client_id: string
  name: string
  description: string | null
  brief: string | null
  brief_updated_at: string | null
  status: ProjectStatus
  project_type: ProjectType
  project_kind: ProjectKind | null
  sprint_current: number
  manager_id: string | null
  created_at: string
}

export interface Sprint {
  id: string
  project_id: string
  name: string
  start_date: string
  end_date: string
  status: SprintStatus
}

export interface Task {
  id: string
  project_id: string
  sprint_id: string | null
  parent_task_id: string | null
  depth: number
  title: string
  description: string | null
  assignee_id: string | null
  priority: TaskPriority
  status: TaskStatus
  due_date: string | null
  is_milestone: boolean
  tags: string[]
  estimated_hours: number | null
  logged_hours: number
  position: number
  recurrence: string | null
  section: string | null
  asana_gid: string | null
  assigned_to: string | null
  is_client_task: boolean
  links: { url: string; label: string }[]
  created_at: string
  created_by: string | null
}

export interface TaskComment {
  id: string
  task_id: string
  author_id: string | null
  content: string
  created_at: string
  edited_at: string | null
  author?: Pick<Profile, 'id' | 'full_name' | 'avatar_url'>
}

export interface TaskDependency {
  id: string
  task_id: string
  depends_on_id: string
  type: 'blocking' | 'waiting_on'
  created_at: string
}

export interface TaskTimeLog {
  id: string
  task_id: string
  profile_id: string | null
  hours: number
  note: string | null
  logged_date: string
  created_at: string
  profile?: Pick<Profile, 'id' | 'full_name'>
}

export type TimeEntryCategory = 'sviluppo' | 'design' | 'riunione' | 'strategia' | 'formazione' | 'admin' | 'altro'

export interface TimeEntry {
  id: string
  profile_id: string
  project_id: string | null
  client_id: string | null
  task_id: string | null
  date: string
  hours: number
  category: TimeEntryCategory
  note: string | null
  created_at: string
}

export interface TimeEntryRow extends TimeEntry {
  profile?: Pick<Profile, 'id' | 'full_name'>
  project?: Pick<Project, 'id' | 'name'> | null
  client?: Pick<Client, 'id' | 'company_name'> | null
  task?: Pick<Task, 'id' | 'title'> | null
}

export interface TaskAttachment {
  id: string
  task_id: string
  name: string
  file_url: string
  uploaded_by: string | null
  created_at: string
}

export interface MeetingNote {
  id: string
  client_id: string
  project_id: string | null
  title: string
  date: string
  attendees: string[] | null
  summary: string
  decisions: string | null
  next_actions: string | null
  created_by: string | null
  created_at: string
}

export interface ProjectAppointment {
  id: string
  project_id: string
  client_id: string
  title: string
  date: string
  time: string | null
  location: string | null
  notes: string | null
  attendees: string[] | null
  created_by: string | null
  created_at: string
}

export interface ClientKpi {
  id: string
  client_id: string
  project_id: string | null
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
  project_id: string | null
  enabled: string[]
  custom_kpis: CustomKpiDef[]
}

export interface Document {
  id: string
  client_id: string
  project_id: string | null
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
  project_id: string | null
  task_id: string | null
  created_at: string
  created_by: string | null
  is_archived: boolean
  is_read_only: boolean
  topic: string | null
  pinned_message_ids: string[]
  position: number
  last_message_at: string | null
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

export interface TaskWithAssignee extends Task {
  assignee: Profile | null
  project: Pick<Project, 'id' | 'name' | 'client_id'> | null
}

export interface ChatMessageWithSender extends ChatMessage {
  sender: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null
}

// ─── Area Commerciale ────────────────────────────────────────
export type DealStage = 'lead' | 'contatto' | 'proposta' | 'trattativa' | 'chiuso_vinto' | 'chiuso_perso'

export interface Deal {
  id: string
  title: string
  company_name: string
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  value: number | null
  stage: DealStage
  probability: number
  expected_close: string | null
  source: string | null
  notes: string | null
  assigned_to: string | null
  client_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface DealActivity {
  id: string
  deal_id: string
  type: 'nota' | 'chiamata' | 'email' | 'meeting' | 'followup'
  content: string
  created_by: string | null
  created_at: string
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
  created_at: string
  updated_at: string
}

export type BrandMode = 'twobee' | 'white_label' | 'partner_branded' | 'neutral'
export type ProposalStatus = 'draft' | 'ready' | 'sent' | 'accepted' | 'rejected'

export interface ProposalSection {
  title: string
  content: string
  bullets: string[]
  speaker_notes?: string
}

export interface ProposalContent {
  title: string
  sections: ProposalSection[]
  commercial_summary: string
  next_steps: string[]
  missing_data: string[]
}

export interface ProposalDocument {
  id: string
  quote_id: string | null
  client_id: string | null
  deal_id: string | null
  title: string
  brand_mode: BrandMode
  white_label_partner_name: string | null
  status: ProposalStatus
  content_json: ProposalContent
  html_content: string | null
  pdf_url: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type QuoteStatus = 'bozza' | 'inviata' | 'accettata' | 'rifiutata' | 'scaduta'

export interface QuoteItem {
  id: string
  service_name: string
  resource_cost_id: string | null
  resource_name: string | null
  hours: number
  cost_rate: number
  markup: number
  sale_price: number
}

export interface QuoteExternalCost {
  id: string
  label: string
  amount: number
}

export interface Quote {
  id: string
  deal_id: string | null
  client_id: string | null
  title: string
  items: QuoteItem[]
  external_costs: QuoteExternalCost[]
  total: number
  total_cost: number
  target_margin: number
  final_price: number | null
  margin_amount: number | null
  margin_percentage: number | null
  status: QuoteStatus
  valid_until: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string | null
}

// ─── Area Operativa ──────────────────────────────────────────
export interface TaskTemplate {
  id: string
  name: string
  service_type: 'growth' | 'digital' | 'entrambi'
  tasks: { title: string; priority: string; days_offset: number; area?: string }[]
  created_by: string | null
  created_at: string
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

export interface OnboardingStep {
  id: string
  user_id: string
  step: string
  completed: boolean
  completed_at: string | null
  due_date: string | null
  notes: string | null
  created_at: string
}

// ─── Strategia ───────────────────────────────────────────────
export type OkrStatus = 'attivo' | 'completato' | 'abbandonato'
export type KrStatus = 'in_corso' | 'completato' | 'a_rischio' | 'abbandonato'
export type RoadmapStatus = 'pianificato' | 'in_corso' | 'completato' | 'bloccato' | 'rinviato'
export type RoadmapPriority = 'critica' | 'alta' | 'media' | 'bassa'
export type StrategicNoteType = 'nota' | 'verbale' | 'decisione' | 'retrospettiva'

export interface Objective {
  id: string
  title: string
  description: string | null
  quarter: string
  owner_id: string | null
  status: OkrStatus
  progress: number
  area: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface KeyResult {
  id: string
  objective_id: string
  title: string
  target_value: number | null
  current_value: number
  unit: string
  due_date: string | null
  status: KrStatus
  notes: string | null
  updated_at: string
}

export interface RoadmapItem {
  id: string
  title: string
  description: string | null
  area: string
  status: RoadmapStatus
  priority: RoadmapPriority
  start_date: string | null
  due_date: string | null
  completed_at: string | null
  owner_id: string | null
  objective_id: string | null
  created_by: string | null
  created_at: string
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

export interface StrategicNote {
  id: string
  title: string
  content: string | null
  type: StrategicNoteType
  date: string
  participants: string[]
  tags: string[]
  pinned: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export type TaskAssigneeRole = 'owner' | 'collaborator' | 'reviewer'

export interface TaskAssignee {
  id: string
  task_id: string
  profile_id: string
  role: TaskAssigneeRole
  is_primary_owner: boolean
  assigned_at: string
  assigned_by: string | null
}

export type TaskDeletionRequestStatus = 'pending' | 'approved' | 'rejected'

export interface TaskDeletionRequest {
  id: string
  task_id: string
  requested_by: string
  reason: string | null
  status: TaskDeletionRequestStatus
  reviewed_by: string | null
  reviewed_at: string | null
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

export type LeadStatus = 'nuovo' | 'contattato' | 'qualificato' | 'convertito' | 'perso'
export type LeadSource = 'facebook' | 'google' | 'linkedin' | 'organic' | 'referral' | 'email' | 'evento' | 'altro'

export interface Lead {
  id: string
  created_at: string
  updated_at: string
  client_id: string | null
  project_id: string | null
  name: string
  company: string | null
  email: string | null
  phone: string | null
  source: LeadSource
  status: LeadStatus
  notes: string | null
  value: number | null
  assigned_to: string | null
  converted_at: string | null
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

export interface LeadContact {
  id: string
  client_id: string
  project_id: string | null
  source: LeadContactSource | null
  full_name: string | null
  email: string | null
  phone: string | null
  status: LeadContactStatus
  notes: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface TaskBlockReport {
  id: string
  task_id: string
  reported_by: string
  reason: string
  status: 'open' | 'acknowledged' | 'resolved'
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
  // join
  reporter?: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null
  task?: Pick<Task, 'id' | 'title'> | null
}
