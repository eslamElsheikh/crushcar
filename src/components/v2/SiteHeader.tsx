'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X, Globe, ChevronDown, LogOut, User } from 'lucide-react';
import { useSession, signOut } from 'next-auth/react';
import { cn } from '@/lib/utils';
import { useLangStore } from '@/lib/lang';
import { V2Logo } from './Logo';

/** V2 public header (RTL-first). `overlay` renders white text over the hero image. */
export function V2SiteHeader({ overlay = false }: { overlay?: boolean }) {
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const setLang = useLangStore((s) => s.setLang);
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);

  const role = session?.user?.role;
  const isAdmin = role === 'SUPER_ADMIN' || role === 'COMPANY_ADMIN';
  const dashHref = role === 'SUPER_ADMIN' ? '/admin' : '/company/dashboard';
  const bookingsHref = role === 'COMPANY_ADMIN' ? '/company/bookings' : '/bookings';
  const [userOpen, setUserOpen] = useState(false);
  const light = overlay && !open;
  const fullName = session?.user?.name?.trim() || t('v2.account');

  const linkCls = light ? 'text-white/85 hover:text-white' : 'text-[#0B1B33]/75 hover:text-[#0B1B33]';

  const langBtn = (
    <button
      onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
      aria-label={lang === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
      className={cn(
        'flex items-center gap-1.5 rounded-full px-3.5 py-2.5 text-[14px] font-semibold',
        light ? 'text-white/90 hover:bg-white/10' : 'text-[#0B1B33]/75 hover:bg-slate-100'
      )}
    >
      <Globe className="size-4" /> {lang === 'ar' ? 'العربية' : 'EN'}
    </button>
  );

  const accountControl = session ? (
    <div className="relative">
      <button
        onClick={() => setUserOpen(!userOpen)}
        aria-label="Account menu"
        aria-expanded={userOpen}
        className={cn(
          'flex max-w-[190px] items-center gap-2 rounded-full px-3.5 py-2.5 text-[14px] font-semibold',
          light ? 'text-white hover:bg-white/10' : 'text-[#0B1B33] hover:bg-slate-100'
        )}
      >
        <User className="size-4 shrink-0" />
        <span className="truncate">{fullName}</span>
        <ChevronDown className={cn('size-4 shrink-0 transition-transform', userOpen && 'rotate-180')} />
      </button>
      {userOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setUserOpen(false)} />
          <div className="absolute end-0 top-full z-20 mt-2 w-56 overflow-hidden rounded-2xl border border-[#E6EBF2] bg-white py-1.5 shadow-xl">
            <p className="truncate px-4 pb-1 pt-2.5 text-[13px] font-bold text-[#5B6B84]">{fullName}</p>
            <Link href={bookingsHref} onClick={() => setUserOpen(false)} className="flex items-center gap-2.5 px-4 py-3 text-[14.5px] font-medium text-[#0B1B33] hover:bg-slate-50">
              <User className="size-4" /> {t('v2.myBookings')}
            </Link>
            {isAdmin && (
              <Link href={dashHref} onClick={() => setUserOpen(false)} className="flex items-center gap-2.5 px-4 py-3 text-[14.5px] font-semibold text-[#1D5BD8] hover:bg-slate-50">
                {lang === 'ar' ? 'لوحة التحكم' : 'Dashboard'}
              </Link>
            )}
            <div className="my-1 border-t border-slate-100" />
            <button onClick={() => { setUserOpen(false); signOut({ callbackUrl: '/' }); }} className="flex w-full items-center gap-2.5 px-4 py-3 text-[14.5px] font-medium text-red-600 hover:bg-slate-50">
              <LogOut className="size-4" /> {lang === 'ar' ? 'تسجيل الخروج' : 'Sign Out'}
            </button>
          </div>
        </>
      )}
    </div>
  ) : (
    <>
      <Link href="/login" className={cn('px-2 py-2.5 text-[14.5px] font-semibold', light ? 'text-white' : 'text-[#0B1B33]')}>
        {t('v2.login')}
      </Link>
      <Link href="/register" className={cn('px-2 py-2.5 text-[14.5px] font-semibold', light ? 'text-white' : 'text-[#0B1B33]')}>
        {t('auth.createAccount')}
      </Link>
    </>
  );

  return (
    <header className={cn('inset-inline-0 top-0 z-30', overlay ? 'absolute' : 'sticky bg-white/95 backdrop-blur')}>
      {!overlay && <div className="border-b border-[#E6EBF2]" />}
      <div className="v2-container flex items-center gap-3 py-4 pt-[max(1rem,env(safe-area-inset-top))]">
        {/* Right group: logo + wordmark + nav */}
        <div className="flex shrink-0 items-center gap-8 xl:gap-10">
          <Link href="/" className="flex items-center gap-2.5" aria-label={lang === 'ar' ? 'سافرو' : 'Safro'}>
            <V2Logo height={34} />
            <span className={cn('text-[21px] font-extrabold leading-none tracking-tight', light ? 'text-white' : 'text-[#0B1B33]')}>
              {lang === 'ar' ? 'سافرو' : 'safro'}
            </span>
          </Link>
          <nav className="hidden items-center gap-7 text-[14.5px] font-semibold lg:flex" aria-label="Primary">
            <Link className={linkCls} href="/#destinations">{t('v2.explore')}</Link>
            <Link className={linkCls} href="/trips">{t('v2.trips')}</Link>
            <Link className={linkCls} href="/destinations">{t('v2.destinations')}</Link>
          </nav>
        </div>

        {/* Flexible spacer */}
        <span className="min-w-2 flex-1" aria-hidden="true" />

        {/* Actions cluster pinned to far edge: language, help, account, CTA */}
        <div className="hidden shrink-0 items-center gap-1.5 lg:flex">
          {langBtn}
          <Link href="/faq" className={cn('px-3.5 py-2.5 text-[14px] font-semibold', light ? 'text-white/90 hover:text-white' : 'text-[#0B1B33]/75 hover:bg-slate-100')}>
            {t('v2.help')}
          </Link>
          {accountControl}
          <Link href="/trips" className="v2-btn-primary ms-1 px-5 py-3 text-[14.5px]">
            {t('v2.bookTrip')}
          </Link>
        </div>

        {/* Mobile bar: CTA + hamburger */}
        <div className="flex shrink-0 items-center gap-2 lg:hidden">
          <Link href="/trips" onClick={() => setOpen(false)} className="v2-btn-primary px-4 py-2.5 text-[13.5px]">
            {t('v2.bookTrip')}
          </Link>
          <button
            className={cn(
              'grid size-11 place-items-center rounded-xl',
              light ? 'bg-white/12 text-white backdrop-blur' : 'bg-slate-100 text-[#0B1B33]'
            )}
            onClick={() => setOpen(!open)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer: nav + account + language */}
      <div className={cn('mx-4 lg:hidden', open ? 'block' : 'hidden')}>
        <div className="rounded-2xl bg-white p-3 shadow-xl">
          <nav className="grid gap-1 text-[16px] font-semibold text-[#0B1B33]" aria-label="Mobile">
            <Link className="rounded-xl px-4 py-3.5 hover:bg-slate-100" href="/#destinations" onClick={() => setOpen(false)}>{t('v2.explore')}</Link>
            <Link className="rounded-xl px-4 py-3.5 hover:bg-slate-100" href="/trips" onClick={() => setOpen(false)}>{t('v2.trips')}</Link>
            <Link className="rounded-xl px-4 py-3.5 hover:bg-slate-100" href="/destinations" onClick={() => setOpen(false)}>{t('v2.destinations')}</Link>
            <Link className="rounded-xl px-4 py-3.5 hover:bg-slate-100" href="/faq" onClick={() => setOpen(false)}>{t('v2.help')}</Link>
            {session ? (
              <>
                <Link className="rounded-xl px-4 py-3.5 hover:bg-slate-100" href={bookingsHref} onClick={() => setOpen(false)}>{t('v2.myBookings')}</Link>
                {isAdmin && (
                  <Link className="rounded-xl px-4 py-3.5 text-[#1D5BD8] hover:bg-slate-100" href={dashHref} onClick={() => setOpen(false)}>
                    {lang === 'ar' ? 'لوحة التحكم' : 'Dashboard'}
                  </Link>
                )}
                <button className="rounded-xl px-4 py-3.5 text-start text-red-600 hover:bg-slate-100" onClick={() => { setOpen(false); signOut({ callbackUrl: '/' }); }}>
                  {lang === 'ar' ? 'تسجيل الخروج' : 'Sign Out'}
                </button>
              </>
            ) : (
              <>
                <Link className="rounded-xl px-4 py-3.5 hover:bg-slate-100" href="/login" onClick={() => setOpen(false)}>{t('v2.login')}</Link>
                <Link className="rounded-xl px-4 py-3.5 hover:bg-slate-100" href="/register" onClick={() => setOpen(false)}>{t('auth.createAccount')}</Link>
              </>
            )}
          </nav>
          <div className="mt-2 border-t border-slate-100 pt-3">
            <button onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} aria-label={lang === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'} className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-3 text-[15px] font-bold text-[#0B1B33]">
              <Globe className="size-4" /> {lang === 'ar' ? 'العربية' : 'EN'}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
