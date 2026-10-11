import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import bcrypt from 'bcryptjs';
import { logger } from '@/lib/logger';
import { passwordSchema } from '@/lib/validations';

export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.user.role !== 'COMPANY_ADMIN' && session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const { name, email, phone, password, isActive } = await req.json();

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // COMPANY_ADMIN can only edit users in their own company
    if (session.user.role === 'COMPANY_ADMIN' && user.companyId !== session.user.companyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const data: Record<string, unknown> = {};

    if (name !== undefined) {
      const trimmed = String(name).trim();
      if (!trimmed) return NextResponse.json({ error: 'الاسم مطلوب' }, { status: 400 });
      data.name = trimmed;
    }

    if (email !== undefined && email !== user.email) {
      const next = String(email).trim().toLowerCase();
      if (!EMAIL_RE.test(next)) {
        return NextResponse.json({ error: 'البريد الإلكتروني غير صحيح' }, { status: 400 });
      }
      // email is the login identifier and is unique in the schema, so the
      // collision has to be reported before the update rather than as a 500.
      const taken = await prisma.user.findUnique({ where: { email: next } });
      if (taken && taken.id !== id) {
        return NextResponse.json({ error: 'البريد الإلكتروني مستخدم بالفعل' }, { status: 400 });
      }
      data.email = next;
    }

    if (phone !== undefined) data.phone = String(phone).trim();

    // An empty password field means "leave it alone", so the admin can change a
    // name or phone without being forced to invent a new password.
    if (password !== undefined && password !== '' && password !== null) {
      const parsed = passwordSchema.safeParse(String(password));
      if (!parsed.success) {
        return NextResponse.json({ error: 'كلمة المرور ضعيفة' }, { status: 400 });
      }
      data.password = await bcrypt.hash(parsed.data, 12);
    }

    if (isActive !== undefined && Boolean(isActive) !== user.isActive) {
      const next = Boolean(isActive);
      if (!next) {
        // Locking yourself out is never the intent.
        if (id === session.user.id) {
          return NextResponse.json(
            { error: 'لا يمكنك إيقاف حسابك أنت' },
            { status: 400 }
          );
        }
        // Deactivating the final super admin would leave nobody able to undo it.
        if (user.role === 'SUPER_ADMIN') {
          const otherAdmins = await prisma.user.count({
            where: { role: 'SUPER_ADMIN', isActive: true, NOT: { id } },
          });
          if (otherAdmins === 0) {
            return NextResponse.json(
              { error: 'لا يمكن إيقاف آخر مدير نظام مفعّل' },
              { status: 400 }
            );
          }
        }
      }
      data.isActive = next;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'لا توجد تغييرات' }, { status: 400 });
    }

    const updated = await prisma.user.update({ where: { id }, data });

    return NextResponse.json({
      id: updated.id,
      email: updated.email,
      name: updated.name,
      phone: updated.phone,
      role: updated.role,
      companyId: updated.companyId,
      isActive: updated.isActive,
      createdAt: updated.createdAt.toISOString(),
    });
  } catch (err) {
    logger.error('[User PUT]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}