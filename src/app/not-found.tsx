import Link from 'next/link';
import { V2Logo } from '@/components/v2/Logo';
import { V2Button } from '@/components/v2/Button';

export default function NotFound() {
  return (
    <div className="v2 flex min-h-screen flex-col items-center justify-center bg-[var(--sp-inset)] px-4 text-center">
      <div className="mb-6">
        <V2Logo height={52} />
      </div>
      <h1 className="text-7xl font-black tracking-tight text-[#0B1B33]">404</h1>
      <p className="mt-2 text-xl font-bold text-[#0B1B33]">الصفحة غير موجودة • Page Not Found</p>
      <p className="mt-1 text-sm font-semibold text-slate-500 max-w-md">
        عذراً، الصفحة التي تبحث عنها غير متوفرة أو قد تم نقلها لمسار آخر.
      </p>
      <div className="mt-8">
        <Link href="/">
          <V2Button variant="primary" size="md">
            العودة للصفحة الرئيسية • Back to Home
          </V2Button>
        </Link>
      </div>
    </div>
  );
}
