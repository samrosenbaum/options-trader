import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PortfolioClient from './portfolio-client'
import Navigation from '@/components/navigation'

export default async function PortfolioPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Fetch user's positions
  const { data: positions, error } = await supabase
    .from('positions')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  return (
    <>
      <Navigation userEmail={user.email} />
      <PortfolioClient
        initialPositions={positions || []}
        user={user}
      />
    </>
  )
}
