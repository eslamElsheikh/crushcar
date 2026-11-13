import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { checkRateLimit } from '@/lib/rateLimitHttp'
import {
  MAX_SIGN_TTL_SECONDS,
  classifyUpload,
  mayReadUpload,
  signUploadFile,
} from '@/lib/upload-access'

/**
 * Mints a signed link for one uploaded file.
 *
 * A signature is only ever an *alternative* to the caller's own session —
 * it grants exactly what `mayReadUpload` would have granted, so asking for
 * one cannot be used to read a file the caller could not already read. What
 * it buys is a link that works without a cookie: forwarding a proof by
 * email, opening a ticket on another device.
 *
 * The secret never leaves the server; the response carries the signature
 * and its expiry, and nothing else.
 */
export async function POST(req: NextRequest) {
  const rl = checkRateLimit(req, 'upload-sign', 60, 60_000)
  if (rl.blocked) return rl.blocked

  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const file = body && typeof body === 'object' ? (body as { file?: unknown }).file : undefined
  if (typeof file !== 'string' || !/^[a-f0-9-]{10,80}\.(jpg|jpeg|png|webp)$/i.test(file)) {
    return NextResponse.json({ error: 'Invalid file' }, { status: 400 })
  }

  const classification = await classifyUpload(file)
  if (!mayReadUpload(classification, session)) {
    // Same answer a direct request for the file would get, so the endpoint
    // cannot be used to tell a private filename apart from a public one.
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const ttlRaw = body && typeof body === 'object' ? (body as { ttlSeconds?: unknown }).ttlSeconds : undefined
  const ttl = typeof ttlRaw === 'number' && Number.isFinite(ttlRaw) ? Math.floor(ttlRaw) : 300
  const signed = signUploadFile(file, ttl)
  if (!signed) {
    return NextResponse.json({ error: 'Signing is not configured' }, { status: 503 })
  }

  return NextResponse.json({
    url: `/api/uploads/${file}?exp=${signed.exp}&sig=${signed.sig}`,
    exp: signed.exp,
    sig: signed.sig,
    expiresAt: new Date(signed.exp * 1000).toISOString(),
    maxTtlSeconds: MAX_SIGN_TTL_SECONDS,
  })
}
