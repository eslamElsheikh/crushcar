'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useLangStore } from '@/lib/lang';
import { V2PageHeader, V2Tabs } from '@/components/v2/admin';
import { V2StatusBadge, V2Skeleton } from '@/components/v2/ui';

/* V2 cancellations — same tiered refund queue + process API as V1. */

type Tier = 'fullRefund' | 'partial50' | 'partial25' | 'noRefund';
type Source = 'customer' | 'company';

const tierMeta: Record<Tier, { tone: 'green' | 'amber' | 'red'; pct: string }> = {
  fullRefund: { tone: 'green', pct: '100%' },
  partial50: { tone: 'amber', pct: '50%' },
  partial25: { tone: 'amber', pct: '25%' },
  noRefund: { tone: 'red', pct: '0%' },
};

export default function CancellationsPage() {
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';
  const locale = isRTL ? 'ar-EG' : 'en-US';

  const [tiers, setTiers] = useState<Record<Tier, any[]>>({ fullRefund: [], partial50: [], partial25: [], noRefund: [] });
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<Source>('customer');
  const [processing, setProcessing] = useState<string | null>(null);

  const load = useCallback(async (type: Source) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/cancellations?type=${type}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setTiers(data.tiers || { fullRefund: [], partial50: [], partial25: [], noRefund: [] });
        setTotal(data.total || 0);
      }
    } catch { /* keep view */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(source); }, [load, source]);

  const tierLabel = (k: Tier) =>
    k === 'fullRefund' ? (isRTL ? 'استرداد كامل (> 24 ساعة)' : 'Full Refund (> 24h)')
    : k === 'partial50' ? (isRTL ? 'استرداد 50% (12-24 ساعة)' : '50% Refund (12-24h)')
    : k === 'partial25' ? (isRTL ? 'استرداد 25% (4-12 ساعة)' : '25% Refund (4-12h)')
    : (isRTL ? 'لا استرداد (< 4 ساعات)' : 'No Refund (< 4h)');

  async function process(item: any) {
    setProcessing(item.id);
    try {
      const res = await fetch(`/api/admin/cancellations/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ type: source }),
      });
      if (res.ok) {
        toast.success(isRTL ? 'تم صرف المبلغ' : 'Refund processed');
        setTiers((prev) => {
          const next = { ...prev };
          (Object.keys(next) as Tier[]).forEach((k) => {
            next[k] = next[k].filter((b: any) => b.id !== item.id);
          });
          return next;
        });
        setTotal((x) => Math.max(0, x - 1));
      } else {
        toast.error((await res.json()).error || t('common.error'));
      }
    } catch {
      toast.error(t('common.error'));
    } finally {
      setProcessing(null);
    }
  }

  const shown: Tier[] = ['fullRefund', 'partial50', 'partial25', 'noRefund'];

  return (
    <div>
      <V2PageHeader
        title={t('admin.cancellations')}
        sub={isRTL ? `${total} طلب استرداد` : `${total} refund requests`}
      />

      <div className="mt-5">
        <V2Tabs
          active={source}
          onChange={setSource}
          tabs={[
            { key: 'customer', label: isRTL ? 'عملاء' : 'Customers' },
            { key: 'company', label: isRTL ? 'شركات' : 'Companies' },
          ]}
        />
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="grid gap-3" role="status">
            <V2Skeleton className="h-28 rounded-2xl" />
            <V2Skeleton className="h-28 rounded-2xl" />
          </div>
        ) : (
          <div className="grid gap-5">
            {shown.map((k) => (
              <section key={k} aria-label={tierLabel(k)}>
                <div className="mb-2.5 flex items-center gap-2.5">
                  <V2StatusBadge tone={tierMeta[k].tone}>{tierMeta[k].pct}</V2StatusBadge>
                  <p className="text-[14.5px] font-extrabold text-[#0B1B33]">
                    {tierLabel(k)} · <span className="tabular-nums">{tiers[k]?.length || 0}</span>
                  </p>
                </div>
                <div className="grid gap-2.5">
                  {(tiers[k] || []).map((b: any) => (
                    <div key={b.id} className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-[var(--sp-line)] bg-[var(--sp-card)] p-4">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14.5px] font-extrabold text-[#0B1B33]">
                          {b.passengerName} · <span className="tabular-nums">{b.seatLabel}</span>
                          {source === 'company' && b.company ? ` · ${b.company.name || ''}` : ''}
                        </p>
                        <p className="mt-0.5 font-mono text-[12px] tabular-nums text-[var(--sp-text-muted)]" dir="ltr" style={{ textAlign: 'start' }}>
                          {b.reference}
                        </p>
                        <p className="mt-0.5 text-[13px] font-bold tabular-nums text-emerald-700">
                          EGP {Number(b.refundAmount || 0).toLocaleString(locale)}
                        </p>
                      </div>
                      <button
                        onClick={() => process(b)}
                        disabled={processing === b.id}
                        className="rounded-xl bg-[#EFF4FF] px-5 py-2.5 text-[13.5px] font-bold text-[#1D5BD8] hover:bg-[#1D5BD8] hover:text-white disabled:opacity-50"
                      >
                        {processing === b.id ? <Loader2 className="size-4 animate-spin" /> : t('common.confirm')}
                      </button>
                    </div>
                  ))}
                  {(tiers[k] || []).length === 0 && (
                    <p className="rounded-2xl border border-dashed border-slate-300 bg-[var(--sp-card)] py-6 text-center text-[13.5px] text-[var(--sp-text-muted)]">
                      —
                    </p>
                  )}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
