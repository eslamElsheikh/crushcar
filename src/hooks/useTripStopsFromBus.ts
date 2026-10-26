'use client';

import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useLangStore } from '@/lib/lang';
import { StopDraft, normalizeName } from '@/components/v2/TripForm';

/**
 * Fills the stop editor from the chosen bus's station list once that bus's
 * stations are known, matching bus station names against the Station table.
 *
 * Shared by the new-trip page and the new-trip modal so the auto-fill and the
 * "station not in the Station table" warning only exist in one place.
 *
 * @param bookingMode 'BUS' spreads the given total across stops; 'SEAT' keeps
 * the flat +50 per stop that seat pricing has always used.
 */
export function useTripStopsFromBus(
  busId: string,
  stations: { id: string; name: string }[],
  bookingMode: 'SEAT' | 'BUS',
  busPrice: number,
  onStops: (stops: StopDraft[]) => void
) {
  const _t = useLangStore((s) => s.t);
  const lang = useLangStore((s) => s.lang);
  const isRTL = lang === 'ar';

  // Held in refs so the fetch is not re-issued every time a callback identity
  // changes, while still reading the latest values when it resolves.
  const onStopsRef = useRef(onStops);
  onStopsRef.current = onStops;
  const bookingModeRef = useRef(bookingMode);
  bookingModeRef.current = bookingMode;
  const busPriceRef = useRef(busPrice);
  busPriceRef.current = busPrice;

  const buildStops = useCallback(
    (names: { name: string }[]) => {
      const matched: StopDraft[] = [];
      const unmatched: string[] = [];

      names.forEach((bs, idx) => {
        const found = stations.find((s) => normalizeName(s.name) === normalizeName(bs.name));
        if (found) {
          matched.push({
            stationId: found.id,
            name: found.name,
            stopOrder: idx + 1,
            priceFromOrigin: idx > 0 ? matched[idx - 1].priceFromOrigin + 50 : 0,
            arrivalTime: '',
            departureTime: '',
          });
        } else {
          unmatched.push(bs.name);
        }
      });

      const stops =
        bookingModeRef.current === 'BUS' && matched.length > 0
          ? spread(matched, busPriceRef.current)
          : matched;

      onStopsRef.current(stops.length > 0 ? stops : []);

      if (unmatched.length > 0) {
        toast.error(
          isRTL
            ? `محطات غير موجودة في جدول المحطات: ${unmatched.join(', ')}. أضفها أولًا من صفحة الباصات.`
            : `Stations not found in Station table: ${unmatched.join(', ')}. Add them first from the bus page.`
        );
      }
    },
    [stations, isRTL]
  );

  useEffect(() => {
    if (!busId) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/buses/${busId}/stations`, { credentials: 'include' });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const list: { name: string; order: number }[] = Array.isArray(data) ? data : data.stations || [];
        if (cancelled) return;
        buildStops(list);
      } catch {
        /* keep whatever the admin already typed */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [busId, buildStops]);
}

/** A charter trip is priced as one total for the whole bus, so every stop carries it. */
function spread(stops: StopDraft[], total: number): StopDraft[] {
  return stops.map((s) => ({ ...s, priceFromOrigin: total }));
}