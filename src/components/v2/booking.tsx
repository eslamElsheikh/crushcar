'use client';

import { Armchair } from 'lucide-react';
import { cn } from '@/lib/utils';

/* Shared V2 booking building blocks — pure UI over existing booking APIs. */

export interface V2Seat {
  id: string;
  label: string;
  row: number;
  col: number;
  type: string;
  price: number;
}

export interface V2TripStop {
  stationId: string;
  station?: { id: string; name: string; city: string };
  stopOrder: number;
  priceFromOrigin: number;
  arrivalTime?: string;
  departureTime?: string;
}

export interface V2Trip {
  id: string;
  origin: string;
  destination: string;
  departure: string;
  arrival: string;
  price: number;
  calculatedPrice?: number;
  status: string;
  tripStops: V2TripStop[];
  bus: {
    id: string;
    name: string;
    type: string;
    layout?: { rows: number; cols: number; aisleAfter: number; colsPerRow: string; seats: V2Seat[] };
  };
  bookings: { seatLabel: string; fromStopOrder?: number; toStopOrder?: number }[];
  companyBookings?: { seatLabel: string; fromStopOrder?: number; toStopOrder?: number }[];
}

const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

/** Segment-aware unavailability — same overlap rule as the backend. */
export function unavailableForSegment(
  t: V2Trip | null, fromSid: string | null, toSid: string | null
): Set<string> {
  if (!t) return new Set();
  const stops = t.tripStops || [];
  const collect = (bookings: { seatLabel: string; fromStopOrder?: number; toStopOrder?: number }[]) => {
    if (stops.length === 0) return new Set(bookings.map((b) => b.seatLabel));
    const fOrder = stops.find((s) => s.stationId === fromSid)?.stopOrder ?? 1;
    const tOrder = stops.find((s) => s.stationId === toSid)?.stopOrder ?? stops.length;
    if (fOrder >= tOrder) return new Set(bookings.map((b) => b.seatLabel));
    const taken = new Set<string>();
    for (const b of bookings) {
      const bFrom = b.fromStopOrder ?? fOrder;
      const bTo = b.toStopOrder ?? tOrder;
      if (bFrom < tOrder && bTo > fOrder) taken.add(b.seatLabel);
    }
    return taken;
  };
  return new Set([...collect(t.bookings || []), ...collect(t.companyBookings || [])]);
}

export function segmentPrice(t: V2Trip | null, fromSid: string | null, toSid: string | null): number {
  const stops = t?.tripStops || [];
  const from = stops.find((s) => s.stationId === fromSid) || stops[0];
  const to = stops.find((s) => s.stationId === toSid) || stops[stops.length - 1];
  if (from && to && to.stopOrder > from.stopOrder) return to.priceFromOrigin - from.priceFromOrigin;
  return t?.price || 0;
}

function rowSeatCount(layout: V2Trip['bus']['layout'], rowLetter: string): number {
  if (layout?.colsPerRow) {
    try {
      const parsed = JSON.parse(layout.colsPerRow);
      return parsed[rowLetter] || 4;
    } catch { return 4; }
  }
  return layout?.cols || 4;
}

/** Premium seat map. States: available / selected / reserved / VIP / disabled. */
export function V2SeatMap({
  trip, reserved, selected, onToggle, basePrice, lang,
}: {
  trip: V2Trip;
  reserved: Set<string>;
  selected: string[];
  onToggle: (label: string) => void;
  basePrice: number;
  lang: string;
}) {
  const layout = trip.bus?.layout;
  const aislePos = layout?.aisleAfter ?? 2;
  const isRTL = lang === 'ar';

  return (
    <div>
      <div className="mb-4 flex items-center justify-center gap-2 rounded-xl bg-[#F6F8FC] py-3">
        <span className="text-base" aria-hidden="true">🚍</span>
        <span className="text-[12px] font-bold text-[#5B6B84]">{isRTL ? 'مقدمة الباص' : 'FRONT OF BUS'}</span>
      </div>

      <div className="grid gap-2" role="group" aria-label={isRTL ? 'خريطة المقاعد' : 'Seat map'}>
        {Array.from({ length: layout?.rows || 10 }, (_, rowIdx) => {
          const rowLetter = ROWS[rowIdx];
          const count = rowSeatCount(layout, rowLetter);
          return (
            <div key={rowIdx} className="flex items-center justify-center gap-2">
              <span className="w-6 shrink-0 text-center text-[12px] font-bold tabular-nums text-[#9AA8BD]">{rowLetter}</span>
              {Array.from({ length: count }, (_, colIdx) => {
                const col = colIdx + 1;
                const seat = layout?.seats?.find((s) => s.row === rowIdx && s.col === col);
                const isAisle = col === aislePos + 1 && count > 3;
                if (!seat) return <span key={colIdx} className={cn('size-11 shrink-0', isAisle && 'ms-6')} />;
                const isSel = selected.includes(seat.label);
                const isRes = reserved.has(seat.label);
                const disabled = seat.type === 'DISABLED';
                const vip = seat.type === 'VIP';
                return (
                  <button
                    key={colIdx}
                    type="button"
                    disabled={isRes || disabled}
                    onClick={() => onToggle(seat.label)}
                    aria-label={`${isRTL ? 'مقعد' : 'Seat'} ${seat.label}`}
                    aria-pressed={isSel}
                    title={`${seat.label} · EGP ${basePrice + (seat.price || 0)}`}
                    className={cn(
                      'grid size-11 shrink-0 place-items-center rounded-xl border-2 transition',
                      isAisle && 'ms-6',
                      isRes && 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-300',
                      disabled && 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-200',
                      !isRes && !disabled && !isSel && 'border-slate-200 bg-white text-[#5B6B84] hover:border-[#1D5BD8]/50',
                      isSel && 'border-[#1D5BD8] bg-[#1D5BD8] text-white shadow-[0_8px_20px_rgba(29,91,216,0.35)]',
                      vip && !isSel && !isRes && 'border-amber-300 bg-amber-50 text-amber-700'
                    )}
                  >
                    <Armchair className="size-5" />
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] font-semibold text-[#5B6B84]">
        <span className="flex items-center gap-1.5"><span className="size-4 rounded-md border-2 border-slate-200 bg-white" /> {isRTL ? 'متاح' : 'Available'}</span>
        <span className="flex items-center gap-1.5"><span className="size-4 rounded-md bg-[#1D5BD8]" /> {isRTL ? 'مختار' : 'Selected'}</span>
        <span className="flex items-center gap-1.5"><span className="size-4 rounded-md bg-slate-100" /> {isRTL ? 'محجوز' : 'Taken'}</span>
        <span className="flex items-center gap-1.5"><span className="size-4 rounded-md border-2 border-amber-300 bg-amber-50" /> VIP</span>
      </div>
    </div>
  );
}
