'use client';

import { useEffect, useState } from 'react';
import { Download, MapPin, Users } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { cn } from '@/lib/utils';
import { useLangStore } from '@/lib/lang';
import { V2PageHeader, V2StatCard, V2Tabs } from '@/components/v2/admin';
import { V2Skeleton } from '@/components/v2/ui';

/* V2 reports — same /api/reports data + CSV export as V1. */

interface RouteData {
  tripId: string; origin: string; destination: string; departure: string;
  revenue: number; bookedSeats: number; totalSeats: number; occupancy: number;
}
interface MonthlyData { month: string; revenue: number }
interface TopCustomer { userId: string; name: string; email: string; totalRevenue: number }
interface Report {
  routeData: RouteData[];
  monthlyData: MonthlyData[];
  topCustomers: TopCustomer[];
  summary: { totalBookings: number; cancelledBookings: number };
}

export default function AdminReports() {
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';
  const locale = isRTL ? 'ar-EG' : 'en-US';
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'routes' | 'revenue' | 'customers'>('routes');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/reports', { credentials: 'include' });
        if (res.ok) setData(await res.json());
      } catch { /* keep empty */ } finally { setLoading(false); }
    })();
  }, []);

  if (loading) {
    return (
      <div className="grid gap-4" role="status">
        <V2Skeleton className="h-10 w-64" />
        <div className="grid gap-3.5 sm:grid-cols-3">
          <V2Skeleton className="h-32 rounded-2xl" />
          <V2Skeleton className="h-32 rounded-2xl" />
          <V2Skeleton className="h-32 rounded-2xl" />
        </div>
        <V2Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  const routes = (data?.routeData || []).slice().sort((a, b) => b.occupancy - a.occupancy);
  const maxOcc = Math.max(1, ...routes.map((r) => r.occupancy || 0));

  return (
    <div>
      <V2PageHeader
        title={t('nav.reports')}
        action={
          <button
            onClick={() => window.open('/api/reports?format=csv', '_blank')}
            className="v2-btn-dark inline-flex items-center gap-2 px-5 py-3 text-[14px]"
          >
            <Download className="size-4" /> CSV
          </button>
        }
      />

      <div className="mt-5 grid gap-3.5 sm:grid-cols-3">
        <V2StatCard label={isRTL ? 'إجمالي الحجوزات' : 'Total Bookings'} value={(data?.summary.totalBookings ?? 0).toLocaleString(locale)} icon={<Users className="size-5 text-[#1D5BD8]" />} />
        <V2StatCard label={isRTL ? 'الحجوزات الملغاة' : 'Cancelled'} value={(data?.summary.cancelledBookings ?? 0).toLocaleString(locale)} icon={<Users className="size-5 text-red-500" />} />
        <V2StatCard label={isRTL ? 'إجمالي المسارات' : 'Total Routes'} value={(data?.routeData.length ?? 0).toLocaleString(locale)} icon={<MapPin className="size-5 text-emerald-600" />} />
      </div>

      <div className="mt-5">
        <V2Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { key: 'routes', label: isRTL ? 'المسارات' : 'Routes' },
            { key: 'revenue', label: isRTL ? 'الإيرادات' : 'Revenue' },
            { key: 'customers', label: isRTL ? 'العملاء' : 'Customers' },
          ]}
        />
      </div>

      {tab === 'routes' && (
        <div className="mt-4 grid gap-3">
          {routes.map((r) => (
            <div key={r.tripId} className="rounded-2xl border border-[var(--sp-line)] bg-[var(--sp-card)] p-5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[15.5px] font-extrabold text-[#0B1B33]">
                  {isRTL ? `${r.destination} ← ${r.origin}` : `${r.origin} → ${r.destination}`}
                </p>
                <span className="ms-auto text-[15px] font-extrabold tabular-nums text-[#0B1B33]">
                  {r.revenue.toLocaleString(locale)} {t('common.currency')}
                </span>
              </div>
              <p className="mt-1 text-[13px] tabular-nums text-[var(--sp-text-muted)]">
                {new Date(r.departure).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                {' · '}{r.bookedSeats}/{r.totalSeats} · {Math.round(r.occupancy || 0)}%
              </p>
              <div className="mt-2.5 h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-[#1D5BD8] transition-transform"
                  style={{ width: `${Math.min(100, ((r.occupancy || 0) / maxOcc) * 100)}%` }}
                />
              </div>
            </div>
          ))}
          {routes.length === 0 && (
            <p className="rounded-2xl border border-dashed border-slate-300 bg-[var(--sp-card)] py-10 text-center text-[14.5px] text-[var(--sp-text-muted)]">
              {t('bookings.noBookings')}
            </p>
          )}
        </div>
      )}

      {tab === 'revenue' && (
        <div className="mt-4 rounded-2xl border border-[var(--sp-line)] bg-[var(--sp-card)] p-5 md:p-6">
          {(data?.monthlyData.length || 0) === 0 ? (
            <p className="py-10 text-center text-[14.5px] text-[var(--sp-text-muted)]">{t('bookings.noBookings')}</p>
          ) : (
            <div className="h-72" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data!.monthlyData} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E6EBF2" />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#5B6B84' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#5B6B84' }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid #E6EBF2', fontSize: 13 }}
                    formatter={(v: any) => [`${Number(v).toLocaleString(locale)} ${t('common.currency')}`, isRTL ? 'الإيراد' : 'Revenue']}
                  />
                  <Bar dataKey="revenue" fill="#1D5BD8" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {tab === 'customers' && (
        <div className="mt-4 grid gap-3">
          {(data?.topCustomers || []).map((c, i) => (
            <div key={c.userId} className="flex items-center gap-3.5 rounded-2xl border border-[var(--sp-line)] bg-[var(--sp-card)] p-4">
              <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl text-[15px] font-extrabold tabular-nums', i === 0 ? 'bg-[#1D5BD8] text-white' : 'bg-[#EFF4FF] text-[#1D5BD8]')}>
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-extrabold text-[#0B1B33]">{c.name}</span>
                <span className="block truncate text-[12.5px] tabular-nums text-[var(--sp-text-muted)]" dir="ltr" style={{ textAlign: 'start' }}>{c.email}</span>
              </span>
              <span className="shrink-0 text-[15.5px] font-extrabold tabular-nums text-[#0B1B33]">
                {c.totalRevenue.toLocaleString(locale)} {t('common.currency')}
              </span>
            </div>
          ))}
          {(data?.topCustomers.length || 0) === 0 && (
            <p className="rounded-2xl border border-dashed border-slate-300 bg-[var(--sp-card)] py-10 text-center text-[14.5px] text-[var(--sp-text-muted)]">
              {t('bookings.noBookings')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
