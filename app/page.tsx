import { createClient } from '@/lib/supabase/server'
import LandingPage from './landing-page'
import DashboardPage from './dashboard-page'
import AppShell from '@/components/app-shell'

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
    <AppShell userEmail={user.email}>
      <DashboardPage />
    </AppShell>
  )
}
