import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';

const actionSchema = z.object({
  action: z.enum(['confirm', 'cancel', 'approve_cancel', 'reject_cancel']),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.user.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { id } = await params;
    const body = await req.json();
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }

    const { action } = parsed.data;

    const existing = await prisma.charterBooking.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Booking not found', message: 'الحجز غير موجود، سيتم تحديث القائمة', currentStatus: null },
        { status: 404 }
      );
    }

    if (action === 'confirm') {
      if (existing.status !== 'requested') {
        return NextResponse.json(
          {
            error: 'Booking is not in requested status',
            message: 'تمت معالجة هذا الحجز بالفعل أو تغيرت حالته، سيتم تحديث القائمة',
            currentStatus: existing.status,
          },
          { status: 400 }
        );
      }

      const result = await prisma.$transaction(async (tx) => {
        const company = await tx.company.findUnique({ where: { id: existing.companyId } });
        if (!company) throw new Error('Company not found');

        const total = existing.price;
        let paidFromWallet = 0;
        let paidOnCredit = 0;

        if (company.paymentMode === 'PREPAID') {
          if (company.walletBalance < total) throw new Error('INSUFFICIENT_WALLET');
          paidFromWallet = total;
        } else {
          paidFromWallet = Math.min(company.walletBalance, total);
          const remaining = total - paidFromWallet;
          if (remaining > 0) {
            if (company.outstandingBalance + remaining > company.creditLimit) throw new Error('CREDIT_LIMIT_EXCEEDED');
            paidOnCredit = remaining;
          }
        }

        if (paidFromWallet > 0) {
          await tx.company.update({
            where: { id: existing.companyId },
            data: { walletBalance: { decrement: paidFromWallet } },
          });
          await tx.walletTransaction.create({
            data: {
              companyId: existing.companyId,
              type: 'BOOKING_CHARGE',
              amount: -paidFromWallet,
              description: `Charter booking charge for trip ${existing.tripId}`,
              reference: existing.id,
            },
          });
        }

        if (paidOnCredit > 0) {
          await tx.company.update({
            where: { id: existing.companyId },
            data: { outstandingBalance: { increment: paidOnCredit } },
          });
        }

        const updated = await tx.charterBooking.update({
          where: { id },
          data: { status: 'confirmed', paidFromWallet, paidOnCredit },
        });

        await tx.trip.update({
          where: { id: existing.tripId },
          data: { reservedByCompanyId: existing.companyId },
        });

        await tx.charterBooking.updateMany({
          where: {
            tripId: existing.tripId,
            status: 'requested',
            id: { not: id },
          },
          data: { status: 'cancelled' },
        });

        return { booking: updated, paidFromWallet, paidOnCredit };
      });

      return NextResponse.json(result);
    }

    if (action === 'cancel') {
      if (existing.status !== 'requested') {
        return NextResponse.json(
          {
            error: 'Booking is not in requested status',
            message: 'تمت معالجة هذا الحجز بالفعل أو تغيرت حالته، سيتم تحديث القائمة',
            currentStatus: existing.status,
          },
          { status: 400 }
        );
      }

      const result = await prisma.charterBooking.update({
        where: { id },
        data: { status: 'cancelled' },
      });

      return NextResponse.json(result);
    }

    if (action === 'approve_cancel') {
      if (existing.status !== 'cancel_requested') {
        return NextResponse.json({ error: 'Booking has no pending cancellation request' }, { status: 400 });
      }

      const result = await prisma.$transaction(async (tx) => {
        const company = await tx.company.findUnique({ where: { id: existing.companyId } });
        if (!company) throw new Error('Company not found');

        const refundWallet = existing.paidFromWallet;
        const refundCredit = existing.paidOnCredit;

        if (refundWallet > 0) {
          await tx.company.update({
            where: { id: existing.companyId },
            data: { walletBalance: { increment: refundWallet } },
          });
          await tx.walletTransaction.create({
            data: {
              companyId: existing.companyId,
              type: 'REFUND',
              amount: refundWallet,
              description: `Charter booking refund for trip ${existing.tripId}`,
              reference: existing.id,
            },
          });
        }

        if (refundCredit > 0) {
          await tx.company.update({
            where: { id: existing.companyId },
            data: { outstandingBalance: { decrement: Math.min(refundCredit, company.outstandingBalance) } },
          });
        }

        const updated = await tx.charterBooking.update({
          where: { id },
          data: { status: 'cancelled' },
        });

        await tx.trip.update({
          where: { id: existing.tripId },
          data: { reservedByCompanyId: null },
        });

        return updated;
      });

      return NextResponse.json(result);
    }

    if (action === 'reject_cancel') {
      if (existing.status !== 'cancel_requested') {
        return NextResponse.json({ error: 'Booking has no pending cancellation request' }, { status: 400 });
      }

      const result = await prisma.charterBooking.update({
        where: { id },
        data: { status: 'confirmed' },
      });

      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    logger.error(err);
    if (err?.message === 'INSUFFICIENT_WALLET') {
      return NextResponse.json({ error: 'Insufficient wallet balance', message: 'رصيد المحفظة غير كافي' }, { status: 400 });
    }
    if (err?.message === 'CREDIT_LIMIT_EXCEEDED') {
      return NextResponse.json({ error: 'Credit limit exceeded', message: 'تم تجاوز حد الكريدت' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
