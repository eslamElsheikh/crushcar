import { prisma } from './prisma';
import { isExpirable, isExpirableCompany } from './payments';

/**
 * Cancel PENDING bookings whose payment window has passed with no transfer
 * screenshot attached, releasing their seats.
 *
 * Uses CANCELLED rather than a dedicated status on purpose: every seat-availability
 * query in the codebase allow-lists ['PENDING','PAID','BOARDED'], so a new
 * status would silently keep counting as occupied. CANCELLED already means "this
 * seat is free", and `expiredAt` distinguishes this from a customer cancelling.
 *
 * `refundAmount` stays 0 because no money ever moved; matching the existing
 * cancel path, which also writes 0 for non-PAID bookings.
 *
 * The writes are conditional — `updateMany` with the status in the where
 * clause. The previous version read a row, checked it, and then wrote it with
 * an unconditional update. A payment landing between the read and the write
 * was therefore overwritten back to CANCELLED, with no refund recorded
 * anywhere: the customer had paid and the booking showed as cancelled. The
 * conditional write means the payment and the sweep cannot both win — exactly
 * one of them takes the row, and the other is told it lost.
 *
 * Safe to call concurrently and repeatedly: the filter excludes anything
 * already cancelled or already expired, and the conditional write makes a
 * second run a no-op.
 */
export async function autoExpireUnpaidBookings(now = new Date()): Promise<number> {
  const candidates = await prisma.booking.findMany({
    where: {
      status: 'PENDING',
      expiredAt: null,
      paymentProofUrl: null,
      paymentExpiresAt: { lte: now },
    },
    select: { id: true },
    // Oldest deadline first, so a backlog is worked through in the order the
    // seats were actually promised away.
    orderBy: { paymentExpiresAt: 'asc' },
    take: 200,
  });

  let expired = 0;
  for (const { id } of candidates) {
    // Re-check per row so a proof attached between the read and this write is
    // respected rather than cancelled out from under the customer.
    const booking = await prisma.booking.findUnique({
      where: { id },
      select: {
        status: true,
        expiredAt: true,
        paymentExpiresAt: true,
        paymentProofUrl: true,
      },
    });
    if (!booking || !isExpirable(booking, now)) continue;

    const res = await prisma.booking.updateMany({
      where: { id, status: 'PENDING', expiredAt: null },
      data: {
        status: 'CANCELLED',
        expiredAt: now,
        cancelledAt: now,
        cancellationReason: 'PAYMENT_WINDOW_EXPIRED',
        refundAmount: 0,
        cancellationFee: 0,
      },
    });
    if (res.count > 0) expired++;
  }

  return expired;
}

/**
 * The same sweep for company bookings.
 *
 * A company booking holds its seat the moment it is created, and until now
 * nothing ever released it: `CompanyBooking.expiresAt` was declared and never
 * written, so an unpaid company booking kept a seat forever. It also kept
 * eating into the company's per-trip allowance, because a PENDING booking
 * counts as holding a seat.
 *
 * The deadline comes from the same admin setting the company hold-expiry card
 * already writes — `companyBookingExpiryHours` — which nothing read until now.
 */
export async function autoExpireUnpaidCompanyBookings(now = new Date()): Promise<number> {
  const candidates = await prisma.companyBooking.findMany({
    where: {
      status: 'PENDING',
      expiredAt: null,
      expiresAt: { lte: now },
    },
    select: { id: true },
    orderBy: { expiresAt: 'asc' },
    take: 200,
  });

  let expired = 0;
  for (const { id } of candidates) {
    const booking = await prisma.companyBooking.findUnique({
      where: { id },
      select: { status: true, expiredAt: true, expiresAt: true },
    });
    if (!booking || !isExpirableCompany(booking, now)) continue;

    const res = await prisma.companyBooking.updateMany({
      where: { id, status: 'PENDING', expiredAt: null },
      data: {
        status: 'CANCELLED',
        expiredAt: now,
        cancelledAt: now,
        cancelledBy: 'SYSTEM_EXPIRY',
        cancellationReason: 'PAYMENT_WINDOW_EXPIRED',
        refundAmount: 0,
        cancellationFee: 0,
      },
    });
    if (res.count > 0) expired++;
  }

  return expired;
}

/**
 * How long an unpaid company booking may hold its seat, in hours.
 *
 * The admin settings screen already writes `companyBookingExpiryHours` and
 * nothing ever read it, so the card on that screen controlled nothing. It
 * controls this now. The range the card enforces is 1 to 168.
 */
export const DEFAULT_COMPANY_BOOKING_EXPIRY_HOURS = 24;

export async function companyBookingExpiryHours(): Promise<number> {
  try {
    const row = await prisma.siteSetting.findUnique({
      where: { key: 'companyBookingExpiryHours' },
    });
    const parsed = parseInt(row?.value ?? '', 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 168) {
      return DEFAULT_COMPANY_BOOKING_EXPIRY_HOURS;
    }
    return parsed;
  } catch {
    return DEFAULT_COMPANY_BOOKING_EXPIRY_HOURS;
  }
}
