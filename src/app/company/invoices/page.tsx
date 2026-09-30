'use client';

import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { useLangStore } from '@/lib/lang';
import { V2StatusBadge, V2Skeleton, V2EmptyState } from '@/components/v2/ui';

/* V2 company invoices — same read-only list API as V1. */

export default function CompanyInvoicesPage() {
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';
  const locale = isRTL ? 'ar-EG' : 'en-US';

  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const q = filter ? `?status=${filter}` : '';
        const res = await fetch(`/api/company/invoices${q}`);
        if (res.ok) {
          const data = await res.json();
          setInvoices(data.data || []);
        }
      } catch { /* keep empty */ } finally { setLoading(false); }
    })();
  }, [filter]);

  return (
    <div>
      <h1 className="text-balance text-[26px] font-extrabold text-[#0B1B33] md:text-[32px]">{t('company.invoices')}</h1>

      <div className="mt-5 flex flex-wrap gap-1.5">
        {['', 'PENDING', 'PARTIAL', 'PAID', 'OVERDUE'].map((s) => (
          <button
            key={s || 'all'}
            onClick={() => setFilter(s)}
            aria-pressed={filter === s}
            className={`rounded-xl border px-3.5 py-2.5 text-[13.5px] font-bold transition ${filter === s ? 'border-[#0A1E3C] bg-[#0A1E3C] text-white' : 'border-slate-200 bg-white text-[#5B6B84]'}`}
          >
            {s || (isRTL ? 'الكل' : 'All')}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="grid gap-3" role="status">
            <V2Skeleton className="h-28 rounded-2xl" />
            <V2Skeleton className="h-28 rounded-2xl" />
          </div>
        ) : invoices.length === 0 ? (
          <V2EmptyState title={t('company.noInvoices')} />
        ) : (
          <div className="grid gap-3">
            {invoices.map((inv: any) => (
              <div key={inv.id} className="flex items-center gap-3.5 rounded-2xl border border-[#E6EBF2] bg-white p-5">
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#EFF4FF] text-[#1D5BD8]">
                  <FileText className="size-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-extrabold tabular-nums text-[#0B1B33]">
                    {inv.periodStart && new Date(inv.periodStart).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                    {' — '}
                    {inv.periodEnd && new Date(inv.periodEnd).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                  <p className="mt-0.5 text-[13px] tabular-nums text-[#5B6B84]">
                    {t('company.invoiceTotal')}: EGP {Number(inv.totalAmount || 0).toLocaleString(locale)}
                    {' · '}{t('company.invoiceRemaining')}: EGP {Number((inv.totalAmount || 0) - (inv.paidAmount || 0)).toLocaleString(locale)}
                    {inv.dueDate && ` · ${t('company.dueDate')}: ${new Date(inv.dueDate).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}`}
                  </p>
                </div>
                <V2StatusBadge tone={inv.status === 'PAID' ? 'green' : inv.status === 'OVERDUE' ? 'red' : 'amber'}>
                  {inv.status}
                </V2StatusBadge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
