'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowRight, Loader2, Power } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useLangStore } from '@/lib/lang';
import { V2PageHeader } from '@/components/v2/admin';
import { V2Field, V2Select, V2Input } from '@/components/v2/Field';
import { V2Button } from '@/components/v2/Button';
import { V2Skeleton } from '@/components/v2/ui';

/* V2 company edit — same GET/PATCH as V1. */

export default function EditCompanyPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';

  const [form, setForm] = useState({
    name: '',
    subdomain: '',
    creditLimit: 0,
    paymentMode: 'PREPAID',
    billingCycle: 'MONTHLY',
    isActive: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/admin/companies/${id}`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setForm({
            name: data.name || '',
            subdomain: data.subdomain || '',
            creditLimit: data.creditLimit || 0,
            paymentMode: data.paymentMode || 'PREPAID',
            billingCycle: data.billingCycle || 'MONTHLY',
            isActive: data.isActive,
          });
        }
      } catch { /* keep blank */ } finally { setLoading(false); }
    })();
  }, [id]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/companies/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });
      if (res.ok) {
        toast.success(t('common.success'));
        router.push('/admin/credit-report');
      } else {
        toast.error((await res.json()).error || t('common.error'));
      }
    } catch {
      toast.error(t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/admin/credit-report" className="inline-flex items-center gap-1.5 text-[14px] font-bold text-[#5B6B84] hover:text-[#0B1B33]">
        <ArrowRight className="size-4 rotate-180 v2-flip-rtl" /> {t('company.creditReport')}
      </Link>
      <div className="mt-3">
        <V2PageHeader title={t('company.editCompany')} />
      </div>

      {loading ? (
        <div className="mt-5 grid gap-3" role="status">
          <V2Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : (
        <form onSubmit={save} className="mt-5 rounded-2xl border border-[#E6EBF2] bg-white p-5 md:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <V2Field label={isRTL ? 'اسم الشركة' : 'Company name'}>
              <V2Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </V2Field>
            <V2Field label="Subdomain">
              <V2Input value={form.subdomain} onChange={(e) => setForm({ ...form, subdomain: e.target.value })} dir="ltr" />
            </V2Field>
            <V2Field label={t('company.creditLimit')}>
              <V2Input type="number" min="0" value={form.creditLimit} onChange={(e) => setForm({ ...form, creditLimit: parseFloat(e.target.value) || 0 })} dir="ltr" className="tabular-nums" />
            </V2Field>
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
            <div className="grid gap-2">
              <span className="px-1 text-[13px] font-bold text-[#0B1B33]">{t('company.isActive')}</span>
              <button
                type="button"
                role="switch"
                aria-checked={form.isActive}
                onClick={() => setForm({ ...form, isActive: !form.isActive })}
                className={cn(
                  'flex min-h-[52px] items-center gap-2.5 rounded-xl border px-4 text-[14.5px] font-bold transition lg:min-h-[60px]',
                  form.isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-[#5B6B84]'
                )}
              >
                <Power className="size-5" />
                {form.isActive ? t('company.isActive') : t('company.isInactive')}
              </button>
            </div>
          </div>
          <V2Button type="submit" size="lg" disabled={saving} className="mt-5 w-full sm:w-auto">
            {saving && <Loader2 className="size-5 animate-spin" />} {t('common.save')}
          </V2Button>
        </form>
      )}
    </div>
  );
}
