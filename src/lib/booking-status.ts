/**
 * One place that decides what a booking status looks like.
 *
 * Four copies of the same colour ternary existed, and they had drifted: the
 * company bookings list left BOARDED on the amber branch while the admin list
 * put it on blue, so the same booking wore a different colour depending on
 * which portal you were standing in. The print tickets went further and
 * branched on `status === 'PAID'`, which painted PENDING and BOARDED as a red
 * "cancelled" chip directly above the correct status text.
 */

export type BookingTone = 'green' | 'amber' | 'red' | 'blue' | 'slate';

export const BOOKING_STATUSES = ['PENDING', 'PAID', 'CANCELLED', 'BOARDED'] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

const TONES: Record<string, BookingTone> = {
  PENDING: 'amber',
  PAID: 'green',
  BOARDED: 'blue',
  CANCELLED: 'red',
};

export function bookingStatusTone(status: string): BookingTone {
  return TONES[String(status || '').toUpperCase()] ?? 'slate';
}

/**
 * The label comes from the dictionary via t(), never from a literal. t()
 * resolves a bare 'PENDING' straight out of lang.ts, and falls back through
 * the booking./status. prefixes, so an unknown status degrades to the raw code
 * instead of blank.
 */
export function bookingStatusLabel(
  t: (key: string) => string,
  status: string,
): string {
  const key = String(status || '').toUpperCase();
  return t(key) || key;
}

/**
 * Colour for the dark, translucent pill the two print tickets use. Kept
 * separate from bookingStatusTone because the ticket header sits on a blue
 * gradient and needs light-on-dark variants of the same four decisions.
 */
export const TICKET_STATUS_PILL: Record<string, string> = {
  PENDING: 'bg-amber-400/20 text-amber-200 border-amber-400/30',
  PAID: 'bg-emerald-400/20 text-emerald-200 border-emerald-400/30',
  BOARDED: 'bg-blue-400/20 text-blue-200 border-blue-400/30',
  CANCELLED: 'bg-red-400/20 text-red-200 border-red-400/30',
};

export function ticketStatusPill(status: string): string {
  return TICKET_STATUS_PILL[String(status || '').toUpperCase()] ?? TICKET_STATUS_PILL.CANCELLED;
}