'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { buildProposalHtml } from '@/lib/proposal-html'
import type { ProposalDocument, ProposalContent, ProposalStatus, BrandMode } from '@/lib/types/database'

export interface ProposalInput {
  id?: string
  quote_id: string | null
  client_id: string | null
  deal_id: string | null
  brand_mode: BrandMode
  white_label_partner_name: string | null
  content_json: ProposalContent
  target_name: string | null
}

export async function saveProposal(input: ProposalInput): Promise<ProposalDocument> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('Non autenticato')

  const html_content = buildProposalHtml(
    input.content_json, input.brand_mode, input.white_label_partner_name, input.target_name,
  )

  const payload = {
    quote_id: input.quote_id,
    client_id: input.client_id,
    deal_id: input.deal_id,
    title: input.content_json.title,
    brand_mode: input.brand_mode,
    white_label_partner_name: input.white_label_partner_name,
    content_json: input.content_json,
    html_content,
  }

  const { data, error } = input.id
    ? await sb.from('proposal_documents').update(payload).eq('id', input.id).select().single()
    : await sb.from('proposal_documents').insert({ ...payload, created_by: user.id }).select().single()

  if (error) throw new Error(error.message)
  revalidatePath('/commerciale')
  return data as ProposalDocument
}

export async function updateProposalStatus(id: string, status: ProposalStatus) {
  const sb = await createClient()
  const { error } = await sb.from('proposal_documents').update({ status }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/commerciale')
}

export async function deleteProposal(id: string) {
  const sb = await createClient()
  const { error } = await sb.from('proposal_documents').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/commerciale')
}
