/* Bus type — single source of truth for the UI and the server.
 *
 * `Bus.type` is a plain String column in Prisma (no enum), so the list below is
 * the only thing keeping values consistent. Both the admin dropdown and
 * `busSchema` derive from it.
 *
 * CHARTER is not just a label: the trip form uses it to decide which buses a
 * seat trip or a charter trip can be assigned to. A charter trip is sold to one
 * company as a whole bus, so it needs a bus that is actually kept for charters.
 */

export const BUS_TYPES = [
  { value: 'MINI_BUS', ar: 'ميني باص', en: 'Mini Bus' },
  { value: 'COACH_BUS', ar: 'كوتش باص', en: 'Coach Bus' },
  { value: 'VIP_BUS', ar: 'VIP باص', en: 'VIP Bus' },
  { value: 'DOUBLE_DECKER', ar: 'دبل ديكر', en: 'Double Decker' },
  { value: 'CHARTER', ar: 'شارتر', en: 'Charter' },
] as const;

export type BusTypeValue = (typeof BUS_TYPES)[number]['value'];

export const BUS_TYPE_VALUES: string[] = BUS_TYPES.map((t) => t.value);

export function isBusType(v: unknown): v is BusTypeValue {
  return typeof v === 'string' && BUS_TYPE_VALUES.includes(v);
}

/** Falls back to the raw value so a bus stored with an unknown type still renders. */
export function busTypeLabel(type: string | null | undefined, isRTL: boolean): string {
  const found = BUS_TYPES.find((t) => t.value === type);
  if (!found) return type || '—';
  return isRTL ? found.ar : found.en;
}

/**
 * Charter trips are assigned only from CHARTER buses and seat trips only from
 * the rest, so the two never get mixed up by accident.
 *
 * `selectedId` is always kept in the list: a bus already assigned to the trip
 * being edited must stay visible, even when its type does not match the tab the
 * admin is currently looking at. Hiding it would silently drop the assignment
 * on save.
 */
export function busesForMode(
  buses: any[],
  mode: 'SEAT' | 'BUS',
  selectedId?: string | null,
): any[] {
  const matches = (b: any) => (mode === 'BUS' ? b.type === 'CHARTER' : b.type !== 'CHARTER');
  return buses.filter((b) => matches(b) || b.id === selectedId);
}