'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, ChevronDown, HelpCircle, Menu, X, User, LogOut } from 'lucide-react'
import { useLangStore } from '@/lib/lang'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { signOut } from 'next-auth/react'

interface FaqItem {
  id: string
  questionAr: string
  questionEn: string
  answerAr: string
  answerEn: string
}

export default function FaqPage() {
  const { lang, t } = useLangStore()
  const isRTL = lang === 'ar'
  const { data: session } = useSession()
  const [faqs, setFaqs] = useState<FaqItem[]>([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [langOpen, setLangOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    fetch('/api/faqs')
      .then((res) => res.json())
      .then((data) => setFaqs(data))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const setLang = useLangStore((s) => s.setLang)

  const navLinks = [
    { href: '/', label: isRTL ? 'الرئيسية' : 'Home' },
    { href: '/trips', label: t('nav.demo') },
    { href: '/stations', label: t('nav.stations') },
    { href: '/faq', label: t('nav.faq'), active: true },
    ...(session ? [
      { href: '/bookings', label: isRTL ? 'حجوزاتي' : 'My Bookings' },
      { href: '/profile', label: isRTL ? 'حسابي' : 'My Account' },
    ] : []),
  ]

  return (
    <div className={`min-h-screen bg-[#0a0a0a] ${isRTL ? 'font-[Cairo]' : ''}`} dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Navbar */}
      <motion.nav
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6 }}
        className={cn('fixed top-0 left-0 right-0 z-[100] transition-all duration-500', scrolled ? 'backdrop-blur-2xl bg-black/60 border-b border-white/5 shadow-2xl shadow-black/20' : 'bg-transparent')}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:h-18">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-500/30 group-hover:shadow-blue-500/50 transition-shadow duration-300">
                  <span className="text-white font-bold text-sm">CC</span>
                </div>
                <div className="absolute -inset-1 rounded-xl bg-blue-500/20 blur-lg group-hover:bg-blue-500/40 transition-all duration-300 -z-10" />
              </div>
              <span className="font-display font-bold text-lg text-white tracking-tight">CrushCar</span>
            </Link>

            <div className="hidden lg:flex items-center gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'px-4 py-2 text-sm transition-colors duration-200 rounded-lg',
                    (link as any).active
                      ? 'text-white bg-white/5'
                      : 'text-zinc-400 hover:text-white hover:bg-white/5'
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <button onClick={() => setLangOpen(!langOpen)} className="flex items-center gap-2 px-3 py-2 rounded-xl glass border border-white/10 text-sm hover:bg-white/5 transition-all duration-200">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-70"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                  <span className="font-medium">{lang === 'ar' ? 'عربي' : 'EN'}</span>
                  <ChevronDown size={14} className={cn('transition-transform duration-200', langOpen && 'rotate-180')} />
                </button>
                <AnimatePresence>
                  {langOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setLangOpen(false)} />
                      <motion.div initial={{ opacity: 0, y: 8, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.95 }} transition={{ duration: 0.2 }} className={cn('absolute top-full mt-2 z-20 glass rounded-2xl border border-white/10 overflow-hidden w-40', isRTL ? 'left-0' : 'right-0')}>
                        {[{ code: 'ar' as const, label: 'العربية', flag: '🇪🇬' }, { code: 'en' as const, label: 'English', flag: '🇬' }].map((l) => (
                          <button key={l.code} onClick={() => { setLang(l.code); setLangOpen(false) }} className={cn('w-full flex items-center gap-3 px-4 py-3 text-sm transition-all duration-150 hover:bg-white/5', lang === l.code ? 'text-blue-400 bg-blue-500/5' : 'text-zinc-300')}>
                            <span>{l.flag}</span><span>{l.label}</span>
                          </button>
                        ))}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>

              <div className="hidden lg:flex items-center gap-2">
                {session ? (
                  <div className="relative">
                    <button onClick={() => setUserMenuOpen(!userMenuOpen)} className="flex items-center gap-2 px-3 py-2 rounded-xl glass border border-white/10 text-sm hover:bg-white/5 transition-all duration-200">
                      <div className="w-7 h-7 rounded-full bg-blue-500/20 flex items-center justify-center">
                        <span className="text-blue-400 text-xs font-bold">{session.user?.name?.[0] || 'U'}</span>
                      </div>
                      <span className="text-zinc-300 text-sm">{session.user?.name?.split(' ')[0] || 'User'}</span>
                      <ChevronDown size={14} className={cn('transition-transform duration-200', userMenuOpen && 'rotate-180')} />
                    </button>
                    <AnimatePresence>
                      {userMenuOpen && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />
                          <motion.div initial={{ opacity: 0, y: 8, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.95 }} transition={{ duration: 0.2 }} className={cn('absolute top-full mt-2 z-20 glass rounded-2xl border border-white/10 overflow-hidden w-44', isRTL ? 'left-0' : 'right-0')}>
                            {(session.user?.role === 'COMPANY_ADMIN' || session.user?.role === 'SUPER_ADMIN') && (
                              <>
                                <Link href="/admin" onClick={() => setUserMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 text-sm text-blue-400 hover:text-blue-300 hover:bg-white/5 transition-all">
                                  <span className="text-lg">📊</span>
                                  <span>{isRTL ? 'لوحة التحكم' : 'Dashboard'}</span>
                                </Link>
                                <div className="border-t border-white/5" />
                              </>
                            )}
                            <Link href="/bookings" onClick={() => setUserMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 text-sm text-zinc-300 hover:text-white hover:bg-white/5 transition-all">
                              <User size={15} />
                              <span>{isRTL ? 'حجوزاتي' : 'My Bookings'}</span>
                            </Link>
                            <Link href="/profile" onClick={() => setUserMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 text-sm text-zinc-300 hover:text-white hover:bg-white/5 transition-all">
                              <span className="text-lg">⚙️</span>
                              <span>{isRTL ? 'حسابي' : 'My Account'}</span>
                            </Link>
                            <div className="border-t border-white/5" />
                            <button onClick={() => { signOut({ callbackUrl: '/' }); setUserMenuOpen(false) }} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:text-red-300 hover:bg-white/5 transition-all">
                              <LogOut size={15} />
                              <span>{isRTL ? 'خروج' : 'Sign Out'}</span>
                            </button>
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>
                ) : (
                  <>
                    <Link href="/login" className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors duration-200 rounded-lg hover:bg-white/5">{t('nav.signIn')}</Link>
                    <Link href="/register" className="px-5 py-2 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white text-sm font-semibold transition-all duration-200 shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-105">{t('nav.signUp')}</Link>
                  </>
                )}
              </div>

              <button onClick={() => setMobileOpen(!mobileOpen)} className="lg:hidden p-2 rounded-lg glass hover:bg-white/5 transition">
                {mobileOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>
          </div>
        </div>

        <AnimatePresence>
          {mobileOpen && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3 }} className="lg:hidden overflow-hidden">
              <div className="pb-6 pt-2 flex flex-col gap-1 border-t border-white/5">
                {navLinks.map((link) => (
                  <Link key={link.href} href={link.href} onClick={() => setMobileOpen(false)} className={cn(
                    'px-4 py-3 text-sm transition-colors rounded-lg',
                    (link as any).active ? 'text-white bg-white/5' : 'text-zinc-400 hover:text-white hover:bg-white/5'
                  )}>
                    {link.label}
                  </Link>
                ))}
                {session ? (
                  <div className="flex flex-col gap-1 pt-4 px-4 border-t border-white/5">
                    <Link href="/bookings" onClick={() => setMobileOpen(false)} className="flex items-center gap-3 px-4 py-3 text-sm text-zinc-300 hover:text-white transition-colors rounded-lg hover:bg-white/5">
                      <User size={16} />
                      <span>{isRTL ? 'حجوزاتي' : 'My Bookings'}</span>
                    </Link>
                    <Link href="/profile" onClick={() => setMobileOpen(false)} className="flex items-center gap-3 px-4 py-3 text-sm text-zinc-300 hover:text-white transition-colors rounded-lg hover:bg-white/5">
                      <span className="text-base">⚙️</span>
                      <span>{isRTL ? 'حسابي' : 'My Account'}</span>
                    </Link>
                    <button onClick={() => { signOut({ callbackUrl: '/' }); setMobileOpen(false) }} className="flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:text-red-300 transition-colors rounded-lg hover:bg-white/5 mt-1">
                      <LogOut size={16} />
                      <span>{isRTL ? 'خروج' : 'Sign Out'}</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2 pt-4 px-4">
                    <Link href="/login" onClick={() => setMobileOpen(false)} className="flex-1 py-2.5 text-center text-sm glass rounded-xl hover:bg-white/5 transition">{t('nav.signIn')}</Link>
                    <Link href="/register" onClick={() => setMobileOpen(false)} className="flex-1 py-2.5 text-center text-sm bg-blue-500 rounded-xl hover:bg-blue-600 transition text-white font-medium">{t('nav.signUp')}</Link>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.nav>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 pt-24 pb-16">
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 mb-5">
            <HelpCircle className="w-7 h-7 text-blue-400" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">{t('faq.title')}</h1>
          <p className="text-zinc-500 text-lg">{t('faq.subtitle')}</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>
        ) : !faqs.length ? (
          <div className="text-center py-20 bg-white/5 rounded-2xl border border-white/5">
            <HelpCircle className="w-12 h-12 mx-auto text-zinc-700 mb-3" />
            <p className="text-zinc-500">{t('faq.noFaqs')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <motion.div
                key={faq.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="bg-white/5 rounded-xl border border-white/5 overflow-hidden hover:border-white/10 transition"
              >
                <button
                  onClick={() => setOpenId(openId === faq.id ? null : faq.id)}
                  className="w-full flex items-center justify-between gap-4 p-5 text-right"
                >
                  <span className="text-white font-medium text-sm md:text-base flex-1 text-left">
                    {isRTL ? faq.questionAr : faq.questionEn}
                  </span>
                  <motion.div
                    animate={{ rotate: openId === faq.id ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="shrink-0"
                  >
                    <ChevronDown className="w-5 h-5 text-zinc-500" />
                  </motion.div>
                </button>
                <AnimatePresence>
                  {openId === faq.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 pb-5">
                        <div className="border-t border-white/5 pt-4">
                          <p className="text-zinc-400 text-sm leading-relaxed whitespace-pre-line">
                            {isRTL ? faq.answerAr : faq.answerEn}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
