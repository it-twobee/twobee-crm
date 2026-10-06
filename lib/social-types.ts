/* §467 — Le forme che viaggiano dal server alla pagina Social. */

export type SocialProjectRow = {
  id: string
  client_id: string
  name: string
  manager_id: string | null
  status: string
  client_name: string | null
}

export type SocialMediaItem = { id: string; name: string; mime: string | null; size: number; kind: string; sort_order: number }

export type SocialContentRow = {
  id: string
  client_id: string
  project_id: string
  milestone_id: string | null
  planned_date: string
  planned_time: string | null
  channels: string[]
  format: string
  title: string
  caption: string | null
  status: string
  owner_id: string | null
  created_by: string | null
  updated_at: string
  links: { channel: string; url: string }[]
  media: SocialMediaItem[]
}

export type SocialMilestone = { id: string; title: string; due_date: string | null; status: string; project_id: string }

export type SocialBoardData = {
  mese: string
  oggi: string
  projects: SocialProjectRow[]
  contents: SocialContentRow[]
  /** I progetti «miei»: gestiti, da membro, con una task o un contenuto in carico. */
  mieiIds: string[]
  /** Progetti attivi senza niente in uscita nei prossimi sette giorni. */
  scopertiIds: string[]
  milestones: SocialMilestone[]
  staff: { id: string; full_name: string; avatar_url: string | null }[]
  /** Il calendario ha più righe di quelle lette: la pagina lo dichiara. */
  parziale: boolean
  errore: string | null
}
