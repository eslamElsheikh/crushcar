import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const setting = await prisma.siteSetting.findUnique({
      where: { key: 'individualRegistrationEnabled' },
    })

    return NextResponse.json({ enabled: setting?.value !== 'false' })
  } catch {
    return NextResponse.json({ enabled: true })
  }
}
