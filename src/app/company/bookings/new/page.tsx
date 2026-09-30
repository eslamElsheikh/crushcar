'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, Search, Loader2, ArrowRight, User, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useLangStore } from '@/lib/lang';
import { V2Field, V2Select, V2Input } from '@/components/v2/Field';
import { V2Button } from '@/components/v2/Button';
import { V2StatusBadge, V2Skeleton, V2NoResults } from '@/components/v2/ui';
import { V2Trip, unavailableForSegment, segmentPrice, V2SeatMap } from '@/components/v2/booking';

/* V2 company new booking — same 3-step + POST /api/company/bookings as V1. */

interface Station { id: string; name: string; city: string }

export default function CompanyNewBookingPage() {
  const router = useRouter();
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';
  const locale = isRTL ? 'ar-EG' : 'en-US';

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [stations, setStations] = useState<Station[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [credit, setCredit] = useState<any>(null);
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [date, setDate] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [bookingType, setBookingType] = useState<'FOR_EMPLOYEE' | 'FOR_CLIENT'>('FOR_EMPLOYEE');

  const [trips, setTrips] = useState<V2Trip[]>([]);
  const [searching, setSearching] = useState(false);
  const [trip, setTrip] = useState<V2Trip | null>(null);
  const [loadingTrip, setLoadingTrip] = useState(false);
  const [seats, setSeats] = useState<string[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [phones, setPhones] = useState<Record<string, string>>({});
  const [hotels, setHotels] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch('/api/stations', { credentials: 'include' }).then((r) => r.json()).then((d) => setStations(d.stations || [])).catch(() => {});
    fetch('/api/company/credit', { credentials: 'include' }).then((r) => r.json()).then(setCredit).catch(() => {});
    fetch('/api/company/customers?take=100', { credentials: 'include' }).then((r) => r.json()).then((d) => setCustomers(d.data || [])).catch(() => {});
  }, []);

  async function search() {
    if (!fromId || !toId || !date) {
      toast.error(isRTL ? 'اختر المحطات والتاريخ' : 'Pick stations and date');
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/trips?fromStationId=${fromId}&toStationId=${toId}&date=${date}&all=true`, { credentials: 'include' });
      const json = await res.json();
      setTrips(Array.isArray(json.data) ? json.data : []);
      setStep(2);
    } catch {
      toast.error(t('common.error'));
    } finally {
      setSearching(false);
    }
  }

  async function pickTrip(id: string) {
    setLoadingTrip(true);
    try {
      const res = await fetch(`/api/trips/${id}`, { credentials: 'include' });
      if (res.ok) {
        setTrip(await res.json());
        setSeats([]);
      }
    } catch { /* keep list */ } finally { setLoadingTrip(false); }
  }

  const reserved = unavailableForSegment(trip, fromId || null, toId || null);
  const seg = segmentPrice(trip, fromId || null, toId || null);
  const priceOf = (label: string) => seg + (trip?.bus?.layout?.seats.find((s) => s.label === label)?.price || 0);
  const total = seats.reduce((s, l) => s + priceOf(l), 0);

  async function submit() {
    if (!trip || seats.length === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/company/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          tripId: trip.id,
          passengers: seats.map((seatLabel) => ({
            seatLabel,
            passengerName: names[seatLabel] || '',
            passengerPhone: phones[seatLabel] || '',
            passengerHotel: hotels[seatLabel] || '',
          })),
          fromStationId: fromId || null,
          toStationId: toId || null,
          customerId: customerId || null,
          bookingType,
        }),
      });
      const data = await res.json();
      if (res.ok && data.bookings?.[0]) {
        router.push(`/company/bookings/${data.bookings[0].id}`);
      } else {
        toast.error(data.error || t('common.error'));
      }
    } catch {
      toast.error(t('common.error'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1 className="text-balance text-[26px] font-extrabold text-[#0B1B33] md:text-[32px]">{t('company.newBooking')}</h1>
      <ol className="mt-4 flex items-center gap-1.5" aria-label="Steps">
        {[1, 2, 3].map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <span className={cn(
              'rounded-full px-3.5 py-2 text-[13px] font-bold tabular-nums',
              s < step && 'bg-emerald-50 text-emerald-700',
              s === step && 'bg-[#0A1E3C] text-white',
              s > step && 'bg-white text-[#5B6B84] ring-1 ring-slate-200'
            )}>
              {s}
            </span>
            {s < 3 && <ArrowRight className="size-4 text-slate-300 v2-flip-rtl" aria-hidden="true" />}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <div className="mt-5 rounded-2xl border border-[#E6EBF2] bg-white p-5 md:p-6">
          {credit && (
            <p className="mb-4 flex items-center gap-2 rounded-xl bg-[#F6F8FC] px-4 py-3 text-[13.5px] font-semibold tabular-nums text-[#0B1B33]">
              <Wallet className="size-5 text-emerald-600" />
              {t('company.walletBalance')}: {Number(credit.walletBalance || 0).toLocaleString(locale)} EGP
            </p>
          )}
          <div className="grid gap-3.5 md:grid-cols-2">
            <V2Field label={t('v2.from')}>
              <V2Select value={fromId} onChange={(e) => setFromId(e.target.value)}>
                <option value="">{t('v2.fromPh')}</option>
                {stations.map((s) => <option key={s.id} value={s.id}>{s.name}{s.city ? ` — ${s.city}` : ''}</option>)}
              </V2Select>
            </V2Field>
            <V2Field label={t('v2.to')}>
              <V2Select value={toId} onChange={(e) => setToId(e.target.value)}>
                <option value="">{t('v2.toPh')}</option>
                {stations.map((s) => <option key={s.id} value={s.id}>{s.name}{s.city ? ` — ${s.city}` : ''}</option>)}
              </V2Select>
            </V2Field>
            <V2Field label={t('v2.date')}>
              <V2Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="tabular-nums" />
            </V2Field>
            <V2Field label={t('company.selectCustomer')}>
              <V2Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">{t('company.newCustomer')}</option>
                {customers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </V2Select>
            </V2Field>
          </div>
          <div className="mt-3.5">
            <p className="px-1 text-[13px] font-bold text-[#0B1B33]">{t('company.bookingType')}</p>
            <div className="mt-2 flex gap-1 rounded-xl bg-[#F1F4F9] p-1.5">
              {(['FOR_EMPLOYEE', 'FOR_CLIENT'] as const).map((bt) => (
                <button
                  key={bt} onClick={() => setBookingType(bt)} aria-pressed={bookingType === bt}
                  className={cn('flex-1 rounded-lg px-4 py-2.5 text-[14px] font-bold transition', bookingType === bt ? 'bg-[#0A1E3C] text-white shadow' : 'text-[#5B6B84]')}
                >
                  {bt === 'FOR_EMPLOYEE' ? t('company.forEmployee') : t('company.forClient')}
                </button>
              ))}
            </div>
          </div>
          <V2Button size="lg" disabled={searching} onClick={search} className="mt-5 w-full sm:w-auto">
            {searching && <Loader2 className="size-5 animate-spin" />}
            <Search className="size-5 v2-flip-rtl" /> {t('v2.searchTrips')}
          </V2Button>
        </div>
      )}

      {step === 2 && (
        <div className="mt-5 grid items-start gap-5 lg:grid-cols-[1fr_360px]">
          <div className="grid gap-3">
            {trips.length === 0 ? (
              <V2NoResults title={t('v2.noTrips')} actionLabel={t('v2.back')} onAction={() => setStep(1)} />
            ) : trips.map((tr) => {
              const active = trip?.id === tr.id;
              const left = (tr.bus?.layout?.seats.length || 0) - (tr.bookings?.length || 0) - (tr.companyBookings?.length || 0);
              return (
                <button
                  key={tr.id} onClick={() => pickTrip(tr.id)} aria-pressed={active}
                  className={cn('rounded-2xl border bg-white p-5 text-start transition', active ? 'border-[#1D5BD8] shadow-[0_0_0_3px_rgba(29,91,216,0.15)]' : 'border-[#E6EBF2] hover:border-[#1D5BD8]/40')}
                >
                  <p className="text-[16px] font-extrabold text-[#0B1B33]">
                    {isRTL ? `${tr.destination} ← ${tr.origin}` : `${tr.origin} → ${tr.destination}`}
                  </p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] tabular-nums text-[#5B6B84]">
                    <span>{new Date(tr.departure).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })} · {tr.bus?.name}</span>
                    <V2StatusBadge tone={left > 0 ? 'green' : 'red'}>{left > 0 ? `${left} ${t('v2.seatsLeft')}` : t('v2.soldOut')}</V2StatusBadge>
                    <span className="ms-auto text-[16px] font-extrabold text-[#0B1B33]">EGP {(tr.calculatedPrice || tr.price).toLocaleString(locale)}</span>
                  </p>
                </button>
              );
            })}
          </div>
          <div className="rounded-2xl border border-[#E6EBF2] bg-white p-5 lg:sticky lg:top-6">
            {!trip || loadingTrip ? (
              <div className="grid gap-3" role="status">
                <V2Skeleton className="h-6 w-2/3" />
                <V2Skeleton className="h-64 rounded-xl" />
              </div>
            ) : (
              <>
                <V2SeatMap
                  trip={trip} reserved={reserved} lang={lang} basePrice={seg}
                  selected={seats}
                  onToggle={(l) => setSeats((p) => (reserved.has(l) ? p : p.includes(l) ? p.filter((x) => x !== l) : [...p, l]))}
                />
                {seats.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {seats.map((s) => (
                      <span key={s} className="rounded-full bg-[#0A1E3C] px-3.5 py-1.5 text-[13px] font-bold tabular-nums text-white">{s}</span>
                    ))}
                  </div>
                )}
                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
                  <span className="text-[14px] font-extrabold text-[#0B1B33]">{t('v2.total')}</span>
                  <span className="text-[19px] font-extrabold tabular-nums text-[#0B1B33]">EGP {total.toLocaleString(locale)}</span>
                </div>
              </>
            )}
            <div className="mt-4 flex gap-2">
              <button onClick={() => setStep(1)} className="rounded-xl px-4 py-3 text-[14px] font-bold text-[#5B6B84] hover:bg-slate-100">{t('v2.back')}</button>
              <V2Button disabled={seats.length === 0} onClick={() => setStep(3)} className="flex-1">
                {t('v2.continue')} <ArrowRight className="size-4 v2-flip-rtl" />
              </V2Button>
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="mt-5 rounded-2xl border border-[#E6EBF2] bg-white p-5 md:p-6">
          <div className="grid gap-3.5">
            {seats.map((s) => (
              <div key={s} className="rounded-2xl border border-slate-200 p-4">
                <p className="flex items-center gap-2 text-[15px] font-extrabold tabular-nums text-[#0B1B33]">
                  <User className="size-5 text-[#1D5BD8]" /> {isRTL ? 'مقعد' : 'Seat'} {s}
                  <span className="ms-auto text-[14px] text-[#5B6B84]">EGP {priceOf(s).toLocaleString(locale)}</span>
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <V2Input value={names[s] || ''} onChange={(e) => setNames({ ...names, [s]: e.target.value })} placeholder={t('company.passengerName')} aria-label={`${t('company.passengerName')} ${s}`} />
                  <V2Input value={phones[s] || ''} onChange={(e) => setPhones({ ...phones, [s]: e.target.value })} placeholder={t('company.passengerPhone')} aria-label={`${t('company.passengerPhone')} ${s}`} dir="ltr" className="tabular-nums" />
                  <V2Input value={hotels[s] || ''} onChange={(e) => setHotels({ ...hotels, [s]: e.target.value })} placeholder={t('v2.hotelPh')} aria-label={`${t('v2.hotelPh')} ${s}`} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
            <button onClick={() => setStep(2)} className="rounded-xl px-4 py-3 text-[14px] font-bold text-[#5B6B84] hover:bg-slate-100">{t('v2.back')}</button>
            <V2Button size="lg" disabled={submitting || seats.length === 0} onClick={submit}>
              {submitting && <Loader2 className="size-5 animate-spin" />}
              {t('v2.confirmBooking')} · EGP {total.toLocaleString(locale)}
            </V2Button>
          </div>
        </div>
      )}
    </div>
  );
}
