'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { useSession } from 'next-auth/react'
import { Search, MapPin, Clock, ArrowRight, Bus } from 'lucide-react'
import { useLangStore } from '@/lib/lang'
import { governoratesList } from '@/lib/governorates'
import { formatDate, formatTime } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface Trip {
  id: string
  origin: string
  destination: string
  departure: string
  arrival: string
  price: number
  status: string
  bus: { name: string; type: string; layout?: { seats: any[] } }
  bookings: any[]
}

export default function TripsPage() {
  const { data: session } = useSession()
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ origin: '', destination: '', date: '' })
  const t = useLangStore((s) => s.t)
  const lang = useLangStore((s) => s.lang)
  const isRTL = lang === 'ar'
  const isAdmin = session?.user?.role === 'COMPANY_ADMIN' || session?.user?.role === 'SUPER_ADMIN'

  useEffect(() => { loadTrips() }, [])

  async function loadTrips() {
    const params = new URLSearchParams()
    if (filters.origin) params.set('origin', filters.origin)
    if (filters.destination) params.set('destination', filters.destination)
    if (filters.date) params.set('date', filters.date)
    const res = await fetch(`/api/trips?${params}`)
    const data = await res.json()
    setTrips(data)
    setLoading(false)
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    loadTrips()
  }

  return (
    <div className={cn('min-h-screen bg-background', isRTL && 'font-[Cairo]')} dir={isRTL ? 'rtl' : 'ltr'}>
      <header className="glass border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
              <span className="text-white font-bold text-xs">CC</span>
            </div>
            <span className="font-display font-bold text-white">CrushCar</span>
          </Link>
          <div className="flex items-center gap-4">
            {isAdmin ? (
              <Link href="/admin" className="text-sm text-zinc-400 hover:text-white transition font-medium">{t('nav.admin')}</Link>
            ) : (
              <>
                <Link href="/bookings" className="text-sm text-zinc-400 hover:text-white transition font-medium">{isRTL ? 'حجوزاتي' : 'My Bookings'}</Link>
                <Link href="/profile" className="text-sm text-zinc-400 hover:text-white transition font-medium">{isRTL ? 'حسابي' : 'Account'}</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="text-3xl font-display font-bold mb-2">{t('search.title')}</h1>
          <p className="text-zinc-400">{t('search.desc')}</p>
        </motion.div>

        <motion.form initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} onSubmit={handleSearch} className="glass rounded-2xl p-6 mb-8">
          <div className="grid sm:grid-cols-4 gap-4">
            <div>
              <label className="text-xs text-zinc-500 mb-2 block">{t('search.from')}</label>
              <select value={filters.origin} onChange={(e) => setFilters({ ...filters, origin: e.target.value })} className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-blue-500 focus:outline-none transition">
                <option value="">--</option>
                {governoratesList.map((g) => <option key={g.value} value={g.label}>{g.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-2 block">{t('search.to')}</label>
              <select value={filters.destination} onChange={(e) => setFilters({ ...filters, destination: e.target.value })} className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-blue-500 focus:outline-none transition">
                <option value="">--</option>
                {governoratesList.map((g) => <option key={g.value} value={g.label}>{g.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-2 block">{t('search.date')}</label>
              <input type="date" value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value })} className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-blue-500 focus:outline-none transition" />
            </div>
            <div className="flex items-end">
              <button type="submit" className="w-full py-3 rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-medium transition flex items-center justify-center gap-2">
                <Search size={16} /> {t('search.searchBtn')}
              </button>
            </div>
          </div>
        </motion.form>

        {loading ? (
          <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : trips.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-20">
            <Bus size={48} className="mx-auto text-zinc-700 mb-4" />
            <h3 className="text-lg font-medium mb-2">{t('search.noTrips')}</h3>
            <p className="text-zinc-500">{t('search.tryAgain')}</p>
          </motion.div>
        ) : (
          <div className="space-y-4">
            {trips.map((trip, i) => {
              const totalSeats = trip.bus?.layout?.seats?.length || 0
              const bookedSeats = trip.bookings?.length || 0
              const available = totalSeats - bookedSeats
              return (
                <motion.div key={trip.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="glass rounded-xl p-6 hover:bg-zinc-800/30 transition group">
                  <div className="flex items-center gap-6">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="flex items-center gap-2"><MapPin size={16} className="text-blue-400" /><span className="font-semibold">{trip.origin}</span></div>
                        <ArrowRight size={16} className={cn('text-zinc-600', isRTL && 'rotate-180')} />
                        <div className="flex items-center gap-2"><MapPin size={16} className="text-green-400" /><span className="font-semibold">{trip.destination}</span></div>
                      </div>
                      <div className="flex items-center gap-6 text-sm text-zinc-400">
                        <span className="flex items-center gap-1"><Clock size={14} />{formatDate(trip.departure)} {formatTime(trip.departure)}</span>
                        <span className="flex items-center gap-1"><Bus size={14} />{trip.bus?.name}</span>
                      </div>
                    </div>
                    <div className="text-center px-6 border-l border-zinc-800">
                      <p className="text-2xl font-display font-bold text-green-400">{available}</p>
                      <p className="text-xs text-zinc-500">{t('search.seatsLeft')}</p>
                      {available === 0 && <span className="text-xs text-red-400 mt-1 block">{t('search.fullyBooked')}</span>}
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-display font-bold">{trip.price.toLocaleString()} {t('common.currency')}</p>
                      <p className="text-xs text-zinc-500 mb-3">{t('search.perSeat')}</p>
                      <Link href={`/trips/${trip.id}`} className={`block px-5 py-2 rounded-lg font-medium text-sm transition ${available > 0 ? 'bg-blue-500 hover:bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'}`}>
                        {available > 0 ? t('search.chooseSeat') : t('search.soldOut')}
                      </Link>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}