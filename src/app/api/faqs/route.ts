import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const showAll = url.searchParams.get('all') === '1'

    const faqs = await prisma.faq.findMany({
      where: showAll ? {} : { isActive: true },
      orderBy: { order: 'asc' },
    })
    return NextResponse.json(faqs)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role === 'CUSTOMER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { questionAr, questionEn, answerAr, answerEn } = await req.json()

    if (!questionAr || !questionEn || !answerAr || !answerEn) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 })
    }

    const maxOrder = await prisma.faq.aggregate({
      _max: { order: true },
    })

    const faq = await prisma.faq.create({
      data: {
        questionAr,
        questionEn,
        answerAr,
        answerEn,
        order: (maxOrder._max.order ?? 0) + 1,
      },
    })

    return NextResponse.json(faq)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
