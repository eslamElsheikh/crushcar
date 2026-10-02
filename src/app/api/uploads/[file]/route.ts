import { NextRequest, NextResponse } from 'next/server';
import { readFile, stat } from 'fs/promises';
import path from 'path';

const MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

function uploadDir(): string {
  const dir = process.env.UPLOAD_DIR || './data/uploads';
  return path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
}

// Serves uploaded destination images. Filenames are server-generated UUIDs;
// anything else is rejected before touching the filesystem.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const m = /^([a-f0-9-]{10,80})\.(jpg|jpeg|png|webp)$/i.exec(file || '');
  if (!m) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const ext = m[2].toLowerCase();
  const abs = path.join(uploadDir(), `${m[1]}.${ext}`);
  try {
    const info = await stat(abs);
    if (!info.isFile()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const bytes = await readFile(abs);
    // Uint8Array body avoids the Buffer/BodyInit typing friction.
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Length': String(bytes.length),
      },
    });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
