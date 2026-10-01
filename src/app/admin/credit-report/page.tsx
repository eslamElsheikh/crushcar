'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CreditCard, Wallet, TrendingUp, Pencil } from 'lucide-react';
import { useLangStore } from '@/lib/lang';
import { V2PageHeader, V2StatCard, V2Table } from '@/components/v2/admin';
import { V2StatusBadge } from '@/components/v2/ui';

/* V2 credit report — same /api/admin/credit-report data as V1. Edit links to company edit. */

export default function AdminCreditReport() {
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';
  const locale = isRTL ? 'ar-EG' : 'en-US';
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/credit-report', { credentials: 'include' });
        if (res.ok) setCompanies((await res.json()) || []);
      } catch { /* keep empty */ } finally { setLoading(false); }
    })();
  }, []);

  const sum = (k: string) => (companies || []).reduce((s, c) => s + (Number(c[k]) || 0), 0);

  return (
    <div>
      <V2PageHeader title={t('company.creditReport')} />

      <div className="mt-5 grid gap-3.5 sm:grid-cols-3">
        <V2StatCard label={t('company.creditLimit')} value={`${sum('creditLimit').toLocaleString(locale)} EGP`} icon={<CreditCard className="size-5 text-[#1D5BD8]" />} />
        <V2StatCard label={t('company.outstanding')} value={`${sum('outstandingBalance').toLocaleString(locale)} EGP`} icon={<TrendingUp className="size-5 text-amber-600" />} />
        <V2StatCard label={t('company.walletBalance')} value={`${sum('walletBalance').toLocaleString(locale)} EGP`} icon={<Wallet className="size-5 text-emerald-600" />} />
      </div>

      <div className="mt-5">
        <V2Table
          columns={[t('company.manageCompanies'), t('company.creditLimit'), t('company.outstanding'), t('company.wallet'), '']}
          rows={companies || []}
          rowKey={(c) => c.id}
          loading={loading}
          emptyTitle={t('company.noCompanies')}
          renderCell={(c, i) => {
            const cells = [
              <span key="n">
                <span className="block font-bold">{c.name}</span>
                <span className="block text-[12.5px] font-normal text-[#5B6B84]">
                  {c.subdomain} · <V2StatusBadge tone={c.paymentMode === 'CREDIT' ? 'blue' : c.paymentMode === 'PREPAID' ? 'green' : 'slate'}>{c.paymentMode}</V2StatusBadge>
                </span>
              </span>,
              <span key="l" className="tabular-nums">{Number(c.creditLimit || 0).toLocaleString(locale)}</span>,
              <span key="o" className="font-bold tabular-nums text-amber-700">{Number(c.outstandingBalance || 0).toLocaleString(locale)}</span>,
              <span key="w" className="font-bold tabular-nums text-emerald-700">{Number(c.walletBalance || 0).toLocaleString(locale)}</span>,
              <Link key="e" href={`/admin/companies/${c.id}/edit`} aria-label={t('company.editCompany')} className="grid size-10 place-items-center rounded-xl text-[#5B6B84] hover:bg-slate-100 hover:text-[#0B1B33]">
                <Pencil className="size-5" />
              </Link>,
            ];
            return cells[i];
          }}
          renderMobile={(c) => (
            <div>
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-[15.5px] font-extrabold text-[#0B1B33]">{c.name}</p>
                <Link href={`/admin/companies/${c.id}/edit`} aria-label={t('company.editCompany')} className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-[#0B1B33]">
                  <Pencil className="size-5" />
                </Link>
              </div>
              <div className="mt-2.5 grid grid-cols-3 gap-2 text-center">
                <span className="rounded-lg bg-[#F6F8FC] px-2 py-2 text-[12px] font-bold tabular-nums">L: {Number(c.creditLimit || 0).toLocaleString(locale)}</span>
                <span className="rounded-lg bg-amber-50 px-2 py-2 text-[12px] font-bold tabular-nums text-amber-700">O: {Number(c.outstandingBalance || 0).toLocaleString(locale)}</span>
                <span className="rounded-lg bg-emerald-50 px-2 py-2 text-[12px] font-bold tabular-nums text-emerald-700">W: {Number(c.walletBalance || 0).toLocaleString(locale)}</span>
              </div>
            </div>
          )}
        />
      </div>
    </div>
  );
}
