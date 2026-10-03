'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { V2Logo } from '@/components/v2/Logo';
import { V2Button } from '@/components/v2/Button';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled app error:', error);
  }, [error]);

  return (
    <div className="v2 flex min-h-screen flex-col items-center justify-center bg-[var(--sp-inset)] px-4 text-center">
      <div className="mb-6">
        <V2Logo height={52} />
      </div>
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 shadow-sm border border-rose-100">
        <AlertTriangle className="size-7" />
      </div>
      <h1 className="text-3xl font-black text-[#0B1B33]">حدث خطأ غير متوقع</h1>
      <p className="mt-2 text-sm font-semibold text-slate-500 max-w-md">
        نأسف للإزعاج، واجه النظام مشكلة أثناء تحميل هذه الصفحة. يمكنك إعادة المحاولة.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <V2Button onClick={() => reset()} variant="primary" size="md" className="gap-2">
          <RotateCcw className="size-4" />
          إعادة المحاولة • Try Again
        </V2Button>
        <Link href="/">
          <V2Button variant="dark" size="md">
            الرئيسية • Home
          </V2Button>
        </Link>
      </div>
    </div>
  );
}
