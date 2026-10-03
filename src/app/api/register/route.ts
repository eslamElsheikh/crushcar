import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { sendVerificationEmail } from '@/lib/email';
import { audit } from '@/lib/audit';

export async function POST(req: NextRequest) {
  try {
    const { email, password, name, phone } = await req.json();

    if (!email || !password || !name) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    if (!email.includes('@') || password.length < 6) {
      return NextResponse.json({ error: 'Invalid email or password (min 6 chars)' }, { status: 400 });
    }

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) {
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
        email,
        password: hashed,
        name,
        phone: phone || '',
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
  } catch (err) {
    console.error('[Register API]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
