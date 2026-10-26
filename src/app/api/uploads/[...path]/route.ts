import { NextRequest, NextResponse } from 'next/server';
import { readFile, access } from 'fs/promises';
import path from 'path';
import { resolveUploadPath } from '@/lib/uploadPath';

export const dynamic = 'force-dynamic';

/**
 * Extensions this endpoint is willing to serve, and the type it serves them
 * as. Anything not in here is a 404 rather than a guess.
 *
 * SVG is deliberately absent. It is an XML document with scripts in it, so
 * serving user-controlled SVG as image/svg+xml from our own origin is stored
 * XSS — the file renders as a page, with our cookies, under our name. Nothing
 * in this app uploads SVG, so refusing it costs nothing.
 */
const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.gif': 'image/gif',
};

const CANDIDATE_DIRS = [path.join(process.cwd(), 'public', 'uploads')];

async function findFile(relativePath: string): Promise<string | null> {
  for (const dir of CANDIDATE_DIRS) {
    const fullPath = await resolveUploadPath(relativePath, dir);
    if (!fullPath) continue;
    try {
      await access(fullPath);
      return fullPath;
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

/**
 * Confirms the bytes actually are what the extension claims.
 *
 * Content-Type is chosen from the extension, so without this a file named
 * `x.png` whose bytes are HTML would be offered as image/png — harmless on its
 * own thanks to nosniff, but one config slip away from being served as
 * text/html. The check costs a dozen bytes read.
 */
function sniffMatches(buf: Buffer, ext: string): boolean {
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    case '.png':
      return (
        buf.length > 8 &&
        buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
        buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
      );
    case '.webp':
      return (
        buf.length > 12 &&
        buf.toString('ascii', 0, 4) === 'RIFF' &&
        buf.toString('ascii', 8, 12) === 'WEBP'
      );
    case '.gif':
      return (
        buf.length > 6 &&
        buf.toString('ascii', 0, 3) === 'GIF' &&
        (buf[3] === 0x38 || buf[3] === 0x39) &&
        buf[4] === 0x62 && buf[5] === 0x70
      );
    case '.pdf':
      return buf.length > 4 && buf.toString('ascii', 0, 4) === '%PDF';
    default:
      return false;
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;
  const filePath = segments.join('/');
  const ext = '.' + (filePath.split('.').pop() ?? '').toLowerCase();

  // Allow-list first: an extension we do not serve is never looked up, so
  // `.svg`, `.html`, `.php` and friends cannot even be probed for.
  if (!Object.prototype.hasOwnProperty.call(MIME_TYPES, ext)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const fullPath = await findFile(filePath);
  if (!fullPath) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const data = await readFile(fullPath);
    if (!sniffMatches(data, ext)) {
      // Bytes and extension disagree — a renamed file. Nothing to serve.
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(data), {
      headers: {
        'Content-Type': MIME_TYPES[ext],
        // The browser must not reinterpret this under any circumstance: a
        // response we call image/png stays image/png, never a document.
        'X-Content-Type-Options': 'nosniff',
        // Belt and braces alongside CSP frame-ancestors: this response can
        // never be embedded, even by a browser that ignores the CSP.
        'X-Frame-Options': 'DENY',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
