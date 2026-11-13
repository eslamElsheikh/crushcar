import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const wantsAll = url.searchParams.get('all') === '1'

    // `?all=1` means "include the drafts" — the administrative view the
    // /admin/faqs page toggles. It used to be an unauthenticated switch, so
    // an unpublished FAQ (an answer still being reviewed, a correction not
    // yet public) was readable by anyone who guessed the parameter. The
    // public site has never asked for it: it reads the default view.
    let showAll = false
    if (wantsAll) {
      const session = await auth()
      showAll = session?.user?.role === 'SUPER_ADMIN'
    }

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
    if (!session?.user || session.user.role !== 'SUPER_ADMIN') {
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
