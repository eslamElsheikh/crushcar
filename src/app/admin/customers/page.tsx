'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLangStore } from '@/lib/lang';
import { V2PageHeader, V2Table, V2Pagination, V2SearchInput, V2StatCard } from '@/components/v2/admin';

/* V2 admin customers — same /api/customers list as V1. */

export default function AdminCustomers() {
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';
  const locale = isRTL ? 'ar-EG' : 'en-US';

  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  const load = useCallback(async (pageNum: number, q: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/customers?page=${pageNum}&take=20${q ? `&q=${encodeURIComponent(q)}` : ''}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setCustomers(data.data || []);
        if (data.pagination) {
          setTotal(data.pagination.total || 0);
          setPages(data.pagination.pages || 1);
          setPage(data.pagination.page || pageNum);
        }
      }
    } catch { /* keep list */ } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => load(1, search), search ? 350 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const totalBookings = customers.reduce((s, c) => s + (c.totalBookings || 0), 0);

  return (
    <div>
      <V2PageHeader title={t('nav.customers')} sub={isRTL ? `${total} عميل` : `${total} customers`} />

      <div className="mt-5 grid gap-3.5 sm:grid-cols-2">
        <V2StatCard label={isRTL ? 'إجمالي الحجوزات' : 'Total Bookings'} value={totalBookings.toLocaleString(locale)} />
        <V2StatCard
          label={isRTL ? 'متوسط الحجز' : 'Avg per Customer'}
          value={customers.length > 0 ? (totalBookings / customers.length).toFixed(1) : '0'}
        />
      </div>

      <div className="mt-4 max-w-sm">
        <V2SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder={t('bookings.search')} />
      </div>

      <div className="mt-4">
        <V2Table
          columns={[
            isRTL ? 'العميل' : 'Customer',
            isRTL ? 'الهاتف' : 'Phone',
            isRTL ? 'الحجوزات' : 'Bookings',
            isRTL ? 'الإيراد' : 'Revenue',
          ]}
          rows={customers}
          rowKey={(c) => c.id}
          loading={loading}
          emptyTitle={t('bookings.noBookings')}
          renderCell={(c, i) => {
            const cells = [
              <span key="n">
                <span className="block font-bold">{c.name}</span>
                <span className="block text-[12.5px] font-normal tabular-nums text-[var(--sp-text-muted)]" dir="ltr" style={{ textAlign: 'start' }}>{c.email}</span>
              </span>,
              <span key="p" className="tabular-nums text-[var(--sp-text-muted)]" dir="ltr" style={{ textAlign: 'start' }}>{c.phone || '—'}</span>,
              <span key="b" className="font-bold tabular-nums">{(c.totalBookings || 0).toLocaleString(locale)}</span>,
              <span key="r" className="font-extrabold tabular-nums">{Number(c.totalRevenue || 0).toLocaleString(locale)} {t('common.currency')}</span>,
            ];
            return cells[i];
          }}
          renderMobile={(c) => (
            <div>
              <p className="truncate text-[15.5px] font-extrabold text-[#0B1B33]">{c.name}</p>
              <p className="truncate text-[12.5px] tabular-nums text-[var(--sp-text-muted)]" dir="ltr" style={{ textAlign: 'start' }}>{c.email}</p>
              <p className="mt-1.5 text-[13.5px] tabular-nums text-[var(--sp-text-muted)]">
                {(c.totalBookings || 0)} · {Number(c.totalRevenue || 0).toLocaleString(locale)} {t('common.currency')}
              </p>
            </div>
          )}
        />
        <V2Pagination page={page} pages={pages} onPage={(p) => load(p, search)} />
      </div>
    </div>
  );
}
