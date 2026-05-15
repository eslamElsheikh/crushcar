'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { Route, Plus, Trash2, Edit, MapPin, Clock, Loader2, X, Repeat, Users, Filter, Armchair } from 'lucide-react'
import { useLangStore } from '@/lib/lang'
import { governoratesList } from '@/lib/governorates'
import { formatDate, formatTime, cn } from '@/lib/utils'

interface Bus {
  id: string
  name: string
  type: string
}

interface Trip {
  id: string
  origin: string
  destination: string
  departure: string
  arrival: string
  price: number
  status: string
  bus?: { name: string }
  _count?: { bookings: number }
}

export default function AdminTripsPage() {
  const [trips, setTrips] = useState<Trip[]>([])
  const [buses, setBuses] = useState<Bus[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewModal, setShowNewModal] = useState(false)
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [tripFilter, setTripFilter] = useState<'all' | 'upcoming' | 'completed' | 'cancelled'>('all')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const t = useLangStore((s) => s.t)
  const lang = useLangStore((s) => s.lang)

  const now = new Date()

  const [bulkForm, setBulkForm] = useState({
    busId: '',
    origin: '',
    destination: '',
    departureTime: '08:00',
    arrivalTime: '11:30',
    price: '',
    count: '7',
    interval: 'daily',
  })

  useEffect(() => {
    loadTrips(1)
    fetch('/api/buses').then((r) => r.json()).then((data) => setBuses(Array.isArray(data) ? data : []))
  }, [])

  async function loadTrips(pageNum: number = 1) {
    const params = new URLSearchParams({ page: String(pageNum), take: '20' })
    if (tripFilter === 'upcoming') params.set('status', 'SCHEDULED')
    else if (tripFilter === 'completed') params.set('status', 'COMPLETED')
    else if (tripFilter === 'cancelled') params.set('status', 'CANCELLED')
    const res = await fetch(`/api/trips?${params}`)
    const data = await res.json()
    setTrips(data.data || [])
    setPage(data.pagination?.page || 1)
    setTotalPages(data.pagination?.pages || 1)
    setTotal(data.pagination?.total || 0)
    setLoading(false)
  }

  async function handleDelete(id: string) {
    if (!confirm(t('common.confirm') + ' Delete?')) return
    await fetch(`/api/trips/${id}`, { method: 'DELETE' })
    loadTrips()
  }

  async function handleBulkCreate(e: React.FormEvent) {
    e.preventDefault()
    const count = parseInt(bulkForm.count)
    const depTime = bulkForm.departureTime.split(':')
    const arrTime = bulkForm.arrivalTime.split(':')

    for (let i = 0; i < count; i++) {
      const baseDate = new Date()
      if (bulkForm.interval === 'weekly') baseDate.setDate(baseDate.getDate() + i * 7)
      else if (bulkForm.interval === 'weekdays') {
        let added = 0
        while (added < i) {
          baseDate.setDate(baseDate.getDate() + 1)
          const day = baseDate.getDay()
          if (day !== 0 && day !== 6) added++
        }
      }
      else baseDate.setDate(baseDate.getDate() + i)

      const dep = new Date(baseDate)
      dep.setHours(parseInt(depTime[0]), parseInt(depTime[1]), 0, 0)
      const arr = new Date(baseDate)
      arr.setHours(parseInt(arrTime[0]), parseInt(arrTime[1]), 0, 0)

      await fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          busId: bulkForm.busId,
          origin: bulkForm.origin,
          destination: bulkForm.destination,
          departure: dep.toISOString(),
          arrival: arr.toISOString(),
          price: Number(bulkForm.price),
        }),
      })
    }

    setShowBulkModal(false)
    setBulkForm({ busId: '', origin: '', destination: '', departureTime: '08:00', arrivalTime: '11:30', price: '', count: '7', interval: 'daily' })
    loadTrips()
  }

  const statusColors: Record<string, string> = {
    SCHEDULED: 'bg-blue-500/10 text-blue-400',
    IN_PROGRESS: 'bg-amber-500/10 text-amber-400',
    COMPLETED: 'bg-green-500/10 text-green-400',
    CANCELLED: 'bg-red-500/10 text-red-400',
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-display font-bold">{t('trips.title')}</h1>
          <p className="text-zinc-400 mt-1">{t('trips.manage')}</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowBulkModal(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg glass hover:bg-zinc-800/50 text-sm font-medium transition">
            <Repeat size={16} /> {t('trips.bulkCreate')}
          </button>
          <button onClick={() => setShowNewModal(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition">
            <Plus size={16} /> {t('trips.addTrip')}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : trips.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-20">
          <Route size={48} className="mx-auto text-zinc-700 mb-4" />
          <h3 className="text-lg font-medium mb-2">{t('trips.noTrips')}</h3>
          <p className="text-zinc-500 mb-6">{t('trips.createFirst')}</p>
          <button onClick={() => setShowNewModal(true)} className="px-6 py-3 rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-medium transition">
            {t('trips.createFirst')}
          </button>
        </motion.div>
      ) : (
        <>
          {/* Filter tabs */}
          <div className="flex gap-2 mb-6">
            {([
              { key: 'all', label: lang === 'ar' ? 'الكل' : 'All' },
              { key: 'upcoming', label: lang === 'ar' ? 'القادمة' : 'Upcoming' },
              { key: 'completed', label: lang === 'ar' ? 'المكتملة' : 'Completed' },
              { key: 'cancelled', label: lang === 'ar' ? 'الملغية' : 'Cancelled' },
            ] as const).map(f => (
              <button key={f.key} onClick={() => { setTripFilter(f.key); setPage(1); loadTrips(1) }}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all',
                  tripFilter === f.key
                    ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                )}>
                {f.label}
                <span className={cn('px-1.5 py-0.5 rounded-full text-xs', tripFilter === f.key ? 'bg-blue-500/20' : 'bg-zinc-800')}>
                  {f.key === 'all' ? total :
                   f.key === 'upcoming' ? trips.filter(t => t.status === 'SCHEDULED' && new Date(t.departure) >= now).length :
                   f.key === 'completed' ? trips.filter(t => t.status === 'COMPLETED').length :
                   trips.filter(t => t.status === 'CANCELLED').length}
                </span>
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {trips.filter(t => {
              if (tripFilter === 'all') return true
              if (tripFilter === 'upcoming') return t.status === 'SCHEDULED' && new Date(t.departure) >= now
              if (tripFilter === 'completed') return t.status === 'COMPLETED'
              return t.status === 'CANCELLED'
            }).map((trip, i) => (
            <motion.div key={trip.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="glass rounded-xl p-5 hover:bg-zinc-800/30 transition">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold">{trip.origin} → {trip.destination}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[trip.status] || ''}`}>{trip.status}</span>
                  </div>
                  <div className="flex items-center gap-6 text-sm text-zinc-400">
                    <span className="flex items-center gap-1"><Clock size={14} /> {formatDate(trip.departure)} {formatTime(trip.departure)}</span>
                    <span className="flex items-center gap-1"><MapPin size={14} /> {trip.bus?.name || 'Bus'}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xl font-display font-bold">{trip.price.toLocaleString()} {t('common.currency')}</p>
                  <p className="text-xs text-zinc-500">{trip._count?.bookings || 0} {t('trips.bookings')}</p>
                </div>
                <Link href={`/admin/trips/${trip.id}/edit`} className="p-2 rounded-lg text-zinc-500 hover:text-blue-400 hover:bg-blue-500/5 transition">
                  <Edit size={16} />
                </Link>
                <Link href={`/admin/trips/${trip.id}/seats`} className="p-2 rounded-lg text-zinc-500 hover:text-purple-400 hover:bg-purple-500/5 transition" title={lang === 'ar' ? 'المقاعد' : 'Seats'}>
                  <Armchair size={16} />
                </Link>
                <Link href={`/admin/trips/${trip.id}/passengers`} className="p-2 rounded-lg text-zinc-500 hover:text-emerald-400 hover:bg-emerald-500/5 transition" title={lang === 'ar' ? 'الركاب' : 'Passengers'}>
                  <Users size={16} />
                </Link>
                <button onClick={() => handleDelete(trip.id)} className="p-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/5 transition">
                  <Trash2 size={16} />
                </button>
              </div>
            </motion.div>
          ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-8">
              <button onClick={() => loadTrips(page - 1)} disabled={page <= 1} className="flex items-center gap-1.5 px-4 py-2 rounded-lg glass hover:bg-zinc-800/50 disabled:opacity-30 disabled:cursor-not-allowed text-sm font-medium transition">
                ← {lang === 'ar' ? 'السابق' : 'Prev'}
              </button>
              <span className="text-sm text-zinc-400">{lang === 'ar' ? 'صفحة' : 'Page'} {page} {lang === 'ar' ? 'من' : 'of'} {totalPages}</span>
              <button onClick={() => loadTrips(page + 1)} disabled={page >= totalPages} className="flex items-center gap-1.5 px-4 py-2 rounded-lg glass hover:bg-zinc-800/50 disabled:opacity-30 disabled:cursor-not-allowed text-sm font-medium transition">
                {lang === 'ar' ? 'التالي' : 'Next'} →
              </button>
            </div>
          )}
        </>
      )}

      <AnimatePresence>
        {showNewModal && (
          <SingleTripModal buses={buses} onClose={() => setShowNewModal(false)} onCreated={loadTrips} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showBulkModal && (
          <BulkTripModal buses={buses} form={bulkForm} setForm={setBulkForm} onClose={() => setShowBulkModal(false)} onSubmit={handleBulkCreate} />
        )}
      </AnimatePresence>
    </div>
  )
}

function SingleTripModal({ buses, onClose, onCreated }: { buses: Bus[]; onClose: () => void; onCreated: () => void }) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ busId: '', origin: '', destination: '', departure: '', arrival: '', price: '' })
  const t = useLangStore((s) => s.t)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/trips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, price: Number(form.price) }),
    })
    setSaving(false)
    onClose()
    onCreated()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative glass rounded-2xl p-8 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-display font-bold">{t('trips.addTrip')}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-zinc-800 transition"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">{t('trips.origin')}</label>
              <select value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} className="w-full px-4 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-blue-500 focus:outline-none transition text-sm" required>
                <option value="">--</option>
                {governoratesList.map((g) => <option key={g.value} value={g.label}>{g.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">{t('trips.destination')}</label>
              <select value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} className="w-full px-4 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-blue-500 focus:outline-none transition text-sm" required>
                <option value="">--</option>
                {governoratesList.map((g) => <option key={g.value} value={g.label}>{g.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">{t('trips.bus')}</label>
            <select value={form.busId} onChange={(e) => setForm({ ...form, busId: e.target.value })} className="w-full px-4 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-blue-500 focus:outline-none transition text-sm" required>
              <option value="">--</option>
              {buses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div><label className="text-sm text-zinc-400 mb-1 block">{t('trips.departure')}</label><input type="datetime-local" value={form.departure} onChange={(e) => setForm({ ...form, departure: e.target.value })} className="w-full px-4 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-blue-500 focus:outline-none transition text-sm" required /></div>
            <div><label className="text-sm text-zinc-400 mb-1 block">{t('trips.arrival')}</label><input type="datetime-local" value={form.arrival} onChange={(e) => setForm({ ...form, arrival: e.target.value })} className="w-full px-4 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-blue-500 focus:outline-none transition text-sm" required /></div>
          </div>
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">{t('trips.price')} ({t('common.currency')})</label>
            <input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="w-full px-4 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-blue-500 focus:outline-none transition text-sm" placeholder="50" min={1} required />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg glass hover:bg-zinc-800/50 text-zinc-400 text-sm font-medium transition">{t('common.cancel')}</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-sm font-medium transition flex items-center justify-center gap-2">{saving && <Loader2 size={14} className="animate-spin" />} {t('buses.create')}</button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

function BulkTripModal({ buses, form, setForm, onClose, onSubmit }: { buses: Bus[]; form: any; setForm: any; onClose: () => void; onSubmit: (e: React.FormEvent) => void }) {
  const t = useLangStore((s) => s.t)
  const count = parseInt(form.count) || 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative glass rounded-2xl p-8 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div><h2 className="text-xl font-display font-bold">{t('bulk.title')}</h2><p className="text-xs text-zinc-500 mt-1">{t('bulk.subtitle')}</p></div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-zinc-800 transition"><X size={20} /></button>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div><label className="text-sm text-zinc-400 mb-1 block">{t('trips.origin')}</label><select value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} className="w-full px-4 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-blue-500 focus:outline-none transition text-sm" required><option value="">--</option>{governoratesList.map((g) => <option key={g.value} value={g.label}>{g.label}</option>)}</select></div>
            <div><label className="text-sm text-zinc-400 mb-1 block">{t('trips.destination')}</label><select value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} className="w-full px-4 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-blue-500 focus:outline-none transition text-sm" required><option value="">--</option>{governoratesList.map((g) => <option key={g.value} value={g.label}>{g.label}</option>)}</select></div>
          </div>
          <div><label className="text-sm text-zinc-400 mb-1 block">{t('trips.bus')}</label><select value={form.busId} onChange={(e) => setForm({ ...form, busId: e.target.value })} className="w-full px-4 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-blue-500 focus:outline-none transition text-sm" required><option value="">--</option>{buses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="text-sm text-zinc-400 mb-1 block">{t('trips.departure')}</label><input type="time" value={form.departureTime} onChange={(e) => setForm({ ...form, departureTime: e.target.value })} className="w-full px-3 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-blue-500 focus:outline-none transition text-sm" required /></div>
            <div><label className="text-sm text-zinc-400 mb-1 block">{t('trips.arrival')}</label><input type="time" value={form.arrivalTime} onChange={(e) => setForm({ ...form, arrivalTime: e.target.value })} className="w-full px-3 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-blue-500 focus:outline-none transition text-sm" required /></div>
            <div><label className="text-sm text-zinc-400 mb-1 block">{t('trips.price')} ({t('common.currency')})</label><input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="w-full px-3 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-blue-500 focus:outline-none transition text-sm" placeholder="50" min={1} required /></div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div><label className="text-sm text-zinc-400 mb-1 block">{t('bulk.numTrips')}</label><input type="number" value={form.count} onChange={(e) => setForm({ ...form, count: e.target.value })} className="w-full px-4 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-blue-500 focus:outline-none transition text-sm" min={1} max={365} required /></div>
            <div><label className="text-sm text-zinc-400 mb-1 block">{t('bulk.interval')}</label><select value={form.interval} onChange={(e) => setForm({ ...form, interval: e.target.value })} className="w-full px-4 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-blue-500 focus:outline-none transition text-sm"><option value="daily">{t('bulk.daily')}</option><option value="weekly">{t('bulk.weekly')}</option><option value="weekdays">{t('bulk.weekdays')}</option></select></div>
          </div>
          {form.origin && form.destination && (
            <div className="bg-zinc-800/30 rounded-lg p-3">
              <p className="text-xs text-zinc-500 mb-2">{t('bulk.preview')} ({t('bulk.firstTrips')})</p>
              <div className="space-y-1">
                {Array.from({ length: Math.min(3, count) }, (_, i) => {
                  const d = new Date()
                  if (form.interval === 'weekly') d.setDate(d.getDate() + i * 7)
                  else if (form.interval === 'weekdays') { let days = i; while (days > 0) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) days-- } }
                  else d.setDate(d.getDate() + i)
                  return (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span>{form.origin} → {form.destination}</span>
                      <span className="text-zinc-500">{d.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })} @ {form.departureTime}</span>
                    </div>
                  )
                })}
                {count > 3 && <p className="text-xs text-zinc-600 mt-1">... {count - 3} {t('bulk.andMore')}</p>}
              </div>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg glass hover:bg-zinc-800/50 text-zinc-400 text-sm font-medium transition">{t('common.cancel')}</button>
            <button type="submit" className="flex-1 py-2.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition">{t('buses.create')} {count} {count !== 1 ? 'رحلة' : 'رحلة'}</button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}