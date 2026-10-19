import { MIN_PAYMENT_WINDOW_MINUTES } from '@/lib/booking-rules'
/**
 * Payment-window rules for customer bookings.
 *
 * A booking reserves its seat the moment it is created, so an unpaid booking
 * that is never completed would hold the seat forever. Each booking therefore
 * carries a `paymentExpiresAt` deadline; once it passes and no transfer
 * screenshot has been attached, the booking is cancelled by a sweep and the
 * seat is released.
 *
 * Attaching a screenshot stops the countdown: the customer has demonstrably
 * paid, so the booking waits for an admin instead of expiring.
 */

/** Default window, in minutes, from booking creation to payment expiry. */
export const PAYMENT_WINDOW_MINUTES = 60;

/** Shorter window used when the trip departs soon, so a customer who starts
 *  paying at the last minute is not cut off mid-transfer. */
export const PAYMENT_WINDOW_NEAR_MINUTES = 20;

/** How close to departure counts as "near" (minutes). */
export const NEAR_DEPARTURE_MINUTES = 120;

/** Statuses that still occupy a seat. Mirrors the allow-lists used by the
 * seat-conflict queries in the booking and hold routes. */
export const SEAT_OCCUPYING_STATUSES = ['PENDING', 'PAID', 'BOARDED'] as const;

/**
 * Deadline for a company booking to be paid.
 *
 * Same shape as the customer window: the hold ends before the bus leaves,
 * and never later than the configured number of hours. A company on credit
 * gets a long window because the money is a matter of account, not of a
 * transfer in progress.
 */
export function companyPaymentDeadline(
  departure: Date,
  hours: number,
  now = new Date(),
): Date {
  const window = new Date(now.getTime() + hours * 60 * 60 * 1000);
  const latestUseful = new Date(departure.getTime() - MIN_PAYMENT_WINDOW_MINUTES * 60 * 1000);
  return window.getTime() >= latestUseful.getTime() ? latestUseful : window;
}

/**
 * True when a company booking may no longer be auto-cancelled: it was paid,
 * it already expired, or somebody cancelled it.
 */
export function isExpirableCompany(booking: {
  status: string;
  expiredAt?: Date | null;
  expiresAt?: Date | null;
}, now = new Date()): boolean {
  if (booking.status !== 'PENDING') return false;
  if (booking.expiredAt) return false;
  if (!booking.expiresAt) return false;
  return booking.expiresAt.getTime() <= now.getTime();
}

export function minutesUntil(date: Date, now = new Date()): number {
  return (date.getTime() - now.getTime()) / 60000;
}

/**
 * Window for a trip: the short one when departure is close enough that the
 * long window would run past the bus leaving.
 */
export function paymentWindowMinutes(departure: Date, now = new Date()): number {
  return minutesUntil(departure, now) < NEAR_DEPARTURE_MINUTES
    ? PAYMENT_WINDOW_NEAR_MINUTES
    : PAYMENT_WINDOW_MINUTES;
}

/** Deadline to store on a newly created booking. */
export function paymentDeadline(departure: Date, now = new Date()): Date {
  const window = new Date(now.getTime() + paymentWindowMinutes(departure, now) * 60000);
  // A hold that outlives its bus is meaningless: the seat is released by the
  // departure anyway, and the booking would sit there looking payable. The
  // deadline is capped so it always lands before departure, with a little room
  // left for the booking to actually be completed.
  const latestUseful = new Date(departure.getTime() - MIN_PAYMENT_WINDOW_MINUTES * 60000);
  return window.getTime() >= latestUseful.getTime() ? latestUseful : window;
}

/**
 * True when a booking may no longer be auto-cancelled: it was paid, it already
 * expired, it was cancelled by a person, or the customer attached proof (which
 * stops the clock and hands the decision to an admin).
 */
export function isExpirable(booking: {
  status: string;
  expiredAt?: Date | null;
  paymentExpiresAt?: Date | null;
  paymentProofUrl?: string | null;
}, now = new Date()): boolean {
  if (booking.status !== 'PENDING') return false;
  if (booking.expiredAt) return false;
  if (!booking.paymentExpiresAt) return false;
  if (booking.paymentExpiresAt.getTime() > now.getTime()) return false;
  // Proof means the money moved; an admin must review it.
  return !booking.paymentProofUrl;
}