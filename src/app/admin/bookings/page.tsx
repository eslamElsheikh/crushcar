'use client';

import { routeLabel } from '@/lib/route-label';
import { useCallback, useEffect, useState } from 'react';
import { Pencil, Loader2, AlertTriangle, Wallet, X } from 'lucide-react';
import { toast } from 'sonner';
import { useLangStore } from '@/lib/lang';
import { V2PageHeader, V2Table, V2Pagination, V2Modal, V2Tabs, V2SearchInput } from '@/components/v2/admin';
import { V2Field, V2Input } from '@/components/v2/Field';
import { V2Button } from '@/components/v2/Button';
import { V2StatusBadge } from '@/components/v2/ui';
import { bookingStatusLabel, bookingStatusTone } from '@/lib/booking-status';

/* V2 admin bookings — same list/confirm/edit APIs as V1, customer+company tabs. */

type Tab = 'customer' | 'company';

// Kept in sync with PROOF_REQUIRED_FROM in src/app/api/bookings/[id]/route.ts.
// Sits after the last legacy booking (2026-06-26) so those stay confirmable.
const PROOF_REQUIRED_FROM_MS = new Date(
  process.env.NEXT_PUBLIC_PROOF_REQUIRED_FROM || '2026-07-01T00:00:00Z'
).getTime();

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
  const [rejectReason, setRejectReason] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editHotel, setEditHotel] = useState('');
  const [editing, setEditing] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

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
      } else {
        setBookings([]);
      }
    } catch {
      setBookings([]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => load(1, tab, search, refSearch), search || refSearch ? 350 : 0);
    return () => clearTimeout(timer);
  }, [load, tab, search, refSearch]);

  async function confirmPaid() {
    if (!confirmId) return;
    // The server enforces this too; catching it here avoids a raw error toast.
    if (confirmBooking && !confirmBooking.paymentProofUrl && needsProof(confirmBooking)) {
      toast.error(t('pay.proofRequired'));
      return;
    }
    setConfirming(true);
    try {
      const res = await fetch(`/api/bookings/${confirmId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'PAID' }),
      });
      if (res.ok) {
        setBookings((prev) =>
          prev.map((b) => (b.id === confirmId ? { ...b, status: 'PAID', paymentStatus: 'APPROVED' } : b))
        );
        setConfirmId(null);
        toast.success(t('payment.confirmed'));
      } else {
        const body = await res.json().catch(() => ({}));
        toast.error(body.message || body.error || t('common.error'));
      }
    } catch {
      toast.error(t('common.error'));
    } finally {
      setConfirming(false);
    }
  }

  async function requestProof() {
    if (!confirmId || !rejectReason.trim()) return;
    setRequesting(true);
    try {
      const res = await fetch(`/api/bookings/${confirmId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'REQUEST_PROOF', reason: rejectReason.trim() }),
      });
      if (res.ok) {
        const updated = await res.json();
        setBookings((prev) => prev.map((b) => (b.id === confirmId ? { ...b, paymentStatus: updated.paymentStatus, paymentRejectReason: updated.paymentRejectReason } : b)));
        setConfirmId(null);
        setRejectReason('');
        toast.success(t('pay.requestSent') || 'Done');
      } else {
        toast.error(t('common.error'));
      }
    } catch {
      toast.error(t('common.error'));
    } finally {
      setRequesting(false);
    }
  }

  /**
   * Cancels a booking the platform paid for and returns the money to the
   * platform wallet, in full. The server does it in one transaction, so there
   * is no state where the booking is cancelled and the money is not back.
   */
  async function cancelPlatformBooking(b: any) {
    setCancellingId(b.id);
    try {
      const res = await fetch(`/api/bookings/${b.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'CANCELLED', reason: 'PLATFORM_CANCEL' }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setBookings((prev) =>
          prev.map((x) =>
            x.id === b.id
              ? { ...x, status: 'CANCELLED', refundAmount: data.refundAmount ?? x.total, cancelledAt: data.cancelledAt }
              : x,
          ),
        );
        toast.success(isRTL ? 'تم الإلغاء وإرجاع المبلغ إلى محفظة المنصة' : 'Cancelled and returned to the platform wallet');
      } else {
        toast.error(data.message || data.error || t('common.error'));
      }
    } catch {
      toast.error(t('common.error'));
    } finally {
      setCancellingId(null);
    }
  }

  function methodLabel(m?: string | null) {
    if (m === 'VODAFONE_CASH') return t('pay.methodVodafone');
    if (m === 'INSTAPAY') return t('pay.methodInstapay');
    if (m === 'CASH') return t('pay.methodCash');
    if (m === 'BANK') return t('pay.methodBank');
    return m || '—';
  }

  const confirmBooking = confirmId ? bookings.find((b) => b.id === confirmId) : null;

  // Mirrors PROOF_REQUIRED_FROM in the API: bookings created before the cutoff
  // predate the requirement and stay confirmable without a screenshot.
  const needsProof = (b: any) =>
    !!b && !b.paymentProofUrl && new Date(b.createdAt).getTime() >= PROOF_REQUIRED_FROM_MS;

  const confirmBlocked = confirmBooking ? needsProof(confirmBooking) : false;

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
            // Hotel and collected amount only exist on a company booking
            // (CompanyBooking.collectAmount). Customer rows would render two
            // permanently empty columns, so the pair is shown on the company
            // tab only — it slots in right after the route.
            ...(tab === 'company'
              ? [isRTL ? 'الفندق' : 'Hotel', isRTL ? 'مبلغ التحصيل' : 'Collected']
              : []),
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
            const collectCell = (
              <span key="col" className="tabular-nums font-bold text-amber-800">
                {b.collectAmount != null
                  ? `${Number(b.collectAmount).toLocaleString(locale)} ${t('common.currency')}`
                  : '—'}
              </span>
            );
            const cells = [
              <span key="r" className="font-mono text-[12.5px] tabular-nums" dir="ltr" style={{ textAlign: 'start' }}>{b.reference}</span>,
              <span key="c">
                <span className="block font-bold">{b.passengerName}</span>
                <span className="block text-[12.5px] font-normal tabular-nums text-[var(--sp-text-muted)]" dir="ltr" style={{ textAlign: 'start' }}>{b.passengerPhone}</span>
                {/* A platform-funded booking is money the platform spent, not a
                    customer's payment, so it is marked rather than left to be
                    read as ordinary revenue. */}
                {b.fundingSource === 'PLATFORM' && (
                  <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-[#1D5BD8] border border-blue-200">
                    <Wallet size={11} />
                    {isRTL ? 'محفظة المنصة' : 'Platform wallet'}
                  </span>
                )}
              </span>,
              <span key="rt" className="text-[13.5px]">
                <span className="block font-semibold">
                  {routeLabel(b.actualOrigin || b.trip?.origin, b.actualDestination || b.trip?.destination, isRTL)}
                </span>
                <span className="block text-[12.5px] font-normal tabular-nums text-[var(--sp-text-muted)]">
                  {(b.actualDeparture || b.trip?.departure) && new Date(b.actualDeparture || b.trip.departure).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                </span>
              </span>,
              ...(tab === 'company'
                ? [
                    <span key="h" className="text-[13.5px] font-semibold">{b.passengerHotel || '—'}</span>,
                    collectCell,
                  ]
                : []),
              <span key="s" className="font-bold tabular-nums">{b.seatLabel}</span>,
              <span key="p" className="font-extrabold tabular-nums">{Number(b.total || 0).toLocaleString(locale)} {t('common.currency')}</span>,
              <V2StatusBadge key="st" tone={bookingStatusTone(b.status)}>
                {bookingStatusLabel(t, b.status)}
              </V2StatusBadge>,
              <span key="a" className="flex justify-end gap-1">
                {/* A platform-funded booking is paid from the platform's own
                    money, so it has no receipt and no confirm button — it was
                    already paid when it was created. It can be cancelled, and
                    cancelling it returns the money to the platform wallet in
                    full. */}
                {b.fundingSource === 'PLATFORM' && b.status === 'PAID' && (
                  <button
                    onClick={() => cancelPlatformBooking(b)}
                    aria-label={isRTL ? 'إلغاء حجز المنصة' : 'Cancel platform booking'}
                    title={isRTL ? 'إلغاء حجز المنصة وإرجاع المبلغ للخزنة' : 'Cancel and return the money to the platform wallet'}
                    className="grid size-10 place-items-center rounded-xl border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 disabled:opacity-60"
                    disabled={cancellingId === b.id}
                  >
                    {cancellingId === b.id ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
                  </button>
                )}
                {/* A pending booking still awaiting a screenshot gets an explicit
                    marker, so "no proof uploaded" is never mistaken for "proof
                    uploaded but not rendered". */}
                {b.status === 'PENDING' && needsProof(b) && (
                  <button
                    onClick={() => { setConfirmId(b.id); setRejectReason(''); }}
                    aria-label={t('pay.proofMissing')}
                    title={t('pay.proofMissing')}
                    className="grid size-10 place-items-center rounded-xl border border-amber-300 bg-amber-50 text-amber-600 hover:bg-amber-100"
                  >
                    <AlertTriangle className="size-5" />
                  </button>
                )}
                {b.status === 'PENDING' && b.paymentProofUrl && (
                  <button
                    onClick={() => { setConfirmId(b.id); setRejectReason(''); }}
                    aria-label={t('pay.proof')}
                    className="grid size-10 place-items-center overflow-hidden rounded-xl border border-slate-200 hover:ring-2 hover:ring-[#1D5BD8]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={b.paymentProofUrl} alt="" className="size-full object-cover" />
                  </button>
                )}
                {b.status === 'PENDING' && (
                  <button
                    onClick={() => { setConfirmId(b.id); setRejectReason(''); }}
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
                <V2StatusBadge tone={bookingStatusTone(b.status)}>{bookingStatusLabel(t, b.status)}</V2StatusBadge>
              </div>
              <p className="mt-1 font-mono text-[12px] tabular-nums text-[var(--sp-text-muted)]" dir="ltr" style={{ textAlign: 'start' }}>{b.reference}</p>
              <p className="mt-1 text-[14px] font-extrabold tabular-nums">{Number(b.total || 0).toLocaleString(locale)} {t('common.currency')}</p>
              {b.fundingSource === 'PLATFORM' && (
                <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-[#1D5BD8] border border-blue-200">
                  <Wallet size={11} />
                  {isRTL ? 'محفظة المنصة' : 'Platform wallet'}
                </span>
              )}
              {tab === 'company' && (
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
                  <span className="font-bold text-[var(--sp-text-muted)]">
                    {isRTL ? 'الفندق' : 'Hotel'}:{' '}
                    <span className="font-semibold text-[#0B1B33]">{b.passengerHotel || '—'}</span>
                  </span>
                  <span className="font-bold text-[var(--sp-text-muted)]">
                    {isRTL ? 'التحصيل' : 'Collected'}:{' '}
                    <span className="font-bold text-amber-800">
                      {b.collectAmount != null
                        ? `${Number(b.collectAmount).toLocaleString(locale)} ${t('common.currency')}`
                        : '—'}
                    </span>
                  </span>
                </div>
              )}
              {b.status === 'PENDING' && b.paymentProofUrl && (
                <button
                  onClick={() => { setConfirmId(b.id); setRejectReason(''); }}
                  className="mt-2 block w-full overflow-hidden rounded-xl border border-slate-200"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={b.paymentProofUrl} alt={t('pay.proof')} className="max-h-40 w-full object-cover" />
                </button>
              )}
              {b.status === 'PENDING' && needsProof(b) && (
                <p className="mt-2 flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] font-bold text-amber-800">
                  <AlertTriangle className="size-4 shrink-0" /> {t('pay.proofMissing')}
                </p>
              )}
              <div className="mt-3 flex gap-1.5">
                {b.status === 'PENDING' && (
                  <button onClick={() => { setConfirmId(b.id); setRejectReason(''); }} className="flex-1 rounded-xl bg-emerald-50 py-2.5 text-[13.5px] font-bold text-emerald-700">
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

      <V2Modal open={!!confirmId} onClose={() => { setConfirmId(null); setRejectReason(''); }} title={t('payment.confirmTitle')}>
        <p className="text-[14.5px] text-[var(--sp-text-muted)]">{t('payment.pendingDesc')}</p>
        {confirmBooking?.paymentProofUrl ? (
          <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 p-3.5">
            <p className="text-[13.5px] font-extrabold text-[#0B1B33]">
              {t('pay.method')}: <span className="font-bold text-[#1D5BD8]">{methodLabel(confirmBooking.paymentMethod)}</span>
            </p>
            <a href={confirmBooking.paymentProofUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-slate-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={confirmBooking.paymentProofUrl} alt={t('pay.proof')} className="max-h-64 w-full object-contain bg-slate-50" />
            </a>
            {confirmBooking.paymentNotes && (
              <p className="text-[13px] text-[var(--sp-text-muted)]">{confirmBooking.paymentNotes}</p>
            )}
          </div>
        ) : (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 p-3.5">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
            <p className="text-[13.5px] font-bold text-amber-900">{t('pay.proofMissing')}</p>
          </div>
        )}
        <div className="mt-4">
          <V2Field label={t('pay.reasonLabel')}>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder={t('pay.reasonPh')}
              rows={3}
              className="v2-input resize-none py-3 leading-relaxed"
            />
          </V2Field>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <button onClick={() => { setConfirmId(null); setRejectReason(''); }} className="rounded-xl bg-slate-100 py-3.5 text-[14.5px] font-bold text-[#0B1B33]">
            {t('common.cancel')}
          </button>
          <V2Button disabled={confirming || confirmBlocked} onClick={confirmPaid} title={confirmBlocked ? t('pay.proofRequired') : undefined}>
            {confirming ? <Loader2 className="size-5 animate-spin" /> : null} {t('payment.confirmBtn')}
          </V2Button>
        </div>
        <button
          onClick={requestProof}
          disabled={requesting || !rejectReason.trim()}
          className="mt-2.5 w-full rounded-xl border border-amber-300 bg-amber-50 py-3 text-[14px] font-bold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
        >
          {requesting ? <Loader2 className="mx-auto size-5 animate-spin" /> : t('pay.requestNew')}
        </button>
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
