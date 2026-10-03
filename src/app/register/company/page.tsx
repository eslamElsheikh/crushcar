'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Loader2, Building2, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLangStore } from '@/lib/lang';
import '@/components/v2/theme.css';
import { V2AuthShell } from '@/components/v2/AuthShell';
import { V2Field, V2Input } from '@/components/v2/Field';
import { V2Button } from '@/components/v2/Button';

/* V2 company register — same POST /api/register/company flow as V1, new interface. */

export default function CompanyRegisterPage() {
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';

  const [form, setForm] = useState({
    companyName: '',
    adminName: '',
    email: '',
    phone: '',
    password: '',
    notes: '',
  });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/register/company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Something went wrong');
        setLoading(false);
        return;
      }

      setSuccess(true);
    } catch {
      setError('Something went wrong');
      setLoading(false);
    }
  }

  if (success) {
    return (
      <V2AuthShell
        title={isRTL ? 'تم التسجيل بنجاح!' : 'Registration Successful!'}
        sub={isRTL ? 'تم استلام طلبك. تتم مراجعة حسابك وتفعيله من فريقنا خلال 24 ساعة.' : 'Your request has been received.'}
        sideTitle={t('v2.b2bTitle')}
        sideSub={t('v2.b2bSub')}
      >
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
          <span className="mx-auto grid size-20 place-items-center rounded-full bg-emerald-50 text-emerald-600">
            <Building2 className="size-9" />
          </span>
          <p className="mx-auto mt-5 max-w-[380px] text-pretty text-[15px] leading-relaxed text-[var(--sp-text-muted)]">
            {isRTL
              ? 'هيوصلك إيميل لما الحساب يتفعل. بعدها تقدر تسجّل الدخول وتدير حجوزات شركتك.'
              : 'You will receive an email once activated. Then you can sign in and manage your company bookings.'}
          </p>
          <Link href="/login" className="v2-btn-primary mt-7 inline-flex w-full items-center justify-center gap-2 px-6 py-3.5 text-[15px]">
            {isRTL ? 'الذهاب لتسجيل الدخول' : 'Go to Login'} <ArrowRight className="size-4 v2-flip-rtl" />
          </Link>
        </motion.div>
      </V2AuthShell>
    );
  }

  return (
    <V2AuthShell
      title={isRTL ? 'تسجيل شركة جديدة' : 'Register Your Company'}
      sub={isRTL ? 'سجل شركتك واحجز باصات ومقاعد لموظفيك وعملائك' : 'Register your company and book buses & seats for employees and clients'}
      sideTitle={t('v2.b2bTitle')}
      sideSub={t('v2.b2bSub')}
    >
      <form onSubmit={handleSubmit} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <V2Field label={isRTL ? 'اسم الشركة *' : 'Company Name *'}>
            <V2Input
              type="text" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })}
              placeholder={isRTL ? 'شركة النقل السريع' : 'Express Transport Co.'} required autoComplete="organization"
            />
          </V2Field>
          <V2Field label={isRTL ? 'اسم المدير *' : 'Admin Full Name *'}>
            <V2Input
              type="text" value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })}
              placeholder={isRTL ? 'أحمد محمد' : 'Ahmed Mohamed'} required autoComplete="name"
            />
          </V2Field>
        </div>

        <V2Field label={isRTL ? 'البريد الإلكتروني *' : 'Email *'}>
          <V2Input
            type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="admin@company.com" dir="ltr" required autoComplete="email"
          />
        </V2Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <V2Field label={isRTL ? 'رقم الهاتف' : 'Phone Number'}>
            <V2Input
              type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+20 1xx xxx xxxx" dir="ltr" autoComplete="tel" className="tabular-nums"
            />
          </V2Field>
          <V2Field label={isRTL ? 'كلمة المرور *' : 'Password *'}>
            <span className="relative block">
              <V2Input
                type={showPw ? 'text' : 'password'} value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="6+ characters" minLength={6} dir="ltr" required autoComplete="new-password" className="pe-12"
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
        </div>

        <V2Field label={isRTL ? 'ملاحظات (اختياري)' : 'Notes (Optional)'}>
          <textarea
            value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            placeholder={isRTL ? 'مثال: محتاجين حجز أسبوعي للقاهرة...' : 'e.g., Need weekly bookings to Cairo...'}
            className={cn('v2-input min-h-[96px] resize-none py-3')}
          />
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
          {loading ? <Loader2 className="size-5 animate-spin" /> : <Building2 className="size-5" />}
          {isRTL ? 'تسجيل الشركة' : 'Register Company'}
        </V2Button>
      </form>

      <p className="mt-6 text-center text-[14.5px] text-[var(--sp-text-muted)]">
        {isRTL ? 'عندك حساب بالفعل؟' : 'Already have an account?'}{' '}
        <Link href="/login" className="font-bold text-[#1D5BD8] hover:underline">
          {isRTL ? 'تسجيل الدخول' : 'Sign In'}
        </Link>
      </p>
      <p className="mt-3 text-center">
        <Link href="/register" className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[var(--sp-text-muted)] hover:text-[#0B1B33]">
          <ArrowRight className="size-4 rotate-180 v2-flip-rtl" />
          {isRTL ? 'تسجيل كعميل عادي' : 'Register as individual customer'}
        </Link>
      </p>
    </V2AuthShell>
  );
}
