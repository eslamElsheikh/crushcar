import type { Prisma } from '@prisma/client'
import { dbDialect } from './prisma'
import { lockRow } from './row-lock'

/**
 * The platform's own cash.
 *
 * Separate from every Company wallet on purpose. The two ledgers have
 * different owners and no endpoint moves money between them: a company's
 * wallet is that company's, and this is the operator's float. Charging a
 * company booking and funding a platform booking are two different code paths
 * with two different tables, so a bug in one cannot spend the other's money.
 *
 * Amounts are integer piastres. Company.walletBalance is a Float and it has
 * drifted from its ledger before; this ledger has to reconcile exactly, so
 * SUM(amountPiastres) == balancePiastres is an equality with no tolerance
 * band, which a float cannot promise.
 */

export const PLATFORM_WALLET_ID = 'main'

export class InsufficientPlatformBalanceError extends Error {
  readonly code = 'INSUFFICIENT_PLATFORM_BALANCE'
  constructor(readonly available: number, readonly required: number) {
    super('Insufficient platform wallet balance')
    this.name = 'InsufficientPlatformBalanceError'
  }
}

export class PlatformIdempotencyError extends Error {
  readonly code = 'DUPLICATE_PLATFORM_TRANSACTION'
  constructor(readonly idempotencyKey: string) {
    super('A transaction with this idempotency key already exists')
    this.name = 'PlatformIdempotencyError'
  }
}

/** Money as a decimal amount becomes money as piastres. */
export function toPiastres(amount: number): number {
  if (!Number.isFinite(amount)) return 0
  return Math.round(amount * 100)
}

/** And back again, for display. */
export function fromPiastres(piastres: number): number {
  return piastres / 100
}

/**
 * Makes sure the wallet row exists.
 *
 * The lock below only works on a row that is already there, and the row is
 * created by the migration's default rather than by the migration itself, so
 * this is called before the lock. The insert is written as an upsert in the
 * dialect's own syntax because Prisma's upsert is emulated on MySQL — a
 * read followed by a write — and two first calls would race on the insert.
 */
export async function ensurePlatformWallet(tx: Prisma.TransactionClient): Promise<void> {
  if (dbDialect() === 'mysql') {
    await tx.$executeRawUnsafe(
      `INSERT INTO \`PlatformWallet\` (\`id\`, \`balancePiastres\`, \`createdAt\`, \`updatedAt\`)
       VALUES (?, 0, NOW(3), NOW(3))
       ON DUPLICATE KEY UPDATE \`id\` = \`id\``,
      PLATFORM_WALLET_ID,
    )
  } else {
    await tx.$executeRawUnsafe(
      `INSERT INTO "PlatformWallet" ("id", "balancePiastres", "createdAt", "updatedAt")
       VALUES (?, 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
       ON CONFLICT("id") DO UPDATE SET "id" = "id"`,
      PLATFORM_WALLET_ID,
    )
  }
}

export interface PlatformMovement {
  amountPiastres: number
  balanceAfterPiastres: number
}

async function currentBalance(tx: Prisma.TransactionClient): Promise<number> {
  const row = await tx.platformWallet.findUnique({ where: { id: PLATFORM_WALLET_ID } })
  return row?.balancePiastres ?? 0
}

async function writeLedger(
  tx: Prisma.TransactionClient,
  args: {
    type: 'FUNDING' | 'BOOKING_CHARGE' | 'REFUND' | 'ADJUSTMENT'
    amountPiastres: number
    balanceAfterPiastres: number
    description?: string
    reference?: string
    idempotencyKey?: string | null
    actorId?: string | null
    actorEmail?: string
    method?: string
    attachmentUrl?: string | null
  },
): Promise<void> {
  try {
    await tx.platformTransaction.create({
      data: {
        type: args.type,
        amountPiastres: args.amountPiastres,
        balanceAfterPiastres: args.balanceAfterPiastres,
        description: args.description ?? '',
        reference: args.reference ?? '',
        idempotencyKey: args.idempotencyKey ?? null,
        actorId: args.actorId ?? null,
        actorEmail: args.actorEmail ?? '',
        method: args.method ?? '',
        attachmentUrl: args.attachmentUrl ?? null,
      },
    })
  } catch (err: any) {
    // The unique idempotency key is what makes a replayed request harmless.
    if (err?.code === 'P2002') {
      throw new PlatformIdempotencyError(args.idempotencyKey ?? '')
    }
    throw err
  }
}

export interface PlatformChargeArgs {
  /** The amount to take, in piastres. */
  amountPiastres: number
  /** What the money is for. Usually the booking reference. */
  reference?: string
  description?: string
  /**
   * A key that makes a replay harmless. A booking charge uses one derived from
   * the booking, so the same booking can never be charged twice even if the
   * request comes back through a different path.
   */
  idempotencyKey?: string
  actorId?: string
  actorEmail?: string
}

/**
 * Takes money out of the platform wallet for a booking.
 *
 * The lock on the wallet row means two bookings cannot both read the same
 * balance and both decide they can afford it. The decrement is also written as
 * a conditional update, so the condition is part of the operation rather than
 * a check that happened to pass a moment earlier.
 */
export async function chargePlatform(
  tx: Prisma.TransactionClient,
  args: PlatformChargeArgs,
): Promise<PlatformMovement> {
  if (args.amountPiastres <= 0) {
    return { amountPiastres: 0, balanceAfterPiastres: await currentBalance(tx) }
  }

  await ensurePlatformWallet(tx)
  await lockRow(tx, 'PlatformWallet', PLATFORM_WALLET_ID)

  const before = await currentBalance(tx)
  if (before < args.amountPiastres) {
    throw new InsufficientPlatformBalanceError(fromPiastres(before), fromPiastres(args.amountPiastres))
  }

  const res = await tx.platformWallet.updateMany({
    where: { id: PLATFORM_WALLET_ID, balancePiastres: { gte: args.amountPiastres } },
    data: { balancePiastres: { decrement: args.amountPiastres } },
  })
  if (res.count === 0) {
    const now = await currentBalance(tx)
    throw new InsufficientPlatformBalanceError(fromPiastres(now), fromPiastres(args.amountPiastres))
  }

  const after = before - args.amountPiastres
  await writeLedger(tx, {
    type: 'BOOKING_CHARGE',
    amountPiastres: -args.amountPiastres,
    balanceAfterPiastres: after,
    description: args.description ?? '',
    reference: args.reference ?? '',
    idempotencyKey: args.idempotencyKey ?? null,
    actorId: args.actorId ?? null,
    actorEmail: args.actorEmail ?? '',
  })
  return { amountPiastres: args.amountPiastres, balanceAfterPiastres: after }
}

/**
 * Puts money back into the platform wallet.
 *
 * Used when a platform-funded booking is cancelled. The whole amount comes
 * back: there is no counterpart and no cancellation policy to apply, because
 * the money never left the platform's ownership.
 */
export async function refundPlatform(
  tx: Prisma.TransactionClient,
  args: PlatformChargeArgs,
): Promise<PlatformMovement> {
  if (args.amountPiastres <= 0) {
    return { amountPiastres: 0, balanceAfterPiastres: await currentBalance(tx) }
  }

  await ensurePlatformWallet(tx)
  await lockRow(tx, 'PlatformWallet', PLATFORM_WALLET_ID)

  const before = await currentBalance(tx)
  await tx.platformWallet.update({
    where: { id: PLATFORM_WALLET_ID },
    data: { balancePiastres: { increment: args.amountPiastres } },
  })
  const after = before + args.amountPiastres

  await writeLedger(tx, {
    type: 'REFUND',
    amountPiastres: args.amountPiastres,
    balanceAfterPiastres: after,
    description: args.description ?? '',
    reference: args.reference ?? '',
    idempotencyKey: args.idempotencyKey ?? null,
    actorId: args.actorId ?? null,
    actorEmail: args.actorEmail ?? '',
  })
  return { amountPiastres: args.amountPiastres, balanceAfterPiastres: after }
}

export interface PlatformFundingArgs {
  /** The amount to add, in piastres. */
  amountPiastres: number
  method?: string
  reference?: string
  description?: string
  attachmentUrl?: string | null
  actorId?: string
  actorEmail?: string
}

/**
 * Funds the platform wallet from outside.
 *
 * The operator is the owner of this cash, so there is no request-and-approve
 * dance here: a company hands money over and the admin approves it, which is a
 * real two-party flow, whereas here the owner is topping up their own float.
 * The ledger row and the audit log are the record.
 */
export async function fundPlatform(
  tx: Prisma.TransactionClient,
  args: PlatformFundingArgs,
): Promise<PlatformMovement> {
  if (args.amountPiastres <= 0) {
    return { amountPiastres: 0, balanceAfterPiastres: await currentBalance(tx) }
  }

  await ensurePlatformWallet(tx)
  await lockRow(tx, 'PlatformWallet', PLATFORM_WALLET_ID)

  const before = await currentBalance(tx)
  await tx.platformWallet.update({
    where: { id: PLATFORM_WALLET_ID },
    data: { balancePiastres: { increment: args.amountPiastres } },
  })
  const after = before + args.amountPiastres

  await writeLedger(tx, {
    type: 'FUNDING',
    amountPiastres: args.amountPiastres,
    balanceAfterPiastres: after,
    description: args.description ?? '',
    reference: args.reference ?? '',
    idempotencyKey: null,
    actorId: args.actorId ?? null,
    actorEmail: args.actorEmail ?? '',
    method: args.method ?? '',
    attachmentUrl: args.attachmentUrl ?? null,
  })
  return { amountPiastres: args.amountPiastres, balanceAfterPiastres: after }
}

/**
 * Corrects the balance by hand.
 *
 * For the things a ledger cannot describe: a bank fee, a correction of a
 * mis-typed figure, money that arrived outside the system. It is an
 * adjustment to the cash, not a movement, and it is signed either way.
 */
export async function adjustPlatform(
  tx: Prisma.TransactionClient,
  args: PlatformFundingArgs,
): Promise<PlatformMovement> {
  if (args.amountPiastres === 0) {
    return { amountPiastres: 0, balanceAfterPiastres: await currentBalance(tx) }
  }

  await ensurePlatformWallet(tx)
  await lockRow(tx, 'PlatformWallet', PLATFORM_WALLET_ID)

  const before = await currentBalance(tx)
  const after = before + args.amountPiastres
  if (after < 0) {
    throw new InsufficientPlatformBalanceError(fromPiastres(before), fromPiastres(Math.abs(args.amountPiastres)))
  }
  await tx.platformWallet.update({
    where: { id: PLATFORM_WALLET_ID },
    data: { balancePiastres: { increment: args.amountPiastres } },
  })

  await writeLedger(tx, {
    type: 'ADJUSTMENT',
    amountPiastres: args.amountPiastres,
    balanceAfterPiastres: after,
    description: args.description ?? '',
    reference: args.reference ?? '',
    idempotencyKey: null,
    actorId: args.actorId ?? null,
    actorEmail: args.actorEmail ?? '',
    method: args.method ?? 'ADJUSTMENT',
    attachmentUrl: args.attachmentUrl ?? null,
  })
  return { amountPiastres: args.amountPiastres, balanceAfterPiastres: after }
}

/** The key that makes one booking's charge and its refund each happen once. */
export function chargeKey(bookingId: string): string {
  return `charge:${bookingId}`
}

export function refundKey(bookingId: string): string {
  return `refund:${bookingId}`
}
