'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Menu,
  X,
  Globe,
  ChevronDown,
  LogOut,
  User,
  LayoutDashboard,
  Bus,
  Ticket,
  MapPin,
  CheckCircle2,
  FileText,
  BarChart3,
  Users,
  CreditCard,
} from 'lucide-react';
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
  const bookingsHref = role === 'COMPANY_ADMIN' ? '/company/bookings' : '/bookings';
  const [userOpen, setUserOpen] = useState(false);
  const [dashSubOpen, setDashSubOpen] = useState(true);
  const [mobileDashSubOpen, setMobileDashSubOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (!overlay) return;
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [overlay]);

  const light = overlay && !open && !scrolled;
  const fullName = session?.user?.name?.trim() || t('v2.account');

  const isRTL = lang === 'ar';
  const linkCls = light ? 'text-white/85 hover:text-white' : 'text-[#0B1B33]/75 hover:text-[#0B1B33]';

  const adminLinks = [
    { href: '/admin', label: isRTL ? 'الرئيسية' : 'Overview', icon: LayoutDashboard },
    { href: '/admin/trips', label: isRTL ? 'الرحلات' : 'Trips', icon: MapPin },
    { href: '/admin/bookings', label: isRTL ? 'الحجوزات' : 'Bookings', icon: Ticket },
    { href: '/admin/buses', label: isRTL ? 'الباصات' : 'Buses', icon: Bus },
    { href: '/admin/stations', label: isRTL ? 'المحطات والوجهات' : 'Stations', icon: MapPin },
    { href: '/admin/verify', label: isRTL ? 'التحقق من الصعود' : 'Boarding Check', icon: CheckCircle2 },
    { href: '/admin/trip-requests', label: isRTL ? 'طلبات الرحلات' : 'Trip Requests', icon: FileText },
    { href: '/admin/credit-report', label: isRTL ? 'التقارير المالية' : 'Financial Reports', icon: BarChart3 },
  ];

  const companyLinks = [
    { href: '/company/dashboard', label: isRTL ? 'الرئيسية' : 'Overview', icon: LayoutDashboard },
    { href: '/company/bookings', label: isRTL ? 'الحجوزات' : 'Bookings', icon: Ticket },
    { href: '/company/charter', label: isRTL ? 'حجز شارتري' : 'Charter', icon: Bus },
    { href: '/company/trip-requests', label: isRTL ? 'طلبات الرحلات' : 'Trip Requests', icon: FileText },
    { href: '/company/customers', label: isRTL ? 'العملاء' : 'Customers', icon: Users },
    { href: '/company/credit', label: isRTL ? 'الحساب والكريدت' : 'Credit & Wallet', icon: CreditCard },
  ];

  const subLinks = role === 'SUPER_ADMIN' ? adminLinks : companyLinks;
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
        {session.user.image ? (
          <img src={session.user.image} alt="" className="size-5 shrink-0 rounded-full object-cover" />
        ) : (
          <User className="size-4 shrink-0" />
        )}
        <span className="truncate">{fullName}</span>
        <ChevronDown className={cn('size-4 shrink-0 transition-transform', userOpen && 'rotate-180')} />
      </button>
      {userOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setUserOpen(false)} />
          <div className="absolute end-0 top-full z-20 mt-2 w-64 max-h-[85vh] overflow-y-auto rounded-2xl border border-[var(--sp-line)] bg-[var(--sp-card)] py-1.5 shadow-xl">
            <p className="truncate px-4 pb-1 pt-2.5 text-[13px] font-bold text-[var(--sp-text-muted)]">{fullName}</p>
            <Link href="/profile" onClick={() => setUserOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-[14px] font-medium text-[#0B1B33] hover:bg-slate-50">
              <User className="size-4" /> {t('v2.profileTitle')}
            </Link>
            <Link href={bookingsHref} onClick={() => setUserOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-[14px] font-medium text-[#0B1B33] hover:bg-slate-50">
              <Ticket className="size-4" /> {t('v2.myBookings')}
            </Link>
            {isAdmin && (
              <div className="my-1 border-t border-slate-100 pt-1">
                <button
                  type="button"
                  onClick={() => setDashSubOpen(!dashSubOpen)}
                  className="flex w-full items-center justify-between px-4 py-2 text-[13.5px] font-bold text-[#1D5BD8] hover:bg-blue-50/50"
                >
                  <span className="flex items-center gap-2">
                    <LayoutDashboard className="size-4" />
                    {isRTL ? 'لوحة التحكم' : 'Dashboard'}
                  </span>
                  <ChevronDown className={cn('size-4 transition-transform duration-200', dashSubOpen ? 'rotate-180' : '')} />
                </button>
                {dashSubOpen && (
                  <div className="mt-1 space-y-0.5 bg-slate-50/70 px-2 py-1.5 rounded-xl mx-2">
                    {subLinks.map((item) => {
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setUserOpen(false)}
                          className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-slate-700 hover:bg-white hover:text-[#1D5BD8] hover:shadow-sm transition"
                        >
                          <Icon className="size-3.5 shrink-0 text-slate-400" />
                          <span>{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            <div className="my-1 border-t border-slate-100" />
            <button onClick={() => { setUserOpen(false); signOut({ callbackUrl: '/' }); }} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[14px] font-medium text-red-600 hover:bg-slate-50">
              <LogOut className="size-4" /> {isRTL ? 'تسجيل الخروج' : 'Sign Out'}
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
      <Link href="/register/company" className={cn('px-2 py-2.5 text-[14.5px] font-semibold', light ? 'text-white' : 'text-[#0B1B33]')}>
        {t('auth.createAccount')}
      </Link>
    </>
  );

  return (
    <header className={cn('inset-inline-0 top-0 z-30', overlay ? (scrolled ? 'sticky bg-white/95 backdrop-blur' : 'sticky') : 'sticky bg-white/95 backdrop-blur')}>
      {(!overlay || scrolled) && <div className="border-b border-[var(--sp-line)]" />}
      {/* Two logical groups: main nav (RTL start) + utility (RTL end), separated by justify-between */}
      <div className="v2-container flex items-center justify-between gap-6 py-4 pt-[max(1rem,env(safe-area-inset-top))] lg:gap-10">
        {/* Right group: logo + wordmark + nav */}
        <div className="flex shrink-0 items-center gap-8 xl:gap-10">
          <Link href="/" className="flex items-center gap-2.5" aria-label={lang === 'ar' ? 'سافروا' : 'Safro'}>
            <V2Logo height={34} />
            <span className={cn('text-[21px] font-extrabold leading-none tracking-tight', light ? 'text-white' : 'text-[#0B1B33]')}>
              {lang === 'ar' ? 'سافروا' : 'safro'}
            </span>
          </Link>
          <nav className="hidden items-center gap-7 text-[14.5px] font-semibold lg:flex" aria-label="Primary">
            <Link className={linkCls} href="/#destinations">{t('v2.explore')}</Link>
            <Link className={linkCls} href="/trips">{t('v2.trips')}</Link>
            <Link className={linkCls} href="/company/charter">{t('v2.requestBus')}</Link>
            <Link className={linkCls} href="/destinations">{t('v2.destinations')}</Link>
            <Link className={linkCls} href="/faq">{t('v2.help')}</Link>
          </nav>
        </div>

        {/* Utility group: language + account */}
        <div className="hidden shrink-0 items-center gap-1.5 lg:flex">
          {langBtn}
          {accountControl}
        </div>

        {/* Mobile bar: hamburger */}
        <div className="flex shrink-0 items-center gap-2 lg:hidden">
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
        <div className="rounded-2xl bg-[var(--sp-card)] p-3 shadow-xl">
          <nav className="grid gap-1 text-[16px] font-semibold text-[#0B1B33]" aria-label="Mobile">
            <Link className="rounded-xl px-4 py-3.5 hover:bg-slate-100" href="/#destinations" onClick={() => setOpen(false)}>{t('v2.explore')}</Link>
            <Link className="rounded-xl px-4 py-3.5 hover:bg-slate-100" href="/trips" onClick={() => setOpen(false)}>{t('v2.trips')}</Link>
            <Link className="rounded-xl px-4 py-3.5 hover:bg-slate-100" href="/company/charter" onClick={() => setOpen(false)}>{t('v2.requestBus')}</Link>
            <Link className="rounded-xl px-4 py-3.5 hover:bg-slate-100" href="/destinations" onClick={() => setOpen(false)}>{t('v2.destinations')}</Link>
            <Link className="rounded-xl px-4 py-3.5 hover:bg-slate-100" href="/faq" onClick={() => setOpen(false)}>{t('v2.help')}</Link>
            {session ? (
              <>
                <Link className="rounded-xl px-4 py-3.5 hover:bg-slate-100" href="/profile" onClick={() => setOpen(false)}>{t('v2.profileTitle')}</Link>
                <Link className="rounded-xl px-4 py-3.5 hover:bg-slate-100" href={bookingsHref} onClick={() => setOpen(false)}>{t('v2.myBookings')}</Link>
                {isAdmin && (
                  <div className="rounded-xl bg-slate-50 p-2">
                    <button
                      type="button"
                      onClick={() => setMobileDashSubOpen(!mobileDashSubOpen)}
                      className="flex w-full items-center justify-between px-2 py-2 text-start font-bold text-[#1D5BD8]"
                    >
                      <span className="flex items-center gap-2">
                        <LayoutDashboard className="size-4" />
                        {isRTL ? 'لوحة التحكم' : 'Dashboard'}
                      </span>
                      <ChevronDown className={cn('size-4 transition-transform', mobileDashSubOpen && 'rotate-180')} />
                    </button>
                    {mobileDashSubOpen && (
                      <div className="mt-1 space-y-1 pt-1 border-t border-slate-200/60">
                        {subLinks.map((item) => {
                          const Icon = item.icon;
                          return (
                            <Link
                              key={item.href}
                              href={item.href}
                              onClick={() => setOpen(false)}
                              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[14px] font-medium text-slate-700 hover:bg-white hover:text-[#1D5BD8]"
                            >
                              <Icon className="size-4 text-slate-400" />
                              <span>{item.label}</span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
                <button className="rounded-xl px-4 py-3.5 text-start text-red-600 hover:bg-slate-100" onClick={() => { setOpen(false); signOut({ callbackUrl: '/' }); }}>
                  {lang === 'ar' ? 'تسجيل الخروج' : 'Sign Out'}
                </button>
              </>
            ) : (
              <>
                <Link className="rounded-xl px-4 py-3.5 hover:bg-slate-100" href="/login" onClick={() => setOpen(false)}>{t('v2.login')}</Link>
                <Link className="rounded-xl px-4 py-3.5 hover:bg-slate-100" href="/register/company" onClick={() => setOpen(false)}>{t('auth.createAccount')}</Link>
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
