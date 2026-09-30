'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowLeft, Save } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { useLangStore } from '@/lib/lang'

export default function AdminCompanyEdit() {
  const params = useParams()
  const router = useRouter()
  const t = useLangStore((s) => s.t)
  const [company, setCompany] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    subdomain: '',
    creditLimit: 0,
    paymentMode: 'PREPAID',
    billingCycle: 'MONTHLY',
    isActive: true,
  })

  useEffect(() => {
    fetch(`/api/admin/companies/${params.id}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { toast.error(data.error); router.push('/admin') }
        else {
          setCompany(data)
          setForm({
            name: data.name,
            subdomain: data.subdomain,
            creditLimit: data.creditLimit,
            paymentMode: data.paymentMode,
            billingCycle: data.billingCycle,
            isActive: data.isActive,
          })
          setLoading(false)
        }
      })
  }, [params.id])

  const save = async () => {
    setSaving(true)
    const res = await fetch(`/api/admin/companies/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    setSaving(false)
    if (data.error) { toast.error(data.error) }
    else { toast.success('Updated'); setCompany(data) }
  }

  if (loading) return <div className="flex justify-center py-20"><motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" /></div>
  if (!company) return null

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Link href="/admin/credit-report" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white transition text-sm">
        <ArrowLeft size={16} /> Back to credit report
      </Link>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl p-6 border border-white/5">
        <h1 className="text-2xl font-bold text-white mb-6">{t('company.editCompany')}: {company.name}</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Company Name</label>
            <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-blue-500/50 text-sm" />
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Subdomain</label>
            <input type="text" value={form.subdomain} onChange={e => setForm({ ...form, subdomain: e.target.value })} className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-blue-500/50 text-sm" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">{t('company.creditLimit')}</label>
            <input type="number" value={form.creditLimit} onChange={e => setForm({ ...form, creditLimit: parseFloat(e.target.value) || 0 })} min="0" step="0.01" className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-blue-500/50 text-sm" />
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">{t('company.paymentMode')}</label>
            <select value={form.paymentMode} onChange={e => setForm({ ...form, paymentMode: e.target.value })} className="w-full px-3 py-2.5 rounded-xl bg-zinc-900 border border-white/10 text-white focus:outline-none focus:border-blue-500/50 text-sm [&>option]:bg-zinc-900 [&>option]:text-white">
              <option value="PREPAID">{t('company.prepaidMode')}</option>
              <option value="CREDIT">{t('company.creditMode')}</option>
              <option value="BOTH">{t('company.bothMode')}</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">{t('company.billingCycle')}</label>
            <select value={form.billingCycle} onChange={e => setForm({ ...form, billingCycle: e.target.value })} className="w-full px-3 py-2.5 rounded-xl bg-zinc-900 border border-white/10 text-white focus:outline-none focus:border-blue-500/50 text-sm [&>option]:bg-zinc-900 [&>option]:text-white">
              <option value="MONTHLY">{t('company.monthly')}</option>
              <option value="WEEKLY">{t('company.weekly')}</option>
            </select>
          </div>
          <div className="flex items-center gap-3 pt-6">
            <button onClick={() => setForm({ ...form, isActive: !form.isActive })} className={`relative w-12 h-6 rounded-full transition ${form.isActive ? 'bg-emerald-500' : 'bg-zinc-600'}`}>
              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition ${form.isActive ? 'left-6' : 'left-0.5'}`} />
            </button>
            <span className="text-sm text-zinc-300">{form.isActive ? t('company.isActive') : t('company.isInactive')}</span>
          </div>
        </div>

        {company.totalBookings !== undefined && (
          <div className="p-4 rounded-xl bg-white/5 mb-6 grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-white">{company.totalBookings}</p>
              <p className="text-xs text-zinc-500">Total Bookings</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-emerald-400">{(company.totalSpent || 0).toFixed(2)}</p>
              <p className="text-xs text-zinc-500">Total Spent (EGP)</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-400">{company.availableCredit?.toFixed(2) || '0.00'}</p>
              <p className="text-xs text-zinc-500">Available Credit (EGP)</p>
            </div>
          </div>
        )}

        <button onClick={save} disabled={saving} className="w-full py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white transition text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2">
          <Save size={16} /> {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </motion.div>
    </div>
  )
}
