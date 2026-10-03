import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_SIZE = 2 * 1024 * 1024; // 2MB

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user || !session.user.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.user.role !== 'COMPANY_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get('logo') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid file type. Allowed: PNG, JPG, WebP' }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File too large. Maximum 2MB' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const ext = file.type === 'image/png' ? '.png' : file.type === 'image/webp' ? '.webp' : '.jpg';
    const filename = `${session.user.companyId}-${randomUUID()}${ext}`;
    const uploadDir = join(process.cwd(), 'public', 'uploads', 'companies');
    const filepath = join(uploadDir, filename);

    await mkdir(uploadDir, { recursive: true });
    await writeFile(filepath, buffer);

    const logoUrl = `/api/uploads/companies/${filename}`;

    await prisma.company.update({
      where: { id: session.user.companyId },
      data: { logoUrl },
    });

    return NextResponse.json({ logoUrl, success: true });
  } catch (err) {
    logger.error('Logo upload error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user || !session.user.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.user.role !== 'COMPANY_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { showLogoOnTicket } = await req.json();

    await prisma.company.update({
      where: { id: session.user.companyId },
      data: { showLogoOnTicket: !!showLogoOnTicket },
    });

    return NextResponse.json({ showLogoOnTicket: !!showLogoOnTicket, success: true });
  } catch (err) {
    logger.error('Logo toggle error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
