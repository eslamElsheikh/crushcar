'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowRight, Printer, MapPin, Clock, User, Phone, Mail } from 'lucide-react';
import { useLangStore } from '@/lib/lang';
import '@/components/v2/theme.css';
import { V2SiteHeader } from '@/components/v2/SiteHeader';
import { V2SiteFooter } from '@/components/v2/SiteFooter';
import { V2StatusBadge, V2Skeleton } from '@/components/v2/ui';

/* V2 e-ticket — same GET ticket API (QR included) as V1. */

interface TicketData {
  id: string;
  reference: string;
  seatLabel: string;
  passengerName: string;
  passengerPhone?: string;
  status: string;
  total: number;
  actualOrigin?: string;
  actualDestination?: string;
  actualDeparture?: string;
  qrCode?: string;
  user?: { name: string; email: string; phone?: string };
  trip?: {
    origin: string; destination: string; departure: string; arrival: string;
    bus?: { name: string; type?: string; company?: { name: string } };
  };
  tripStops?: { station?: { name: string } }[];
}

export default function BookingTicketPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';
  const locale = isRTL ? 'ar-EG' : 'en-US';

  const [ticket, setTicket] = useState<TicketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/bookings/${id}/ticket`);
        if (!res.ok) { setMissing(true); return; }
        setTicket(await res.json());
      } catch { setMissing(true); } finally { setLoading(false); }
    })();
  }, [id]);

  const origin = ticket?.actualOrigin || ticket?.trip?.origin || '';
  const dest = ticket?.actualDestination || ticket?.trip?.destination || '';
  const dep = ticket?.actualDeparture || ticket?.trip?.departure || '';

  return (
    <div className="v2 min-h-dvh bg-[#F6F8FC]" dir={isRTL ? 'rtl' : 'ltr'}>
      <V2SiteHeader />

      <main className="v2-container max-w-2xl pb-16 pt-8 md:pt-10">
        <button onClick={() => router.push('/bookings')} className="inline-flex items-center gap-1.5 text-[14px] font-bold text-[#5B6B84] hover:text-[#0B1B33]">
          <ArrowRight className="size-4 rotate-180 v2-flip-rtl" /> {t('v2.back')}
        </button>

        {loading ? (
          <div className="mt-5 grid gap-4" role="status">
            <V2Skeleton className="h-64 rounded-2xl" />
            <V2Skeleton className="h-24 rounded-2xl" />
          </div>
        ) : !ticket || missing ? (
          <div className="v2-card mx-auto mt-5 max-w-[480px] p-10 text-center">
            <p className="text-[18px] font-extrabold text-[#0B1B33]">{t('v2.tripNotFound')}</p>
            <Link href="/bookings" className="v2-btn-ghost mt-6 inline-flex px-6 py-3.5 text-[15px]">{t('v2.myBookings')}</Link>
          </div>
        ) : (
          <div className="mt-5 overflow-hidden rounded-2xl border border-[#E6EBF2] bg-white shadow-[0_24px_64px_rgba(11,27,51,0.14)]">
            <div className="bg-[#0A1E3C] px-6 py-5 md:px-8">
              <div className="flex flex-wrap items-center gap-2">
                <V2StatusBadge tone={ticket.status === 'PAID' ? 'green' : ticket.status === 'CANCELLED' ? 'red' : 'amber'}>
                  {t(`booking.${ticket.status.toLowerCase()}`)}
                </V2StatusBadge>
                <span className="ms-auto font-mono text-[13px] tabular-nums text-white/70" dir="ltr">{ticket.reference}</span>
              </div>
              <p className="mt-3 text-balance text-[24px] font-extrabold leading-tight text-white md:text-[28px]">
                {isRTL ? `${dest} ← ${origin}` : `${origin} → ${dest}`}
              </p>
              <p className="mt-1.5 text-[14.5px] tabular-nums text-white/75">
                {dep && new Date(dep).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })}
                {' · '}
                {dep && new Date(dep).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                {ticket.trip?.arrival && ` → ${new Date(ticket.trip.arrival).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`}
              </p>
            </div>

            <div className="grid gap-5 p-6 sm:grid-cols-[1fr_auto] sm:items-center md:p-8">
              <div className="grid gap-3.5 text-[14.5px]">
                <p className="flex items-center gap-2.5 font-semibold text-[#0B1B33]">
                  <User className="size-5 shrink-0 text-[#1D5BD8]" /> {ticket.passengerName}
                  <span className="rounded-lg bg-[#0A1E3C] px-3 py-1 text-[13px] font-bold tabular-nums text-white">
                    {isRTL ? 'مقعد' : 'Seat'} {ticket.seatLabel}
                  </span>
                </p>
                {(ticket.passengerPhone || ticket.user?.phone) && (
                  <p className="flex items-center gap-2.5 text-[#5B6B84]" dir="ltr" style={{ textAlign: 'start' }}>
                    <Phone className="size-5 shrink-0 text-[#1D5BD8]" />
                    <span className="tabular-nums">{ticket.passengerPhone || ticket.user?.phone}</span>
                  </p>
                )}
                {ticket.user?.email && (
                  <p className="flex items-center gap-2.5 text-[#5B6B84]" dir="ltr" style={{ textAlign: 'start' }}>
                    <Mail className="size-5 shrink-0 text-[#1D5BD8]" /> {ticket.user.email}
                  </p>
                )}
                <p className="flex items-center gap-2.5 text-[#5B6B84]">
                  <Clock className="size-5 shrink-0 text-[#1D5BD8]" />
                  {ticket.trip?.bus?.name}
                  {ticket.trip?.bus?.company?.name ? ` · ${ticket.trip.bus.company.name}` : ''}
                </p>
                {(ticket.tripStops?.length || 0) > 0 && (
                  <p className="flex items-start gap-2.5 text-[#5B6B84]">
                    <MapPin className="mt-1 size-5 shrink-0 text-[#1D5BD8]" />
                    <span>{ticket.tripStops!.map((s) => s.station?.name).filter(Boolean).join(isRTL ? ' ← ' : ' → ')}</span>
                  </p>
                )}
                <p className="text-[20px] font-extrabold tabular-nums text-[#0B1B33]">
                  EGP {ticket.total.toLocaleString(locale)}
                </p>
              </div>
              {ticket.qrCode && (
                <div className="mx-auto rounded-2xl border border-slate-200 bg-white p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ticket.qrCode} alt="Ticket QR code" className="size-44" />
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2.5 border-t border-slate-100 p-5 md:px-8">
              <Link href={`/bookings/${ticket.id}/print`} className="v2-btn-primary inline-flex flex-1 items-center justify-center gap-2 px-6 py-3.5 text-[15px] sm:flex-none">
                <Printer className="size-5" /> {t('v2.printTicket')}
              </Link>
              <Link href="/bookings" className="v2-btn-ghost inline-flex flex-1 items-center justify-center px-6 py-3.5 text-[15px] sm:flex-none">
                {t('v2.myBookings')}
              </Link>
            </div>
          </div>
        )}
      </main>

      <V2SiteFooter />
    </div>
  );
}
