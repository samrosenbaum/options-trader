import { createClient } from '@/lib/supabase/server'
import Navigation from '@/components/navigation'
import ScannerPage from '../scanner-page'
import LandingPage from '../landing-page'

export default async function ScannerRoute() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return <LandingPage />
  }

  return (
    <>
      <Navigation userEmail={user.email} />
      <ScannerPage user={user} />
    </>
  )
}
