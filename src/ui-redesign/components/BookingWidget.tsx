'use client';
import { useState } from 'react';
import { MapPin, CalendarDays, Users, ArrowLeftRight, Search, Building2, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PreviewLang } from '../data/copy';
import { previewCopy } from '../data/copy';

export function BookingWidget({ lang }: { lang: PreviewLang }) {
  const t = previewCopy[lang];
  const [mode, setMode] = useState<'b2c' | 'b2b'>('b2c');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  return (
    <div className="rounded-2xl bg-white p-2.5 shadow-[0_24px_64px_rgba(11,27,51,0.25)]">
      <div className="flex gap-1 rounded-xl bg-[#F1F4F9] p-1.5" role="tablist" aria-label="Trip type">
        {(
          [
            { key: 'b2c', icon: User, label: t.individual },
            { key: 'b2b', icon: Building2, label: t.business },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={mode === tab.key}
            onClick={() => setMode(tab.key)}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-3 text-[14.5px] font-bold transition',
              mode === tab.key ? 'bg-[#0A1E3C] text-white shadow' : 'text-[#5B6B84]'
            )}
          >
            <tab.icon className="size-5" /> {tab.label}
          </button>
        ))}
      </div>

      {mode === 'b2c' ? (
        <div className="grid gap-3 p-2.5 md:grid-cols-[1fr_1fr_1fr_1fr_auto] md:items-end">
          <label className="grid gap-2">
            <span className="px-1 text-[13px] font-bold text-[#0B1B33]">{t.from}</span>
            <span className="relative">
              <MapPin className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-[#9AA8BD]" />
              <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder={t.fromPh} className="sp-input ps-11" />
            </span>
          </label>
          <label className="grid gap-2">
            <span className="flex items-center justify-between px-1 text-[13px] font-bold text-[#0B1B33]">
              {t.to}
              <button
                type="button"
                aria-label="Swap origin and destination"
                onClick={() => { setFrom(to); setTo(from); }}
                className="grid size-7 place-items-center rounded-full border border-slate-200 text-[#1D5BD8] hover:bg-slate-50"
              >
                <ArrowLeftRight className="size-4 sp-flip-rtl" />
              </button>
            </span>
            <span className="relative">
              <MapPin className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-[#9AA8BD]" />
              <input value={to} onChange={(e) => setTo(e.target.value)} placeholder={t.toPh} className="sp-input ps-11" />
            </span>
          </label>
          <label className="grid gap-2">
            <span className="px-1 text-[13px] font-bold text-[#0B1B33]">{t.date}</span>
            <span className="relative">
              <CalendarDays className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-[#9AA8BD]" />
              <input type="date" aria-label={t.date} className="sp-input ps-11 tabular-nums" />
            </span>
          </label>
          <label className="grid gap-2">
            <span className="px-1 text-[13px] font-bold text-[#0B1B33]">{t.passengers}</span>
            <span className="relative">
              <Users className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-[#9AA8BD]" />
              <select aria-label={t.passengers} className="sp-input appearance-none ps-11 tabular-nums" defaultValue="1">
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4+">4+</option>
              </select>
            </span>
          </label>
          <button className="sp-btn-primary flex items-center justify-center gap-2 px-7 text-[15px] min-h-[52px] lg:min-h-[60px] lg:px-8">
            <Search className="size-5 sp-flip-rtl" /> {t.searchTrips}
          </button>
        </div>
      ) : (
        <div className="grid gap-3 p-2.5 md:grid-cols-3 md:items-end">
          <p className="rounded-xl bg-[#EFF4FF] px-4 py-2.5 text-[14px] font-bold text-[#1D5BD8] md:col-span-3">{t.charter}</p>
          <label className="grid gap-2">
            <span className="px-1 text-[13px] font-bold text-[#0B1B33]">{t.pickup}</span>
            <input placeholder={t.fromPh} aria-label={t.pickup} className="sp-input" />
          </label>
          <label className="grid gap-2">
            <span className="px-1 text-[13px] font-bold text-[#0B1B33]">{t.destination}</span>
            <input placeholder={t.toPh} aria-label={t.destination} className="sp-input" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-2">
              <span className="px-1 text-[13px] font-bold text-[#0B1B33]">{t.travelDate}</span>
              <input type="date" aria-label={t.travelDate} className="sp-input tabular-nums" />
            </label>
            <label className="grid gap-2">
              <span className="px-1 text-[13px] font-bold text-[#0B1B33]">{t.tripType}</span>
              <select aria-label={t.tripType} className="sp-input" defaultValue="oneway">
                <option value="oneway">{t.oneWay}</option>
                <option value="round">{t.roundTrip}</option>
              </select>
            </label>
          </div>
          <button className="sp-btn-dark px-7 text-[15px] min-h-[52px] md:col-span-3 lg:min-h-[60px]">{t.requestBus}</button>
        </div>
      )}
    </div>
  );
}
