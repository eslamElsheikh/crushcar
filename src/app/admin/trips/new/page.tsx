'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useLangStore } from '@/lib/lang'
import { governoratesList } from '@/lib/governorates'

interface Bus { id: string; name: string; type: string }

export default function NewTripPage() {
  const router = useRouter()
  const [buses, setBuses] = useState<Bus[]>([])
  const [saving, setSaving] = useState(false)
  const t = useLangStore((s) => s.t)
  const [form, setForm] = useState({
    busId: '', origin: '', destination: '', departure: '', arrival: '', price: '',
  })

  useEffect(() => {
    fetch('/api/buses').then((r) => r.json()).then(setBuses)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const res = await fetch('/api/trips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, price: Number(form.price) }),
    })
    setSaving(false)
    if (res.ok) router.push('/admin/trips')
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => router.push('/admin/trips')} className="p-2 rounded-lg glass hover:bg-zinc-800/50 transition"><ArrowLeft size={20} /></button>
        <div>
          <h1 className="text-2xl font-display font-bold">{t('trips.addTrip')}</h1>
          <p className="text-zinc-400 mt-1">{t('trips.manage')}</p>
        </div>
      </div>

      <motion.form initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} onSubmit={handleSubmit} className="glass rounded-2xl p-8 space-y-6">
        <div className="grid sm:grid-cols-2 gap-6">
          <div>
            <label className="text-sm text-zinc-400 mb-2 block">{t('trips.origin')}</label>
            <select value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-blue-500 focus:outline-none transition" required>
              <option value="">--</option>
              {governoratesList.map((g) => <option key={g.value} value={g.label}>{g.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm text-zinc-400 mb-2 block">{t('trips.destination')}</label>
            <select value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-blue-500 focus:outline-none transition" required>
              <option value="">--</option>
              {governoratesList.map((g) => <option key={g.value} value={g.label}>{g.label}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="text-sm text-zinc-400 mb-2 block">{t('trips.bus')}</label>
          <select value={form.busId} onChange={(e) => setForm({ ...form, busId: e.target.value })} className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-blue-500 focus:outline-none transition" required>
            <option value="">--</option>
            {buses.map((bus) => <option key={bus.id} value={bus.id}>{bus.name}</option>)}
          </select>
        </div>

        <div className="grid sm:grid-cols-2 gap-6">
          <div><label className="text-sm text-zinc-400 mb-2 block">{t('trips.departure')}</label><input type="datetime-local" value={form.departure} onChange={(e) => setForm({ ...form, departure: e.target.value })} className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-blue-500 focus:outline-none transition" required /></div>
          <div><label className="text-sm text-zinc-400 mb-2 block">{t('trips.arrival')}</label><input type="datetime-local" value={form.arrival} onChange={(e) => setForm({ ...form, arrival: e.target.value })} className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-blue-500 focus:outline-none transition" required /></div>
        </div>

        <div>
          <label className="text-sm text-zinc-400 mb-2 block">{t('trips.price')} ({t('common.currency')})</label>
          <input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-blue-500 focus:outline-none transition" placeholder="50" min={1} required />
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={() => router.push('/admin/trips')} className="flex-1 py-3 rounded-lg glass hover:bg-zinc-800/50 text-zinc-400 font-medium transition">{t('common.cancel')}</button>
          <button type="submit" disabled={saving} className="flex-1 py-3 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-medium transition flex items-center justify-center gap-2">{saving && <Loader2 size={16} className="animate-spin" />} {t('buses.create')}</button>
        </div>
      </motion.form>
    </div>
  )
}