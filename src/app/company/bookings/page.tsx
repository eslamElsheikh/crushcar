'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLangStore } from '@/lib/lang';
import { V2Input } from '@/components/v2/Field';
import { V2StatusBadge, V2Skeleton, V2EmptyState } from '@/components/v2/ui';

/* V2 company bookings list — same ?status&q&page API as V1. */

export default function CompanyBookingsPage() {
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';
  const locale = isRTL ? 'ar-EG' : 'en-US';

  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (status) p.set('status', status);
      if (q) p.set('q', q);
      p.set('page', String(page));
      const res = await fetch(`/api/company/bookings?${p}`);
      if (res.ok) {
        const data = await res.json();
        setBookings(data.data || []);
        setPages(data.pagination?.pages || 1);
      }
    } catch { /* keep list */ } finally { setLoading(false); }
  }, [status, q, page]);

  useEffect(() => {
    const timer = setTimeout(load, q ? 350 : 0);
    return () => clearTimeout(timer);
  }, [load, q]);

  const filters = ['', 'PENDING', 'PAID', 'BOARDED', 'CANCELLED'];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-balance text-[26px] font-extrabold text-[#0B1B33] md:text-[32px]">{t('company.bookings')}</h1>
          <p className="mt-1 text-[14.5px] tabular-nums text-[var(--sp-text-muted)]">{t('company.totalBookings')}</p>
        </div>
        <Link href="/company/bookings/new" className="v2-btn-primary inline-flex items-center gap-2 px-5 py-3 text-[14.5px]">
          <Plus className="size-5" /> {t('company.newBooking')}
        </Link>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        <span className="relative block w-full sm:w-64">
          <Search className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-[#9AA8BD]" />
          <V2Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder={t('bookings.search')} aria-label={t('bookings.search')} className="ps-11" />
        </span>
        <div className="flex flex-wrap gap-1.5">
          {filters.map((f) => (
            <button
              key={f || 'all'}
              onClick={() => { setStatus(f); setPage(1); }}
              aria-pressed={status === f}
              className={cn(
                'rounded-xl border px-3.5 py-2.5 text-[13.5px] font-bold transition',
                status === f ? 'border-[#0A1E3C] bg-[#0A1E3C] text-white' : 'border-slate-200 bg-[var(--sp-card)] text-[var(--sp-text-muted)]'
              )}
            >
              {f || (isRTL ? 'الكل' : 'All')}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="grid gap-3" role="status">
            <V2Skeleton className="h-28 rounded-2xl" />
            <V2Skeleton className="h-28 rounded-2xl" />
          </div>
        ) : bookings.length === 0 ? (
          <V2EmptyState
            title={t('company.noBookings')}
            actionLabel={t('company.newBooking')}
            onAction={() => { window.location.href = '/company/bookings/new'; }}
          />
        ) : (
          <>
            <div className="grid gap-3">
              {bookings.map((b: any) => (
                <Link key={b.id} href={`/company/bookings/${b.id}`} className="rounded-2xl border border-[var(--sp-line)] bg-[var(--sp-card)] p-5 transition hover:border-[#1D5BD8]/40">
                  <div className="flex flex-wrap items-center gap-2">
                    <V2StatusBadge tone={b.status === 'PAID' ? 'green' : b.status === 'CANCELLED' ? 'red' : 'amber'}>
                      {t(`booking.${String(b.status).toLowerCase()}`)}
                    </V2StatusBadge>
                    <span className="font-mono text-[12px] tabular-nums text-[var(--sp-text-muted)]" dir="ltr">{b.reference}</span>
                    <span className="ms-auto text-[16px] font-extrabold tabular-nums text-[#0B1B33]">
                      EGP {(b.total || 0).toLocaleString(locale)}
                    </span>
                  </div>
                  <p className="mt-2.5 truncate text-[15.5px] font-extrabold text-[#0B1B33]">
                    {isRTL
                      ? `${b.actualDestination || b.trip?.destination} ← ${b.actualOrigin || b.trip?.origin}`
                      : `${b.actualOrigin || b.trip?.origin} → ${b.actualDestination || b.trip?.destination}`}
                  </p>
                  <p className="mt-1 text-[13px] tabular-nums text-[var(--sp-text-muted)]">
                    {(b.actualDeparture || b.trip?.departure) && new Date(b.actualDeparture || b.trip.departure).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                    {b.customer?.name ? ` · ${b.customer.name}` : ''}
                    {b.seatLabel ? ` · ${isRTL ? 'مقعد' : 'Seat'} ${b.seatLabel}` : ''}
                  </p>
                </Link>
              ))}
            </div>
            {pages > 1 && (
              <div className="mt-5 flex items-center justify-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
                  aria-label="Previous page"
                  className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-[var(--sp-card)] text-[#0B1B33] disabled:opacity-40"
                >
                  <ChevronLeft className="size-5 v2-flip-rtl" />
                </button>
                <span className="text-[14px] font-bold tabular-nums text-[#0B1B33]">{page} / {pages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages}
                  aria-label="Next page"
                  className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-[var(--sp-card)] text-[#0B1B33] disabled:opacity-40"
                >
                  <ChevronRight className="size-5 v2-flip-rtl" />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
