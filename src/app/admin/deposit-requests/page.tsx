'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useLangStore } from '@/lib/lang';
import { V2PageHeader, V2Modal } from '@/components/v2/admin';
import { V2Input } from '@/components/v2/Field';
import { V2Button } from '@/components/v2/Button';
import { V2StatusBadge, V2Skeleton, V2EmptyState } from '@/components/v2/ui';

/* V2 deposit requests — same filter/approve/reject APIs as V1. */

type Filter = '' | 'PENDING' | 'APPROVED' | 'REJECTED';

export default function DepositRequestsPage() {
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';
  const locale = isRTL ? 'ar-EG' : 'en-US';

  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('');
  const [processing, setProcessing] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<any>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async (f: Filter) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/deposit-requests?status=${f}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setRequests(Array.isArray(data) ? data : data.data || []);
      }
    } catch { /* keep list */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(filter); }, [load, filter]);

  async function approve(req: any) {
    setProcessing(req.id);
    try {
      const res = await fetch(`/api/admin/deposit-requests/${req.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'APPROVED' }),
      });
      if (res.ok) {
        setRequests((prev) => prev.filter((x) => x.id !== req.id));
        toast.success(t('depositRequest.approvedMsg'));
      } else {
        toast.error(t('common.error'));
      }
    } catch {
      toast.error(t('common.error'));
    } finally {
      setProcessing(null);
    }
  }

  async function reject() {
    if (!rejecting || !reason.trim()) return;
    setProcessing(rejecting.id);
    try {
      const res = await fetch(`/api/admin/deposit-requests/${rejecting.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'REJECTED', adminNotes: reason }),
      });
      if (res.ok) {
        setRequests((prev) => prev.filter((x) => x.id !== rejecting.id));
        setRejecting(null);
        setReason('');
        toast.success(t('depositRequest.rejectedMsg'));
      } else {
        toast.error(t('common.error'));
      }
    } catch {
      toast.error(t('common.error'));
    } finally {
      setProcessing(null);
    }
  }

  const filters: Filter[] = ['', 'PENDING', 'APPROVED', 'REJECTED'];

  return (
    <div>
      <V2PageHeader title={t('admin.depositRequests')} sub={isRTL ? `${requests.length} طلب` : `${requests.length} requests`} />

      <div className="mt-5 flex flex-wrap gap-1.5">
        {filters.map((f) => (
          <button
            key={f || 'all'}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`rounded-xl border px-3.5 py-2.5 text-[13.5px] font-bold transition ${filter === f ? 'border-[#0A1E3C] bg-[#0A1E3C] text-white' : 'border-slate-200 bg-[var(--sp-card)] text-[var(--sp-text-muted)]'}`}
          >
            {f || (isRTL ? 'الكل' : 'All')}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="grid gap-3" role="status">
            <V2Skeleton className="h-28 rounded-2xl" />
            <V2Skeleton className="h-28 rounded-2xl" />
          </div>
        ) : requests.length === 0 ? (
          <V2EmptyState
            title={t('depositRequest.noRequests')}
            actionLabel={t('nav.dashboard')}
            onAction={() => { window.location.href = '/admin'; }}
          />
        ) : (
          <div className="grid gap-3">
            {requests.map((r: any) => (
              <div key={r.id} className="rounded-2xl border border-[var(--sp-line)] bg-[var(--sp-card)] p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[16px] font-extrabold tabular-nums text-[#0B1B33]">
                    {Number(r.amount || 0).toLocaleString(locale)} {t('common.currency')}
                  </p>
                  <V2StatusBadge tone={r.status === 'APPROVED' ? 'green' : r.status === 'REJECTED' ? 'red' : 'amber'}>
                    {r.status === 'APPROVED' ? t('depositRequest.approved') : r.status === 'REJECTED' ? t('depositRequest.rejected') : t('depositRequest.pending')}
                  </V2StatusBadge>
                  <span className="ms-auto text-[12.5px] tabular-nums text-[var(--sp-text-muted)]">
                    {r.createdAt && new Date(r.createdAt).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                  </span>
                </div>
                <p className="mt-1.5 text-[14px] font-semibold text-[#0B1B33]">
                  {r.company?.name || r.companyName || ''}
                </p>
                {r.status === 'PENDING' && (
                  <div className="mt-3.5 flex gap-2">
                    <V2Button disabled={processing === r.id} onClick={() => approve(r)} className="flex-1">
                      {processing === r.id ? <Loader2 className="size-5 animate-spin" /> : <Check className="size-5" />}
                      {t('depositRequest.approve')}
                    </V2Button>
                    <button
                      onClick={() => { setRejecting(r); setReason(''); }}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-50 py-3 text-[14.5px] font-bold text-red-600 hover:bg-red-100"
                    >
                      <X className="size-5" /> {t('depositRequest.reject')}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <V2Modal open={!!rejecting} onClose={() => setRejecting(null)} title={t('depositRequest.reject')}>
        <V2Input
          value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder={t('depositRequest.reason')} aria-label={t('depositRequest.reason')} autoFocus
        />
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <button onClick={() => setRejecting(null)} className="rounded-xl bg-slate-100 py-3.5 text-[14.5px] font-bold text-[#0B1B33]">
            {t('common.cancel')}
          </button>
          <V2Button disabled={processing !== null || !reason.trim()} onClick={reject}>
            {processing ? <Loader2 className="size-5 animate-spin" /> : null} {t('common.confirm')}
          </V2Button>
        </div>
      </V2Modal>
    </div>
  );
}
