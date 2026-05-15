import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import Stripe from 'stripe'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const booking = await prisma.booking.findUnique({
      where: { id },
      include: { trip: { include: { bus: true } }, user: { select: { id: true, name: true, email: true } } },
    })

    if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (booking.userId !== session.user.id && session.user.role !== 'COMPANY_ADMIN' && session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json({ ...booking, paidAt: booking.paidAt?.toISOString() || null, boardedAt: booking.boardedAt?.toISOString() || null })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const { status } = await req.json()

    const booking = await prisma.booking.findUnique({ where: { id } })
    if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (booking.userId !== session.user.id && session.user.role !== 'COMPANY_ADMIN' && session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (status === 'CANCELLED') {
      let refunded = false
      if (booking.status === 'PAID' && booking.stripeSessionId) {
        try {
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2026-04-22.dahlia' })
          const session = await stripe.checkout.sessions.retrieve(booking.stripeSessionId)
          const pi = session.payment_intent
          if (pi && typeof pi === 'string') {
            await stripe.refunds.create({ payment_intent: pi })
            refunded = true
          }
        } catch (e) {
          console.error('Stripe refund failed:', e)
        }
      }
      const updated = await prisma.booking.update({
        where: { id },
        data: { status: 'CANCELLED' },
      })
      return NextResponse.json({ ...updated, paidAt: updated.paidAt?.toISOString() || null, refunded })
    }

    if (status === 'BOARDED') {
      if (session.user.role === 'CUSTOMER') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      const updated = await prisma.booking.update({
        where: { id },
        data: { status: 'BOARDED', boarded: true, boardedAt: new Date() },
      })
      return NextResponse.json({ ...updated, paidAt: updated.paidAt?.toISOString() || null, boardedAt: updated.boardedAt?.toISOString() || null })
    }

    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}