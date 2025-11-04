import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CryptoPage from '@/app/crypto-page'

export const metadata = {
  title: 'Crypto Alpha - Whale & Institutional Activity',
  description: 'Monitor Bitcoin and Ethereum futures, shorts, whale transactions, and institutional money flows'
}

export default async function CryptoRoute() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  return <CryptoPage user={user} />
}
