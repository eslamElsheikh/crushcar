'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { MapPin, Search, Bus, Clock, ArrowLeft, Loader2, Navigation, ExternalLink } from 'lucide-react'
import { useLangStore } from '@/lib/lang'
import { cn } from '@/lib/utils'

const EGYPTIAN_CITIES = [
  'القاهرة', 'الجيزة', 'الإسكندرية', 'المنصورة', 'طنطا',
  'أسيوط', 'سوهاج', 'قنا', 'الأقصر', 'أسوان',
  'المنيا', 'بني سويف', 'الفيوم', 'الشرقية', 'الدقهلية',
  'كفر الشيخ', 'الغربية', 'البحيرة', 'المنوفية', 'القليوبية',
  'بورسعيد', 'الإسماعيلية', 'السويس', 'دمياط', 'شمال سيناء',
  'جنوب سيناء', 'البحر الأحمر', 'الوادي الجديد', 'مطروح',
  'بنها', 'الزقازيق', 'بلبيس', 'شبين الكوم',
  'دمنهور', 'رشيد', 'العريش', 'الغردقة', 'شرم الشيخ',
  'مرسى مطروح', 'العين السخنة', '6 أكتوبر', 'العبور',
  'العاشر من رمضان', 'مدينة نصر', 'حلوان', 'المعادي',
]

interface Station {
  id: string
  name: string
  city: string
  tripCount: number
  lat?: number | null
  lng?: number | null
}

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
  return d.toLocaleDateString('ar-EG', { weekday: 'long', month: 'long', day: 'numeric' })
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
}

export default function StationsPage() {
  const t = useLangStore((s) => s.t)
  const lang = useLangStore((s) => s.lang)
  const isRTL = lang === 'ar'

  const [stations, setStations] = useState<Station[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedCity, setSelectedCity] = useState('')
  const [selectedStation, setSelectedStation] = useState<Station | null>(null)
  const [cityTrips, setCityTrips] = useState<Trip[]>([])
  const [loadingTrips, setLoadingTrips] = useState(false)
  const [citiesFromAPI, setCitiesFromAPI] = useState<string[]>([])

  const allCities = [...new Set([...EGYPTIAN_CITIES, ...citiesFromAPI])].sort()

  const cityCounts = stations.reduce((acc, s) => {
    acc[s.city] = (acc[s.city] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  useEffect(() => {
    loadStations()
  }, [])

  async function loadStations() {
    try {
      const res = await fetch(`/api/stations?q=${search}&city=${selectedCity}`)
      if (res.ok) {
        const data = await res.json()
        setStations(data.stations || [])
        setCitiesFromAPI(data.cities || [])
      }
    } catch {
    } finally {
      setLoading(false)
    }
  }

  async function loadStationTrips(station: Station) {
    setSelectedStation(station)
    setLoadingTrips(true)
    try {
      const res = await fetch(`/api/stations/${station.id}/trips`)
      if (res.ok) {
        const data = await res.json()
        setCityTrips(data.trips || [])
      }
    } catch {
      setCityTrips([])
    } finally {
      setLoadingTrips(false)
    }
  }

  const filteredStations = selectedCity
    ? stations.filter(s => s.city === selectedCity)
    : stations

  return (
    <div className={cn('min-h-screen bg-background', isRTL && 'font-[Cairo]')} dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header */}
      <header className="glass border-b border-border sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link href="/" className="p-2 rounded-xl hover:bg-white/5 transition">
            <ArrowLeft size={18} className="text-zinc-400" />
          </Link>
          <div>
            <h1 className="text-xl font-display font-bold text-white">{t('stations.pageTitle')}</h1>
            <p className="text-xs text-zinc-400">{t('stations.pageDesc')}</p>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Search */}
        <div className="relative mb-6">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setTimeout(loadStations, 300) }}
            placeholder={t('stations.searchPlaceholder')}
            className="w-full pl-10 pr-4 py-3 rounded-xl bg-zinc-900/80 border border-white/5 focus:border-blue-500/50 focus:outline-none text-white text-sm placeholder:text-zinc-600"
          />
        </div>

        {/* City Tabs */}
        <div className="mb-8">
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            <button
              onClick={() => { setSelectedCity(''); setSelectedStation(null); setCityTrips([]) }}
              className={cn(
                'flex-shrink-0 px-5 py-2.5 rounded-xl text-sm font-medium transition border',
                !selectedCity
                  ? 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                  : 'glass border-white/5 text-zinc-400 hover:text-white hover:bg-white/5'
              )}
            >
              {t('stations.allCities')}
            </button>
            {allCities.map(city => {
              const count = cityCounts[city] || 0
              if (count === 0 && !citiesFromAPI.includes(city)) return null
              return (
                <button
                  key={city}
                  onClick={() => { setSelectedCity(city); setSelectedStation(null); setCityTrips([]) }}
                  className={cn(
                    'flex-shrink-0 px-5 py-2.5 rounded-xl text-sm font-medium transition border flex items-center gap-2',
                    selectedCity === city
                      ? 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                      : 'glass border-white/5 text-zinc-400 hover:text-white hover:bg-white/5'
                  )}
                >
                  <MapPin size={12} />
                  {city}
                  {count > 0 && (
                    <span className={cn(
                      'text-xs px-2 py-0.5 rounded-full',
                      selectedCity === city ? 'bg-blue-500/20 text-blue-300' : 'bg-zinc-800 text-zinc-500'
                    )}>
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {selectedCity && (
          <div className="mb-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <MapPin size={18} className="text-blue-400" />
              {selectedCity}
              <span className="text-sm text-zinc-500 font-normal">
                ({filteredStations.length} {isRTL ? 'محطة' : 'stations'})
              </span>
            </h2>
          </div>
        )}

        {/* Stations Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={32} className="animate-spin text-blue-400" />
          </div>
        ) : filteredStations.length === 0 ? (
          <div className="text-center py-20 glass rounded-2xl border border-zinc-800">
            <MapPin size={48} className="mx-auto text-zinc-700 mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">
              {t('stations.noStations')}
            </h3>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {filteredStations.map((station, i) => (
              <motion.div
                key={station.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                <button
                  onClick={() => loadStationTrips(station)}
                  className={cn(
                    'w-full text-left glass rounded-xl p-6 border transition group',
                    selectedStation?.id === station.id
                      ? 'border-blue-500/30 bg-blue-500/5'
                      : 'border-white/5 hover:border-blue-500/20 hover:bg-blue-500/5'
                  )}
                >
                  <div className="flex items-start gap-4 mb-4">
                    <div className={cn(
                      'w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition',
                      selectedStation?.id === station.id
                        ? 'bg-blue-500/20'
                        : 'bg-blue-500/10 group-hover:bg-blue-500/20'
                    )}>
                      <MapPin size={20} className="text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-white text-lg">{station.name}</h3>
                      <p className="text-sm text-zinc-400">{station.city}</p>
                      {station.lat && station.lng && (
                        <p className="text-xs text-zinc-600 mt-1 font-mono">
                          {station.lat.toFixed(4)}, {station.lng.toFixed(4)}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Map placeholder */}
                  {station.lat && station.lng && (
                    <div className="rounded-lg overflow-hidden mb-4 bg-zinc-800/50 h-32 relative">
                      <iframe
                        src={`https://www.openstreetmap.org/export/embed.html?bbox=${station.lng - 0.01},${station.lat - 0.005},${station.lng + 0.01},${station.lat + 0.005}&layer=mapnik&marker=${station.lat},${station.lng}`}
                        className="w-full h-full border-0 opacity-70"
                        loading="lazy"
                      />
                      <a
                        href={`https://www.google.com/maps?q=${station.lat},${station.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 rounded-lg bg-black/70 text-white text-xs hover:bg-black/90 transition"
                      >
                        <ExternalLink size={10} />
                        {isRTL ? 'افتح الخريطة' : 'Open Map'}
                      </a>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <Bus size={12} />
                      <span>{station.tripCount} {t('stations.tripsCount')}</span>
                    </div>
                    {selectedStation?.id === station.id && (
                      <span className="text-xs text-blue-400 font-medium">
                        {isRTL ? 'عرض الرحلات ↓' : 'View trips ↓'}
                      </span>
                    )}
                  </div>
                </button>
              </motion.div>
            ))}
          </div>
        )}

        {/* Trips for selected station */}
        <AnimatePresence>
          {selectedStation && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="mt-8"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Bus size={18} className="text-blue-400" />
                  {t('stations.tripsFrom')} {selectedStation.name}
                </h2>
                <button
                  onClick={() => { setSelectedStation(null); setCityTrips([]) }}
                  className="text-sm text-zinc-500 hover:text-white transition"
                >
                  {isRTL ? 'إغلاق' : 'Close'}
                </button>
              </div>

              {loadingTrips ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={24} className="animate-spin text-blue-400" />
                </div>
              ) : cityTrips.length === 0 ? (
                <div className="text-center py-12 glass rounded-2xl border border-zinc-800">
                  <Bus size={36} className="mx-auto text-zinc-700 mb-3" />
                  <p className="text-zinc-500 text-sm">{t('stations.noTripsFrom')}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {cityTrips.map((trip, i) => {
                    const isAvailable = trip.status === 'SCHEDULED' && new Date(trip.departure) > new Date()
                    return (
                      <motion.div
                        key={trip.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className={cn(
                          'glass rounded-xl p-5 border transition',
                          isAvailable ? 'border-white/5 hover:border-blue-500/20' : 'border-zinc-800/50 opacity-60'
                        )}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <span className="font-semibold text-white">{trip.origin}</span>
                              <span className="text-zinc-600">{isRTL ? '←' : '→'}</span>
                              <span className="font-semibold text-white">{trip.destination}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-4 text-sm text-zinc-400">
                              <span className="flex items-center gap-1.5">
                                <Clock size={13} />
                                {formatDate(trip.departure)} · {formatTime(trip.departure)}
                              </span>
                              <span className="flex items-center gap-1.5">
                                <Bus size={13} />
                                {trip.bus.name}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 sm:flex-shrink-0">
                            <div className="text-left">
                              <p className="text-xl font-bold text-white">{Math.round(trip.price).toLocaleString()}</p>
                              <p className="text-xs text-zinc-500">{isRTL ? 'ج.م' : 'EGP'}</p>
                            </div>
                            {isAvailable ? (
                              <Link
                                href={`/trips/${trip.id}`}
                                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold transition"
                              >
                                {t('stations.bookNow')}
                              </Link>
                            ) : (
                              <span className="text-xs text-zinc-500 px-3 py-2">
                                {trip.status === 'SCHEDULED' ? (isRTL ? 'لم يبدأ' : 'Not yet') :
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
