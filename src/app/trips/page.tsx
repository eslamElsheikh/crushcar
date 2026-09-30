'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { useSession } from 'next-auth/react'
import { Search, MapPin, Clock, ArrowRight, Bus, Repeat, Map } from 'lucide-react'
import { useLangStore } from '@/lib/lang'
import { formatDate, formatTime } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface Station { id: string; name: string; city: string }
interface TripStop { id?: string; stationId: string; station?: Station; stopOrder: number; priceFromOrigin: number; arrivalTime?: string; departureTime?: string }
interface Trip {
  id: string
  origin: string
  destination: string
  departure: string
  arrival: string
  price: number
  calculatedPrice?: number
  boardingTime?: string
  alightingTime?: string
  status: string
  bus: { name: string; type: string; layout?: { seats: any[] }; stations?: any[] }
  bookings: any[]
  companyBookings?: any[]
  tripStops?: TripStop[]
  stops?: TripStop[]
}

export default function TripsPage() {
  const { data: session } = useSession()
  const [stations, setStations] = useState<Station[]>([])
  const [trips, setTrips] = useState<Trip[]>([])
  const [returnTrips, setReturnTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(false)
  const [fromStationId, setFromStationId] = useState('')
  const [toStationId, setToStationId] = useState('')
  const [date, setDate] = useState('')
  const [roundTrip, setRoundTrip] = useState(false)
  const [returnDate, setReturnDate] = useState('')
  const [selectedReturnTrip, setSelectedReturnTrip] = useState<string | null>(null)
  const t = useLangStore((s) => s.t)
  const lang = useLangStore((s) => s.lang)
  const isRTL = lang === 'ar'
  const isAdmin = session?.user?.role === 'COMPANY_ADMIN' || session?.user?.role === 'SUPER_ADMIN'

  useEffect(() => {
    fetch('/api/stations').then(r => r.json()).then(data => setStations(data.stations || data))
    loadTrips()
  }, [])

  useEffect(() => {
    if (fromStationId || toStationId || date) {
      const timer = setTimeout(() => loadTrips(), 300)
      return () => clearTimeout(timer)
    }
  }, [fromStationId, toStationId, date])

  async function loadTrips() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (fromStationId) params.set('fromStationId', fromStationId)
      if (toStationId) params.set('toStationId', toStationId)
      if (date) params.set('date', date)
      if (roundTrip && returnDate) params.set('returnDate', returnDate)
      params.set('all', 'true')
      const res = await fetch(`/api/trips?${params}`)
      const json = await res.json()
      setTrips(Array.isArray(json.data) ? json.data : [])
      setReturnTrips(Array.isArray(json.returnTrips) ? json.returnTrips : [])
      setSelectedReturnTrip(null)
    } catch {
      setTrips([])
      setReturnTrips([])
    } finally {
      setLoading(false)
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    loadTrips()
  }

  const fromStation = stations.find(s => s.id === fromStationId)
  const toStation = stations.find(s => s.id === toStationId)

  function tripRoute(trip: Trip): string {
    const stops = trip.tripStops || trip.stops || []
    const arrow = isRTL ? ' ← ' : ' → '
    return stops.filter(s => s.station?.name).map(s => s.station!.name).join(arrow) || `${trip.origin}${arrow}${trip.destination}`
  }

  function getStopsForTrip(trip: Trip): TripStop[] {
    return (trip.tripStops || trip.stops || []).filter(s => s.station?.name)
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
          <div className="flex items-center gap-3 mb-4 pb-4 border-b border-white/5">
            <button
              type="button"
              onClick={() => { setRoundTrip(!roundTrip); if (!roundTrip) setReturnDate(''); else setSelectedReturnTrip(null) }}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition border',
                roundTrip
                  ? 'bg-blue-500/15 border-blue-500/30 text-blue-400'
                  : 'border-zinc-800 text-zinc-400 hover:border-zinc-700'
              )}
            >
              <Repeat size={14} className={roundTrip ? 'text-blue-400' : ''} />
              {t('roundtrip.toggle')}
            </button>
            {roundTrip && (
              <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full">
                {t('roundtrip.bothLegs')}
              </span>
            )}
          </div>

          <div className="grid sm:grid-cols-4 gap-4">
            <div>
              <label className="text-xs text-zinc-500 mb-2 block">{t('search.from')}</label>
              <select value={fromStationId} onChange={(e) => setFromStationId(e.target.value)} className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-blue-500 focus:outline-none transition">
                <option value="">--</option>
                {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-2 block">{t('search.to')}</label>
              <select value={toStationId} onChange={(e) => setToStationId(e.target.value)} className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-blue-500 focus:outline-none transition">
                <option value="">--</option>
                {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-2 block">{t('search.date')}</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-blue-500 focus:outline-none transition" />
            </div>
            {roundTrip && (
              <div>
                <label className="text-xs text-zinc-500 mb-2 block">{t('roundtrip.returnDate')}</label>
                <input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-blue-500 focus:outline-none transition" />
              </div>
            )}
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
          <div className="space-y-10">

            {/* ===== OUTBOUND TRIPS SECTION ===== */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-1 h-6 bg-blue-500 rounded-full" />
                <h2 className="text-xl font-display font-bold">{t('roundtrip.outboundTrip')}</h2>
                {!roundTrip && (
                  <span className="text-xs text-zinc-500 bg-zinc-800/50 px-2.5 py-0.5 rounded-full">
                    {trips.length} {isRTL ? 'رحلة' : 'trips'}
                  </span>
                )}
              </div>
              <div className="space-y-4">
                {trips.map((trip, i) => {
                  const totalSeats = trip.bus?.layout?.seats?.length || 0
                  const bookedSeats = (trip.bookings?.length || 0) + (trip.companyBookings?.length || 0)
                  const available = totalSeats - bookedSeats
                  const displayPrice = trip.calculatedPrice || trip.price
                  const tripStops = getStopsForTrip(trip)
                  return (
                    <motion.div key={trip.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="glass rounded-xl p-6 hover:bg-zinc-800/30 transition group">
                      <div className="flex items-center gap-6">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-1">
                            <div className="flex items-center gap-2"><MapPin size={16} className="text-blue-400" /><span className="font-semibold">{trip.origin}</span></div>
                            <ArrowRight size={16} className={cn('text-zinc-600', isRTL && 'rotate-180')} />
                            <div className="flex items-center gap-2"><MapPin size={16} className="text-green-400" /><span className="font-semibold">{trip.destination}</span></div>
                          </div>
                          {tripStops.length > 0 && (
                            <div className="flex items-center gap-1.5 mb-2 text-xs text-zinc-500">
                              <Map size={12} />
                              <span>{tripRoute(trip)}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-6 text-sm text-zinc-400">
                            <span className="flex items-center gap-1"><Clock size={14} />{formatDate(trip.departure)} {formatTime(trip.departure)}</span>
                            <span className="flex items-center gap-1"><Bus size={14} />{trip.bus?.name}</span>
                            {trip.boardingTime && <span className="text-xs text-blue-400">{isRTL ? 'صعود' : 'Board'} {formatTime(trip.boardingTime)}</span>}
                          </div>
                        </div>
                        <div className="text-center px-6 border-l border-zinc-800">
                          <p className="text-2xl font-display font-bold text-green-400">{available}</p>
                          <p className="text-xs text-zinc-500">{t('search.seatsLeft')}</p>
                          {available === 0 && <span className="text-xs text-red-400 mt-1 block">{t('search.fullyBooked')}</span>}
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-display font-bold">{displayPrice.toLocaleString()} {t('common.currency')}</p>
                          <p className="text-xs text-zinc-500 mb-3">{t('search.perSeat')}</p>
                          <Link
                            href={(() => {
                              let base = `/trips/${trip.id}?fromStationId=${fromStationId}&toStationId=${toStationId}`
                              if (roundTrip && selectedReturnTrip) base += `&returnTripId=${selectedReturnTrip}&returnDate=${returnDate}`
                              return base
                            })()}
                            className={`block px-5 py-2 rounded-lg font-medium text-sm transition ${available > 0 ? 'bg-blue-500 hover:bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'}`}
                          >
                            {available > 0 ? t('search.chooseSeat') : t('search.soldOut')}
                          </Link>
                        </div>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            </motion.div>

            {/* ===== RETURN TRIPS SECTION ===== */}
            {roundTrip && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-1 h-6 bg-emerald-500 rounded-full" />
                  <h2 className="text-xl font-display font-bold">{t('roundtrip.returnTrip')}</h2>
                  {selectedReturnTrip && (
                    <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full">
                      {isRTL ? 'تم الاختيار' : 'Selected'}
                    </span>
                  )}
                </div>

                {returnTrips.length > 0 ? (
                  <div className="space-y-3">
                    {returnTrips.map((rt, i) => {
                      const totalSeats = rt.bus?.layout?.seats?.length || 0
                      const bookedSeats = (rt.bookings?.length || 0) + (rt.companyBookings?.length || 0)
                      const available = totalSeats - bookedSeats
                      return (
                        <motion.div
                          key={rt.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className={`glass rounded-xl p-5 transition cursor-pointer ${selectedReturnTrip === rt.id ? 'ring-2 ring-emerald-500 bg-emerald-500/5' : 'hover:bg-zinc-800/30'}`}
                          onClick={() => setSelectedReturnTrip(rt.id)}
                        >
                          <div className="flex items-center gap-4">
                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${selectedReturnTrip === rt.id ? 'border-emerald-500 bg-emerald-500' : 'border-zinc-600'}`}>
                              {selectedReturnTrip === rt.id && <div className="w-2 h-2 rounded-full bg-white" />}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <MapPin size={14} className="text-blue-400" />
                                <span className="font-semibold text-sm">{rt.origin}</span>
                                <ArrowRight size={12} className="text-zinc-600" />
                                <MapPin size={14} className="text-green-400" />
                                <span className="font-semibold text-sm">{rt.destination}</span>
                              </div>
                              <div className="flex items-center gap-4 text-xs text-zinc-400">
                                <span><Clock size={12} className="inline mr-1" />{formatDate(rt.departure)} {formatTime(rt.departure)}</span>
                                <span><Bus size={12} className="inline mr-1" />{rt.bus?.name}</span>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-bold">{rt.calculatedPrice?.toLocaleString() || rt.price.toLocaleString()} {t('common.currency')}</p>
                              <p className="text-xs text-zinc-500">{available} {t('search.seatsLeft')}</p>
                            </div>
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>
                ) : (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-8 text-zinc-500">
                    <p>{t('roundtrip.noReturnTrips')}</p>
                  </motion.div>
                )}

                {selectedReturnTrip && (
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 text-xs text-zinc-500 text-center">
                    {isRTL ? '✓ تم اختيار رحلة العودة. اختر مقعدك في رحلة الذهاب من الأعلى' : '✓ Return trip selected. Choose your seat in the outbound trip above'}
                  </motion.p>
                )}
              </motion.div>
            )}

          </div>
        )}
      </div>
    </div>
  )
}
