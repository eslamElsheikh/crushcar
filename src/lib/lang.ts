'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Language = 'ar' | 'en'

interface LangState {
  lang: Language
  setLang: (lang: Language) => void
  t: (key: string) => string
}

const translations: Record<string, Record<Language, string>> = {
  // Navigation
  'nav.dashboard': { ar: 'لوحة التحكم', en: 'Dashboard' },
  'nav.buses': { ar: 'الباصات', en: 'Buses' },
  'nav.trips': { ar: 'الرحلات', en: 'Trips' },
  'nav.bookings': { ar: 'الحجوزات', en: 'Bookings' },
  'nav.customers': { ar: 'العملاء', en: 'Customers' },
  'nav.users': { ar: 'إدارة المستخدمين', en: 'User Management' },
  'nav.verify': { ar: 'التحقق من الصعود', en: 'Verify Boarding' },
  'nav.reports': { ar: 'التقارير', en: 'Reports' },
  'nav.signOut': { ar: 'تسجيل الخروج', en: 'Sign Out' },
  'nav.admin': { ar: 'الإدارة', en: 'Admin' },

  // Dashboard
  'dashboard.welcome': { ar: 'مرحباً', en: 'Welcome back' },
  'dashboard.totalBookings': { ar: 'إجمالي الحجوزات', en: 'Total Bookings' },
  'dashboard.totalRevenue': { ar: 'إجمالي الإيرادات', en: 'Total Revenue' },
  'dashboard.activeTrips': { ar: 'الرحلات النشطة', en: 'Active Trips' },
  'dashboard.todayRevenue': { ar: 'إيرادات اليوم', en: "Today's Revenue" },
  'dashboard.revenueTrend': { ar: 'اتجاه الإيرادات', en: 'Revenue Trend' },
  'dashboard.last30days': { ar: 'آخر 30 يوم', en: 'Last 30 days' },
  'dashboard.recentBookings': { ar: 'الحجوزات الأخيرة', en: 'Recent Bookings' },
  'dashboard.viewAll': { ar: 'عرض الكل', en: 'View all' },
  'dashboard.manageBuses': { ar: 'إدارة الباصات', en: 'Manage Buses' },
  'dashboard.manageTrips': { ar: 'إدارة الرحلات', en: 'Manage Trips' },
  'dashboard.viewTrips': { ar: 'عرض الرحلات', en: 'View Trips' },
  'dashboard.addBuses': { ar: 'أضف باصات وصمم المقاعد', en: 'Add buses and design seat layouts' },
  'dashboard.createTrips': { ar: 'أنشئ وجدول الرحلات', en: 'Create and schedule trips' },
  'dashboard.seeTrips': { ar: 'شوف كل الرحلات', en: 'See all available trips' },

  // Buses
  'buses.title': { ar: 'الباصات', en: 'Buses' },
  'buses.manage': { ar: 'إدارة الأسطول', en: 'Manage your fleet' },
  'buses.addBus': { ar: 'إضافة باص', en: 'Add Bus' },
  'buses.noBuses': { ar: 'لا توجد باصات', en: 'No buses yet' },
  'buses.addFirst': { ar: 'أضف باصك الأول', en: 'Add your first bus' },
  'buses.seatsConfig': { ar: 'مقاعد مُهيأة', en: 'seats configured' },
  'buses.editLayout': { ar: 'تعديل التصميم', en: 'Edit Layout' },
  'buses.designLayout': { ar: 'تصميم المقاعد', en: 'Design Layout' },
  'buses.addNew': { ar: 'إضافة باص جديد', en: 'Add New Bus' },
  'buses.busName': { ar: 'اسم الباص', en: 'Bus Name' },
  'buses.busType': { ar: 'نوع الباص', en: 'Bus Type' },
  'buses.companyId': { ar: 'رقم الشركة', en: 'Company ID' },
  'buses.cancel': { ar: 'إلغاء', en: 'Cancel' },
  'buses.create': { ar: 'إنشاء', en: 'Create' },

  // Bus types
  'busType.mini': { ar: 'ميني باص', en: 'Mini Bus' },
  'busType.coach': { ar: 'كوتش', en: 'Coach Bus' },
  'busType.vip': { ar: 'VIP', en: 'VIP Bus' },
  'busType.double': { ar: 'دبل ديكار', en: 'Double Decker' },

  // Layout
  'layout.title': { ar: 'تصميم المقاعد', en: 'Seat Layout' },
  'layout.design': { ar: 'صمم مقاعد الباص', en: 'Design your bus seats' },
  'layout.save': { ar: 'حفظ التصميم', en: 'Save Layout' },
  'layout.info': { ar: 'معلومات التصميم', en: 'Layout Info' },
  'layout.rows': { ar: 'الصفوف', en: 'Rows' },
  'layout.cols': { ar: 'الأعمدة', en: 'Columns' },
  'layout.totalSeats': { ar: 'إجمالي المقاعد', en: 'Total Seats' },
  'layout.legend': { ar: 'أنواع المقاعد', en: 'Seat Types' },
  'layout.editSeat': { ar: 'تعديل المقعد', en: 'Edit Seat' },
  'layout.normal': { ar: 'عادي', en: 'Normal' },
  'layout.vip': { ar: 'VIP', en: 'VIP' },
  'layout.disabled': { ar: 'لذوي الإحتياجات', en: 'Disabled' },
  'layout.extraPrice': { ar: 'سعر إضافي (ج.م)', en: 'Extra Price (EGP)' },
  'layout.front': { ar: 'الأمام', en: 'FRONT' },

  // Trips
  'trips.title': { ar: 'الرحلات', en: 'Trips' },
  'trips.manage': { ar: 'إدارة المسارات والجدول', en: 'Manage your routes and schedules' },
  'trips.addTrip': { ar: 'إضافة رحلة', en: 'Add Trip' },
  'trips.bulkCreate': { ar: 'إنشاء متعدد', en: 'Bulk Create' },
  'trips.noTrips': { ar: 'لا توجد رحلات', en: 'No trips yet' },
  'trips.createFirst': { ar: 'أنشئ رحلتك الأولى', en: 'Create your first trip' },
  'trips.origin': { ar: 'النقطة الأصلية', en: 'Origin' },
  'trips.destination': { ar: 'الوجهة', en: 'Destination' },
  'trips.departure': { ar: 'المغادرة', en: 'Departure' },
  'trips.arrival': { ar: 'الوصول', en: 'Arrival' },
  'trips.price': { ar: 'السعر', en: 'Price' },
  'trips.bus': { ar: 'الباص', en: 'Bus' },
  'trips.status': { ar: 'الحالة', en: 'Status' },
  'trips.bookings': { ar: 'حجز', en: 'bookings' },

  // Trip Status
  'status.scheduled': { ar: 'مجدولة', en: 'Scheduled' },
  'status.inProgress': { ar: 'جارية', en: 'In Progress' },
  'status.completed': { ar: 'مكتملة', en: 'Completed' },
  'status.cancelled': { ar: 'ملغاة', en: 'Cancelled' },

  // Bulk Create
  'bulk.title': { ar: 'إنشاء رحلات متعددة', en: 'Bulk Create Trips' },
  'bulk.subtitle': { ar: 'أنشئ رحلات كثيرة دفعة واحدة', en: 'Create multiple trips at once' },
  'bulk.numTrips': { ar: 'عدد الرحلات', en: 'Number of Trips' },
  'bulk.interval': { ar: 'التكرار', en: 'Interval' },
  'bulk.daily': { ar: 'يومي', en: 'Daily' },
  'bulk.weekly': { ar: 'أسبوعي', en: 'Weekly' },
  'bulk.weekdays': { ar: 'أيام العمل', en: 'Weekdays (Mon-Fri)' },
  'bulk.preview': { ar: 'معاينة', en: 'Preview' },
  'bulk.firstTrips': { ar: 'أول 3 رحلات', en: 'first 3 trips' },
  'bulk.andMore': { ar: 'و المزيد', en: 'more' },

  // Edit Trip
  'editTrip.title': { ar: 'تعديل الرحلة', en: 'Edit Trip' },
  'editTrip.update': { ar: 'تحديث المسار والجدول', en: 'Update route and schedule' },
  'editTrip.save': { ar: 'حفظ التغييرات', en: 'Save Changes' },

  // Bookings
  'bookings.title': { ar: 'الحجوزات', en: 'Bookings' },
  'bookings.all': { ar: 'كل الحجوزات', en: 'All reservations' },
  'bookings.search': { ar: 'ابحث في الحجوزات...', en: 'Search bookings...' },
  'bookings.noBookings': { ar: 'لا توجد حجوزات', en: 'No bookings found' },
  'bookings.noBookingsDesc': { ar: 'الحجوزات هتظهر هنا لما العملاء يحجزوا مقاعد', en: 'Bookings will appear here when customers reserve seats' },
  'bookings.reference': { ar: 'المرجع', en: 'Reference' },
  'bookings.customer': { ar: 'العميل', en: 'Customer' },
  'bookings.route': { ar: 'المسار', en: 'Route' },
  'bookings.seat': { ar: 'المقعد', en: 'Seat' },

  // Search Trips (Customer)
  'search.title': { ar: 'ابحث عن رحلة', en: 'Find a Trip' },
  'search.desc': { ar: 'ابحث عن المسارات المتاحة واحجز مقعدك', en: 'Search for available routes and book your seat' },
  'search.from': { ar: 'من', en: 'From' },
  'search.to': { ar: 'إلى', en: 'To' },
  'search.date': { ar: 'التاريخ', en: 'Date' },
  'search.searchBtn': { ar: 'بحث', en: 'Search' },
  'search.noTrips': { ar: 'مفيش رحلات', en: 'No trips found' },
  'search.tryAgain': { ar: 'جرب تغيّر البحث أو شوف تاني وقت', en: 'Try adjusting your search or check back later' },
  'search.seatsLeft': { ar: 'مقاعد متبقية', en: 'seats left' },
  'search.fullyBooked': { ar: 'مكتملة', en: 'Fully booked' },
  'search.chooseSeat': { ar: 'اختار مقعد', en: 'Choose Seat' },
  'search.soldOut': { ar: 'مفيش مقاعد', en: 'Sold Out' },
  'search.perSeat': { ar: 'للمقعد', en: 'per seat' },

  // Seat Booking
  'seat.select': { ar: 'اختار مقعدك', en: 'Select Your Seat' },
  'seat.available': { ar: 'متاح', en: 'Available' },
  'seat.selected': { ar: 'مختار', en: 'Selected' },
  'seat.reserved': { ar: 'محجوز', en: 'Reserved' },
  'seat.vipSeat': { ar: 'VIP', en: 'VIP' },
  'seat.summary': { ar: 'ملخص الحجز', en: 'Booking Summary' },
  'seat.selectedSeats': { ar: 'المقاعد المختارة', en: 'Selected Seats' },
  'seat.clickSeat': { ar: 'اضغط على مقعد للاختيار', en: 'Click a seat to select' },
  'seat.total': { ar: 'الإجمالي', en: 'Total' },
  'seat.bookBtn': { ar: 'احجز', en: 'Book' },
  'seat.selectFirst': { ar: 'اختار مقعد عشان تكمل', en: 'Select a seat to continue' },
  'seat.cancel': { ar: 'إلغاء مجاني خلال ساعة', en: 'Free cancellation within 1 hour' },

  // Booking Confirmed
  'confirmed.title': { ar: 'تم الحجز بنجاح!', en: 'Booking Confirmed!' },
  'confirmed.desc': { ar: 'تم حجز مقعدك بنجاح', en: 'Your seat has been reserved successfully' },
  'confirmed.totalPaid': { ar: 'إجمالي المدفوع', en: 'Total Paid' },
  'confirmed.bookAnother': { ar: 'احجز مقعد تاني', en: 'Book Another Seat' },

  // Landing
  'landing.title': { ar: 'احجز مقعدك', en: 'Book your seat' },
  'landing.subtitle': { ar: 'في ثواني', en: 'in seconds.' },
  'landing.desc': { ar: 'منصة حجز مقاعد باصات عصرية للرحلات. خرائط مقاعد جميلة، حجز فوري، وتحليلات قوية.', en: 'Modern realtime seat booking platform for transportation companies. Beautiful seat maps, instant reservations, and powerful analytics.' },
  'landing.start': { ar: 'ابدأ مجاناً', en: 'Start Free' },
  'landing.browse': { ar: 'تصفح الرحلات', en: 'Browse Trips' },
  'landing.realtime': { ar: 'حجز لحظي', en: 'Realtime seat booking' },
  'landing.features': { ar: 'كل اللي تحتاجه', en: 'Everything you need' },
  'landing.builtFor': { ar: 'صُممت لشركات النقل الحديثة', en: 'Built for modern transportation companies' },
  'landing.seatMap': { ar: 'خريطة مقاعد تفاعلية', en: 'Interactive Seat Map' },
  'landing.seatMapDesc': { ar: 'العملاء يختاروا المقاعد بصرياً مع توفر لحظي', en: 'Customers select seats visually with real-time availability' },
  'landing.instant': { ar: 'حجز فوري', en: 'Instant Booking' },
  'landing.instantDesc': { ar: 'احجز مقعد في ثواني مع تجربة اختيار سلسة', en: 'Book seats in seconds with animated selection experience' },
  'landing.analytics': { ar: 'تحليلات متقدمة', en: 'Analytics Dashboard' },
  'landing.analyticsDesc': { ar: 'تابع الإيرادات، نسبة الإشغال، واتجاهات الحجوزات', en: 'Track revenue, occupancy, and booking trends' },
  'landing.busMgmt': { ar: 'إدارة الباصات', en: 'Bus Management' },
  'landing.busMgmtDesc': { ar: 'أنشئ باصات وصمم تخطيط المقاعد', en: 'Create buses and design custom seat layouts' },
  'landing.howIt': { ar: 'إزاي يعمل', en: 'How it works' },
  'landing.threeSteps': { ar: 'ثلاث خطوات بسيطة لحجز أفضل', en: 'Three simple steps to better bookings' },
  'landing.createBuses': { ar: 'أنشئ باصات', en: 'Create Buses' },
  'landing.createBusesDesc': { ar: 'أضف أسطولك وصمم تخطيط المقاعد بالـ drag-and-drop', en: 'Add your fleet and design seat layouts with our drag-and-drop builder' },
  'landing.addTrips': { ar: 'أضف رحلات', en: 'Add Trips' },
  'landing.addTripsDesc': { ar: 'حدد المسارات والأوقات والأسعار لكل رحلة', en: 'Set routes, times, and pricing for each journey' },
  'landing.startBooking': { ar: 'ابدأ الحجز', en: 'Start Booking' },
  'landing.startBookingDesc': { ar: 'العملاء يختاروا المقاعد بصرياً ويحجزوا فوراً', en: 'Customers choose seats visually and book instantly' },
  'landing.pricing': { ar: 'أسعار بسيطة', en: 'Simple pricing' },
  'landing.pricingSub': { ar: 'ابدأ مجاناً وطور لما تحتاج أكتر', en: 'Start free, upgrade when you need more' },
  'landing.popular': { ar: 'الأكثر شعبية', en: 'Popular' },
  'landing.perMonth': { ar: '/شهر', en: '/mo' },
  'landing.getStarted': { ar: 'ابدأ الآن', en: 'Get Started' },
  'landing.loved': { ar: 'شركات بتحبه', en: 'Loved by companies' },
  'landing.lovedDesc': { ar: 'موثوق من شركات النقل في مصر', en: 'Trusted by transportation companies across Egypt' },
  'landing.cta': { ar: 'جاهز تحول حجز الباصات؟', en: 'Ready to transform your bus bookings?' },
  'landing.ctaDesc': { ar: 'انضم لمئات الشركات اللي بتستخدم CrushCar', en: 'Join hundreds of companies already using CrushCar' },
  'landing.ctaBtn': { ar: 'ابدأ مجاناً', en: 'Start for Free' },

  // Auth
  'auth.welcome': { ar: 'مرحباً بعودتك', en: 'Welcome back' },
  'auth.signInAccount': { ar: 'سجل دخولك', en: 'Sign in to your account' },
  'auth.email': { ar: 'البريد الإلكتروني', en: 'Email' },
  'auth.password': { ar: 'كلمة المرور', en: 'Password' },
  'auth.noAccount': { ar: 'مفيش حساب؟', en: "Don't have an account?" },
  'auth.createOne': { ar: 'أنشئ حساب', en: 'Create one' },
  'auth.createAccount': { ar: 'أنشئ حساب', en: 'Create account' },
  'auth.joinToday': { ar: 'انضم لـ CrushCar اليوم', en: 'Join CrushCar today' },
  'auth.fullName': { ar: 'الاسم الكامل', en: 'Full Name' },
  'auth.iAm': { ar: 'أنا...', en: 'I am a...' },
  'auth.customer': { ar: 'عميل (أحجز مقاعد)', en: 'Customer (book seats)' },
  'auth.companyAdmin': { ar: 'مدير شركة (إدارة الباصات والرحلات)', en: 'Company Admin (manage buses & trips)' },
  'auth.companyIdLabel': { ar: 'رقم الشركة', en: 'Company ID' },
  'auth.askAdmin': { ar: 'اسأل المدير عن هذا', en: 'Ask your admin for this' },
  'auth.alreadyAccount': { ar: 'عندك حساب؟', en: 'Already have an account?' },
  'auth.signIn': { ar: 'تسجيل الدخول', en: 'Sign in' },
  'auth.demoAccounts': { ar: 'حسابات تجريبية', en: 'Demo accounts' },
  'auth.admin': { ar: 'مدير', en: 'Admin' },
  'auth.user': { ar: 'مستخدم', en: 'User' },

  // Common
  'common.loading': { ar: 'جارِ التحميل...', en: 'Loading...' },
  'common.error': { ar: 'خطأ', en: 'Error' },
  'common.success': { ar: 'نجاح', en: 'Success' },
  'common.cancel': { ar: 'إلغاء', en: 'Cancel' },
  'common.save': { ar: 'حفظ', en: 'Save' },
  'common.delete': { ar: 'حذف', en: 'Delete' },
  'common.edit': { ar: 'تعديل', en: 'Edit' },
  'common.confirm': { ar: 'تأكيد', en: 'Confirm' },
  'common.confirmed': { ar: 'مؤكد', en: 'Confirmed' },
  'common.pending': { ar: 'معلق', en: 'Pending' },
  'common.cancelled': { ar: 'ملغى', en: 'Cancelled' },
  'common.guest': { ar: 'زائر', en: 'Guest' },
  'common.currency': { ar: 'ج.م', en: 'EGP' },
}

export const useLangStore = create<LangState>()(
  persist(
    (set, get) => ({
      lang: 'ar',
      setLang: (lang) => set({ lang }),
      t: (key) => translations[key]?.[get().lang] || key,
    }),
    { name: 'crushcar-lang' }
  )
)