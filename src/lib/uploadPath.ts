import path from 'path';
import { realpath } from 'fs/promises';

/**
 * Resolves a request-supplied relative path inside `dir`, or null.
 *
 * Lives apart from the route that uses it (a route file may only export
 * handlers) so it can be pointed at a scratch directory by the tests in
 * scripts/verify-uploads.ts.
 *
 * Three separate defences, because each one alone has a known way around it:
 *
 *  1. Reject absolute paths and NUL bytes outright — `join` would happily
 *     turn `/etc/passwd` into a location outside `dir`.
 *  2. `resolve` (not `join`) so `..` segments collapse *before* the
 *     containment test, then compare against `dir + separator`. The separator
 *     matters: a plain `startsWith(dir)` also accepts `/uploads-evil/...`
 *     because that string starts with `/uploads`.
 *  3. `realpath` afterwards, so a symlink planted inside the directory cannot
 *     be used to walk back out of it.
 */
/**
 * Path prefix test that tolerates Windows' case-insensitive filesystem:
 * `realpath` returns a canonical case, `path.resolve` does not, and a
 * mismatch there would refuse every legitimate file.
 */
function startsWithDir(candidate: string, dir: string): boolean {
  const win = process.platform === 'win32';
  const left = win ? candidate.toLowerCase() : candidate;
  const right = win ? dir.toLowerCase() : dir;
  return left === right || left.startsWith(right + path.sep);
}

export async function resolveUploadPath(
  relativePath: string,
  dir: string
): Promise<string | null> {
  if (!relativePath || relativePath.includes('\0')) return null;
  if (path.isAbsolute(relativePath)) return null;
  // Windows drive-relative paths ("C:x") and UNC prefixes.
  if (/^[a-zA-Z]:/.test(relativePath) || relativePath.startsWith('\\\\')) return null;

  const base = path.resolve(dir);
  const fullPath = path.resolve(base, relativePath);

  if (!startsWithDir(fullPath, base)) return null;

  try {
    const real = await realpath(fullPath);
    const realBase = await realpath(base);
    return startsWithDir(real, realBase) ? real : null;
  } catch {
    // Does not exist (or the directory itself is unreadable): not a hit.
    return null;
  }
}
