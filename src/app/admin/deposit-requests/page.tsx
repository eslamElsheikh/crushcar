'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Wallet, Building2, Calendar, CheckCircle, XCircle, Clock, X } from 'lucide-react'
import { useLangStore } from '@/lib/lang'

interface DepositRequest {
  id: string
  company: { id: string; name: string }
  amount: number
  status: string
  adminNotes: string
  createdAt: string
}

export default function AdminDepositRequests() {
  const t = useLangStore((s) => s.t)
  const lang = useLangStore((s) => s.lang)
  const isRTL = lang === 'ar'

  const [requests, setRequests] = useState<DepositRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('PENDING')
  const [processing, setProcessing] = useState<string | null>(null)
  const [rejectModal, setRejectModal] = useState<DepositRequest | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  useEffect(() => { loadRequests() }, [filter])

  async function loadRequests() {
    setLoading(true)
    const res = await fetch(`/api/admin/deposit-requests?status=${filter}`, { credentials: 'include' })
    const json = await res.json()
    setRequests(json.data || [])
    setLoading(false)
  }

  async function handleApprove(req: DepositRequest) {
    setProcessing(req.id)
    const res = await fetch(`/api/admin/deposit-requests/${req.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status: 'APPROVED' }),
    })
    setProcessing(null)
    if (res.ok) {
      setRequests(prev => prev.filter(r => r.id !== req.id))
    }
  }

  async function handleReject() {
    if (!rejectModal || !rejectReason.trim()) return
    setProcessing(rejectModal.id)
    const res = await fetch(`/api/admin/deposit-requests/${rejectModal.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status: 'REJECTED', adminNotes: rejectReason }),
    })
    setProcessing(null)
    setRejectModal(null)
    setRejectReason('')
    if (res.ok) {
      setRequests(prev => prev.filter(r => r.id !== rejectModal.id))
    }
  }

  const tabs = [
    { key: 'PENDING', label: t('depositRequest.pending') },
    { key: 'APPROVED', label: t('depositRequest.approved') },
    { key: 'REJECTED', label: t('depositRequest.rejected') },
  ]

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-white">{t('admin.depositRequests')}</h1>
        <p className="text-sm text-zinc-500 mt-1">{t('depositRequest.title')}</p>
      </div>

      <div className="flex gap-2">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
              filter === tab.key
                ? 'bg-blue-500/15 text-blue-400 border border-blue-500/20'
                : 'bg-white/5 text-zinc-400 hover:text-white border border-transparent'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-20 text-zinc-500">{t('common.loading')}</div>
      ) : requests.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-zinc-500">{t('depositRequest.noRequests')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <motion.div
              key={req.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass rounded-2xl p-5 border border-white/5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-2 text-white text-sm">
                      <Building2 size={14} className="text-blue-400" />
                      <span className="font-medium">{req.company.name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-white text-sm">
                      <Wallet size={14} className="text-emerald-400" />
                      <span className="font-semibold">{req.amount.toFixed(2)} EGP</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-zinc-500">
                    <span className="flex items-center gap-1">
                      <Calendar size={12} />
                      {new Date(req.createdAt).toLocaleDateString(isRTL ? 'ar-EG' : 'en-US')}
                    </span>
                  </div>
                  {req.adminNotes && (
                    <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                      <p className="text-xs text-zinc-400 mb-1">{t('depositRequest.adminNotes')}</p>
                      <p className="text-sm text-zinc-300">{req.adminNotes}</p>
                    </div>
                  )}
                </div>

                {filter === 'PENDING' && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleApprove(req)}
                      disabled={processing === req.id}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-sm font-medium transition disabled:opacity-50"
                    >
                      <CheckCircle size={16} />
                      {t('depositRequest.approve')}
                    </button>
                    <button
                      onClick={() => { setRejectModal(req); setRejectReason('') }}
                      disabled={processing === req.id}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-sm font-medium transition disabled:opacity-50"
                    >
                      <XCircle size={16} />
                      {t('depositRequest.reject')}
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {rejectModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setRejectModal(null)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass rounded-2xl p-6 border border-white/5 max-w-md w-full mx-4"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-white mb-4">{t('depositRequest.reject')}</h3>
              <p className="text-sm text-zinc-400 mb-4">{t('depositRequest.reason')}</p>
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                rows={3}
                className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-blue-500/50 text-sm resize-none mb-4"
                placeholder={t('depositRequest.adminNotes')}
              />
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setRejectModal(null)}
                  className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 text-sm transition"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleReject}
                  disabled={!rejectReason.trim() || processing === rejectModal.id}
                  className="px-6 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-medium transition disabled:opacity-50"
                >
                  {t('depositRequest.reject')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
