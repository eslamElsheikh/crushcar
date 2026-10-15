/**
 * Booking reference numbers: ST-<from>-<to>-<seat>-<yy>-<serial>
 *   ST    fixed prefix
 *   from  three-letter code of the station the passenger actually boards at
 *   to    three-letter code of the station they actually get off at
 *   seat  the seat label
 *   yy    two-digit year
 *   serial  six-digit sequence, unique across every booking in every table
 *
 * The serial is the only part that guarantees uniqueness, and it comes from
 * ReferenceCounter (see the model in prisma/schema.prisma). The station codes
 * are cosmetic: toCode() maps a station onto three letters, and two different
 * stations can land on the same three letters. That is fine — two tickets for
 * different routes never collide, because the serial differs.
 *
 * This file is server-only. It takes a Prisma transaction client and runs raw
 * SQL, so it must never be imported from a client component.
 */
import type { Prisma } from '@prisma/client'
import { dbDialect } from '@/lib/prisma'

export const REF_PREFIX = 'ST'
const SERIAL_WIDTH = 6

/** Serials per counter row. */
export type CounterKey = string

/** Falls back to a deterministic 3 letters for a station nobody mapped. */
const arabicToEnglish: Record<string, string> = {
  'القاهرة': 'CAI', 'الجيزة': 'GIZ', 'الإسكندرية': 'ALX', 'أسوان': 'ASW',
  'الدقهلية': 'DKT', 'الشرقية': 'SHQ', 'المنوفية': 'MNF', 'الغربية': 'GFR',
  'كفر الشيخ': 'KFS', 'الفيوم': 'FYM', 'بني سويف': 'BSW', 'المنيا': 'MNY',
  'أسيوط': 'AST', 'سوهاج': 'SOH', 'قنا': 'QNA', 'الأقصر': 'LXR',
  'الإسماعيلية': 'ISM', 'السويس': 'SUZ', 'بورسعيد': 'PSD',
  'دمياط': 'DMY', 'الزقازيق': 'ZKZ', 'طنطا': 'TNT', 'شبين الكوم': 'SKM',
  'رأس البر': 'RBR', 'العريش': 'ARS', 'مرسي مطروح': 'MRT',
}

function toCode(name: string): string {
  const clean = (name || '').trim()
  if (!clean) return 'XXX'
  if (arabicToEnglish[clean]) return arabicToEnglish[clean]
  const code = clean.substring(0, 3).toUpperCase()
  if (/[A-Z0-9]/.test(code)) return code
  // Arabic station name with no mapping: hash the characters into three
  // letters so the reference stays ASCII and scannable by the QR reader.
  const hash = clean.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return (
    String.fromCharCode(65 + (hash % 26)) +
    String.fromCharCode(65 + ((hash * 7) % 26)) +
    String.fromCharCode(65 + ((hash * 13) % 26))
  )
}

function toSeatCode(seatLabel?: string): string {
  const seat = (seatLabel || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  return seat || 'S1'
}

export interface ReferenceParts {
  fromStation: string
  toStation: string
  seatLabel?: string
  serial: number
  at?: Date
}

export function formatReference({ fromStation, toStation, seatLabel, serial, at = new Date() }: ReferenceParts): string {
  const yy = String(at.getFullYear()).slice(-2)
  return [
    REF_PREFIX,
    toCode(fromStation),
    toCode(toStation),
    toSeatCode(seatLabel),
    yy,
    String(serial).padStart(SERIAL_WIDTH, '0'),
  ].join('-')
}

function counterKey(at: Date): CounterKey {
  return String(at.getFullYear())
}

/**
 * Bumps the year counter and returns the serial it now holds.
 *
 * Must run inside the transaction that creates the booking, so the number and
 * the row it belongs to commit or roll back together.
 *
 * MySQL/MariaDB: LAST_INSERT_ID(expr) publishes the new value into the
 * connection's last-insert-id register, which the following SELECT reads back.
 * One statement does the insert-or-bump and hands the value over — no read
 * before write, so two concurrent first bookings of the year cannot both see 0.
 *
 * SQLite: there is no LAST_INSERT_ID. Writers are serialised at the database
 * level and we are already inside a transaction, so an upsert followed by a
 * read is safe here.
 */
export async function nextBookingSerial(
  tx: Prisma.TransactionClient,
  at: Date = new Date(),
): Promise<number> {
  const key = counterKey(at)
  const now = at

  if (dbDialect() === 'mysql') {
    await tx.$executeRawUnsafe(
      `INSERT INTO \`ReferenceCounter\` (\`id\`, \`value\`, \`updatedAt\`)
       VALUES (?, LAST_INSERT_ID(1), ?)
       ON DUPLICATE KEY UPDATE \`value\` = LAST_INSERT_ID(\`value\` + 1), \`updatedAt\` = ?`,
      key,
      now,
      now,
    )
    const rows = await tx.$queryRawUnsafe<Array<{ serial: bigint | number }>>(
      'SELECT LAST_INSERT_ID() AS serial',
    )
    const serial = Number(rows[0]?.serial ?? 0)
    if (!Number.isFinite(serial) || serial <= 0) {
      throw new Error('ReferenceCounter did not return a serial')
    }
    return serial
  }

  await tx.$executeRawUnsafe(
    `INSERT INTO "ReferenceCounter" ("id", "value", "updatedAt")
     VALUES (?, 1, ?)
     ON CONFLICT("id") DO UPDATE SET "value" = "value" + 1, "updatedAt" = ?`,
    key,
    now,
    now,
  )
  const rows = await tx.$queryRawUnsafe<Array<{ value: bigint | number }>>(
    'SELECT "value" FROM "ReferenceCounter" WHERE "id" = ?',
    key,
  )
  const serial = Number(rows[0]?.value ?? 0)
  if (!Number.isFinite(serial) || serial <= 0) {
    throw new Error('ReferenceCounter did not return a serial')
  }
  return serial
}

/** Draws the next reference. Runs in, and rolls back with, the caller's transaction. */
export async function nextBookingRef(
  tx: Prisma.TransactionClient,
  parts: Omit<ReferenceParts, 'serial'>,
): Promise<string> {
  const at = parts.at ?? new Date()
  const serial = await nextBookingSerial(tx, at)
  return formatReference({ ...parts, at, serial })
}

/**
 * True for the two failure modes worth retrying the whole transaction on.
 *
 * P2002 on the reference column: the serial was handed out twice. Only happens
 * against a counter row that was hand-edited or a legacy import that skipped
 * the counter; the retry takes a fresh serial.
 *
 * P2034: Prisma's write-conflict / deadlock code. Two bookings serialising on
 * the single counter row can collide here, and the loser is expected to run
 * again. See DEPLOY.md.
 */
export function isRetryableRefError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code
  if (code === 'P2034') return true
  if (code !== 'P2002') return false
  const target = (err as { meta?: { target?: unknown } }).meta?.target
  const fields = Array.isArray(target) ? target.join(',') : String(target ?? '')
  return fields.includes('reference')
}

/** Runs a booking transaction, retrying the failures above a few times. */
export async function withRefRetry<T>(run: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await run()
    } catch (err) {
      lastError = err
      if (attempt === attempts || !isRetryableRefError(err)) throw err
      console.warn(`[booking-reference] retrying transaction (attempt ${attempt + 1}/${attempts}) after ${(err as { code?: string }).code}`)
    }
  }
  throw lastError
}