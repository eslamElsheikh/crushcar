import type { Prisma } from '@prisma/client'

/**
 * Server-side seat checks for a booking.
 *
 * The trip page will not let anybody pick a seat that is taken, and it hides
 * the seats an administrator has blocked. That is a convenience, not a rule:
 * the rule has to hold for a request that was written by hand.
 *
 * Two things were not checked at all:
 *
 *   - that the seat exists. A request for a seat label that is not in the
 *     bus layout was accepted, priced at the trip's default price, and
 *     written as a booking of a seat that does not exist.
 *
 *   - that the seat is not blocked. A blocked seat is one an administrator
 *     has taken out of service — broken, reserved, being repaired. The
 *     page hid it and the server never heard of it, so a blocked seat could
 *     still be booked.
 *
 * The checks run inside the booking transaction, after the trip row has been
 * locked, so two requests for the same seat are decided one after the other
 * rather than both finding it free.
 */

/** A seat label that is not in the bus layout. */
export class UnknownSeatError extends Error {
  readonly code = 'UNKNOWN_SEAT'
  constructor(readonly seatLabel: string) {
    super(`Seat ${seatLabel} is not in the bus layout`)
    this.name = 'UnknownSeatError'
  }
}

/** A seat an administrator has blocked. */
export class BlockedSeatError extends Error {
  readonly code = 'SEAT_BLOCKED'
  constructor(readonly seatLabel: string) {
    super(`Seat ${seatLabel} is blocked`)
    this.name = 'BlockedSeatError'
  }
}

/** A seat that is already held by somebody. */
export class SeatConflictError extends Error {
  readonly code = 'SEAT_CONFLICT'
  constructor(readonly seatLabel: string) {
    super(`Seat ${seatLabel} is already booked`)
    this.name = 'SeatConflictError'
  }
}

export interface SeatCheckArgs {
  tripId: string
  /** The seat labels the request asks for. */
  seatLabels: string[]
  /** The seats that exist on the bus layout. */
  layoutSeatLabels: string[]
  /** The leg being booked, so a seat held on another leg does not conflict. */
  fromStopOrder: number
  toStopOrder: number
}

/**
 * Checks that one seat exists on the bus layout.
 *
 * The booking path uses the full check; this is the single-seat form, for
 * the path that books one seat at a time.
 */
export function assertSeatBookable(args: { layoutSeatLabels: string[]; seatLabel: string }): void {
  if (!args.layoutSeatLabels.includes(args.seatLabel)) {
    throw new UnknownSeatError(args.seatLabel)
  }
}

/**
 * Checks that every requested seat exists, is not blocked, and is free for
 * the leg being booked.
 *
 * A seat held on a different leg of the same trip is not a conflict: the
 * bus can pick someone up at the first station and drop someone off at the
 * second, and the seat can be used by both. That is why the comparison is on
 * the stop orders and not on the seat label alone.
 */
export async function assertSeatsBookable(
  tx: Prisma.TransactionClient,
  args: SeatCheckArgs,
): Promise<void> {
  const { tripId, seatLabels, layoutSeatLabels, fromStopOrder, toStopOrder } = args

  // The layout is the list of seats that exist. A label that is not in it is
  // not a seat, and a booking of one would be a booking of nothing.
  const existing = new Set(layoutSeatLabels)
  for (const label of seatLabels) {
    if (!existing.has(label)) throw new UnknownSeatError(label)
  }

  // The seats an administrator has taken out of service.
  const blocked = await tx.seatBlock.findMany({
    where: { tripId, seatLabel: { in: seatLabels } },
    select: { seatLabel: true },
  })
  for (const b of blocked) throw new BlockedSeatError(b.seatLabel)

  // The seats somebody is already holding, on either kind of booking.
  const held = await tx.booking.findMany({
    where: {
      tripId,
      seatLabel: { in: seatLabels },
      status: { in: ['PENDING', 'PAID', 'BOARDED'] },
      fromStopOrder: { lt: toStopOrder },
      toStopOrder: { gt: fromStopOrder },
    },
    select: { seatLabel: true },
  })
  for (const h of held) throw new SeatConflictError(h.seatLabel)

  const companyHeld = await tx.companyBooking.findMany({
    where: {
      tripId,
      seatLabel: { in: seatLabels },
      status: { in: ['PENDING', 'PAID', 'BOARDED'] },
      fromStopOrder: { lt: toStopOrder },
      toStopOrder: { gt: fromStopOrder },
    },
    select: { seatLabel: true },
  })
  for (const h of companyHeld) throw new SeatConflictError(h.seatLabel)
}
