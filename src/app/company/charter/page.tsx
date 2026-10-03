'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Bus, MapPin, Clock, ArrowRight, History, Search } from 'lucide-react';
import { useLangStore } from '@/lib/lang';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { V2StatusBadge, V2EmptyState, V2Skeleton } from '@/components/v2/ui';
import { V2Button } from '@/components/v2/Button';

interface CharterTrip {
  id: string;
  origin: string;
  destination: string;
  departure: string;
  arrival: string;
  busPrice: number | null;
  price: number;
  bus: { name: string; type: string; seatCount: number };
  tripStops: { station: { name: string }; stopOrder: number }[];
}

export default function CharterTripsPage() {
  const router = useRouter();
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';
  const locale = isRTL ? 'ar-EG' : 'en-US';

  const [trips, setTrips] = useState<CharterTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [stations, setStations] = useState<{ id: string; name: string; city: string }[]>([]);
  const [fromStationId, setFromStationId] = useState('');
  const [toStationId, setToStationId] = useState('');

  useEffect(() => {
    fetch('/api/stations', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setStations(d.stations || []))
      .catch(() => {});
    loadTrips();
  }, []);

  async function loadTrips(fId?: string, tId?: string) {
    setLoading(true);
    const params = new URLSearchParams();
    if (fId) params.set('fromStationId', fId);
    if (tId) params.set('toStationId', tId);
    try {
      const res = await fetch(`/api/company/charter/trips?${params}`, { credentials: 'include' });
      const data = await res.json();
      setTrips(data.data || []);
    } catch {
      setTrips([]);
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    loadTrips(fromStationId, toStationId);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#0B1B33]">
            {isRTL ? 'رحلات الشارتر (حجز الباص بالكامل)' : 'Charter Trips (Full Bus)'}
          </h1>
          <p className="text-sm text-[var(--sp-text-muted)] mt-1">
            {isRTL
              ? 'اختر رحلة لحجز الأتوبيس بالكامل حصرياً لشركتك'
              : 'Select a scheduled trip to charter the entire bus for your company'}
          </p>
        </div>

        <Link
          href="/company/charter/history"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--sp-card)] border border-[var(--sp-line)] text-xs font-bold text-[#0B1B33] hover:bg-slate-50 transition shadow-sm self-start sm:self-auto"
        >
          <History size={16} className="text-[#1D5BD8]" />
          <span>{isRTL ? 'سجل طلبات الشارتر' : 'Charter Requests History'}</span>
        </Link>
      </div>

      {/* Filter / Search Bar */}
      <form onSubmit={handleSearch} className="rounded-2xl border border-[var(--sp-line)] bg-[var(--sp-card)] p-4 md:p-5 shadow-sm">
        <div className="grid sm:grid-cols-3 gap-3 items-end">
          <div>
            <label className="block text-xs font-bold text-[var(--sp-text-muted)] mb-1.5">
              {isRTL ? 'محطة الانطلاق' : 'Origin Station'}
            </label>
            <select
              value={fromStationId}
              onChange={(e) => setFromStationId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--sp-inset)] border border-[var(--sp-line)] text-xs font-semibold text-[#0B1B33] focus:outline-none focus:border-[#1D5BD8]"
            >
              <option value="">{isRTL ? 'كل المحطات' : 'All Stations'}</option>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.city})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--sp-text-muted)] mb-1.5">
              {isRTL ? 'محطة الوصول' : 'Destination Station'}
            </label>
            <select
              value={toStationId}
              onChange={(e) => setToStationId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--sp-inset)] border border-[var(--sp-line)] text-xs font-semibold text-[#0B1B33] focus:outline-none focus:border-[#1D5BD8]"
            >
              <option value="">{isRTL ? 'كل المحطات' : 'All Stations'}</option>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.city})
                </option>
              ))}
            </select>
          </div>

          <div>
            <button
              type="submit"
              className="w-full py-2.5 px-4 rounded-xl bg-[#0A1E3C] hover:bg-[#153465] text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm"
            >
              <Search size={14} />
              <span>{isRTL ? 'بحث الرحلات' : 'Filter Trips'}</span>
            </button>
          </div>
        </div>
      </form>

      {/* Trips List */}
      {loading ? (
        <div className="grid md:grid-cols-2 gap-4">
          <V2Skeleton className="h-44 rounded-2xl" />
          <V2Skeleton className="h-44 rounded-2xl" />
        </div>
      ) : trips.length === 0 ? (
        <V2EmptyState
          title={isRTL ? 'لا توجد رحلات شارتر متاحة' : 'No charter trips available'}
          desc={isRTL ? 'لم يتم العثور على رحلات مخصصة لحجز الباص بالكامل في هذا الوقت' : 'No trips currently available for full bus charter'}
        />
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {trips.map((trip, i) => {
            const displayPrice = trip.busPrice || trip.price || 0;
            return (
              <motion.div
                key={trip.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="rounded-2xl border border-[var(--sp-line)] bg-[var(--sp-card)] p-5 shadow-sm flex flex-col justify-between hover:border-[#1D5BD8]/40 transition group"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <V2StatusBadge tone="blue">
                      <span className="flex items-center gap-1">
                        <Bus size={12} />
                        {trip.bus.type} ({trip.bus.seatCount} {isRTL ? 'مقعد' : 'seats'})
                      </span>
                    </V2StatusBadge>
                    <span className="text-xs font-bold text-[var(--sp-text-muted)]">
                      {trip.bus.name}
                    </span>
                  </div>

                  <h3 className="text-lg font-extrabold text-[#0B1B33] flex items-center gap-2 mb-2">
                    <MapPin size={16} className="text-[#1D5BD8] shrink-0" />
                    <span>{trip.origin}</span>
                    <span className="text-slate-400 mx-1">{isRTL ? '←' : '→'}</span>
                    <span>{trip.destination}</span>
                  </h3>

                  <div className="text-xs text-[var(--sp-text-muted)] flex flex-wrap items-center gap-2 mb-4 font-medium">
                    <Clock size={13} className="text-[#1D5BD8]" />
                    <span>
                      {new Date(trip.departure).toLocaleDateString(locale, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                    <span>•</span>
                    <span>
                      {new Date(trip.departure).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-4 flex items-center justify-between gap-3">
                  <div>
                    <span className="text-[11px] text-[var(--sp-text-muted)] block font-medium">
                      {isRTL ? 'سعر الأتوبيس بالكامل' : 'Charter Bus Price'}
                    </span>
                    <span className="text-xl font-extrabold text-emerald-600">
                      {Number(displayPrice).toLocaleString(locale)} <span className="text-xs font-bold text-[var(--sp-text-muted)]">{t('common.currency')}</span>
                    </span>
                  </div>

                  <Link
                    href={`/company/charter/${trip.id}`}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#0A1E3C] hover:bg-[#153465] text-white text-xs font-bold transition shadow-sm group-hover:bg-[#1D5BD8]"
                  >
                    <span>{isRTL ? 'حجز الأتوبيس' : 'Charter Bus'}</span>
                    <ArrowRight className="size-3.5 rotate-180 v2-flip-rtl" />
                  </Link>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
