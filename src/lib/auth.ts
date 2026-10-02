import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

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
    async signIn({ user }) {
      return true
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith('/')) return `${baseUrl}${url}`
      if (new URL(url).origin === baseUrl) return url
      return baseUrl
    },
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id
        token.role = (user as { role: string }).role
        token.companyId = (user as { companyId?: string }).companyId
        token.image = (user as { image?: string | null }).image ?? null
      }
      // Live profile updates (e.g. avatar upload) refresh the token without re-login.
      if (trigger === 'update' && session && typeof (session as { image?: unknown }).image !== 'undefined') {
        token.image = (session as { image?: string | null }).image ?? null
      }
      return token
    },
    session({ session, token }) {
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
