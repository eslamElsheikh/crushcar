'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CreditCard, Wallet, TrendingUp, ArrowUpRight, Plus, Clock, CheckCircle, XCircle, X } from 'lucide-react'
import { toast } from 'sonner'
import { useLangStore } from '@/lib/lang'

interface DepositRequest {
  id: string
  amount: number
  status: string
  adminNotes: string
  createdAt: string
}

export default function CompanyCredit() {
  const t = useLangStore((s) => s.t)
  const lang = useLangStore((s) => s.lang)
  const isRTL = lang === 'ar'
  const [creditStatus, setCreditStatus] = useState<any>(null)
  const [transactions, setTransactions] = useState<any[]>([])
  const [depositRequests, setDepositRequests] = useState<DepositRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [showDeposit, setShowDeposit] = useState(false)
  const [depositAmount, setDepositAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fetchData = () => {
    Promise.all([
      fetch('/api/company/credit').then(r => r.json()),
      fetch('/api/company/wallet?page=1&take=20').then(r => r.json()),
      fetch('/api/company/deposit-requests').then(r => r.json()),
    ]).then(([credit, txns, reqs]) => {
      setCreditStatus(credit)
      setTransactions(txns.data || [])
      setDepositRequests(reqs.data || [])
      setLoading(false)
    })
  }

  useEffect(() => { fetchData() }, [])

  const handleDepositRequest = async () => {
    const amount = parseFloat(depositAmount)
    if (!amount || amount <= 0) { toast.error('Invalid amount'); return }
    setSubmitting(true)
    const res = await fetch('/api/company/deposit-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount }),
    })
    const data = await res.json()
    setSubmitting(false)
    if (data.error) { toast.error(data.error) }
    else {
      toast.success(t('depositRequest.success'))
      setShowDeposit(false)
      setDepositAmount('')
      fetchData()
    }
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case 'APPROVED': return <CheckCircle size={16} className="text-emerald-400" />
      case 'REJECTED': return <XCircle size={16} className="text-red-400" />
      default: return <Clock size={16} className="text-amber-400" />
    }
  }

  const statusClass = (status: string) => {
    switch (status) {
      case 'APPROVED': return 'bg-emerald-500/10 text-emerald-400'
      case 'REJECTED': return 'bg-red-500/10 text-red-400'
      default: return 'bg-amber-500/10 text-amber-400'
    }
  }

  if (loading) return <div className="flex justify-center py-20"><motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" /></div>
  if (!creditStatus) return null

  const usagePercent = creditStatus.company.creditLimit > 0
    ? Math.round((creditStatus.outstandingBalance / creditStatus.company.creditLimit) * 100)
    : 0

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">{t('company.credit')}</h1>
        <button onClick={() => setShowDeposit(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white transition text-sm">
          <Plus size={16} /> {t('company.deposit')}
        </button>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: t('company.walletBalance'), value: `${creditStatus.walletBalance.toFixed(2)} EGP`, icon: Wallet, color: 'from-emerald-500/20 to-emerald-500/5', borderColor: 'border-emerald-500/20', iconColor: 'text-emerald-400' },
          { label: t('company.creditLimit'), value: `${creditStatus.company.creditLimit.toFixed(2)} EGP`, icon: CreditCard, color: 'from-blue-500/20 to-blue-500/5', borderColor: 'border-blue-500/20', iconColor: 'text-blue-400' },
          { label: t('company.outstanding'), value: `${creditStatus.outstandingBalance.toFixed(2)} EGP`, icon: TrendingUp, color: 'from-amber-500/20 to-amber-500/5', borderColor: 'border-amber-500/20', iconColor: 'text-amber-400' },
          { label: t('company.availableCredit'), value: `${creditStatus.availableCredit.toFixed(2)} EGP`, icon: ArrowUpRight, color: 'from-purple-500/20 to-purple-500/5', borderColor: 'border-purple-500/20', iconColor: 'text-purple-400' },
        ].map((card, i) => (
          <motion.div key={card.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} className={`glass rounded-2xl p-6 bg-gradient-to-br ${card.color} ${card.borderColor} border`}>
            <card.icon size={24} className={card.iconColor} />
            <p className="text-2xl font-bold text-white mt-4">{card.value}</p>
            <p className="text-sm text-zinc-400 mt-1">{card.label}</p>
          </motion.div>
        ))}
      </div>

      {creditStatus.company.creditLimit > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="glass rounded-2xl p-6 border border-white/5">
          <h3 className="text-lg font-bold text-white mb-4">Credit Usage</h3>
          <div className="w-full h-4 rounded-full bg-white/10 overflow-hidden">
            <div className={`h-full rounded-full transition-all ${usagePercent > 80 ? 'bg-red-500' : usagePercent > 50 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${usagePercent}%` }} />
          </div>
          <p className="text-sm text-zinc-400 mt-2">{usagePercent}% of {creditStatus.company.creditLimit.toFixed(2)} EGP used</p>
        </motion.div>
      )}

      {depositRequests.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }} className="glass rounded-2xl border border-white/5 overflow-hidden">
          <div className="p-6 border-b border-white/5">
            <h3 className="text-lg font-bold text-white">{t('admin.depositRequests')}</h3>
          </div>
          <div className="divide-y divide-white/5">
            {depositRequests.map((req) => (
              <div key={req.id} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusClass(req.status)}`}>
                    {statusIcon(req.status)}
                    {req.status === 'APPROVED' ? t('depositRequest.approved') : req.status === 'REJECTED' ? t('depositRequest.rejected') : t('depositRequest.pending')}
                  </span>
                  <div>
                    <p className="text-white text-sm font-semibold">{req.amount.toFixed(2)} EGP</p>
                    <p className="text-xs text-zinc-500">{new Date(req.createdAt).toLocaleDateString(isRTL ? 'ar-EG' : 'en-US')}</p>
                  </div>
                </div>
                {req.adminNotes && (
                  <p className="text-xs text-zinc-500 max-w-[200px] text-right">{req.adminNotes}</p>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      )}

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="glass rounded-2xl border border-white/5 overflow-hidden">
        <div className="p-6 border-b border-white/5">
          <h3 className="text-lg font-bold text-white">{t('company.transactionHistory')}</h3>
        </div>
        {transactions.length === 0 ? (
          <div className="text-center py-12 text-zinc-500"><p>{t('company.noTransactions')}</p></div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-right px-4 py-3 text-zinc-400 font-medium">Type</th>
                <th className="text-right px-4 py-3 text-zinc-400 font-medium">Amount</th>
                <th className="text-right px-4 py-3 text-zinc-400 font-medium">Description</th>
                <th className="text-right px-4 py-3 text-zinc-400 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id} className="border-b border-white/5 hover:bg-white/5 transition">
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-lg text-xs ${
                      tx.type === 'DEPOSIT' ? 'bg-emerald-500/20 text-emerald-400' :
                      tx.type === 'BOOKING_CHARGE' ? 'bg-red-500/20 text-red-400' :
                      tx.type === 'REFUND' ? 'bg-blue-500/20 text-blue-400' :
                      'bg-zinc-500/20 text-zinc-400'
                    }`}>
                      {tx.type === 'DEPOSIT' ? t('company.depositType') :
                       tx.type === 'BOOKING_CHARGE' ? t('company.chargeType') :
                       tx.type === 'REFUND' ? t('company.refundType') :
                       t('company.adjustmentType')}
                    </span>
                  </td>
                  <td className={`px-4 py-3 font-semibold ${tx.amount > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {tx.amount > 0 ? '+' : ''}{tx.amount.toFixed(2)} EGP
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{tx.description}</td>
                  <td className="px-4 py-3 text-zinc-400 text-xs">{new Date(tx.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </motion.div>

      <AnimatePresence>
        {showDeposit && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="glass rounded-2xl p-6 border border-white/5 w-full max-w-md">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-white">{t('depositRequest.title')}</h2>
                <button onClick={() => setShowDeposit(false)} className="p-1 rounded-lg hover:bg-white/5 transition">
                  <X size={18} className="text-zinc-400" />
                </button>
              </div>
              <p className="text-sm text-zinc-500 mb-4">{t('depositRequest.confirmDeposit')}</p>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">{t('depositRequest.amount')}</label>
                  <input type="number" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} placeholder="Enter amount" min="0" step="0.01" className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/50 text-sm" />
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setShowDeposit(false)} className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 transition text-sm">{t('common.cancel')}</button>
                  <button onClick={handleDepositRequest} disabled={submitting} className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white transition text-sm font-medium disabled:opacity-50">
                    {submitting ? '...' : t('depositRequest.submit')}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
