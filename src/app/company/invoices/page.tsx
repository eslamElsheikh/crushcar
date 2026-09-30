'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { FileText } from 'lucide-react'
import { useLangStore } from '@/lib/lang'

export default function CompanyInvoices() {
  const t = useLangStore((s) => s.t)
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')

  useEffect(() => {
    const params = new URLSearchParams({ page: '1', take: '50' })
    if (status) params.set('status', status)
    fetch(`/api/company/invoices?${params}`)
      .then(r => r.json())
      .then(data => { setInvoices(data.data || []); setLoading(false) })
  }, [status])

  const statusColors: Record<string, string> = {
    PENDING: 'bg-amber-500/20 text-amber-400 border-amber-500/20',
    PARTIAL: 'bg-blue-500/20 text-blue-400 border-blue-500/20',
    PAID: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/20',
    OVERDUE: 'bg-red-500/20 text-red-400 border-red-500/20',
  }

  const statusLabels: Record<string, string> = {
    PENDING: t('company.invoicePending'),
    PARTIAL: t('company.invoicePartial'),
    PAID: t('company.invoicePaidStatus'),
    OVERDUE: t('company.invoiceOverdue'),
  }

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">{t('company.invoices')}</h1>
        <select value={status} onChange={e => setStatus(e.target.value)} className="px-4 py-2 rounded-xl bg-zinc-900 border border-white/10 text-white text-sm [&>option]:bg-zinc-900 [&>option]:text-white">
          <option value="">All</option>
          <option value="PENDING">Pending</option>
          <option value="PARTIAL">Partial</option>
          <option value="PAID">Paid</option>
          <option value="OVERDUE">Overdue</option>
        </select>
      </motion.div>

      {loading ? (
        <div className="flex justify-center py-20"><motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" /></div>
      ) : invoices.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center text-zinc-500">
          <FileText size={48} className="mx-auto mb-3 opacity-30" />
          <p>{t('company.noInvoices')}</p>
        </div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {invoices.map((inv) => (
            <div key={inv.id} className="glass rounded-2xl p-6 border border-white/5 hover:border-white/10 transition">
              <div className="flex items-center justify-between mb-4">
                <span className={`px-2 py-1 rounded-lg text-xs border ${statusColors[inv.status]}`}>
                  {statusLabels[inv.status]}
                </span>
                <span className="text-xs text-zinc-500">
                  {new Date(inv.periodStart).toLocaleDateString()} - {new Date(inv.periodEnd).toLocaleDateString()}
                </span>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">{t('company.invoiceTotal')}</span>
                  <span className="text-white font-semibold">{inv.totalAmount.toFixed(2)} EGP</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">{t('company.invoicePaid')}</span>
                  <span className="text-emerald-400">{inv.paidAmount.toFixed(2)} EGP</span>
                </div>
                {inv.totalAmount > inv.paidAmount && (
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">{t('company.invoiceRemaining')}</span>
                    <span className="text-red-400">{(inv.totalAmount - inv.paidAmount).toFixed(2)} EGP</span>
                  </div>
                )}
                <div className="flex items-center justify-between pt-2 border-t border-white/5">
                  <span className="text-zinc-500">{t('company.dueDate')}</span>
                  <span className={`font-medium ${new Date(inv.dueDate) < new Date() && inv.status !== 'PAID' ? 'text-red-400' : 'text-zinc-300'}`}>
                    {new Date(inv.dueDate).toLocaleDateString()}
                  </span>
                </div>
              </div>

              {inv.notes && (
                <p className="text-xs text-zinc-500 mt-4 pt-4 border-t border-white/5">{inv.notes}</p>
              )}
            </div>
          ))}
        </motion.div>
      )}
    </div>
  )
}
