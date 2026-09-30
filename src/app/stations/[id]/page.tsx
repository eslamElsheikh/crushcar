'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { MapPin, Bus, Clock, ArrowLeft, Loader2, Calendar, ArrowRight } from 'lucide-react'
import { useLangStore } from '@/lib/lang'
import { cn } from '@/lib/utils'

interface Trip {
  id: string
  origin: string
  destination: string
  departure: string
  arrival: string
  price: number
  status: string
  bus: { name: string }
  availableSeats: number
  routeStops: Array<{ name: string; order: number }>
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
}

export default function StationDetailPage() {
  const params = useParams()
  const router = useRouter()
  const stationId = params.id as string
  const t = useLangStore((s) => s.t)
  const lang = useLangStore((s) => s.lang)
  const isRTL = lang === 'ar'

  const [station, setStation] = useState<{ name: string; city: string } | null>(null)
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadTrips()
  }, [stationId])

  async function loadTrips() {
    try {
      const res = await fetch(`/api/stations/${stationId}/trips`)
      if (res.ok) {
        const data = await res.json()
        setStation(data.station)
        setTrips(data.trips || [])
      } else {
        router.push('/stations')
      }
    } catch {
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={cn('min-h-screen bg-background', isRTL && 'font-[Cairo]')} dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header */}
      <header className="glass border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link href="/stations" className="p-2 rounded-xl hover:bg-white/5 transition">
            <ArrowLeft size={18} className="text-zinc-400" />
          </Link>
          <div>
            <h1 className="text-xl font-display font-bold text-white">
              {t('stations.tripsFrom')} {station?.name || '...'}
            </h1>
            <p className="text-xs text-zinc-400">{station?.city}</p>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={32} className="animate-spin text-blue-400" />
          </div>
        ) : trips.length === 0 ? (
          <div className="text-center py-20 glass rounded-2xl border border-zinc-800">
            <Bus size={48} className="mx-auto text-zinc-700 mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">
              {t('stations.noTripsFrom')}
            </h3>
            <Link href="/trips" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-medium text-sm transition mt-4">
              {isRTL ? 'تصفح الرحلات' : 'Browse Trips'}
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {trips.map((trip, i) => {
              const isAvailable = trip.status === 'SCHEDULED' && new Date(trip.departure) > new Date()
              return (
                <motion.div
                  key={trip.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={cn(
                    'glass rounded-xl p-6 border transition',
                    isAvailable ? 'border-white/5 hover:border-blue-500/20' : 'border-zinc-800/50 opacity-60'
                  )}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    {/* Route info */}
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="flex items-center gap-1.5">
                          <MapPin size={14} className="text-blue-400" />
                          <span className="font-semibold text-white">{trip.origin}</span>
                        </div>
                        <span className="text-zinc-600">{isRTL ? '←' : '→'}</span>
                        <span className="font-semibold text-white">{trip.destination}</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-sm text-zinc-400">
                        <span className="flex items-center gap-1.5">
                          <Calendar size={13} />
                          {formatDate(trip.departure)}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Clock size={13} />
                          {formatTime(trip.departure)}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Bus size={13} />
                          {trip.bus.name}
                        </span>
                      </div>

                      {/* Route stops */}
                      {trip.routeStops.length > 2 && (
                        <div className="flex flex-wrap items-center gap-1.5 mt-3 text-xs text-zinc-500">
                          {trip.routeStops.map((stop, idx) => (
                            <span key={stop.order} className="flex items-center gap-1.5">
                              <span className={cn(
                                stop.name === trip.origin ? 'text-blue-400' :
                                stop.name === trip.destination ? 'text-emerald-400' :
                                'text-zinc-500'
                              )}>
                                {stop.name}
                              </span>
                              {idx < trip.routeStops.length - 1 && (
                                <span className="text-zinc-700">{isRTL ? '←' : '→'}</span>
                              )}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Price & CTA */}
                    <div className="flex items-center gap-4 sm:flex-shrink-0">
                      <div className="text-left">
                        <p className="text-xl font-display font-bold text-white">
                          {Math.round(trip.price).toLocaleString()}
                        </p>
                        <p className="text-xs text-zinc-500">{isRTL ? 'ج.م' : 'EGP'}</p>
                      </div>
                      {isAvailable ? (
                        <Link
                          href={`/trips/${trip.id}`}
                          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold transition"
                        >
                          {t('stations.bookNow')}
                          <ArrowRight size={14} className={isRTL ? 'rotate-180' : undefined} />
                        </Link>
                      ) : (
                        <span className="text-xs text-zinc-500 px-4 py-2">
                          {trip.status === 'SCHEDULED' ? (isRTL ? 'لم يبدأ الحجز' : 'Not yet open') :
                           trip.status === 'IN_PROGRESS' ? (isRTL ? 'جارية' : 'In progress') :
                           (isRTL ? 'انتهت' : 'Completed')}
                        </span>
                      )}
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
