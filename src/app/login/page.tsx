'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Eye, EyeOff, Loader2, Sparkles } from 'lucide-react'
import { useLangStore } from '@/lib/lang'
import { cn } from '@/lib/utils'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const t = useLangStore((s) => s.t)
  const lang = useLangStore((s) => s.lang)
  const isRTL = lang === 'ar'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await signIn('credentials', { email, password, redirect: false })
    setLoading(false)

    if (res?.ok) {
      const redirect = email.includes('admin') ? '/admin' : '/trips'
      router.push(redirect)
      router.refresh()
    } else {
      setError(t('common.error') + ': Invalid credentials')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden bg-[#030303]">
      {/* Background */}
      <div className="absolute inset-0">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-3xl" />
        <div className="absolute inset-0 opacity-[0.02]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.3) 1px, transparent 1px)', backgroundSize: '50px 50px' }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, type: 'spring', stiffness: 100 }}
        className={cn('w-full max-w-md relative z-10', isRTL && 'font-[Cairo]')}
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-3 group">
            <div className="relative">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30 group-hover:shadow-blue-500/50 transition-shadow">
                <span className="text-white font-bold">CC</span>
              </div>
              <div className="absolute -inset-1 rounded-xl bg-blue-500/20 blur-lg -z-10 group-hover:bg-blue-500/30 transition-all" />
            </div>
            <div className="text-right">
              <span className="font-display font-bold text-xl text-white block">CrushCar</span>
            </div>
          </Link>
        </div>

        <div className="glass rounded-3xl p-8 border border-white/5 shadow-2xl">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-display font-bold text-white mb-2">{t('auth.welcome')}</h1>
            <p className="text-zinc-400 text-sm">{t('auth.signInAccount')}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="text-sm text-zinc-400 mb-2 block">{t('auth.email')}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3.5 rounded-xl bg-zinc-900/80 border border-white/5 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all text-white placeholder:text-zinc-600"
                placeholder="admin@crushcar.com"
                required
                dir="ltr"
              />
            </div>

            <div>
              <label className="text-sm text-zinc-400 mb-2 block">{t('auth.password')}</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3.5 rounded-xl bg-zinc-900/80 border border-white/5 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all text-white placeholder:text-zinc-600 pr-12"
                  placeholder="••••••••"
                  required
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors p-1"
                >
                  {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm"
              >
                {error}
              </motion.div>
            )}

            <motion.button
              type="submit"
              disabled={loading}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold transition-all shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2"
            >
              {loading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Sparkles size={16} />
              )}
              {t('auth.signIn')}
            </motion.button>
          </form>

          <div className="mt-6 text-center text-sm text-zinc-400">
            {t('auth.noAccount')}{' '}
            <Link href="/register" className="text-blue-400 hover:text-blue-300 transition-colors font-medium">
              {t('auth.createOne')}
            </Link>
          </div>
        </div>

        {/* Demo credentials */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-4 glass rounded-2xl p-5 border border-white/5"
        >
          <p className="text-xs text-zinc-500 mb-3 text-center font-medium">{t('auth.demoAccounts')}</p>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => { setEmail('admin@cairoexpress.com'); setPassword('admin123') }}
              className="w-full text-left px-4 py-2.5 rounded-xl bg-blue-500/5 border border-blue-500/10 hover:bg-blue-500/10 transition text-sm group"
            >
              <span className="text-blue-400 font-medium mr-2">{t('auth.admin')}:</span>
              <span className="text-zinc-300 font-mono text-xs">admin@cairoexpress.com</span>
            </button>
            <button
              onClick={() => { setEmail('user@example.com'); setPassword('user123') }}
              className="w-full text-left px-4 py-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/10 hover:bg-emerald-500/10 transition text-sm group"
            >
              <span className="text-emerald-400 font-medium mr-2">{t('auth.user')}:</span>
              <span className="text-zinc-300 font-mono text-xs">user@example.com</span>
            </button>
          </div>
        </motion.div>
      </motion.div>
    </div>
  )
}