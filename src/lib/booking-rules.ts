/**
 * Booking rules that must agree across the public search, the customer booking
 * path and the payment hold. They live here so the three cannot drift apart: a
 * trip that the search hides must be a trip the booking route refuses, and
 * vice versa.
 */

/**
 * Minutes before departure at which a customer can no longer book.
 *
 * NOT confirmed by the owner. 30 was chosen as a default and is deliberately a
 * single named constant so it can be changed in exactly one place. Company and
 * admin bookings are unaffected: they may still book up to the departure
 * moment.
 */
export const CUSTOMER_BOOKING_CUTOFF_MINUTES = 30;

/** The payment hold must always end before the bus leaves, whatever the cutoff. */
export const MIN_PAYMENT_WINDOW_MINUTES = 10;

export const BOOKING_CLOSED_MESSAGE_AR = 'انتهى وقت الحجز لهذه الرحلة';
export const PAST_DATE_MESSAGE_AR = 'هذا التاريخ قد فات، اختر تاريخاً قادماً';
export const RETURN_BEFORE_OUTBOUND_MESSAGE_AR = 'تاريخ العودة يجب أن يكون بعد تاريخ الذهاب';

export const BUSINESS_TZ = 'Africa/Cairo';

/** Departure instants at or after this one are still bookable by a customer. */
export function customerBookingCutoff(now: Date): Date {
  return new Date(now.getTime() + CUSTOMER_BOOKING_CUTOFF_MINUTES * 60_000);
}

/**
 * The earliest departure any role may still book: a trip that has already left
 * is closed to everyone, company and admin included.
 */
export function latestBookableDeparture(now: Date): Date {
  return now;
}

/**
 * Whether a departure is still open to a customer. Company admins keep the
 * looser rule, but a departed trip is closed to everyone either way.
 */
export function isBookableByCustomer(departure: Date, now: Date): boolean {
  return departure.getTime() >= customerBookingCutoff(now).getTime();
}

export function isBookableByAnyRole(departure: Date, now: Date): boolean {
  return departure.getTime() > latestBookableDeparture(now).getTime();
}

/** UTC offset of a timezone at a given instant, in milliseconds. */
function tzOffsetMs(tz: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(at)) p[part.type] = part.value;
  const asUTC = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour) % 24, Number(p.minute), Number(p.second),
  );
  return asUTC - at.getTime();
}

/**
 * The instant of midnight at the start of a yyyy-mm-dd calendar day in
 * Africa/Cairo, expressed as a UTC Date.
 *
 * `new Date('2026-10-20')` cannot be used for this: it parses as UTC midnight,
 * which is 02:00/03:00 in Cairo, so the search window would start three hours
 * into the business day and drop early-morning departures.
 *
 * The offset is sampled at midday UTC on that day so a DST change inside the
 * day cannot skew the boundary.
 */
export function cairoDayStartUTC(dateISO: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateISO);
  if (!m) throw new Error(`Bad date: ${dateISO}`);
  const year = Number(m[1]); const month = Number(m[2]); const day = Number(m[3]);
  const noonUTC = new Date(Date.UTC(year, month - 1, day, 12));
  const offset = tzOffsetMs(BUSINESS_TZ, noonUTC);
  return new Date(Date.UTC(year, month - 1, day) - offset);
}

/** Start of the next Cairo calendar day, as a UTC Date. */
export function cairoDayEndUTC(dateISO: string): Date {
  const start = cairoDayStartUTC(dateISO);
  // Walk whole days by offsetting from the previous midnight rather than adding
  // 24h, which would drift across a DST boundary.
  const cairoDayNumber = cairoDayNumberOf(start);
  return cairoMidnightFromDayNumber(cairoDayNumber + 1);
}

/** Days since epoch counted in Cairo-local calendar days. */
function cairoDayNumberOf(instant: Date): number {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const [y, m, d] = dtf.format(instant).split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

function cairoMidnightFromDayNumber(dayNumber: number): Date {
  const utcNoon = new Date(dayNumber * 86_400_000 + 12 * 3_600_000);
  const offset = tzOffsetMs(BUSINESS_TZ, utcNoon);
  return new Date(dayNumber * 86_400_000 - offset);
}

/** Today's calendar date in Cairo, as yyyy-mm-dd. */
export function cairoTodayISO(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

export function addDaysISO(dateISO: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateISO)!;
  const base = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const next = new Date(base + days * 86_400_000);
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}