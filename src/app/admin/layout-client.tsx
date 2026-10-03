'use client';

import { usePathname } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import {
  LayoutDashboard, Armchair, Bus, Route, Ticket, MapPin, HelpCircle,
  Calendar, Wallet, ScanEye, BarChart3, Users, Clock, CreditCard,
  XCircle, ShieldPlus, LogOut, Menu, X, Image as ImageIcon,
  History, Settings,
} from 'lucide-react';
import { signOut } from 'next-auth/react';
import { cn } from '@/lib/utils';
import { useLangStore } from '@/lib/lang';
import '@/components/v2/theme.css';
import { V2Logo } from '@/components/v2/Logo';

const navItems = [
  { href: '/admin', icon: LayoutDashboard, labelKey: 'nav.dashboard' },
  { href: '/admin/trips', icon: Route, labelKey: 'nav.trips' },
  { href: '/admin/buses', icon: Bus, labelKey: 'nav.buses' },
  { href: '/admin/seats', icon: Armchair, labelKey: 'nav.seats' },
  { href: '/admin/bookings', icon: Ticket, labelKey: 'nav.bookings' },
  { href: '/admin/stations', icon: MapPin, labelKey: 'nav.stations' },
  { href: '/admin/destinations', icon: ImageIcon, labelKey: 'nav.destinations' },
  { href: '/admin/customers', icon: Users, labelKey: 'nav.customers' },
  { href: '/admin/users', icon: ShieldPlus, labelKey: 'nav.users' },
  { href: '/admin/companies/pending', icon: Clock, labelKey: 'admin.pendingCompanies' },
  { href: '/admin/verify', icon: ScanEye, labelKey: 'nav.verify' },
  { href: '/admin/trip-requests', icon: Calendar, labelKey: 'admin.tripRequests' },
  { href: '/admin/charter-bookings', icon: Bus, labelKey: 'admin.charterBookings' },
  { href: '/admin/deposit-requests', icon: Wallet, labelKey: 'admin.depositRequests' },
  { href: '/admin/cancellations', icon: XCircle, labelKey: 'admin.cancellations' },
  { href: '/admin/credit-report', icon: CreditCard, labelKey: 'company.creditReport' },
  { href: '/admin/reports', icon: BarChart3, labelKey: 'nav.reports' },
  { href: '/admin/audit-log', icon: History, labelKey: 'admin.auditLog' },
  { href: '/admin/settings', icon: Settings, labelKey: 'admin.settings' },
  { href: '/admin/faqs', icon: HelpCircle, labelKey: 'nav.faq' },
];

/* V2 admin shell — same guards stay in server layout.tsx (untouched). */
export default function AdminLayoutClient({ session, children }: { session: any; children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';

  const nav = (
    <nav className="grid gap-1 p-4" aria-label="Admin">
      {navItems.map((item) => {
        const active = item.href === '/admin' ? pathname === '/admin' : pathname === item.href || pathname.startsWith(item.href + '/');
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-xl px-4 py-2.5 text-[14px] font-semibold transition',
              active ? 'bg-white/10 text-white shadow' : 'text-white/60 hover:bg-white/5 hover:text-white'
            )}
          >
            <item.icon className="size-5 shrink-0" />
            {t(item.labelKey)}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="v2 min-h-dvh bg-[var(--sp-bg)]" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="flex min-h-dvh">
        <aside className="hidden w-64 shrink-0 flex-col bg-[#0A1E3C] md:flex">
          <Link href="/" className="flex items-center gap-2.5 p-6 pb-5" aria-label="Safro">
            <V2Logo height={36} />
            <span className="text-[21px] font-extrabold leading-none tracking-tight text-white">
              {isRTL ? 'سافرو' : 'safro'}
            </span>
          </Link>
          <div className="flex-1 overflow-y-auto">{nav}</div>
          <div className="border-t border-white/10 p-4">
            <p className="truncate px-2 text-[13.5px] font-bold text-white">{session?.user?.name}</p>
            <p className="truncate px-2 text-[12px] text-white/50" dir="ltr" style={{ textAlign: 'start' }}>{session?.user?.email}</p>
            <button
              onClick={() => signOut({ callbackUrl: '/' })}
              className="mt-3 flex w-full items-center gap-2.5 rounded-xl px-4 py-2.5 text-[14px] font-semibold text-white/60 hover:bg-white/5 hover:text-white"
            >
              <LogOut className="size-4" /> {isRTL ? 'خروج' : 'Sign Out'}
            </button>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-[var(--sp-line)] bg-white/95 px-4 py-3 backdrop-blur md:hidden">
            <button onClick={() => setMobileOpen(!mobileOpen)} aria-label={mobileOpen ? 'Close menu' : 'Open menu'} aria-expanded={mobileOpen} className="grid size-10 place-items-center rounded-xl bg-slate-100 text-[#0B1B33]">
              {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
            <span className="flex items-center gap-2">
              <V2Logo height={30} />
              <span className="text-[13px] font-bold text-[var(--sp-text-muted)]">{t('nav.admin')}</span>
            </span>
          </div>
          {mobileOpen && (
            <div className="max-h-[60dvh] overflow-y-auto border-b border-[var(--sp-line)] bg-[#0A1E3C] md:hidden">{nav}</div>
          )}
          <div className="p-4 md:p-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
