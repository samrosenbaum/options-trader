import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/app-shell'
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
    <AppShell userEmail={user.email}>
      <ScannerPage user={user} />
    </AppShell>
  )
}
