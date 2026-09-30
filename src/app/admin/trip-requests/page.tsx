'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MapPin, Calendar, Users, CheckCircle, XCircle, MessageSquare, Clock, Building2, Plus, X } from 'lucide-react'
import { useLangStore } from '@/lib/lang'
import { useSession } from 'next-auth/react'

interface Station {
  id: string
  name: string
  city: string
}

interface TripRequest {
  id: string
  company?: { id: string; name: string }
  fromStation: { id: string; name: string; city: string }
  toStation: { id: string; name: string; city: string }
  date: string
  passengerCount: number
  notes: string
  status: string
  adminNotes: string
  createdAt: string
}

export default function AdminTripRequests() {
  const { data: session } = useSession()
  const t = useLangStore((s) => s.t)
  const lang = useLangStore((s) => s.lang)
  const isRTL = lang === 'ar'
  const isSuperAdmin = session?.user?.role === 'SUPER_ADMIN'

  const [requests, setRequests] = useState<TripRequest[]>([])
  const [stations, setStations] = useState<Station[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('PENDING')
  const [processing, setProcessing] = useState<string | null>(null)
  const [rejectModal, setRejectModal] = useState<TripRequest | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    fromStationId: '',
    toStationId: '',
    date: '',
    passengerCount: '',
    notes: '',
  })

  useEffect(() => {
    if (isSuperAdmin) {
      loadSuperAdminRequests()
    } else {
      loadCompanyRequests()
    }
    fetch('/api/stations', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setStations(d.stations || []))
  }, [filter, isSuperAdmin])

  async function loadSuperAdminRequests() {
    setLoading(true)
    const res = await fetch(`/api/admin/trip-requests?status=${filter}`, { credentials: 'include' })
    const json = await res.json()
    setRequests(json.data || [])
    setLoading(false)
  }

  async function loadCompanyRequests() {
    setLoading(true)
    const res = await fetch('/api/company/trip-requests', { credentials: 'include' })
    const json = await res.json()
    setRequests(json.data || [])
    setLoading(false)
  }

  async function handleApprove(req: TripRequest) {
    setProcessing(req.id)
    const res = await fetch(`/api/admin/trip-requests/${req.id}`, {
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
    const res = await fetch(`/api/admin/trip-requests/${rejectModal.id}`, {
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.fromStationId || !form.toStationId || !form.date || !form.passengerCount) return

    setSubmitting(true)
    const res = await fetch('/api/company/trip-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        fromStationId: form.fromStationId,
        toStationId: form.toStationId,
        date: form.date,
        passengerCount: parseInt(form.passengerCount),
        notes: form.notes,
      }),
    })
    const json = await res.json()
    setSubmitting(false)

    if (json.data) {
      setRequests(prev => [json.data, ...prev])
      setForm({ fromStationId: '', toStationId: '', date: '', passengerCount: '', notes: '' })
      setFormOpen(false)
    }
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case 'APPROVED': return <CheckCircle size={18} className="text-emerald-400" />
      case 'REJECTED': return <XCircle size={18} className="text-red-400" />
      default: return <Clock size={18} className="text-amber-400" />
    }
  }

  const statusClass = (status: string) => {
    switch (status) {
      case 'APPROVED': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
      case 'REJECTED': return 'bg-red-500/10 text-red-400 border-red-500/20'
      default: return 'bg-amber-500/10 text-amber-400 border-amber-500/20'
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-white">
            {isSuperAdmin ? t('admin.tripRequests') : t('company.tripRequests')}
          </h1>
          <p className="text-sm text-zinc-500 mt-1">{t('tripRequest.title')}</p>
        </div>
        {!isSuperAdmin && (
          <button
            onClick={() => setFormOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition"
          >
            <Plus size={16} />
            {t('tripRequest.newRequest')}
          </button>
        )}
      </div>

      {isSuperAdmin && (
        <div className="flex gap-2">
          {['PENDING', 'APPROVED', 'REJECTED'].map(key => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
                filter === key
                  ? 'bg-blue-500/15 text-blue-400 border border-blue-500/20'
                  : 'bg-white/5 text-zinc-400 hover:text-white border border-transparent'
              }`}
            >
              {key === 'PENDING' ? t('tripRequest.pending') : key === 'APPROVED' ? t('tripRequest.approved') : t('tripRequest.rejected')}
            </button>
          ))}
        </div>
      )}

      <AnimatePresence>
        {formOpen && !isSuperAdmin && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="glass rounded-2xl p-6 border border-white/5"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white">{t('tripRequest.newRequest')}</h2>
              <button onClick={() => setFormOpen(false)} className="p-2 rounded-lg hover:bg-white/5 transition">
                <X size={18} className="text-zinc-400" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">{t('tripRequest.from')}</label>
                <select value={form.fromStationId} onChange={e => setForm({ ...form, fromStationId: e.target.value })} className="w-full px-3 py-2.5 rounded-xl bg-zinc-900 border border-white/10 text-white focus:outline-none focus:border-blue-500/50 text-sm [&>option]:bg-zinc-900 [&>option]:text-white" required>
                  <option value="">--</option>
                  {stations.map(s => <option key={s.id} value={s.id}>{s.name} - {s.city}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">{t('tripRequest.to')}</label>
                <select value={form.toStationId} onChange={e => setForm({ ...form, toStationId: e.target.value })} className="w-full px-3 py-2.5 rounded-xl bg-zinc-900 border border-white/10 text-white focus:outline-none focus:border-blue-500/50 text-sm [&>option]:bg-zinc-900 [&>option]:text-white" required>
                  <option value="">--</option>
                  {stations.map(s => <option key={s.id} value={s.id}>{s.name} - {s.city}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">{t('tripRequest.date')}</label>
                <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-blue-500/50 text-sm" required />
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">{t('tripRequest.passengerCount')}</label>
                <input type="number" min="1" value={form.passengerCount} onChange={e => setForm({ ...form, passengerCount: e.target.value })} className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-blue-500/50 text-sm" required />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-zinc-400 mb-1 block">{t('tripRequest.notes')}</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-blue-500/50 text-sm resize-none" />
              </div>
              <div className="md:col-span-2 flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 text-sm transition">{t('common.cancel')}</button>
                <button type="submit" disabled={submitting} className="px-6 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition disabled:opacity-50">{submitting ? '...' : t('tripRequest.submit')}</button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="text-center py-20 text-zinc-500">{t('common.loading')}</div>
      ) : requests.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-zinc-500">{t('tripRequest.noRequests')}</p>
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
                    {isSuperAdmin && req.company && (
                      <div className="flex items-center gap-2 text-white text-sm">
                        <Building2 size={14} className="text-blue-400" />
                        <span className="font-medium">{req.company.name}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-zinc-300 text-sm">
                      <MapPin size={14} className="text-blue-400" />
                      <span>{req.fromStation.name} ({req.fromStation.city})</span>
                      <span className="text-zinc-600">→</span>
                      <span>{req.toStation.name} ({req.toStation.city})</span>
                    </div>
                    {!isSuperAdmin && (
                      <span className={`text-xs px-2.5 py-1 rounded-full border flex items-center gap-1 ${statusClass(req.status)}`}>
                        {statusIcon(req.status)}
                        {req.status === 'APPROVED' ? t('tripRequest.approved') : req.status === 'REJECTED' ? t('tripRequest.rejected') : t('tripRequest.pending')}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-zinc-500">
                    <span className="flex items-center gap-1"><Calendar size={12} />{new Date(req.date).toLocaleDateString(isRTL ? 'ar-EG' : 'en-US')}</span>
                    <span className="flex items-center gap-1"><Users size={12} />{req.passengerCount}</span>
                    <span className="flex items-center gap-1"><Clock size={12} />{new Date(req.createdAt).toLocaleDateString(isRTL ? 'ar-EG' : 'en-US')}</span>
                  </div>
                  {req.notes && <p className="text-xs text-zinc-500 flex items-start gap-1.5"><MessageSquare size={12} className="mt-0.5 shrink-0" />{req.notes}</p>}
                  {req.adminNotes && (
                    <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                      <p className="text-xs text-zinc-400 mb-1">{t('tripRequest.adminNotes')}</p>
                      <p className="text-sm text-zinc-300">{req.adminNotes}</p>
                    </div>
                  )}
                </div>

                {isSuperAdmin && filter === 'PENDING' && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => handleApprove(req)} disabled={processing === req.id} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-sm font-medium transition disabled:opacity-50">
                      <CheckCircle size={16} />{t('tripRequest.approve')}
                    </button>
                    <button onClick={() => { setRejectModal(req); setRejectReason('') }} disabled={processing === req.id} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-sm font-medium transition disabled:opacity-50">
                      <XCircle size={16} />{t('tripRequest.reject')}
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setRejectModal(null)}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass rounded-2xl p-6 border border-white/5 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-4">{t('tripRequest.reject')}</h3>
            <p className="text-sm text-zinc-400 mb-4">{t('tripRequest.reason')}</p>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={3} className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-blue-500/50 text-sm resize-none mb-4" placeholder={t('tripRequest.adminNotes')} />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setRejectModal(null)} className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 text-sm transition">{t('common.cancel')}</button>
              <button onClick={handleReject} disabled={!rejectReason.trim() || processing === rejectModal.id} className="px-6 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-medium transition disabled:opacity-50">{t('tripRequest.reject')}</button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}
