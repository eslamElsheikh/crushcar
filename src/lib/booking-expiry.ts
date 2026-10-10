import { prisma } from './prisma';
import { isExpirable } from './payments';

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
 * Safe to call concurrently and repeatedly: the filter excludes anything
 * already cancelled or already expired.
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
    take: 200,
  });

  if (candidates.length === 0) return 0;

  // Re-check per row so a proof attached between the read and this write is
  // respected rather than cancelled out from under the customer.
  let expired = 0;
  for (const { id } of candidates) {
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

    await prisma.booking.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        expiredAt: now,
        cancelledAt: now,
        cancellationReason: 'PAYMENT_WINDOW_EXPIRED',
      },
    });
    expired++;
  }

  return expired;
}