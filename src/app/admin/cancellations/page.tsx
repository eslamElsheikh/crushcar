'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { XCircle, CheckCircle, Clock, MapPin, User, Ticket, Building2 } from 'lucide-react'
import { toast } from 'sonner'
import { useLangStore } from '@/lib/lang'
import { cn } from '@/lib/utils'

type BookType = 'customer' | 'company'
type Tier = 'fullRefund' | 'partial50' | 'partial25' | 'noRefund'

const tierConfig: Record<Tier, { label: { ar: string; en: string }; color: string }> = {
  fullRefund: { label: { ar: 'استرداد كامل (> 24 ساعة)', en: 'Full Refund (> 24h)' }, color: 'border-emerald-500/20 bg-emerald-500/5' },
  partial50: { label: { ar: 'استرداد 50% (12-24 ساعة)', en: '50% Refund (12-24h)' }, color: 'border-amber-500/20 bg-amber-500/5' },
  partial25: { label: { ar: 'استرداد 25% (4-12 ساعة)', en: '25% Refund (4-12h)' }, color: 'border-orange-500/20 bg-orange-500/5' },
  noRefund: { label: { ar: 'لا استرداد (< 4 ساعة)', en: 'No Refund (< 4h)' }, color: 'border-red-500/20 bg-red-500/5' },
}

export default function AdminCancellationsPage() {
  const t = useLangStore((s) => s.t)
  const lang = useLangStore((s) => s.lang)
  const isRTL = lang === 'ar'
  const [type, setType] = useState<BookType>('customer')
  const [data, setData] = useState<{ total: number; tiers: Record<Tier, any[]> } | null>(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/admin/cancellations?type=${type}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => toast.error('Failed to load'))
      .finally(() => setLoading(false))
  }, [type])

  const processRefund = async (id: string) => {
    setProcessing(id)
    try {
      const res = await fetch(`/api/admin/cancellations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      })
      if (res.ok) {
        toast.success(isRTL ? 'تم صرف المبلغ' : 'Refund processed')
        setData(prev => {
          if (!prev) return prev
          const tiers = { ...prev.tiers }
          for (const key of Object.keys(tiers) as Tier[]) {
            tiers[key] = tiers[key].filter((b: any) => b.id !== id)
          }
          return { ...prev, tiers, total: prev.total - 1 }
        })
      } else {
        const err = await res.json()
        toast.error(err.error || 'Error')
      }
    } catch {
      toast.error('Server error')
    } finally {
      setProcessing(null)
    }
  }

  return (
    <div className={cn(isRTL && 'font-[Cairo]')}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {isRTL ? 'الإلغاءات' : 'Cancellations'}
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            {data ? `${data.total} ${isRTL ? 'في انتظار المعالجة' : 'pending'}` : ''}
          </p>
        </div>
        <div className="flex gap-2 p-1 rounded-xl bg-zinc-800/50 border border-zinc-700/50">
          <button
            onClick={() => setType('customer')}
            className={cn('px-4 py-2 rounded-lg text-sm font-medium transition', type === 'customer' ? 'bg-blue-500 text-white' : 'text-zinc-400 hover:text-white')}
          >
            {isRTL ? 'العملاء' : 'Customers'}
          </button>
          <button
            onClick={() => setType('company')}
            className={cn('px-4 py-2 rounded-lg text-sm font-medium transition', type === 'company' ? 'bg-blue-500 text-white' : 'text-zinc-400 hover:text-white')}
          >
            {isRTL ? 'الشركات' : 'Companies'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : data && data.total > 0 ? (
        <div className="space-y-8">
          {(Object.entries(tierConfig) as [Tier, typeof tierConfig[Tier]][]).map(([key, cfg]) => {
            const items = data.tiers[key] || []
            if (items.length === 0) return null
            return (
              <motion.div key={key} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                <h2 className={cn('text-sm font-semibold uppercase tracking-wider mb-4 flex items-center gap-2', cfg.color.split(' ')[1]?.replace('bg-', 'text-') || 'text-zinc-400')}>
                  <Clock size={14} />
                  {cfg.label[lang]} ({items.length})
                </h2>
                <div className="space-y-3">
                  {items.map((item: any) => (
                    <div key={item.id} className={cn('glass rounded-2xl p-5 border', cfg.color)}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0 space-y-3">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-bold text-blue-400 bg-blue-500/5 px-2.5 py-1 rounded-lg border border-blue-500/10">
                              {item.reference}
                            </span>
                            {type === 'company' && item.company && (
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                <Building2 size={10} />
                                {item.company.name}
                              </span>
                            )}
                            {type === 'customer' && (
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                <User size={10} />
                                {item.user?.name || '-'}
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-400">
                            <span className="flex items-center gap-1">
                              <MapPin size={13} className="text-blue-400" />
                              {item.trip.origin} → {item.trip.destination}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock size={13} className="text-amber-400" />
                              {new Date(item.trip.departure).toLocaleString()}
                            </span>
                            <span className="font-mono text-xs bg-zinc-800 px-2 py-0.5 rounded text-zinc-300">
                              {item.seatLabel}
                            </span>
                            <span className="flex items-center gap-1 text-emerald-400">
                              <User size={13} />
                              {item.passengerName || '-'}
                            </span>
                          </div>

                          {item.cancellationReason && (
                            <p className="text-xs text-zinc-500 italic">
                              {isRTL ? 'السبب' : 'Reason'}: {item.cancellationReason}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-col items-end gap-2 flex-shrink-0">
                          <div className="text-right">
                            <p className="text-lg font-bold text-white">{item.total.toFixed(2)} EGP</p>
                            {item.refundAmount > 0 && (
                              <p className="text-xs text-emerald-400">
                                {isRTL ? 'الاسترداد' : 'Refund'}: {item.refundAmount.toFixed(2)} EGP
                              </p>
                            )}
                            {item.cancellationFee > 0 && (
                              <p className="text-xs text-red-400">
                                {isRTL ? 'الرسوم' : 'Fee'}: {item.cancellationFee.toFixed(2)} EGP
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => processRefund(item.id)}
                            disabled={processing === item.id}
                            className={cn(
                              'inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium transition',
                              'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/30',
                              processing === item.id && 'opacity-50'
                            )}
                          >
                            <CheckCircle size={14} />
                            {processing === item.id
                              ? (isRTL ? 'جارٍ...' : 'Processing...')
                              : (isRTL ? 'تم الدفع' : 'Process Refund')}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )
          })}
        </div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-20 glass rounded-2xl border border-zinc-800">
          <CheckCircle size={48} className="mx-auto text-zinc-700 mb-4" />
          <h3 className="text-lg font-medium text-zinc-400 mb-2">
            {isRTL ? 'كل الإلغاءات تمت معالجتها' : 'All cancellations processed'}
          </h3>
          <p className="text-zinc-500 text-sm">
            {isRTL ? 'لا توجد إلغاءات في انتظار المعالجة' : 'No pending cancellations'}
          </p>
        </motion.div>
      )}
    </div>
  )
}
