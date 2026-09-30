/* MOCK ONLY — static dashboard preview. No API, no recharts. */

export const mockDashboard = {
  totalBookings: 24,
  bookingsDelta: '+12%',
  activeTrips: 6,
  tripsDelta: '+20%',
  totalSpent: 48500,
  spentDelta: '+15%',
  sparkline: [8, 10, 9, 14, 13, 18, 16, 22, 26, 24, 30, 34],
  recent: [
    { id: 'r1', titleEn: 'Cairo → Alexandria', titleAr: 'القاهرة ← الإسكندرية', metaEn: 'May 12, 2025 · 45 passengers', metaAr: '12 مايو 2025 · 45 مسافر', statusEn: 'Confirmed', statusAr: 'مؤكد' },
    { id: 'r2', titleEn: 'Cairo → Hurghada', titleAr: 'القاهرة ← الغردقة', metaEn: 'May 10, 2025 · 38 passengers', metaAr: '10 مايو 2025 · 38 مسافر', statusEn: 'Confirmed', statusAr: 'مؤكد' },
  ],
};
