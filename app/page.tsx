import { createClient } from '@/lib/supabase/server'
import LandingPage from './landing-page'
import DashboardPage from './dashboard-page'
import Navigation from '@/components/navigation'

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Show landing page if not logged in
  if (!user) {
    return <LandingPage />
  }

  // Show dashboard with navigation if logged in
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Navigation userEmail={user.email} />
      <main className="flex-1 overflow-hidden">
        <DashboardPage />
      </main>
    </div>
  )
}
