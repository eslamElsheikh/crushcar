'use client';
import { LayoutDashboard, Bus, Users, BarChart3, Settings } from 'lucide-react';
import type { PreviewLang } from '../data/copy';
import { previewCopy } from '../data/copy';
import { mockDashboard } from '../data/mockDashboard';

/* Simplified mock: fewer, larger data points — readable, not a tiny screenshot. */
export function DashboardPreview({ lang }: { lang: PreviewLang }) {
  const t = previewCopy[lang];
  const pts = mockDashboard.sparkline;
  const path = pts.map((v, i) => `${(i / (pts.length - 1)) * 220},${44 - (v / 36) * 38}`).join(' L ');
  const nav = [
    { icon: LayoutDashboard, en: 'Dashboard', ar: 'لوحة التحكم', active: true },
    { icon: Bus, en: 'Bookings', ar: 'الحجوزات', active: false },
    { icon: Users, en: 'Users', ar: 'المستخدمون', active: false },
    { icon: BarChart3, en: 'Reports', ar: 'التقارير', active: false },
    { icon: Settings, en: 'Settings', ar: 'الإعدادات', active: false },
  ];
  return (
    <div className="overflow-hidden rounded-2xl border border-[#E6EBF2] bg-white shadow-[0_24px_64px_rgba(11,27,51,0.14)]" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="flex min-h-[420px]">
        <div className="hidden w-44 shrink-0 flex-col gap-1.5 bg-[#0A1E3C] p-4 sm:flex">
          <div className="flex items-center gap-2 px-2 py-2.5">
            <span className="grid size-7 place-items-center rounded-md bg-[#1D5BD8] text-[13px] font-black text-white">S</span>
            <span className="text-[13px] font-bold text-white">Safro <span className="font-medium text-white/60">Business</span></span>
          </div>
          {nav.map((n) => (
            <span key={n.en} className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] font-semibold ${n.active ? 'bg-white/12 text-white' : 'text-white/60'}`}>
              <n.icon className="size-4" /> {lang === 'ar' ? n.ar : n.en}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1 p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-balance text-[17px] font-extrabold text-[#0B1B33]">{t.dashTitle}</p>
            <span className="grid size-9 place-items-center rounded-full bg-[#EFF4FF] text-[12px] font-bold text-[#1D5BD8]">MH</span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {[
              { label: t.totalBookings, value: String(mockDashboard.totalBookings), delta: mockDashboard.bookingsDelta },
              { label: t.activeTrips, value: String(mockDashboard.activeTrips), delta: mockDashboard.tripsDelta },
              { label: t.totalSpent, value: mockDashboard.totalSpent.toLocaleString('en-US'), delta: mockDashboard.spentDelta },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-slate-100 bg-[#F8FAFD] p-3.5">
                <p className="truncate text-[12.5px] font-semibold text-[#5B6B84]">{s.label}</p>
                <p className="mt-1.5 text-[19px] font-extrabold tabular-nums text-[#0B1B33]">
                  {s.value} <span className="text-[11.5px] font-bold text-emerald-600">{s.delta}</span>
                </p>
              </div>
            ))}
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-[1.2fr_1fr]">
            <div className="rounded-xl border border-slate-100 p-4">
              <p className="text-[13px] font-bold text-[#0B1B33]">{t.overview}</p>
              <svg viewBox="0 0 220 48" className="mt-3 h-20 w-full" preserveAspectRatio="none" aria-hidden="true">
                <path d={`M 0,${44 - (pts[0] / 36) * 38} L ${path}`} fill="none" stroke="#1D5BD8" strokeWidth="2.5" strokeLinecap="round" />
                <path d={`M 0,${44 - (pts[0] / 36) * 38} L ${path} L 220,48 L 0,48 Z`} fill="rgba(29,91,216,0.08)" stroke="none" />
              </svg>
            </div>
            <div className="rounded-xl border border-slate-100 p-4">
              <p className="text-[13px] font-bold text-[#0B1B33]">{t.recent}</p>
              <div className="mt-3 grid gap-3">
                {mockDashboard.recent.map((r) => (
                  <div key={r.id} className="flex items-center gap-2.5">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-slate-100 text-[12px] font-bold text-slate-500">
                      {(lang === 'ar' ? r.titleAr : r.titleEn).slice(0, 1)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-bold text-[#0B1B33]">{lang === 'ar' ? r.titleAr : r.titleEn}</span>
                      <span className="mt-0.5 block truncate text-[12px] text-slate-500">{lang === 'ar' ? r.metaAr : r.metaEn}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-center text-[12px] font-semibold text-amber-700">{t.mockNote}</p>
        </div>
      </div>
    </div>
  );
}
