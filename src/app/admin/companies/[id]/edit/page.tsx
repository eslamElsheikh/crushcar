'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Calendar,
  ChevronDown,
  Edit3,
  Loader2,
  MapPin,
  Search,
  Trash2,
  Users,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useLangStore } from '@/lib/lang';
import { DEFAULT_MAX_SEATS_PER_BOOKING, MAX_DAILY_SEATS } from '@/lib/booking-limits';
import { V2PageHeader } from '@/components/v2/admin';
import { V2Field, V2Select, V2Input } from '@/components/v2/Field';
import { V2Button } from '@/components/v2/Button';
import { V2Skeleton } from '@/components/v2/ui';

/** Whether a day is the one right after another. */
function isNextDay(after: string, day: string): boolean {
  const a = new Date(`${after}T00:00:00Z`).getTime();
  const b = new Date(`${day}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return Math.round((b - a) / 86400000) === 1;
}

/** Searchable station selector component */
function SearchableStationSelect({
  label,
  value,
  onChange,
  stations,
  excludeId,
  placeholder,
  error,
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  stations: { id: string; name: string; city: string }[];
  excludeId?: string;
  placeholder: string;
  error?: string;
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stations
      .filter((s) => s.id !== excludeId)
      .filter((s) => !q || s.name.toLowerCase().includes(q) || (s.city && s.city.toLowerCase().includes(q)));
  }, [stations, excludeId, search]);

  const selected = stations.find((s) => s.id === value);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative grid gap-1.5 text-right" ref={containerRef}>
      <label className="text-[13px] font-bold text-[#0B1B33]">{label}</label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'flex min-h-[48px] w-full items-center justify-between rounded-xl border bg-[var(--sp-card)] px-3 py-2 text-right text-[14px] transition',
          error ? 'border-rose-400 focus:border-rose-500' : 'border-[var(--sp-line)] focus:border-blue-500',
          !selected ? 'text-[var(--sp-text-muted)]' : 'text-[#0B1B33] font-bold'
        )}
      >
        <span className="truncate">{selected ? `${selected.name} (${selected.city || ''})` : placeholder}</span>
        <ChevronDown className={cn('size-4 shrink-0 transition text-slate-400', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute top-full z-50 mt-1 max-h-60 w-full overflow-hidden rounded-xl border border-[var(--sp-line)] bg-[var(--sp-card)] shadow-xl">
          <div className="p-2 border-b border-[var(--sp-line)]">
            <div className="flex items-center gap-2 rounded-lg bg-[var(--sp-inset)] px-2.5 py-1.5">
              <Search className="size-3.5 text-slate-400 shrink-0" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث بالاسم أو المدينة..."
                className="w-full bg-transparent text-[12.5px] outline-none placeholder:text-slate-400 text-right"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-44 overflow-y-auto p-1 divide-y divide-[var(--sp-line)]/40">
            {filtered.length === 0 ? (
              <p className="p-3 text-center text-[12px] text-slate-400">لا توجد محطات مطابقة</p>
            ) : (
              filtered.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    onChange(s.id);
                    setOpen(false);
                    setSearch('');
                  }}
                  className={cn(
                    'flex w-full items-center justify-between px-3 py-2 text-right text-[13px] rounded-lg transition hover:bg-[var(--sp-inset)]',
                    s.id === value ? 'bg-blue-50 text-blue-700 font-bold' : 'text-[#0B1B33]'
                  )}
                >
                  <span>{s.name}</span>
                  <span className="text-[11px] text-slate-400">{s.city}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
      {error && <span className="text-[11.5px] font-bold text-rose-600">{error}</span>}
    </div>
  );
}

export default function EditCompanyPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';
  const formRef = useRef<HTMLDivElement>(null);

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

  // Daily route quotas state
  const [quotas, setQuotas] = useState<any[]>([]);
  const [stations, setStations] = useState<any[]>([]);
  const [quotasLoading, setQuotasLoading] = useState(true);
  const [summary, setSummary] = useState({
    overallCap: null as number | null,
    distinctRoutesCount: 0,
    todayUsed: 0,
  });
  const [_dailyCap, setDailyCap] = useState<{ limit: number | null; usedByDate: Record<string, number> }>({
    limit: null,
    usedByDate: {},
  });

  const [quotaForm, setQuotaForm] = useState({
    originStationId: '',
    destinationStationId: '',
    travelDate: '',
    dateTo: '',
    maxSeats: '',
  });
  const [savingQuota, setSavingQuota] = useState(false);
  const [quotaError, setQuotaError] = useState<string | null>(null);

  async function loadQuotas() {
    try {
      const res = await fetch(`/api/admin/companies/${id}/route-quotas`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setQuotas(data.quotas || []);
        setStations(data.stations || []);
        setDailyCap(data.dailyCap || { limit: null, usedByDate: {} });
        if (data.summary) {
          setSummary(data.summary);
        } else {
          setSummary({
            overallCap: data.company?.maxDailySeats ?? null,
            distinctRoutesCount: 0,
            todayUsed: 0,
          });
        }
      }
    } catch {
      /* keep empty */
    } finally {
      setQuotasLoading(false);
    }
  }

  useEffect(() => {
    loadQuotas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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
      } catch {
        /* keep blank */
      } finally {
        setLoading(false);
      }
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

  /**
   * Group consecutive days with same route and cap.
   */
  const groupedQuotas = useMemo(() => {
    const sorted = [...quotas].sort((a, b) => {
      const routeA = `${a.originStationId}:${a.destinationStationId}`;
      const routeB = `${b.originStationId}:${b.destinationStationId}`;
      if (routeA !== routeB) return routeA.localeCompare(routeB);
      return a.travelDate.localeCompare(b.travelDate);
    });

    const todayStr = new Date().toISOString().slice(0, 10);
    const groups: {
      originStationId: string;
      destinationStationId: string;
      originName: string;
      destinationName: string;
      from: string;
      to: string;
      maxSeats: number | null;
      usageByDate: Record<string, number>;
    }[] = [];

    for (const q of sorted) {
      const last = groups[groups.length - 1];
      const sameRoute =
        last &&
        last.originStationId === q.originStationId &&
        last.destinationStationId === q.destinationStationId &&
        last.maxSeats === q.maxSeats;

      if (sameRoute && isNextDay(last.to, q.travelDate)) {
        last.to = q.travelDate;
        last.usageByDate[q.travelDate] = q.used || 0;
      } else {
        groups.push({
          originStationId: q.originStationId,
          destinationStationId: q.destinationStationId,
          originName: q.originName,
          destinationName: q.destinationName,
          from: q.travelDate,
          to: q.travelDate,
          maxSeats: q.maxSeats,
          usageByDate: { [q.travelDate]: q.used || 0 },
        });
      }
    }

    return groups.map((g) => {
      let status: 'ACTIVE' | 'UPCOMING' | 'EXPIRED' = 'ACTIVE';
      let statusLabel = 'نشط';
      let displayUsed = 0;
      let displayDateLabel = '';

      if (todayStr >= g.from && todayStr <= g.to) {
        status = 'ACTIVE';
        statusLabel = 'نشط';
        displayUsed = g.usageByDate[todayStr] ?? 0;
        displayDateLabel = `اليوم (${todayStr})`;
      } else if (todayStr < g.from) {
        status = 'UPCOMING';
        statusLabel = 'قادم';
        displayUsed = g.usageByDate[g.from] ?? 0;
        displayDateLabel = g.from;
      } else {
        status = 'EXPIRED';
        statusLabel = 'منتهي';
        displayUsed = g.usageByDate[g.to] ?? 0;
        displayDateLabel = g.to;
      }

      return {
        ...g,
        key: `${g.originStationId}:${g.destinationStationId}:${g.from}:${g.to}`,
        status,
        statusLabel,
        displayUsed,
        displayDateLabel,
      };
    });
  }, [quotas]);

  function editQuota(g: any) {
    setQuotaForm({
      originStationId: g.originStationId,
      destinationStationId: g.destinationStationId,
      travelDate: g.from,
      dateTo: g.from === g.to ? '' : g.to,
      maxSeats: g.maxSeats == null ? '' : String(g.maxSeats),
    });
    setQuotaError(null);
    formRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  async function removeQuota(g: any) {
    if (!confirm('هل أنت متأكد من حذف هذه الحصة اليومية؟')) return;
    try {
      const params = new URLSearchParams({
        originStationId: g.originStationId,
        destinationStationId: g.destinationStationId,
        travelDate: g.from,
      });
      if (g.from !== g.to) params.set('dateTo', g.to);
      const res = await fetch(`/api/admin/companies/${id}/route-quotas?${params.toString()}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data?.message || data?.error || 'حدث خطأ أثناء الحذف');
        return;
      }
      toast.success('تم حذف الحصة بنجاح');
      await loadQuotas();
    } catch {
      toast.error('حدث خطأ أثناء الحذف');
    }
  }

  async function handleSaveQuota() {
    setQuotaError(null);
    if (!quotaForm.originStationId || !quotaForm.destinationStationId) {
      setQuotaError('يرجى تحديد محطة الانطلاق ومحطة الوصول');
      toast.error('يرجى تحديد محطة الانطلاق ومحطة الوصول');
      return;
    }
    if (quotaForm.originStationId === quotaForm.destinationStationId) {
      setQuotaError('لا يمكن أن تكون محطة الانطلاق ومحطة الوصول متطابقتين');
      toast.error('لا يمكن أن تكون محطة الانطلاق ومحطة الوصول متطابقتين');
      return;
    }
    if (!quotaForm.travelDate) {
      setQuotaError('يرجى تحديد تاريخ البداية');
      toast.error('يرجى تحديد تاريخ البداية');
      return;
    }
    if (quotaForm.dateTo && quotaForm.dateTo < quotaForm.travelDate) {
      setQuotaError('تاريخ البداية لا يمكن أن يكون بعد تاريخ النهاية');
      toast.error('تاريخ البداية لا يمكن أن يكون بعد تاريخ النهاية');
      return;
    }
    if (quotaForm.maxSeats !== '') {
      const parsed = Number(quotaForm.maxSeats);
      if (!Number.isFinite(parsed) || parsed < 1 || parsed > 500) {
        setQuotaError('الحد الأقصى للمقاعد يجب أن يكون رقماً صحيحاً بين 1 و 500');
        toast.error('الحد الأقصى للمقاعد يجب أن يكون رقماً صحيحاً بين 1 و 500');
        return;
      }
    }

    setSavingQuota(true);
    try {
      const res = await fetch(`/api/admin/companies/${id}/route-quotas`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originStationId: quotaForm.originStationId,
          destinationStationId: quotaForm.destinationStationId,
          travelDate: quotaForm.travelDate,
          dateTo: quotaForm.dateTo || undefined,
          maxSeats: quotaForm.maxSeats === '' ? null : Number(quotaForm.maxSeats),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data?.error === 'QUOTA_BELOW_USAGE') {
          const datesList = (data.violatingDates || []).map((v: any) => `${v.date} (${v.used} مقاعد)`).join('، ');
          const msg = `${data.message}: التواريخ المتعارضة: ${datesList}`;
          setQuotaError(msg);
          toast.error(msg);
        } else {
          const msg = data?.message || data?.error || 'حدث خطأ أثناء حفظ الحصة';
          setQuotaError(msg);
          toast.error(msg);
        }
        return;
      }
      toast.success('تم حفظ الحصة اليومية بنجاح');
      setQuotaForm({
        originStationId: '',
        destinationStationId: '',
        travelDate: '',
        dateTo: '',
        maxSeats: '',
      });
      await loadQuotas();
    } catch {
      setQuotaError('حدث خطأ أثناء حفظ الحصة');
      toast.error('حدث خطأ أثناء حفظ الحصة');
    } finally {
      setSavingQuota(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-3 sm:px-4" dir="rtl">
      <Link
        href="/admin/credit-report"
        className="inline-flex items-center gap-1.5 text-[14px] font-bold text-[var(--sp-text-muted)] hover:text-[#0B1B33]"
      >
        <ArrowRight className="size-4 v2-flip-rtl" /> {t('company.creditReport')}
      </Link>
      <div className="mt-3">
        <V2PageHeader title={t('company.editCompany')} />
      </div>

      {loading ? (
        <div className="mt-5 grid gap-3" role="status">
          <V2Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : (
        <form onSubmit={save} className="mt-5 rounded-2xl border border-[var(--sp-line)] bg-[var(--sp-card)] p-5 md:p-6 text-right">
          <div className="grid gap-4 sm:grid-cols-2">
            <V2Field label={isRTL ? 'اسم الشركة' : 'Company name'}>
              <V2Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </V2Field>
            <V2Field label="Subdomain">
              <V2Input value={form.subdomain} onChange={(e) => setForm({ ...form, subdomain: e.target.value })} dir="ltr" />
            </V2Field>
            <V2Field label={t('company.creditLimit')}>
              <V2Input
                type="number"
                min="0"
                value={form.creditLimit}
                onChange={(e) => setForm({ ...form, creditLimit: parseFloat(e.target.value) || 0 })}
                dir="ltr"
                className="tabular-nums"
              />
            </V2Field>
            <V2Field label={t('company.paymentMode')}>
              <V2Select value={form.paymentMode} onChange={(e) => setForm({ ...form, paymentMode: e.target.value })}>
                <option value="PREPAID">{t('company.prepaidMode')}</option>
                <option value="CREDIT">{t('company.creditMode')}</option>
                <option value="BOTH">{t('company.bothMode')}</option>
              </V2Select>
            </V2Field>
            <div className="grid gap-2 sm:col-span-2">
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
              <p className="px-1 text-[12px] font-medium text-[var(--sp-text-muted)] leading-relaxed">
                {isRTL
                  ? 'عند تفعيل هذا الخيار، يتم خصم قيمة الحجز تلقائياً من رصيد الشركة عند تأكيد الحجز. إذا كان الرصيد غير كافٍ، فلن يتم إتمام عملية الخصم.'
                  : 'When enabled, booking amounts are automatically deducted from the company balance upon booking confirmation. If the balance is insufficient, the deduction will not be completed.'}
              </p>
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
            {saving && <Loader2 className="size-5 animate-spin ml-1.5" />} {t('common.save')}
          </V2Button>
        </form>
      )}

      {/* ── Daily seat quota overhaul (T2) ─────────────────────────────────── */}
      <div className="mt-8 rounded-2xl border border-[var(--sp-line)] bg-[var(--sp-card)] p-5 md:p-6 text-right">
        <div className="flex flex-col gap-1">
          <h2 className="text-[18px] font-extrabold text-[#0B1B33]">
            حصص المقاعد اليومية
          </h2>
          <p className="text-[13px] text-[var(--sp-text-muted)] leading-relaxed">
            إدارة وتحديد الحد الأقصى للمقاعد المخصصة للشركة يومياً لكل مسار، وتتشارك فيها جميع الرحلات والأتوبيسات على نفس المسار والاتجاه.
          </p>
        </div>

        {/* 3 Summary Cards Grid */}
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-[var(--sp-line)] bg-[var(--sp-inset)] p-4">
            <div className="flex items-center gap-2 text-[var(--sp-text-muted)] text-[12px] font-bold">
              <Building2 className="size-4 text-emerald-600 shrink-0" />
              <span>الحصة الإجمالية للشركة</span>
            </div>
            <div className="mt-2 text-[20px] font-black text-[#0B1B33] tabular-nums">
              {summary.overallCap !== null ? `${summary.overallCap} مقعد / يوم` : '∞'}
            </div>
          </div>

          <div className="rounded-xl border border-[var(--sp-line)] bg-[var(--sp-inset)] p-4">
            <div className="flex items-center gap-2 text-[var(--sp-text-muted)] text-[12px] font-bold">
              <MapPin className="size-4 text-blue-600 shrink-0" />
              <span>عدد المسارات المحددة</span>
            </div>
            <div className="mt-2 text-[20px] font-black text-[#0B1B33] tabular-nums">
              {summary.distinctRoutesCount} مسارات
            </div>
          </div>

          <div className="rounded-xl border border-[var(--sp-line)] bg-[var(--sp-inset)] p-4">
            <div className="flex items-center gap-2 text-[var(--sp-text-muted)] text-[12px] font-bold">
              <Users className="size-4 text-amber-600 shrink-0" />
              <span>المقاعد المستخدمة اليوم</span>
            </div>
            <div className="mt-2 text-[20px] font-black text-[#0B1B33] tabular-nums">
              {summary.todayUsed} مقاعد
            </div>
          </div>
        </div>

        {/* Existing Quota Cards List */}
        <div className="mt-6">
          <h3 className="text-[15px] font-extrabold text-[#0B1B33] mb-3">
            الحصص المحددة
          </h3>

          {quotasLoading ? (
            <div className="space-y-3">
              <V2Skeleton className="h-28 rounded-xl" />
              <V2Skeleton className="h-28 rounded-xl" />
            </div>
          ) : groupedQuotas.length === 0 ? (
            <div className="rounded-xl bg-[var(--sp-inset)] p-6 text-center">
              <p className="text-[13px] font-bold text-[var(--sp-text-muted)]">
                لا توجد حصص مسارات محددة حالياً — الشركة غير مقيدة بحصص مسارات
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {groupedQuotas.map((g) => (
                <div
                  key={g.key}
                  className="rounded-xl border border-[var(--sp-line)] bg-[var(--sp-card)] p-4 shadow-sm transition hover:border-slate-300"
                >
                  {/* Header row: Route with Arabic directional arrow, scope badge, status badge */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--sp-line)]/60 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-black text-[#0B1B33]">{g.originName}</span>
                      <ArrowLeft className="size-4 text-slate-400 shrink-0" />
                      <span className="text-[15px] font-black text-[#0B1B33]">{g.destinationName}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700">
                        جميع رحلات المسار
                      </span>
                      <span
                        className={cn(
                          'rounded-md border px-2 py-0.5 text-[11px] font-bold',
                          g.status === 'ACTIVE' && 'border-emerald-200 bg-emerald-50 text-emerald-700',
                          g.status === 'UPCOMING' && 'border-blue-200 bg-blue-50 text-blue-700',
                          g.status === 'EXPIRED' && 'border-slate-200 bg-slate-100 text-slate-600'
                        )}
                      >
                        {g.statusLabel}
                      </span>
                    </div>
                  </div>

                  {/* Info row: Daily quota & Date range */}
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 text-[12.5px]">
                    <div className="flex items-center gap-1.5 text-[var(--sp-text-muted)] font-medium">
                      <Users className="size-4 text-slate-400 shrink-0" />
                      <span>الحد اليومي:</span>
                      <span className="font-extrabold text-[#0B1B33] tabular-nums">
                        {g.maxSeats !== null ? `${g.maxSeats} مقعد` : 'بلا حد (∞)'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[var(--sp-text-muted)] font-medium">
                      <Calendar className="size-4 text-slate-400 shrink-0" />
                      <span>الفترة:</span>
                      <span className="font-extrabold text-[#0B1B33] tabular-nums" dir="ltr">
                        {g.from === g.to ? g.from : `من ${g.from} إلى ${g.to}`}
                      </span>
                    </div>
                  </div>

                  {/* Live consumption & progress bar */}
                  <div className="mt-3 rounded-lg bg-[var(--sp-inset)] p-3">
                    <div className="flex items-center justify-between text-[12px] font-bold">
                      <span className="text-[var(--sp-text-muted)]">
                        الاستهلاك ({g.displayDateLabel}):
                      </span>
                      <span className="text-[#0B1B33] tabular-nums">
                        المستخدم: {g.displayUsed} · المتبقي: {g.maxSeats !== null ? Math.max(0, g.maxSeats - g.displayUsed) : '∞'}
                      </span>
                    </div>
                    {g.maxSeats !== null ? (
                      <div className="mt-2 h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all duration-300',
                            g.displayUsed / g.maxSeats >= 1
                              ? 'bg-rose-500'
                              : g.displayUsed / g.maxSeats >= 0.8
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                          )}
                          style={{ width: `${Math.min(100, Math.round((g.displayUsed / g.maxSeats) * 100))}%` }}
                        />
                      </div>
                    ) : (
                      <div className="mt-2 text-[11px] text-[var(--sp-text-muted)] font-medium">
                        لا يوجد حد أقصى — الحجز متاح بحرية
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="mt-3 flex items-center justify-end gap-2 pt-1 border-t border-[var(--sp-line)]/40">
                    <button
                      type="button"
                      onClick={() => editQuota(g)}
                      className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-bold text-blue-600 hover:bg-blue-50 transition"
                    >
                      <Edit3 className="size-3.5" />
                      <span>تعديل</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => removeQuota(g)}
                      className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-bold text-rose-600 hover:bg-rose-50 transition"
                    >
                      <Trash2 className="size-3.5" />
                      <span>حذف</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add / Edit Quota Form */}
        <div ref={formRef} className="mt-8 rounded-2xl border border-[var(--sp-line)] bg-[var(--sp-inset)] p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--sp-line)] pb-3">
            <h3 className="text-[15px] font-extrabold text-[#0B1B33]">
              {quotaForm.travelDate && quotaForm.originStationId ? 'تعديل حصة مسار يومية' : 'إضافة / تعديل حصة مسار يومية'}
            </h3>
            <span className="rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11.5px] font-extrabold text-indigo-700">
              جميع رحلات المسار (كل الأتوبيسات والرحلات)
            </span>
          </div>

          {quotaError && (
            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-[12.5px] font-bold text-rose-700 leading-relaxed">
              {quotaError}
            </div>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <SearchableStationSelect
              label="محطة الانطلاق"
              value={quotaForm.originStationId}
              onChange={(id) => setQuotaForm((f) => ({ ...f, originStationId: id }))}
              stations={stations}
              excludeId={quotaForm.destinationStationId}
              placeholder="اختر محطة الانطلاق..."
            />
            <SearchableStationSelect
              label="محطة الوصول"
              value={quotaForm.destinationStationId}
              onChange={(id) => setQuotaForm((f) => ({ ...f, destinationStationId: id }))}
              stations={stations}
              excludeId={quotaForm.originStationId}
              placeholder="اختر محطة الوصول..."
            />
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <V2Field label="تاريخ البداية">
              <V2Input
                type="date"
                value={quotaForm.travelDate}
                onChange={(e) => setQuotaForm({ ...quotaForm, travelDate: e.target.value })}
                dir="ltr"
              />
            </V2Field>

            <V2Field label="تاريخ النهاية (اختياري)">
              <V2Input
                type="date"
                value={quotaForm.dateTo}
                onChange={(e) => setQuotaForm({ ...quotaForm, dateTo: e.target.value })}
                placeholder="يوم واحد (اختياري)"
                dir="ltr"
              />
            </V2Field>

            <V2Field label="الحد الأقصى للمقاعد يومياً">
              <V2Input
                type="number"
                min="1"
                max="500"
                value={quotaForm.maxSeats}
                onChange={(e) => setQuotaForm({ ...quotaForm, maxSeats: e.target.value })}
                placeholder="بلا حد (اتركه فارغاً)"
                dir="ltr"
                className="tabular-nums"
              />
            </V2Field>
          </div>

          <p className="mt-2 text-[12px] font-medium text-[var(--sp-text-muted)] leading-relaxed">
            يتم تطبيق هذا الحد بشكل متكرر على كل يوم داخل الفترة المحددة، ويشمل جميع الأتوبيسات والرحلات التي تسير على نفس المسار والاتجاه.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <V2Button
              type="button"
              onClick={handleSaveQuota}
              disabled={savingQuota || !quotaForm.originStationId || !quotaForm.destinationStationId || !quotaForm.travelDate}
              className="w-full sm:w-auto"
            >
              {savingQuota && <Loader2 className="size-4 animate-spin ml-1.5" />}
              حفظ الحصة اليومية
            </V2Button>

            {(quotaForm.originStationId || quotaForm.travelDate) && (
              <button
                type="button"
                onClick={() => {
                  setQuotaForm({ originStationId: '', destinationStationId: '', travelDate: '', dateTo: '', maxSeats: '' });
                  setQuotaError(null);
                }}
                className="rounded-lg px-3 py-2 text-[13px] font-bold text-[var(--sp-text-muted)] hover:text-[#0B1B33] transition"
              >
                إلغاء
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
