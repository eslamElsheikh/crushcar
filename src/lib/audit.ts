import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import type { Prisma } from '@prisma/client'

const _ACTIONS = [
  'CREATE', 'UPDATE', 'DELETE', 'CANCEL', 'APPROVE', 'REJECT',
  'PAY', 'REFUND', 'LOGIN', 'BLOCK', 'UNBLOCK', 'BOARD',
  'WALLET_CREDIT', 'ADJUST',
] as const

const _ENTITIES = [
  'Booking', 'CompanyBooking', 'Company', 'User', 'Bus', 'Trip',
  'Station', 'Wallet', 'CreditLimit', 'Setting', 'Faq',
  'DepositRequest', 'TripRequest', 'CompanyCustomer',
  'BusLayout', 'SeatBlock', 'CharterBooking',
] as const

type AuditAction = (typeof _ACTIONS)[number]
type AuditEntity = (typeof _ENTITIES)[number]

/**
 * Writes an audit row.
 *
 * By default the row goes through the ordinary client and a failure is
 * logged and swallowed: an audit trail that breaks the operation it is
 * describing is worse than no trail.
 *
 * When the caller passes a transaction client the row is written inside that
 * transaction, and a failure is raised rather than swallowed. A financial
 * change that is recorded in a transaction has to roll back with it, or the
 * record and the change can disagree.
 */
export async function audit(params: {
  action: AuditAction
  entity: AuditEntity
  entityId?: string
  session?: { user?: { id?: string; email?: string; role?: string; companyId?: string } } | null
  companyId?: string
  metadata?: Record<string, unknown>
  ip?: string
  /** Write inside this transaction, and fail loudly if it cannot be written. */
  client?: Prisma.TransactionClient
}) {
  const userId = params.session?.user?.id
  const userEmail = params.session?.user?.email
  const companyId = params.companyId || params.session?.user?.companyId

  const write = (db: Prisma.TransactionClient | typeof prisma) =>
    db.auditLog.create({
      data: {
        action: params.action,
        entity: params.entity,
        entityId: params.entityId || '',
        userId: userId || '',
        userEmail: userEmail || '',
        companyId: companyId || '',
        metadata: JSON.stringify(params.metadata || {}),
        ip: params.ip || '',
      },
    })

  if (params.client) {
    // Inside a transaction: the row is part of the operation, so a failure
    // has to abort it.
    await write(params.client)
    return
  }

  try {
    await write(prisma)
  } catch (err) {
    logger.error('[Audit] Failed to write audit log:', err)
  }
}
