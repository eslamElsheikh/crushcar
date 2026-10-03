'use client';

import { useCallback, useEffect, useState } from 'react';
import { Pencil, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useLangStore } from '@/lib/lang';
import { V2PageHeader, V2Table, V2Pagination, V2Modal, V2Tabs, V2SearchInput } from '@/components/v2/admin';
import { V2Field, V2Input } from '@/components/v2/Field';
import { V2Button } from '@/components/v2/Button';
import { V2StatusBadge } from '@/components/v2/ui';

/* V2 admin bookings — same list/confirm/edit APIs as V1, customer+company tabs. */

type Tab = 'customer' | 'company';

const toneFor = (s: string) =>
  s === 'PAID' ? 'green' : s === 'PENDING' ? 'amber' : s === 'CANCELLED' ? 'red' : 'blue';

export default function AdminBookings() {
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';
  const locale = isRTL ? 'ar-EG' : 'en-US';

  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('customer');
  const [search, setSearch] = useState('');
  const [refSearch, setRefSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editHotel, setEditHotel] = useState('');
  const [editing, setEditing] = useState(false);

  const load = useCallback(async (pageNum: number, tb: Tab, q: string, ref: string) => {
    setLoading(true);
    try {
      const typeParam = tb === 'company' ? '&type=company' : '';
      const qq = q ? `&q=${encodeURIComponent(q)}` : '';
      const rq = ref ? `&reference=${encodeURIComponent(ref)}` : '';
      const res = await fetch(`/api/bookings?page=${pageNum}&take=20${qq}${rq}${typeParam}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setBookings(data.data || []);
        setPages(data.pagination?.pages || 1);
        setPage(data.pagination?.page || pageNum);
      }
    } catch { /* keep list */ } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => load(1, tab, search, refSearch), search || refSearch ? 350 : 0);
    return () => clearTimeout(timer);
  }, [load, tab, search, refSearch]);

  async function confirmPaid() {
    if (!confirmId) return;
    setConfirming(true);
    try {
      const res = await fetch(`/api/bookings/${confirmId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'PAID' }),
      });
      if (res.ok) {
        setBookings((prev) => prev.map((b) => (b.id === confirmId ? { ...b, status: 'PAID' } : b)));
        setConfirmId(null);
        toast.success(t('payment.confirmed'));
      } else {
        toast.error(t('common.error'));
      }
    } catch {
      toast.error(t('common.error'));
    } finally {
      setConfirming(false);
    }
  }

  async function saveEdit() {
    if (!edit) return;
    setEditing(true);
    try {
      const res = await fetch(`/api/bookings/${edit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'UPDATE', passengerName: editName, passengerPhone: editPhone, passengerHotel: editHotel }),
      });
      if (res.ok) {
        setBookings((prev) => prev.map((b) => (b.id === edit.id ? { ...b, passengerName: editName, passengerPhone: editPhone, passengerHotel: editHotel } : b)));
        setEdit(null);
        toast.success(t('common.success'));
      } else {
        toast.error(t('common.error'));
      }
    } catch {
      toast.error(t('common.error'));
    } finally {
      setEditing(false);
    }
  }

  return (
    <div>
      <V2PageHeader title={t('nav.bookings')} />

      <div className="mt-5">
        <V2Tabs
          active={tab}
          onChange={(k) => { setTab(k); setPage(1); }}
          tabs={[
            { key: 'customer', label: isRTL ? 'عملاء' : 'Customers' },
            { key: 'company', label: isRTL ? 'شركات' : 'Companies' },
          ]}
        />
      </div>

      <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
        <V2SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder={t('bookings.search')} />
        <V2SearchInput value={refSearch} onChange={(v) => { setRefSearch(v); setPage(1); }} placeholder={t('bookings.reference')} />
      </div>

      <div className="mt-4">
        <V2Table
          columns={[
            t('bookings.reference'),
            t('bookings.customer'),
            t('bookings.route'),
            t('bookings.seat'),
            isRTL ? 'الإجمالي' : 'Total',
            isRTL ? 'الحالة' : 'Status',
            '',
          ]}
          rows={bookings}
          rowKey={(b) => b.id}
          loading={loading}
          emptyTitle={t('bookings.noBookings')}
          renderCell={(b, i) => {
            const cells = [
              <span key="r" className="font-mono text-[12.5px] tabular-nums" dir="ltr" style={{ textAlign: 'start' }}>{b.reference}</span>,
              <span key="c">
                <span className="block font-bold">{b.passengerName}</span>
                <span className="block text-[12.5px] font-normal tabular-nums text-[var(--sp-text-muted)]" dir="ltr" style={{ textAlign: 'start' }}>{b.passengerPhone}</span>
              </span>,
              <span key="rt" className="text-[13.5px]">
                <span className="block font-semibold">
                  {isRTL ? `${b.actualDestination || b.trip?.destination} ← ${b.actualOrigin || b.trip?.origin}` : `${b.actualOrigin || b.trip?.origin} → ${b.actualDestination || b.trip?.destination}`}
                </span>
                <span className="block text-[12.5px] font-normal tabular-nums text-[var(--sp-text-muted)]">
                  {(b.actualDeparture || b.trip?.departure) && new Date(b.actualDeparture || b.trip.departure).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                </span>
              </span>,
              <span key="s" className="font-bold tabular-nums">{b.seatLabel}</span>,
              <span key="p" className="font-extrabold tabular-nums">EGP {Number(b.total || 0).toLocaleString(locale)}</span>,
              <V2StatusBadge key="st" tone={toneFor(b.status) as 'green' | 'amber' | 'red' | 'blue'}>
                {t(`booking.${b.status.toLowerCase()}`)}
              </V2StatusBadge>,
              <span key="a" className="flex justify-end gap-1">
                {b.status === 'PENDING' && (
                  <button
                    onClick={() => setConfirmId(b.id)}
                    className="rounded-xl bg-emerald-50 px-3.5 py-2.5 text-[13px] font-bold text-emerald-700 hover:bg-emerald-100"
                  >
                    {t('payment.confirmBtn')}
                  </button>
                )}
                <button
                  onClick={() => { setEdit(b); setEditName(b.passengerName || ''); setEditPhone(b.passengerPhone || ''); setEditHotel(b.passengerHotel || ''); }}
                  aria-label="Edit"
                  className="grid size-10 place-items-center rounded-xl text-[var(--sp-text-muted)] hover:bg-slate-100 hover:text-[#0B1B33]"
                >
                  <Pencil className="size-4" />
                </button>
              </span>,
            ];
            return cells[i];
          }}
          renderMobile={(b) => (
            <div>
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-[15px] font-extrabold text-[#0B1B33]">
                  {b.passengerName} · <span className="tabular-nums">{b.seatLabel}</span>
                </p>
                <V2StatusBadge tone={toneFor(b.status) as 'green' | 'amber' | 'red' | 'blue'}>{b.status}</V2StatusBadge>
              </div>
              <p className="mt-1 font-mono text-[12px] tabular-nums text-[var(--sp-text-muted)]" dir="ltr" style={{ textAlign: 'start' }}>{b.reference}</p>
              <p className="mt-1 text-[14px] font-extrabold tabular-nums">EGP {Number(b.total || 0).toLocaleString(locale)}</p>
              <div className="mt-3 flex gap-1.5">
                {b.status === 'PENDING' && (
                  <button onClick={() => setConfirmId(b.id)} className="flex-1 rounded-xl bg-emerald-50 py-2.5 text-[13.5px] font-bold text-emerald-700">
                    {t('payment.confirmBtn')}
                  </button>
                )}
                <button
                  onClick={() => { setEdit(b); setEditName(b.passengerName || ''); setEditPhone(b.passengerPhone || ''); setEditHotel(b.passengerHotel || ''); }}
                  className="flex-1 rounded-xl bg-slate-100 py-2.5 text-[13.5px] font-bold text-[#0B1B33]"
                >
                  {t('common.edit')}
                </button>
              </div>
            </div>
          )}
        />
        <V2Pagination page={page} pages={pages} onPage={(p) => load(p, tab, search, refSearch)} />
      </div>

      <V2Modal open={!!confirmId} onClose={() => setConfirmId(null)} title={t('payment.confirmTitle')}>
        <p className="text-[14.5px] text-[var(--sp-text-muted)]">{t('payment.pendingDesc')}</p>
        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <button onClick={() => setConfirmId(null)} className="rounded-xl bg-slate-100 py-3.5 text-[14.5px] font-bold text-[#0B1B33]">
            {t('common.cancel')}
          </button>
          <V2Button disabled={confirming} onClick={confirmPaid}>
            {confirming ? <Loader2 className="size-5 animate-spin" /> : null} {t('payment.confirmBtn')}
          </V2Button>
        </div>
      </V2Modal>

      <V2Modal open={!!edit} onClose={() => setEdit(null)} title={t('common.edit')}>
        <div className="grid gap-3.5">
          <V2Field label={t('company.passengerName')}>
            <V2Input value={editName} onChange={(e) => setEditName(e.target.value)} />
          </V2Field>
          <V2Field label={t('company.passengerPhone')}>
            <V2Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} dir="ltr" className="tabular-nums" />
          </V2Field>
          <V2Field label={t('v2.hotelPh')}>
            <V2Input value={editHotel} onChange={(e) => setEditHotel(e.target.value)} />
          </V2Field>
        </div>
        <V2Button disabled={editing} onClick={saveEdit} size="lg" className="mt-5 w-full">
          {editing ? <Loader2 className="size-5 animate-spin" /> : null} {t('common.save')}
        </V2Button>
      </V2Modal>
    </div>
  );
}
