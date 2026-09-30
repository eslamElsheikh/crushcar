'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useLangStore } from '@/lib/lang';

/* V2 print ticket — same ticket API, print-optimized sheet, auto print. */

export default function PrintTicketPage() {
  const params = useParams();
  const id = params.id as string;
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';
  const locale = isRTL ? 'ar-EG' : 'en-US';
  const [ticket, setTicket] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/bookings/${id}/ticket`);
        if (res.ok) {
          setTicket(await res.json());
          setTimeout(() => window.print(), 600);
        }
      } catch { /* show empty sheet */ }
    })();
  }, [id]);

  const origin = ticket?.actualOrigin || ticket?.trip?.origin || '';
  const dest = ticket?.actualDestination || ticket?.trip?.destination || '';
  const dep = ticket?.actualDeparture || ticket?.trip?.departure || '';

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} className="min-h-dvh bg-white p-6 font-sans text-[#0B1B33] print:p-0">
      <style>{`@media print { button { display: none !important; } }`}</style>
      <div className="mx-auto max-w-[640px] rounded-2xl border-2 border-dashed border-slate-300 p-8">
        <div className="flex items-center justify-between">
          <p className="text-[22px] font-extrabold">Safro</p>
          <p className="font-mono text-[13px] tabular-nums text-slate-500" dir="ltr">{ticket?.reference}</p>
        </div>
        <p className="mt-4 text-[26px] font-extrabold">
          {isRTL ? `${dest} ← ${origin}` : `${origin} → ${dest}`}
        </p>
        <p className="mt-1 text-[15px] tabular-nums text-slate-600">
          {dep && new Date(dep).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}
          {' · '}
          {dep && new Date(dep).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3 text-[14.5px]">
          <p><strong>{isRTL ? 'المسافر' : 'Passenger'}:</strong> {ticket?.passengerName}</p>
          <p><strong>{isRTL ? 'المقعد' : 'Seat'}:</strong> <span className="tabular-nums">{ticket?.seatLabel}</span></p>
          <p><strong>{isRTL ? 'الباص' : 'Bus'}:</strong> {ticket?.trip?.bus?.name}</p>
          <p><strong>{isRTL ? 'الإجمالي' : 'Total'}:</strong> <span className="tabular-nums">EGP {ticket?.total}</span></p>
        </div>
        {ticket?.qrCode && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ticket.qrCode} alt="QR" className="mx-auto mt-6 size-44" />
        )}
        <button
          onClick={() => window.print()}
          className="mt-8 w-full rounded-xl bg-[#1D5BD8] py-3.5 text-[15px] font-bold text-white"
        >
          {isRTL ? 'طباعة' : 'Print'}
        </button>
      </div>
    </div>
  );
}
