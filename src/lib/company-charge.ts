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

/** What a top-up did, so the caller can report and audit it. */
export interface CompanyTopUpResult {
  paidFromWallet: number
  paidOnCredit: number
  /** How much the credit limit was raised by. Zero when it was not raised. */
  creditLimitIncrease: number
  previousCreditLimit: number
  newCreditLimit: number
}

export interface CompanyTopUpArgs {
  companyId: string
  total: number
  /** The booking this charge settles. */
  reference: string
  description: string
  /** Makes a retried request harmless. Unique on the ledger row. */
  idempotencyKey: string
  actorId: string
  actorEmail: string
  /**
   * The booking the credit increase belongs to.
   *
   * A limit raised automatically has to be traceable to the booking that
   * caused it, so the reference is written on the credit log rather than
   * buried in a reason string.
   */
  bookingReference?: string | null
}

/**
 * Charges a company, raising its credit limit by the exact shortfall when
 * the wallet and the existing credit do not cover the amount.
 *
 * This is the path a super admin takes when booking on a company's behalf.
 * The order is:
 *
 *   1. the company's available wallet balance;
 *   2. the company's currently available credit, if its payment mode allows
 *      credit at all;
 *   3. if that is still not enough, the credit limit is raised by exactly
 *      the shortfall, and the rest is taken on credit.
 *
 * The increase is the shortfall and nothing else — no buffer, no percentage.
 * A booking of a thousand with two hundred in the wallet and three hundred of
 * credit available raises the limit by exactly five hundred, and the booking
 * is paid two hundred from the wallet and eight hundred on credit.
 *
 * A PREPAID company is wallet-only. It is refused when the wallet is short,
 * and its credit limit is not touched: a company that has chosen not to have
 * a credit line must not quietly acquire one.
 *
 * Everything happens inside the caller's transaction: the limit increase, the
 * credit log row, the wallet debit and its ledger row, the outstanding
 * balance and the booking rows either all stand or all disappear. A rejected
 * booking cannot leave an increase behind, because the caller runs the quota
 * and seat checks before it gets here.
 *
 * It is a separate function from chargeCompany rather than a flag on it:
 * chargeCompany's split depends on the company's paymentMode and refuses
 * when the credit is short, which is right for a company settling its own
 * booking and wrong for this.
 */
export async function chargeCompanyWithCreditTopUp(
  tx: Prisma.TransactionClient,
  args: CompanyTopUpArgs,
): Promise<CompanyTopUpResult> {
  const { companyId, total } = args
  if (!(total > 0)) {
    return {
      paidFromWallet: 0,
      paidOnCredit: 0,
      creditLimitIncrease: 0,
      previousCreditLimit: 0,
      newCreditLimit: 0,
    }
  }

  // The company row is locked for the rest of the transaction, so the
  // balances and the limit read below cannot change underneath us, and two
  // bookings for the same company cannot both decide the same wallet can
  // cover them.
  await lockRow(tx, 'Company', companyId)

  // Read fresh, after the lock. The copy the caller had may have been read
  // before the lock, and a shortfall worked out from a stale balance is a
  // shortfall worked out wrongly.
  const company = await tx.company.findUnique({ where: { id: companyId } })
  if (!company) throw new Error('Company not found')
  if (!company.isActive) throw new CompanyInactiveError()

  // A replay is reported as a replay, and it is refused BEFORE the limit is
  // touched, so a retried request cannot grant a second increase.
  const existing = await tx.walletTransaction.findUnique({
    where: { idempotencyKey: args.idempotencyKey },
    select: { id: true },
  })
  if (existing) {
    const err = new Error('Duplicate charge')
    ;(err as Error & { code?: string }).code = 'DUPLICATE_CHARGE'
    throw err
  }

  const wallet = company.walletBalance
  const creditLimit = company.creditLimit
  const outstanding = company.outstandingBalance
  const creditAllowed = company.paymentMode !== 'PREPAID'

  const paidFromWallet = Math.min(Math.max(0, wallet), total)
  const remaining = total - paidFromWallet
  let paidOnCredit = 0
  let creditLimitIncrease = 0
  let newCreditLimit = creditLimit

  if (remaining > 0) {
    if (!creditAllowed) {
      // A prepaid company has no credit line. It is refused, and its limit is
      // left exactly as it was.
      throw new InsufficientWalletError(wallet, total)
    }
    const availableCredit = Math.max(0, creditLimit - outstanding)
    paidOnCredit = Math.min(availableCredit, remaining)
    const shortfall = remaining - paidOnCredit

    if (shortfall > 0) {
      // Exactly the shortfall. The limit moves so that the rest of the
      // booking fits on credit, and by no more than that.
      newCreditLimit = creditLimit + shortfall
      creditLimitIncrease = shortfall
      paidOnCredit += shortfall

      await tx.company.update({
        where: { id: companyId },
        data: { creditLimit: newCreditLimit },
      })

      // The audit trail: the company, the limit before and after, the exact
      // change, the reason, the acting administrator, the moment, and the
      // booking the increase belongs to.
      await tx.creditLog.create({
        data: {
          companyId,
          previousLimit: creditLimit,
          newLimit: newCreditLimit,
          changeAmount: creditLimitIncrease,
          reason: 'Automatic credit increase for a Super Admin company booking',
          bookingReference: args.bookingReference ?? args.reference ?? null,
          createdById: args.actorId,
          createdByEmail: args.actorEmail,
        },
      })
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
        description: args.description,
        reference: args.reference,
        idempotencyKey: args.idempotencyKey,
      },
    })
  }

  if (paidOnCredit > 0) {
    await tx.company.update({
      where: { id: companyId },
      data: { outstandingBalance: { increment: paidOnCredit } },
    })
  }

  return {
    paidFromWallet,
    paidOnCredit,
    creditLimitIncrease,
    previousCreditLimit: creditLimit,
    newCreditLimit,
  }
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
