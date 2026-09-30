'use client';
import { useState } from 'react';
import { Linkedin, Twitter, Instagram, Youtube, ArrowRight, Globe } from 'lucide-react';
import type { PreviewLang } from '../data/copy';
import { previewCopy } from '../data/copy';

export function Footer({ lang }: { lang: PreviewLang }) {
  const t = previewCopy[lang];
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  return (
    <footer className="bg-[#0A1628] text-white">
      <div className="sp-container grid gap-10 py-14 md:grid-cols-[1.2fr_1fr_1fr_1.3fr]">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-[#1D5BD8] text-[17px] font-black text-white">S</span>
            <span className="text-[21px] font-extrabold">Safro</span>
          </div>
          <p className="mt-4 max-w-[260px] text-pretty text-[14.5px] leading-relaxed text-white/60">{t.footerTag}</p>
          <div className="mt-5 flex gap-4 text-white/70">
            <a aria-label="LinkedIn" href="#top" className="hover:text-white"><Linkedin className="size-5" /></a>
            <a aria-label="X" href="#top" className="hover:text-white"><Twitter className="size-5" /></a>
            <a aria-label="Instagram" href="#top" className="hover:text-white"><Instagram className="size-5" /></a>
            <a aria-label="YouTube" href="#top" className="hover:text-white"><Youtube className="size-5" /></a>
          </div>
        </div>
        <nav aria-label={t.quickLinks}>
          <p className="text-[14.5px] font-bold text-white/90">{t.quickLinks}</p>
          <ul className="mt-4 grid gap-3 text-[14.5px] text-white/60">
            <li><a className="hover:text-white" href="#destinations">{t.navExplore}</a></li>
            <li><a className="hover:text-white" href="#featured">{t.navTrips}</a></li>
            <li><a className="hover:text-white" href="#destinations">{t.navDestinations}</a></li>
            <li><a className="hover:text-white" href="#b2b">{t.navBusiness}</a></li>
          </ul>
        </nav>
        <nav aria-label={t.support}>
          <p className="text-[14.5px] font-bold text-white/90">{t.support}</p>
          <ul className="mt-4 grid gap-3 text-[14.5px] text-white/60">
            <li><a className="hover:text-white" href="#top">Help Center</a></li>
            <li><a className="hover:text-white" href="#top">Terms</a></li>
            <li><a className="hover:text-white" href="#top">Privacy</a></li>
            <li><a className="hover:text-white" href="#top">Contact</a></li>
          </ul>
        </nav>
        <div>
          <p className="text-[14.5px] font-bold text-white/90">{t.stayLoop}</p>
          <p className="mt-2.5 text-pretty text-[14px] text-white/55">{t.staySub}</p>
          <form
            className="mt-4 flex items-center gap-2"
            onSubmit={(e) => { e.preventDefault(); if (email.trim()) setSent(true); }}
          >
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t.emailPh}
              type="email"
              aria-label={t.emailPh}
              className="min-h-[48px] w-full rounded-full border border-white/15 bg-white/5 px-4 text-[14.5px] text-white placeholder:text-white/40 focus:border-[#1D5BD8] focus:outline-none"
            />
            <button aria-label="Subscribe" className="grid size-12 shrink-0 place-items-center rounded-full bg-[#1D5BD8] hover:bg-[#1447ad]">
              <ArrowRight className="size-5 sp-flip-rtl" />
            </button>
          </form>
          {sent && <p className="mt-2 text-[13px] font-semibold text-emerald-400">✓</p>}
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="sp-container flex items-center justify-between py-5 text-[13px] text-white/45">
          <span>{t.rights}</span>
          <span className="flex items-center gap-1.5"><Globe className="size-4" /> {lang === 'ar' ? 'العربية' : 'English'}</span>
        </div>
      </div>
    </footer>
  );
}
