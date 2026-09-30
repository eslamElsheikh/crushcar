'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Users, Search, Plus, Pencil, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { useLangStore } from '@/lib/lang'

export default function CompanyCustomers() {
  const t = useLangStore((s) => s.t)
  const [customers, setCustomers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form, setForm] = useState({ name: '', email: '', phone: '', notes: '' })

  const fetchCustomers = () => {
    setLoading(true)
    const params = new URLSearchParams({ page: '1', take: '100' })
    if (q) params.set('q', q)
    fetch(`/api/company/customers?${params}`)
      .then(r => r.json())
      .then(data => { setCustomers(data.data || []); setLoading(false) })
  }

  useEffect(() => { fetchCustomers() }, [q])

  const openAdd = () => { setEditing(null); setForm({ name: '', email: '', phone: '', notes: '' }); setShowModal(true) }
  const openEdit = (c: any) => { setEditing(c); setForm({ name: c.name, email: c.email || '', phone: c.phone || '', notes: c.notes || '' }); setShowModal(true) }

  const save = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return }
    const url = editing ? `/api/company/customers/${editing.id}` : '/api/company/customers'
    const method = editing ? 'PATCH' : 'POST'
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    const data = await res.json()
    if (data.error) { toast.error(data.error) }
    else { toast.success(editing ? 'Updated' : 'Created'); setShowModal(false); fetchCustomers() }
  }

  const deleteCustomer = async (id: string) => {
    if (!confirm('Delete this customer?')) return
    const res = await fetch(`/api/company/customers/${id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Deleted'); fetchCustomers() }
  }

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">{t('company.customers')}</h1>
        <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white transition text-sm">
          <Plus size={16} /> {t('company.addCustomer')}
        </button>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="relative max-w-md">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input type="text" placeholder="Search customers..." value={q} onChange={e => setQ(e.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-500 focus:outline-none focus:border-blue-500/50 text-sm" />
      </motion.div>

      {loading ? (
        <div className="flex justify-center py-20"><motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" /></div>
      ) : customers.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center text-zinc-500">
          <Users size={48} className="mx-auto mb-3 opacity-30" />
          <p>{t('company.noCustomers')}</p>
        </div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass rounded-2xl border border-white/5 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-right px-4 py-3 text-zinc-400 font-medium">Name</th>
                <th className="text-right px-4 py-3 text-zinc-400 font-medium">Email</th>
                <th className="text-right px-4 py-3 text-zinc-400 font-medium">Phone</th>
                <th className="text-right px-4 py-3 text-zinc-400 font-medium">Bookings</th>
                <th className="text-right px-4 py-3 text-zinc-400 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-b border-white/5 hover:bg-white/5 transition">
                  <td className="px-4 py-3 text-white font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-zinc-400">{c.email || '-'}</td>
                  <td className="px-4 py-3 text-zinc-400">{c.phone || '-'}</td>
                  <td className="px-4 py-3 text-zinc-400">{c._count?.bookings || 0}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openEdit(c)} className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-blue-400 transition"><Pencil size={14} /></button>
                      <button onClick={() => deleteCustomer(c.id)} className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-red-400 transition"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass rounded-2xl p-6 border border-white/5 w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white">{editing ? t('company.editCustomer') : t('company.addCustomer')}</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Name *</label>
                <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-blue-500/50 text-sm" />
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Email</label>
                <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-blue-500/50 text-sm" />
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Phone</label>
                <input type="text" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-blue-500/50 text-sm" />
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Notes</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-blue-500/50 text-sm resize-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 transition text-sm">Cancel</button>
                <button onClick={save} className="flex-1 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white transition text-sm font-medium">Save</button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}
