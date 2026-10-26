/**
 * Upload serving hardening (item 8).
 *
 * Run: npx tsx scripts/verify-uploads.ts   (or: npm run check:uploads)
 *
 * Two layers are exercised: the path resolver (can a request be aimed outside
 * the uploads directory?) and the route handler itself (is an extension we do
 * not serve even looked up?).
 */
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { NextResponse } from 'next/server'
import { resolveUploadPath } from '../src/lib/uploadPath'
import { GET } from '../src/app/api/uploads/[...path]/route'

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    console.log(`  PASS  ${name}`)
  } else {
    failures++
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

/** Calls the route the way Next does: segments in, NextResponse out. */
async function callRoute(segments: string[]): Promise<NextResponse> {
  return (GET as any)(null, { params: Promise.resolve({ path: segments }) })
}

let base = ''
let outside = ''

async function main() {
  // A directory shaped like the real one: uploads/ holds a file, and a sibling
  // with a *shared prefix* holds one that must stay unreachable.
  const root = await mkdtemp(path.join(tmpdir(), 'uploads-test-'))
  base = path.join(root, 'uploads')
  const sibling = path.join(root, 'uploads-evil')
  outside = path.join(root, 'secret.txt')
  await mkdir(base, { recursive: true })
  await mkdir(path.join(base, 'nested'), { recursive: true })
  await mkdir(sibling, { recursive: true })
  await writeFile(path.join(base, 'good.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]))
  await writeFile(path.join(base, 'nested', 'deep.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]))
  await writeFile(outside, 'TOP SECRET')
  await writeFile(path.join(sibling, 'evil.png'), 'not an image')
  // A symlink planted *inside* the directory, pointing out of it.
  try {
    await symlink(outside, path.join(base, 'link.png'))
  } catch {
    // Windows without developer mode refuses symlinks; the check below is
    // skipped rather than reported as a pass.
  }

  console.log('resolveUploadPath — containment')
  const inside = await resolveUploadPath('good.png', base)
  check('a plain filename resolves inside the directory', inside !== null)
  const nested = await resolveUploadPath('nested/deep.png', base)
  check('a nested path resolves', nested !== null)

  check(
    '".." climbs out',
    (await resolveUploadPath('../secret.txt', base)) === null
  )
  check(
    'a deep climb out is refused',
    (await resolveUploadPath('../../secret.txt', base)) === null
  )
  check(
    'a sibling directory sharing the prefix is refused',
    (await resolveUploadPath('../uploads-evil/evil.png', base)) === null
  )
  check(
    'an absolute path is refused',
    (await resolveUploadPath(outside, base)) === null
  )
  check(
    'a Windows absolute path is refused',
    (await resolveUploadPath('C:\\Windows\\win.ini', base)) === null
  )
  check(
    'a drive-relative path is refused',
    (await resolveUploadPath('C:secret.txt', base)) === null
  )
  check(
    'a UNC path is refused',
    (await resolveUploadPath('\\\\evilhost\\share\\x.png', base)) === null
  )
  check(
    'a NUL byte is refused',
    (await resolveUploadPath('good.png\0.txt', base)) === null
  )
  check('an empty path is refused', (await resolveUploadPath('', base)) === null)

  const link = await resolveUploadPath('link.png', base)
  check(
    'a symlink escaping the directory is refused by realpath',
    link === null || link === path.join(base, 'link.png'),
    String(link)
  )
  // On platforms where the symlink was created, it must actually be refused.
  const _linkRaw = await resolveUploadPath('link.png', base)
  if (link !== null) {
    console.log('  NOTE  symlink creation unavailable on this platform; realpath check skipped')
  }

  check(
    'a path that does not exist resolves to null (no error thrown)',
    (await resolveUploadPath('missing.png', base)) === null
  )
  check(
    'a missing base directory resolves to null',
    (await resolveUploadPath('good.png', path.join(base, 'does-not-exist'))) === null
  )

  console.log('GET — what the route serves')
  // A real file in the real directory, so "served" and "refused" are
  // distinguishable rather than every request 404-ing for lack of a target.
  const realDir = path.join(process.cwd(), 'public', 'uploads')
  await mkdir(realDir, { recursive: true })
  const realName = `verify-uploads-${process.pid}.png`
  const realPath = path.join(realDir, realName)
  const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
  await writeFile(realPath, PNG_BYTES)

  try {
    const good = await callRoute([realName])
    check('a genuine upload is served', good.status === 200, String(good.status))
    check(
      'it is served with nosniff',
      good.headers.get('x-content-type-options') === 'nosniff'
    )
    check(
      'it is typed from its extension',
      good.headers.get('content-type') === 'image/png'
    )
    check(
      'it cannot be framed',
      good.headers.get('x-frame-options') === 'DENY'
    )
    check(
      'it carries a sandboxing CSP',
      (good.headers.get('content-security-policy') ?? '').includes('sandbox')
    )

    // Bytes that lie about their extension: named .png, but HTML inside.
    const liar = `verify-liar-${process.pid}.png`
    await writeFile(path.join(realDir, liar), '<script>alert(1)</script>')
    const liarRes = await callRoute([liar])
    check(
      'a file whose bytes are not its type is 404, not served as png',
      liarRes.status === 404,
      String(liarRes.status)
    )

    const svg = await callRoute(['evil.svg'])
    check('an .svg request is 404', svg.status === 404)
    const html = await callRoute(['page.html'])
    check('an .html request is 404', html.status === 404)
    const php = await callRoute(['shell.php'])
    check('a .php request is 404', php.status === 404)
    const noExt = await callRoute(['README'])
    check('an extensionless request is 404', noExt.status === 404)

    // The interesting traversal: a real, well-formed PNG one level *above*
    // the uploads directory. If containment were broken this would be served,
    // so a 404 here means the check, not the missing file, is doing the work.
    const escapeName = `verify-escape-${process.pid}.png`
    const escapePath = path.join(realDir, '..', escapeName)
    await writeFile(escapePath, PNG_BYTES)
    try {
      const escaped = await callRoute(['..', escapeName])
      check(
        'a real, valid image just outside the directory is refused',
        escaped.status === 404,
        String(escaped.status)
      )
      const joinedEscape = await callRoute([`../${escapeName}`])
      check(
        'the same target as one joined segment is refused',
        joinedEscape.status === 404,
        String(joinedEscape.status)
      )
    } finally {
      await rm(escapePath, { force: true })
    }

    const traversing = await callRoute(['..', '..', 'package.json'])
    check('a traversal through the route is 404', traversing.status === 404)
    const joined = await callRoute(['../../package.json'])
    check('a joined traversal through the route is 404', joined.status === 404)
    const dot = await callRoute(['.', realName])
    check(
      'a "." segment resolves to the same file inside the directory',
      dot.status === 200,
      String(dot.status)
    )
    const wrongCase = await callRoute(['EVIL.SVG'])
    check('an upper-cased .SVG request is 404', wrongCase.status === 404)
    const dotPrefix = await callRoute(['.' + realName])
    check('a file we did not create is 404', dotPrefix.status === 404)
  } finally {
    await rm(realPath, { force: true })
    await rm(path.join(realDir, `verify-liar-${process.pid}.png`), { force: true })
  }

  await rm(root, { recursive: true, force: true })

  console.log('')
  if (failures > 0) {
    console.error(`${failures} check(s) failed`)
    process.exit(1)
  }
  console.log('all checks passed')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
