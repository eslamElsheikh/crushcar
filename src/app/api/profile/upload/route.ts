import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { auth } from '@/lib/auth';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'webp']);

function uploadDir(): string {
  const dir = process.env.UPLOAD_DIR || './data/uploads';
  return path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
}

function sniffKind(buf: Buffer): 'jpg' | 'png' | 'webp' | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (
    buf.length > 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return 'png';
  }
  if (
    buf.length > 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

// Profile avatar upload — any signed-in user. Square 256x256 webp, UUID name.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const form = await req.formData();
    const file = form.get('image');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'image file is required' }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'image must be between 1 byte and 5 MB' }, { status: 400 });
    }
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      return NextResponse.json({ error: 'only jpeg, png, webp allowed' }, { status: 400 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const kind = sniffKind(buf);
    if (!kind) {
      return NextResponse.json({ error: 'file content is not a valid image' }, { status: 400 });
    }

    // Square avatar crop — server-generated filename, no user input in the path.
    const out = await sharp(buf)
      .resize({ width: 256, height: 256, fit: 'cover', position: 'attention' })
      .webp({ quality: 82 })
      .toBuffer();
    const name = `${randomUUID()}.webp`;
    const dir = uploadDir();
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, name), out);

    return NextResponse.json({ url: `/api/uploads/${name}` }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
