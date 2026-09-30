import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

async function main() {
  const admin = await p.user.findFirst({ where: { email: 'admin@cairoexpress.com' } })
  console.log('Admin:', admin?.id, 'companyId:', admin?.companyId)

  const company = await p.company.findFirst()
  console.log('Company:', company?.id)

  if (admin && company && admin.companyId !== company.id) {
    console.log('Fixing admin companyId...')
    await p.user.update({
      where: { id: admin.id },
      data: { companyId: company.id },
    })
    console.log('✅ Admin linked to correct company')
  } else {
    console.log('✅ Admin already linked correctly')
  }

  // Verify
  const updated = await p.user.findFirst({ where: { email: 'admin@cairoexpress.com' } })
  console.log('Final admin companyId:', updated?.companyId)
}

main().finally(() => p.$disconnect())
