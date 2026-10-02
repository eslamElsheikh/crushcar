'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Linkedin, Twitter, Instagram, Youtube, ArrowRight, Globe } from 'lucide-react';
import { useLangStore } from '@/lib/lang';
import { V2Logo } from './Logo';

export function V2SiteFooter() {
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  return (
    <footer className="bg-[#0A1628] text-white">
      <div className="v2-container grid gap-10 py-14 md:grid-cols-[1.2fr_1fr_1fr_1.3fr]">
        <div>
          <Link href="/" aria-label="Safro">
            <V2Logo height={40} />
          </Link>
          <p className="mt-4 max-w-[260px] text-pretty text-[14.5px] leading-relaxed text-white/60">{t('v2.footerTag')}</p>
          <div className="mt-5 flex gap-4 text-white/70">
            <a aria-label="LinkedIn" href="/" className="hover:text-white"><Linkedin className="size-5" /></a>
            <a aria-label="X" href="/" className="hover:text-white"><Twitter className="size-5" /></a>
            <a aria-label="Instagram" href="/" className="hover:text-white"><Instagram className="size-5" /></a>
            <a aria-label="YouTube" href="/" className="hover:text-white"><Youtube className="size-5" /></a>
          </div>
        </div>
        <nav aria-label={t('v2.quickLinks')}>
          <p className="text-[14.5px] font-bold text-white/90">{t('v2.quickLinks')}</p>
          <ul className="mt-4 grid gap-3 text-[14.5px] text-white/60">
            <li><Link className="hover:text-white" href="/#destinations">{t('v2.explore')}</Link></li>
            <li><Link className="hover:text-white" href="/trips">{t('v2.trips')}</Link></li>
            <li><Link className="hover:text-white" href="/destinations">{t('v2.destinations')}</Link></li>
            <li><Link className="hover:text-white" href="/#b2b">{t('v2.forBusiness')}</Link></li>
          </ul>
        </nav>
        <nav aria-label={t('v2.support')}>
          <p className="text-[14.5px] font-bold text-white/90">{t('v2.support')}</p>
          <ul className="mt-4 grid gap-3 text-[14.5px] text-white/60">
            <li><Link className="hover:text-white" href="/faq">Help Center</Link></li>
            <li><Link className="hover:text-white" href="/bookings">{t('v2.myBookings')}</Link></li>
            <li><Link className="hover:text-white" href="/profile">{t('v2.account')}</Link></li>
          </ul>
        </nav>
        <div>
          <p className="text-[14.5px] font-bold text-white/90">{t('v2.stayLoop')}</p>
          <p className="mt-2.5 text-pretty text-[14px] text-white/55">{t('v2.staySub')}</p>
          <form
            className="mt-4 flex items-center gap-2"
            onSubmit={(e) => { e.preventDefault(); if (email.trim()) setSent(true); }}
          >
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('v2.emailPh')}
              type="email"
              aria-label={t('v2.emailPh')}
              className="min-h-[48px] w-full rounded-full border border-white/15 bg-white/5 px-4 text-[14.5px] text-white placeholder:text-white/40 focus:border-[#1D5BD8] focus:outline-none"
            />
            <button aria-label="Subscribe" className="grid size-12 shrink-0 place-items-center rounded-full bg-[#1D5BD8] hover:bg-[#1447ad]">
              <ArrowRight className="size-5 v2-flip-rtl" />
            </button>
          </form>
          {sent && <p className="mt-2 text-[13px] font-semibold text-emerald-400">✓</p>}
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="v2-container flex items-center justify-between py-5 text-[13px] text-white/45">
          <span>{t('v2.rights')}</span>
          <span className="flex items-center gap-1.5"><Globe className="size-4" /> {lang === 'ar' ? 'العربية' : 'English'}</span>
        </div>
      </div>
    </footer>
  );
}
