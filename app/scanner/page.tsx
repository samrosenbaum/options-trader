import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Navigation from '@/components/navigation'
import ScannerPage from '../scanner-page'

export default async function ScannerRoute() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  return (
    <>
      <Navigation userEmail={user.email} />
      <ScannerPage user={user} />
    </>
  )
}
