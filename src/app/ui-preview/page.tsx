'use client';
import { useState } from 'react';
import '../../ui-redesign/theme.css';
import type { PreviewLang } from '@/ui-redesign/data/copy';
import { Navbar } from '@/ui-redesign/components/Navbar';
import { Hero } from '@/ui-redesign/components/Hero';
import { TrustStrip } from '@/ui-redesign/components/TrustStrip';
import { Destinations } from '@/ui-redesign/components/Destinations';
import { HowItWorks } from '@/ui-redesign/components/HowItWorks';
import { FeaturedTrips } from '@/ui-redesign/components/FeaturedTrips';
import { B2BSection } from '@/ui-redesign/components/B2BSection';
import { Footer } from '@/ui-redesign/components/Footer';

/* Isolated UI prototype — /ui-preview only. No production logic touched. */
export default function UiPreviewPage() {
  const [lang, setLang] = useState<PreviewLang>('ar');
  return (
    <div className="safro-preview min-h-dvh overflow-x-clip bg-white" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <Navbar lang={lang} onLang={setLang} />
      <main>
        <Hero lang={lang} />
        <TrustStrip lang={lang} />
        <Destinations lang={lang} />
        <HowItWorks lang={lang} />
        <FeaturedTrips lang={lang} />
        <B2BSection lang={lang} />
      </main>
      <Footer lang={lang} />
    </div>
  );
}
