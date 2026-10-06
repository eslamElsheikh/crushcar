'use client';

import { useEffect, useRef, useState } from 'react';
import { Wallet, CreditCard, TrendingUp, Plus, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useLangStore } from '@/lib/lang';
import { V2Field, V2Input } from '@/components/v2/Field';
import { V2Button } from '@/components/v2/Button';
import { V2StatusBadge, V2Skeleton } from '@/components/v2/ui';

/* V2 company credit — same credit/wallet/deposit-request APIs as V1. */

const METHODS = [
  { key: 'VODAFONE_CASH', labelKey: 'pay.methodVodafone' },
  { key: 'INSTAPAY', labelKey: 'pay.methodInstapay' },
  { key: 'CASH', labelKey: 'pay.methodCash' },
  { key: 'BANK', labelKey: 'pay.methodBank' },
] as const;

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
  const [method, setMethod] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [wallets, setWallets] = useState({ vodafone: '', instapay: '' });
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/company/credit').then((r) => r.json()),
      fetch('/api/company/wallet?page=1&take=20').then((r) => r.json()),
      fetch('/api/company/deposit-requests').then((r) => r.json()),
      fetch('/api/settings/payment').then((r) => r.json()).catch(() => ({})),
    ])
      .then(([c, w, d, p]) => {
        setCredit(c);
        setTx(w.data || []);
        setRequests(d.data || []);
        setWallets({ vodafone: p.vodafone || '', instapay: p.instapay || '' });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function uploadProof(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('proof', file);
      const res = await fetch('/api/uploads/payment-proof', { method: 'POST', body: fd });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || t('common.error'));
        return;
      }
      const { url } = await res.json();
      setProofUrl(url);
    } catch {
      toast.error(t('common.error'));
    } finally {
      setUploading(false);
    }
  }

  async function submitDeposit() {
    const value = Number(amount);
    if (!value || value <= 0) {
      toast.error(isRTL ? 'أدخل مبلغًا صحيحًا' : 'Enter a valid amount');
      return;
    }
    if (!method) {
      toast.error(t('pay.needMethod'));
      return;
    }
    if (!proofUrl) {
      toast.error(t('pay.needProof'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/company/deposit-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: value, method, attachmentUrl: proofUrl, attachmentName: 'transfer-proof', notes }),
      });
      const data = await res.json();
      if (res.ok) {
        setRequests((prev) => [data.data || data, ...prev]);
        setAmount('');
        setMethod('');
        setProofUrl('');
        setNotes('');
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
      <p className="mt-1 text-[14.5px] text-[var(--sp-text-muted)]">
        {t('company.paymentMode')}: <strong className="text-[#0B1B33]">{credit?.company?.paymentMode}</strong>
      </p>

      <div className="mt-5 grid gap-3.5 sm:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-[var(--sp-line)] bg-[var(--sp-card)] p-5">
            <span className={`inline-grid size-11 place-items-center rounded-xl ${c.chip}`}>
              <c.icon className="size-5" />
            </span>
            <p className="mt-3 truncate text-[13px] font-semibold text-[var(--sp-text-muted)]">{c.label}</p>
            <p className="mt-1 text-[21px] font-extrabold tabular-nums text-[#0B1B33]">
              {c.value.toLocaleString(locale)} <span className="text-[13px] font-semibold text-[var(--sp-text-muted)]">{t('common.currency')}</span>
            </p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[360px_1fr]">
        <div className="rounded-2xl border border-[var(--sp-line)] bg-[var(--sp-card)] p-5 md:p-6">
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
          {(wallets.vodafone || wallets.instapay) && (
            <div className="mt-3 grid gap-2 rounded-xl bg-[var(--sp-inset)] px-4 py-3 text-[13px]">
              {wallets.vodafone && (
                <p className="flex items-center justify-between gap-2">
                  <span className="font-bold text-[#0B1B33]">{t('pay.methodVodafone')}</span>
                  <span className="font-extrabold tabular-nums text-[#0B1B33]" dir="ltr">{wallets.vodafone}</span>
                </p>
              )}
              {wallets.instapay && (
                <p className="flex items-center justify-between gap-2">
                  <span className="font-bold text-[#0B1B33]">{t('pay.methodInstapay')}</span>
                  <span className="font-extrabold tabular-nums text-[#0B1B33]" dir="ltr">{wallets.instapay}</span>
                </p>
              )}
            </div>
          )}
          <div className="mt-4">
            <p className="px-1 text-[13px] font-bold text-[#0B1B33]">{t('pay.method')}</p>
            <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('pay.method')}>
              {METHODS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  role="radio"
                  aria-checked={method === m.key}
                  onClick={() => setMethod(m.key)}
                  className={`rounded-xl border px-3 py-2.5 text-[13px] font-bold transition ${
                    method === m.key
                      ? 'border-[#1D5BD8] bg-[#EFF4FF] text-[#1D5BD8]'
                      : 'border-slate-200 bg-white text-[var(--sp-text-muted)]'
                  }`}
                >
                  {t(m.labelKey)}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4">
            <p className="px-1 text-[13px] font-bold text-[#0B1B33]">{t('pay.proof')}</p>
            <p className="mt-0.5 px-1 text-[12px] text-[var(--sp-text-muted)]">{t('pay.proofHint')}</p>
            <div className="mt-2">
              {proofUrl ? (
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={proofUrl} alt="" className="h-20 w-20 rounded-xl border border-[var(--sp-line)] object-cover" />
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                    className="text-[13px] font-semibold text-[#1D5BD8] underline-offset-2 hover:underline disabled:opacity-60">
                    {t('pay.changeImage')}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-white px-4 py-6 text-[13.5px] font-bold text-[var(--sp-text-muted)] transition hover:border-[#1D5BD8] hover:text-[#1D5BD8] disabled:opacity-60"
                >
                  {uploading ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}
                  {uploading ? t('pay.uploading') : t('pay.proof')}
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={uploadProof} />
            </div>
          </div>
          <div className="mt-4">
            <V2Field label={t('pay.notes')}>
              <V2Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('pay.notesPh')} />
            </V2Field>
          </div>
          <V2Button disabled={submitting || uploading} onClick={submitDeposit} className="mt-4 w-full">
            {submitting && <Loader2 className="size-5 animate-spin" />} {t('depositRequest.submit')}
          </V2Button>
          {requests.length > 0 && (
            <div className="mt-5 grid gap-2">
              {requests.map((r: any) => (
                <div key={r.id} className="flex items-center gap-2.5 rounded-xl bg-[var(--sp-inset)] px-4 py-3 text-[13.5px]">
                  <span className="font-extrabold tabular-nums text-[#0B1B33]">{Number(r.amount || 0).toLocaleString(locale)} {t('common.currency')}</span>
                  <V2StatusBadge tone={r.status === 'APPROVED' ? 'green' : r.status === 'REJECTED' ? 'red' : 'amber'}>
                    {r.status === 'APPROVED' ? t('depositRequest.approved') : r.status === 'REJECTED' ? t('depositRequest.rejected') : t('depositRequest.pending')}
                  </V2StatusBadge>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[var(--sp-line)] bg-[var(--sp-card)] p-5 md:p-6">
          <p className="text-[16px] font-extrabold text-[#0B1B33]">{t('company.transactionHistory')}</p>
          <div className="mt-4 grid gap-2">
            {tx.length === 0 && (
              <p className="rounded-xl bg-[var(--sp-inset)] py-6 text-center text-[14px] text-[var(--sp-text-muted)]">{t('company.noTransactions')}</p>
            )}
            {tx.map((w: any) => (
              <div key={w.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-[var(--sp-inset)]">
                <span className={`grid size-10 shrink-0 place-items-center rounded-xl text-[15px] font-extrabold tabular-nums ${Number(w.amount) < 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
                  {Number(w.amount) < 0 ? '−' : '+'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold text-[#0B1B33]">{w.description || w.type}</span>
                  <span className="block text-[12.5px] tabular-nums text-[var(--sp-text-muted)]">
                    {w.createdAt && new Date(w.createdAt).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                  </span>
                </span>
                <span className={`shrink-0 text-[15px] font-extrabold tabular-nums ${Number(w.amount) < 0 ? 'text-red-600' : 'text-emerald-700'}`} dir="ltr">
                  {Number(w.amount) < 0 ? '−' : '+'} {Math.abs(Number(w.amount || 0)).toLocaleString(locale)} {t('common.currency')}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
