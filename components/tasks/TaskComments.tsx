'use client'

import { useState, useEffect, useRef } from 'react'
import { Send, Loader2, Pencil, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { getInitials, timeAgo } from '@/lib/utils'
import type { TaskComment } from '@/lib/types/database'

interface TaskCommentWithAuthor {
  id: string
  task_id: string
  author_id: string | null
  content: string
  created_at: string
  edited_at: string | null
  author: { id: string; full_name: string; avatar_url: string | null } | null
}

export function TaskComments({ taskId }: { taskId: string }) {
  const [comments, setComments] = useState<TaskCommentWithAuthor[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const [{ data: { user } }, { data }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('task_comments')
          .select('*, author:profiles!task_comments_author_id_fkey(id, full_name, avatar_url)')
          .eq('task_id', taskId)
          .order('created_at'),
      ])
      setCurrentUserId(user?.id ?? null)
      setComments((data ?? []) as TaskCommentWithAuthor[])
      setLoading(false)
    }
    load()
  }, [taskId])

  const send = async () => {
    if (!text.trim()) return
    setSending(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase.from('task_comments').insert({
      task_id: taskId,
      author_id: user?.id,
      content: text.trim(),
    }).select('*, author:profiles!task_comments_author_id_fkey(id, full_name, avatar_url)').single()
    setSending(false)
    if (error) { toast.error('Errore invio commento'); return }
    setComments((prev) => [...prev, data as TaskCommentWithAuthor])
    setText('')
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  const saveEdit = async (id: string) => {
    if (!editText.trim()) return
    const supabase = createClient()
    await supabase.from('task_comments').update({ content: editText.trim(), edited_at: new Date().toISOString() }).eq('id', id)
    setComments((prev) => prev.map((c) => c.id === id ? { ...c, content: editText.trim(), edited_at: new Date().toISOString() } : c))
    setEditingId(null)
  }

  const deleteComment = async (id: string) => {
    const supabase = createClient()
    await supabase.from('task_comments').delete().eq('id', id)
    setComments((prev) => prev.filter((c) => c.id !== id))
    toast.success('Commento eliminato')
  }

  if (loading) return <div className="text-xs text-text-secondary py-2">Caricamento commenti...</div>

  return (
    <div className="space-y-3">
      {/* Lista commenti */}
      <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
        {comments.length === 0 && (
          <p className="text-xs text-text-secondary italic">Nessun commento ancora.</p>
        )}
        {comments.map((c) => (
          <div key={c.id} className="flex gap-2.5">
            <div className="w-7 h-7 rounded-full bg-gold/20 border border-gold/30 flex items-center justify-center text-gold-text text-xs font-bold shrink-0">
              {getInitials(c.author?.full_name ?? '?')}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-semibold text-text-primary">{c.author?.full_name ?? 'Utente'}</span>
                <span className="text-xs text-text-secondary">{timeAgo(c.created_at)}</span>
                {c.edited_at && <span className="text-xs text-text-secondary italic">(modificato)</span>}
              </div>
              {editingId === c.id ? (
                <div className="flex gap-2">
                  <input
                    autoFocus
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(c.id); if (e.key === 'Escape') setEditingId(null) }}
                    className="flex-1 bg-background border border-gold rounded px-2 py-1 text-xs text-text-primary focus:outline-none"
                  />
                  <button onClick={() => saveEdit(c.id)} className="text-xs text-gold-text hover:underline">Salva</button>
                  <button onClick={() => setEditingId(null)} className="text-xs text-text-secondary hover:text-text-primary">✕</button>
                </div>
              ) : (
                <div className="group flex items-start gap-2">
                  <p className="text-sm text-text-primary leading-relaxed flex-1">{c.content}</p>
                  {c.author_id === currentUserId && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button onClick={() => { setEditingId(c.id); setEditText(c.content) }} className="text-text-secondary hover:text-gold-text">
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button onClick={() => deleteComment(c.id)} className="text-text-secondary hover:text-error">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2 pt-1 border-t border-border">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="Scrivi un commento..."
          className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold placeholder:text-text-secondary"
        />
        <button
          onClick={send}
          disabled={sending || !text.trim()}
          className="p-2 bg-gold text-on-gold rounded-lg hover:bg-gold/90 disabled:opacity-40 transition-colors"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )
}
