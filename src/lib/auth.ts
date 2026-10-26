import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { evaluateTurnstile } from '@/lib/turnstile'

/** How stale a session may get before isActive is re-read from the database. */
const ACTIVE_RECHECK_MS = 5 * 60 * 1000

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        // Not a field the form shows: the page hands the Turnstile token to
        // signIn() and next-auth posts it with the rest of the credentials.
        // Verified here rather than in middleware because middleware runs
        // before the body is parsed and would never see it.
        turnstileToken: { label: 'Captcha', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        // Checked first: a caller that cannot pass the captcha never reaches
        // the database, and the answer it gets is the same `null` a wrong
        // password produces, so there is nothing to probe with.
        const captcha = await evaluateTurnstile(
          (credentials.turnstileToken as string | undefined)?.trim() || '',
          undefined
        )
        if (!captcha.ok) {
          console.warn('[auth] login refused by turnstile:', captcha.reason)
          return null
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
          include: { company: true },
        })

        if (!user) return null

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.password
        )

        if (!valid) return null

        // A deactivated user keeps their hash, so the password check alone
        // would still let them in. Without this the admin "suspend" control
        // is only a label in the table.
        if (!user.isActive) return null

        // Block login for inactive company admins
        if (user.role === 'COMPANY_ADMIN' && user.company && !user.company.isActive) return null

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image ?? null,
          role: user.role,
          companyId: user.companyId ?? undefined,
        }
      },
    }),
  ],
  callbacks: {
    async signIn({ user: _user }) {
      return true
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith('/')) return `${baseUrl}${url}`
      if (new URL(url).origin === baseUrl) return url
      return baseUrl
    },
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id
        token.role = (user as { role: string }).role
        token.companyId = (user as { companyId?: string }).companyId
        token.image = (user as { image?: string | null }).image ?? null
        token.activeCheckedAt = Date.now()
      }
      // Live profile updates (e.g. avatar upload) refresh the token without re-login.
      if (trigger === 'update' && session && typeof (session as { image?: unknown }).image !== 'undefined') {
        token.image = (session as { image?: string | null }).image ?? null
      }

      // The session is a stateless JWT that lives 30 days, so suspending a user
      // only stops future logins. This re-reads isActive so an existing session
      // dies too, but not on every request: the check is throttled by a
      // timestamp carried in the token, which costs at most one query every
      // five minutes per active user.
      //
      // Revocation is sticky on purpose. Once revoked the token must never
      // become usable again, so an un-flagged session is never re-validated.
      if (token.id && !token.revoked) {
        const checkedAt = typeof token.activeCheckedAt === 'number' ? token.activeCheckedAt : 0
        if (Date.now() - checkedAt > ACTIVE_RECHECK_MS) {
          const fresh = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { isActive: true },
          })
          token.activeCheckedAt = Date.now()
          if (!fresh?.isActive) token.revoked = true
        }
      }
      return token
    },
    session({ session, token }) {
      // Every guard in the app is `if (!session?.user)`, so an absent user is
      // what "signed out" looks like to the rest of the codebase.
      if (token.revoked) {
        return { ...session, user: undefined } as unknown as typeof session
      }
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as string
        session.user.companyId = token.companyId as string | undefined
        session.user.image = (token.image as string | null | undefined) ?? null
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  cookies: {
    sessionToken: {
      name: `next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
})
