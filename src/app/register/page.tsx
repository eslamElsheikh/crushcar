'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Eye, EyeOff, Loader2, Sparkles } from 'lucide-react'
import { useLangStore } from '@/lib/lang'
import { cn } from '@/lib/utils'

export default function RegisterPage() {
  const router = useRouter()
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'CUSTOMER', companyId: '' })
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

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || t('common.error'))
        setLoading(false)
        return
      }

      router.push('/login?registered=true')
    } catch {
      setError(t('common.error'))
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden bg-[#030303]">
      <div className="absolute inset-0">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-purple-600/10 rounded-full blur-3xl" />
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
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
              <span className="text-white font-bold">CC</span>
            </div>
            <span className="font-display font-bold text-xl text-white">CrushCar</span>
          </Link>
        </div>

        <div className="glass rounded-3xl p-8 border border-white/5 shadow-2xl">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-display font-bold text-white mb-2">{t('auth.createAccount')}</h1>
            <p className="text-zinc-400 text-sm">{t('auth.joinToday')}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="text-sm text-zinc-400 mb-2 block">{t('auth.fullName')}</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-4 py-3.5 rounded-xl bg-zinc-900/80 border border-white/5 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all text-white placeholder:text-zinc-600"
                placeholder="Ahmed Hassan"
                required
              />
            </div>

            <div>
              <label className="text-sm text-zinc-400 mb-2 block">{t('auth.email')}</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-4 py-3.5 rounded-xl bg-zinc-900/80 border border-white/5 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all text-white placeholder:text-zinc-600"
                placeholder="you@example.com"
                required
                dir="ltr"
              />
            </div>

            <div>
              <label className="text-sm text-zinc-400 mb-2 block">{t('auth.password')}</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full px-4 py-3.5 rounded-xl bg-zinc-900/80 border border-white/5 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all text-white placeholder:text-zinc-600 pr-12"
                  placeholder="6+ characters"
                  minLength={6}
                  required
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

            <div>
              <label className="text-sm text-zinc-400 mb-2 block">{t('auth.iAm')}</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full px-4 py-3.5 rounded-xl bg-zinc-900/80 border border-white/5 focus:border-blue-500/50 focus:outline-none transition text-white"
              >
                <option value="CUSTOMER">{t('auth.customer')}</option>
                <option value="COMPANY_ADMIN">{t('auth.companyAdmin')}</option>
              </select>
            </div>

            {form.role === 'COMPANY_ADMIN' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="overflow-hidden"
              >
                <label className="text-sm text-zinc-400 mb-2 block">{t('auth.companyIdLabel')}</label>
                <input
                  type="text"
                  value={form.companyId}
                  onChange={(e) => setForm({ ...form, companyId: e.target.value })}
                  className="w-full px-4 py-3.5 rounded-xl bg-zinc-900/80 border border-white/5 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all text-white placeholder:text-zinc-600"
                  placeholder={t('auth.askAdmin')}
                />
              </motion.div>
            )}

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
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 text-white font-semibold transition-all shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2"
            >
              {loading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Sparkles size={16} />
              )}
              {t('auth.createAccount')}
            </motion.button>
          </form>

          <div className="mt-6 text-center text-sm text-zinc-400">
            {t('auth.alreadyAccount')}{' '}
            <Link href="/login" className="text-blue-400 hover:text-blue-300 transition-colors font-medium">
              {t('auth.signIn')}
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  )
}