import { useState } from 'react'
import type { DragHandlers } from './types'

export function useDragReorder<T extends { id: string }>(
  getItems: () => T[],
  onReorder: (items: T[]) => void,
  persist: (items: T[]) => void
): DragHandlers<T> {
  const [dragging, setDragging] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)

  return {
    dragging, dragOver,
    onDragStart: (_e, id) => setDragging(id),
    onDragOver:  (e, id)  => { e.preventDefault(); setDragOver(id) },
    onDrop: (e, targetId) => {
      e.preventDefault()
      if (!dragging || dragging === targetId) { setDragging(null); setDragOver(null); return }
      const arr = [...getItems()]
      const from = arr.findIndex(x => x.id === dragging)
      const to   = arr.findIndex(x => x.id === targetId)
      const [m]  = arr.splice(from, 1); arr.splice(to, 0, m)
      const updated = arr.map((x, i) => ({ ...x, order: i }))
      onReorder(updated)
      persist(updated)
      setDragging(null); setDragOver(null)
    },
    onDragEnd: () => { setDragging(null); setDragOver(null) },
  }
}
