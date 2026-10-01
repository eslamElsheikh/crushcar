'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, X, Loader2, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { useLangStore } from '@/lib/lang';
import { V2PageHeader, V2Modal } from '@/components/v2/admin';
import { V2Field, V2Select, V2Input } from '@/components/v2/Field';
import { V2Button } from '@/components/v2/Button';
import { V2Skeleton, V2EmptyState } from '@/components/v2/ui';

/* V2 pending companies — same list/approve/reject APIs as V1. */

export default function PendingCompaniesPage() {
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';

  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [form, setForm] = useState({ creditLimit: 0, paymentMode: 'PREPAID', billingCycle: 'MONTHLY' });
  const [error, setError] = useState('');
  const [acting, setActing] = useState(false);
  const [rejecting, setRejecting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/companies/pending', { credentials: 'include' });
      if (res.ok) setCompanies(await res.json());
    } catch { /* keep list */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openApprove(c: any) {
    setSelected(c);
    setForm({ creditLimit: 0, paymentMode: 'PREPAID', billingCycle: 'MONTHLY' });
    setError('');
  }

  async function approve() {
    if (!selected) return;
    setActing(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/companies/${selected.id}/approve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...form, action: 'approve' }),
      });
      if (res.ok) {
        setCompanies((prev) => prev.filter((c) => c.id !== selected.id));
        setSelected(null);
        toast.success(t('common.success'));
      } else {
        setError((await res.json()).error || t('common.error'));
      }
    } catch {
      setError(t('common.error'));
    } finally {
      setActing(false);
    }
  }

  async function reject(id: string, name: string) {
    if (!window.confirm(isRTL ? `رفض وحذف "${name}"؟` : `Reject and delete "${name}"?`)) return;
    setRejecting(id);
    try {
      const res = await fetch(`/api/admin/companies/${id}/approve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'reject' }),
      });
      if (res.ok) {
        setCompanies((prev) => prev.filter((c) => c.id !== id));
        toast.success(isRTL ? 'تم رفض الشركة' : 'Company rejected');
      } else {
        toast.error(t('common.error'));
      }
    } catch {
      toast.error(t('common.error'));
    } finally {
      setRejecting(null);
    }
  }

  return (
    <div>
      <V2PageHeader
        title={t('admin.pendingCompanies')}
        sub={isRTL ? `${companies.length} بانتظار المراجعة` : `${companies.length} awaiting review`}
      />

      <div className="mt-5">
        {loading ? (
          <div className="grid gap-3" role="status">
            <V2Skeleton className="h-28 rounded-2xl" />
            <V2Skeleton className="h-28 rounded-2xl" />
          </div>
        ) : companies.length === 0 ? (
          <V2EmptyState
            title={isRTL ? 'لا توجد شركات معلقة' : 'No pending companies'}
            actionLabel={t('nav.dashboard')}
            onAction={() => { window.location.href = '/admin'; }}
          />
        ) : (
          <div className="grid gap-3">
            {companies.map((c: any) => (
              <div key={c.id} className="rounded-2xl border border-[#E6EBF2] bg-white p-5">
                <div className="flex items-center gap-3">
                  <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#EFF4FF] text-[#1D5BD8]">
                    <Building2 className="size-6" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[16px] font-extrabold text-[#0B1B33]">{c.name}</p>
                    <p className="truncate text-[13px] tabular-nums text-[#5B6B84]" dir="ltr" style={{ textAlign: 'start' }}>
                      {[c.email, c.phone].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </div>
                {c.notes && <p className="mt-2.5 rounded-xl bg-[#F6F8FC] px-4 py-2.5 text-[13.5px] text-[#5B6B84]">{c.notes}</p>}
                <div className="mt-4 flex gap-2">
                  <V2Button disabled={rejecting === c.id} onClick={() => openApprove(c)} className="flex-1">
                    <Check className="size-5" /> {t('tripRequest.approve')}
                  </V2Button>
                  <button
                    onClick={() => reject(c.id, c.name)}
                    disabled={rejecting === c.id}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-50 py-3 text-[14.5px] font-bold text-red-600 hover:bg-red-100 disabled:opacity-50"
                  >
                    {rejecting === c.id ? <Loader2 className="size-5 animate-spin" /> : <X className="size-5" />}
                    {t('tripRequest.reject')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <V2Modal open={!!selected} onClose={() => setSelected(null)} title={t('company.activate')}>
        <div className="grid gap-3.5">
          <V2Field label={t('company.creditLimit')}>
            <V2Input
              type="number" min="0" value={form.creditLimit}
              onChange={(e) => setForm({ ...form, creditLimit: parseFloat(e.target.value) || 0 })}
              dir="ltr" className="tabular-nums"
            />
          </V2Field>
          <div className="grid gap-3.5 sm:grid-cols-2">
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
          </div>
        </div>
        {error && (
          <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[14px] font-semibold text-red-600">
            {error}
          </p>
        )}
        <V2Button disabled={acting} onClick={approve} size="lg" className="mt-5 w-full">
          {acting && <Loader2 className="size-5 animate-spin" />} {t('company.activate')}
        </V2Button>
      </V2Modal>
    </div>
  );
}
