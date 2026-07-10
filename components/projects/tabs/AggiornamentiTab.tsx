'use client'

import { useState } from 'react'
import { MessageCircle, Loader2, Plus, Send, X, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Profile } from '@/lib/types/database'
import { Section, timeAgo, UPDATE_TAGS, type ProjectComment } from '../project-shared'

export function AggiornamentiFeed({ comments, currentProfile, projectId, allProfiles, isAdmin, onUpdate, accent }: {
  comments: ProjectComment[]; currentProfile: Profile; projectId: string
  allProfiles: Profile[]; isAdmin: boolean; onUpdate: (c: ProjectComment[]) => void; accent: string
}) {
  const [showCompose, setCompose] = useState(false)
  const [tag, setTag]             = useState(UPDATE_TAGS[0])
  const [text, setText]           = useState('')
  const [sending, setSending]     = useState(false)
  const [replyingTo, setReply]    = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')

  const posts   = comments.filter(c => !c.parent_id).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  const replies = (id: string) => comments.filter(c => c.parent_id === id).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  const name    = (id: string | null) => id ? (allProfiles.find(p => p.id === id)?.full_name ?? 'Utente') : 'Anonimo'
  const ini     = (id: string | null) => name(id).split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

  const tagStyle: Record<string, string> = {
    'Milestone raggiunta':   'bg-success/10 text-success border-success/25',
    'Blocco':                'bg-error/10 text-error border-error/25',
    'Update settimanale':    'bg-gold/10 text-gold-text border-gold/25',
    'Altro':                 'bg-surface-active text-text-tertiary border-border',
  }

  const submitPost = async (e: React.FormEvent) => {
    e.preventDefault(); if (!text.trim()) return; setSending(true)
    const { data, error } = await createClient().from('project_comments')
      .insert({ project_id: projectId, author_id: currentProfile.id, content: text.trim(), tag, is_client: false, parent_id: null })
      .select().single()
    setSending(false)
    if (error) { toast.error(error.message); return }
    onUpdate([data as ProjectComment, ...comments]); setText(''); setCompose(false)
    toast.success('Update pubblicato')
  }

  const submitReply = async (postId: string) => {
    if (!replyText.trim()) return; setSending(true)
    const { data, error } = await createClient().from('project_comments')
      .insert({ project_id: projectId, author_id: currentProfile.id, content: replyText.trim(), parent_id: postId, is_client: false, tag: null })
      .select().single()
    setSending(false)
    if (error) { toast.error(error.message); return }
    onUpdate([...comments, data as ProjectComment]); setReplyText(''); setReply(null)
  }

  const deleteComment = async (id: string) => {
    if (!confirm('Eliminare?')) return
    await createClient().from('project_comments').delete().eq('id', id)
    onUpdate(comments.filter(c => c.id !== id && c.parent_id !== id))
    toast.success('Eliminato')
  }

  return (
    <Section title="Aggiornamenti" icon={<MessageCircle className="w-3.5 h-3.5" />}
      count={posts.length} accent={accent}
      right={isAdmin && (
        <button onClick={() => setCompose(c => !c)}
          className="flex items-center gap-1 text-2xs font-bold px-2.5 py-1.5 rounded-lg border transition-all mr-1"
          style={{ background: showCompose ? `color-mix(in srgb, ${accent} 8%, transparent)` : 'transparent', borderColor: showCompose ? `color-mix(in srgb, ${accent} 25%, transparent)` : 'var(--color-border)', color: showCompose ? accent : '#555' }}>
          {showCompose ? <><X className="w-3 h-3" /> Chiudi</> : <><Plus className="w-3 h-3" /> Pubblica</>}
        </button>
      )}>
      <div className="p-4">
        {showCompose && isAdmin && (
          <form onSubmit={submitPost} className="mb-5 border border-border rounded-2xl overflow-hidden bg-background">
            <div className="flex gap-2 flex-wrap px-4 pt-3 pb-2">
              {UPDATE_TAGS.map(t => (
                <button key={t} type="button" onClick={() => setTag(t)}
                  className={`text-2xs font-bold px-2.5 py-1.5 rounded-lg border transition-colors ${tag === t ? tagStyle[t] : 'border-border text-text-tertiary hover:text-text-primary'}`}>
                  {t}
                </button>
              ))}
            </div>
            <textarea value={text} onChange={e => setText(e.target.value)}
              placeholder="Cosa è successo? Cosa succederà?"
              rows={3}
              className="w-full bg-transparent px-4 py-2 text-sm text-text-primary resize-none focus:outline-none placeholder:text-text-tertiary" />
            <div className="flex justify-end px-4 pb-3">
              <button type="submit" disabled={sending || !text.trim()}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl text-on-gold disabled:opacity-40"
                style={{ background: accent }}>
                {sending && <Loader2 className="w-3 h-3 animate-spin" />} Pubblica
              </button>
            </div>
          </form>
        )}

        {posts.length === 0 ? (
          <div className="flex flex-col items-center py-12 gap-2">
            <MessageCircle className="w-8 h-8 text-text-tertiary" />
            <p className="text-xs text-text-tertiary">Nessun aggiornamento ancora.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {posts.map(post => {
              const reps = replies(post.id)
              const ts   = tagStyle[post.tag ?? ''] ?? ''
              return (
                <div key={post.id} className="group border border-border rounded-2xl overflow-hidden hover:border-border transition-colors">
                  <div className="flex items-start gap-3 px-4 pt-4 pb-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-2xs font-black shrink-0"
                      style={{ background: `color-mix(in srgb, ${accent} 8%, transparent)`, color: accent }}>{ini(post.author_id)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span className="text-sm font-bold text-text-primary">{name(post.author_id)}</span>
                        {ts && post.tag && <span className={`text-2xs border px-2 py-0.5 rounded-full font-bold ${ts}`}>{post.tag}</span>}
                        <span className="text-2xs text-text-tertiary ml-auto">{timeAgo(post.created_at)}</span>
                        {isAdmin && (
                          <button onClick={() => deleteComment(post.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 text-text-tertiary hover:text-error transition-all">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      <p className="text-sm text-text-primary leading-relaxed">{post.content}</p>
                    </div>
                  </div>

                  {reps.length > 0 && (
                    <div className="border-t border-border">
                      {reps.map(r => (
                        <div key={r.id} className="group/r flex items-start gap-2.5 px-4 py-3 bg-background">
                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-2xs font-bold bg-background text-text-tertiary shrink-0">{ini(r.author_id)}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-xs font-semibold text-text-tertiary">{name(r.author_id)}</span>
                              <span className="text-2xs text-text-tertiary ml-auto">{timeAgo(r.created_at)}</span>
                              {isAdmin && (
                                <button onClick={() => deleteComment(r.id)}
                                  className="opacity-0 group-hover/r:opacity-100 p-0.5 text-text-tertiary hover:text-error">
                                  <Trash2 className="w-2.5 h-2.5" />
                                </button>
                              )}
                            </div>
                            <p className="text-xs text-text-tertiary leading-relaxed">{r.content}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="border-t border-border px-4 py-2.5 bg-background">
                    {replyingTo === post.id ? (
                      <div className="flex items-center gap-2">
                        <input value={replyText} onChange={e => setReplyText(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitReply(post.id) } }}
                          placeholder="Rispondi…" autoFocus
                          className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-gold" />
                        <button onClick={() => submitReply(post.id)} disabled={sending || !replyText.trim()}
                          className="p-1.5 rounded-lg disabled:opacity-40 text-on-gold" style={{ background: accent }}>
                          <Send className="w-3 h-3" />
                        </button>
                        <button onClick={() => { setReply(null); setReplyText('') }} className="p-1.5 text-text-tertiary hover:text-text-primary">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setReply(post.id)}
                        className="flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-primary transition-colors">
                        <MessageCircle className="w-3.5 h-3.5" />
                        {reps.length > 0 ? `${reps.length} ${reps.length === 1 ? 'commento' : 'commenti'}` : 'Rispondi'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Section>
  )
}
