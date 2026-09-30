export type PreviewLang = 'ar' | 'en';

/* Local prototype copy only. NOT connected to production lang.ts / useLangStore. */
export const previewCopy: Record<
  PreviewLang,
  {
    navExplore: string;
    navTrips: string;
    navDestinations: string;
    navBusiness: string;
    login: string;
    bookTrip: string;
    heroEyebrow: string;
    heroTitleA: string;
    heroTitleB: string;
    heroSubtitle: string;
    individual: string;
    business: string;
    from: string;
    to: string;
    date: string;
    passengers: string;
    pickup: string;
    destination: string;
    travelDate: string;
    tripType: string;
    charter: string;
    oneWay: string;
    roundTrip: string;
    searchTrips: string;
    requestBus: string;
    fromPh: string;
    toPh: string;
    datePh: string;
    trustRoutes: string;
    trustRoutesSub: string;
    trustStations: string;
    trustStationsSub: string;
    trustSecure: string;
    trustSecureSub: string;
    trustGreen: string;
    trustGreenSub: string;
    popularTitle: string;
    popularSub: string;
    exploreAll: string;
    fromPrice: string;
    howEyebrow: string;
    howTitle: string;
    howSub: string;
    howCta: string;
    how1t: string;
    how1d: string;
    how2t: string;
    how2d: string;
    how3t: string;
    how3d: string;
    how4t: string;
    how4d: string;
    featTitle: string;
    featSub: string;
    viewAll: string;
    direct: string;
    perPassenger: string;
    selectTrip: string;
    b2bEyebrow: string;
    b2bTitle: string;
    b2bSub: string;
    b2bCta: string;
    b2bSideTitle: string;
    b2bSideSub: string;
    b2bSideCta: string;
    dashTitle: string;
    totalBookings: string;
    activeTrips: string;
    totalSpent: string;
    overview: string;
    recent: string;
    footerTag: string;
    quickLinks: string;
    support: string;
    stayLoop: string;
    staySub: string;
    emailPh: string;
    rights: string;
    mockNote: string;
  }
> = {
  ar: {
    navExplore: 'استكشف',
    navTrips: 'الرحلات',
    navDestinations: 'الوجهات',
    navBusiness: 'للشركات',
    login: 'تسجيل الدخول',
    bookTrip: 'احجز رحلة',
    heroEyebrow: 'سفر للجميع',
    heroTitleA: 'سافر أبعد',
    heroTitleB: 'معًا.',
    heroSubtitle: 'رحلات باص مريحة داخل مصر — لك، أو لمجموعتك، أو لشركتك.',
    individual: 'للأفراد',
    business: 'للشركات (B2B)',
    from: 'من',
    to: 'إلى',
    date: 'التاريخ',
    passengers: 'المسافرون',
    pickup: 'مكان التحرك',
    destination: 'الوجهة',
    travelDate: 'تاريخ السفر',
    tripType: 'نوع الرحلة',
    charter: 'احجز أتوبيسًا كاملًا',
    oneWay: 'ذهاب فقط',
    roundTrip: 'ذهاب وعودة',
    searchTrips: 'ابحث عن الرحلات',
    requestBus: 'اطلب أتوبيس',
    fromPh: 'مثال: القاهرة',
    toPh: 'مثال: المنصورة',
    datePh: 'اختر التاريخ',
    trustRoutes: '+120 مسار',
    trustRoutesSub: 'داخل مصر',
    trustStations: '+40 محطة',
    trustStationsSub: 'في المدن الكبرى',
    trustSecure: 'حجز آمن',
    trustSecureSub: 'سلامتك أولًا',
    trustGreen: 'سفر صديق للبيئة',
    trustGreenSub: 'بصمة كربونية أقل',
    popularTitle: 'الوجهات الأكثر شعبية',
    popularSub: 'اكتشف أماكن مذهلة، وسافر إليها براحة.',
    exploreAll: 'استكشف كل الوجهات',
    fromPrice: 'ابتداءً من',
    howEyebrow: 'كيف يعمل سفرو',
    howTitle: 'خطوات بسيطة. حجز سهل.',
    howSub: 'اختر مسارك، وقارن الخيارات، واحجز مقعدك، واستلم تذكرتك في دقائق.',
    howCta: 'احجز رحلة',
    how1t: 'ابحث',
    how1d: 'أدخل مدينتك وتاريخك وعدد المسافرين.',
    how2t: 'قارن',
    how2d: 'شاهد الأتوبيسات والأسعار والخدمات.',
    how3t: 'اختر مقعدك',
    how3d: 'اختر الأتوبيس والمقعد المناسب لك.',
    how4t: 'ادفع واستلم',
    how4d: 'دفع آمن وتذكرة إلكترونية فورية.',
    featTitle: 'رحلات مميزة',
    featSub: 'أتوبيسات مريحة. شركات موثوقة. مواعيد مرنة.',
    viewAll: 'عرض كل الرحلات',
    direct: 'مباشر',
    perPassenger: '/ للمسافر',
    selectTrip: 'اختر الرحلة',
    b2bEyebrow: 'حلول الشركات',
    b2bTitle: 'أتوبيسات خاصة. بسّط سفر مجموعتك.',
    b2bSub: 'للشركات والمدارس والمؤسسات — احجز أتوبيسات كاملة ونظّم رحلاتك بدعم مخصص، كل ذلك من مكان واحد.',
    b2bCta: 'اكتشف حلول الشركات',
    b2bSideTitle: 'أدر أسطولك وفريقك من لوحة واحدة.',
    b2bSideSub: 'تحديثات لحظية وتقارير مفصلة وتحكم كامل — مصمم للشركات.',
    b2bSideCta: 'اطلب عرضًا تجريبيًا',
    dashTitle: 'لوحة التحكم',
    totalBookings: 'إجمالي الحجوزات',
    activeTrips: 'رحلات نشطة',
    totalSpent: 'إجمالي الإنفاق',
    overview: 'نظرة على الحجوزات',
    recent: 'الحجوزات الأخيرة',
    footerTag: 'رحلات أكثر. إمكانيات أكبر.',
    quickLinks: 'روابط سريعة',
    support: 'الدعم',
    stayLoop: 'ابق على اطلاع',
    staySub: 'أحدث المسارات والعروض ونصائح السفر.',
    emailPh: 'بريدك الإلكتروني',
    rights: '© 2026 سفرو. جميع الحقوق محفوظة.',
    mockNote: 'بيانات تجريبية للمعاينة فقط',
  },
  en: {
    navExplore: 'Explore',
    navTrips: 'Trips',
    navDestinations: 'Destinations',
    navBusiness: 'For Businesses',
    login: 'Login',
    bookTrip: 'Book a trip',
    heroEyebrow: 'TRAVEL FOR EVERYONE',
    heroTitleA: 'Go further',
    heroTitleB: 'together.',
    heroSubtitle: 'Comfortable bus travel across Egypt — for yourself, your group, or your business.',
    individual: 'Individual',
    business: 'Business (B2B)',
    from: 'From',
    to: 'To',
    date: 'Date',
    passengers: 'Passengers',
    pickup: 'Pickup location',
    destination: 'Destination',
    travelDate: 'Travel date',
    tripType: 'Trip type',
    charter: 'Book an entire bus',
    oneWay: 'One way',
    roundTrip: 'Round trip',
    searchTrips: 'Search trips',
    requestBus: 'Request a bus',
    fromPh: 'e.g. Cairo',
    toPh: 'e.g. Mansoura',
    datePh: 'Select date',
    trustRoutes: '120+ routes',
    trustRoutesSub: 'Across Egypt',
    trustStations: '40+ stations',
    trustStationsSub: 'In major cities',
    trustSecure: 'Secure booking',
    trustSecureSub: 'Your safety matters',
    trustGreen: 'Greener travel',
    trustGreenSub: 'Lower carbon footprint',
    popularTitle: 'Popular destinations',
    popularSub: 'Discover amazing places, and get there comfortably.',
    exploreAll: 'Explore all destinations',
    fromPrice: 'From',
    howEyebrow: 'HOW IT WORKS',
    howTitle: 'Simple steps. Easy booking.',
    howSub: 'Find your route, compare options, choose your seat, and get your ticket in minutes.',
    howCta: 'Book a trip',
    how1t: 'Search',
    how1d: 'Enter your cities, date and passengers.',
    how2t: 'Compare',
    how2d: 'See available buses, prices and amenities.',
    how3t: 'Choose seat',
    how3d: 'Pick your preferred seat in real time.',
    how4t: 'Pay & get ticket',
    how4d: 'Secure payment and instant e-ticket.',
    featTitle: 'Featured trips',
    featSub: 'Comfortable buses. Trusted operators. Flexible schedules.',
    viewAll: 'View all trips',
    direct: 'Direct',
    perPassenger: '/ passenger',
    selectTrip: 'Select trip',
    b2bEyebrow: 'B2B SOLUTIONS',
    b2bTitle: 'Charter buses. Simplify your group travel.',
    b2bSub: 'For companies, schools, and organizations — book full buses, manage trips, and get dedicated support, all in one place.',
    b2bCta: 'Explore B2B Solutions',
    b2bSideTitle: 'Manage your fleet and team from one dashboard.',
    b2bSideSub: 'Real-time updates, detailed reports, and complete control — built for businesses.',
    b2bSideCta: 'Request a demo',
    dashTitle: 'Dashboard',
    totalBookings: 'Total Bookings',
    activeTrips: 'Active Trips',
    totalSpent: 'Total Spent',
    overview: 'Bookings Overview',
    recent: 'Recent Bookings',
    footerTag: 'More journeys. Bigger possibilities.',
    quickLinks: 'Quick links',
    support: 'Support',
    stayLoop: 'Stay in the loop',
    staySub: 'Get the latest routes, offers and travel tips.',
    emailPh: 'Your email address',
    rights: '© 2026 Safro. All rights reserved.',
    mockNote: 'Mock demo data for preview only',
  },
};
