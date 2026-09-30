import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import CompanyLayoutClient from './layout-client'

export default async function CompanyLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  if (!session?.user) redirect('/login')

  if (session.user.role === 'CUSTOMER') redirect('/trips')

  if (session.user.role === 'SUPER_ADMIN') redirect('/admin')

  if (session.user.role === 'COMPANY_ADMIN' && session.user.companyId) {
    const company = await prisma.company.findUnique({
      where: { id: session.user.companyId },
      include: { _count: { select: { buses: true } } },
    })
    if (company && company._count.buses > 0) {
      redirect('/admin')
    }
  }

  return <CompanyLayoutClient session={session}>{children}</CompanyLayoutClient>
}
