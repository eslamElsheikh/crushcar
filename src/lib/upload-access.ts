import { createHmac, timingSafeEqual } from 'crypto'
import { mkdir, readFile, writeFile } from 'fs/promises'
import path from 'path'
import { prisma } from '@/lib/prisma'

/**
 * Who may read a file out of UPLOAD_DIR.
 *
 * Everything this app writes into UPLOAD_DIR used to be served to anybody
 * who asked: the directory holds destination photographs and avatars *and*
 * the screenshots of bank transfers that prove a payment happened, and one
 * route served all three with no question asked. A payment proof is a
 * customer's name, phone number, account digits and amount — the URL was a
 * server-generated UUID, so it was unguessable, but "unguessable" is the
 * only thing standing between that document and anyone who obtains the link
 * (a proxy log, a browser history, a Referer header, a shared screenshot of
 * the page).
 *
 * The rule implemented here:
 *
 *   - A file written by the payment-proof endpoint is private from the
 *     moment it is written: the uploader is recorded in a marker beside it,
 *     so it is protected even before it is attached to a booking.
 *   - A file referenced by a proof column (Booking.paymentProofUrl,
 *     CompanyBooking.paymentProofUrl, DepositRequest.attachmentUrl,
 *     PlatformTransaction.attachmentUrl) is private even if it predates the
 *     markers — that is how the existing production files are covered.
 *   - Everything else is public: destination photographs, avatars, company
 *     logos. That is what the website renders for anonymous visitors, and
 *     making them private would break the public pages.
 *
 * Access to a private file is granted to its uploader/owner, to the company
 * that owns the booking or deposit, and to a super admin — or to whoever
 * carries a signed URL that has not expired.
 */

/** Structural view of the session — enough to make the decision, nothing more. */
export interface UploadSessionUser {
  id?: string
  role?: string
  companyId?: string
}

export type UploadOwner =
  /** Written by the payment-proof endpoint; `userId`/`companyId` are the uploader. */
  | { kind: 'uploader'; userId?: string; companyId?: string }
  | { kind: 'booking'; id: string; userId: string }
  | { kind: 'companyBooking'; id: string; companyId: string }
  | { kind: 'depositRequest'; id: string; companyId: string }
  | { kind: 'platformTransaction'; id: string }

export interface UploadClassification {
  access: 'public' | 'private'
  /** The principals that may read it when it is private. Empty ⇒ super admin only. */
  owners: UploadOwner[]
}

export function uploadDir(): string {
  const dir = process.env.UPLOAD_DIR || './data/uploads'
  return path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir)
}

/** Where the "this file is private, and here is who uploaded it" marker lives. */
function ownerMarkerPath(file: string): string {
  return path.join(uploadDir(), '.owners', file)
}

/**
 * Records that a freshly uploaded file is private and who may see it.
 *
 * Called by the payment-proof endpoint at write time, so there is no window
 * between "the bytes land on disk" and "the file is protected" — and no
 * dependence on the file having been attached to a booking yet.
 */
export async function markUploadPrivate(
  file: string,
  owner: { userId?: string; companyId?: string },
): Promise<void> {
  try {
    const marker = ownerMarkerPath(file)
    await mkdir(path.dirname(marker), { recursive: true })
    await writeFile(marker, JSON.stringify({ ...owner, at: Date.now() }), 'utf8')
  } catch (err) {
    // A marker that cannot be written must not lose the upload: the file is
    // still protected the moment anything references it, and the failure is
    // visible in the logs rather than silent.
    console.error('[upload-access] could not write owner marker for', file, err)
  }
}

async function readOwnerMarker(file: string): Promise<{ userId?: string; companyId?: string } | null> {
  try {
    const raw = await readFile(ownerMarkerPath(file), 'utf8')
    const parsed = JSON.parse(raw) as { userId?: string; companyId?: string }
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.userId !== 'string' && typeof parsed.companyId !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

/**
 * The DB columns that make a file private, and the ones that make it public.
 *
 * Run together rather than in sequence: these are five index lookups at
 * worst, and the answer is decided by precedence below rather than by which
 * query happens to come back first.
 */
async function classifyFromDb(publicPath: string): Promise<UploadClassification> {
  const [booking, companyBooking, depositRequest, platformTransaction, destination, user] =
    await Promise.all([
      prisma.booking.findFirst({
        where: { paymentProofUrl: publicPath },
        select: { id: true, userId: true },
      }),
      prisma.companyBooking.findFirst({
        where: { paymentProofUrl: publicPath },
        select: { id: true, companyId: true },
      }),
      prisma.depositRequest.findFirst({
        where: { attachmentUrl: publicPath },
        select: { id: true, companyId: true },
      }),
      prisma.platformTransaction.findFirst({
        where: { attachmentUrl: publicPath },
        select: { id: true },
      }),
      prisma.destination.findFirst({ where: { imageUrl: publicPath }, select: { id: true } }),
      prisma.user.findFirst({ where: { image: publicPath }, select: { id: true } }),
    ])

  const owners: UploadOwner[] = []
  if (booking) owners.push({ kind: 'booking', id: booking.id, userId: booking.userId })
  if (companyBooking)
    owners.push({ kind: 'companyBooking', id: companyBooking.id, companyId: companyBooking.companyId })
  if (depositRequest)
    owners.push({ kind: 'depositRequest', id: depositRequest.id, companyId: depositRequest.companyId })
  if (platformTransaction) owners.push({ kind: 'platformTransaction', id: platformTransaction.id })

  // A proof reference wins over a public one: the same URL attached to a
  // booking is a payment proof first, whatever else it also appears on.
  if (owners.length > 0) return { access: 'private', owners }
  if (destination || user) return { access: 'public', owners: [] }

  // Unreferenced and unmarked: an upload whose owner has not saved it yet.
  // Public, which is what every such file was before this module existed —
  // every *new* payment proof carries a marker and never reaches this line.
  return { access: 'public', owners: [] }
}

/**
 * Classification cache.
 *
 * The public pages render a handful of these images per visit and the
 * answer for a given filename cannot change except when a file is attached
 * to a booking — and attached proofs carry a marker, which is checked
 * before this cache is ever consulted. Sixty seconds bounds that to well
 * inside one page view.
 */
const CLASSIFY_TTL_MS = 60_000
const classifyCache = new Map<string, { value: UploadClassification; at: number }>()

/** Test seam: forget everything cached (used by the regression suite). */
export function clearUploadAccessCache(): void {
  classifyCache.clear()
}

export async function classifyUpload(file: string): Promise<UploadClassification> {
  const publicPath = `/api/uploads/${file}`

  // 1. The marker is authoritative and cheap: a file born private stays
  //    private with no database round trip at all.
  const marker = await readOwnerMarker(file)
  if (marker) {
    return { access: 'private', owners: [{ kind: 'uploader', ...marker }] }
  }

  // 2. Otherwise ask the database, with a short memory.
  const hit = classifyCache.get(file)
  if (hit && Date.now() - hit.at < CLASSIFY_TTL_MS) return hit.value

  const value = await classifyFromDb(publicPath)
  classifyCache.set(file, { value, at: Date.now() })
  return value
}

/** True when this session may read this file. Super admin may read anything. */
export function mayReadUpload(
  classification: UploadClassification,
  session: { user?: UploadSessionUser } | null | undefined,
): boolean {
  const user = session?.user
  if (!user?.id) return false
  if (user.role === 'SUPER_ADMIN') return true
  if (classification.access === 'public') return true

  for (const owner of classification.owners) {
    if (owner.kind === 'uploader') {
      if (owner.userId && owner.userId === user.id) return true
      if (owner.companyId && user.companyId && owner.companyId === user.companyId) return true
    } else if (owner.kind === 'booking') {
      if (owner.userId === user.id) return true
    } else if (owner.kind === 'companyBooking' || owner.kind === 'depositRequest') {
      if (user.companyId && owner.companyId === user.companyId) return true
    }
    // platformTransaction: the operator's own document — super admin only,
    // which is already handled above.
  }
  return false
}

// ── Signed URLs ──────────────────────────────────────────────────────────────
//
// A link that carries its own authority, for the cases where a cookie cannot:
// a proof forwarded by email, a ticket opened on another device. The
// signature covers the filename and the expiry, so a link cannot be edited
// to point at a different file or to live longer, and verification compares
// in constant time.

/** Longest life a signed upload link may be given. */
export const MAX_SIGN_TTL_SECONDS = 24 * 60 * 60

function signingSecret(): string | null {
  const secret = process.env.AUTH_SECRET
  return secret && secret.length > 0 ? secret : null
}

function signatureFor(file: string, exp: number): string | null {
  const secret = signingSecret()
  if (!secret) return null
  return createHmac('sha256', secret).update(`${file}|${exp}`).digest('hex')
}

export interface SignedUploadUrl {
  exp: number
  sig: string
}

/** Mints `{ exp, sig }` for `file`, or null when no AUTH_SECRET is configured. */
export function signUploadFile(file: string, ttlSeconds = 300): SignedUploadUrl | null {
  if (!/^[a-f0-9-]{10,80}\.(jpg|jpeg|png|webp)$/i.test(file)) return null
  const ttl = Math.min(Math.max(1, Math.floor(ttlSeconds)), MAX_SIGN_TTL_SECONDS)
  const exp = Math.floor(Date.now() / 1000) + ttl
  const sig = signatureFor(file, exp)
  return sig ? { exp, sig } : null
}

/**
 * True only for a signature that matches this file and has not expired.
 *
 * Fails closed in every direction: no secret, no expiry, a malformed
 * expiry, a wrong-length or wrong-value signature, or a clock past `exp`
 * all answer false. An unsigned request is not "invalid" here — it simply
 * has no signature to evaluate, and the caller falls back to the session
 * check.
 */
export function verifyUploadSignature(
  file: string,
  exp: string | null | undefined,
  sig: string | null | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!exp || !sig) return false
  if (!/^\d{1,15}$/.test(exp)) return false
  const expSeconds = Number(exp)
  if (!Number.isFinite(expSeconds) || expSeconds <= nowSeconds) return false
  // A signature from the far future is as good as no expiry at all, so the
  // window it may open is bounded even if a caller asks for one.
  if (expSeconds - nowSeconds > MAX_SIGN_TTL_SECONDS) return false

  const expected = signatureFor(file, expSeconds)
  if (!expected) return false

  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(sig, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
