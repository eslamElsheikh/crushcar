import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import AdminLayoutClient from './layout-client'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  if (!session?.user) redirect('/login')

  if (session.user.role === 'CUSTOMER') redirect('/trips')

  if (session.user.role === 'COMPANY_ADMIN' && session.user.companyId) {
    const company = await prisma.company.findUnique({
      where: { id: session.user.companyId },
      include: { _count: { select: { buses: true } } },
    })
    if (!company || company._count.buses === 0) {
      redirect('/company/dashboard')
    }
  }

  return <AdminLayoutClient session={session}>{children}</AdminLayoutClient>
}
