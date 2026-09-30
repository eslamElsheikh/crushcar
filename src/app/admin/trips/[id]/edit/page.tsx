'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowLeft, Loader2, ChevronUp, ChevronDown, Trash2 } from 'lucide-react'
import { useLangStore } from '@/lib/lang'
import { cn } from '@/lib/utils'

interface Station { id: string; name: string; city: string }
interface StopDraft { stationId: string; name: string; stopOrder: number; priceFromOrigin: number; arrivalTime: string; departureTime: string }

function normalizeName(s: string) {
  return s.replace(/[ة]/g, 'ه').replace(/[أإآ]/g, 'ا').replace(/[ى]/g, 'ي').trim()
}

export default function EditTripPage() {
  const router = useRouter()
  const params = useParams()
  const tripId = params.id as string
  const t = useLangStore((s) => s.t)
  const lang = useLangStore((s) => s.lang)
  const isRTL = lang === 'ar'
  const [buses, setBuses] = useState<any[]>([])
  const [stations, setStations] = useState<Station[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ busId: '', departure: '', arrival: '', status: 'SCHEDULED' })
  const [stops, setStops] = useState<StopDraft[]>([])
  const [busStationWarning, setBusStationWarning] = useState('')
  const initialLoadDone = useRef(false)

  useEffect(() => {
    if (!tripId) return
    Promise.all([
      fetch('/api/buses', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/stations', { credentials: 'include' }).then(r => r.json()),
      fetch(`/api/trips/${tripId}`, { credentials: 'include' }).then(r => r.json()),
    ]).then(([busesData, stationsData, tripData]) => {
      const allStations = stationsData.stations || stationsData
      setBuses(busesData)
      setStations(allStations)

      const dep = new Date(tripData.departure)
      const arr = new Date(tripData.arrival)
      const fmt = (d: Date) => d.toISOString().slice(0, 16)

      setForm({
        busId: tripData.busId || '',
        departure: fmt(dep),
        arrival: fmt(arr),
        status: tripData.status || 'SCHEDULED',
      })

      // Parse existing tripStops or fall back to old stopsJson
      const existingStops: StopDraft[] = []
      if (tripData.tripStops && Array.isArray(tripData.tripStops) && tripData.tripStops.length > 0) {
        tripData.tripStops.forEach((ts: any) => {
          const station = allStations.find((s: Station) => s.id === ts.stationId)
          existingStops.push({
            stationId: ts.stationId,
            name: station?.name || ts.station?.name || '',
            stopOrder: ts.stopOrder,
            priceFromOrigin: ts.priceFromOrigin,
            arrivalTime: ts.arrivalTime ? new Date(ts.arrivalTime).toTimeString().slice(0, 5) : '',
            departureTime: ts.departureTime ? new Date(ts.departureTime).toTimeString().slice(0, 5) : '',
          })
        })
      } else if (tripData.stopsJson && tripData.stopsJson !== '[]') {
        try {
          const parsed = JSON.parse(tripData.stopsJson)
          parsed.forEach((s: any, i: number) => {
            existingStops.push({
              stationId: s.stationId || `fallback-${i}`,
              name: s.name,
              stopOrder: s.order || i + 1,
              priceFromOrigin: s.priceFromOrigin || s.price || Math.round(tripData.price / (parsed.length - 1) * i),
              arrivalTime: s.arrivalTime || '',
              departureTime: s.departureTime || '',
            })
          })
        } catch {}
      }

      if (existingStops.length > 0) setStops(existingStops)
      setLoading(false)
      initialLoadDone.current = true
    })
  }, [tripId])

  // When bus changes after initial load and no existing stops → auto-populate from BusStations
  useEffect(() => {
    if (!initialLoadDone.current) return
    if (!form.busId) return
    setBusStationWarning('')
    fetch(`/api/buses/${form.busId}/stations`)
      .then(r => r.json())
      .then((data: { name: string; order: number }[]) => {
        if (data.length === 0) return
        // Only auto-populate if stops are empty (no existing trip stops)
        if (stops.length > 0) return
        const matched: StopDraft[] = []
        const unmatched: string[] = []
        data.forEach((bs, idx) => {
          const bsNorm = normalizeName(bs.name)
          const found = stations.find(s => normalizeName(s.name) === bsNorm)
          if (found) {
            matched.push({
              stationId: found.id,
              name: found.name,
              stopOrder: idx + 1,
              priceFromOrigin: idx > 0 ? matched[idx - 1].priceFromOrigin + 50 : 0,
              arrivalTime: '',
              departureTime: '',
            })
          } else {
            unmatched.push(bs.name)
          }
        })
        if (matched.length > 0) {
          setStops(matched)
        }
        if (unmatched.length > 0) {
          setBusStationWarning(
            isRTL
              ? `المحطات التالية غير موجودة في قائمة المحطات: ${unmatched.join('، ')}. أضفها أولاً من صفحة الباصات.`
              : `Stations not found in Station table: ${unmatched.join(', ')}. Add them first from the bus page.`
          )
        }
      })
      .catch(() => {})
  }, [form.busId])

  const availableStations = stations.filter(s => !stops.find(st => st.stationId === s.id))
  const firstStop = stops[0]
  const lastStop = stops[stops.length - 1]

  function addStop(station: Station) {
    setStops([...stops, {
      stationId: station.id,
      name: station.name,
      stopOrder: stops.length + 1,
      priceFromOrigin: stops.length > 0 ? stops[stops.length - 1].priceFromOrigin + 50 : 0,
      arrivalTime: '',
      departureTime: '',
    }])
  }

  function removeStop(index: number) {
    setStops(stops.filter((_, i) => i !== index).map((s, i) => ({ ...s, stopOrder: i + 1 })))
  }

  function moveStop(index: number, direction: -1 | 1) {
    const newStops = [...stops]
    const target = index + direction
    if (target < 0 || target >= newStops.length) return
    ;[newStops[index], newStops[target]] = [newStops[target], newStops[index]]
    setStops(newStops.map((s, i) => ({ ...s, stopOrder: i + 1 })))
  }

  function updateStop(index: number, field: keyof StopDraft, value: any) {
    const newStops = [...stops]
    ;(newStops[index] as any)[field] = value
    setStops(newStops)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (stops.length < 2) return
    setSaving(true)

    const body = {
      busId: form.busId,
      departure: new Date(form.departure).toISOString(),
      arrival: new Date(form.arrival).toISOString(),
      status: form.status,
      stops: stops.map(s => ({
        stationId: s.stationId,
        stopOrder: s.stopOrder,
        priceFromOrigin: s.priceFromOrigin,
        arrivalTime: s.arrivalTime ? new Date(`${form.departure.split('T')[0]}T${s.arrivalTime}`).toISOString() : null,
        departureTime: s.departureTime ? new Date(`${form.departure.split('T')[0]}T${s.departureTime}`).toISOString() : null,
      })),
    }

    await fetch(`/api/trips/${tripId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSaving(false)
    router.push('/admin/trips')
  }

  if (loading) {
    return (<div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>)
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => router.push('/admin/trips')} className="p-2 rounded-lg glass hover:bg-zinc-800/50 transition"><ArrowLeft size={20} /></button>
        <div>
          <h1 className="text-2xl font-display font-bold">{t('editTrip.title')}</h1>
          <p className="text-zinc-400 mt-1">{t('editTrip.update')}</p>
        </div>
      </div>

      <motion.form initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} onSubmit={handleSubmit} className="glass rounded-2xl p-8 space-y-6">
        <div className="grid sm:grid-cols-2 gap-6">
          <div>
            <label className="text-sm text-zinc-400 mb-2 block">{t('trips.bus')}</label>
            <select value={form.busId} onChange={(e) => setForm({ ...form, busId: e.target.value })} className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-blue-500 focus:outline-none transition" required>
              <option value="">--</option>
              {buses.map((bus) => <option key={bus.id} value={bus.id}>{bus.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm text-zinc-400 mb-2 block">{t('trips.status')}</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-blue-500 focus:outline-none transition">
              <option value="SCHEDULED">{t('status.scheduled')}</option>
              <option value="IN_PROGRESS">{t('status.inProgress')}</option>
              <option value="COMPLETED">{t('status.completed')}</option>
              <option value="CANCELLED">{t('status.cancelled')}</option>
            </select>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-6">
          <div><label className="text-sm text-zinc-400 mb-2 block">{t('trips.departure')}</label><input type="datetime-local" value={form.departure} onChange={(e) => setForm({ ...form, departure: e.target.value })} className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-blue-500 focus:outline-none transition" required /></div>
          <div><label className="text-sm text-zinc-400 mb-2 block">{t('trips.arrival')}</label><input type="datetime-local" value={form.arrival} onChange={(e) => setForm({ ...form, arrival: e.target.value })} className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-blue-500 focus:outline-none transition" required /></div>
        </div>

        {/* Bus station warning */}
        {busStationWarning && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm">
            {busStationWarning}
          </div>
        )}

        {/* Stops section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm text-zinc-400">Route Stops (المحطات)</label>
            {stops.length >= 2 && (
              <span className="text-xs text-green-400 bg-green-500/10 px-2 py-1 rounded-full">
                {firstStop?.name} {isRTL ? '←' : '→'} {lastStop?.name} = {lastStop?.priceFromOrigin} EGP
              </span>
            )}
          </div>

          {stops.length === 0 && (
            <div className="text-center py-8 text-zinc-600 text-sm">
              أضف محطات الرحلة
            </div>
          )}

          <div className="space-y-2 mb-4">
            {stops.map((stop, i) => (
              <div key={i} className="flex items-start gap-2 bg-zinc-800/30 rounded-xl p-3">
                <div className="flex flex-col gap-1 pt-1">
                  <button type="button" onClick={() => moveStop(i, -1)} disabled={i === 0} className="p-0.5 rounded bg-zinc-700/50 hover:bg-zinc-600 disabled:opacity-20 text-zinc-400"><ChevronUp size={12} /></button>
                  <button type="button" onClick={() => moveStop(i, 1)} disabled={i === stops.length - 1} className="p-0.5 rounded bg-zinc-700/50 hover:bg-zinc-600 disabled:opacity-20 text-zinc-400"><ChevronDown size={12} /></button>
                </div>
                <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-400 shrink-0 mt-1">{stop.stopOrder}</div>
                <div className="flex-1 grid sm:grid-cols-4 gap-2">
                  <div>
                    <label className="text-[10px] text-zinc-500">Station</label>
                    <div className="text-sm font-medium text-white px-2 py-1.5 rounded bg-zinc-800/50">{stop.name}</div>
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500">Price from Origin</label>
                    <input type="number" value={stop.priceFromOrigin} onChange={(e) => updateStop(i, 'priceFromOrigin', Number(e.target.value))} className="w-full px-2 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-blue-500 focus:outline-none transition text-sm" min={0} />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500">Arrival</label>
                    <input type="time" value={stop.arrivalTime} onChange={(e) => updateStop(i, 'arrivalTime', e.target.value)} className="w-full px-2 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-blue-500 focus:outline-none transition text-sm" />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500">Departure</label>
                    <input type="time" value={stop.departureTime} onChange={(e) => updateStop(i, 'departureTime', e.target.value)} className="w-full px-2 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-blue-500 focus:outline-none transition text-sm" />
                  </div>
                </div>
                <button type="button" onClick={() => removeStop(i)} className="p-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition mt-1"><Trash2 size={12} /></button>
              </div>
            ))}
          </div>

          {availableStations.length > 0 && (
            <div className="flex gap-2">
              <select
                value=""
                onChange={(e) => {
                  const station = stations.find(s => s.id === e.target.value)
                  if (station) addStop(station)
                }}
                className="flex-1 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-blue-500 focus:outline-none transition text-sm"
              >
                <option value="">{t('station.selectStation')}</option>
                {availableStations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}

          {stops.length >= 2 && (
            <div className="mt-4 p-4 rounded-xl bg-zinc-800/20 border border-zinc-800">
              <p className="text-xs text-zinc-500 mb-2 font-medium">Price Preview:</p>
              <div className="space-y-1 text-xs">
                {stops.slice(0, -1).map((from, i) =>
                  stops.slice(i + 1).map((to, j) => (
                    <div key={`${i}-${j}`} className="flex justify-between text-zinc-400">
                      <span>{from.name} {isRTL ? '←' : '→'} {to.name}</span>
                      <span className="font-mono text-green-400">{to.priceFromOrigin - from.priceFromOrigin} EGP</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={() => router.push('/admin/trips')} className="flex-1 py-3 rounded-lg glass hover:bg-zinc-800/50 text-zinc-400 font-medium transition">{t('common.cancel')}</button>
          <button type="submit" disabled={saving || stops.length < 2} className="flex-1 py-3 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-medium transition flex items-center justify-center gap-2">
            {saving && <Loader2 size={16} className="animate-spin" />} {t('editTrip.save')}
          </button>
        </div>
      </motion.form>
    </div>
  )
}
