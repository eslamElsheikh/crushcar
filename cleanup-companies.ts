import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

async function main() {
  console.log(' Cleaning up empty companies...')

  const companies = await p.company.findMany({
    include: {
      _count: { select: { buses: true, users: true } },
    },
  })

  console.log(`Found ${companies.length} companies`)

  for (const company of companies) {
    const busCount = company._count.buses
    const userCount = company._count.users
    console.log(`  ${company.id}: buses=${busCount}, users=${userCount}`)

    if (busCount === 0 && userCount === 0) {
      console.log(`  🗑️ Deleting empty company: ${company.id}`)
      await p.company.delete({ where: { id: company.id } })
    }
  }

  // Make sure admin is linked to the company with data
  const admin = await p.user.findFirst({ where: { email: 'admin@cairoexpress.com' } })
  const companyWithData = await p.company.findFirst({
    include: { _count: { select: { buses: true } } },
  })

  if (admin && companyWithData && admin.companyId !== companyWithData.id) {
    console.log(`🔗 Linking admin to company: ${companyWithData.id}`)
    await p.user.update({
      where: { id: admin.id },
      data: { companyId: companyWithData.id },
    })
  }

  console.log('✅ Cleanup done!')
}

main().finally(() => p.$disconnect())
