'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { motion } from 'framer-motion';
import { User, Phone, Mail, Lock, Loader2, CheckCircle2 } from 'lucide-react';
import { useLangStore } from '@/lib/lang';
import '@/components/v2/theme.css';
import { V2SiteHeader } from '@/components/v2/SiteHeader';
import { V2SiteFooter } from '@/components/v2/SiteFooter';
import { V2Field, V2Input } from '@/components/v2/Field';
import { V2Button } from '@/components/v2/Button';
import { V2Skeleton } from '@/components/v2/ui';

/* V2 profile — same GET/PUT /api/profile flows as V1. */

export default function ProfilePage() {
  const { status } = useSession();
  const router = useRouter();
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '' });
  const [pw, setPw] = useState({ current: '', newPass: '', confirm: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
    if (status === 'loading') return;
    (async () => {
      try {
        const res = await fetch('/api/profile');
        if (res.ok) {
          const data = await res.json();
          setForm({ name: data.name || '', phone: data.phone || '', email: data.email || '' });
        }
      } catch { /* keep blank */ } finally { setLoading(false); }
    })();
  }, [status, router]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, phone: form.phone }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        const err = await res.json();
        setError(err.error || 'Error saving profile');
      }
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pw.newPass !== pw.confirm) {
      setError(isRTL ? 'كلمة المرور الجديدة غير متطابقة' : 'New passwords do not match');
      return;
    }
    if (pw.newPass.length < 6) {
      setError(isRTL ? 'كلمة المرور ٦ أحرف على الأقل' : 'Password must be 6+ characters');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name, phone: form.phone,
          currentPassword: pw.current, newPassword: pw.newPass,
        }),
      });
      if (res.ok) {
        setPw({ current: '', newPass: '', confirm: '' });
        setChangingPw(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        const err = await res.json();
        setError(err.error || 'Error changing password');
      }
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="v2 min-h-dvh bg-[#F6F8FC]" dir={isRTL ? 'rtl' : 'ltr'}>
      <V2SiteHeader />

      <main className="v2-container max-w-2xl pb-16 pt-8 md:pt-10">
        <h1 className="text-balance text-[28px] font-extrabold text-[#0B1B33] md:text-[34px]">{t('v2.profileTitle')}</h1>

        {loading ? (
          <div className="mt-6 grid gap-4" role="status">
            <V2Skeleton className="h-64 rounded-2xl" />
            <V2Skeleton className="h-48 rounded-2xl" />
          </div>
        ) : (
          <div className="mt-6 grid gap-5">
            {saved && (
              <p role="status" className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[14px] font-semibold text-emerald-700">
                <CheckCircle2 className="size-5" /> {t('v2.savedOk')}
              </p>
            )}
            {error && (
              <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[14px] font-semibold text-red-600">
                {error}
              </motion.p>
            )}

            <form onSubmit={saveProfile} className="v2-card p-6 md:p-7">
              <p className="flex items-center gap-2 text-[16px] font-extrabold text-[#0B1B33]">
                <User className="size-5 text-[#1D5BD8]" /> {isRTL ? 'البيانات الأساسية' : 'Personal info'}
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <V2Field label={t('auth.fullName')}>
                  <V2Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" />
                </V2Field>
                <V2Field label={isRTL ? 'رقم الهاتف' : 'Phone'}>
                  <V2Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} dir="ltr" autoComplete="tel" className="tabular-nums" />
                </V2Field>
              </div>
              <V2Field label={t('auth.email')}>
                <span className="relative block">
                  <Mail className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-[#9AA8BD]" />
                  <V2Input value={form.email} disabled dir="ltr" aria-label={t('auth.email')} className="ps-11 opacity-70" />
                </span>
              </V2Field>
              <V2Button type="submit" disabled={saving} className="mt-5">
                {saving && <Loader2 className="size-5 animate-spin" />} {t('v2.saveChanges')}
              </V2Button>
            </form>

            <div className="v2-card p-6 md:p-7">
              <button onClick={() => setChangingPw(!changingPw)} aria-expanded={changingPw} className="flex w-full items-center gap-2 text-[16px] font-extrabold text-[#0B1B33]">
                <Lock className="size-5 text-[#1D5BD8]" /> {t('v2.changePassword')}
              </button>
              {changingPw && (
                <form onSubmit={changePassword} className="mt-4 grid gap-4">
                  <V2Field label={t('v2.currentPw')}>
                    <V2Input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" />
                  </V2Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <V2Field label={t('v2.newPw')}>
                      <V2Input type="password" value={pw.newPass} onChange={(e) => setPw({ ...pw, newPass: e.target.value })} autoComplete="new-password" />
                    </V2Field>
                    <V2Field label={t('v2.confirmPw')}>
                      <V2Input type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" />
                    </V2Field>
                  </div>
                  <V2Button type="submit" disabled={saving}>
                    {saving && <Loader2 className="size-5 animate-spin" />} {t('v2.changePassword')}
                  </V2Button>
                </form>
              )}
              {!changingPw && (
                <p className="mt-2 flex items-center gap-2 text-[13.5px] text-[#5B6B84]">
                  <Phone className="size-4" /> ••••••
                </p>
              )}
            </div>
          </div>
        )}
      </main>

      <V2SiteFooter />
    </div>
  );
}
