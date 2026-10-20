import type { Prisma } from '@prisma/client'
import { lockRow } from './row-lock'

/**
 * Charges a company booking against that company's wallet and credit line.
 *
 * This is the only place the split is decided. The booking create path (when
 * auto payment is on) and the manual "confirm payment" button both call it, so
 * the two cannot drift into charging different amounts for the same booking.
 *
 * The order is the company's paymentMode:
 *   PREPAID — the wallet only. A short wallet is an error.
 *   CREDIT / BOTH — the wallet first, and whatever is left over goes on the
 *   credit line, up to the credit limit. A short credit limit is an error.
 *
 * The row lock on the company is what makes this safe to run concurrently.
 * Without it two requests would both read the same balance, both decide they
 * can afford it, and the wallet would be overdrawn.
 */

export class InsufficientWalletError extends Error {
  readonly code = 'INSUFFICIENT_WALLET'
  constructor(readonly available: number, readonly required: number) {
    super('Insufficient wallet balance')
    this.name = 'InsufficientWalletError'
  }
}

export class CreditLimitExceededError extends Error {
  readonly code = 'CREDIT_LIMIT_EXCEEDED'
  constructor(readonly available: number, readonly required: number) {
    super('Credit limit exceeded')
    this.name = 'CreditLimitExceededError'
  }
}

export class CompanyInactiveError extends Error {
  readonly code = 'COMPANY_INACTIVE'
  constructor() {
    super('Company is not active')
    this.name = 'CompanyInactiveError'
  }
}

export interface CompanyCharge {
  paidFromWallet: number
  paidOnCredit: number
}

/**
 * Shares an amount across a number of seats without losing or inventing any.
 *
 * The per-seat figures are what the booking rows record, and the refund path
 * reads them back to work out how much of a refund comes from the wallet and
 * how much from the credit line. So they have to add back up to the total
 * exactly: dividing 100 by three would give 33.33 three times over and the
 * ledger would be a piastre short of what was charged.
 */
export function splitCharge(amount: number, count: number): number[] {
  if (count <= 0) return []
  // Worked out in whole cents so the shares cannot drift: dividing 100 by
  // three would give 33.33 three times over, a piastre short of what was
  // charged, and the refund path reads these figures back to work out how
  // much comes from the wallet and how much from the credit line.
  const cents = Math.round(amount * 100)
  const perSeat = Math.floor(cents / count)
  const remainder = cents - perSeat * count
  return Array.from({ length: count }, (_, i) => {
    const seatCents = perSeat + (i >= count - remainder ? 1 : 0)
    return seatCents / 100
  })
}

export interface ChargeCompanyArgs {
  companyId: string
  total: number
  /** The booking this charge settles. Written into the ledger row. */
  reference?: string
  description?: string
}

/**
 * Charges a company wallet, and only the wallet.
 *
 * This is the path a super admin takes when booking on a company's behalf. The
 * business rule is that the company's own money pays for it: the platform
 * wallet, the credit line and a negative balance are all off the table, and a
 * wallet that cannot cover the booking refuses the whole thing.
 *
 * It is deliberately a separate function from chargeCompany rather than a flag
 * on it. chargeCompany's split depends on the company's paymentMode and may
 * fall back to the credit line, which is right for a company settling its own
 * booking and wrong here.
 */
export async function chargeCompanyWalletOnly(
  tx: Prisma.TransactionClient,
  args: {
    companyId: string
    total: number
    reference: string
    description: string
    /** Makes a retried request harmless. Unique on the ledger row. */
    idempotencyKey: string
    actorId: string
    actorEmail: string
  },
): Promise<{ paidFromWallet: number }> {
  const { companyId, total } = args
  if (!(total > 0)) return { paidFromWallet: 0 }

  await lockRow(tx, 'Company', companyId)

  const company = await tx.company.findUnique({ where: { id: companyId } })
  if (!company) throw new Error('Company not found')
  if (!company.isActive) throw new CompanyInactiveError()

  // A replay is reported as a replay. The unique index is the real guarantee;
  // this only makes the error honest when the wallet is also empty.
  const existing = await tx.walletTransaction.findUnique({
    where: { idempotencyKey: args.idempotencyKey },
    select: { id: true },
  })
  if (existing) {
    const err = new Error('Duplicate charge')
    ;(err as Error & { code?: string }).code = 'DUPLICATE_CHARGE'
    throw err
  }

  if (company.walletBalance < total) {
    throw new InsufficientWalletError(company.walletBalance, total)
  }

  // The condition is part of the operation, not a check that happened to pass
  // a moment earlier.
  const res = await tx.company.updateMany({
    where: { id: companyId, walletBalance: { gte: total } },
    data: { walletBalance: { decrement: total } },
  })
  if (res.count === 0) {
    const current = await tx.company.findUniqueOrThrow({ where: { id: companyId } })
    throw new InsufficientWalletError(current.walletBalance, total)
  }

  await tx.walletTransaction.create({
    data: {
      companyId,
      type: 'BOOKING_CHARGE',
      amount: -total,
      description: args.description,
      reference: args.reference,
      idempotencyKey: args.idempotencyKey,
    },
  })

  return { paidFromWallet: total }
}

export async function chargeCompany(
  tx: Prisma.TransactionClient,
  args: ChargeCompanyArgs,
): Promise<CompanyCharge> {
  const { companyId, total } = args
  if (!(total > 0)) {
    return { paidFromWallet: 0, paidOnCredit: 0 }
  }

  // Lock the company for the rest of the transaction so the balances we read
  // cannot change underneath us.
  await lockRow(tx, 'Company', companyId)

  const company = await tx.company.findUnique({ where: { id: companyId } })
  if (!company) throw new Error('Company not found')
  if (!company.isActive) throw new CompanyInactiveError()

  const wallet = company.walletBalance
  const creditLimit = company.creditLimit
  const outstanding = company.outstandingBalance

  let paidFromWallet = 0
  let paidOnCredit = 0

  if (company.paymentMode === 'PREPAID') {
    if (wallet < total) {
      throw new InsufficientWalletError(wallet, total)
    }
    paidFromWallet = total
  } else {
    // CREDIT or BOTH: the wallet first, the credit line for the remainder.
    paidFromWallet = Math.min(wallet, total)
    const remaining = total - paidFromWallet
    if (remaining > 0) {
      if (outstanding + remaining > creditLimit) {
        throw new CreditLimitExceededError(Math.max(0, creditLimit - outstanding), remaining)
      }
      paidOnCredit = remaining
    }
  }

  if (paidFromWallet > 0) {
    await tx.company.update({
      where: { id: companyId },
      data: { walletBalance: { decrement: paidFromWallet } },
    })
    await tx.walletTransaction.create({
      data: {
        companyId,
        type: 'BOOKING_CHARGE',
        amount: -paidFromWallet,
        description: args.description ?? (args.reference ? `Payment for booking ${args.reference}` : 'Booking charge'),
        reference: args.reference ?? '',
      },
    })
  }

  if (paidOnCredit > 0) {
    await tx.company.update({
      where: { id: companyId },
      data: { outstandingBalance: { increment: paidOnCredit } },
    })
  }

  return { paidFromWallet, paidOnCredit }
}
