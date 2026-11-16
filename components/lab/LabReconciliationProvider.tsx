'use client'
import { createContext, useContext, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
export type ReconciliationRequest = { movementId?: string; documentId?: string; editId?: string; adoptMovement?: string; operation?: 'save' | 'verify' | 'cancel' | 'unlink_legacy' }
const Popup = dynamic(() => import('@/components/lab/LabReconciliationPopup'), { ssr: false })
const Context = createContext<((request: ReconciliationRequest) => void) | null>(null)
export const useReconciliationPopup = () => useContext(Context)
export default function LabReconciliationProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<ReconciliationRequest | null>(null), router = useRouter()
  return <Context.Provider value={setRequest}>{children}{request && <Popup request={request} onClose={() => setRequest(null)} onSaved={() => { setRequest(null); window.dispatchEvent(new Event('lab-reconciliations-updated')); router.refresh() }} />}</Context.Provider>
}
export function LabReconcileButton({ movementId, documentId, label }: { movementId?: string; documentId?: string; label: string }) {
  const open = useReconciliationPopup()
  return <button type="button" disabled={!open} onClick={() => open?.({ movementId, documentId })} className="inline-flex min-h-11 items-center rounded-xl border border-border-interactive px-3 text-sm text-gold-text hover:bg-surface-hover disabled:opacity-50">{label}</button>
}
