'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { CreditCard, Wallet, TrendingUp, Ticket, ArrowRight, FileText, Plus, Bus, Armchair, CalendarClock, AlertTriangle } from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { useSession } from 'next-auth/react';
import { useLangStore } from '@/lib/lang';
import { V2Skeleton, V2StatusBadge } from '@/components/v2/ui';

/* V2 company dashboard — same credit + recent bookings APIs as V1. */

interface CreditStatus {
  company: any;
  availableCredit: number;
  walletBalance: number;
  outstandingBalance: number;
  usagePercent: number;
  nearLimit: boolean;
  totalBookings: number;
  totalSpent: number;
  monthlySpend: { month: string; total: number }[];
  charter: { requested: number; confirmed: number; revenue: number };
  pendingTripRequests: number;
  dueInvoices: { count: number; total: number };
}

export default function CompanyDashboard() {
  const { data: session } = useSession();
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';
  const locale = isRTL ? 'ar-EG' : 'en-US';
  const [data, setData] = useState<CreditStatus | null>(null);
  const [recent, setRecent] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/company/credit').then((r) => r.json()),
      fetch('/api/company/bookings?take=5').then((r) => r.json()),
    ])
      .then(([credit, bookings]) => {
        if (credit?.error) setFailed(true);
        else setData(credit);
        setRecent(bookings.data || []);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid gap-4" role="status">
        <V2Skeleton className="h-10 w-64" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <V2Skeleton className="h-32 rounded-2xl" />
          <V2Skeleton className="h-32 rounded-2xl" />
          <V2Skeleton className="h-32 rounded-2xl" />
          <V2Skeleton className="h-32 rounded-2xl" />
        </div>
        <V2Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (failed || !data) {
    return (
      <div className="rounded-2xl border border-[var(--sp-line)] bg-[var(--sp-card)] p-10 text-center">
        <p className="text-[17px] font-extrabold text-[#0B1B33]">{t('common.error')}</p>
        <button onClick={() => window.location.reload()} className="mt-4 rounded-xl bg-[#EFF4FF] px-6 py-3 text-[14.5px] font-bold text-[#1D5BD8]">
          {t('v2.retry')}
        </button>
      </div>
    );
  }

  const cards = [
    { label: t('company.walletBalance'), value: `${data.walletBalance.toLocaleString(locale)} ${t('common.currency')}`, icon: Wallet, chip: 'bg-emerald-50 text-emerald-700' },
    { label: t('company.availableCredit'), value: `${data.availableCredit.toLocaleString(locale)} ${t('common.currency')}`, icon: CreditCard, chip: 'bg-[#EFF4FF] text-[#1D5BD8]' },
    { label: t('company.outstanding'), value: `${data.outstandingBalance.toLocaleString(locale)} ${t('common.currency')}`, icon: TrendingUp, chip: 'bg-amber-50 text-amber-700' },
    { label: t('company.totalBookings'), value: data.totalBookings.toLocaleString(locale), icon: Ticket, chip: 'bg-slate-100 text-[#0B1B33]' },
  ];

  const monthLabel = (ym: string) => {
    const d = new Date(`${ym}-01T00:00:00`);
    return isNaN(d.getTime()) ? ym : d.toLocaleDateString(locale, { month: 'short' });
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-balance text-[26px] font-extrabold text-[#0B1B33] md:text-[32px]">
            {t('company.welcome')}, {session?.user?.name}
          </h1>
          <p className="mt-1 text-[14.5px] text-[var(--sp-text-muted)]">{data.company?.name}</p>
        </div>
        <Link href="/company/bookings/new" className="v2-btn-primary inline-flex items-center gap-2 px-5 py-3 text-[14.5px]">
          <Plus className="size-5" /> {t('company.newBooking')}
        </Link>
      </div>

      <div className="mt-6 grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c, i) => (
          <motion.div
            key={c.label}
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut', delay: i * 0.06 }}
            className="rounded-2xl border border-[var(--sp-line)] bg-[var(--sp-card)] p-5 shadow-[0_12px_32px_rgba(11,27,51,0.08)]"
          >
            <span className={`inline-grid size-11 place-items-center rounded-xl ${c.chip}`}>
              <c.icon className="size-5" />
            </span>
            <p className="mt-3.5 truncate text-[13px] font-semibold text-[var(--sp-text-muted)]">{c.label}</p>
            <p className="mt-1 text-[21px] font-extrabold tabular-nums text-[#0B1B33]">{c.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Credit usage + monthly spend */}
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <div className="rounded-2xl border border-[var(--sp-line)] bg-[var(--sp-card)] p-5 md:p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[16px] font-extrabold text-[#0B1B33]">{t('company.creditUsage')}</p>
            <span className="text-[22px] font-extrabold tabular-nums text-[#0B1B33]">
              {(data.usagePercent ?? 0).toLocaleString(locale)}%
            </span>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-[var(--sp-inset)]" role="progressbar" aria-valuenow={data.usagePercent ?? 0} aria-valuemin={0} aria-valuemax={100}>
            <div
              className={`h-full rounded-full transition-all ${(data.usagePercent ?? 0) >= 80 ? 'bg-red-500' : (data.usagePercent ?? 0) >= 50 ? 'bg-amber-500' : 'bg-[#1D5BD8]'}`}
              style={{ width: `${Math.min(100, data.usagePercent ?? 0)}%` }}
            />
          </div>
          <p className="mt-2.5 text-[13px] tabular-nums text-[var(--sp-text-muted)]">
            {data.outstandingBalance.toLocaleString(locale)} / {(data.company?.creditLimit ?? 0).toLocaleString(locale)} EGP
          </p>
          {data.nearLimit && (
            <Link href="/company/credit" className="mt-3 flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13.5px] font-bold text-amber-800 hover:border-amber-300">
              <AlertTriangle className="size-5 shrink-0" /> {t('company.nearLimit')}
            </Link>
          )}
        </div>

        <div className="rounded-2xl border border-[var(--sp-line)] bg-[var(--sp-card)] p-5 md:p-6">
          <p className="text-[16px] font-extrabold text-[#0B1B33]">{t('company.monthlySpend')}</p>
          {(data.monthlySpend?.length || 0) > 0 ? (
            <div className="mt-3 h-52" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.monthlySpend.map((m) => ({ ...m, label: monthLabel(m.month) }))} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E6EBF2" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#5B6B84' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#5B6B84' }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid #E6EBF2', fontSize: 13 }}
                    formatter={(value: any) => [`${Number(value).toLocaleString(locale)} EGP`, t('company.monthlySpend')]}
                  />
                  <Area type="monotone" dataKey="total" stroke="#1D5BD8" strokeWidth={2.5} fill="rgba(29,91,216,0.10)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="mt-3 rounded-xl bg-[var(--sp-inset)] py-10 text-center text-[13.5px] text-[var(--sp-text-muted)]">
              {t('company.noBookings')}
            </p>
          )}
        </div>
      </div>

      {/* Charter vs seats + pending requests + due invoices */}
      <div className="mt-5 grid gap-3.5 sm:grid-cols-3">
        <Link href="/company/charter" className="rounded-2xl border border-[var(--sp-line)] bg-[var(--sp-card)] p-5 transition hover:border-[#1D5BD8]/40">
          <div className="flex items-center justify-between">
            <span className="grid size-11 place-items-center rounded-xl bg-purple-50 text-purple-600">
              <Bus className="size-5" />
            </span>
            <ArrowRight className="size-4 text-slate-300 v2-flip-rtl" />
          </div>
          <p className="mt-3.5 text-[15px] font-extrabold text-[#0B1B33]">{t('company.charterVsSeats')}</p>
          <p className="mt-1.5 flex items-center gap-4 text-[13px] font-bold tabular-nums text-[var(--sp-text-muted)]">
            <span className="inline-flex items-center gap-1.5"><Bus className="size-4 text-purple-600" /> {(data.charter?.confirmed ?? 0).toLocaleString(locale)}</span>
            <span className="inline-flex items-center gap-1.5"><Armchair className="size-4 text-[#1D5BD8]" /> {data.totalBookings.toLocaleString(locale)}</span>
          </p>
          {(data.charter?.requested ?? 0) > 0 && (
            <p className="mt-1 text-[12.5px] font-bold text-amber-700">
              {data.charter.requested.toLocaleString(locale)} · {t('company.pendingRequests')}
            </p>
          )}
        </Link>
        <Link href="/company/trip-requests" className="rounded-2xl border border-[var(--sp-line)] bg-[var(--sp-card)] p-5 transition hover:border-[#1D5BD8]/40">
          <div className="flex items-center justify-between">
            <span className="grid size-11 place-items-center rounded-xl bg-amber-50 text-amber-600">
              <CalendarClock className="size-5" />
            </span>
            <ArrowRight className="size-4 text-slate-300 v2-flip-rtl" />
          </div>
          <p className="mt-3.5 text-[15px] font-extrabold text-[#0B1B33]">{t('company.pendingRequests')}</p>
          <p className="mt-1.5 text-[21px] font-extrabold tabular-nums text-[#0B1B33]">
            {(data.pendingTripRequests ?? 0).toLocaleString(locale)}
          </p>
        </Link>
        <Link href="/company/invoices" className="rounded-2xl border border-[var(--sp-line)] bg-[var(--sp-card)] p-5 transition hover:border-[#1D5BD8]/40">
          <div className="flex items-center justify-between">
            <span className="grid size-11 place-items-center rounded-xl bg-[#EFF4FF] text-[#1D5BD8]">
              <FileText className="size-5" />
            </span>
            <ArrowRight className="size-4 text-slate-300 v2-flip-rtl" />
          </div>
          <p className="mt-3.5 text-[15px] font-extrabold text-[#0B1B33]">{t('company.dueInvoices')}</p>
          <p className="mt-1.5 text-[21px] font-extrabold tabular-nums text-[#0B1B33]">
            {(data.dueInvoices?.count ?? 0).toLocaleString(locale)}
          </p>
          <p className="mt-1 text-[13px] font-bold tabular-nums text-[var(--sp-text-muted)]">
            {(data.dueInvoices?.total ?? 0).toLocaleString(locale)} EGP
          </p>
        </Link>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_320px]">
        <div className="rounded-2xl border border-[var(--sp-line)] bg-[var(--sp-card)] p-5 md:p-6">
          <div className="flex items-center justify-between">
            <p className="text-[16.5px] font-extrabold text-[#0B1B33]">{t('company.recentBookings')}</p>
            <Link href="/company/bookings" className="flex items-center gap-1 text-[13.5px] font-bold text-[#1D5BD8]">
              {t('company.bookings')} <ArrowRight className="size-4 v2-flip-rtl" />
            </Link>
          </div>
          <div className="mt-4 grid gap-2.5">
            {recent.length === 0 && (
              <p className="rounded-xl bg-[var(--sp-inset)] py-6 text-center text-[14px] text-[var(--sp-text-muted)]">{t('company.noBookings')}</p>
            )}
            {recent.map((b: any) => (
              <Link key={b.id} href={`/company/bookings/${b.id}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-[var(--sp-inset)]">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#EFF4FF] text-[13px] font-extrabold text-[#1D5BD8]">
                  {(b.actualOrigin || b.trip?.origin || '?').slice(0, 1)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold text-[#0B1B33]">
                    {isRTL
                      ? `${b.actualDestination || b.trip?.destination} ← ${b.actualOrigin || b.trip?.origin}`
                      : `${b.actualOrigin || b.trip?.origin} → ${b.actualDestination || b.trip?.destination}`}
                  </span>
                  <span className="block text-[12.5px] tabular-nums text-[var(--sp-text-muted)]">
                    {(b.actualDeparture || b.trip?.departure) && new Date(b.actualDeparture || b.trip.departure).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                  </span>
                </span>
                <V2StatusBadge tone={b.status === 'PAID' ? 'green' : b.status === 'CANCELLED' ? 'red' : 'amber'}>
                  {t(`booking.${String(b.status).toLowerCase()}`)}
                </V2StatusBadge>
              </Link>
            ))}
          </div>
        </div>

        <div className="grid content-start gap-3.5">
          <Link href="/company/credit" className="rounded-2xl border border-[var(--sp-line)] bg-[var(--sp-card)] p-5 hover:border-[#1D5BD8]/40">
            <Wallet className="size-6 text-emerald-600" />
            <p className="mt-3 text-[15px] font-extrabold text-[#0B1B33]">{t('company.deposit')}</p>
            <p className="mt-1 text-[13px] text-[var(--sp-text-muted)]">{t('company.walletBalance')}: {data.walletBalance.toLocaleString(locale)} {t('common.currency')}</p>
          </Link>
          <Link href="/company/invoices" className="rounded-2xl border border-[var(--sp-line)] bg-[var(--sp-card)] p-5 hover:border-[#1D5BD8]/40">
            <FileText className="size-6 text-[#1D5BD8]" />
            <p className="mt-3 text-[15px] font-extrabold text-[#0B1B33]">{t('company.viewInvoices')}</p>
            <p className="mt-1 text-[13px] text-[var(--sp-text-muted)]">{t('company.outstanding')}: {data.outstandingBalance.toLocaleString(locale)} {t('common.currency')}</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
