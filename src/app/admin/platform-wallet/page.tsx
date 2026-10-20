'use client';

import { useEffect, useState } from 'react';
import { Landmark, Wallet, TrendingUp, TrendingDown, Plus } from 'lucide-react';
import { useLangStore } from '@/lib/lang';
import { V2PageHeader, V2StatCard, V2Table } from '@/components/v2/admin';
import { V2StatusBadge } from '@/components/v2/ui';

/*
 * The platform wallet: the operator's own float.
 *
 * It is deliberately not part of the company credit totals. The credit report
 * answers "what do we owe companies", this answers "what cash do we hold" —
 * two different questions with two different answers, so the two are shown in
 * separate places and never added together.
 */

type Txn = {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  description: string;
  reference: string;
  actorEmail: string;
  method: string;
  createdAt: string;
};

type WalletData = {
  balance: number;
  ledgerSum: number;
  inSync: boolean;
  transactions: Txn[];
};

export default function AdminPlatformWallet() {
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';
  const locale = isRTL ? 'ar-EG' : 'en-US';

  const [data, setData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({ amount: '', method: 'CASH', reference: '', description: '' });

  async function load() {
    try {
      const res = await fetch('/api/admin/platform-wallet?limit=200', { credentials: 'include' });
      if (!res.ok) {
        setError(t('common.error'));
        return;
      }
      setData(await res.json());
    } catch {
      setError(t('common.error'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fund(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError(isRTL ? 'أدخل مبلغًا صحيحًا' : 'Enter a valid amount');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/admin/platform-wallet', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error || t('common.error'));
        return;
      }
      setNotice(isRTL ? 'تم شحن المحفظة' : 'Wallet funded');
      setForm({ amount: '', method: 'CASH', reference: '', description: '' });
      await load();
    } catch {
      setError(t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  const balance = data?.balance ?? 0;
  const funded = (data?.transactions ?? [])
    .filter((x) => x.type === 'FUNDING')
    .reduce((sum, x) => sum + x.amount, 0);
  const spent = (data?.transactions ?? [])
    .filter((x) => x.type !== 'FUNDING')
    .reduce((sum, x) => sum + Math.abs(x.amount), 0);

  return (
    <div>
      <V2PageHeader title={t('platformWallet.title')} />

      <div className="mt-5 grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <V2StatCard
          label={t('platformWallet.balance')}
          value={`${balance.toLocaleString(locale)} ${t('common.currency')}`}
          icon={<Landmark className="size-5 text-[#1D5BD8]" />}
        />
        <V2StatCard
          label={t('platformWallet.ledgerSum')}
          value={`${(data?.ledgerSum ?? 0).toLocaleString(locale)} ${t('common.currency')}`}
          icon={<Wallet className="size-5 text-emerald-600" />}
        />
        <V2StatCard
          label={t('platformWallet.funded')}
          value={`${funded.toLocaleString(locale)} ${t('common.currency')}`}
          icon={<TrendingUp className="size-5 text-emerald-600" />}
        />
        <V2StatCard
          label={t('platformWallet.spent')}
          value={`${spent.toLocaleString(locale)} ${t('common.currency')}`}
          icon={<TrendingDown className="size-5 text-amber-600" />}
        />
      </div>

      {data && !data.inSync && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] font-bold text-amber-800">
          {t('platformWallet.outOfSync')}
        </div>
      )}
      {data && data.inSync && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] font-bold text-emerald-800">
          {t('platformWallet.inSync')}
        </div>
      )}

      <form
        onSubmit={fund}
        className="mt-5 rounded-2xl border border-[var(--sp-border)] bg-white p-5"
      >
        <h2 className="flex items-center gap-2 text-[15px] font-extrabold text-[#0B1B33]">
          <Plus className="size-4.5 text-[#1D5BD8]" />
          {t('platformWallet.fund')}
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="block">
            <span className="mb-1.5 block text-[12.5px] font-bold text-[var(--sp-text-muted)]">
              {t('platformWallet.amount')}
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className="w-full rounded-xl border border-[var(--sp-border)] px-3.5 py-2.5 text-[14px] font-bold outline-none focus:border-[#1D5BD8]"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12.5px] font-bold text-[var(--sp-text-muted)]">
              {t('platformWallet.method')}
            </span>
            <input
              value={form.method}
              onChange={(e) => setForm({ ...form, method: e.target.value })}
              className="w-full rounded-xl border border-[var(--sp-border)] px-3.5 py-2.5 text-[14px] font-bold outline-none focus:border-[#1D5BD8]"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12.5px] font-bold text-[var(--sp-text-muted)]">
              {t('platformWallet.reference')}
            </span>
            <input
              value={form.reference}
              onChange={(e) => setForm({ ...form, reference: e.target.value })}
              className="w-full rounded-xl border border-[var(--sp-border)] px-3.5 py-2.5 text-[14px] font-bold outline-none focus:border-[#1D5BD8]"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12.5px] font-bold text-[var(--sp-text-muted)]">
              {t('platformWallet.description')}
            </span>
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-xl border border-[var(--sp-border)] px-3.5 py-2.5 text-[14px] font-bold outline-none focus:border-[#1D5BD8]"
            />
          </label>
        </div>

        {error && (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[13px] font-bold text-rose-700">
            {error}
          </p>
        )}
        {notice && (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-[13px] font-bold text-emerald-700">
            {notice}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-4 rounded-xl bg-[#1D5BD8] px-5 py-2.5 text-[14px] font-extrabold text-white disabled:opacity-60"
        >
          {busy ? '…' : t('platformWallet.fund')}
        </button>
      </form>

      <div className="mt-5">
        <V2Table
          columns={[
            t('platformWallet.type'),
            t('platformWallet.amount'),
            t('platformWallet.balance'),
            t('platformWallet.reference'),
            t('platformWallet.actor'),
            t('platformWallet.description'),
          ]}
          rows={data?.transactions ?? []}
          rowKey={(x) => x.id}
          loading={loading}
          emptyTitle={t('platformWallet.noRows')}
          renderCell={(x, i) => {
            const cells = [
              <span key="t">
                <V2StatusBadge tone={x.type === 'FUNDING' ? 'green' : x.type === 'REFUND' ? 'blue' : 'slate'}>
                  {x.type}
                </V2StatusBadge>
              </span>,
              <span
                key="a"
                className={`font-bold tabular-nums ${
                  x.amount >= 0 ? 'text-emerald-700' : 'text-amber-700'
                }`}
              >
                {x.amount.toLocaleString(locale)}
              </span>,
              <span key="b" className="tabular-nums">
                {x.balanceAfter.toLocaleString(locale)}
              </span>,
              <span key="r" className="tabular-nums">
                {x.reference || '—'}
              </span>,
              <span key="c">{x.actorEmail || '—'}</span>,
              <span key="d">{x.description || '—'}</span>,
            ];
            return cells[i];
          }}
          renderMobile={(x) => (
            <div>
              <div className="flex items-center justify-between gap-2">
                <V2StatusBadge tone={x.type === 'FUNDING' ? 'green' : x.type === 'REFUND' ? 'blue' : 'slate'}>
                  {x.type}
                </V2StatusBadge>
                <span
                  className={`font-bold tabular-nums ${
                    x.amount >= 0 ? 'text-emerald-700' : 'text-amber-700'
                  }`}
                >
                  {x.amount.toLocaleString(locale)}
                </span>
              </div>
              <p className="mt-1.5 text-[12.5px] text-[var(--sp-text-muted)]">
                {x.description || x.reference || '—'}
              </p>
            </div>
          )}
        />
      </div>
    </div>
  );
}
