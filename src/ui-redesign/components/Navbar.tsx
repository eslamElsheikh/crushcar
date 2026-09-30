'use client';
import { useState } from 'react';
import { Menu, X, Globe, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PreviewLang } from '../data/copy';
import { previewCopy } from '../data/copy';

export function Navbar({ lang, onLang }: { lang: PreviewLang; onLang: (l: PreviewLang) => void }) {
  const t = previewCopy[lang];
  const [open, setOpen] = useState(false);
  return (
    <header className="absolute inset-inline-0 top-0 z-30">
      <div className="sp-container flex items-center justify-between py-4">
        <div className="flex items-center gap-10">
          <a href="#top" className="flex items-center gap-2.5" aria-label="Safro">
            <span className="grid size-9 place-items-center rounded-xl bg-[#1D5BD8] text-[17px] font-black text-white">S</span>
            <span className="text-balance text-[21px] font-extrabold text-white">Safro</span>
          </a>
          <nav className="hidden items-center gap-7 text-[14.5px] font-semibold text-white/85 lg:flex">
            <a className="hover:text-white" href="#destinations">{t.navExplore}</a>
            <a className="hover:text-white" href="#featured">{t.navTrips}</a>
            <a className="hover:text-white" href="#destinations">{t.navDestinations}</a>
            <a className="flex items-center gap-1 hover:text-white" href="#b2b">
              {t.navBusiness} <ChevronDown className="size-4" />
            </a>
          </nav>
        </div>
        <div className="hidden items-center gap-2 lg:flex">
          <button
            onClick={() => onLang(lang === 'ar' ? 'en' : 'ar')}
            className="flex items-center gap-1.5 rounded-full px-3.5 py-2.5 text-[14px] font-semibold text-white/90 hover:bg-white/10"
          >
            <Globe className="size-4" /> {lang === 'ar' ? 'العربية' : 'EN'}
          </button>
          <a href="#featured" className="px-3 py-2.5 text-[14.5px] font-semibold text-white">{t.login}</a>
          <a href="#booking" className="sp-btn-primary px-5 py-3 text-[14.5px]">{t.bookTrip}</a>
        </div>
        <button
          className="grid size-11 place-items-center rounded-xl bg-white/12 text-white backdrop-blur lg:hidden"
          onClick={() => setOpen(!open)}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>
      <div className={cn('mx-4 lg:hidden', open ? 'block' : 'hidden')}>
        <div className="rounded-2xl bg-white p-3 shadow-xl">
          <nav className="grid gap-1 text-[16px] font-semibold text-[#0B1B33]">
            <a className="rounded-xl px-4 py-3.5 hover:bg-slate-100" href="#destinations" onClick={() => setOpen(false)}>{t.navExplore}</a>
            <a className="rounded-xl px-4 py-3.5 hover:bg-slate-100" href="#featured" onClick={() => setOpen(false)}>{t.navTrips}</a>
            <a className="rounded-xl px-4 py-3.5 hover:bg-slate-100" href="#destinations" onClick={() => setOpen(false)}>{t.navDestinations}</a>
            <a className="rounded-xl px-4 py-3.5 hover:bg-slate-100" href="#b2b" onClick={() => setOpen(false)}>{t.navBusiness}</a>
          </nav>
          <div className="mt-2 flex items-center gap-2 border-t border-slate-100 pt-3">
            <button onClick={() => onLang(lang === 'ar' ? 'en' : 'ar')} className="flex-1 rounded-xl border border-slate-200 px-3 py-3 text-[15px] font-bold">
              {lang === 'ar' ? 'العربية' : 'EN'}
            </button>
            <a href="#booking" onClick={() => setOpen(false)} className="sp-btn-primary flex-1 px-3 py-3 text-center text-[15px]">{t.bookTrip}</a>
          </div>
        </div>
      </div>
    </header>
  );
}
