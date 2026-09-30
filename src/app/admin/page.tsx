'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Ticket, Wallet, Bus, TrendingUp, Clock, ArrowRight } from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { useLangStore } from '@/lib/lang';
import { V2PageHeader, V2StatCard } from '@/components/v2/admin';
import { V2Skeleton } from '@/components/v2/ui';

/* V2 admin dashboard — same /api/analytics + pending-companies data as V1.
   No invented deltas: only metrics the backend actually returns. */

interface Analytics {
  totalBookings: number;
  totalRevenue: number;
  activeTrips: number;
  chartData?: { label: string; revenue: number; bookings: number }[];
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

  useEffect(() => {
    setLoading(true);
    fetch(`/api/analytics?range=${range}`, { credentials: 'include' })
      .then((r) => r.json())
      .then(setData)
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
        <V2Skeleton className="h-72 rounded-2xl" />
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

      {(data?.chartData?.length || 0) > 0 && (
        <div className="mt-5 rounded-2xl border border-[#E6EBF2] bg-white p-5 md:p-6">
          <p className="text-[16px] font-extrabold text-[#0B1B33]">{t('dashboard.revenueChart')}</p>
          <div className="mt-4 h-64" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data!.chartData} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E6EBF2" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#5B6B84' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#5B6B84' }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid #E6EBF2', fontSize: 13 }}
                  formatter={(value: any) => [`${Number(value).toLocaleString(locale)} ${t('common.currency')}`, t('dashboard.totalRevenue')]}
                />
                <Area type="monotone" dataKey="revenue" stroke="#1D5BD8" strokeWidth={2.5} fill="rgba(29,91,216,0.10)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
