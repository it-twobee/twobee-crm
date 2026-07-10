import { redirect } from 'next/navigation'

// Chat disattivata nel portale workspace: il Customer Care resta la sola chat.
export default function WorkspaceChatPage() {
  redirect('/workspace/customer-care')
}
