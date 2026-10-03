import { NextRequest, NextResponse } from 'next/server';
import { readFile, access } from 'fs/promises';
import { join } from 'path';

export const dynamic = 'force-dynamic';

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

const CANDIDATE_DIRS = [
  join(process.cwd(), 'public', 'uploads'),
];

async function findFile(relativePath: string): Promise<string | null> {
  for (const dir of CANDIDATE_DIRS) {
    const fullPath = join(dir, relativePath);
    if (!fullPath.startsWith(dir)) continue;
    try {
      await access(fullPath);
      return fullPath;
    } catch {
      /* continue */
    }
  }
  return null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const filePath = path.join('/');
  const ext = '.' + filePath.split('.').pop()?.toLowerCase();

  const fullPath = await findFile(filePath);
  if (!fullPath) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const data = await readFile(fullPath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    return new NextResponse(data, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
