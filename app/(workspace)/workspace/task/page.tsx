import { redirect } from 'next/navigation'

// Vista Task globale disattivata nel portale workspace: le task si gestiscono da
// "Le mie attività" e dalla pagina del progetto. Accesso diretto reindirizzato.
export default function WorkspaceTaskPage() {
  redirect('/workspace/attivita')
}
