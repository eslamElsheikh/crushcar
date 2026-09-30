'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Search, MapPin, Calendar, ArrowLeft, User, Phone, Ticket, CreditCard, Wallet, Minus, Plus } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { useLangStore } from '@/lib/lang'

export default function NewCompanyBooking() {
  const router = useRouter()
  const t = useLangStore((s) => s.t)
  const [step, setStep] = useState(1)
  const [stations, setStations] = useState<any[]>([])
  const [trips, setTrips] = useState<any[]>([])
  const [selectedTrip, setSelectedTrip] = useState<any>(null)
  const [selectedSeats, setSelectedSeats] = useState<string[]>([])
  const [passengers, setPassengers] = useState<Record<string, { name: string; phone: string; hotel: string }>>({})
  const [layout, setLayout] = useState<any>(null)
  const [tripStops, setTripStops] = useState<any[]>([])
  const [fromStationId, setFromStationId] = useState('')
  const [toStationId, setToStationId] = useState('')
  const [date, setDate] = useState('')
  const [customers, setCustomers] = useState<any[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [isNewCustomer, setIsNewCustomer] = useState(false)
  const [bookingType, setBookingType] = useState('FOR_EMPLOYEE')
  const [creditStatus, setCreditStatus] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    fetch('/api/stations', { credentials: 'include' }).then(r => r.json()).then(d => setStations(d.stations || []))
    fetch('/api/company/credit', { credentials: 'include' }).then(r => r.json()).then(setCreditStatus)
    fetch('/api/company/customers?take=100', { credentials: 'include' }).then(r => r.json()).then(d => setCustomers(d.data || []))
  }, [])

  useEffect(() => {
    if (selectedTrip) {
      const tripStopsData = selectedTrip.tripStops || []
      setTripStops(tripStopsData)
      if (selectedTrip.bus?.layout) {
        setLayout(selectedTrip.bus.layout)
      } else {
        fetch(`/api/trips/${selectedTrip.id}`, { credentials: 'include' }).then(r => r.json()).then(d => {
          setLayout(d.bus?.layout || null)
        })
      }
    }
  }, [selectedTrip])

  const searchTrips = async () => {
    if (!fromStationId || !toStationId || !date) {
      toast.error('Please select stations and date')
      return
    }
    setSearching(true)
    const res = await fetch(`/api/trips?fromStationId=${fromStationId}&toStationId=${toStationId}&date=${date}&all=true`, { credentials: 'include' })
    const data = await res.json()
    setTrips(data.data || [])
    setSearching(false)
    if (data.data?.length === 0) toast.error('No trips found')
  }

  const selectTrip = async (trip: any) => {
    setSelectedSeats([])
    setPassengers({})
    setStep(2)
    try {
      const res = await fetch(`/api/trips/${trip.id}`, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setSelectedTrip(data)
        if (data.bus?.layout) setLayout(data.bus.layout)
        if (data.tripStops) setTripStops(data.tripStops)
        return
      }
    } catch {}
    setSelectedTrip(trip)
  }

  const getBookedSeats = (): Set<string> => {
    if (!selectedTrip) return new Set()
    const booked = selectedTrip.bookings || []
    const companyBooked = selectedTrip.companyBookings || []
    const all = [...booked, ...companyBooked]
    return new Set(all
      .filter((b: any) => ['PENDING', 'PAID', 'BOARDED'].includes(b.status))
      .map((b: any) => b.seatLabel))
  }

  const toggleSeat = (label: string) => {
    setSelectedSeats(prev => {
      if (prev.includes(label)) {
        const next = prev.filter(s => s !== label)
        setPassengers(p => {
          const copy = { ...p }
          delete copy[label]
          return copy
        })
        return next
      }
      setPassengers(p => ({ ...p, [label]: { name: '', phone: '', hotel: '' } }))
      return [...prev, label]
    })
  }

  const updatePassenger = (seat: string, field: 'name' | 'phone' | 'hotel', value: string) => {
    setPassengers(prev => ({
      ...prev,
      [seat]: { ...prev[seat], [field]: value },
    }))
  }

  const confirmBooking = async () => {
    if (!selectedTrip || selectedSeats.length === 0) return

    const missing = selectedSeats.find(label => !passengers[label]?.name.trim())
    if (missing) {
      toast.error(`Passenger name required for seat ${missing}`)
      return
    }

    setLoading(true)
    const res = await fetch('/api/company/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        tripId: selectedTrip.id,
        passengers: selectedSeats.map(label => ({
          seatLabel: label,
          passengerName: passengers[label].name,
          passengerPhone: passengers[label].phone,
          passengerHotel: passengers[label].hotel || '',
        })),
        fromStationId: fromStationId || null,
        toStationId: toStationId || null,
        customerId: selectedCustomerId || null,
        bookingType,
      }),
    })
    const data = await res.json()
    setLoading(false)

    if (data.error) {
      toast.error(data.message || data.error)
    } else {
      toast.success(t('company.bookingSuccess'))
      router.push(`/company/bookings/${data.bookings?.[0]?.id || data.booking?.id}`)
    }
  }

  const bookedSeats = getBookedSeats()

  const seatCols = layout ? (layout.colsPerRow ? JSON.parse(layout.colsPerRow) : {}) : {}
  const maxCols = layout ? layout.cols : 4
  const aisleAfter = layout ? layout.aisleAfter : 2
  const rowLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']

  const totalPrice = selectedTrip
    ? selectedTrip.calculatedPrice || selectedTrip.price
    : 0

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <Link href="/company/bookings" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white transition text-sm">
        <ArrowLeft size={16} /> {t('company.bookings')}
      </Link>

      <div className="flex gap-4 mb-8">
        {[1, 2, 3].map(s => (
          <div key={s} className={`flex-1 h-1 rounded-full ${s <= step ? 'bg-blue-500' : 'bg-white/10'}`} />
        ))}
      </div>

      {step === 1 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl p-6 border border-white/5">
          <h2 className="text-xl font-bold text-white mb-6">Search Trips</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">From</label>
              <select value={fromStationId} onChange={e => setFromStationId(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-zinc-900 border border-white/10 text-white focus:outline-none focus:border-blue-500/50 text-sm [&>option]:bg-zinc-900 [&>option]:text-white">
                <option value="">Select</option>
                {stations.map((s: any) => <option key={s.id} value={s.id}>{s.name} - {s.city}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">To</label>
              <select value={toStationId} onChange={e => setToStationId(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-zinc-900 border border-white/10 text-white focus:outline-none focus:border-blue-500/50 text-sm [&>option]:bg-zinc-900 [&>option]:text-white">
                <option value="">Select</option>
                {stations.map((s: any) => <option key={s.id} value={s.id}>{s.name} - {s.city}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-blue-500/50 text-sm" />
            </div>
            <div className="flex items-end">
              <button onClick={searchTrips} disabled={searching} className="w-full py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white transition text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2">
                <Search size={16} /> {searching ? 'Searching...' : 'Search'}
              </button>
            </div>
          </div>

          {trips.length > 0 && (
            <div className="mt-6 space-y-3">
              {trips.map((trip: any) => (
                <div key={trip.id} className="p-4 rounded-xl bg-white/5 hover:bg-white/10 transition cursor-pointer border border-transparent hover:border-blue-500/30" onClick={() => selectTrip(trip)}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-6">
                      <div className="text-center">
                        <p className="text-lg font-bold text-white">{new Date(trip.departure).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                        <p className="text-xs text-zinc-500">{trip.origin}</p>
                      </div>
                      <div className="flex items-center gap-2 text-zinc-500">
                        <div className="w-16 h-px bg-zinc-600" />
                        <MapPin size={12} />
                        <div className="w-16 h-px bg-zinc-600" />
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-bold text-white">{new Date(trip.arrival).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                        <p className="text-xs text-zinc-500">{trip.destination}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-blue-400">{trip.price.toFixed(2)} EGP</p>
                      <p className="text-xs text-zinc-500">{trip.bus?.name}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {step === 2 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 glass rounded-2xl p-6 border border-white/5">
            <h2 className="text-xl font-bold text-white mb-2">Select Seats</h2>
            <p className="text-sm text-zinc-500 mb-6">
              {selectedSeats.length > 0
                ? `${selectedSeats.length} seat(s) selected: ${selectedSeats.join(', ')}`
                : 'Click seats to select. Select multiple seats.'}
            </p>
            {layout ? (
              <div className="flex justify-center">
                <div className="inline-block">
                  {rowLabels.slice(0, layout.rows).map((rowLabel, rowIdx) => {
                    const seatsInRow = seatCols[rowLabel] || maxCols
                    return (
                      <div key={rowLabel} className="flex items-center justify-center gap-1 mb-1">
                        {Array.from({ length: seatsInRow }, (_, colIdx) => {
                          const col = colIdx + 1
                          const label = `${rowLabel}${col}`
                          const isBooked = bookedSeats.has(label)
                          const isSelected = selectedSeats.includes(label)
                          return (
                            <button
                              key={label}
                              disabled={isBooked}
                              onClick={() => toggleSeat(label)}
                              className={`w-10 h-10 rounded-lg text-xs font-medium transition ${
                                isBooked ? 'bg-red-500/20 text-red-400 cursor-not-allowed' :
                                isSelected ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30 scale-110' :
                                'bg-white/10 text-zinc-300 hover:bg-white/20 hover:scale-105'
                              }`}
                            >
                              {label}
                            </button>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-zinc-500">Loading seat map...</div>
            )}
            <div className="flex items-center justify-center gap-6 mt-6 text-xs text-zinc-400">
              <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-white/10" /> Available</div>
              <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-blue-500" /> Selected</div>
              <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-red-500/20" /> Booked</div>
            </div>
          </div>

          <div className="glass rounded-2xl p-6 border border-white/5">
            <h3 className="text-lg font-bold text-white mb-4">Booking Details</h3>
            {selectedTrip && (
              <div className="space-y-4 text-sm">
                <div>
                  <p className="text-zinc-500">Route</p>
                  <p className="text-white">{selectedTrip.origin} → {selectedTrip.destination}</p>
                </div>
                <div>
                  <p className="text-zinc-500">Date</p>
                  <p className="text-white">{new Date(selectedTrip.departure).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-zinc-500">Seats</p>
                  <p className="text-white font-semibold">{selectedSeats.length > 0 ? selectedSeats.join(', ') : '-'}</p>
                </div>
                <div>
                  <p className="text-zinc-500">Price per seat</p>
                  <p className="text-blue-400 font-bold text-lg">{totalPrice.toFixed(2)} EGP</p>
                </div>
                {selectedSeats.length > 1 && (
                  <div>
                    <p className="text-zinc-500">Total</p>
                    <p className="text-emerald-400 font-bold text-lg">{(totalPrice * selectedSeats.length).toFixed(2)} EGP</p>
                  </div>
                )}
                {selectedSeats.length > 0 && (
                  <button onClick={() => setStep(3)} className="w-full py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white transition text-sm font-medium">
                    Continue ({selectedSeats.length} seat{selectedSeats.length > 1 ? 's' : ''})
                  </button>
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {step === 3 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl p-6 border border-white/5 max-w-3xl">
          <h2 className="text-xl font-bold text-white mb-6">Passenger Details</h2>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">{t('company.bookingType')}</label>
              <div className="flex gap-3">
                <button onClick={() => setBookingType('FOR_EMPLOYEE')} className={`flex-1 py-2 rounded-xl text-sm transition ${bookingType === 'FOR_EMPLOYEE' ? 'bg-blue-500 text-white' : 'bg-white/5 text-zinc-400'}`}>
                  {t('company.forEmployee')}
                </button>
                <button onClick={() => setBookingType('FOR_CLIENT')} className={`flex-1 py-2 rounded-xl text-sm transition ${bookingType === 'FOR_CLIENT' ? 'bg-blue-500 text-white' : 'bg-white/5 text-zinc-400'}`}>
                  {t('company.forClient')}
                </button>
              </div>
            </div>

            {bookingType === 'FOR_CLIENT' && (
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">{t('company.selectCustomer')}</label>
                <select value={selectedCustomerId} onChange={e => { setSelectedCustomerId(e.target.value); setIsNewCustomer(e.target.value === 'new') }} className="w-full px-3 py-2.5 rounded-xl bg-zinc-900 border border-white/10 text-white focus:outline-none focus:border-blue-500/50 text-sm [&>option]:bg-zinc-900 [&>option]:text-white">
                  <option value="">{t('company.newCustomer')}</option>
                  {customers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}

            <div className="border-t border-white/5 pt-4">
              <h3 className="text-sm font-semibold text-white mb-4">Passengers ({selectedSeats.length})</h3>
              <div className="space-y-4">
                {selectedSeats.map((seat, i) => (
                  <div key={seat} className="p-4 rounded-xl bg-white/5 border border-white/5">
                    <p className="text-xs text-blue-400 font-medium mb-3">Seat {seat}</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="relative">
                        <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                        <input
                          type="text"
                          value={passengers[seat]?.name || ''}
                          onChange={e => updatePassenger(seat, 'name', e.target.value)}
                          placeholder={`Passenger name for seat ${seat}`}
                          className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/50 text-sm"
                        />
                      </div>
                      <div className="relative">
                        <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                        <input
                          type="text"
                          value={passengers[seat]?.phone || ''}
                          onChange={e => updatePassenger(seat, 'phone', e.target.value)}
                          placeholder={`Phone for seat ${seat}`}
                          className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/50 text-sm"
                        />
                      </div>
                      <div className="relative">
                        <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                        <input
                          type="text"
                          value={passengers[seat]?.hotel || ''}
                          onChange={e => updatePassenger(seat, 'hotel', e.target.value)}
                          placeholder={`Hotel for seat ${seat}`}
                          className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/50 text-sm"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {creditStatus && (
              <div className="p-4 rounded-xl bg-white/5 space-y-2 text-sm">
                <p className="text-zinc-400 font-medium">Payment Summary</p>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500 flex items-center gap-2"><Wallet size={14} /> Wallet</span>
                  <span className="text-emerald-400">{creditStatus.walletBalance.toFixed(2)} EGP</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500 flex items-center gap-2"><CreditCard size={14} /> Credit Available</span>
                  <span className="text-blue-400">{creditStatus.availableCredit.toFixed(2)} EGP</span>
                </div>
                <div className="flex items-center justify-between border-t border-white/5 pt-2">
                  <span className="text-zinc-500 font-medium">Total Due</span>
                  <span className="text-white font-bold">{(totalPrice * selectedSeats.length).toFixed(2)} EGP</span>
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <button onClick={() => setStep(2)} className="px-6 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 transition text-sm">
                Back
              </button>
              <button onClick={confirmBooking} disabled={loading || selectedSeats.length === 0} className="flex-1 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white transition text-sm font-medium disabled:opacity-50">
                {loading ? 'Booking...' : `Confirm Booking (${selectedSeats.length} seat${selectedSeats.length > 1 ? 's' : ''})`}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  )
}
