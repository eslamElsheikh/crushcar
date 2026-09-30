'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X, Globe, ChevronDown, LogOut, User } from 'lucide-react';
import { useSession, signOut } from 'next-auth/react';
import { cn } from '@/lib/utils';
import { useLangStore } from '@/lib/lang';

/** V2 public header. `overlay` renders white text over the hero image. */
export function V2SiteHeader({ overlay = false }: { overlay?: boolean }) {
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const setLang = useLangStore((s) => s.setLang);
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);

  const role = session?.user?.role;
  const isAdmin = role === 'SUPER_ADMIN' || role === 'COMPANY_ADMIN';
  const dashHref = role === 'SUPER_ADMIN' ? '/admin' : '/company/dashboard';
  const [userOpen, setUserOpen] = useState(false);
  const light = overlay && !open;

  const linkCls = light ? 'text-white/85 hover:text-white' : 'text-[#0B1B33]/75 hover:text-[#0B1B33]';

  const links = (
    <>
      <Link className={linkCls} href="/#destinations">{t('v2.explore')}</Link>
      <Link className={linkCls} href="/trips">{t('v2.trips')}</Link>
      <Link className={linkCls} href="/#destinations">{t('v2.destinations')}</Link>
      <Link className={cn('flex items-center gap-1', linkCls)} href="/#b2b">
        {t('v2.forBusiness')} <ChevronDown className="size-4" />
      </Link>
    </>
  );

  return (
    <header className={cn('inset-inline-0 top-0 z-30', overlay ? 'absolute' : 'sticky bg-white/95 backdrop-blur')}>
      {!overlay && <div className="border-b border-[#E6EBF2]" />}
      <div className="v2-container flex items-center justify-between py-4">
        <div className="flex items-center gap-10">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Safro">
            <span className="grid size-9 place-items-center rounded-xl bg-[#1D5BD8] text-[17px] font-black text-white">S</span>
            <span className={cn('text-balance text-[21px] font-extrabold', light ? 'text-white' : 'text-[#0B1B33]')}>
              Safro
            </span>
          </Link>
          <nav className="hidden items-center gap-7 text-[14.5px] font-semibold lg:flex" aria-label="Primary">
            {links}
          </nav>
        </div>
        <div className="hidden items-center gap-2 lg:flex">
          <button
            onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-3.5 py-2.5 text-[14px] font-semibold',
              light ? 'text-white/90 hover:bg-white/10' : 'text-[#0B1B33]/75 hover:bg-slate-100'
            )}
          >
            <Globe className="size-4" /> {lang === 'ar' ? 'العربية' : 'EN'}
          </button>
          {session ? (
            <div className="relative">
              <button
                onClick={() => setUserOpen(!userOpen)}
                aria-label="Account menu"
                aria-expanded={userOpen}
                className={cn(
                  'flex items-center gap-2 rounded-full py-2 pe-3 ps-2 text-[14px] font-semibold',
                  light ? 'text-white hover:bg-white/10' : 'text-[#0B1B33] hover:bg-slate-100'
                )}
              >
                <span className="grid size-8 place-items-center rounded-full bg-[#1D5BD8]/15 text-[13px] font-bold text-[#1D5BD8]">
                  {session.user?.name?.[0] || 'U'}
                </span>
                {session.user?.name?.split(' ')[0]}
                <ChevronDown className={cn('size-4 transition-transform', userOpen && 'rotate-180')} />
              </button>
              {userOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setUserOpen(false)} />
                  <div className="absolute end-0 top-full z-20 mt-2 w-52 overflow-hidden rounded-2xl border border-[#E6EBF2] bg-white py-1.5 shadow-xl">
                    {isAdmin && (
                      <Link href={dashHref} onClick={() => setUserOpen(false)} className="flex items-center gap-2.5 px-4 py-3 text-[14.5px] font-semibold text-[#1D5BD8] hover:bg-slate-50">
                        Dashboard
                      </Link>
                    )}
                    <Link href="/bookings" onClick={() => setUserOpen(false)} className="flex items-center gap-2.5 px-4 py-3 text-[14.5px] font-medium text-[#0B1B33] hover:bg-slate-50">
                      <User className="size-4" /> {t('v2.myBookings')}
                    </Link>
                    <Link href="/profile" onClick={() => setUserOpen(false)} className="flex items-center gap-2.5 px-4 py-3 text-[14.5px] font-medium text-[#0B1B33] hover:bg-slate-50">
                      {t('v2.account')}
                    </Link>
                    <div className="my-1 border-t border-slate-100" />
                    <button onClick={() => { setUserOpen(false); signOut({ callbackUrl: '/' }); }} className="flex w-full items-center gap-2.5 px-4 py-3 text-[14.5px] font-medium text-red-600 hover:bg-slate-50">
                      <LogOut className="size-4" /> {lang === 'ar' ? 'خروج' : 'Sign Out'}
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <Link href="/login" className={cn('px-3 py-2.5 text-[14.5px] font-semibold', light ? 'text-white' : 'text-[#0B1B33]')}>
              {t('v2.login')}
            </Link>
          )}
          <Link href="/trips" className="v2-btn-primary px-5 py-3 text-[14.5px]">
            {t('v2.bookTrip')}
          </Link>
        </div>
        <button
          className={cn(
            'grid size-11 place-items-center rounded-xl lg:hidden',
            light ? 'bg-white/12 text-white backdrop-blur' : 'bg-slate-100 text-[#0B1B33]'
          )}
          onClick={() => setOpen(!open)}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>
      <div className={cn('mx-4 lg:hidden', open ? 'block' : 'hidden')}>
        <div className="rounded-2xl bg-white p-3 shadow-xl">
          <nav className="grid gap-1 text-[16px] font-semibold text-[#0B1B33]" aria-label="Mobile">
            <Link className="rounded-xl px-4 py-3.5 hover:bg-slate-100" href="/#destinations" onClick={() => setOpen(false)}>{t('v2.explore')}</Link>
            <Link className="rounded-xl px-4 py-3.5 hover:bg-slate-100" href="/trips" onClick={() => setOpen(false)}>{t('v2.trips')}</Link>
            <Link className="rounded-xl px-4 py-3.5 hover:bg-slate-100" href="/#destinations" onClick={() => setOpen(false)}>{t('v2.destinations')}</Link>
            <Link className="rounded-xl px-4 py-3.5 hover:bg-slate-100" href="/#b2b" onClick={() => setOpen(false)}>{t('v2.forBusiness')}</Link>
            {session ? (
              <>
                <Link className="rounded-xl px-4 py-3.5 hover:bg-slate-100" href="/bookings" onClick={() => setOpen(false)}>{t('v2.myBookings')}</Link>
                <Link className="rounded-xl px-4 py-3.5 hover:bg-slate-100" href="/profile" onClick={() => setOpen(false)}>{t('v2.account')}</Link>
                <button className="rounded-xl px-4 py-3.5 text-start text-red-600 hover:bg-slate-100" onClick={() => { setOpen(false); signOut({ callbackUrl: '/' }); }}>{lang === 'ar' ? 'خروج' : 'Sign Out'}</button>
              </>
            ) : (
              <Link className="rounded-xl px-4 py-3.5 hover:bg-slate-100" href="/login" onClick={() => setOpen(false)}>{t('v2.login')}</Link>
            )}
          </nav>
          <div className="mt-2 flex items-center gap-2 border-t border-slate-100 pt-3">
            <button onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} className="flex-1 rounded-xl border border-slate-200 px-3 py-3 text-[15px] font-bold text-[#0B1B33]">
              {lang === 'ar' ? 'العربية' : 'EN'}
            </button>
            <Link href="/trips" onClick={() => setOpen(false)} className="v2-btn-primary flex-1 px-3 py-3 text-center text-[15px]">{t('v2.bookTrip')}</Link>
          </div>
        </div>
      </div>
    </header>
  );
}
