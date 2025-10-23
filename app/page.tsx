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
    <>
      <Navigation userEmail={user.email} />
      <DashboardPage />
    </>
  )
}
