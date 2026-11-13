import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { applyRateLimitHeaders, checkRateLimit } from '@/lib/rateLimitHttp'
import { requireTurnstile } from '@/lib/turnstile'

/**
 * Company self-registration.
 *
 * This is the one unauthenticated endpoint that writes a company row and an
 * administrator account, so it is the one worth throttling and validating
 * properly. Before this it had neither: no rate limit (a script could mint
 * companies and admin accounts as fast as it could connect), an email check
 * of `includes('@')` (which accepts `@`, `a@b` and a megabyte of address),
 * no length caps on any field, and duplicate detection that only looked at
 * the exact string — so `Admin@Example.com` and `admin@example.com` were
 * two accounts.
 *
 * The account it creates is inert until a super admin approves the company
 * (`isActive: false`), which is the existing business rule and is not
 * changed here.
 */
const BUCKET = 'register-company'
/** Per IP, per window. Enough for a person who mistypes; not enough for a farm. */
const MAX_ATTEMPTS = 10
const WINDOW_MS = 15 * 60_000

const EMAIL_MAX = 254
const NAME_MAX = 120
const PASSWORD_MAX = 200

/** Anything that is not plainly a mailbox address. Deliberately conservative. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Digits, optionally leading +, after separators are stripped. */
const PHONE_RE = /^\+?\d{7,15}$/

function looksControlFree(value: string): boolean {
  return /[\u0000-\u001f\u007f]/.test(value) === false
}

export async function POST(req: NextRequest) {
  // Charged before the body is read, so a flood costs the attacker the same
  // whether or not it sends a parseable payload.
  const rl = checkRateLimit(req, BUCKET, MAX_ATTEMPTS, WINDOW_MS)
  if (rl.blocked) return rl.blocked
  // Same policy as individual registration: a no-op until TURNSTILE_* is
  // configured, compulsory in production once they are.
  const captcha = await requireTurnstile(req)
  if (captcha) return applyRateLimitHeaders(captcha, rl.headers)

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const { companyName, adminName, email, phone, password, notes: _notes } = body as Record<string, unknown>

    if (
      typeof companyName !== 'string' ||
      typeof adminName !== 'string' ||
      typeof email !== 'string' ||
      typeof password !== 'string'
    ) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const name = companyName.trim()
    const admin = adminName.trim()
    // Stored lowercase from now on: the unique index then means what it says
    // on every database, and the pre-check below can be case-insensitive
    // without disagreeing with what gets written.
    const mailbox = email.trim().toLowerCase()
    const secret = password

    if (name.length < 2 || name.length > NAME_MAX || !looksControlFree(name)) {
      return NextResponse.json({ error: 'Company name must be 2-120 characters' }, { status: 400 })
    }
    if (admin.length < 2 || admin.length > NAME_MAX || !looksControlFree(admin)) {
      return NextResponse.json({ error: 'Admin name must be 2-120 characters' }, { status: 400 })
    }
    if (mailbox.length > EMAIL_MAX || !EMAIL_RE.test(mailbox)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
    }
    if (secret.length < 6 || secret.length > PASSWORD_MAX) {
      return NextResponse.json({ error: 'Invalid email or password (min 6 chars)' }, { status: 400 })
    }
    if (phone !== undefined && phone !== null && phone !== '') {
      if (typeof phone !== 'string' || phone.length > 30) {
        return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 })
      }
      const digits = phone.replace(/[\s\-().]/g, '')
      if (!PHONE_RE.test(digits)) {
        return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 })
      }
    }

    // Duplicate registration: matched case-insensitively, so Admin@x.com
    // cannot sit beside admin@x.com, and the unique index below is the
    // backstop if two requests pass this check at once. Prisma's
    // `mode: 'insensitive'` is not available on this datasource, so the
    // comparison is done with SQL that both SQLite and MySQL understand.
    const dupes = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM User WHERE LOWER(email) = ${mailbox} LIMIT 1`
    if (dupes.length > 0) {
      return NextResponse.json({ error: 'Email already exists' }, { status: 400 })
    }

    const subdomain = name.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 30) + '-' + Date.now().toString(36)

    return await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name,
          subdomain,
          isActive: false,
          creditLimit: 0,
          walletBalance: 0,
          paymentMode: 'PREPAID',
          outstandingBalance: 0,
          billingCycle: 'MONTHLY',
        },
      })

      const hashed = await bcrypt.hash(secret, 12)
      const _user = await tx.user.create({
        data: {
          email: mailbox,
          password: hashed,
          name: admin,
          phone: typeof phone === 'string' ? phone.trim() : '',
          role: 'COMPANY_ADMIN',
          companyId: company.id,
        },
      })

      return NextResponse.json({
        success: true,
        companyId: company.id,
        message: 'Registration successful. Your account will be reviewed and activated by our team.',
      })
    })
  } catch (err: any) {
    console.error(err)
    if (err.code === 'P2002') {
      return NextResponse.json({ error: 'Email or subdomain already exists' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
