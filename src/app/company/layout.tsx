import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import CompanyLayoutClient from './layout-client'

export default async function CompanyLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  if (!session?.user) redirect('/login')

  if (session.user.role === 'CUSTOMER') redirect('/trips')

  if (session.user.role === 'SUPER_ADMIN') redirect('/admin')

  // Business rule: every COMPANY_ADMIN (with or without buses) uses /company.
  // Only SUPER_ADMIN operates /admin. No company owns or manages fleet.
  return <CompanyLayoutClient session={session}>{children}</CompanyLayoutClient>
}
