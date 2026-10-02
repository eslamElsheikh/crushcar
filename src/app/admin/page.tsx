'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Ticket, Wallet, Bus, TrendingUp, Clock, ArrowRight, Building2, User } from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { useLangStore } from '@/lib/lang';
import { V2PageHeader, V2StatCard } from '@/components/v2/admin';
import { V2Skeleton, V2StatusBadge } from '@/components/v2/ui';
import { cn } from '@/lib/utils';

/* V2 admin dashboard — same /api/analytics + pending-companies + /api/jobs/transition as V1.
   Real data only, no hardcoded fake KPI deltas. */

interface Analytics {
  totalBookings: number;
  totalRevenue: number;
  activeTrips: number;
  chartData?: { day?: string; label?: string; revenue: number; bookings?: number }[];
  recentBookings?: any[];
  cancellations?: { customerPending: number; companyPending: number };
}

export default function AdminDashboard() {
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';
  const locale = isRTL ? 'ar-EG' : 'en-US';

  const [data, setData] = useState<Analytics | null>(null);
  const [range, setRange] = useState<'7d' | '30d' | '90d'>('30d');
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Transition past trips on mount like V1
  useEffect(() => {
    fetch('/api/jobs/transition', { method: 'POST', credentials: 'include' }).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/analytics?range=${range}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((res) => {
        // Normalize chart data day/label key
        if (res?.chartData) {
          res.chartData = res.chartData.map((c: any) => ({
            ...c,
            label: c.label || c.day || '',
          }));
        }
        setData(res);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    fetch('/api/admin/companies/pending', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setPendingCount(d.length); })
      .catch(() => {});
  }, [range]);

  const pendingCancel = (data?.cancellations?.customerPending || 0) + (data?.cancellations?.companyPending || 0);

  if (loading) {
    return (
      <div className="grid gap-4" role="status">
        <V2Skeleton className="h-10 w-64" />
        <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          <V2Skeleton className="h-32 rounded-2xl" />
          <V2Skeleton className="h-32 rounded-2xl" />
          <V2Skeleton className="h-32 rounded-2xl" />
          <V2Skeleton className="h-32 rounded-2xl" />
        </div>
        <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
          <V2Skeleton className="h-80 rounded-2xl" />
          <V2Skeleton className="h-80 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <V2PageHeader
        title={t('nav.dashboard')}
        sub={t('nav.admin')}
        action={
          <div className="flex gap-1.5 rounded-xl bg-white p-1 ring-1 ring-[#E6EBF2]" role="tablist" aria-label="Range">
            {(['7d', '30d', '90d'] as const).map((r) => (
              <button
                key={r}
                role="tab"
                aria-selected={range === r}
                onClick={() => setRange(r)}
                className={`rounded-lg px-3.5 py-2 text-[13px] font-bold tabular-nums transition ${range === r ? 'bg-[#0A1E3C] text-white' : 'text-[#5B6B84]'}`}
              >
                {r}
              </button>
            ))}
          </div>
        }
      />

      {(pendingCount > 0 || pendingCancel > 0) && (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {pendingCount > 0 && (
            <Link href="/admin/companies/pending" className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 hover:border-amber-300">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white text-amber-600">
                <Clock className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-extrabold tabular-nums text-[#0B1B33]">
                  {pendingCount} · {t('admin.pendingCompanies')}
                </span>
                <span className="block text-[13px] text-amber-700">{t('company.companyInactive')}</span>
              </span>
              <ArrowRight className="size-5 shrink-0 text-amber-600 v2-flip-rtl" />
            </Link>
          )}
          {pendingCancel > 0 && (
            <Link href="/admin/cancellations" className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 hover:border-red-300">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white text-red-600">
                <Ticket className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-extrabold tabular-nums text-[#0B1B33]">
                  {pendingCancel} · {t('admin.cancellations')}
                </span>
                <span className="block text-[13px] text-red-600">{t('company.quickActions')}</span>
              </span>
              <ArrowRight className="size-5 shrink-0 text-red-600 v2-flip-rtl" />
            </Link>
          )}
        </div>
      )}

      {/* Primary KPI Cards */}
      <div className="mt-5 grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <V2StatCard
          label={t('dashboard.totalBookings')}
          value={(data?.totalBookings ?? 0).toLocaleString(locale)}
          icon={<Ticket className="size-5 text-[#1D5BD8]" />}
        />
        <V2StatCard
          label={t('dashboard.totalRevenue')}
          value={`${(data?.totalRevenue ?? 0).toLocaleString(locale)} ${t('common.currency')}`}
          icon={<Wallet className="size-5 text-emerald-600" />}
        />
        <V2StatCard
          label={t('dashboard.activeTrips')}
          value={(data?.activeTrips ?? 0).toLocaleString(locale)}
          icon={<Bus className="size-5 text-amber-600" />}
        />
        <V2StatCard
          label={t('admin.cancellations')}
          value={pendingCancel.toLocaleString(locale)}
          icon={<TrendingUp className="size-5 text-red-500" />}
        />
      </div>

      {/* Main Grid: Revenue Trend + Recent Bookings Feed */}
      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_380px]">
        {/* Revenue Trend Area Chart */}
        <div className="rounded-2xl border border-[#E6EBF2] bg-white p-5 md:p-6">
          <div className="flex items-center justify-between">
            <p className="text-[16px] font-extrabold text-[#0B1B33]">{t('dashboard.revenueChart')}</p>
            <span className="text-[12.5px] font-bold text-[#5B6B84]">{range}</span>
          </div>
          {(data?.chartData?.length || 0) > 0 ? (
            <div className="mt-4 h-72" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data!.chartData} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E6EBF2" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#5B6B84' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#5B6B84' }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid #E6EBF2', fontSize: 13 }}
                    formatter={(value: any) => [`${Number(value).toLocaleString(locale)} ${t('common.currency')}`, t('dashboard.totalRevenue')]}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#1D5BD8" strokeWidth={2.5} fill="rgba(29,91,216,0.10)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-72 flex-col items-center justify-center text-center text-[#5B6B84]">
              <TrendingUp className="size-8 text-slate-300" />
              <p className="mt-2 text-[14px] font-medium">{t('company.noTransactions')}</p>
            </div>
          )}
        </div>

        {/* Recent Bookings Feed (Restored from V1) */}
        <div className="rounded-2xl border border-[#E6EBF2] bg-white p-5 md:p-6">
          <div className="flex items-center justify-between">
            <p className="text-[16px] font-extrabold text-[#0B1B33]">{t('dashboard.recentBookings')}</p>
            <Link href="/admin/bookings" className="flex items-center gap-1 text-[13px] font-bold text-[#1D5BD8] hover:underline">
              {t('dashboard.viewAll')} <ArrowRight className="size-3.5 v2-flip-rtl" />
            </Link>
          </div>
          <div className="mt-4 grid gap-2">
            {(!data?.recentBookings || data.recentBookings.length === 0) ? (
              <p className="rounded-xl bg-[#F6F8FC] py-8 text-center text-[13.5px] text-[#5B6B84]">
                {t('bookings.noBookings')}
              </p>
            ) : (
              data.recentBookings.slice(0, 6).map((b: any) => {
                const name = b.user?.name || b.passengerName || t('common.guest');
                const initial = name.slice(0, 1).toUpperCase();
                return (
                  <div key={b.id} className="flex items-center gap-3 rounded-xl p-2.5 hover:bg-[#F6F8FC]">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#EFF4FF] text-[13px] font-bold text-[#1D5BD8]">
                      {initial}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-bold text-[#0B1B33]">{name}</p>
                      <p className="truncate text-[12px] text-[#5B6B84]">
                        {isRTL
                          ? `${b.trip?.destination} ← ${b.trip?.origin}`
                          : `${b.trip?.origin} → ${b.trip?.destination}`}
                        {b.seatLabel ? ` · ${b.seatLabel}` : ''}
                      </p>
                    </div>
                    <div className="text-end">
                      <p className="text-[13.5px] font-extrabold tabular-nums text-[#0B1B33]">
                        {Number(b.total || 0).toLocaleString(locale)} {t('common.currency')}
                      </p>
                      <V2StatusBadge tone={b.status === 'PAID' ? 'green' : b.status === 'CANCELLED' ? 'red' : 'amber'}>
                        {b.status}
                      </V2StatusBadge>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions Grid (Restored from V1) */}
      <div className="mt-6">
        <p className="mb-3 text-[16px] font-extrabold text-[#0B1B33]">{t('admin.quickActions')}</p>
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/admin/buses"
            className="group flex flex-col justify-between rounded-2xl border border-[#E6EBF2] bg-white p-5 transition hover:border-[#1D5BD8]/40 hover:shadow-sm"
          >
            <div className="flex items-center justify-between">
              <span className="grid size-11 place-items-center rounded-xl bg-[#EFF4FF] text-[#1D5BD8] transition group-hover:scale-105">
                <Bus className="size-5" />
              </span>
              <ArrowRight className="size-4 text-slate-300 transition group-hover:translate-x-1 v2-flip-rtl group-hover:text-[#1D5BD8]" />
            </div>
            <div className="mt-4">
              <p className="text-[15px] font-extrabold text-[#0B1B33]">{t('dashboard.manageBuses')}</p>
              <p className="mt-0.5 text-[12.5px] text-[#5B6B84]">{t('dashboard.addBuses')}</p>
            </div>
          </Link>

          <Link
            href="/admin/trips"
            className="group flex flex-col justify-between rounded-2xl border border-[#E6EBF2] bg-white p-5 transition hover:border-[#1D5BD8]/40 hover:shadow-sm"
          >
            <div className="flex items-center justify-between">
              <span className="grid size-11 place-items-center rounded-xl bg-emerald-50 text-emerald-600 transition group-hover:scale-105">
                <Clock className="size-5" />
              </span>
              <ArrowRight className="size-4 text-slate-300 transition group-hover:translate-x-1 v2-flip-rtl group-hover:text-emerald-600" />
            </div>
            <div className="mt-4">
              <p className="text-[15px] font-extrabold text-[#0B1B33]">{t('dashboard.manageTrips')}</p>
              <p className="mt-0.5 text-[12.5px] text-[#5B6B84]">{t('dashboard.createTrips')}</p>
            </div>
          </Link>

          <Link
            href="/trips"
            className="group flex flex-col justify-between rounded-2xl border border-[#E6EBF2] bg-white p-5 transition hover:border-[#1D5BD8]/40 hover:shadow-sm"
          >
            <div className="flex items-center justify-between">
              <span className="grid size-11 place-items-center rounded-xl bg-purple-50 text-purple-600 transition group-hover:scale-105">
                <Ticket className="size-5" />
              </span>
              <ArrowRight className="size-4 text-slate-300 transition group-hover:translate-x-1 v2-flip-rtl group-hover:text-purple-600" />
            </div>
            <div className="mt-4">
              <p className="text-[15px] font-extrabold text-[#0B1B33]">{t('dashboard.viewTrips')}</p>
              <p className="mt-0.5 text-[12.5px] text-[#5B6B84]">{t('dashboard.seeTrips')}</p>
            </div>
          </Link>

          <Link
            href="/admin/companies/pending"
            className="group relative flex flex-col justify-between rounded-2xl border border-[#E6EBF2] bg-white p-5 transition hover:border-[#1D5BD8]/40 hover:shadow-sm"
          >
            <div className="flex items-center justify-between">
              <span className="grid size-11 place-items-center rounded-xl bg-amber-50 text-amber-600 transition group-hover:scale-105">
                <Building2 className="size-5" />
              </span>
              {pendingCount > 0 && (
                <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-extrabold text-white">
                  {pendingCount}
                </span>
              )}
            </div>
            <div className="mt-4">
              <p className="text-[15px] font-extrabold text-[#0B1B33]">{t('admin.pendingCompanies')}</p>
              <p className="mt-0.5 text-[12.5px] text-[#5B6B84]">{t('dashboard.reviewCompanies')}</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
