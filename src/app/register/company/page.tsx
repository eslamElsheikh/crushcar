'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Eye, EyeOff, Loader2, Building2, ArrowLeft } from 'lucide-react'
import { useLangStore } from '@/lib/lang'
import { cn } from '@/lib/utils'

export default function CompanyRegisterPage() {
  const router = useRouter()
  const t = useLangStore((s) => s.t)
  const lang = useLangStore((s) => s.lang)
  const isRTL = lang === 'ar'

  const [form, setForm] = useState({
    companyName: '',
    adminName: '',
    email: '',
    phone: '',
    password: '',
    notes: '',
  })
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/register/company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Something went wrong')
        setLoading(false)
        return
      }

      setSuccess(true)
    } catch {
      setError('Something went wrong')
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden bg-[#030303]">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md relative z-10"
        >
          <div className="glass rounded-3xl p-8 border border-white/5 shadow-2xl text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', delay: 0.2 }}
              className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-6"
            >
              <Building2 size={40} className="text-emerald-400" />
            </motion.div>
            <h1 className="text-2xl font-bold text-white mb-3">
              {isRTL ? 'تم التسجيل بنجاح!' : 'Registration Successful!'}
            </h1>
            <p className="text-zinc-400 mb-6">
              {isRTL
                ? 'تم استلام طلبك. هيتم مراجعة حسابك وتفعيله من فريقنا خلال 24 ساعة. هيوصلك إيميل لما الحساب يتفعل.'
                : 'Your request has been received. Our team will review and activate your account within 24 hours. You will receive an email once activated.'}
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white transition text-sm font-medium"
            >
              {isRTL ? 'الذهاب لتسجيل الدخول' : 'Go to Login'}
            </Link>
          </div>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden bg-[#030303]">
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
            <div className="w-14 h-14 rounded-2xl bg-blue-500/20 flex items-center justify-center mx-auto mb-4">
              <Building2 size={28} className="text-blue-400" />
            </div>
            <h1 className="text-2xl font-display font-bold text-white mb-2">
              {isRTL ? 'تسجيل شركة جديدة' : 'Register Your Company'}
            </h1>
            <p className="text-zinc-400 text-sm">
              {isRTL
                ? 'سجل شركتك واحجز اتوبيسات وكراسي لموظفيك وعملائك'
                : 'Register your company and book buses & seats for employees and clients'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm text-zinc-400 mb-1.5 block">
                {isRTL ? 'اسم الشركة' : 'Company Name'} *
              </label>
              <input
                type="text"
                value={form.companyName}
                onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                className="w-full px-4 py-3 rounded-xl bg-zinc-900/80 border border-white/5 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all text-white placeholder:text-zinc-600"
                placeholder={isRTL ? 'شركة النقل السريع' : 'Express Transport Co.'}
                required
              />
            </div>

            <div>
              <label className="text-sm text-zinc-400 mb-1.5 block">
                {isRTL ? 'اسم المدير' : 'Admin Full Name'} *
              </label>
              <input
                type="text"
                value={form.adminName}
                onChange={(e) => setForm({ ...form, adminName: e.target.value })}
                className="w-full px-4 py-3 rounded-xl bg-zinc-900/80 border border-white/5 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all text-white placeholder:text-zinc-600"
                placeholder={isRTL ? 'أحمد محمد' : 'Ahmed Mohamed'}
                required
              />
            </div>

            <div>
              <label className="text-sm text-zinc-400 mb-1.5 block">{isRTL ? 'البريد الإلكتروني' : 'Email'} *</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-4 py-3 rounded-xl bg-zinc-900/80 border border-white/5 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all text-white placeholder:text-zinc-600"
                placeholder="admin@company.com"
                dir="ltr"
                required
              />
            </div>

            <div>
              <label className="text-sm text-zinc-400 mb-1.5 block">
                {isRTL ? 'رقم الهاتف' : 'Phone Number'}
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-4 py-3 rounded-xl bg-zinc-900/80 border border-white/5 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all text-white placeholder:text-zinc-600"
                placeholder="+20 101 234 5678"
                dir="ltr"
              />
            </div>

            <div>
              <label className="text-sm text-zinc-400 mb-1.5 block">{isRTL ? 'كلمة المرور' : 'Password'} *</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl bg-zinc-900/80 border border-white/5 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all text-white placeholder:text-zinc-600 pr-12"
                  placeholder="6+ characters"
                  minLength={6}
                  dir="ltr"
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
              <label className="text-sm text-zinc-400 mb-1.5 block">
                {isRTL ? 'ملاحظات (اختياري)' : 'Notes (Optional)'}
              </label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
                className="w-full px-4 py-3 rounded-xl bg-zinc-900/80 border border-white/5 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all text-white placeholder:text-zinc-600 resize-none"
                placeholder={isRTL ? 'مثال: محتاجين حجز أسبوعي للقاهرة...' : 'e.g., Need weekly bookings to Cairo...'}
              />
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
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 text-white font-semibold transition-all shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2"
            >
              {loading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Building2 size={16} />
              )}
              {isRTL ? 'تسجيل الشركة' : 'Register Company'}
            </motion.button>
          </form>

          <div className="mt-6 text-center text-sm text-zinc-400">
            {isRTL ? 'عندك حساب بالفعل؟' : 'Already have an account?'}{' '}
            <Link href="/login" className="text-blue-400 hover:text-blue-300 transition-colors font-medium">
              {isRTL ? 'تسجيل الدخول' : 'Sign In'}
            </Link>
          </div>

          <div className="mt-3 text-center">
            <Link href="/register" className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition">
              <ArrowLeft size={12} className={isRTL ? 'rotate-180' : undefined} />
              {isRTL ? 'تسجيل كعميل عادي' : 'Register as individual customer'}
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
