'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Loader2, CheckCircle2, XCircle, MailCheck, ArrowRight, RefreshCw } from 'lucide-react';
import { useLangStore } from '@/lib/lang';
import { V2AuthShell } from '@/components/v2/AuthShell';
import { V2Button } from '@/components/v2/Button';

type VerifyState = 'loading' | 'success' | 'error';

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, setState] = useState<VerifyState>('loading');
  const [message, setMessage] = useState('');
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setState('error');
      setMessage(isRTL ? 'رابط التفعيل غير صالح أو مفقود' : 'Verification token is missing or invalid');
      return;
    }

    fetch(`/api/auth/verify-email?token=${token}`)
      .then(async (res) => {
        const data = await res.json();
        if (res.ok && data.success) {
          setState('success');
          setMessage(isRTL ? 'تم تأكيد بريدك الإلكتروني بنجاح! يمكنك الآن تسجيل الدخول.' : 'Your email has been verified successfully! You can now sign in.');
        } else {
          setState('error');
          setMessage(data.error || (isRTL ? 'رابط التفعيل منتهي الصلاحية أو غير صحيح' : 'Verification link is expired or invalid'));
        }
      })
      .catch(() => {
        setState('error');
        setMessage(isRTL ? 'حدث خطأ أثناء التحقق من الرابط' : 'An error occurred while verifying your email');
      });
  }, [searchParams, isRTL]);

  return (
    <div className="space-y-6 text-center">
      {state === 'loading' && (
        <div className="py-10 space-y-4">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-blue-50 text-[#0066FF]">
            <Loader2 className="size-7 animate-spin" />
          </div>
          <p className="text-base font-bold text-[#0B1B33]">
            {isRTL ? 'جاري التحقق من بريدك الإلكتروني...' : 'Verifying your email address...'}
          </p>
          <p className="text-xs text-slate-500">
            {isRTL ? 'يرجى الانتظار لحظة واحدة' : 'Please wait a moment'}
          </p>
        </div>
      )}

      {state === 'success' && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="py-6 space-y-5">
          <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 shadow-sm border border-emerald-100">
            <CheckCircle2 className="size-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-black text-[#0B1B33]">
              {isRTL ? 'تم تفعيل الحساب بنجاح' : 'Email Verified Successfully'}
            </h2>
            <p className="text-sm font-semibold text-slate-500">
              {message}
            </p>
          </div>
          <Link href="/login" className="block w-full">
            <V2Button variant="primary" size="lg" className="w-full">
              {t('auth.signIn')}
            </V2Button>
          </Link>
        </motion.div>
      )}

      {state === 'error' && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="py-6 space-y-5">
          <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 shadow-sm border border-rose-100">
            <XCircle className="size-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-black text-[#0B1B33]">
              {isRTL ? 'تعذر تأكيد البريد' : 'Verification Failed'}
            </h2>
            <p className="text-sm font-semibold text-rose-600">
              {message}
            </p>
          </div>
          <div className="space-y-3 pt-2">
            <Link href="/login" className="block w-full">
              <V2Button variant="primary" size="lg" className="w-full">
                {t('auth.signIn')}
              </V2Button>
            </Link>
            <Link
              href="/"
              className="inline-block text-xs font-bold text-slate-500 hover:text-slate-800 transition"
            >
              {isRTL ? 'العودة للصفحة الرئيسية' : 'Return to Home'}
            </Link>
          </div>
        </motion.div>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';

  return (
    <V2AuthShell
      title={isRTL ? 'تأكيد البريد الإلكتروني' : 'Email Verification'}
      sub={isRTL ? 'سافرو ترافيل — رحلاتك بكل سهولة' : 'Safro Travel — Journey made simple'}
      sideTitle={isRTL ? 'أهلاً بك في سافرو' : 'Welcome to Safro'}
      sideSub={isRTL ? 'المنصة الأسرع لحجز تذاكر الحافلات بين جميع المحافظات' : 'The premier intercity coach booking platform'}
    >
      <Suspense
        fallback={
          <div className="flex justify-center py-12">
            <Loader2 className="size-8 animate-spin text-[#0066FF]" />
          </div>
        }
      >
        <VerifyEmailContent />
      </Suspense>
    </V2AuthShell>
  );
}
