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

export interface ChargeCompanyArgs {
  companyId: string
  total: number
  /** The booking this charge settles. Written into the ledger row. */
  reference?: string
  description?: string
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
