'use client';

import { usePathname } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import {
  LayoutDashboard, Ticket, Users, CreditCard, FileText,
  LogOut, Menu, X, Calendar, Plus, Bus,
} from 'lucide-react';
import { signOut } from 'next-auth/react';
import { cn } from '@/lib/utils';
import { useLangStore } from '@/lib/lang';
import '@/components/v2/theme.css';
import { V2Logo } from '@/components/v2/Logo';

const navItems = [
  { href: '/company/dashboard', icon: LayoutDashboard, labelKey: 'company.dashboard' },
  { href: '/company/bookings', icon: Ticket, labelKey: 'company.bookings' },
  { href: '/company/bookings/new', icon: Plus, labelKey: 'company.newBooking' },
  { href: '/company/charter', icon: Bus, labelKey: 'company.charter' },
  { href: '/company/trip-requests', icon: Calendar, labelKey: 'company.tripRequests' },
  { href: '/company/customers', icon: Users, labelKey: 'company.customers' },
  { href: '/company/credit', icon: CreditCard, labelKey: 'company.credit' },
  { href: '/company/invoices', icon: FileText, labelKey: 'company.invoices' },
];

/* V2 company shell — same nav, guards stay in server layout.tsx (untouched). */
export default function CompanyLayoutClient({ session, children }: { session: any; children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';

  const nav = (
    <nav className="grid gap-1 p-4" aria-label="Company">
      {navItems.map((item) => {
        const active = pathname === item.href || (item.href !== '/company/dashboard' && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-xl px-4 py-3 text-[14.5px] font-semibold transition',
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
    <div className="v2 min-h-dvh bg-[#F6F8FC]" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="flex min-h-dvh">
        <aside className="hidden w-64 shrink-0 flex-col bg-[#0A1E3C] md:flex">
          <Link href="/" className="p-6 pb-5" aria-label="Safro">
            <V2Logo height={36} />
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
          <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-[#E6EBF2] bg-white/95 px-4 py-3 backdrop-blur md:hidden">
            <button onClick={() => setMobileOpen(!mobileOpen)} aria-label={mobileOpen ? 'Close menu' : 'Open menu'} aria-expanded={mobileOpen} className="grid size-10 place-items-center rounded-xl bg-slate-100 text-[#0B1B33]">
              {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
            <span className="flex items-center">
              <V2Logo height={30} />
            </span>
          </div>
          {mobileOpen && (
            <div className="border-b border-[#E6EBF2] bg-[#0A1E3C] md:hidden">{nav}</div>
          )}
          <div className="p-4 md:p-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
