import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

const ACTIONS = [
  'CREATE', 'UPDATE', 'DELETE', 'CANCEL', 'APPROVE', 'REJECT',
  'PAY', 'REFUND', 'LOGIN', 'BLOCK', 'UNBLOCK', 'BOARD',
] as const

const ENTITIES = [
  'Booking', 'CompanyBooking', 'Company', 'User', 'Bus', 'Trip',
  'Station', 'Wallet', 'CreditLimit', 'Setting', 'Faq',
  'DepositRequest', 'TripRequest', 'Invoice', 'CompanyCustomer',
  'BusLayout', 'SeatBlock', 'CharterBooking',
] as const

type AuditAction = (typeof ACTIONS)[number]
type AuditEntity = (typeof ENTITIES)[number]

export async function audit(params: {
  action: AuditAction
  entity: AuditEntity
  entityId?: string
  session?: { user?: { id?: string; email?: string; role?: string; companyId?: string } } | null
  companyId?: string
  metadata?: Record<string, unknown>
  ip?: string
}) {
  try {
    const userId = params.session?.user?.id
    const userEmail = params.session?.user?.email
    const companyId = params.companyId || params.session?.user?.companyId

    await prisma.auditLog.create({
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
  } catch (err) {
    logger.error('[Audit] Failed to write audit log:', err)
  }
}
