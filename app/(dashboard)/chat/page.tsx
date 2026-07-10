import { redirect } from 'next/navigation'

// Chat disattivata: resta solo il Customer Care. Qualsiasi accesso alla vecchia
// rotta /chat viene reindirizzato lì.
export default function ChatPage() {
  redirect('/customer-care')
}
