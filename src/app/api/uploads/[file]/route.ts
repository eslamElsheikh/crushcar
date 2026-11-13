import { NextRequest, NextResponse } from 'next/server';
import { readFile, stat } from 'fs/promises';
import path from 'path';
import { auth } from '@/lib/auth';
import {
  classifyUpload,
  mayReadUpload,
  uploadDir,
  verifyUploadSignature,
} from '@/lib/upload-access';

const MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

// Serves uploaded files out of UPLOAD_DIR. Filenames are server-generated
// UUIDs; anything else is rejected before touching the filesystem.
//
// What the file *is* decides who may read it: see src/lib/upload-access.ts.
// Destination photographs and avatars stay public; a payment proof, a
// deposit attachment or any file carrying an owner marker needs the owner's
// session (or a signed link that has not expired).
export async function GET(req: NextRequest, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const m = /^([a-f0-9-]{10,80})\.(jpg|jpeg|png|webp)$/i.exec(file || '');
  if (!m) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const ext = m[2].toLowerCase();
  const abs = path.join(uploadDir(), `${m[1]}.${ext}`);
  try {
    const info = await stat(abs);
    if (!info.isFile()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const classification = await classifyUpload(file);

  if (classification.access === 'private') {
    // A signed link stands in for the session, so a proof can be opened on a
    // device that has no cookie. An expired or edited one is not a denial of
    // anything the caller already had: it simply fails to grant, and the
    // session check below decides as if it had never been sent.
    const url = new URL(req.url);
    const signed = verifyUploadSignature(
      file,
      url.searchParams.get('exp'),
      url.searchParams.get('sig')
    );

    if (!signed) {
      const session = await auth();
      if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (!mayReadUpload(classification, session)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
  }

  try {
    const bytes = await readFile(abs);
    // Uint8Array body avoids the Buffer/BodyInit typing friction.
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        // The bytes are typed by the extension above; nosniff stops the
        // browser from second-guessing that and rendering them as a document.
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        // A proof is not a photograph of a city: it must not be cached by a
        // shared proxy or the next person to ask for the URL.
        'Cache-Control':
          classification.access === 'private'
            ? 'private, no-store'
            : 'public, max-age=31536000, immutable',
        'Content-Length': String(bytes.length),
      },
    });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
