'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown, Search, Loader2, Eye, EyeOff, Sparkles } from 'lucide-react'
import { useLangStore } from '@/lib/lang'
import { cn } from '@/lib/utils'

type Faq = {
  id: string
  questionAr: string
  questionEn: string
  answerAr: string
  answerEn: string
  order: number
  isActive: boolean
}

export default function AdminFaqsPage() {
  const { lang, t } = useLangStore()
  const isRTL = lang === 'ar'
  const [faqs, setFaqs] = useState<Faq[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Faq | null>(null)
  const [form, setForm] = useState({ questionAr: '', questionEn: '', answerAr: '', answerEn: '' })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [seeding, setSeeding] = useState(false)

  async function loadFaqs() {
    const res = await fetch(`/api/faqs?all=${showAll ? '1' : '0'}`, { credentials: 'include' })
    if (res.ok) setFaqs(await res.json())
  }

  useEffect(() => { loadFaqs(); setLoading(false) }, [showAll])

  function openAdd() {
    setEditing(null)
    setForm({ questionAr: '', questionEn: '', answerAr: '', answerEn: '' })
    setModalOpen(true)
  }

  function openEdit(faq: Faq) {
    setEditing(faq)
    setForm({ questionAr: faq.questionAr, questionEn: faq.questionEn, answerAr: faq.answerAr, answerEn: faq.answerEn })
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.questionAr || !form.questionEn || !form.answerAr || !form.answerEn) return
    setSaving(true)
    try {
      if (editing) {
        await fetch(`/api/faqs/${editing.id}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
      } else {
        await fetch('/api/faqs', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
      }
      setModalOpen(false)
      loadFaqs()
    } catch {} finally { setSaving(false) }
  }

  async function handleDelete(faq: Faq) {
    if (!confirm(t('faq.confirmDelete'))) return
    setDeleting(faq.id)
    try {
      await fetch(`/api/faqs/${faq.id}`, { method: 'DELETE', credentials: 'include' })
      loadFaqs()
    } catch {} finally { setDeleting(null) }
  }

  async function handleToggle(faq: Faq) {
    await fetch(`/api/faqs/${faq.id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !faq.isActive }),
    })
    loadFaqs()
  }

  async function handleReorder(faq: Faq, direction: 'up' | 'down') {
    await fetch(`/api/faqs/${faq.id}/reorder`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ direction }),
    })
    loadFaqs()
  }

  async function handleSeed() {
    setSeeding(true)
    try {
      const res = await fetch('/api/faqs/seed', { method: 'POST', credentials: 'include' })
      const data = await res.json()
      alert(data.seeded ? t('faq.seedSuccess') : t('faq.alreadySeeded'))
      loadFaqs()
    } catch {} finally { setSeeding(false) }
  }

  const filtered = faqs.filter(f =>
    f.questionAr.includes(search) || f.questionEn.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className={cn('min-h-screen', isRTL && 'font-[Cairo]')} dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-display font-bold text-white">{t('nav.faq')}</h1>
            <p className="text-zinc-400 text-sm mt-1">{t('faq.manage')}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSeed}
              disabled={seeding}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-sm font-medium transition border border-emerald-500/20"
            >
              <Sparkles size={16} />
              {t('faq.seedDefaults')}
            </button>
            <button
              onClick={openAdd}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold transition"
            >
              <Plus size={16} />
              {t('faq.addQuestion')}
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <Search size={16} className={cn('absolute top-1/2 -translate-y-1/2 text-zinc-500', isRTL ? 'right-3' : 'left-3')} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('faq.searchPlaceholder')}
              className={cn('w-full pl-10 pr-4 py-2.5 rounded-xl bg-zinc-900/80 border border-white/5 focus:border-blue-500/50 focus:outline-none text-sm text-white placeholder:text-zinc-600', isRTL && 'pl-4 pr-10')}
            />
          </div>
          <button
            onClick={() => setShowAll(!showAll)}
            className={cn('px-4 py-2.5 rounded-xl text-sm font-medium transition border', showAll ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' : 'bg-zinc-900/80 border-white/5 text-zinc-400 hover:text-white')}
          >
            {showAll ? t('faq.showAll') : t('faq.showActive')}
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={32} className="animate-spin text-blue-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 glass rounded-2xl border border-zinc-800">
            <Plus size={48} className="mx-auto text-zinc-700 mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">{t('faq.noFaqs')}</h3>
            <p className="text-zinc-500 text-sm mb-6">{t('faq.addFirst')}</p>
            <button onClick={openAdd} className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-medium text-sm transition">
              <Plus size={16} />
              {t('faq.addQuestion')}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((faq, i) => (
              <motion.div
                key={faq.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className={cn('glass rounded-xl p-5 border transition', faq.isActive ? 'border-white/5' : 'border-white/5 opacity-50')}
              >
                <div className="flex items-start gap-4">
                  <div className="flex flex-col gap-1">
                    <button onClick={() => handleReorder(faq, 'up')} className="p-1 rounded hover:bg-white/5 text-zinc-500 hover:text-white transition">
                      <ChevronUp size={16} />
                    </button>
                    <button onClick={() => handleReorder(faq, 'down')} className="p-1 rounded hover:bg-white/5 text-zinc-500 hover:text-white transition">
                      <ChevronDown size={16} />
                    </button>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-white font-medium text-sm">{isRTL ? faq.questionAr : faq.questionEn}</h3>
                      <span className={cn('text-xs px-2 py-0.5 rounded-full', faq.isActive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-500/10 text-zinc-500')}>
                        {faq.isActive ? t('faq.active') : t('faq.inactive')}
                      </span>
                    </div>
                    <p className="text-zinc-500 text-xs line-clamp-2">{isRTL ? faq.answerAr : faq.answerEn}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button onClick={() => handleToggle(faq)} className="p-2 rounded-lg hover:bg-white/5 text-zinc-500 hover:text-white transition" title={faq.isActive ? t('faq.inactive') : t('faq.active')}>
                      {faq.isActive ? <Eye size={16} /> : <EyeOff size={16} />}
                    </button>
                    <button onClick={() => openEdit(faq)} className="p-2 rounded-lg hover:bg-white/5 text-zinc-500 hover:text-blue-400 transition">
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(faq)}
                      disabled={deleting === faq.id}
                      className="p-2 rounded-lg hover:bg-white/5 text-zinc-500 hover:text-red-400 transition disabled:opacity-50"
                    >
                      {deleting === faq.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {modalOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className="glass rounded-2xl border border-white/10 w-full max-w-lg p-6">
                <h2 className="text-xl font-display font-bold text-white mb-6">
                  {editing ? t('faq.editQuestion') : t('faq.addQuestion')}
                </h2>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-zinc-400 mb-1 block">{t('faq.questionAr')}</label>
                    <input
                      value={form.questionAr}
                      onChange={(e) => setForm({ ...form, questionAr: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl bg-zinc-900/80 border border-white/5 focus:border-blue-500/50 focus:outline-none text-sm text-white"
                      dir="rtl"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-zinc-400 mb-1 block">{t('faq.questionEn')}</label>
                    <input
                      value={form.questionEn}
                      onChange={(e) => setForm({ ...form, questionEn: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl bg-zinc-900/80 border border-white/5 focus:border-blue-500/50 focus:outline-none text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-zinc-400 mb-1 block">{t('faq.answerAr')}</label>
                    <textarea
                      value={form.answerAr}
                      onChange={(e) => setForm({ ...form, answerAr: e.target.value })}
                      rows={3}
                      className="w-full px-4 py-2.5 rounded-xl bg-zinc-900/80 border border-white/5 focus:border-blue-500/50 focus:outline-none text-sm text-white resize-none"
                      dir="rtl"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-zinc-400 mb-1 block">{t('faq.answerEn')}</label>
                    <textarea
                      value={form.answerEn}
                      onChange={(e) => setForm({ ...form, answerEn: e.target.value })}
                      rows={3}
                      className="w-full px-4 py-2.5 rounded-xl bg-zinc-900/80 border border-white/5 focus:border-blue-500/50 focus:outline-none text-sm text-white resize-none"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-6">
                  <button onClick={() => setModalOpen(false)} className="flex-1 px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium transition">
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving || !form.questionAr || !form.questionEn || !form.answerAr || !form.answerEn}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition"
                  >
                    {saving ? <Loader2 size={16} className="animate-spin mx-auto" /> : t('common.save')}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
