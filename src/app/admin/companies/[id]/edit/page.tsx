'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowRight, Loader2, Power, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useLangStore } from '@/lib/lang';
import { DEFAULT_MAX_SEATS_PER_BOOKING, MAX_DAILY_SEATS } from '@/lib/booking-limits';
import { V2PageHeader } from '@/components/v2/admin';
import { V2Field, V2Select, V2Input } from '@/components/v2/Field';
import { V2Button } from '@/components/v2/Button';
import { V2Skeleton } from '@/components/v2/ui';

/* V2 company edit — same GET/PATCH as V1. */

/** Whether a day is the one right after another. */
function isNextDay(after: string, day: string): boolean {
  const a = new Date(`${after}T00:00:00Z`).getTime();
  const b = new Date(`${day}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return Math.round((b - a) / 86400000) === 1;
}

/**
 * How a route is named in the editor.
 *
 * Two journeys can have the same origin and the same destination and still
 * be different journeys. The canonical key keeps them apart; the label has to
 * as well, or the administrator cannot tell which one they are choosing. So
 * the intermediate stops are shown, in the order the bus visits them.
 *
 * A stop whose name is not known is not invented: the label says the stops
 * are unknown rather than guessing at them.
 */
function routeLabelText(route: any, isRTL: boolean): string {
  const from = route?.origin || route?.stops?.[0] || '';
  const to = route?.destination || route?.stops?.[route.stops.length - 1] || '';
  const base = `${from} → ${to}`;
  if (route?.stopsComplete === false) {
    return isRTL ? `${base} (المحطات غير معروفة)` : `${base} (stops unknown)`;
  }
  const intermediates = (route?.stops ?? []).slice(1, -1);
  if (intermediates.length > 0) {
    const via = intermediates.join(isRTL ? ' · ' : ', ');
    return isRTL ? `${base} (عبر ${via})` : `${base} (via ${via})`;
  }
  return base;
}

export default function EditCompanyPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';

  const [form, setForm] = useState({
    name: '',
    subdomain: '',
    creditLimit: 0,
    paymentMode: 'PREPAID',
    billingCycle: 'MONTHLY',
    isActive: true,
    autoPayEnabled: false,
    maxSeatsPerBooking: '' as string,
    maxDailySeats: '' as string,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // The daily allowances: how many seats this company may hold on one route
  // on one travel day, shared by every bus serving that route.
  const [quotas, setQuotas] = useState<any[]>([]);
  const [quotasLoading, setQuotasLoading] = useState(true);
  const [newQuota, setNewQuota] = useState({ routeKey: '', travelDate: '', dateTo: '', maxSeats: '' });
  const [addingQuota, setAddingQuota] = useState(false);
  // The routes this company could be given an allowance on: the routes its
  // buses actually run, with the next date each one runs.
  const [routeOptions, setRouteOptions] = useState<any[]>([]);
  // The overall daily cap, and what the company has used of it on each date
  // it has booked on.
  const [dailyCap, setDailyCap] = useState<{ limit: number | null; usedByDate: Record<string, number> }>({
    limit: null,
    usedByDate: {},
  });

  async function loadQuotas() {
    try {
      const res = await fetch(`/api/admin/companies/${id}/route-quotas`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setQuotas(data.quotas || []);
        // The routes this company's own buses run, with the earliest day each
        // one runs. Offering any other route would be a cap on nothing.
        setRouteOptions(data.routes || []);
        setDailyCap(data.dailyCap || { limit: null, usedByDate: {} });
      }
    } catch { /* keep empty */ } finally { setQuotasLoading(false); }
  }

  useEffect(() => {
    loadQuotas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function addQuota() {
    if (!newQuota.routeKey || !newQuota.travelDate) {
      toast.error(isRTL ? 'اختر المسار وتاريخ السفر' : 'Pick a route and a travel date');
      return;
    }
    // The same rule the server applies, so the admin is told straight away
    // rather than after a round trip. The server still checks it: this is a
    // convenience, not the rule.
    if (newQuota.maxSeats !== '') {
      const cap = Number(newQuota.maxSeats);
      if (!Number.isFinite(cap) || cap < 1 || cap > 500) {
        toast.error(t('quota.invalidCap'));
        return;
      }
    }
    setAddingQuota(true);
    try {
      const res = await fetch(`/api/admin/companies/${id}/route-quotas`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newQuota),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error === 'INVALID_SEAT_CAP' ? t('quota.invalidCap') : (data?.message || data?.error || t('common.error')));
        return;
      }
      setNewQuota({ routeKey: '', travelDate: '', dateTo: '', maxSeats: '' });
      await loadQuotas();
      toast.success(isRTL ? 'تم حفظ الحصة' : 'Quota saved');
    } catch {
      toast.error(t('common.error'));
    } finally {
      setAddingQuota(false);
    }
  }

  /**
   * Consecutive days with the same route and the same cap are one allowance
   * as far as the administrator is concerned, so they are shown as one row
   * with a range on it. The model is still one row per day underneath.
   */
  const groupedQuotas = useMemo(() => {
    const sorted = [...quotas].sort((a, b) =>
      a.routeKey === b.routeKey
        ? a.travelDate.localeCompare(b.travelDate)
        : a.routeKey.localeCompare(b.routeKey),
    );
    const groups: {
      routeKey: string;
      routeName: string;
      route: any;
      from: string;
      to: string;
      maxSeats: number | null;
      used: number;
    }[] = [];
    for (const q of sorted) {
      const last = groups[groups.length - 1];
      const sameRun =
        last &&
        last.routeKey === q.routeKey &&
        last.maxSeats === q.maxSeats &&
        isNextDay(last.to, q.travelDate);
      if (sameRun) {
        last.to = q.travelDate;
        last.used += q.used || 0;
      } else {
        groups.push({
          routeKey: q.routeKey,
          routeName: q.routeName,
          route: q,
          from: q.travelDate,
          to: q.travelDate,
          maxSeats: q.maxSeats,
          used: q.used || 0,
        });
      }
    }
    return groups;
  }, [quotas]);

  async function removeQuota(g: { routeKey: string; from: string; to: string }) {
    try {
      const params = new URLSearchParams({
        routeKey: g.routeKey,
        travelDate: g.from,
      });
      if (g.from !== g.to) params.set('dateTo', g.to);
      const res = await fetch(`/api/admin/companies/${id}/route-quotas?${params.toString()}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data?.error || t('common.error'));
        return;
      }
      await loadQuotas();
    } catch {
      toast.error(t('common.error'));
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/admin/companies/${id}`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setForm({
            name: data.name || '',
            subdomain: data.subdomain || '',
            creditLimit: data.creditLimit || 0,
            paymentMode: data.paymentMode || 'PREPAID',
            billingCycle: data.billingCycle || 'MONTHLY',
            isActive: data.isActive,
            autoPayEnabled: data.autoPayEnabled === true,
            maxSeatsPerBooking: data.maxSeatsPerBooking == null ? '' : String(data.maxSeatsPerBooking),
            maxDailySeats: data.maxDailySeats == null ? '' : String(data.maxDailySeats),
          });
        }
      } catch { /* keep blank */ } finally { setLoading(false); }
    })();
  }, [id]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/companies/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });
      if (res.ok) {
        toast.success(t('common.success'));
        router.push('/admin/credit-report');
      } else {
        toast.error((await res.json()).error || t('common.error'));
      }
    } catch {
      toast.error(t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/admin/credit-report" className="inline-flex items-center gap-1.5 text-[14px] font-bold text-[var(--sp-text-muted)] hover:text-[#0B1B33]">
        <ArrowRight className="size-4 rotate-180 v2-flip-rtl" /> {t('company.creditReport')}
      </Link>
      <div className="mt-3">
        <V2PageHeader title={t('company.editCompany')} />
      </div>

      {loading ? (
        <div className="mt-5 grid gap-3" role="status">
          <V2Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : (
        <form onSubmit={save} className="mt-5 rounded-2xl border border-[var(--sp-line)] bg-[var(--sp-card)] p-5 md:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <V2Field label={isRTL ? 'اسم الشركة' : 'Company name'}>
              <V2Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </V2Field>
            <V2Field label="Subdomain">
              <V2Input value={form.subdomain} onChange={(e) => setForm({ ...form, subdomain: e.target.value })} dir="ltr" />
            </V2Field>
            <V2Field label={t('company.creditLimit')}>
              <V2Input type="number" min="0" value={form.creditLimit} onChange={(e) => setForm({ ...form, creditLimit: parseFloat(e.target.value) || 0 })} dir="ltr" className="tabular-nums" />
            </V2Field>
            <V2Field label={t('company.paymentMode')}>
              <V2Select value={form.paymentMode} onChange={(e) => setForm({ ...form, paymentMode: e.target.value })}>
                <option value="PREPAID">{t('company.prepaidMode')}</option>
                <option value="CREDIT">{t('company.creditMode')}</option>
                <option value="BOTH">{t('company.bothMode')}</option>
              </V2Select>
            </V2Field>
            <V2Field label={t('company.billingCycle')}>
              <V2Select value={form.billingCycle} onChange={(e) => setForm({ ...form, billingCycle: e.target.value })}>
                <option value="MONTHLY">{t('company.monthly')}</option>
                <option value="WEEKLY">{t('company.weekly')}</option>
              </V2Select>
            </V2Field>
            <div className="grid gap-2">
              <span className="px-1 text-[13px] font-bold text-[#0B1B33]">{t('company.isActive')}</span>
              <button
                type="button"
                role="switch"
                aria-checked={form.isActive}
                onClick={() => setForm({ ...form, isActive: !form.isActive })}
                className={cn(
                  'flex min-h-[52px] items-center gap-2.5 rounded-xl border px-4 text-[14.5px] font-bold transition lg:min-h-[60px]',
                  form.isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-[var(--sp-card)] text-[var(--sp-text-muted)]'
                )}
              >
                <Power className="size-5" />
                {form.isActive ? t('company.isActive') : t('company.isInactive')}
              </button>
            </div>
            <div className="grid gap-2">
              <span className="px-1 text-[13px] font-bold text-[#0B1B33]">{isRTL ? 'الدفع التلقائي' : 'Automatic payment'}</span>
              <button
                type="button"
                role="switch"
                aria-checked={form.autoPayEnabled}
                onClick={() => setForm({ ...form, autoPayEnabled: !form.autoPayEnabled })}
                className={cn(
                  'flex min-h-[52px] items-center gap-2.5 rounded-xl border px-4 text-[14.5px] font-bold transition lg:min-h-[60px]',
                  form.autoPayEnabled ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-[var(--sp-card)] text-[var(--sp-text-muted)]'
                )}
              >
                <Zap className="size-5" />
                {form.autoPayEnabled
                  ? (isRTL ? 'مفعّل — يُخصم تلقائياً عند الحجز' : 'On — charged when the booking is created')
                  : (isRTL ? 'متوقف — الشركة تسدد بنفسها' : 'Off — the company settles it itself')}
              </button>
            </div>
            <V2Field label={isRTL ? 'أقصى عدد مقاعد للحجز الواحد' : 'Max seats per booking'}>
              <V2Input
                type="number"
                min="1"
                max={String(DEFAULT_MAX_SEATS_PER_BOOKING)}
                value={form.maxSeatsPerBooking}
                onChange={(e) => setForm({ ...form, maxSeatsPerBooking: e.target.value })}
                placeholder={String(DEFAULT_MAX_SEATS_PER_BOOKING)}
                dir="ltr"
                className="tabular-nums"
              />
              <p className="mt-1 text-[12px] text-[var(--sp-text-muted)]">
                {isRTL
                  ? `اتركه فارغاً لاستخدام الحد الافتراضي (${DEFAULT_MAX_SEATS_PER_BOOKING} مقاعد).`
                  : `Leave it empty to use the default of ${DEFAULT_MAX_SEATS_PER_BOOKING} seats.`}
              </p>
              <p className="mt-1 text-[12px] text-[var(--sp-text-muted)]">
                {isRTL
                  ? `هذا الحد يخفض الحد العام ولا يمكنه رفعه: الحد الأقصى دائماً ${DEFAULT_MAX_SEATS_PER_BOOKING} مقاعد.`
                  : `This can only lower the limit, never raise it: ${DEFAULT_MAX_SEATS_PER_BOOKING} seats is the maximum either way.`}
              </p>
            </V2Field>
            <V2Field label={isRTL ? 'الحصة اليومية الإجمالية' : 'Overall daily seat cap'}>
              <V2Input
                type="number"
                min="1"
                max={String(MAX_DAILY_SEATS)}
                value={form.maxDailySeats}
                onChange={(e) => setForm({ ...form, maxDailySeats: e.target.value })}
                placeholder={isRTL ? 'بلا حد' : 'No limit'}
                dir="ltr"
                className="tabular-nums"
              />
              <p className="mt-1 text-[12px] text-[var(--sp-text-muted)]">
                {isRTL
                  ? 'عدد المقاعد التي يمكن للشركة حجزها في يوم سفر واحد، عبر كل الرحلات والمسارات والحافلات في ذلك اليوم.'
                  : 'How many seats this company may hold on one travel date, across every trip, route and bus on that date.'}
              </p>
              <p className="mt-1 text-[12px] text-[var(--sp-text-muted)]">
                {isRTL
                  ? `هذا الحد مختلف عن حد الحجز الواحد (${DEFAULT_MAX_SEATS_PER_BOOKING} مقاعد)، والأصغر منهما هو المطبَّق. اتركه فارغاً لعدم وضع حد يومي.`
                  : `This is separate from the per-booking limit of ${DEFAULT_MAX_SEATS_PER_BOOKING} seats; the smaller of the two applies. Leave it empty for no daily limit.`}
              </p>
            </V2Field>
          </div>
          <V2Button type="submit" size="lg" disabled={saving} className="mt-5 w-full sm:w-auto">
            {saving && <Loader2 className="size-5 animate-spin" />} {t('common.save')}
          </V2Button>
        </form>
      )}

      {/* ── The daily allowances ─────────────────────────────────────────
          The cap is on the company, not on the bus: a company running three
          buses on the same route on the same day shares one allowance. */}
      <div className="mt-5 rounded-2xl border border-[var(--sp-line)] bg-[var(--sp-card)] p-5 md:p-6">
        <h2 className="text-[15px] font-extrabold text-[#0B1B33]">
          {isRTL ? 'حصص المقاعد اليومية' : 'Daily seat allowances'}
        </h2>
        <p className="mt-1 text-[12.5px] text-[var(--sp-text-muted)]">
          {isRTL
            ? 'عدد المقاعد التي يمكن للشركة حجزها على مسار واحد في يوم واحد، وكل الحافلات التي تسير على نفس المسار تتشارك في هذه الحصة.'
            : 'How many seats this company may hold on one route on one travel day. Every bus serving that route shares the allowance.'}
        </p>

        {/* The overall daily cap, and what the company has used of it. The
            route allowances sit inside it, so it is shown next to them. */}
        <div className="mt-4 rounded-xl bg-[var(--sp-inset)] px-3.5 py-3">
          <p className="text-[13px] font-extrabold text-[#0B1B33]">
            {isRTL ? 'الحصة اليومية الإجمالية' : 'Overall daily cap'}
          </p>
          <p className="mt-1 text-[12px] font-bold tabular-nums text-[var(--sp-text-muted)]">
            {isRTL ? 'الحد' : 'cap'}{' '}
            {dailyCap.limit == null ? '∞' : dailyCap.limit}
            {Object.keys(dailyCap.usedByDate).length > 0 && (
              <>
                {' · '}
                {isRTL ? 'المستخدم' : 'used'}{' '}
                {Object.entries(dailyCap.usedByDate)
                  .map(([date, used]) => `${date}: ${used}`)
                  .join(' · ')}
              </>
            )}
          </p>
        </div>

        {quotasLoading ? (
          <div className="mt-4"><V2Skeleton className="h-24 rounded-xl" /></div>
        ) : quotas.length === 0 ? (
          <p className="mt-4 rounded-xl bg-[var(--sp-inset)] px-3.5 py-3 text-[12.5px] font-bold text-[var(--sp-text-muted)]">
            {isRTL ? 'لا توجد حصص — الشركة غير محدودة حالياً' : 'No allowances — the company is unlimited for now'}
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            {groupedQuotas.map((g) => (
              <div
                key={`${g.routeKey}|${g.from}|${g.to}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--sp-inset)] px-3.5 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-extrabold text-[#0B1B33]">
                    {routeLabelText(g.route, isRTL)}
                  </p>
                  <p className="text-[12px] font-bold tabular-nums text-[var(--sp-text-muted)]">
                    {g.from === g.to ? g.from : `${g.from} → ${g.to}`} ·{' '}
                    {isRTL ? 'مستخدمة' : 'used'} {g.used} ·{' '}
                    {isRTL ? 'الحد' : 'cap'}{' '}
                    {g.maxSeats == null ? '∞' : g.maxSeats}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeQuota(g)}
                  className="rounded-lg px-2.5 py-1.5 text-[12px] font-extrabold text-rose-600 hover:bg-rose-50"
                >
                  {isRTL ? 'حذف' : 'Remove'}
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <V2Field label={isRTL ? 'المسار' : 'Route'}>
            <V2Select
              value={newQuota.routeKey}
              onChange={(e) => {
                const opt = routeOptions.find((o) => o.routeKey === e.target.value);
                setNewQuota({
                  ...newQuota,
                  routeKey: e.target.value,
                  // The date follows the route: the day that route next runs.
                  travelDate: opt?.travelDate || newQuota.travelDate,
                });
              }}
            >
              <option value="">{isRTL ? 'اختر المسار…' : 'Choose a route…'}</option>
              {routeOptions.map((o) => (
                <option key={o.routeKey} value={o.routeKey}>
                  {routeLabelText(o, isRTL)}
                </option>
              ))}
            </V2Select>
          </V2Field>
          <V2Field label={isRTL ? 'تاريخ السفر' : 'Travel date'}>
            <V2Input
              type="date"
              value={newQuota.travelDate}
              onChange={(e) => setNewQuota({ ...newQuota, travelDate: e.target.value })}
              dir="ltr"
            />
          </V2Field>
          <V2Field label={isRTL ? 'حتى تاريخ' : 'To date'}>
            <V2Input
              type="date"
              value={newQuota.dateTo}
              onChange={(e) => setNewQuota({ ...newQuota, dateTo: e.target.value })}
              placeholder={isRTL ? 'يوم واحد' : 'Single day'}
              dir="ltr"
            />
            <p className="mt-1 text-[12px] text-[var(--sp-text-muted)]">
              {isRTL
                ? 'اتركه فارغاً ليوم واحد. المدى يُحفظ كصف لكل يوم.'
                : 'Leave it empty for a single day. A range is stored as one row per day.'}
            </p>
          </V2Field>
          <V2Field label={isRTL ? 'حد المقاعد' : 'Seat cap'}>
            <V2Input
              type="number"
              min="1"
              max="500"
              value={newQuota.maxSeats}
              onChange={(e) => setNewQuota({ ...newQuota, maxSeats: e.target.value })}
              placeholder={isRTL ? 'بلا حد' : 'No limit'}
              dir="ltr"
              className="tabular-nums"
            />
            <p className="mt-1 text-[12px] text-[var(--sp-text-muted)]">
              {isRTL
                ? 'من 1 إلى 500 مقعد. اتركه فارغاً لعدم وضع حد. هذا الحد لا يرفع حد الـ 10 مقاعد لكل حجز.'
                : '1 to 500 seats. Leave it empty for no limit. This cap cannot raise the ten-seat limit on a single booking.'}
            </p>
          </V2Field>
        </div>
        <V2Button
          type="button"
          onClick={addQuota}
          disabled={addingQuota || !newQuota.routeKey || !newQuota.travelDate}
          className="mt-3"
        >
          {addingQuota && <Loader2 className="size-5 animate-spin" />}
          {isRTL ? 'حفظ الحصة' : 'Save allowance'}
        </V2Button>
      </div>
    </div>
  );
}
