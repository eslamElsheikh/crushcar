'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { CreditCard, TrendingUp, Wallet, Pencil } from 'lucide-react'
import Link from 'next/link'
import { useLangStore } from '@/lib/lang'

export default function AdminCreditReport() {
  const t = useLangStore((s) => s.t)
  const [companies, setCompanies] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/credit-report', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setCompanies(data)
        }
        setLoading(false)
      })
      .catch(() => {
        setLoading(false)
      })
  }, [])

  if (loading) return <div className="flex justify-center py-20"><motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" /></div>

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-white">{t('company.creditReport')}</h1>
        <p className="text-zinc-400 mt-1">{(companies || []).length} companies</p>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass rounded-2xl p-6 bg-gradient-to-br from-blue-500/20 to-blue-500/5 border border-blue-500/20">
          <CreditCard size={24} className="text-blue-400" />
          <p className="text-2xl font-bold text-white mt-4">
            {(companies || []).reduce((sum, c) => sum + (c.creditLimit || 0), 0).toFixed(2)} EGP
          </p>
          <p className="text-sm text-zinc-400 mt-1">Total Credit Limit</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass rounded-2xl p-6 bg-gradient-to-br from-amber-500/20 to-amber-500/5 border border-amber-500/20">
          <TrendingUp size={24} className="text-amber-400" />
          <p className="text-2xl font-bold text-white mt-4">
            {(companies || []).reduce((sum, c) => sum + (c.outstandingBalance || 0), 0).toFixed(2)} EGP
          </p>
          <p className="text-sm text-zinc-400 mt-1">Total Outstanding</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass rounded-2xl p-6 bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border border-emerald-500/20">
          <Wallet size={24} className="text-emerald-400" />
          <p className="text-2xl font-bold text-white mt-4">
            {(companies || []).reduce((sum, c) => sum + (c.walletBalance || 0), 0).toFixed(2)} EGP
          </p>
          <p className="text-sm text-zinc-400 mt-1">Total Wallet Balance</p>
        </motion.div>
      </div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="glass rounded-2xl border border-white/5 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-right px-4 py-3 text-zinc-400 font-medium">Company</th>
              <th className="text-right px-4 py-3 text-zinc-400 font-medium">Payment Mode</th>
              <th className="text-right px-4 py-3 text-zinc-400 font-medium">Credit Limit</th>
              <th className="text-right px-4 py-3 text-zinc-400 font-medium">Outstanding</th>
              <th className="text-right px-4 py-3 text-zinc-400 font-medium">Wallet</th>
              <th className="text-right px-4 py-3 text-zinc-400 font-medium">Usage</th>
              <th className="text-right px-4 py-3 text-zinc-400 font-medium">Status</th>
              <th className="text-right px-4 py-3 text-zinc-400 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {(companies || []).map((c) => (
              <tr key={c.id} className="border-b border-white/5 hover:bg-white/5 transition">
                <td className="px-4 py-3">
                  <p className="text-white font-medium">{c.name}</p>
                  <p className="text-xs text-zinc-500">{c.subdomain}</p>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-lg text-xs ${
                    c.paymentMode === 'CREDIT' ? 'bg-blue-500/20 text-blue-400' :
                    c.paymentMode === 'PREPAID' ? 'bg-emerald-500/20 text-emerald-400' :
                    'bg-purple-500/20 text-purple-400'
                  }`}>
                    {c.paymentMode}
                  </span>
                </td>
                <td className="px-4 py-3 text-white">{c.creditLimit.toFixed(2)}</td>
                <td className={`px-4 py-3 font-semibold ${c.outstandingBalance > 0 ? 'text-amber-400' : 'text-zinc-400'}`}>
                  {c.outstandingBalance.toFixed(2)}
                </td>
                <td className="px-4 py-3 text-emerald-400">{c.walletBalance.toFixed(2)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-2 rounded-full bg-white/10 overflow-hidden">
                      <div className={`h-full rounded-full ${c.usagePercent > 80 ? 'bg-red-500' : c.usagePercent > 50 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${c.usagePercent}%` }} />
                    </div>
                    <span className="text-xs text-zinc-400">{c.usagePercent}%</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-lg text-xs ${c.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                    {c.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Link href={`/admin/companies/${c.id}/edit`} className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-blue-400 transition">
                    <Pencil size={14} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </motion.div>
    </div>
  )
}
