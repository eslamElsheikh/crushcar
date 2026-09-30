import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

const defaultFaqs = [
  {
    questionAr: 'إزاي أحجز تذكرة؟',
    questionEn: 'How do I book a ticket?',
    answerAr: 'ادخل على صفحة الرحلات، اختار المحطة والتاريخ، اختار مقعدك، وادفع أونلاين. هيوصلك تأكيد على الإيميل فوراً.',
    answerEn: 'Go to the trips page, select your station and date, choose your seat, and pay online. You\'ll receive instant email confirmation.',
  },
  {
    questionAr: 'إيه هي سياسة الإلغاء والاسترجاع؟',
    questionEn: 'What is the cancellation and refund policy?',
  answerAr: 'أكثر من 24 ساعة قبل المغادرة: استرداد 100% مجاناً.\n12-24 ساعة: استرداد 50%.\n4-12 ساعة: استرداد 25%.\nأقل من 4 ساعات أو بعد المغادرة: لا يوجد استرداد.\n\nيتم الاسترداد نقداً عند المحطة خلال 5-10 أيام عمل.',
  answerEn: 'More than 24 hours before departure: 100% full refund.\n12-24 hours: 50% refund.\n4-12 hours: 25% refund.\nLess than 4 hours or after departure: No refund.\n\nRefunds are processed in cash at the station within 5-10 business days.',
  },
  {
    questionAr: 'إيه طرق الدفع المتاحة؟',
    questionEn: 'What payment methods are available?',
    answerAr: 'الدفع نقداً عند المحطة أو عن طريق التحويل البنكي. بعد الحجز هيتم تأكيد الحجز بعد ما الأدمن يستلم الدفع.',
    answerEn: 'Cash payment at the station or bank transfer. After booking, your reservation will be confirmed once admin receives payment.',
  },
  {
    questionAr: 'أقدر أغير مقعدي بعد الحجز؟',
    questionEn: 'Can I change my seat after booking?',
    answerAr: 'حالياً مش ممكن تغيير المقعد بعد تأكيد الحجز. لو محتاج تغيير، ممكن تلغي الحجز وتحجز تاني حسب سياسة الإلغاء.',
    answerEn: 'Currently, seat changes are not possible after confirmation. If needed, you can cancel and rebook according to our cancellation policy.',
  },
  {
    questionAr: 'إزاي أطبع تذكرتي؟',
    questionEn: 'How do I print my ticket?',
    answerAr: 'بعد الدفع، هتقدر تطبع التذكرة من صفحة حجوزاتك. كمان ممكن تعرضها من الموبايل عند الصعود.',
    answerEn: 'After payment, you can print your ticket from your bookings page. You can also show it on your mobile phone when boarding.',
  },
  {
    questionAr: 'هل ممكن أحجز لأكثر من شخص؟',
    questionEn: 'Can I book for multiple people?',
    answerAr: 'أيوا، تقدر تحجز أكثر من مقعد في نفس الرحلة. كل مقعد هيبقى له رقم حجز منفصل.',
    answerEn: 'Yes, you can book multiple seats on the same trip. Each seat will have its own booking reference.',
  },
  {
    questionAr: 'إمتى لازم أكون في المحطة؟',
    questionEn: 'When should I arrive at the station?',
    answerAr: 'ننصح بالوصول قبل موعد المغادرة بـ 30 دقيقة على الأقل عشان عملية الصعود تتم بهدوء.',
    answerEn: 'We recommend arriving at least 30 minutes before departure for a smooth boarding process.',
  },
  {
    questionAr: 'هل الباصات فيها WiFi وشواحن؟',
    questionEn: 'Do the buses have WiFi and chargers?',
    answerAr: 'معظم باصاتنا مجهزة بـ WiFi وشواحن USB. المميزات بتختلف حسب نوع الباص والرحلة.',
    answerEn: 'Most of our buses are equipped with WiFi and USB chargers. Amenities vary by bus type and trip.',
  },
]

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role === 'CUSTOMER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const existingCount = await prisma.faq.count()
    if (existingCount > 0) {
      return NextResponse.json({ message: 'FAQs already exist', seeded: false })
    }

    await prisma.$transaction(
      defaultFaqs.map((faq, i) =>
        prisma.faq.create({
          data: { ...faq, order: i + 1 },
        })
      )
    )

    return NextResponse.json({ message: 'Default FAQs seeded', seeded: true, count: defaultFaqs.length })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
