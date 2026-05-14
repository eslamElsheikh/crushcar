'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Users, Search, Mail, Phone, Plus, Shield, User, Loader2, X, Check } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { useLangStore } from '@/lib/lang'
import { cn } from '@/lib/utils'

interface AppUser {
  id: string
  name: string
  email: string
  phone: string
  role: string
  companyId: string | null
  createdAt: string
  totalBookings: number
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const t = useLangStore((s) => s.t)
  const lang = useLangStore((s) => s.lang)
  const isRTL = lang === 'ar'

  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'CUSTOMER', phone: '' })

  useEffect(() => {
    loadUsers()
  }, [])

  async function loadUsers() {
    try {
      const res = await fetch('/api/admin/users')
      const data = await res.json()
      if (Array.isArray(data)) setUsers(data)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    setSuccess('')

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Server error')
        return
      }

      setSuccess(isRTL ? `تم إنشاء ${form.role === 'COMPANY_ADMIN' ? 'مدير' : 'عميل'} بنجاح!` : `${form.role === 'COMPANY_ADMIN' ? 'Admin' : 'Customer'} created successfully!`)
      setForm({ name: '', email: '', password: '', role: 'CUSTOMER', phone: '' })
      setShowModal(false)
      loadUsers()
    } catch {
      setError('Server error')
    } finally {
      setSubmitting(false)
    }
  }

  const filtered = users.filter((u) =>
    !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())
  )

  const roleLabel = (role: string) => {
    if (role === 'COMPANY_ADMIN') return isRTL ? 'مدير شركة' : 'Company Admin'
    if (role === 'SUPER_ADMIN') return isRTL ? 'مدير النظام' : 'Super Admin'
    return isRTL ? 'عميل' : 'Customer'
  }

  const roleBadge = (role: string) => {
    if (role === 'COMPANY_ADMIN') return 'bg-purple-500/10 text-purple-400 border-purple-500/20'
    if (role === 'SUPER_ADMIN') return 'bg-red-500/10 text-red-400 border-red-500/20'
    return 'bg-blue-500/10 text-blue-400 border-blue-500/20'
  }

  return (
    <div className={cn('space-y-6', isRTL && 'font-[Cairo]')}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-white">{isRTL ? 'إدارة المستخدمين' : 'User Management'}</h1>
          <p className="text-zinc-400 text-sm mt-1">
            {isRTL ? 'إنشاء وإدارة حسابات المستخدمين' : 'Create and manage user accounts'}
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold transition-all shadow-lg shadow-blue-500/25"
        >
          <Plus size={16} />
          {isRTL ? 'إضافة مستخدم' : 'Add User'}
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={isRTL ? 'ابحث بالاسم أو البريد...' : 'Search by name or email...'}
          className="w-full pl-10 pr-4 py-3 rounded-xl bg-zinc-900/80 border border-white/5 focus:border-blue-500/50 focus:outline-none text-white placeholder:text-zinc-600 text-sm"
          dir="ltr"
        />
      </div>

      {/* Users Table */}
      <div className="glass rounded-2xl border border-white/5 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              <th className={cn('px-5 py-4 text-xs text-zinc-500 uppercase tracking-wider text-right', isRTL && 'text-left')}>{isRTL ? 'الاسم' : 'Name'}</th>
              <th className="px-5 py-4 text-xs text-zinc-500 uppercase tracking-wider">{isRTL ? 'البريد' : 'Email'}</th>
              <th className="px-5 py-4 text-xs text-zinc-500 uppercase tracking-wider">{isRTL ? 'الدور' : 'Role'}</th>
              <th className="px-5 py-4 text-xs text-zinc-500 uppercase tracking-wider">{isRTL ? 'الحجوزات' : 'Bookings'}</th>
              <th className="px-5 py-4 text-xs text-zinc-500 uppercase tracking-wider">{isRTL ? 'تاريخ الإنشاء' : 'Created'}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-5 py-12 text-center text-zinc-500">
                <Loader2 size={20} className="animate-spin mx-auto" />
              </td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-12 text-center text-zinc-500 text-sm">{isRTL ? 'لا يوجد مستخدمين' : 'No users found'}</td></tr>
            ) : (
              filtered.map((user) => (
                <tr key={user.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                  <td className={cn('px-5 py-4', isRTL && 'text-right')}>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
                        {user.role === 'COMPANY_ADMIN' || user.role === 'SUPER_ADMIN'
                          ? <Shield size={16} className="text-blue-400" />
                          : <User size={16} className="text-zinc-400" />}
                      </div>
                      <div>
                        <p className="text-white font-medium text-sm">{user.name}</p>
                        {user.phone && <p className="text-zinc-500 text-xs">{user.phone}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-zinc-400 text-sm" dir="ltr">{user.email}</span>
                  </td>
                  <td className="px-5 py-4">
                    <span className={cn('px-2.5 py-1 rounded-full text-xs font-medium border', roleBadge(user.role))}>
                      {roleLabel(user.role)}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-zinc-400 text-sm">{user.totalBookings}</span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-zinc-500 text-xs">{formatDate(user.createdAt)}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative w-full max-w-md glass rounded-2xl p-6 border border-white/10 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white">{isRTL ? 'إضافة مستخدم جديد' : 'Add New User'}</h2>
              <button onClick={() => setShowModal(false)} className="text-zinc-500 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            {success && (
              <div className="mb-4 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm flex items-center gap-2">
                <Check size={16} />
                {success}
              </div>
            )}

            {error && (
              <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="text-sm text-zinc-400 mb-1.5 block">{isRTL ? 'الاسم الكامل' : 'Full Name'}</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl bg-zinc-900/80 border border-white/5 focus:border-blue-500/50 focus:outline-none text-white text-sm"
                  required
                />
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-1.5 block">{isRTL ? 'البريد الإلكتروني' : 'Email'}</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl bg-zinc-900/80 border border-white/5 focus:border-blue-500/50 focus:outline-none text-white text-sm"
                  dir="ltr"
                  required
                />
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-1.5 block">{isRTL ? 'كلمة المرور' : 'Password'}</label>
                <input
                  type="text"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl bg-zinc-900/80 border border-white/5 focus:border-blue-500/50 focus:outline-none text-white text-sm"
                  minLength={6}
                  required
                />
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-1.5 block">{isRTL ? 'الدور' : 'Role'}</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl bg-zinc-900/80 border border-white/5 focus:outline-none text-white text-sm"
                >
                  <option value="CUSTOMER">{isRTL ? 'عميل' : 'Customer'}</option>
                  <option value="COMPANY_ADMIN">{isRTL ? 'مدير شركة' : 'Company Admin'}</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-1.5 block">{isRTL ? 'رقم الهاتف (اختياري)' : 'Phone (optional)'}</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl bg-zinc-900/80 border border-white/5 focus:border-blue-500/50 focus:outline-none text-white text-sm"
                  dir="ltr"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-sm font-semibold transition-all flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                {isRTL ? 'إنشاء المستخدم' : 'Create User'}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  )
}