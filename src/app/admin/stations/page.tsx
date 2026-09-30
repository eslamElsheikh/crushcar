'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { MapPin, Plus, Search, X, Edit2, Trash2, Loader2, Bus } from 'lucide-react'
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
}

export default function AdminStationsPage() {
  const router = useRouter()
  const t = useLangStore((s) => s.t)
  const lang = useLangStore((s) => s.lang)
  const isRTL = lang === 'ar'

  const [stations, setStations] = useState<Station[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [cityFilter, setCityFilter] = useState('')
  const [citiesFromAPI, setCitiesFromAPI] = useState<string[]>([])
  const [addModal, setAddModal] = useState(false)
  const [editStation, setEditStation] = useState<Station | null>(null)
  const [form, setForm] = useState({ name: '', city: '' })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const allCities = [...new Set([...EGYPTIAN_CITIES, ...citiesFromAPI])].sort()

  useEffect(() => {
    loadStations()
  }, [])

  async function loadStations() {
    try {
      const res = await fetch(`/api/stations?q=${search}&city=${cityFilter}`, { credentials: 'include' })
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

  async function handleSave() {
    if (!form.name || !form.city) return
    setSaving(true)

    try {
      if (editStation) {
        const res = await fetch(`/api/stations/${editStation.id}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        if (res.ok) {
          setEditStation(null)
          setAddModal(false)
          setForm({ name: '', city: '' })
          loadStations()
        }
      } else {
        const res = await fetch('/api/stations', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        if (res.ok) {
          setAddModal(false)
          setForm({ name: '', city: '' })
          loadStations()
        }
      }
    } catch {
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(station: Station) {
    setDeleting(station.id)
    try {
      const res = await fetch(`/api/stations/${station.id}`, { method: 'DELETE', credentials: 'include' })
      if (res.ok) {
        loadStations()
      } else {
        const data = await res.json()
        alert(data.error || (isRTL ? 'لا يمكن حذف المحطة' : 'Cannot delete station'))
      }
    } catch {
    } finally {
      setDeleting(null)
    }
  }

  function openEdit(station: Station) {
    setEditStation(station)
    setForm({ name: station.name, city: station.city })
    setAddModal(true)
  }

  function openAdd() {
    setEditStation(null)
    setForm({ name: '', city: '' })
    setAddModal(true)
  }

  return (
    <div className={cn('min-h-screen', isRTL && 'font-[Cairo]')} dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-display font-bold text-white">{t('nav.stations')}</h1>
            <p className="text-zinc-400 text-sm mt-1">{isRTL ? 'إدارة محطات الباص' : 'Manage bus stations'}</p>
          </div>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold transition"
          >
            <Plus size={16} />
            {isRTL ? 'إضافة محطة' : 'Add Station'}
          </button>
        </div>

        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setTimeout(loadStations, 300) }}
              placeholder={t('stations.searchPlaceholder')}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-zinc-900/80 border border-white/5 focus:border-blue-500/50 focus:outline-none text-sm text-white placeholder:text-zinc-600"
            />
          </div>
          <select
            value={cityFilter}
            onChange={(e) => { setCityFilter(e.target.value); loadStations() }}
            className="px-4 py-2.5 rounded-xl bg-zinc-900/80 border border-white/5 focus:border-blue-500/50 focus:outline-none text-sm text-white"
          >
            <option value="">{isRTL ? 'كل المدن' : 'All cities'}</option>
            {allCities.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Stations Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={32} className="animate-spin text-blue-400" />
          </div>
        ) : stations.length === 0 ? (
          <div className="text-center py-20 glass rounded-2xl border border-zinc-800">
            <MapPin size={48} className="mx-auto text-zinc-700 mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">
              {isRTL ? 'لا توجد محطات' : 'No stations yet'}
            </h3>
            <p className="text-zinc-500 text-sm mb-6">
              {isRTL ? 'أضف أول محطة للباص' : 'Add your first bus station'}
            </p>
            <button onClick={openAdd} className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-medium text-sm transition">
              <Plus size={16} />
              {isRTL ? 'إضافة محطة' : 'Add Station'}
            </button>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {stations.map((station, i) => (
              <motion.div
                key={station.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="glass rounded-xl p-5 border border-white/5 hover:border-white/10 transition"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                      <MapPin size={18} className="text-blue-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">{station.name}</h3>
                      <p className="text-xs text-zinc-500">{station.city}</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-zinc-500 mb-4">
                  <Bus size={12} />
                  <span>{station.tripCount} {isRTL ? 'رحلة' : 'trips'}</span>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => openEdit(station)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-zinc-800/50 hover:bg-zinc-700/50 text-zinc-400 hover:text-white text-xs transition"
                  >
                    <Edit2 size={12} />
                    {isRTL ? 'تعديل' : 'Edit'}
                  </button>
                  <button
                    onClick={() => handleDelete(station)}
                    disabled={deleting === station.id}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs transition disabled:opacity-50"
                  >
                    {deleting === station.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {addModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => { setAddModal(false); setEditStation(null) }} />
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative glass rounded-2xl p-8 max-w-md w-full border border-zinc-700 shadow-2xl"
          >
            <button
              onClick={() => { setAddModal(false); setEditStation(null) }}
              className="absolute top-4 right-4 p-2 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition"
            >
              <X size={16} />
            </button>

            <h3 className="text-lg font-bold text-white mb-6">
              {editStation ? t('station.edit') : (isRTL ? 'إضافة محطة' : 'Add Station')}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="text-sm text-zinc-400 mb-2 block">{isRTL ? 'اسم المحطة' : 'Station Name'}</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl bg-zinc-900/80 border border-white/5 focus:border-blue-500/50 focus:outline-none text-white text-sm"
                  placeholder={isRTL ? 'مثال: المنصورة' : 'e.g. Mansoura'}
                />
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-2 block">{t('station.city')}</label>
                <select
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl bg-zinc-900/80 border border-white/5 focus:border-blue-500/50 focus:outline-none text-white text-sm"
                  required
                >
                  <option value="">{isRTL ? 'اختر المدينة' : 'Select city'}</option>
                  {allCities.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setAddModal(false); setEditStation(null) }}
                className="flex-1 py-2.5 rounded-xl glass border border-zinc-700 text-zinc-400 hover:text-white hover:bg-white/5 transition text-sm font-medium"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name || !form.city}
                className="flex-1 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-sm font-semibold transition flex items-center justify-center gap-2"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {editStation ? t('station.update') : (isRTL ? 'إضافة' : 'Add')}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}
