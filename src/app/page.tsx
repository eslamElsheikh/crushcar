'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { useSession, signOut } from 'next-auth/react'
import {
  Bus, Calendar, CreditCard, ChevronDown, LogOut, Menu, Play, Star, X,
  Check, Sparkles, User,
} from 'lucide-react'
import { useLangStore } from '@/lib/lang'
import { cn } from '@/lib/utils'

const dict: Record<string, Record<string, string>> = {
  'nav.features': { ar: 'المميزات', en: 'Features' },
  'nav.pricing': { ar: 'الأسعار', en: 'Pricing' },
  'nav.demo': { ar: 'تجربة مباشرة', en: 'Live Demo' },
  'nav.signIn': { ar: 'تسجيل الدخول', en: 'Sign In' },
  'nav.signUp': { ar: 'إنشاء حساب', en: 'Sign Up' },
  'hero.badge': { ar: '🚀 مستقبل حجز الباصات', en: '🚀 The Future of Bus Booking' },
  'hero.title': { ar: 'احجز مقعدك', en: 'Book Your Seat' },
  'hero.titleAccent': { ar: 'في ثواني', en: 'In Seconds' },
  'hero.subtitle': { ar: 'منصة حجز مقاعد حديثة لشركات النقل.', en: 'Modern realtime seat booking platform.' },
  'hero.cta': { ar: 'ابدأ الحجز الآن', en: 'Start Booking Now' },
  'hero.ctaSecondary': { ar: 'شاهد العرض', en: 'Watch Demo' },
  'hero.liveLabel': { ar: 'مباشر', en: 'LIVE' },
  'hero.stats.bookings': { ar: 'حجز نشط', en: 'Active Bookings' },
  'hero.stats.cities': { ar: 'مدينة', en: 'Cities' },
  'hero.stats.companies': { ar: 'شركة', en: 'Companies' },
  'hero.stats.seats': { ar: 'مقعد', en: 'Seats Booked' },
  'features.badge': { ar: 'مميزات قوية', en: 'FEATURES' },
  'features.title': { ar: 'كل اللي تحتاجه لتشغل شركة نقل حديثة', en: 'Everything you need' },
  'features.subtitle': { ar: 'صُممت لشركات النقل اللي بتطالب بالتميز', en: 'Built for modern transport' },
  'features.realtime.title': { ar: 'حجز لحظي', en: 'Realtime Seat Booking' },
  'features.realtime.desc': { ar: 'شوف المقاعد بتتحجز لحظيًا.', en: 'Watch seats get booked in real-time.' },
  'features.seatBuilder.title': { ar: 'مصمم المقاعد', en: 'Visual Seat Builder' },
  'features.seatBuilder.desc': { ar: 'صمم تخطيط المقاعد بالسحب.', en: 'Design bus layouts with drag-and-drop.' },
  'features.analytics.title': { ar: 'تحليلات ذكية', en: 'Smart Analytics' },
  'features.analytics.desc': { ar: 'تابع الإيرادات بلوحات جميلة.', en: 'Track revenue with beautiful dashboards.' },
  'features.multiBus.title': { ar: 'أسطول متعدد', en: 'Multi-Bus Fleet' },
  'features.multiBus.desc': { ar: 'إدارة باصات غير محدودة.', en: 'Manage unlimited buses.' },
  'features.bulkTrips.title': { ar: 'رحلات متعددة', en: 'Bulk Scheduling' },
  'features.bulkTrips.desc': { ar: 'أنشئ مئات الرحلات دفعة واحدة.', en: 'Create hundreds of trips at once.' },
  'features.payments.title': { ar: 'المدفوعات', en: 'Payments' },
  'features.payments.desc': { ar: 'تكامل مع الدفع أونلاين.', en: 'Accept online payments.' },
  'liveBooking.badge': { ar: 'شوفه وهو شغال', en: 'SEE IT IN ACTION' },
  'liveBooking.title': { ar: 'شوف الحجز اللحظي حي', en: 'Watch realtime booking' },
  'liveBooking.subtitle': { ar: 'عملاء بتصفحوا، مقاعد بتتختار، تأكيدات فورية', en: 'Customers browsing, seats selected, instant confirmations' },
  'liveBooking.legend.available': { ar: 'متاح', en: 'Available' },
  'landingHow.badge': { ar: 'إزاي يعمل', en: 'HOW IT WORKS' },
  'landingHow.title': { ar: 'ثلاث خطوات لحجز أفضل', en: 'Three steps to better bookings' },
  'landingHow.create': { ar: 'أنشئ باصاتك', en: 'Create your buses' },
  'landingHow.createDesc': { ar: 'أضف أسطولك وصمم المقاعد', en: 'Add fleet and design layouts' },
  'landingHow.trips': { ar: 'جدول الرحلات', en: 'Schedule trips' },
  'landingHow.tripsDesc': { ar: 'حدد المسارات والأوقات', en: 'Set routes and schedules' },
  'landingHow.book': { ar: 'ابدأ الحجز', en: 'Start booking' },
  'landingHow.bookDesc': { ar: 'العملاء يحجزوا فورًا', en: 'Customers book instantly' },
  'testimonials.badge': { ar: 'ثقة شركات النقل', en: 'TRUSTED' },
  'testimonials.title': { ar: 'شركات بتثق في CrushCar', en: 'Companies trust CrushCar' },
  'pricing.badge': { ar: 'أسعار بسيطة', en: 'SIMPLE PRICING' },
  'pricing.title': { ar: 'ابدأ مجانًا واطور', en: 'Start free, scale as you grow' },
  'pricing.subtitle': { ar: 'بدون رسوم مخفية', en: 'No hidden fees.' },
  'pricing.starter.name': { ar: 'للبداية', en: 'Starter' },
  'pricing.starter.price': { ar: 'مجاني', en: 'Free' },
  'pricing.starter.desc': { ar: 'مثالي للبداية', en: 'For small companies' },
  'pricing.pro.name': { ar: 'احترافي', en: 'Pro' },
  'pricing.pro.price': { ar: '١٬٥٠٠', en: '1,500' },
  'pricing.pro.desc': { ar: 'للشركات اللي بتكبر', en: 'For growing companies' },
  'pricing.enterprise.name': { ar: 'مؤسسات', en: 'Enterprise' },
  'pricing.enterprise.price': { ar: '٥٬٠٠٠', en: '5,000' },
  'pricing.enterprise.desc': { ar: 'لشبكات كبيرة', en: 'For large networks' },
  'cta.title': { ar: ' جاهز تحول شركة النقل بتاعتك؟', en: 'Ready to transform?' },
  'cta.subtitle': { ar: 'انضم لمئات الشركات اللي بتستخدم CrushCar', en: 'Join hundreds of companies using CrushCar' },
  'cta.button': { ar: 'ابدأ مجانًا — بدون بطاقة', en: 'Start Free — No Credit Card' },
  'footer.tagline': { ar: 'إدارة نقل حديثة للسوق المصري', en: 'Modern transport for Egypt' },
  'seat.available': { ar: 'متاح', en: 'Available' },
  'seat.selected': { ar: 'مختار', en: 'Selected' },
  'seat.reserved': { ar: 'محجوز', en: 'Reserved' },
  'seat.vipSeat': { ar: 'VIP', en: 'VIP' },
}

function tr(lang: string, key: string): string {
  return dict[key]?.[lang] ?? key
}

export default function LandingPage() {
  const { data: session } = useSession()
  const lang = useLangStore((s) => s.lang)
  const isRTL = lang === 'ar'

  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [langOpen, setLangOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [stats, setStats] = useState<{
    totalBookings: number; totalRevenue: number; activeTrips: number;
    totalBuses: number; recentTrips: any[]
  } | null>(null)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    fetch('/api/public/stats')
      .then(r => r.json())
      .then(d => {
        if (!d.error) setStats(d)
      })
      .catch(() => {})
  }, [])

  const features = [
    { icon: '⚡', color: 'blue', title: tr(lang, 'features.realtime.title'), desc: tr(lang, 'features.realtime.desc') },
    { icon: '🎨', color: 'purple', title: tr(lang, 'features.seatBuilder.title'), desc: tr(lang, 'features.seatBuilder.desc') },
    { icon: '📊', color: 'emerald', title: tr(lang, 'features.analytics.title'), desc: tr(lang, 'features.analytics.desc') },
    { icon: '🚌', color: 'orange', title: tr(lang, 'features.multiBus.title'), desc: tr(lang, 'features.multiBus.desc') },
    { icon: '📅', color: 'cyan', title: tr(lang, 'features.bulkTrips.title'), desc: tr(lang, 'features.bulkTrips.desc') },
    { icon: '💳', color: 'pink', title: tr(lang, 'features.payments.title'), desc: tr(lang, 'features.payments.desc') },
  ]

  const testimonials = [
    { quote: { ar: '"خريطة المقاعد جميلة والعملاء بيحبوا."', en: '"The seat map is beautiful. Customers love it."' }, author: { ar: 'أحمد حسن', en: 'Ahmed Hassan' }, role: { ar: 'CEO', en: 'CEO' }, company: 'Cairo Express' },
    { quote: { ar: '"نظام الحجز اللحظي أزال الحجز الزائد بالكامل."', en: '"The realtime booking eliminated overbooking."' }, author: { ar: 'سارة محمود', en: 'Sarah Mahmoud' }, role: { ar: 'مديرة العمليات', en: 'Ops Director' }, company: 'Delta Transport' },
    { quote: { ar: '"UI جميل، Backend قوي. CrushCar بالظبط."', en: '"Beautiful UI, powerful backend. Exactly what we needed."' }, author: { ar: 'عمر فاروق', en: 'Omar Farouk' }, role: { ar: 'المؤسس', en: 'Founder' }, company: 'Nile Bus Co.' },
  ]

  const plans = [
    { name: tr(lang, 'pricing.starter.name'), price: tr(lang, 'pricing.starter.price'), desc: tr(lang, 'pricing.starter.desc'), features: lang === 'ar' ? ['3 باصات', 'تخطيطات أساسية', 'جدولة'] : ['3 buses', 'Basic layouts', 'Scheduling'], color: 'zinc', popular: false },
    { name: tr(lang, 'pricing.pro.name'), price: tr(lang, 'pricing.pro.price'), desc: tr(lang, 'pricing.pro.desc'), features: lang === 'ar' ? ['باصات غير محدودة', 'تحليلات متقدمة', 'إنشاء متعدد'] : ['Unlimited buses', 'Advanced analytics', 'Bulk create'], color: 'blue', popular: true },
    { name: tr(lang, 'pricing.enterprise.name'), price: tr(lang, 'pricing.enterprise.price'), desc: tr(lang, 'pricing.enterprise.desc'), features: lang === 'ar' ? ['كل حاجة في Pro', 'API', 'دعم مخصص'] : ['Everything in Pro', 'API access', 'Dedicated support'], color: 'purple', popular: false },
  ]

  return (
    <div className={cn('min-h-screen bg-background text-foreground overflow-x-hidden', isRTL && 'font-[Cairo]')} dir={isRTL ? 'rtl' : 'ltr'}>
      <Navbar scrolled={scrolled} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} langOpen={langOpen} setLangOpen={setLangOpen} lang={lang} isRTL={isRTL} session={session} userMenuOpen={userMenuOpen} setUserMenuOpen={setUserMenuOpen} />
      <HeroSection lang={lang} isRTL={isRTL} stats={stats} />
      <FeaturesSection features={features} lang={lang} isRTL={isRTL} />
      <LiveBookingSection lang={lang} isRTL={isRTL} />
      <HowItWorksSection lang={lang} isRTL={isRTL} />
      <TestimonialsSection testimonials={testimonials} isRTL={isRTL} lang={lang} />
      <PricingSection plans={plans} isRTL={isRTL} lang={lang} />
      <CtaSection lang={lang} isRTL={isRTL} />
      <FooterSection isRTL={isRTL} lang={lang} />
    </div>
  )
}

// ─── NAVBAR ───────────────────────────────────────────────────────────────
function Navbar({ scrolled, mobileOpen, setMobileOpen, langOpen, setLangOpen, lang, isRTL, session, userMenuOpen, setUserMenuOpen }: { scrolled: boolean, mobileOpen: boolean, setMobileOpen: (v: boolean) => void, langOpen: boolean, setLangOpen: (v: boolean) => void, lang: string, isRTL: boolean, session: any, userMenuOpen: boolean, setUserMenuOpen: (v: boolean) => void }) {
  const setLang = useLangStore((s) => s.setLang)
  const navLinks = [
    { href: '#features', label: tr(lang, 'nav.features') },
    { href: '#live', label: tr(lang, 'hero.liveLabel') },
    { href: '#pricing', label: tr(lang, 'nav.pricing') },
    { href: '/trips', label: tr(lang, 'nav.demo') },
    ...(session ? [
      { href: '/bookings', label: isRTL ? 'حجوزاتي' : 'My Bookings' },
      { href: '/profile', label: isRTL ? 'حسابي' : 'My Account' },
    ] : []),
  ]
  return (
    <motion.nav initial={{ y: -80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.6 }} className={cn('fixed top-0 left-0 right-0 z-[100] transition-all duration-500', scrolled ? 'backdrop-blur-2xl bg-black/60 border-b border-white/5 shadow-2xl shadow-black/20' : 'bg-transparent')}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 lg:h-18">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-500/30 group-hover:shadow-blue-500/50 transition-shadow duration-300"><span className="text-white font-bold text-sm">CC</span></div>
              <div className="absolute -inset-1 rounded-xl bg-blue-500/20 blur-lg group-hover:bg-blue-500/40 transition-all duration-300 -z-10" />
            </div>
            <span className="font-display font-bold text-lg text-white tracking-tight">CrushCar</span>
          </Link>
          <div className="hidden lg:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href} className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors duration-200 rounded-lg hover:bg-white/5">{link.label}</Link>
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
                      {[{ code: 'ar' as const, label: 'العربية', flag: '🇪��' }, { code: 'en' as const, label: 'English', flag: '🇬🇧' }].map((l) => (
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
                  <button onClick={() => setLangOpen(!userMenuOpen)} className="flex items-center gap-2 px-3 py-2 rounded-xl glass border border-white/10 text-sm hover:bg-white/5 transition-all duration-200">
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
                  <Link href="/login" className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors duration-200 rounded-lg hover:bg-white/5">{tr(lang, 'nav.signIn')}</Link>
                  <Link href="/register" className="px-5 py-2 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white text-sm font-semibold transition-all duration-200 shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-105">{tr(lang, 'nav.signUp')}</Link>
                </>
              )}
            </div>
            <button onClick={() => setMobileOpen(!mobileOpen)} className="lg:hidden p-2 rounded-lg glass hover:bg-white/5 transition">{mobileOpen ? <X size={20} /> : <Menu size={20} />}</button>
          </div>
        </div>
        <AnimatePresence>
          {mobileOpen && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3 }} className="lg:hidden overflow-hidden">
              <div className="pb-6 pt-2 flex flex-col gap-1 border-t border-white/5">
                {navLinks.map((link) => <Link key={link.href} href={link.href} onClick={() => setMobileOpen(false)} className="px-4 py-3 text-sm text-zinc-400 hover:text-white transition-colors rounded-lg hover:bg-white/5">{link.label}</Link>)}
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
                    <Link href="/login" onClick={() => setMobileOpen(false)} className="flex-1 py-2.5 text-center text-sm glass rounded-xl hover:bg-white/5 transition">{tr(lang, 'nav.signIn')}</Link>
                    <Link href="/register" onClick={() => setMobileOpen(false)} className="flex-1 py-2.5 text-center text-sm bg-blue-500 rounded-xl hover:bg-blue-600 transition text-white font-medium">{tr(lang, 'nav.signUp')}</Link>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.nav>
  )
}

// ─── HERO ──────────────────────────────────────────────────────────────────
function HeroSection({ lang, isRTL, stats }: { lang: string, isRTL: boolean, stats: { totalBookings: number; totalRevenue: number; activeTrips: number; totalBuses: number; recentTrips: any[] } | null }) {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20 pb-16 px-4">
      <div className="absolute inset-0 bg-[#030303]" />
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[900px] h-[600px] bg-gradient-radial from-blue-600/20 via-blue-600/5 to-transparent rounded-full blur-3xl animate-pulse-slow" />
        <div className="absolute top-1/3 left-1/4 w-[400px] h-[400px] bg-gradient-radial from-cyan-500/10 to-transparent rounded-full blur-3xl" />
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.3) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
      </div>
      <ParticleField />
      <div className="relative z-10 max-w-6xl mx-auto text-center">
        <motion.div initial={{ opacity: 0, y: 20, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.6, delay: 0.1 }}>
          <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full glass border border-blue-500/20 mb-8">
            <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" /></span>
            <span className="text-xs font-medium text-blue-300 tracking-wide">{tr(lang, 'hero.badge')}</span>
          </div>
        </motion.div>
        <motion.h1 initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.2 }} className="text-5xl sm:text-6xl lg:text-7xl font-display font-bold leading-[1.05] mb-6 tracking-tight">
          <span className="text-white">{tr(lang, 'hero.title')}</span><br />
          <span className="bg-gradient-to-r from-blue-300 via-blue-400 to-blue-600 bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(59,130,246,0.4)]">{tr(lang, 'hero.titleAccent')}</span>
        </motion.h1>
        <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.35 }} className="text-lg sm:text-xl text-zinc-400 mb-10 max-w-2xl mx-auto leading-relaxed">{tr(lang, 'hero.subtitle')}</motion.p>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.5 }} className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
          <Link href="/register" className="group relative px-8 py-4 rounded-2xl bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold text-base shadow-2xl shadow-blue-500/30 hover:shadow-blue-500/50 hover:scale-105 transition-all duration-300 overflow-hidden">
            <span className="relative z-10 flex items-center gap-2"><Sparkles size={18} className="group-hover:rotate-12 transition-transform" />{tr(lang, 'hero.cta')}</span>
          </Link>
          <Link href="/trips" className="group flex items-center gap-2 px-8 py-4 rounded-2xl glass border border-white/10 text-white font-medium text-base hover:bg-white/5 hover:border-white/20 transition-all duration-300">
            <Play size={16} className="text-blue-400 group-hover:scale-110 transition-transform" />{tr(lang, 'hero.ctaSecondary')}
          </Link>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.65 }} className="flex flex-wrap justify-center gap-8 sm:gap-12 mb-16">
          {[{ value: (stats?.totalBookings ?? 0).toLocaleString(), label: tr(lang, 'hero.stats.bookings'), color: 'blue' }, { value: (stats?.activeTrips ?? 0).toLocaleString(), label: tr(lang, 'hero.stats.cities'), color: 'cyan' }, { value: (stats?.totalBuses ?? 0).toLocaleString(), label: tr(lang, 'hero.stats.companies'), color: 'emerald' }, { value: Math.round(stats?.totalRevenue ?? 0).toLocaleString(), label: isRTL ? 'جنيه' : 'EGP', color: 'purple' }].map((stat) => (
            <div key={stat.label} className="text-center">
              <div className={cn('text-3xl sm:text-4xl font-display font-bold mb-1', stat.color === 'blue' && 'text-blue-400', stat.color === 'cyan' && 'text-cyan-400', stat.color === 'emerald' && 'text-emerald-400', stat.color === 'purple' && 'text-purple-400')}>{stat.value}</div>
              <div className="text-xs text-zinc-500 uppercase tracking-wider">{stat.label}</div>
            </div>
          ))}
        </motion.div>
        <HeroSeatMap lang={lang} isRTL={isRTL} />
      </div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5 }} className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
        <span className="text-xs text-zinc-600 animate-pulse">{isRTL ? 'انزل للأسفل' : 'Scroll down'}</span>
        <motion.div animate={{ y: [0, 8, 0] }} transition={{ duration: 1.5, repeat: Infinity }} className="w-5 h-8 rounded-full border border-zinc-700 flex justify-center pt-1"><div className="w-1 h-2 rounded-full bg-zinc-500" /></motion.div>
      </motion.div>
    </section>
  )
}

function ParticleField() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {Array.from({ length: 20 }).map((_, i) => (
        <motion.div key={i} className="absolute w-1 h-1 rounded-full bg-blue-400/30"
          initial={{ x: (i * 61) % 1200, y: (i * 47) % 800 }}
          animate={{ y: [null, -200], opacity: [0.3, 0.8, 0] }}
          transition={{ duration: 8, repeat: Infinity, delay: i * 0.5, ease: 'linear' }}
        />
      ))}
    </div>
  )
}

function HeroSeatMap({ lang, isRTL }: { lang: string, isRTL: boolean }) {
  const [seats, setSeats] = useState<Array<{ label: string, state: 'available' | 'selected' | 'reserved' | 'vip' }>>([])
  useEffect(() => {
    const init = ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4', 'C1', 'C2', 'C3', 'C4'].map((label, i) => ({
      label, state: (i === 1 ? 'selected' : i === 3 ? 'reserved' : i === 5 ? 'vip' : 'available') as 'available' | 'selected' | 'reserved' | 'vip'
    }))
    setSeats(init)
    const iv = setInterval(() => {
      setSeats(prev => {
        const avail = prev.filter(s => s.state === 'available')
        if (avail.length > 5) {
          const idx = Math.floor(Math.random() * avail.length)
          const lbl = avail[idx].label
          return prev.map(s => s.label === lbl ? { ...s, state: 'reserved' } : s)
        }
        return prev
      })
    }, 2500)
    return () => clearInterval(iv)
  }, [])

  return (
    <motion.div initial={{ opacity: 0, y: 40, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.8, delay: 0.8 }} className="relative max-w-lg mx-auto">
      <div className="glass rounded-3xl p-8 border border-white/5 shadow-2xl shadow-blue-500/10">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /><span className="text-xs font-medium text-emerald-400">{tr(lang, 'hero.liveLabel')}</span></div>
          <span className="text-xs text-zinc-600">{tr(lang, 'hero.stats.bookings')}</span>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {seats.map((seat, i) => (
            <motion.div key={seat.label} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.9 + i * 0.05, type: 'spring', stiffness: 300 }}
              className={cn('relative aspect-square rounded-xl flex items-center justify-center text-xs font-semibold transition-all duration-300',
                seat.state === 'available' && 'bg-zinc-800/50 border border-zinc-700/50 text-zinc-400 hover:bg-blue-500/20 hover:border-blue-500/30 hover:scale-110',
                seat.state === 'selected' && 'bg-blue-500 border border-blue-400 text-white shadow-lg shadow-blue-500/40 animate-seat-pulse',
                seat.state === 'reserved' && 'bg-red-500/20 border border-red-500/30 text-red-400 cursor-not-allowed',
                seat.state === 'vip' && 'bg-amber-500/20 border border-amber-500/30 text-amber-400 hover:border-amber-400/50 hover:scale-110'
              )}>
              {seat.label}
              {seat.state === 'reserved' && <div className="absolute inset-0 flex items-center justify-center"><div className="w-4 h-0.5 bg-red-500/60 rotate-45" /></div>}
            </motion.div>
          ))}
        </div>
        <div className="mt-6 flex items-center justify-center gap-4 text-xs">
          <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-blue-500" /> {tr(lang, 'seat.selected')}</span>
          <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-zinc-700 border border-zinc-600" /> {tr(lang, 'seat.available')}</span>
          <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-amber-500/30 border border-amber-500/40" /> {tr(lang, 'seat.vipSeat')}</span>
        </div>
      </div>
      <div className="absolute -inset-8 rounded-3xl bg-gradient-to-r from-blue-500/10 via-purple-500/5 to-blue-500/10 blur-2xl -z-10" />
    </motion.div>
  )
}

// ─── FEATURES ──────────────────────────────────────────────────────────────
function FeaturesSection({ features, lang, isRTL }: { features: Array<{ icon: string, color: string, title: string, desc: string }>, lang: string, isRTL: boolean }) {
  return (
    <section id="features" className="relative py-32 px-4 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-blue-950/20 to-transparent" />
      <div className="relative z-10 max-w-6xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="text-center mb-20">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass border border-blue-500/10 mb-6"><Sparkles size={12} className="text-blue-400" /><span className="text-xs text-blue-300 font-medium tracking-wide">{tr(lang, 'features.badge')}</span></div>
          <h2 className="text-4xl sm:text-5xl font-display font-bold mb-4 tracking-tight">{tr(lang, 'features.title')}</h2>
          <p className="text-lg text-zinc-400 max-w-xl mx-auto">{tr(lang, 'features.subtitle')}</p>
        </motion.div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <motion.div key={f.title} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08, duration: 0.5 }} whileHover={{ y: -4, scale: 1.02 }}
              className="group relative glass rounded-2xl p-7 border border-white/5 overflow-hidden hover:border-white/10 transition-all duration-300">
              <div className={cn('w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mb-5 transition-transform duration-300 group-hover:scale-110', f.color === 'blue' && 'bg-blue-500/10', f.color === 'purple' && 'bg-purple-500/10', f.color === 'emerald' && 'bg-emerald-500/10', f.color === 'orange' && 'bg-orange-500/10', f.color === 'cyan' && 'bg-cyan-500/10', f.color === 'pink' && 'bg-pink-500/10')}>{f.icon}</div>
              <h3 className="text-lg font-semibold mb-2 text-white">{f.title}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{f.desc}</p>
              <div className={cn('absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity', f.color === 'blue' && 'via-blue-500/50', f.color === 'purple' && 'via-purple-500/50', f.color === 'emerald' && 'via-emerald-500/50', f.color === 'orange' && 'via-orange-500/50', f.color === 'cyan' && 'via-cyan-500/50', f.color === 'pink' && 'via-pink-500/50')} />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── LIVE BOOKING ─────────────────────────────────────────────────────────
function LiveBookingSection({ lang, isRTL }: { lang: string, isRTL: boolean }) {
  const [liveSeats, setLiveSeats] = useState<Array<{ label: string, state: 'available' | 'selected' | 'reserved' | 'vip' }>>([])
  useEffect(() => {
    const init = Array.from({ length: 32 }, (_, i) => {
      const row = String.fromCharCode(65 + Math.floor(i / 4))
      const col = (i % 4) + 1
      const label = `${row}${col}`
      let state: 'available' | 'selected' | 'reserved' | 'vip' = 'available'
      if (i === 1 || i === 6) state = 'reserved'
      if (i === 4 || i === 16) state = 'vip'
      if (i === 2) state = 'selected'
      return { label, state }
    })
    setLiveSeats(init)
    const iv = setInterval(() => {
      setLiveSeats(prev => {
        const avail = prev.filter(s => s.state === 'available')
        if (avail.length > 5) {
          const idx = Math.floor(Math.random() * avail.length)
          const lbl = avail[idx].label
          return prev.map(s => s.label === lbl ? { ...s, state: 'reserved' } : s)
        }
        return prev
      })
    }, 4000)
    return () => clearInterval(iv)
  }, [])

  return (
    <section id="live" className="relative py-32 px-4 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-purple-950/20 to-transparent" />
      <div className="relative z-10 max-w-6xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass border border-emerald-500/10 mb-6"><div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /><span className="text-xs text-emerald-300 font-medium tracking-wide">{tr(lang, 'liveBooking.badge')}</span></div>
          <h2 className="text-4xl sm:text-5xl font-display font-bold mb-4">{tr(lang, 'liveBooking.title')}</h2>
          <p className="text-lg text-zinc-400 max-w-xl mx-auto">{tr(lang, 'liveBooking.subtitle')}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 30, scale: 0.95 }} whileInView={{ opacity: 1, y: 0, scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="glass rounded-3xl p-8 sm:p-12 border border-white/5 shadow-2xl max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center"><Bus size={18} className="text-white" /></div><div><p className="font-semibold text-white">Cairo → Alexandria</p><p className="text-xs text-zinc-500">Tomorrow, 8:00 AM</p></div></div>
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs"><div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />{liveSeats.filter(s => s.state === 'available').length} {tr(lang, 'liveBooking.legend.available')}</span>
          </div>
          <div className="flex items-center justify-center mb-6"><div className="flex items-center gap-2 px-4 py-2 rounded-full glass text-xs text-zinc-500"><span>🚍</span><span>{isRTL ? 'الأمام' : 'FRONT'}</span></div></div>
          <div className="flex flex-col gap-2 max-w-md mx-auto">
            {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((row) => (
              <div key={row} className="flex items-center gap-2">
                <span className="w-6 text-xs text-zinc-600 font-medium text-center">{row}</span>
                <div className="flex gap-2">
                  {[1, 2].map(col => { const seat = liveSeats.find(s => s.label === `${row}${col}`); return seat ? <SeatButton lang={lang} key={seat.label} seat={seat} /> : <div key={`e${col}`} className="w-12 h-12" /> })}
                  <div className="w-8" />
                  {[3, 4].map(col => { const seat = liveSeats.find(s => s.label === `${row}${col}`); return seat ? <SeatButton lang={lang} key={seat.label} seat={seat} /> : <div key={`e${col}`} className="w-12 h-12" /> })}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-4 text-xs">
            {[{ label: tr(lang, 'liveBooking.legend.available'), class: 'bg-zinc-800/50 border border-zinc-700/50 text-zinc-400' }, { label: tr(lang, 'seat.selected'), class: 'bg-blue-500 border border-blue-400 text-white' }, { label: tr(lang, 'seat.reserved'), class: 'bg-red-500/20 border border-red-500/30 text-red-400' }, { label: tr(lang, 'seat.vipSeat'), class: 'bg-amber-500/20 border border-amber-500/30 text-amber-400' }].map(item => <span key={item.label} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full', item.class)}>{item.label}</span>)}
          </div>
        </motion.div>
      </div>
    </section>
  )
}

function SeatButton({ lang, seat }: { lang: string, seat: { label: string, state: string } }) {
  return (
    <motion.div whileHover={seat.state === 'available' ? { scale: 1.15, y: -2 } : {}} whileTap={seat.state === 'available' ? { scale: 0.9 } : {}} className={cn('w-12 h-12 rounded-xl flex items-center justify-center text-xs font-semibold transition-all duration-200',
      seat.state === 'available' && 'bg-zinc-800/50 border border-zinc-700/50 text-zinc-400 hover:bg-blue-500/20 hover:border-blue-500/30 hover:shadow-lg hover:shadow-blue-500/20',
      seat.state === 'selected' && 'bg-blue-500 border border-blue-400 text-white shadow-lg shadow-blue-500/40 animate-seat-bounce-glow',
      seat.state === 'reserved' && 'bg-red-500/20 border border-red-500/30 text-red-400 cursor-not-allowed relative',
      seat.state === 'vip' && 'bg-amber-500/15 border border-amber-500/30 text-amber-400 hover:bg-amber-500/25'
    )}>
      {seat.label}
      {seat.state === 'reserved' && <div className="absolute inset-0 flex items-center justify-center"><div className="w-3 h-0.5 bg-red-500/60 rotate-45" /></div>}
    </motion.div>
  )
}

// ─── HOW IT WORKS ─────────────────────────────────────────────────────────
function HowItWorksSection({ lang, isRTL }: { lang: string, isRTL: boolean }) {
  const steps = [
    { num: '01', icon: <Bus size={28} className="text-blue-400" />, title: tr(lang, 'landingHow.create'), desc: tr(lang, 'landingHow.createDesc'), color: 'blue' },
    { num: '02', icon: <Calendar size={28} className="text-purple-400" />, title: tr(lang, 'landingHow.trips'), desc: tr(lang, 'landingHow.tripsDesc'), color: 'purple' },
    { num: '03', icon: <CreditCard size={28} className="text-emerald-400" />, title: tr(lang, 'landingHow.book'), desc: tr(lang, 'landingHow.bookDesc'), color: 'emerald' },
  ]
  return (
    <section className="relative py-32 px-4 overflow-hidden bg-gradient-to-b from-transparent via-zinc-950/50 to-transparent">
      <div className="max-w-6xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-20">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass border border-white/5 mb-6"><span className="text-xs text-zinc-400 font-medium tracking-wide">{tr(lang, 'landingHow.badge')}</span></div>
          <h2 className="text-4xl sm:text-5xl font-display font-bold">{tr(lang, 'landingHow.title')}</h2>
        </motion.div>
        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((step, i) => (
            <motion.div key={step.num} initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.15, duration: 0.5 }} className="relative group">
              <div className="glass rounded-3xl p-8 h-full border border-white/5 hover:border-white/10 transition-all duration-300">
                <div className={cn('w-16 h-16 rounded-2xl flex items-center justify-center mb-6 transition-transform duration-300 group-hover:scale-110', step.color === 'blue' && 'bg-blue-500/10', step.color === 'purple' && 'bg-purple-500/10', step.color === 'emerald' && 'bg-emerald-500/10')}>{step.icon}</div>
                <div className={cn('text-6xl font-display font-bold mb-4', step.color === 'blue' && 'text-blue-500/10', step.color === 'purple' && 'text-purple-500/10', step.color === 'emerald' && 'text-emerald-500/10')}>{step.num}</div>
                <h3 className="text-xl font-semibold mb-3 text-white">{step.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{step.desc}</p>
              </div>
              {i < 2 && <div className={cn('hidden md:block absolute top-1/2 -translate-y-1/2 z-10', isRTL ? 'left-0 -translate-x-1/2' : 'right-0 translate-x-1/2')}><div className="w-12 h-px bg-gradient-to-r from-white/10 to-transparent" /></div>}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── TESTIMONIALS ────────────────────────────────────────────────────────
function TestimonialsSection({ testimonials, isRTL, lang }: { testimonials: any[], isRTL: boolean, lang: string }) {
  return (
    <section className="relative py-32 px-4 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-blue-950/20 to-transparent" />
      <div className="relative z-10 max-w-6xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass border border-white/5 mb-6"><Star size={12} className="text-amber-400 fill-amber-400" /><span className="text-xs text-zinc-400 font-medium tracking-wide">{tr(lang, 'testimonials.badge')}</span></div>
          <h2 className="text-4xl sm:text-5xl font-display font-bold mb-4">{tr(lang, 'testimonials.title')}</h2>
        </motion.div>
        <div className="grid md:grid-cols-3 gap-6">
          {testimonials.map((item, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }} whileHover={{ y: -6, scale: 1.02 }} className="glass rounded-2xl p-8 border border-white/5 hover:border-white/10 transition-all duration-300 relative overflow-hidden">
              <div className="absolute top-4 right-4 text-4xl text-blue-500/10 font-serif">"</div>
              <div className="flex gap-1 mb-4">{[1,2,3,4,5].map(s => <Star key={s} size={14} className="text-amber-400 fill-amber-400" />)}</div>
              <p className="text-zinc-300 mb-6 leading-relaxed relative z-10">{item.quote[lang]}</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm">{item.author[lang].charAt(0)}</div>
                <div><p className="font-semibold text-white text-sm">{item.author[lang]}</p><p className="text-xs text-zinc-500">{item.role[lang]} — {item.company}</p></div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── PRICING ──────────────────────────────────────────────────────────────
function PricingSection({ plans, isRTL, lang }: { plans: any[], isRTL: boolean, lang: string }) {
  return (
    <section id="pricing" className="relative py-32 px-4 overflow-hidden bg-gradient-to-b from-transparent via-zinc-950/50 to-transparent">
      <div className="max-w-5xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass border border-white/5 mb-6"><CreditCard size={12} className="text-blue-400" /><span className="text-xs text-zinc-400 font-medium tracking-wide">{tr(lang, 'pricing.badge')}</span></div>
          <h2 className="text-4xl sm:text-5xl font-display font-bold mb-4">{tr(lang, 'pricing.title')}</h2>
          <p className="text-lg text-zinc-400">{tr(lang, 'pricing.subtitle')}</p>
        </motion.div>
        <div className="grid md:grid-cols-3 gap-6">
          {plans.map((plan, i) => (
            <motion.div key={plan.name} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }} whileHover={{ y: -6, scale: 1.02 }} className={cn('relative glass rounded-3xl p-8 transition-all duration-300', plan.popular ? 'border-blue-500/40 shadow-2xl shadow-blue-500/15 ring-1 ring-blue-500/20' : 'border-white/5 hover:border-white/10')}>
              {plan.popular && <div className="absolute -top-3 left-1/2 -translate-x-1/2"><div className="px-4 py-1 rounded-full bg-gradient-to-r from-blue-500 to-blue-600 text-xs font-semibold text-white shadow-lg shadow-blue-500/30">Popular</div></div>}
              <h3 className="text-lg font-semibold mb-1 text-white">{plan.name}</h3>
              <p className="text-xs text-zinc-500 mb-6">{plan.desc}</p>
              <div className="mb-8"><span className="text-4xl font-display font-bold text-white">{plan.price}</span></div>
              <ul className="space-y-3 mb-8">
                {plan.features.map((f: string) => (
                  <li key={f} className="flex items-center gap-3 text-sm text-zinc-400">
                    <div className={cn('w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0', plan.color === 'blue' && 'bg-blue-500/10 text-blue-400', plan.color === 'purple' && 'bg-purple-500/10 text-purple-400', plan.color === 'zinc' && 'bg-zinc-700/50 text-zinc-400')}><Check size={12} /></div>
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/register" className={cn('block w-full py-3 rounded-xl font-medium text-center transition-all duration-200', plan.popular ? 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-105' : 'glass hover:bg-white/5 border border-white/10 text-zinc-300 hover:text-white hover:border-white/20')}>
                {lang === 'ar' ? 'ابدأ الآن' : 'Get Started'}
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── CTA ──────────────────────────────────────────────────────────────────
function CtaSection({ lang, isRTL }: { lang: string, isRTL: boolean }) {
  return (
    <section className="relative py-32 px-4 overflow-hidden">
      <div className="absolute inset-0"><div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-gradient-radial from-blue-600/15 via-blue-600/5 to-transparent rounded-full blur-3xl" /></div>
      <div className="relative z-10 max-w-2xl mx-auto text-center">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
          <h2 className="text-4xl sm:text-5xl font-display font-bold mb-6 leading-tight">{tr(lang, 'cta.title')}</h2>
          <p className="text-lg text-zinc-400 mb-10">{tr(lang, 'cta.subtitle')}</p>
          <Link href="/register" className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold shadow-2xl shadow-blue-500/30 hover:shadow-blue-500/50 hover:scale-105 transition-all duration-300">
            <Sparkles size={18} />{tr(lang, 'cta.button')}
          </Link>
        </motion.div>
      </div>
    </section>
  )
}

// ─── FOOTER ───────────────────────────────────────────────────────────────
function FooterSection({ isRTL, lang }: { isRTL: boolean, lang: string }) {
  const links = {
    product: lang === 'ar' ? ['المميزات', 'الأسعار', 'لوحة التحكم'] : ['Features', 'Pricing', 'Dashboard'],
    company: lang === 'ar' ? ['عن الشركة', 'المدونة'] : ['About', 'Blog'],
    legal: lang === 'ar' ? ['الخصوصية', 'الشروط'] : ['Privacy', 'Terms'],
  }
  return (
    <footer className="relative py-16 px-4 border-t border-white/5">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8 mb-12">
          <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center"><span className="text-white font-bold text-sm">CC</span></div><div><span className="font-display font-bold text-white">CrushCar</span><p className="text-xs text-zinc-600 mt-0.5">{tr(lang, 'footer.tagline')}</p></div></div>
          <div className="flex flex-wrap justify-center gap-6 text-sm text-zinc-500">
            {Object.entries(links).map(([section, items]) => <div key={section} className="flex gap-4">{items.map((link, i) => <span key={i} className="hover:text-white cursor-pointer transition-colors">{link}</span>)}</div>)}
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-8 border-t border-white/5">
          <p className="text-sm text-zinc-600">© 2026 CrushCar.</p>
          <p className="text-xs text-zinc-700">Made with ❤️ in Egypt</p>
        </div>
      </div>
    </footer>
  )
}