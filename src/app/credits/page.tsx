'use client';

import Image from 'next/image';
import { useLangStore } from '@/lib/lang';
import '@/components/v2/theme.css';
import { V2SiteHeader } from '@/components/v2/SiteHeader';
import { V2SiteFooter } from '@/components/v2/SiteFooter';
import { IMAGE_CREDITS } from '@/data/imageCredits';

/* Public image credits — rendered from the same data as docs/IMAGE_CREDITS.md. */

export default function CreditsPage() {
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';

  return (
    <div className="v2 min-h-dvh bg-[var(--sp-bg)]" dir={isRTL ? 'rtl' : 'ltr'}>
      <V2SiteHeader />

      <main className="v2-container max-w-3xl pb-16 pt-8 md:pt-10">
        <h1 className="text-balance text-[28px] font-extrabold text-[#0B1B33] md:text-[36px]">
          {isRTL ? 'حقوق الصور' : 'Image credits'}
        </h1>
        <p className="mt-2 text-pretty text-[15px] text-[var(--sp-text-muted)]">
          {isRTL
            ? 'صور الوجهات مستخدمة بموجب تراخيصها الأصلية مع نسبها لأصحابها.'
            : 'Destination photos are used under their original licenses with attribution.'}
        </p>

        <div className="mt-8 grid gap-4">
          {IMAGE_CREDITS.map((c) => (
            <article key={c.slug} className="flex gap-4 rounded-2xl border border-[var(--sp-line)] bg-[var(--sp-card)] p-4">
              <span className="relative block h-24 w-32 shrink-0 overflow-hidden rounded-xl bg-[#0A1E3C]">
                <Image src={c.localPath} alt={isRTL ? c.cityAr : c.cityEn} fill sizes="128px" className="object-cover" />
              </span>
              <div className="min-w-0">
                <p className="text-[16px] font-extrabold text-[#0B1B33]">
                  {isRTL ? c.cityAr : c.cityEn}
                </p>
                <p className="mt-1 truncate text-[13.5px] text-[var(--sp-text-muted)]" dir="ltr" style={{ textAlign: 'start' }}>
                  {c.file}
                </p>
                <p className="mt-1 text-[13.5px] text-[var(--sp-text-muted)]">
                  {isRTL ? 'المصور' : 'Author'}: <strong className="text-[#0B1B33]">{c.author}</strong>
                  {' · '}{c.license}
                </p>
                <a
                  href={c.sourceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-1.5 inline-block text-[13.5px] font-bold text-[#1D5BD8] hover:underline"
                  dir="ltr"
                >
                  {isRTL ? 'المصدر' : 'Source'} ↗
                </a>
              </div>
            </article>
          ))}
        </div>
      </main>

      <V2SiteFooter />
    </div>
  );
}
