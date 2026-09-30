'use client';

import { useEffect, useState } from 'react';
import { Wallet, CreditCard, TrendingUp, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useLangStore } from '@/lib/lang';
import { V2Field, V2Input } from '@/components/v2/Field';
import { V2Button } from '@/components/v2/Button';
import { V2StatusBadge, V2Skeleton } from '@/components/v2/ui';

/* V2 company credit — same credit/wallet/deposit-request APIs as V1. */

export default function CompanyCreditPage() {
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';
  const locale = isRTL ? 'ar-EG' : 'en-US';

  const [credit, setCredit] = useState<any>(null);
  const [tx, setTx] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/company/credit').then((r) => r.json()),
      fetch('/api/company/wallet?page=1&take=20').then((r) => r.json()),
      fetch('/api/company/deposit-requests').then((r) => r.json()),
    ])
      .then(([c, w, d]) => {
        setCredit(c);
        setTx(w.data || []);
        setRequests(d.data || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function submitDeposit() {
    const value = Number(amount);
    if (!value || value <= 0) {
      toast.error(isRTL ? 'أدخل مبلغًا صحيحًا' : 'Enter a valid amount');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/company/deposit-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: value }),
      });
      const data = await res.json();
      if (res.ok) {
        setRequests((prev) => [data.data || data, ...prev]);
        setAmount('');
        toast.success(t('depositRequest.success'));
      } else {
        toast.error(data.error || t('common.error'));
      }
    } catch {
      toast.error(t('common.error'));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="grid gap-4" role="status">
        <V2Skeleton className="h-10 w-56" />
        <div className="grid gap-3 sm:grid-cols-3">
          <V2Skeleton className="h-32 rounded-2xl" />
          <V2Skeleton className="h-32 rounded-2xl" />
          <V2Skeleton className="h-32 rounded-2xl" />
        </div>
      </div>
    );
  }

  const cards = [
    { label: t('company.walletBalance'), value: Number(credit?.walletBalance || 0), icon: Wallet, chip: 'bg-emerald-50 text-emerald-700' },
    { label: t('company.availableCredit'), value: Number(credit?.availableCredit || 0), icon: CreditCard, chip: 'bg-[#EFF4FF] text-[#1D5BD8]' },
    { label: t('company.outstanding'), value: Number(credit?.outstandingBalance || 0), icon: TrendingUp, chip: 'bg-amber-50 text-amber-700' },
  ];

  return (
    <div>
      <h1 className="text-balance text-[26px] font-extrabold text-[#0B1B33] md:text-[32px]">{t('company.credit')}</h1>
      <p className="mt-1 text-[14.5px] text-[#5B6B84]">
        {t('company.paymentMode')}: <strong className="text-[#0B1B33]">{credit?.company?.paymentMode}</strong>
      </p>

      <div className="mt-5 grid gap-3.5 sm:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-[#E6EBF2] bg-white p-5">
            <span className={`inline-grid size-11 place-items-center rounded-xl ${c.chip}`}>
              <c.icon className="size-5" />
            </span>
            <p className="mt-3 truncate text-[13px] font-semibold text-[#5B6B84]">{c.label}</p>
            <p className="mt-1 text-[21px] font-extrabold tabular-nums text-[#0B1B33]">
              {c.value.toLocaleString(locale)} <span className="text-[13px] font-semibold text-[#5B6B84]">EGP</span>
            </p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[360px_1fr]">
        <div className="rounded-2xl border border-[#E6EBF2] bg-white p-5 md:p-6">
          <p className="flex items-center gap-2 text-[16px] font-extrabold text-[#0B1B33]">
            <Plus className="size-5 text-[#1D5BD8]" /> {t('depositRequest.newRequest')}
          </p>
          <div className="mt-4">
            <V2Field label={t('depositRequest.amount')}>
              <V2Input
                type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)}
                placeholder="1000" dir="ltr" className="tabular-nums"
              />
            </V2Field>
          </div>
          <V2Button disabled={submitting} onClick={submitDeposit} className="mt-4 w-full">
            {submitting && <Loader2 className="size-5 animate-spin" />} {t('depositRequest.submit')}
          </V2Button>
          {requests.length > 0 && (
            <div className="mt-5 grid gap-2">
              {requests.map((r: any) => (
                <div key={r.id} className="flex items-center gap-2.5 rounded-xl bg-[#F6F8FC] px-4 py-3 text-[13.5px]">
                  <span className="font-extrabold tabular-nums text-[#0B1B33]">EGP {Number(r.amount || 0).toLocaleString(locale)}</span>
                  <V2StatusBadge tone={r.status === 'APPROVED' ? 'green' : r.status === 'REJECTED' ? 'red' : 'amber'}>
                    {r.status}
                  </V2StatusBadge>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[#E6EBF2] bg-white p-5 md:p-6">
          <p className="text-[16px] font-extrabold text-[#0B1B33]">{t('company.transactionHistory')}</p>
          <div className="mt-4 grid gap-2">
            {tx.length === 0 && (
              <p className="rounded-xl bg-[#F6F8FC] py-6 text-center text-[14px] text-[#5B6B84]">{t('company.noTransactions')}</p>
            )}
            {tx.map((w: any) => (
              <div key={w.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-[#F6F8FC]">
                <span className={`grid size-10 shrink-0 place-items-center rounded-xl text-[15px] font-extrabold tabular-nums ${Number(w.amount) < 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
                  {Number(w.amount) < 0 ? '−' : '+'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold text-[#0B1B33]">{w.description || w.type}</span>
                  <span className="block text-[12.5px] tabular-nums text-[#5B6B84]">
                    {w.createdAt && new Date(w.createdAt).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                  </span>
                </span>
                <span className={`shrink-0 text-[15px] font-extrabold tabular-nums ${Number(w.amount) < 0 ? 'text-red-600' : 'text-emerald-700'}`} dir="ltr">
                  {Number(w.amount) < 0 ? '−' : '+'}EGP {Math.abs(Number(w.amount || 0)).toLocaleString(locale)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
