'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { motion } from 'framer-motion';
import { Loader2, CheckCircle2, Copy, Check, Upload, AlertTriangle, Receipt } from 'lucide-react';
import { useLangStore } from '@/lib/lang';
import '@/components/v2/theme.css';
import { V2SiteHeader } from '@/components/v2/SiteHeader';
import { V2SiteFooter } from '@/components/v2/SiteFooter';
import { V2Field, V2Input } from '@/components/v2/Field';
import { V2Button } from '@/components/v2/Button';
import { V2Skeleton } from '@/components/v2/ui';

/* Customer transfer-proof payment: method + screenshot + notes, admin reviews. */

interface PayBooking {
  id: string;
  reference: string;
  seatLabel: string;
  total: number;
  status: string;
  groupId?: string | null;
  paymentMethod?: string | null;
  paymentProofUrl?: string | null;
  paymentNotes?: string | null;
  paymentStatus?: string | null;
  paymentRejectReason?: string | null;
  trip?: { origin: string; destination: string; departure: string };
}

const METHODS = [
  { key: 'VODAFONE_CASH', labelKey: 'pay.methodVodafone' },
  { key: 'INSTAPAY', labelKey: 'pay.methodInstapay' },
  { key: 'CASH', labelKey: 'pay.methodCash' },
  { key: 'BANK', labelKey: 'pay.methodBank' },
] as const;

export default function BookingPayPage() {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : (params.id as string);
  const { status } = useSession();
  const router = useRouter();
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';
  const locale = isRTL ? 'ar-EG' : 'en-US';

  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState<PayBooking | null>(null);
  const [group, setGroup] = useState<PayBooking[]>([]);
  const [wallets, setWallets] = useState({ vodafone: '', instapay: '' });
  const [method, setMethod] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
    if (status === 'loading') return;
    (async () => {
      try {
        const [bRes, wRes] = await Promise.all([
          fetch(`/api/bookings/${id}`),
          fetch('/api/settings/payment'),
        ]);
        if (!bRes.ok) {
          setError(bRes.status === 404 ? t('v2.noTrips') : 'Error');
          return;
        }
        const b = await bRes.json();
        setBooking(b);
        if (wRes.ok) {
          const w = await wRes.json();
          setWallets({ vodafone: w.vodafone || '', instapay: w.instapay || '' });
        }
        if (b.groupId) {
          const gRes = await fetch(`/api/bookings?groupId=${b.groupId}`);
          if (gRes.ok) {
            const g = await gRes.json();
            if (Array.isArray(g.data)) setGroup(g.data);
          }
        }
      } catch {
        setError('Network error');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, id]);

  const payable = group.length > 0 ? group.filter((g) => g.status === 'PENDING') : booking && booking.status === 'PENDING' ? [booking] : [];
  const total = payable.reduce((s, b) => s + (b.total || 0), 0);
  const isGroup = payable.length > 1;

  async function uploadProof(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('proof', file);
      const res = await fetch('/api/uploads/payment-proof', { method: 'POST', body: fd });
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || 'Error uploading image');
        return;
      }
      const { url } = await res.json();
      setProofUrl(url);
    } catch {
      setError('Network error');
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (!method) {
      setError(t('pay.needMethod'));
      return;
    }
    if (!proofUrl) {
      setError(t('pay.needProof'));
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/bookings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'SUBMIT_PROOF',
          paymentMethod: method,
          paymentProofUrl: proofUrl,
          paymentNotes: notes,
          applyToGroup: isGroup,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || 'Error submitting payment');
        return;
      }
      setDone(true);
    } catch {
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  }

  function copyNum(v: string, which: string) {
    if (!v) return;
    navigator.clipboard?.writeText(v).catch(() => {});
    setCopied(which);
    setTimeout(() => setCopied(''), 2000);
  }

  const paid = booking?.status === 'PAID';
  const cancelled = booking?.status === 'CANCELLED';
  const awaiting = booking?.paymentStatus === 'PENDING' && !done;
  const rejected = booking?.paymentStatus === 'REJECTED' && !done;

  return (
    <div className="v2 min-h-dvh bg-[#F6F8FC]" dir={isRTL ? 'rtl' : 'ltr'}>
      <V2SiteHeader />

      <main className="v2-container max-w-2xl pb-16 pt-8 md:pt-10">
        <h1 className="text-balance text-[28px] font-extrabold text-[#0B1B33] md:text-[34px]">{t('pay.title')}</h1>
        <p className="mt-2 text-pretty text-[15px] text-[#5B6B84]">{t('pay.subtitle')}</p>

        {loading ? (
          <div className="mt-6 grid gap-4" role="status">
            <V2Skeleton className="h-48 rounded-2xl" />
            <V2Skeleton className="h-64 rounded-2xl" />
          </div>
        ) : !booking ? (
          <p role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[14px] font-semibold text-red-600">
            {error || t('v2.noTrips')}
          </p>
        ) : paid || cancelled ? (
          <p role="status" className="mt-6 flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[14px] font-semibold text-emerald-700">
            <CheckCircle2 className="size-5" /> {paid ? t('pay.paid') : booking.status}
          </p>
        ) : done || awaiting ? (
          <div className="mt-6 grid gap-5">
            <p role="status" className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[14px] font-semibold text-emerald-700">
              <CheckCircle2 className="size-5" /> {done ? t('pay.sent') : t('pay.pending')}
            </p>
            <Link href="/bookings" className="v2-btn-primary px-6 py-3.5 text-center text-[14.5px]">{t('pay.back')}</Link>
          </div>
        ) : (
          <div className="mt-6 grid gap-5">
            {rejected && (
              <p role="alert" className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[14px] font-semibold text-amber-800">
                <AlertTriangle className="mt-0.5 size-5 shrink-0" />
                <span>{t('pay.rejected')}{booking.paymentRejectReason ? `: ${booking.paymentRejectReason}` : ''}</span>
              </p>
            )}
            {error && (
              <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[14px] font-semibold text-red-600">
                {error}
              </motion.p>
            )}

            {/* Amount */}
            <div className="v2-card p-6">
              <p className="flex items-center gap-2 text-[16px] font-extrabold text-[#0B1B33]">
                <Receipt className="size-5 text-[#1D5BD8]" />
                {isGroup ? `${t('pay.groupCount')}: ${payable.length}` : `${booking.trip?.destination || ''} ← ${booking.trip?.origin || ''}`}
              </p>
              <p className="mt-2 text-[26px] font-extrabold tabular-nums text-[#0B1B33]">
                {Math.round(total).toLocaleString(locale)} <span className="text-[14px] font-semibold text-[#5B6B84]">EGP · {t('pay.total')}</span>
              </p>
            </div>

            {/* Merchant wallets */}
            {(wallets.vodafone || wallets.instapay) && (
              <div className="v2-card grid gap-3 p-6">
                {wallets.vodafone && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[14px] font-bold text-[#0B1B33]">{t('pay.vodafoneNumber')}</span>
                    <button type="button" onClick={() => copyNum(wallets.vodafone, 'v')}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#F1F4F9] px-3.5 py-2 text-[14px] font-extrabold tabular-nums text-[#0B1B33]" dir="ltr">
                      {wallets.vodafone} {copied === 'v' ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
                    </button>
                  </div>
                )}
                {wallets.instapay && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[14px] font-bold text-[#0B1B33]">{t('pay.instapayHandle')}</span>
                    <button type="button" onClick={() => copyNum(wallets.instapay, 'i')}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#F1F4F9] px-3.5 py-2 text-[14px] font-extrabold tabular-nums text-[#0B1B33]" dir="ltr">
                      {wallets.instapay} {copied === 'i' ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Method */}
            <div className="v2-card p-6">
              <p className="text-[16px] font-extrabold text-[#0B1B33]">{t('pay.method')}</p>
              <div className="mt-3 grid grid-cols-2 gap-2.5" role="radiogroup" aria-label={t('pay.method')}>
                {METHODS.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    role="radio"
                    aria-checked={method === m.key}
                    onClick={() => setMethod(m.key)}
                    className={`rounded-xl border px-4 py-3.5 text-[14px] font-bold transition ${
                      method === m.key
                        ? 'border-[#1D5BD8] bg-[#EFF4FF] text-[#1D5BD8]'
                        : 'border-slate-200 bg-white text-[#5B6B84]'
                    }`}
                  >
                    {t(m.labelKey)}
                  </button>
                ))}
              </div>
            </div>

            {/* Proof */}
            <div className="v2-card p-6">
              <p className="text-[16px] font-extrabold text-[#0B1B33]">{t('pay.proof')}</p>
              <p className="mt-1 text-[13px] text-[#5B6B84]">{t('pay.proofHint')}</p>
              <div className="mt-3">
                {proofUrl ? (
                  <div className="flex items-center gap-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={proofUrl} alt="" className="h-24 w-24 rounded-xl border border-[#E3E9F4] object-cover" />
                    <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                      className="text-[13.5px] font-semibold text-[#1D5BD8] underline-offset-2 hover:underline disabled:opacity-60">
                      {t('pay.changeImage')}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-white px-4 py-8 text-[14px] font-bold text-[#5B6B84] transition hover:border-[#1D5BD8] hover:text-[#1D5BD8] disabled:opacity-60"
                  >
                    {uploading ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}
                    {uploading ? t('pay.uploading') : t('pay.proof')}
                  </button>
                )}
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={uploadProof} />
              </div>
              <div className="mt-4">
                <V2Field label={t('pay.notes')}>
                  <V2Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('pay.notesPh')} />
                </V2Field>
              </div>
              <V2Button onClick={submit} disabled={submitting || uploading} className="mt-5 w-full">
                {submitting && <Loader2 className="size-5 animate-spin" />} {t('pay.submit')}
              </V2Button>
            </div>
          </div>
        )}
      </main>

      <V2SiteFooter />
    </div>
  );
}
