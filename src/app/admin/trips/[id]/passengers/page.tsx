'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowRight, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useLangStore } from '@/lib/lang';
import { V2PageHeader, V2Table, V2Tabs } from '@/components/v2/admin';
import { V2StatusBadge } from '@/components/v2/ui';

/* V2 per-trip passengers — same trip fetch + BOARDED PATCH as V1. */

export default function TripPassengersPage() {
  const params = useParams();
  const tripId = params.id as string;
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';
  const locale = isRTL ? 'ar-EG' : 'en-US';

  const [trip, setTrip] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'boarded' | 'pending'>('all');
  const [boarding, setBoarding] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/trips/${tripId}`, { credentials: 'include' });
      if (res.ok) setTrip(await res.json());
    } catch { /* keep view */ } finally { setLoading(false); }
  }, [tripId]);

  useEffect(() => { load(); }, [load]);

  async function markBoarded(bookingId: string, isCompany: boolean) {
    setBoarding(bookingId);
    try {
      const url = isCompany ? `/api/company/bookings/${bookingId}` : `/api/bookings/${bookingId}`;
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'BOARDED' }),
      });
      if (res.ok) {
        const updated = await res.json().catch(() => ({}));
        setTrip((prev: any) => {
          if (!prev) return prev;
          const mark = (list: any[]) => (list || []).map((b) => (b.id === bookingId ? { ...b, ...updated, boarded: true } : b));
          return { ...prev, bookings: mark(prev.bookings), companyBookings: mark(prev.companyBookings) };
        });
      } else {
        toast.error(t('common.error'));
      }
    } catch {
      toast.error(t('common.error'));
    } finally {
      setBoarding(null);
    }
  }

  const all = useMemo(() => {
    const mine = (list: any[], company: boolean) => (list || [])
      .filter((b: any) => b.status !== 'CANCELLED')
      .map((b: any) => ({ ...b, isCompany: company }));
    return [...mine(trip?.bookings, false), ...mine(trip?.companyBookings, true)];
  }, [trip]);

  const boarded = all.filter((b) => b.boarded || b.status === 'BOARDED');
  const pending = all.filter((b) => !b.boarded && b.status === 'PAID');
  const visible = filter === 'boarded' ? boarded : filter === 'pending' ? pending : all;

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/admin/trips" className="inline-flex items-center gap-1.5 text-[14px] font-bold text-[var(--sp-text-muted)] hover:text-[#0B1B33]">
        <ArrowRight className="size-4 rotate-180 v2-flip-rtl" /> {t('nav.trips')}
      </Link>
      <div className="mt-3">
        <V2PageHeader
          title={trip ? (isRTL ? `${trip.destination} ← ${trip.origin}` : `${trip.origin} → ${trip.destination}`) : t('nav.customers')}
          sub={trip ? `${trip.bus?.name} · ${all.length} · ${boarded.length}/${all.length || 1}` : undefined}
        />
      </div>

      <div className="mt-5">
        <V2Tabs
          active={filter}
          onChange={setFilter}
          tabs={[
            { key: 'all', label: isRTL ? 'الكل' : 'All', count: all.length },
            { key: 'pending', label: isRTL ? 'بالانتظار' : 'Pending', count: pending.length },
            { key: 'boarded', label: t('booking.boarded'), count: boarded.length },
          ]}
        />
      </div>

      <div className="mt-4">
        <V2Table
          columns={[
            isRTL ? 'المسافر' : 'Passenger',
            isRTL ? 'المقعد' : 'Seat',
            isRTL ? 'الهاتف' : 'Phone',
            isRTL ? 'الحالة' : 'Status',
            '',
          ]}
          rows={visible}
          rowKey={(b) => b.id}
          loading={loading}
          emptyTitle={t('bookings.noBookings')}
          renderCell={(b, i) => {
            const done = b.boarded || b.status === 'BOARDED';
            const cells = [
              <span key="n">
                <span className="block font-bold">{b.passengerName}</span>
                {b.isCompany && <span className="block text-[12px] font-normal text-[var(--sp-text-muted)]">B2B</span>}
              </span>,
              <span key="s" className="font-bold tabular-nums">{b.seatLabel}</span>,
              <span key="p" className="tabular-nums text-[var(--sp-text-muted)]" dir="ltr" style={{ textAlign: 'start' }}>{b.passengerPhone}</span>,
              <V2StatusBadge key="st" tone={done ? 'green' : b.status === 'PAID' ? 'blue' : 'amber'}>
                {done ? t('booking.boarded') : b.status}
              </V2StatusBadge>,
              done ? (
                <span key="a" className="flex items-center justify-end gap-1 text-[13px] font-bold tabular-nums text-emerald-700">
                  <Check className="size-4" />
                  {b.boardedAt ? new Date(b.boardedAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
              ) : (
                <span key="a" className="flex justify-end">
                  <button
                    onClick={() => markBoarded(b.id, b.isCompany)}
                    disabled={boarding === b.id}
                    className="rounded-xl bg-[#EFF4FF] px-4 py-2.5 text-[13.5px] font-bold text-[#1D5BD8] hover:bg-[#1D5BD8] hover:text-white disabled:opacity-50"
                  >
                    {boarding === b.id ? <Loader2 className="size-4 animate-spin" /> : t('booking.boarded')}
                  </button>
                </span>
              ),
            ];
            return cells[i];
          }}
          renderMobile={(b) => {
            const done = b.boarded || b.status === 'BOARDED';
            return (
              <div>
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-[15px] font-extrabold text-[#0B1B33]">
                    {b.passengerName} · <span className="tabular-nums">{b.seatLabel}</span>
                  </p>
                  <V2StatusBadge tone={done ? 'green' : 'amber'}>{done ? t('booking.boarded') : b.status}</V2StatusBadge>
                </div>
                {!done && (
                  <button
                    onClick={() => markBoarded(b.id, b.isCompany)}
                    disabled={boarding === b.id}
                    className="mt-3 w-full rounded-xl bg-[#EFF4FF] py-3 text-[14px] font-bold text-[#1D5BD8] disabled:opacity-50"
                  >
                    {boarding === b.id ? <Loader2 className="mx-auto size-4 animate-spin" /> : t('booking.boarded')}
                  </button>
                )}
              </div>
            );
          }}
        />
      </div>
    </div>
  );
}
