'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Bus, Plus, Settings, Trash2, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Bus {
  id: string
  name: string
  type: string
  seatCount: number
  layout?: { seats: any[] }
  company?: { name: string }
}

const busTypes = [
  { value: 'MINI_BUS', label: 'Mini Bus' },
  { value: 'COACH_BUS', label: 'Coach Bus' },
  { value: 'VIP_BUS', label: 'VIP Bus' },
  { value: 'DOUBLE_DECKER', label: 'Double Decker' },
]

export default function AdminBusesPage() {
  const router = useRouter()
  const [buses, setBuses] = useState<Bus[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ name: '', type: 'COACH_BUS', companyId: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadBuses()
  }, [])

  async function loadBuses() {
    const res = await fetch('/api/buses')
    const data = await res.json()
    setBuses(data)
    setLoading(false)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const res = await fetch('/api/buses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, seatCount: 0 }),
    })
    const data = await res.json()
    setSaving(false)
    if (res.ok) {
      setShowModal(false)
      setForm({ name: '', type: 'COACH_BUS', companyId: '' })
      loadBuses()
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this bus?')) return
    await fetch(`/api/buses/${id}`, { method: 'DELETE' })
    loadBuses()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-display font-bold">Buses</h1>
          <p className="text-zinc-400 mt-1">Manage your fleet</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition"
        >
          <Plus size={16} /> Add Bus
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : buses.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-20">
          <Bus size={48} className="mx-auto text-zinc-700 mb-4" />
          <h3 className="text-lg font-medium mb-2">No buses yet</h3>
          <p className="text-zinc-500 mb-6">Add your first bus to get started</p>
          <button
            onClick={() => setShowModal(true)}
            className="px-6 py-3 rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-medium transition"
          >
            Add First Bus
          </button>
        </motion.div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {buses.map((bus, i) => (
            <motion.div
              key={bus.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="glass rounded-xl p-6 hover:bg-zinc-800/30 transition group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                  <Bus size={24} className="text-blue-400" />
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => router.push(`/admin/buses/${bus.id}/layout`)}
                    className="p-2 rounded-lg text-zinc-500 hover:text-blue-400 hover:bg-blue-500/5 transition"
                    title="Design layout"
                  >
                    <Settings size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(bus.id)}
                    className="p-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/5 transition"
                    title="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <h3 className="font-semibold mb-1">{bus.name}</h3>
              <p className="text-sm text-zinc-400 mb-3">
                {busTypes.find((t) => t.value === bus.type)?.label || bus.type}
              </p>
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-500">
                  {bus.layout?.seats?.length || 0} seats configured
                </span>
                <button
                  onClick={() => router.push(`/admin/buses/${bus.id}/layout`)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                    (bus.layout?.seats?.length || 0) > 0
                      ? 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20'
                      : 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                  }`}
                >
                  {(bus.layout?.seats?.length || 0) > 0 ? 'Edit Layout' : 'Design Layout'}
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Create Bus Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowModal(false)} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative glass rounded-2xl p-8 w-full max-w-md"
          >
            <h2 className="text-xl font-display font-bold mb-6">Add New Bus</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="text-sm text-zinc-400 mb-2 block">Bus Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-blue-500 focus:outline-none transition"
                  placeholder="e.g. Cairo-Alex 01"
                  required
                />
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-2 block">Bus Type</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-blue-500 focus:outline-none transition"
                >
                  {busTypes.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-2 block">Company ID</label>
                <input
                  type="text"
                  value={form.companyId}
                  onChange={(e) => setForm({ ...form, companyId: e.target.value })}
                  className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-blue-500 focus:outline-none transition"
                  placeholder="Company ID (from companies)"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-3 rounded-lg glass hover:bg-zinc-800/50 text-zinc-400 font-medium transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-3 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-medium transition flex items-center justify-center gap-2"
                >
                  {saving && <Loader2 size={16} className="animate-spin" />}
                  Create
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  )
}
