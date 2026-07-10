import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import { OnboardingClient } from './OnboardingClient'

function OnboardingFallback() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-gold-text animate-spin" />
    </div>
  )
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<OnboardingFallback />}>
      <OnboardingClient />
    </Suspense>
  )
}
