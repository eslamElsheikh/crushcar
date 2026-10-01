'use client';

import { Suspense, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react';
import { useLangStore } from '@/lib/lang';
import '@/components/v2/theme.css';
import { V2AuthShell } from '@/components/v2/AuthShell';
import { V2Field, V2Input } from '@/components/v2/Field';
import { V2Button } from '@/components/v2/Button';

/* V2 login — same credentials flow + role redirects as V1, new interface. */

const DEMO = [
  { email: 'superadmin@crushcar.com', password: 'super123', tone: 'red' },
  { email: 'admin@cairoexpress.com', password: 'admin123', tone: 'blue' },
  { email: 'user@example.com', password: 'user123', tone: 'green' },
] as const;

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const registered = params.get('registered') === 'true';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const t = useLangStore((s) => s.t);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await signIn('credentials', { email, password, redirect: false });
    setLoading(false);

    if (res?.error) {
      setError('Invalid credentials');
      return;
    }

    const sessionRes = await fetch('/api/auth/session');
    const session = await sessionRes.json();

    let redirectUrl = '/trips';
    if (session?.user?.role === 'SUPER_ADMIN') {
      redirectUrl = '/admin';
    } else if (session?.user?.role === 'COMPANY_ADMIN') {
      // Business rule: every company uses /company. Only SUPER_ADMIN operates /admin.
      redirectUrl = '/company/dashboard';
    }

    router.push(redirectUrl);
    router.refresh();
  }

  return (
    <V2AuthShell
      title={t('auth.welcome')}
      sub={t('auth.signInAccount')}
      sideTitle={t('v2.heroTitleA') + ' ' + t('v2.heroTitleB')}
      sideSub={t('v2.heroSubtitle')}
    >
      {registered && (
        <p role="status" className="mb-5 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[14px] font-semibold text-emerald-700">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" /> {t('auth.registeredOk')}
        </p>
      )}

      <form onSubmit={handleSubmit} className="grid gap-4">
        <V2Field label={t('auth.email')}>
          <V2Input
            type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com" required dir="ltr" autoComplete="email"
          />
        </V2Field>

        <V2Field label={t('auth.password')}>
          <span className="relative block">
            <V2Input
              type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••" required dir="ltr" autoComplete="current-password" className="pe-12"
            />
            <button
              type="button" onClick={() => setShowPw(!showPw)}
              aria-label={showPw ? 'Hide password' : 'Show password'}
              className="absolute end-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-[#9AA8BD] hover:text-[#0B1B33]"
            >
              {showPw ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
            </button>
          </span>
        </V2Field>

        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[14px] font-semibold text-red-600"
          >
            {error}
          </motion.p>
        )}

        <V2Button type="submit" size="lg" disabled={loading} className="w-full">
          {loading && <Loader2 className="size-5 animate-spin" />}
          {t('auth.signIn')}
        </V2Button>
      </form>

      <p className="mt-6 text-center text-[14.5px] text-[#5B6B84]">
        {t('auth.noAccount')}{' '}
        <Link href="/register" className="font-bold text-[#1D5BD8] hover:underline">
          {t('auth.createOne')}
        </Link>
      </p>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-[#F6F8FC] p-4">
        <p className="text-center text-[12.5px] font-bold text-[#5B6B84]">{t('auth.demoAccounts')}</p>
        <div className="mt-2.5 grid gap-2">
          {DEMO.map((d) => (
            <button
              key={d.email} type="button"
              onClick={() => { setEmail(d.email); setPassword(d.password); }}
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-start font-mono text-[12.5px] tabular-nums text-[#0B1B33] hover:border-[#1D5BD8]/40"
              dir="ltr"
            >
              {d.email}
            </button>
          ))}
        </div>
      </div>
    </V2AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
