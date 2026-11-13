import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { sendVerificationEmail } from '@/lib/email';
import { audit } from '@/lib/audit';
import { requireTurnstile } from '@/lib/turnstile';
import { applyRateLimitHeaders, checkRateLimit } from '@/lib/rateLimitHttp';

/** Per IP, per window: enough for a person, nowhere near a farm. */
const BUCKET = 'register-customer';
const MAX_ATTEMPTS = 20;
const WINDOW_MS = 15 * 60_000;

const EMAIL_MAX = 254;
const NAME_MAX = 120;
const PASSWORD_MAX = 200;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  // Sign-up is where a bot farm gets its accounts, so it is checked before
  // anything touches the database. A no-op until TURNSTILE_* is configured.
  const rl = checkRateLimit(req, BUCKET, MAX_ATTEMPTS, WINDOW_MS);
  if (rl.blocked) return rl.blocked;
  const captcha = await requireTurnstile(req);
  if (captcha) return applyRateLimitHeaders(captcha, rl.headers);
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const { email, password, name, phone } = body as Record<string, unknown>;

    if (typeof email !== 'string' || typeof password !== 'string' || typeof name !== 'string') {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    // Trimmed and stored lowercase, so the unique index means one address
    // once and a case variant cannot register a second account beside it.
    const mailbox = email.trim().toLowerCase();
    const displayName = name.trim();

    if (mailbox.length > EMAIL_MAX || !EMAIL_RE.test(mailbox)) {
      return NextResponse.json({ error: 'Invalid email or password (min 6 chars)' }, { status: 400 });
    }
    if (displayName.length < 2 || displayName.length > NAME_MAX) {
      return NextResponse.json({ error: 'Name must be 2-120 characters' }, { status: 400 });
    }
    if (password.length < 6 || password.length > PASSWORD_MAX) {
      return NextResponse.json({ error: 'Invalid email or password (min 6 chars)' }, { status: 400 });
    }
    if (phone !== undefined && phone !== null && phone !== '' && (typeof phone !== 'string' || phone.length > 30)) {
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
    }

    // Case-insensitive: the address is stored lowercase from here on, but
    // rows written before that can hold any casing, and two accounts for
    // one mailbox must not become possible just because a letter changed
    // case. Prisma's `mode: 'insensitive'` is unavailable on this
    // datasource, so LOWER() does the comparison — SQLite and MySQL both
    // understand it — and the unique index is the race backstop.
    const dupes = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM User WHERE LOWER(email) = ${mailbox} LIMIT 1`;
    if (dupes.length > 0) {
      return NextResponse.json({ error: 'Email already exists' }, { status: 400 });
    }

    const regSetting = await prisma.siteSetting.findUnique({
      where: { key: 'individualRegistrationEnabled' },
    });
    if (regSetting?.value === 'false') {
      return NextResponse.json(
        { error: 'التسجيل مغلق للأفراد حالياً (Registration is currently closed for individuals)' },
        { status: 403 }
      );
    }

    // Self-registration always creates CUSTOMER role
    const hashed = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        email: mailbox,
        password: hashed,
        name: displayName,
        phone: typeof phone === 'string' ? phone.trim() : '',
        role: 'CUSTOMER',
        companyId: null,
      },
    });

    const token = crypto.randomUUID();
    await prisma.verificationToken.create({
      data: {
        email: user.email,
        token,
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    const smtpConfigured = !!(process.env.SMTP_USER && process.env.SMTP_PASS);
    await sendVerificationEmail(user.email, token, user.id);

    await audit({
      action: 'CREATE',
      entity: 'User',
      entityId: user.id,
      metadata: { email: user.email, role: 'CUSTOMER', via: 'register' },
    });

    return NextResponse.json({
      success: true,
      id: user.id,
      email: user.email,
      name: user.name,
      message: smtpConfigured
        ? 'تم إرسال رابط التفعيل إلى بريدك الإلكتروني'
        : 'تم التسجيل بنجاح، يمكنك تسجيل الدخول الآن',
    });
  } catch (err: any) {
    console.error('[Register API]', err);
    // Two case variants of the same address passing the pre-check at the
    // same moment: the unique index is what actually refuses the second.
    if (err?.code === 'P2002') {
      return NextResponse.json({ error: 'Email already exists' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
