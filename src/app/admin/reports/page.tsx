'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { BarChart3, TrendingUp, Users, MapPin, Download, FileText, PieChart, ArrowUpRight } from 'lucide-react'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { useLangStore } from '@/lib/lang'
import { cn } from '@/lib/utils'

interface RouteData {
  tripId: string
  origin: string
  destination: string
  departure: string
  status: string
  revenue: number
  bookedSeats: number
  totalSeats: number
  occupancy: number
}

interface MonthlyData {
  month: string
  revenue: number
}

interface TopCustomer {
  userId: string
  name: string
  email: string
  totalRevenue: number
}

interface ReportData {
  routeData: RouteData[]
  monthlyData: MonthlyData[]
  topCustomers: TopCustomer[]
  summary: { totalBookings: number; cancelledBookings: number }
}

const CHART_COLORS = {
  blue: '#3b82f6',
  emerald: '#10b981',
  amber: '#f59e0b',
  purple: '#8b5cf6',
  rose: '#f43f5e',
  cyan: '#06b6d4',
}

const chartColors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#f43f5e', '#06b6d4', '#ec4899', '#14b8a6']

export default function ReportsPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const t = useLangStore((s) => s.t)
  const lang = useLangStore((s) => s.lang)
  const isRTL = lang === 'ar'

  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'routes' | 'revenue' | 'customers'>('routes')

  useEffect(() => {
    if (session?.user?.role === 'CUSTOMER') {
      router.push('/trips')
      return
    }
    fetchReports()
  }, [session])

  async function fetchReports() {
    try {
      const res = await fetch('/api/reports', { credentials: 'include' })
      if (res.ok) setData(await res.json())
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  function exportCSV() {
    if (!data) return
    const rows: string[][] = []
    rows.push([lang === 'ar' ? 'المسار' : 'Route', lang === 'ar' ? 'التاريخ' : 'Date', lang === 'ar' ? 'نسبة الإشغال' : 'Occupancy %', lang === 'ar' ? 'المقاعد' : 'Seats', lang === 'ar' ? 'الإيرادات' : 'Revenue'])
    data.routeData.slice().sort((a, b) => b.occupancy - a.occupancy).forEach(r => {
      rows.push([`${r.origin} → ${r.destination}`, new Date(r.departure).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US'), `${r.occupancy}%`, r.bookedSeats + '/' + r.totalSeats, r.revenue.toString()])
    })
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `crushcar-reports-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const tabs = [
    { key: 'routes', label: lang === 'ar' ? 'بال route' : 'By Route', icon: MapPin },
    { key: 'revenue', label: lang === 'ar' ? 'الإيرادات' : 'Revenue', icon: TrendingUp },
    { key: 'customers', label: lang === 'ar' ? 'العملاء' : 'Top Customers', icon: Users },
  ] as const

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!data) return null

  return (
    <div className={cn('max-w-7xl', isRTL && 'font-[Cairo]')}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <BarChart3 className="text-blue-400" size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-white">
              {lang === 'ar' ? 'التقارير والإحصائيات' : 'Reports & Analytics'}
            </h1>
            <p className="text-zinc-400 text-sm">
              {lang === 'ar' ? 'تحليل الأداء والتوقعات' : 'Performance analysis and insights'}
            </p>
          </div>
        </div>
        <button
          onClick={exportCSV}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-medium hover:bg-blue-500/20 transition hover-lift"
        >
          <Download size={16} />
          {lang === 'ar' ? 'تصدير CSV' : 'Export CSV'}
        </button>
      </motion.div>

      {/* Tabs */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
        className="flex gap-2 mb-6">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all',
              tab === t.key
                ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            )}>
            <t.icon size={16} />
            {t.label}
          </button>
        ))}
      </motion.div>

      {/* Routes tab */}
      {tab === 'routes' && (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: lang === 'ar' ? 'إجمالي الحجوزات' : 'Total Bookings', value: data.summary.totalBookings, icon: FileText, color: '#3b82f6' },
              { label: lang === 'ar' ? 'الحجوزات الملغاة' : 'Cancelled', value: data.summary.cancelledBookings, icon: FileText, color: '#f43f5e' },
              { label: lang === 'ar' ? 'إجمالي المسارات' : 'Total Routes', value: data.routeData.length, icon: MapPin, color: '#10b981' },
            ].map((card, i) => (
              <motion.div key={card.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                className="rounded-2xl glass border border-white/10 p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${card.color}15` }}>
                    <card.icon size={18} style={{ color: card.color }} />
                  </div>
                  <span className="text-sm text-zinc-400">{card.label}</span>
                </div>
                <p className="text-2xl font-bold text-white">{card.value}</p>
              </motion.div>
            ))}
          </div>

          {/* Route table */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
            className="rounded-2xl glass border border-white/10 overflow-hidden">
            <div className="p-5 border-b border-white/5">
              <h3 className="text-sm font-semibold text-white">
                {lang === 'ar' ? 'الأداء حسب المسار' : 'Performance by Route'}
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className={cn('px-5 py-3 text-left text-xs text-zinc-500 uppercase tracking-wider', isRTL && 'text-right')}>
                      {lang === 'ar' ? 'المسار' : 'Route'}
                    </th>
                    <th className={cn('px-5 py-3 text-right text-xs text-zinc-500 uppercase tracking-wider', isRTL && 'text-left')}>
                      {lang === 'ar' ? 'الإيرادات' : 'Revenue'}
                    </th>
                    <th className={cn('px-5 py-3 text-right text-xs text-zinc-500 uppercase tracking-wider', isRTL && 'text-left')}>
                      {lang === 'ar' ? 'المقاعد' : 'Seats'}
                    </th>
                    <th className={cn('px-5 py-3 text-right text-xs text-zinc-500 uppercase tracking-wider', isRTL && 'text-left')}>
                      {lang === 'ar' ? 'نسبة الإشغال' : 'Occupancy'}
                    </th>
                    <th className={cn('px-5 py-3 text-right text-xs text-zinc-500 uppercase tracking-wider', isRTL && 'text-left')}>
                      {lang === 'ar' ? 'الحالة' : 'Status'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.routeData.slice().sort((a, b) => b.occupancy - a.occupancy).map((route, i) => (
                    <motion.tr key={route.tripId} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                      className="border-b border-white/5 hover:bg-white/3 transition-colors">
                      <td className={cn('px-5 py-4', isRTL && 'text-right')}>
                        <div>
                          <p className="font-semibold text-white text-sm">{route.origin} → {route.destination}</p>
                          <p className="text-xs text-zinc-500">{new Date(route.departure).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</p>
                        </div>
                      </td>
                      <td className={cn('px-5 py-4 text-right font-semibold text-emerald-400', isRTL && 'text-left')}>
                        {lang === 'ar' ? 'ج.م' : 'EGP'} {route.revenue.toFixed(0)}
                      </td>
                      <td className={cn('px-5 py-4 text-right text-zinc-300', isRTL && 'text-left')}>
                        {route.bookedSeats}/{route.totalSeats}
                      </td>
                      <td className={cn('px-5 py-4 text-right', isRTL && 'text-left')}>
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-24 h-2 rounded-full bg-zinc-800 overflow-hidden">
                            <div className="h-full rounded-full transition-all"
                              style={{ width: `${route.occupancy}%`, backgroundColor: route.occupancy > 80 ? '#10b981' : route.occupancy > 50 ? '#f59e0b' : '#3b82f6' }} />
                          </div>
                          <span className="text-xs font-semibold text-zinc-300 w-10">{route.occupancy}%</span>
                        </div>
                      </td>
                      <td className={cn('px-5 py-4 text-right', isRTL && 'text-left')}>
                        <span className={cn(
                          'px-2 py-1 rounded-full text-xs font-semibold',
                          route.status === 'COMPLETED' ? 'bg-zinc-700/50 text-zinc-400' :
                          route.status === 'SCHEDULED' ? 'bg-blue-500/10 text-blue-400' :
                          'bg-amber-500/10 text-amber-400'
                        )}>
                          {route.status === 'COMPLETED' ? (lang === 'ar' ? 'مكتمل' : 'Completed') :
                           route.status === 'SCHEDULED' ? (lang === 'ar' ? 'مجدول' : 'Scheduled') :
                           (lang === 'ar' ? 'ملغي' : 'Cancelled')}
                        </span>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>

          {/* Occupancy chart */}
          {data.routeData.length > 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
              className="rounded-2xl glass border border-white/10 p-5">
              <h3 className="text-sm font-semibold text-white mb-6">{lang === 'ar' ? 'نسبة الإشغال لكل مسار' : 'Occupancy Rate by Route'}</h3>
              <div className="space-y-4">
                {data.routeData.slice().sort((a, b) => b.occupancy - a.occupancy).map((route, i) => {
                  const color = route.occupancy > 80 ? '#10b981' : route.occupancy > 50 ? '#f59e0b' : '#3b82f6'
                  return (
                    <div key={route.tripId} className="flex items-center gap-4">
                      <div className="w-52 shrink-0">
                        <p className="text-sm font-semibold text-white truncate">{route.origin} → {route.destination}</p>
                        <p className="text-xs text-zinc-500">{route.bookedSeats}/{route.totalSeats} {lang === 'ar' ? 'مقعد' : 'seats'}</p>
                      </div>
                      <div className="flex-1 relative">
                        <div className="h-6 rounded-full bg-zinc-800 overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${route.occupancy}%` }}
                            transition={{ delay: i * 0.05, duration: 0.6, ease: 'easeOut' }}
                            className="h-full rounded-full flex items-center justify-end pr-3"
                            style={{ backgroundColor: color, minWidth: route.occupancy > 0 ? '40px' : '0' }}
                          >
                            <span className="text-white font-bold text-xs drop-shadow-lg">
                              {route.occupancy}%
                            </span>
                          </motion.div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          )}
        </div>
      )}

      {/* Revenue tab */}
      {tab === 'revenue' && (
        <div className="space-y-6">
          {data.monthlyData.length > 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="rounded-2xl glass border border-white/10 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white">{lang === 'ar' ? 'الإيرادات الشهرية' : 'Monthly Revenue'}</h3>
                <span className="text-xs text-zinc-500">{lang === 'ar' ? 'آخر أشهر' : 'Last months'}</span>
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={data.monthlyData}>
                  <defs>
                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}`} />
                  <Tooltip
                    contentStyle={{ background: '#18181b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '12px' }}
                    labelStyle={{ color: '#fff' }}
                    formatter={(v: number) => [`${lang === 'ar' ? 'ج.م' : 'EGP'} ${v.toFixed(0)}`, lang === 'ar' ? 'الإيراد' : 'Revenue']}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} fill="url(#colorRev)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </motion.div>
          ) : (
            <div className="text-center py-16 text-zinc-600">
              <TrendingUp size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">{lang === 'ar' ? 'لا توجد بيانات إيرادات بعد' : 'No revenue data yet'}</p>
            </div>
          )}
        </div>
      )}

      {/* Customers tab */}
      {tab === 'customers' && (
        <div className="space-y-6">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="rounded-2xl glass border border-white/10 overflow-hidden">
            <div className="p-5 border-b border-white/5">
              <h3 className="text-sm font-semibold text-white">
                {lang === 'ar' ? 'أفضل العملاء إنتاجية' : 'Top Revenue Customers'}
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className={cn('px-5 py-3 text-left text-xs text-zinc-500 uppercase tracking-wider', isRTL && 'text-right')}>
                      #
                    </th>
                    <th className={cn('px-5 py-3 text-left text-xs text-zinc-500 uppercase tracking-wider', isRTL && 'text-right')}>
                      {lang === 'ar' ? 'الاسم' : 'Name'}
                    </th>
                    <th className={cn('px-5 py-3 text-left text-xs text-zinc-500 uppercase tracking-wider', isRTL && 'text-right')}>
                      {lang === 'ar' ? 'البريد' : 'Email'}
                    </th>
                    <th className={cn('px-5 py-3 text-right text-xs text-zinc-500 uppercase tracking-wider', isRTL && 'text-left')}>
                      {lang === 'ar' ? 'إجمالي الإيرادات' : 'Total Revenue'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.topCustomers.map((cust, i) => (
                    <motion.tr key={cust.userId} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }}
                      className="border-b border-white/5 hover:bg-white/3 transition-colors">
                      <td className={cn('px-5 py-4 text-zinc-500', isRTL && 'text-right')}>{i + 1}</td>
                      <td className={cn('px-5 py-4 font-semibold text-white', isRTL && 'text-right')}>{cust.name}</td>
                      <td className={cn('px-5 py-4 text-zinc-400', isRTL && 'text-right')}>{cust.email}</td>
                      <td className={cn('px-5 py-4 text-right font-bold text-emerald-400', isRTL && 'text-left')}>
                        {lang === 'ar' ? 'ج.م' : 'EGP'} {cust.totalRevenue.toFixed(0)}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}