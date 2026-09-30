'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Building2, Check, X, Mail, Phone, Clock, Eye } from 'lucide-react'
import { toast } from 'sonner'
import { useLangStore } from '@/lib/lang'

export default function AdminPendingCompanies() {
  const t = useLangStore((s) => s.t)
  const lang = useLangStore((s) => s.lang)
  const isRTL = lang === 'ar'
  const [companies, setCompanies] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<any>(null)
  const [showModal, setShowModal] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    creditLimit: 0,
    paymentMode: 'PREPAID',
    billingCycle: 'MONTHLY',
  })

  const fetchPending = () => {
    setLoading(true)
    setError('')
    fetch('/api/admin/companies/pending', { credentials: 'include' })
      .then(r => {
        if (!r.ok) return r.json().then(d => { throw new Error(d.error || 'Failed') })
        return r.json()
      })
      .then(data => {
        if (Array.isArray(data)) setCompanies(data)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }

  useEffect(() => { fetchPending() }, [])

  const openApprove = (company: any) => {
    setSelected(company)
    setForm({ creditLimit: 0, paymentMode: 'PREPAID', billingCycle: 'MONTHLY' })
    setShowModal(true)
  }

  const handleApprove = async () => {
    const res = await fetch(`/api/admin/companies/${selected.id}/approve`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, action: 'approve' }),
    })
    const data = await res.json()
    if (data.error) { toast.error(data.error) }
    else { toast.success('Company activated'); setShowModal(false); fetchPending() }
  }

  const handleReject = async (id: string, name: string) => {
    if (!confirm(`Reject and delete "${name}"?`)) return
    const res = await fetch(`/api/admin/companies/${id}/approve`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reject' }),
    })
    const data = await res.json()
    if (data.error) { toast.error(data.error) }
    else { toast.success('Company rejected'); fetchPending() }
  }

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-white">
          {isRTL ? 'الشركات المعلقة' : 'Pending Companies'}
        </h1>
        <p className="text-zinc-400 mt-1">
          {companies.length} {isRTL ? 'شركة مستنية مراجعة' : 'companies awaiting review'}
        </p>
      </motion.div>

      {loading ? (
        <div className="flex justify-center py-20">
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
        </div>
      ) : error ? (
        <div className="glass rounded-2xl p-12 text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <p className="text-zinc-500 text-sm">Make sure you are logged in as a SUPER_ADMIN</p>
          <button onClick={fetchPending} className="mt-4 px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white transition text-sm">Retry</button>
        </div>
      ) : companies.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center text-zinc-500">
          <Building2 size={48} className="mx-auto mb-3 opacity-30" />
          <p>{isRTL ? 'مفيش شركات معلقة' : 'No pending companies'}</p>
        </div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {companies.map((company, i) => {
            const admin = company.users?.[0]
            return (
              <motion.div
                key={company.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="glass rounded-2xl p-6 border border-white/5 hover:border-white/10 transition"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
                      <Building2 size={24} className="text-amber-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white">{company.name}</h3>
                      <p className="text-xs text-zinc-500">{company.subdomain}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-zinc-500">
                    <Clock size={12} />
                    {new Date(company.createdAt).toLocaleDateString()}
                  </div>
                </div>

                {admin && (
                  <div className="space-y-2 mb-4 text-sm">
                    <div className="flex items-center gap-2 text-zinc-300">
                      <Eye size={14} className="text-blue-400" />
                      <span>{admin.name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-zinc-300">
                      <Mail size={14} className="text-blue-400" />
                      <span className="text-xs">{admin.email}</span>
                    </div>
                    {admin.phone && (
                      <div className="flex items-center gap-2 text-zinc-300">
                        <Phone size={14} className="text-blue-400" />
                        <span>{admin.phone}</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => openApprove(company)}
                    className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 transition text-sm font-medium"
                  >
                    <Check size={14} /> {isRTL ? 'تفعيل' : 'Approve'}
                  </button>
                  <button
                    onClick={() => handleReject(company.id, company.name)}
                    className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 transition text-sm"
                  >
                    <X size={14} /> {isRTL ? 'رفض' : 'Reject'}
                  </button>
                </div>
              </motion.div>
            )
          })}
        </motion.div>
      )}

      <AnimatePresence>
        {showModal && selected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass rounded-2xl p-6 border border-white/5 w-full max-w-md"
            >
              <h2 className="text-lg font-bold text-white mb-1">
                {isRTL ? 'تفعيل' : 'Activate'}: {selected.name}
              </h2>
              <p className="text-sm text-zinc-400 mb-6">{selected.users?.[0]?.email}</p>

              <div className="space-y-4">
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">{t('company.creditLimit')}</label>
                  <input
                    type="number"
                    value={form.creditLimit}
                    onChange={e => setForm({ ...form, creditLimit: parseFloat(e.target.value) || 0 })}
                    min="0"
                    step="100"
                    className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-blue-500/50 text-sm"
                  />
                </div>

                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">{t('company.paymentMode')}</label>
                  <select
                    value={form.paymentMode}
                    onChange={e => setForm({ ...form, paymentMode: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl bg-zinc-900 border border-white/10 text-white focus:outline-none focus:border-blue-500/50 text-sm [&>option]:bg-zinc-900 [&>option]:text-white"
                  >
                    <option value="PREPAID">{t('company.prepaidMode')}</option>
                    <option value="CREDIT">{t('company.creditMode')}</option>
                    <option value="BOTH">{t('company.bothMode')}</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">{t('company.billingCycle')}</label>
                  <select
                    value={form.billingCycle}
                    onChange={e => setForm({ ...form, billingCycle: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl bg-zinc-900 border border-white/10 text-white focus:outline-none focus:border-blue-500/50 text-sm [&>option]:bg-zinc-900 [&>option]:text-white"
                  >
                    <option value="MONTHLY">{t('company.monthly')}</option>
                    <option value="WEEKLY">{t('company.weekly')}</option>
                  </select>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setShowModal(false)}
                    className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 transition text-sm"
                  >
                    {isRTL ? 'إلغاء' : 'Cancel'}
                  </button>
                  <button
                    onClick={handleApprove}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white transition text-sm font-medium"
                  >
                    <Check size={16} /> {isRTL ? 'تفعيل' : 'Activate'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
