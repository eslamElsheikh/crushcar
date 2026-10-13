/**
 * How a route reads on screen.
 *
 * The operands stay in logical order, origin first. The bidi algorithm already
 * lays Arabic text out right-to-left, so in an RTL context the first operand
 * ends up on the right and the arrow points left, which reads correctly with no
 * reordering at all: only the glyph changes.
 *
 * The bug this exists to prevent: writing `${destination} ← ${origin}` for RTL.
 * Reversing the operands does not fix the direction, it inverts it, and the
 * route then contradicts the stop list printed underneath it on the same card.
 * Twenty-six copies of that mistake existed across the app; every screen now
 * goes through here, and scripts/check-route-labels.mjs fails if the pattern
 * comes back.
 */

/** `origin → destination`, or `origin ← destination` in RTL. */
export function routeLabel(
  origin: string | null | undefined,
  destination: string | null | undefined,
  isRTL: boolean,
): string {
  const from = (origin ?? '').trim();
  const to = (destination ?? '').trim();
  if (!from && !to) return '';
  if (!to) return from;
  if (!from) return to;
  return `${from} ${isRTL ? '←' : '→'} ${to}`;
}

/**
 * Same, for screens that hold the two ends as named fields rather than as a
 * trip's origin/destination pair.
 */
export function stationRouteLabel(
  fromName: string | null | undefined,
  toName: string | null | undefined,
  isRTL: boolean,
): string {
  return routeLabel(fromName, toName, isRTL);
}

/** A list of stops, e.g. `Mansoura ← Hurghada`. */
export function stopListLabel(
  names: (string | null | undefined)[],
  isRTL: boolean,
): string {
  return names.filter(Boolean).join(isRTL ? ' ← ' : ' → ');
}
