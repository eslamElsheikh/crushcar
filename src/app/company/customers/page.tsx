'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Search, Pencil, Trash2, X, Loader2, Users } from 'lucide-react';
import { useLangStore } from '@/lib/lang';
import { V2Field, V2Input } from '@/components/v2/Field';
import { V2Button } from '@/components/v2/Button';
import { V2StatusBadge, V2Skeleton, V2EmptyState } from '@/components/v2/ui';

/* V2 company customers — same CRUD endpoints as V1. */

export default function CompanyCustomersPage() {
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';

  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [modal, setModal] = useState<null | { id?: string; name: string; email: string; phone: string; notes: string }>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/company/customers?take=100${q ? `&q=${encodeURIComponent(q)}` : ''}`);
      if (res.ok) {
        const data = await res.json();
        setCustomers(data.data || []);
      }
    } catch { /* keep list */ } finally { setLoading(false); }
  }, [q]);

  useEffect(() => {
    const timer = setTimeout(load, q ? 350 : 0);
    return () => clearTimeout(timer);
  }, [load, q]);

  async function save() {
    if (!modal || !modal.name.trim()) return;
    setSaving(true);
    try {
      const isEdit = !!modal.id;
      const url = isEdit ? `/api/company/customers/${modal.id}` : '/api/company/customers';
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modal.name, email: modal.email, phone: modal.phone, notes: modal.notes }),
      });
      if (res.ok) {
        setModal(null);
        load();
      }
    } catch { /* keep modal */ } finally { setSaving(false); }
  }

  async function remove(id: string) {
    setDeleting(id);
    try {
      const res = await fetch(`/api/company/customers/${id}`, { method: 'DELETE' });
      if (res.ok) setCustomers((prev) => prev.filter((c) => c.id !== id));
    } catch { /* keep row */ } finally { setDeleting(null); }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-balance text-[26px] font-extrabold text-[#0B1B33] md:text-[32px]">{t('company.customers')}</h1>
          <p className="mt-1 text-[14.5px] tabular-nums text-[var(--sp-text-muted)]">
            {customers.length} {isRTL ? 'عميل' : 'customers'}
          </p>
        </div>
        <V2Button onClick={() => setModal({ name: '', email: '', phone: '', notes: '' })}>
          <Plus className="size-5" /> {t('company.addCustomer')}
        </V2Button>
      </div>

      <span className="relative mt-5 block max-w-sm">
        <Search className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-[#9AA8BD]" />
        <V2Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('bookings.search')} aria-label={t('bookings.search')} className="ps-11" />
      </span>

      <div className="mt-4">
        {loading ? (
          <div className="grid gap-3" role="status">
            <V2Skeleton className="h-24 rounded-2xl" />
            <V2Skeleton className="h-24 rounded-2xl" />
          </div>
        ) : customers.length === 0 ? (
          <V2EmptyState
            title={t('company.noCustomers')}
            actionLabel={t('company.addCustomer')}
            onAction={() => setModal({ name: '', email: '', phone: '', notes: '' })}
          />
        ) : (
          <div className="grid gap-3">
            {customers.map((c: any) => (
              <div key={c.id} className="flex items-center gap-3.5 rounded-2xl border border-[var(--sp-line)] bg-[var(--sp-card)] p-5">
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#EFF4FF] text-[16px] font-extrabold text-[#1D5BD8]">
                  {(c.name || '?').slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15.5px] font-extrabold text-[#0B1B33]">{c.name}</p>
                  <p className="truncate text-[13px] tabular-nums text-[var(--sp-text-muted)]" dir="ltr" style={{ textAlign: 'start' }}>
                    {[c.email, c.phone].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {(c._count?.bookings ?? null) !== null && (
                  <V2StatusBadge tone="slate">
                    <span className="tabular-nums">{c._count.bookings}</span>&nbsp;{t('company.bookings')}
                  </V2StatusBadge>
                )}
                <span className="hidden gap-1.5 sm:flex">
                  <button
                    onClick={() => setModal({ id: c.id, name: c.name || '', email: c.email || '', phone: c.phone || '', notes: c.notes || '' })}
                    aria-label={t('company.editCustomer')}
                    className="grid size-10 place-items-center rounded-xl text-[var(--sp-text-muted)] hover:bg-slate-100 hover:text-[#0B1B33]"
                  >
                    <Pencil className="size-5" />
                  </button>
                  <button
                    onClick={() => remove(c.id)}
                    disabled={deleting === c.id}
                    aria-label={t('company.deleteCustomer')}
                    className="grid size-10 place-items-center rounded-xl text-red-500 hover:bg-red-50 disabled:opacity-50"
                  >
                    {deleting === c.id ? <Loader2 className="size-5 animate-spin" /> : <Trash2 className="size-5" />}
                  </button>
                </span>
                <span className="flex gap-1.5 sm:hidden">
                  <button
                    onClick={() => setModal({ id: c.id, name: c.name || '', email: c.email || '', phone: c.phone || '', notes: c.notes || '' })}
                    aria-label={t('company.editCustomer')}
                    className="grid size-11 place-items-center rounded-xl bg-slate-100 text-[#0B1B33]"
                  >
                    <Pencil className="size-5" />
                  </button>
                  <button
                    onClick={() => remove(c.id)}
                    disabled={deleting === c.id}
                    aria-label={t('company.deleteCustomer')}
                    className="grid size-11 place-items-center rounded-xl bg-red-50 text-red-600 disabled:opacity-50"
                  >
                    {deleting === c.id ? <Loader2 className="size-5 animate-spin" /> : <Trash2 className="size-5" />}
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {modal && (
          <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center" role="dialog" aria-modal="true" aria-label={modal.id ? t('company.editCustomer') : t('company.addCustomer')}>
            <div className="absolute inset-0 bg-[#0B1B33]/60" onClick={() => setModal(null)} />
            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} transition={{ duration: 0.2, ease: 'easeOut' }} className="relative w-full max-w-[480px] rounded-2xl bg-[var(--sp-card)] p-6">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-2 text-[18px] font-extrabold text-[#0B1B33]">
                  <Users className="size-5 text-[#1D5BD8]" /> {modal.id ? t('company.editCustomer') : t('company.addCustomer')}
                </p>
                <button onClick={() => setModal(null)} aria-label="Close" className="grid size-9 place-items-center rounded-xl text-[var(--sp-text-muted)] hover:bg-slate-100">
                  <X className="size-5" />
                </button>
              </div>
              <div className="mt-4 grid gap-3.5">
                <V2Field label={t('company.customerName')}>
                  <V2Input value={modal.name} onChange={(e) => setModal({ ...modal, name: e.target.value })} autoComplete="name" />
                </V2Field>
                <div className="grid gap-3.5 sm:grid-cols-2">
                  <V2Field label={t('company.customerEmail')}>
                    <V2Input type="email" value={modal.email} onChange={(e) => setModal({ ...modal, email: e.target.value })} dir="ltr" autoComplete="email" />
                  </V2Field>
                  <V2Field label={t('company.customerPhone')}>
                    <V2Input type="tel" value={modal.phone} onChange={(e) => setModal({ ...modal, phone: e.target.value })} dir="ltr" autoComplete="tel" className="tabular-nums" />
                  </V2Field>
                </div>
                <V2Field label={t('company.customerNotes')}>
                  <V2Input value={modal.notes} onChange={(e) => setModal({ ...modal, notes: e.target.value })} />
                </V2Field>
              </div>
              <V2Button disabled={saving || !modal.name.trim()} onClick={save} className="mt-5 w-full" size="lg">
                {saving && <Loader2 className="size-5 animate-spin" />} {t('common.save')}
              </V2Button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
