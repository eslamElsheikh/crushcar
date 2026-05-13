'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { User, Phone, Mail, Calendar, Save, Loader2, CheckCircle, ArrowLeft, Shield } from 'lucide-react'
import { useLangStore } from '@/lib/lang'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils'

interface Profile {
  id: string
  name: string
  email: string
  phone: string
  role: string
  createdAt: string
}

export default function ProfilePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const lang = useLangStore((s) => s.lang)
  const isRTL = lang === 'ar'

  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '' })
  const [passwordForm, setPasswordForm] = useState({ current: '', newPass: '', confirm: '' })
  const [error, setError] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
    if (status === 'loading') return
    loadProfile()
  }, [status, router])

  async function loadProfile() {
    try {
      const res = await fetch('/api/profile')
      if (res.ok) {
        const data = await res.json()
        setProfile(data)
        setForm({ name: data.name || '', phone: data.phone || '' })
      }
    } catch {
    } finally {
      setLoading(false)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSaved(false)

    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, phone: form.phone }),
      })

      if (res.ok) {
        const data = await res.json()
        setProfile(data)
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      } else {
        const err = await res.json()
        setError(err.error || 'Error saving profile')
      }
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    if (passwordForm.newPass !== passwordForm.confirm) {
      setError(isRTL ? 'كلمة المرور الجديدة غير متطابقة' : 'New passwords do not match')
      return
    }
    if (passwordForm.newPass.length < 6) {
      setError(isRTL ? 'كلمة المرور ٦ أحرف على الأقل' : 'Password must be 6+ characters')
      return
    }

    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          currentPassword: passwordForm.current,
          newPassword: passwordForm.newPass,
        }),
      })

      if (res.ok) {
        setPasswordForm({ current: '', newPass: '', confirm: '' })
        setChangingPassword(false)
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      } else {
        const err = await res.json()
        setError(err.error || 'Error changing password')
      }
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  if (loading || status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className={cn('min-h-screen bg-[#030303]', isRTL && 'font-[Cairo]')} dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Ambient */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="glass border-b border-white/5 relative z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link href="/" className="p-2 rounded-xl glass hover:bg-white/5 border border-white/5 transition">
            <ArrowLeft size={18} />
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
              <User size={18} className="text-white" />
            </div>
            <div>
              <h1 className="font-semibold text-white">
                {isRTL ? 'الملف الشخصي' : 'My Profile'}
              </h1>
              <p className="text-xs text-zinc-500">
                {isRTL ? 'إدارة بياناتك الشخصية' : 'Manage your personal information'}
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="relative z-10 max-w-3xl mx-auto px-6 py-8 space-y-6">
        {/* Profile info card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-3xl p-8 border border-white/5 shadow-2xl"
        >
          {/* Avatar & role */}
          <div className="flex items-center gap-4 mb-8 pb-6 border-b border-white/5">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg shadow-blue-500/30">
              {profile?.name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">{profile?.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={cn(
                  'text-xs px-3 py-1 rounded-full font-medium',
                  profile?.role === 'COMPANY_ADMIN' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                  profile?.role === 'SUPER_ADMIN' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                  'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                )}>
                  {profile?.role === 'COMPANY_ADMIN' ? (isRTL ? 'مدير شركة' : 'Company Admin') :
                   profile?.role === 'SUPER_ADMIN' ? (isRTL ? 'مدير النظام' : 'Super Admin') :
                   (isRTL ? 'عميل' : 'Customer')}
                </span>
              </div>
            </div>
          </div>

          {/* Info fields */}
          <div className="space-y-4 mb-6">
            <div className="flex items-center gap-3 text-sm">
              <Mail size={16} className="text-zinc-500 flex-shrink-0" />
              <span className="text-zinc-500 w-20">{isRTL ? 'البريد' : 'Email'}</span>
              <span className="text-white font-medium">{profile?.email}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Calendar size={16} className="text-zinc-500 flex-shrink-0" />
              <span className="text-zinc-500 w-20">{isRTL ? 'تاريخ التسجيل' : 'Joined'}</span>
              <span className="text-white">{profile?.createdAt ? formatDate(profile.createdAt) : '-'}</span>
            </div>
          </div>

          {/* Saved toast */}
          {saved && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 text-emerald-400 text-sm mb-4"
            >
              <CheckCircle size={16} />
              {isRTL ? 'تم الحفظ بنجاح' : 'Changes saved successfully'}
            </motion.div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-sm text-red-400 mb-4">
              {error}
            </div>
          )}

          {/* Edit form */}
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="text-xs text-zinc-500 mb-2 block uppercase tracking-wider">
                {isRTL ? 'الاسم' : 'Full Name'}
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full bg-zinc-800/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 outline-none transition"
                placeholder={isRTL ? 'اكتب اسمك هنا' : 'Enter your name'}
                required
              />
            </div>

            <div>
              <label className="text-xs text-zinc-500 mb-2 block uppercase tracking-wider">
                <Phone size={12} className="inline mr-1" />
                {isRTL ? 'رقم الموبايل' : 'Phone Number'}
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full bg-zinc-800/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 outline-none transition"
                placeholder={isRTL ? '01xxxxxxxxx' : '01xxxxxxxxx'}
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {saving ? (isRTL ? 'جارِ الحفظ...' : 'Saving...') : (isRTL ? 'حفظ التغييرات' : 'Save Changes')}
            </button>
          </form>
        </motion.div>

        {/* Change password */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass rounded-3xl p-8 border border-white/5 shadow-2xl"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-white/10 flex items-center justify-center">
                <Shield size={18} className="text-zinc-400" />
              </div>
              <div>
                <h3 className="font-semibold text-white">
                  {isRTL ? 'تغيير كلمة المرور' : 'Change Password'}
                </h3>
                <p className="text-xs text-zinc-500">
                  {isRTL ? 'اتركها فارغة إذا مش عايز تغيرها' : 'Leave blank if you don\'t want to change it'}
                </p>
              </div>
            </div>
            <button
              onClick={() => setChangingPassword(!changingPassword)}
              className="text-xs px-4 py-2 rounded-xl glass border border-white/10 text-zinc-400 hover:text-white hover:bg-white/5 transition"
            >
              {changingPassword ? (isRTL ? 'إلغاء' : 'Cancel') : (isRTL ? 'تغيير' : 'Change')}
            </button>
          </div>

          {changingPassword && (
            <form onSubmit={handleChangePassword} className="space-y-4 mt-4">
              <div>
                <label className="text-xs text-zinc-500 mb-2 block">
                  {isRTL ? 'كلمة المرور الحالية' : 'Current Password'}
                </label>
                <input
                  type="password"
                  value={passwordForm.current}
                  onChange={(e) => setPasswordForm({ ...passwordForm, current: e.target.value })}
                  className="w-full bg-zinc-800/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 outline-none transition"
                  placeholder="••••••••"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-zinc-500 mb-2 block">
                    {isRTL ? 'كلمة المرور الجديدة' : 'New Password'}
                  </label>
                  <input
                    type="password"
                    value={passwordForm.newPass}
                    onChange={(e) => setPasswordForm({ ...passwordForm, newPass: e.target.value })}
                    className="w-full bg-zinc-800/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 outline-none transition"
                    placeholder="••••••••"
                    required
                    minLength={6}
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 mb-2 block">
                    {isRTL ? 'تأكيد كلمة المرور' : 'Confirm Password'}
                  </label>
                  <input
                    type="password"
                    value={passwordForm.confirm}
                    onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                    className="w-full bg-zinc-800/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 outline-none transition"
                    placeholder="••••••••"
                    required
                    minLength={6}
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={saving}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Shield size={16} />}
                {saving ? (isRTL ? 'جارِ...' : 'Updating...') : (isRTL ? 'تحديث كلمة المرور' : 'Update Password')}
              </button>
            </form>
          )}
        </motion.div>
      </div>
    </div>
  )
}