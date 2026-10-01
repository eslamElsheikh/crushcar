import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import AdminLayoutClient from './layout-client'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  if (!session?.user) redirect('/login')

  if (session.user.role === 'CUSTOMER') redirect('/trips')

  // Business rule: /admin is SUPER_ADMIN only. Every COMPANY_ADMIN uses /company.
  if (session.user.role === 'COMPANY_ADMIN') redirect('/company/dashboard')

  return <AdminLayoutClient session={session}>{children}</AdminLayoutClient>
}
