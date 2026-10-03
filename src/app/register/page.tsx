'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Loader2, Building2 } from 'lucide-react';
import { useLangStore } from '@/lib/lang';
import '@/components/v2/theme.css';
import { V2AuthShell } from '@/components/v2/AuthShell';
import { V2Field, V2Input } from '@/components/v2/Field';
import { V2Button } from '@/components/v2/Button';

/* V2 register — same POST /api/register flow as V1, new interface. */

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [regEnabled, setRegEnabled] = useState(true);
  const [error, setError] = useState('');
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';

  useEffect(() => {
    fetch('/api/settings/individual-registration')
      .then((r) => r.json())
      .then((d) => {
        if (d && d.enabled === false) setRegEnabled(false);
      })
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t('common.error'));
        setLoading(false);
        return;
      }

      router.push('/login?registered=true');
    } catch {
      setError(t('common.error'));
      setLoading(false);
    }
  }

  return (
    <V2AuthShell
      title={t('auth.createAccount')}
      sub={t('auth.joinToday')}
      sideTitle={t('v2.heroTitleA')}
      sideSub={t('v2.heroSubtitle')}
    >
      <form onSubmit={handleSubmit} className="grid gap-4">
        <V2Field label={t('auth.fullName')}>
          <V2Input
            type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Ahmed Hassan" required autoComplete="name"
          />
        </V2Field>

        <V2Field label={t('auth.email')}>
          <V2Input
            type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="you@example.com" required dir="ltr" autoComplete="email"
          />
        </V2Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <V2Field label={isRTL ? 'رقم الهاتف' : 'Phone Number'}>
            <V2Input
              type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder={isRTL ? '01xxxxxxxxx' : '+20 1xx xxx xxxx'} dir="ltr" autoComplete="tel"
              className="tabular-nums"
            />
          </V2Field>

          <V2Field label={t('auth.password')}>
            <span className="relative block">
              <V2Input
                type={showPw ? 'text' : 'password'} value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="6+ characters" minLength={6} required autoComplete="new-password" className="pe-12"
              />
              <button
                type="button" onClick={() => setShowPw(!showPw)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
                className="absolute end-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-[#9AA8BD] hover:text-[#0B1B33]"
              >
                {showPw ? <EyeOff className="size-5" /> : <Eye size={18} />}
              </button>
            </span>
          </V2Field>
        </div>

        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[14px] font-semibold text-red-600"
          >
            {error}
          </motion.p>
        )}

        {!regEnabled && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13.5px] font-bold text-amber-800">
            {isRTL
              ? 'تنبيه: التسجيل مغلق للأفراد حالياً. يمكنك استخدام خيار تسجيل الشركات بالأسفل.'
              : 'Notice: Individual registration is currently closed. You may register as a company below.'}
          </div>
        )}

        <V2Button type="submit" size="lg" disabled={loading || !regEnabled} className="w-full">
          {loading && <Loader2 className="size-5 animate-spin" />}
          {t('auth.createAccount')}
        </V2Button>
      </form>

      <p className="mt-6 text-center text-[14.5px] text-[var(--sp-text-muted)]">
        {t('auth.alreadyAccount')}{' '}
        <Link href="/login" className="font-bold text-[#1D5BD8] hover:underline">
          {t('auth.signIn')}
        </Link>
      </p>

      <Link
        href="/register/company"
        className="mt-4 flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-[var(--sp-inset)] px-4 py-3.5 text-[14.5px] font-bold text-[#0B1B33] hover:border-[#1D5BD8]/40"
      >
        <Building2 className="size-5 text-[#1D5BD8]" />
        {isRTL ? 'عندك شركة؟ سجل شركتك' : 'Have a company? Register it'}
      </Link>
    </V2AuthShell>
  );
}
