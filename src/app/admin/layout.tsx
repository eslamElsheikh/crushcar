'use client'

import { useSession } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard,
  Bus,
  Route,
  Ticket,
  ScanEye,
  BarChart3,
  Users,
  LogOut,
  Menu,
  X,
  ChevronRight,
} from 'lucide-react'
import { signOut } from 'next-auth/react'
import { useLangStore } from '@/lib/lang'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/admin', icon: LayoutDashboard, labelKey: 'nav.dashboard' },
  { href: '/admin/buses', icon: Bus, labelKey: 'nav.buses' },
  { href: '/admin/trips', icon: Route, labelKey: 'nav.trips' },
  { href: '/admin/bookings', icon: Ticket, labelKey: 'nav.bookings' },
  { href: '/admin/verify', icon: ScanEye, labelKey: 'nav.verify' },
  { href: '/admin/reports', icon: BarChart3, labelKey: 'nav.reports' },
  { href: '/admin/customers', icon: Users, labelKey: 'nav.customers' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const t = useLangStore((s) => s.t)
  const lang = useLangStore((s) => s.lang)
  const isRTL = lang === 'ar'

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
    else if (status === 'authenticated' && session?.user?.role === 'CUSTOMER') {
      router.push('/trips')
    }
  }, [status, session, router])

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full"
        />
      </div>
    )
  }

  if (!session?.user || session.user.role === 'CUSTOMER') return null

  return (
    <div className={cn('min-h-screen flex bg-[#030303]', isRTL && 'font-[Cairo]')}>
      {/* Desktop sidebar */}
      <motion.aside
        initial={{ x: isRTL ? 40 : -40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.4 }}
        className={cn(
          'hidden md:flex w-64 flex-col glass border-r border-white/5',
          isRTL && 'border-r-0 border-l'
        )}
      >
        {/* Logo */}
        <div className="p-6 border-b border-white/5">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
                <span className="text-white font-bold text-xs">CC</span>
              </div>
              <div className="absolute -inset-1 rounded-xl bg-blue-500/20 blur-lg -z-10 group-hover:bg-blue-500/30 transition-all" />
            </div>
            <div>
              <span className="font-display font-bold text-white block">CrushCar</span>
              <span className="text-[10px] text-zinc-600 uppercase tracking-wider">{t('nav.admin')}</span>
            </div>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item, i) => {
            const active = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href))
            return (
              <motion.div
                key={item.href}
                initial={{ opacity: 0, x: isRTL ? 20 : -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.06 }}
              >
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-sm group',
                    active
                      ? 'bg-gradient-to-r from-blue-500/15 to-blue-500/5 text-blue-400 border border-blue-500/20 shadow-lg shadow-blue-500/10'
                      : 'text-zinc-400 hover:text-white hover:bg-white/5'
                  )}
                >
                  <item.icon size={18} className={cn('transition-transform group-hover:scale-110', active && 'text-blue-400')} />
                  <span className="flex-1">{t(item.labelKey)}</span>
                  {active && (
                    <ChevronRight size={14} className={cn(isRTL && 'rotate-180')} />
                  )}
                </Link>
              </motion.div>
            )
          })}
        </nav>

        {/* User section */}
        <div className="p-4 border-t border-white/5 space-y-2">
          <div className="px-4 py-3 rounded-xl glass">
            <p className="text-sm font-semibold truncate text-white">{session.user.name}</p>
            <p className="text-xs text-zinc-500 truncate">{session.user.email}</p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-zinc-400 hover:text-red-400 hover:bg-red-500/5 transition text-sm w-full hover-lift"
          >
            <LogOut size={16} />
            {t('nav.signOut')}
          </button>
        </div>
      </motion.aside>

      {/* Mobile overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm md:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: isRTL ? -280 : -280 }}
              animate={{ x: 0 }}
              exit={{ x: isRTL ? -280 : -280 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className={cn(
                'fixed top-0 bottom-0 w-72 z-50 glass border-r border-white/5 p-6 flex flex-col md:hidden',
                isRTL && 'border-r-0 border-l'
              )}
            >
              <div className="flex items-center justify-between mb-8">
                <Link href="/" className="flex items-center gap-3" onClick={() => setMobileOpen(false)}>
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                    <span className="text-white font-bold text-xs">CC</span>
                  </div>
                  <span className="font-display font-bold text-white">CrushCar</span>
                </Link>
                <button onClick={() => setMobileOpen(false)} className="p-2 rounded-lg hover:bg-white/5 transition">
                  <X size={20} className="text-zinc-400" />
                </button>
              </div>

              <nav className="flex-1 space-y-1">
                {navItems.map((item) => {
                  const active = pathname === item.href
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        'flex items-center gap-3 px-4 py-3 rounded-xl transition text-sm',
                        active ? 'bg-blue-500/10 text-blue-400' : 'text-zinc-400 hover:text-white hover:bg-white/5'
                      )}
                    >
                      <item.icon size={18} />
                      {t(item.labelKey)}
                    </Link>
                  )
                })}
              </nav>

              <button
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-zinc-400 hover:text-red-400 transition text-sm mt-4 border-t border-white/5 pt-4"
              >
                <LogOut size={18} />
                {t('nav.signOut')}
              </button>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Mobile header */}
        <header className={cn(
          'md:hidden glass border-b border-white/5 px-4 py-3 flex items-center gap-3 sticky top-0 z-40',
        )}>
          <button onClick={() => setMobileOpen(true)} className="p-2 rounded-lg hover:bg-white/5 transition">
            <Menu size={20} className="text-zinc-400" />
          </button>
          <span className="font-display font-bold text-sm text-white">CrushCar</span>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/" className="text-xs text-zinc-500 hover:text-white transition">
              {isRTL ? 'الرئيسية' : 'Home'}
            </Link>
          </div>
        </header>

        <main className="flex-1 p-6 md:p-8">{children}</main>
      </div>
    </div>
  )
}