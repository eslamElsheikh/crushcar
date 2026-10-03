'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useLangStore } from '@/lib/lang';
import { V2PageHeader, V2Table, V2Modal, V2SearchInput } from '@/components/v2/admin';
import { V2Field, V2Select, V2Input } from '@/components/v2/Field';
import { V2Button } from '@/components/v2/Button';
import { V2StatusBadge } from '@/components/v2/ui';

/* V2 admin users — same list/create APIs as V1. */

const roleTone = (r: string) => (r === 'SUPER_ADMIN' ? 'red' : r === 'COMPANY_ADMIN' ? 'blue' : 'slate');

export default function AdminUsers() {
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';

  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'CUSTOMER', phone: '' });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');

  const load = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setUsers(Array.isArray(data) ? data : data.data || []);
      }
    } catch { /* keep list */ } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => load(search), search ? 350 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const roleLabel = (role: string) => {
    if (role === 'COMPANY_ADMIN') return isRTL ? 'مدير شركة' : 'Company Admin';
    if (role === 'SUPER_ADMIN') return isRTL ? 'مدير النظام' : 'Super Admin';
    return isRTL ? 'عميل' : 'Customer';
  };

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSuccess('');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) {
        setUsers((prev) => [data, ...prev]);
        setSuccess(
          isRTL
            ? `تم إنشاء ${form.role === 'COMPANY_ADMIN' ? 'مدير' : 'عميل'} بنجاح!`
            : `${form.role === 'COMPANY_ADMIN' ? 'Manager' : 'Customer'} created successfully!`
        );
        setForm({ name: '', email: '', password: '', role: 'CUSTOMER', phone: '' });
        setModal(false);
      } else {
        toast.error(data.error || t('common.error'));
      }
    } catch {
      toast.error(t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <V2PageHeader
        title={t('nav.users')}
        sub={isRTL ? `${users.length} مستخدم` : `${users.length} users`}
        action={
          <V2Button onClick={() => setModal(true)}>
            <Plus className="size-5" /> {isRTL ? 'مستخدم جديد' : 'New user'}
          </V2Button>
        }
      />

      {success && (
        <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[14px] font-semibold text-emerald-700">
          {success}
        </p>
      )}

      <div className="mt-4 max-w-sm">
        <V2SearchInput value={search} onChange={setSearch} placeholder={t('bookings.search')} />
      </div>

      <div className="mt-4">
        <V2Table
          columns={[
            isRTL ? 'الاسم' : 'Name',
            isRTL ? 'الدور' : 'Role',
            isRTL ? 'الحجوزات' : 'Bookings',
            isRTL ? 'تاريخ الإنشاء' : 'Created',
          ]}
          rows={users}
          rowKey={(u) => u.id}
          loading={loading}
          emptyTitle={isRTL ? 'لا يوجد مستخدمين' : 'No users found'}
          renderCell={(u, i) => {
            const cells = [
              <span key="n" className="flex items-center gap-2.5">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#EFF4FF] text-[14px] font-extrabold text-[#1D5BD8]">
                  {(u.name || u.email || '?').slice(0, 1)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-bold">{u.name}</span>
                  <span className="block truncate text-[12.5px] font-normal tabular-nums text-[var(--sp-text-muted)]" dir="ltr" style={{ textAlign: 'start' }}>{u.email}</span>
                  {u.phone && <span className="block text-[12.5px] font-normal tabular-nums text-[var(--sp-text-muted)]" dir="ltr" style={{ textAlign: 'start' }}>{u.phone}</span>}
                </span>
              </span>,
              <V2StatusBadge key="r" tone={roleTone(u.role) as 'red' | 'blue' | 'slate'}>{roleLabel(u.role)}</V2StatusBadge>,
              <span key="b" className="tabular-nums text-[var(--sp-text-muted)]">{u.totalBookings ?? '—'}</span>,
              <span key="c" className="tabular-nums text-[var(--sp-text-muted)]">
                {u.createdAt ? new Date(u.createdAt).toLocaleDateString(isRTL ? 'ar-EG' : 'en-US', { day: 'numeric', month: 'short' }) : '—'}
              </span>,
            ];
            return cells[i];
          }}
          renderMobile={(u) => (
            <div className="flex items-center gap-2.5">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#EFF4FF] text-[15px] font-extrabold text-[#1D5BD8]">
                {(u.name || u.email || '?').slice(0, 1)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-extrabold text-[#0B1B33]">{u.name}</p>
                <p className="truncate text-[12.5px] tabular-nums text-[var(--sp-text-muted)]" dir="ltr" style={{ textAlign: 'start' }}>{u.email}</p>
              </div>
              <V2StatusBadge tone={roleTone(u.role) as 'red' | 'blue' | 'slate'}>{roleLabel(u.role)}</V2StatusBadge>
            </div>
          )}
        />
      </div>

      <V2Modal open={modal} onClose={() => setModal(false)} title={isRTL ? 'مستخدم جديد' : 'New user'}>
        <form onSubmit={create} className="grid gap-3.5">
          <V2Field label={isRTL ? 'الاسم الكامل' : 'Full Name'}>
            <V2Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoComplete="name" />
          </V2Field>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <V2Field label={t('auth.email')}>
              <V2Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required dir="ltr" autoComplete="email" />
            </V2Field>
            <V2Field label={isRTL ? 'رقم الهاتف (اختياري)' : 'Phone (optional)'}>
              <V2Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} dir="ltr" autoComplete="tel" className="tabular-nums" />
            </V2Field>
          </div>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <V2Field label={t('auth.password')}>
              <V2Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required autoComplete="new-password" />
            </V2Field>
            <V2Field label={isRTL ? 'الدور' : 'Role'}>
              <V2Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="CUSTOMER">{isRTL ? 'عميل' : 'Customer'}</option>
                <option value="COMPANY_ADMIN">{isRTL ? 'مدير شركة' : 'Company Admin'}</option>
                <option value="SUPER_ADMIN">{isRTL ? 'مدير النظام' : 'Super Admin'}</option>
              </V2Select>
            </V2Field>
          </div>
          <V2Button type="submit" size="lg" disabled={saving} className="w-full">
            {saving ? <Loader2 className="size-5 animate-spin" /> : <ShieldCheck className="size-5" />} {t('common.save')}
          </V2Button>
        </form>
      </V2Modal>
    </div>
  );
}
