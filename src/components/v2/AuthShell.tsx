'use client';

import { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Globe } from 'lucide-react';
import { useLangStore } from '@/lib/lang';
import { V2Logo } from './Logo';

/** Split-screen auth shell: form + Egypt travel visual. Logical props throughout. */
export function V2AuthShell({
  title,
  sub,
  children,
  sideTitle,
  sideSub,
}: {
  title: string;
  sub: string;
  children: ReactNode;
  sideTitle: string;
  sideSub: string;
}) {
  const lang = useLangStore((s) => s.lang);
  const setLang = useLangStore((s) => s.setLang);
  const isRTL = lang === 'ar';

  return (
    <div className="v2 min-h-dvh bg-white" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="grid min-h-dvh lg:grid-cols-[1fr_1fr]">
        <div className="flex flex-col px-5 py-6 sm:px-10">
          <div className="flex items-center justify-between">
            <Link href="/" aria-label="Safro">
              <V2Logo height={40} />
            </Link>
            <button
              onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
              className="flex items-center gap-1.5 rounded-full px-3.5 py-2.5 text-[14px] font-semibold text-[#0B1B33]/75 hover:bg-slate-100"
            >
              <Globe className="size-4" /> {lang === 'ar' ? 'العربية' : 'EN'}
            </button>
          </div>

          <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center py-10">
            <h1 className="text-balance text-[28px] font-extrabold text-[#0B1B33] md:text-[32px]">{title}</h1>
            <p className="mt-2 text-pretty text-[15px] text-[#5B6B84]">{sub}</p>
            <div className="mt-7">{children}</div>
          </div>
        </div>

        <div className="relative hidden overflow-hidden lg:block">
          <Image src="/v2/hero-egypt.png" alt="" fill priority sizes="50vw" className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B1B33]/85 via-[#0B1B33]/25 to-[#0B1B33]/10" />
          <div className="absolute inset-x-0 bottom-0 p-10">
            <p className="max-w-[420px] text-balance text-[24px] font-extrabold leading-snug text-white">{sideTitle}</p>
            <p className="mt-2 max-w-[420px] text-pretty text-[15px] text-white/80">{sideSub}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
