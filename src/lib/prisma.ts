import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma = globalForPrisma.prisma || new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

/**
 * Which SQL dialect this process is talking to.
 *
 * Dev runs SQLite (prisma/schema.prisma) and production runs MariaDB
 * (prisma/schema.mysql.prisma) against the same code. The handful of places
 * that need raw SQL — currently just the booking-reference counter — have no
 * single statement that works on both, so they branch on this rather than
 * hard-coding MySQL and breaking the local database.
 */
export type DbDialect = 'mysql' | 'sqlite'

export function dbDialect(): DbDialect {
  return (process.env.DATABASE_URL || '').startsWith('mysql') ? 'mysql' : 'sqlite'
}
