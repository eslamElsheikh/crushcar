'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Ticket, MapPin, Clock, User, Phone, Printer, Pencil, X, AlertCircle, CheckCircle, CreditCard } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { useLangStore } from '@/lib/lang'
import { cn } from '@/lib/utils'

export default function CompanyBookingDetail() {
  const params = useParams()
  const router = useRouter()
  const t = useLangStore((s) => s.t)
  const lang = useLangStore((s) => s.lang)
  const isRTL = lang === 'ar'
  const [booking, setBooking] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editHotel, setEditHotel] = useState('')
  const [companyInfo, setCompanyInfo] = useState<{ walletBalance: number; creditLimit: number; outstandingBalance: number; paymentMode: string } | null>(null)

  // Cancel modal state
  const [cancelModal, setCancelModal] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelInfo, setCancelInfo] = useState<{ refundAmount: number; cancellationFee: number; refundPercent: number; canCancel: boolean } | null>(null)
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    fetch(`/api/company/bookings/${params.id}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { toast.error(data.error); router.push('/company/bookings') }
        else {
          setBooking(data)
          setLoading(false)
          if (data.status === 'PENDING') {
            fetch('/api/company/credit')
              .then(r => r.json())
              .then(ci => setCompanyInfo(ci))
              .catch(() => {})
          }
        }
      })
  }, [params.id])

  const updateStatus = async (status: string, extra?: Record<string, unknown>) => {
    const res = await fetch(`/api/company/bookings/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, ...extra }),
    })
    const data = await res.json()
    if (data.error) {
      if (data.error === 'INSUFFICIENT_WALLET') {
        toast.error(isRTL ? 'رصيد المحفظة غير كافي لتأكيد الدفع' : 'Insufficient wallet balance')
      } else if (data.error === 'CREDIT_LIMIT_EXCEEDED') {
        toast.error(isRTL ? 'تم تجاوز حد الكريديت، يرجى السداد أولاً' : 'Credit limit exceeded, please pay first')
      } else {
        toast.error(data.message || data.error)
      }
    } else {
      toast.success(isRTL ? 'تم تحديث الحالة' : 'Updated')
      setBooking(data)
      setCompanyInfo(prev => prev ? {
        ...prev,
        walletBalance: data.walletBalance ?? prev.walletBalance,
        outstandingBalance: data.outstandingBalance ?? prev.outstandingBalance,
      } : null)
    }
  }

  const handleCancelClick = async () => {
    if (!booking) return
    const departureTime = new Date(booking.trip.departure)
    const bookingTime = new Date(booking.createdAt)

    try {
      const policyRes = await fetch('/api/cancellation-policy')
      if (policyRes.ok) {
        const policy = await policyRes.json()
        const now = new Date()
        const hoursSinceBooking = (now.getTime() - bookingTime.getTime()) / (1000 * 60 * 60)
        const hoursUntilDeparture = (departureTime.getTime() - now.getTime()) / (1000 * 60 * 60)

        let refundPercent = 0
        if (hoursSinceBooking < policy.freeWindowMinutes / 60) {
          refundPercent = 100
        } else if (hoursUntilDeparture > 24) {
          refundPercent = 100
        } else if (hoursUntilDeparture > 12) {
          refundPercent = 50
        } else if (hoursUntilDeparture > 4) {
          refundPercent = 25
        }

        const refundAmount = Math.round((booking.total * refundPercent / 100) * 100) / 100
        const cancellationFee = Math.round((booking.total - refundAmount) * 100) / 100
        setCancelInfo({ refundAmount, cancellationFee, refundPercent, canCancel: hoursUntilDeparture > 0 })
      }
    } catch {
      setCancelInfo({ refundAmount: 0, cancellationFee: booking.total, refundPercent: 0, canCancel: false })
    }

    setCancelReason('')
    setCancelModal(true)
  }

  const confirmCancel = async () => {
    setCancelling(true)
    setCancelModal(false)
    await updateStatus('CANCELLED', { reason: cancelReason })
    setCancelling(false)
  }

  const startEditing = () => {
    setEditName(booking.passengerName || '')
    setEditPhone(booking.passengerPhone || '')
    setEditHotel(booking.passengerHotel || '')
    setEditing(true)
  }

  const saveEdit = async () => {
    const res = await fetch(`/api/company/bookings/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'UPDATE', passengerName: editName, passengerPhone: editPhone, passengerHotel: editHotel }),
    })
    const data = await res.json()
    if (data.error) {
      toast.error(data.message || data.error)
    } else {
      toast.success(isRTL ? 'تم التعديل' : 'Updated')
      setBooking((prev: any) => ({ ...prev, passengerName: editName, passengerPhone: editPhone, passengerHotel: editHotel }))
      setEditing(false)
    }
  }

  if (loading) return <div className="flex justify-center py-20"><motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" /></div>
  if (!booking) return null

  const statusColors: Record<string, string> = {
    PENDING: 'bg-amber-500/20 text-amber-400',
    PAID: 'bg-emerald-500/20 text-emerald-400',
    CANCELLED: 'bg-red-500/20 text-red-400',
    BOARDED: 'bg-blue-500/20 text-blue-400',
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/company/bookings" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white transition text-sm">
          <ArrowLeft size={16} /> {isRTL ? 'عودة' : 'Back to bookings'}
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href={`/company/bookings/${booking.id}/print`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm hover:bg-blue-500/20 transition"
          >
            <Printer size={14} /> {isRTL ? 'طباعة' : 'Print'}
          </Link>
          <button onClick={startEditing} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-700/50 border border-zinc-600/50 text-zinc-300 text-sm hover:bg-zinc-700 transition">
            <Pencil size={14} /> {isRTL ? 'تعديل' : 'Edit'}
          </button>
        </div>
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl p-6 border border-white/5">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">{booking.reference}</h1>
            <p className="text-zinc-400 text-sm mt-1">
              {booking.bookingType === 'FOR_CLIENT' ? t('company.forClient') : t('company.forEmployee')}
            </p>
          </div>
          <span className={`px-3 py-1.5 rounded-lg text-sm font-medium ${statusColors[booking.status]}`}>
            {t(`booking.${booking.status.toLowerCase()}`) || booking.status}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-zinc-300">
              <MapPin size={18} className="text-blue-400" />
              <div>
                <p className="text-xs text-zinc-500">{isRTL ? 'من' : 'From'}</p>
                <p>{booking.actualOrigin || booking.trip?.origin}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-zinc-300">
              <MapPin size={18} className="text-red-400" />
              <div>
                <p className="text-xs text-zinc-500">{isRTL ? 'إلى' : 'To'}</p>
                <p>{booking.actualDestination || booking.trip?.destination}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-zinc-300">
              <Clock size={18} className="text-amber-400" />
              <div>
                <p className="text-xs text-zinc-500">{isRTL ? 'الانطلاق' : 'Departure'}</p>
                <p>{booking.trip?.departure ? new Date(booking.trip.departure).toLocaleString() : '-'}</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3 text-zinc-300">
              <Ticket size={18} className="text-purple-400" />
              <div>
                <p className="text-xs text-zinc-500">{isRTL ? 'المقعد' : 'Seat'}</p>
                <p className="font-semibold">{booking.seatLabel}</p>
              </div>
            </div>
            {editing ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder={isRTL ? 'اسم المسافر' : 'Passenger name'}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-800/60 border border-white/10 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-blue-500/50"
                />
                <input
                  type="tel"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder={isRTL ? 'رقم التليفون' : 'Phone'}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-800/60 border border-white/10 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-blue-500/50"
                />
                <input
                  type="text"
                  value={editHotel}
                  onChange={(e) => setEditHotel(e.target.value)}
                  placeholder={isRTL ? 'اسم الفندق' : 'Hotel name'}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-800/60 border border-white/10 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-blue-500/50"
                />
                <div className="flex gap-2 pt-1">
                  <button onClick={saveEdit} className="px-4 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium transition">{isRTL ? 'حفظ' : 'Save'}</button>
                  <button onClick={() => setEditing(false)} className="px-4 py-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs transition">{isRTL ? 'إلغاء' : 'Cancel'}</button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 text-zinc-300">
                  <User size={18} className="text-emerald-400" />
                  <div>
                    <p className="text-xs text-zinc-500">{isRTL ? 'المسافر' : 'Passenger'}</p>
                    <p>{booking.passengerName || '-'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-zinc-300">
                  <Phone size={18} className="text-cyan-400" />
                  <div>
                    <p className="text-xs text-zinc-500">{isRTL ? 'التليفون' : 'Phone'}</p>
                    <p>{booking.passengerPhone || '-'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-zinc-300">
                  <MapPin size={18} className="text-amber-400" />
                  <div>
                    <p className="text-xs text-zinc-500">{isRTL ? 'الفندق' : 'Hotel'}</p>
                    <p>{booking.passengerHotel || '-'}</p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-white/5">
          <div className="flex items-center justify-between">
            <span className="text-zinc-400">{isRTL ? 'الإجمالي' : 'Total'}</span>
            <span className="text-2xl font-bold text-white">{(booking.total || 0).toFixed(2)} EGP</span>
          </div>
          {(booking.paidFromWallet || 0) > 0 && (
            <div className="flex items-center justify-between mt-2 text-sm">
              <span className="text-zinc-500">{t('company.paidFromWallet')}</span>
              <span className="text-emerald-400">{(booking.paidFromWallet || 0).toFixed(2)} EGP</span>
            </div>
          )}
          {(booking.paidOnCredit || 0) > 0 && (
            <div className="flex items-center justify-between mt-1 text-sm">
              <span className="text-zinc-500">{t('company.paidOnCredit')}</span>
              <span className="text-blue-400">{(booking.paidOnCredit || 0).toFixed(2)} EGP</span>
            </div>
          )}
        </div>

        {booking.status === 'PENDING' && (
          <>
            {companyInfo && (
              <div className="mt-6 p-4 rounded-xl bg-zinc-800/50 border border-zinc-700/50 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-zinc-400">{isRTL ? 'المحفظة' : 'Wallet'}</span>
                  <span className={(companyInfo.walletBalance || 0) >= (booking.total || 0) ? 'text-emerald-400' : 'text-red-400'}>
                    {(companyInfo.walletBalance || 0).toFixed(2)} EGP
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">{isRTL ? 'المديونية' : 'Outstanding'}</span>
                  <span className="text-amber-400">{(companyInfo.outstandingBalance || 0).toFixed(2)} EGP</span>
                </div>
                {companyInfo.paymentMode !== 'PREPAID' && (
                  <div className="flex justify-between">
                    <span className="text-zinc-400">{isRTL ? 'حد الكريديت' : 'Credit Limit'}</span>
                    <span className="text-blue-400">{(companyInfo.creditLimit || 0).toFixed(2)} EGP</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-zinc-700/50 font-semibold">
                  <span className="text-zinc-300">{isRTL ? 'المطلوب' : 'Required'}</span>
                  <span className="text-white">{(booking.total || 0).toFixed(2)} EGP</span>
                </div>
              </div>
            )}
            <div className="mt-4 flex gap-3">
              <button onClick={() => updateStatus('PAID')} className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white transition text-sm font-medium">
                {isRTL ? 'تأكيد الدفع' : 'Confirm Payment'}
              </button>
              <button onClick={() => updateStatus('CANCELLED')} className="px-4 py-2.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 transition text-sm">
                {isRTL ? 'إلغاء' : 'Cancel'}
              </button>
            </div>
          </>
        )}

        {booking.status === 'PAID' && new Date(booking.trip?.departure) > new Date() && (
          <div className="mt-4">
            <button
              onClick={handleCancelClick}
              disabled={cancelling}
              className="w-full py-2.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 transition text-sm font-medium disabled:opacity-50"
            >
              {cancelling ? (isRTL ? 'جارٍ...' : 'Cancelling...') : (isRTL ? 'إلغاء الحجز' : 'Cancel Booking')}
            </button>
          </div>
        )}

        {/* Cancellation info for cancelled bookings */}
        {booking.status === 'CANCELLED' && (booking.cancelledAt || booking.refundAmount != null) && (
          <div className="mt-6 p-4 rounded-xl bg-red-500/5 border border-red-500/20 space-y-3">
            <h3 className="text-sm font-semibold text-red-400">{isRTL ? 'معلومات الإلغاء' : 'Cancellation Info'}</h3>
            {booking.cancelledAt && (
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <Clock size={14} />
                <span>{new Date(booking.cancelledAt).toLocaleString()}</span>
              </div>
            )}
            {booking.cancellationReason && (
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <AlertCircle size={14} />
                <span>{booking.cancellationReason}</span>
              </div>
            )}
            {booking.refundAmount != null && booking.refundAmount > 0 && (
              <>
                <div className="flex items-center gap-2 text-sm">
                  <CreditCard size={14} className="text-emerald-400" />
                  <span className="text-zinc-400">{isRTL ? 'الاسترداد' : 'Refund'}:</span>
                  <span className="text-emerald-400 font-semibold">{booking.refundAmount.toFixed(2)} EGP</span>
                </div>
                {booking.cancellationFee > 0 && (
                  <div className="flex items-center gap-2 text-sm">
                    <CreditCard size={14} className="text-red-400" />
                    <span className="text-zinc-400">{isRTL ? 'الرسوم' : 'Fee'}:</span>
                    <span className="text-red-400 font-semibold">{booking.cancellationFee.toFixed(2)} EGP</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm pt-1 border-t border-red-500/10">
                  {booking.refundProcessedAt ? (
                    <>
                      <CheckCircle size={14} className="text-emerald-500" />
                      <span className="text-emerald-400">{isRTL ? 'تم صرف المبلغ' : 'Refund processed'}</span>
                      <span className="text-zinc-500 text-xs">{new Date(booking.refundProcessedAt).toLocaleDateString()}</span>
                    </>
                  ) : (
                    <>
                      <Clock size={14} className="text-amber-500" />
                      <span className="text-amber-400">{isRTL ? 'في انتظار معالجة الأدمن' : 'Pending admin processing'}</span>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </motion.div>

      {booking.pairedBooking && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl p-6 border border-white/5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">{isRTL ? 'الحجز المرتبط' : 'Paired Booking'}</h2>
            <span className="text-xs text-zinc-500">{isRTL ? 'رحلة الذهاب/العودة' : 'Round Trip Leg'}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-zinc-300">
                <MapPin size={16} className="text-blue-400" />
                <p className="text-sm">{booking.pairedBooking.trip.origin} → {booking.pairedBooking.trip.destination}</p>
              </div>
              <div className="flex items-center gap-2 text-zinc-300">
                <Clock size={16} className="text-amber-400" />
                <p className="text-sm">{new Date(booking.pairedBooking.trip.departure).toLocaleString()}</p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-zinc-300">
                <Ticket size={16} className="text-purple-400" />
                <p className="text-sm">{isRTL ? 'مقعد' : 'Seat'}: {booking.pairedBooking.seatLabel}</p>
              </div>
              <div className="flex items-center gap-2 text-zinc-300">
                <User size={16} className="text-emerald-400" />
                <p className="text-sm">{booking.pairedBooking.passengerName}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
            <span className="text-sm text-zinc-400">{isRTL ? 'الإجمالي' : 'Total'}: <strong className="text-white">{(booking.pairedBooking.total || 0).toFixed(2)} EGP</strong></span>
            <Link href={`/company/bookings/${booking.pairedBooking.id}`} className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition">
              {isRTL ? 'عرض التفاصيل' : 'View Details'} <ArrowRight size={14} />
            </Link>
          </div>
        </motion.div>
      )}

      {/* Cancel confirmation modal */}
      {cancelModal && cancelInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setCancelModal(false)} />
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative glass rounded-2xl p-8 max-w-md w-full border border-zinc-700 shadow-2xl"
          >
            <button
              onClick={() => setCancelModal(false)}
              className="absolute top-4 right-4 p-2 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition"
            >
              <X size={16} />
            </button>

            <div className="text-center mb-6">
              <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
                <AlertCircle size={28} className="text-red-400" />
              </div>
              <h3 className={cn('text-lg font-bold text-white mb-2', isRTL && 'font-[Cairo]')}>
                {t('cancel.confirmTitle')}
              </h3>
            </div>

            {cancelInfo.canCancel ? (
              <>
                <div className={cn(
                  'rounded-xl p-4 border mb-4',
                  cancelInfo.refundPercent === 100 ? 'bg-emerald-500/5 border-emerald-500/20' :
                  cancelInfo.refundPercent > 0 ? 'bg-amber-500/5 border-amber-500/20' :
                  'bg-red-500/5 border-red-500/20'
                )}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-zinc-400">{t('cancel.refundAmount')}</span>
                    <span className={cn('font-bold', cancelInfo.refundPercent === 100 ? 'text-emerald-400' : cancelInfo.refundPercent > 0 ? 'text-amber-400' : 'text-red-400')}>
                      {cancelInfo.refundAmount.toFixed(2)} {isRTL ? 'ج.م' : 'EGP'}
                    </span>
                  </div>
                  {cancelInfo.cancellationFee > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-zinc-400">{t('cancel.fee')}</span>
                      <span className="text-red-400 font-bold">{cancelInfo.cancellationFee.toFixed(2)} {isRTL ? 'ج.م' : 'EGP'}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs text-zinc-500 mb-4">
                  <Clock size={12} />
                  <span>
                    {cancelInfo.refundPercent === 100 ? t('cancel.freeWindow') :
                     cancelInfo.refundPercent > 0 ? `${t('cancel.partialRefund')} (${cancelInfo.refundPercent}%)` :
                     t('cancel.noRefund')}
                  </span>
                </div>

                <div className="mb-6">
                  <label className="text-sm text-zinc-400 mb-2 block">{t('cancel.reason')}</label>
                  <select
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-zinc-900/80 border border-white/5 focus:border-blue-500/50 focus:outline-none text-sm text-white"
                  >
                    <option value="">{isRTL ? 'اختر السبب' : 'Select reason'}</option>
                    <option value="changed_plans">{t('cancel.reasonChangedPlans')}</option>
                    <option value="found_alternative">{t('cancel.reasonFoundAlternative')}</option>
                    <option value="other">{t('cancel.reasonOther')}</option>
                  </select>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setCancelModal(false)}
                    className="flex-1 py-2.5 rounded-xl glass border border-zinc-700 text-zinc-400 hover:text-white hover:bg-white/5 transition text-sm font-medium"
                  >
                    {isRTL ? 'تراجع' : 'Keep it'}
                  </button>
                  <button
                    onClick={confirmCancel}
                    className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition"
                  >
                    {isRTL ? 'تأكيد الإلغاء' : 'Confirm Cancel'}
                  </button>
                </div>
              </>
            ) : (
              <div className="rounded-xl p-4 bg-red-500/5 border border-red-500/20 text-center">
                <p className="text-red-400 text-sm">{t('cancel.cannotCancel')}</p>
                <button
                  onClick={() => setCancelModal(false)}
                  className="mt-4 px-6 py-2 rounded-xl glass border border-zinc-700 text-zinc-400 hover:text-white transition text-sm"
                >
                  {isRTL ? 'إغلاق' : 'Close'}
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </div>
  )
}
