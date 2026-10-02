/**
 * Arabic-tolerant search helpers for station/governorate matching.
 * Normalizes: tashkeel removed, (أإآ→ا), (ة→ه), (ى→ي).
 */

/** Strip Arabic diacritics (tashkeel) + tatweel. */
export function stripTashkeel(s: string): string {
  return (s || '').replace(/[ً-ٰٟـ]/g, '');
}

/** Full normalization used for matching. */
export function normArQuery(s: string): string {
  return stripTashkeel(s || '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .trim();
}

/** Regex class per normalized char so the ORIGINAL text can be highlighted. */
function charClass(ch: string): string {
  switch (ch) {
    case 'ا':
      return '[أإآا]';
    case 'ه':
      return '[هة]';
    case 'ي':
      return '[يى]';
    default:
      return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

const TASHKEEL_OPT = '[ً-ٰٟ]*';

/**
 * Build a regex matching the normalized query inside ORIGINAL (unnormalized)
 * text, tolerating alef/hamza, taa-marbouta, alef-maqsura and tashkeel.
 */
export function buildHighlightRegex(query: string): RegExp | null {
  const nq = normArQuery(query);
  if (!nq) return null;
  const pattern = nq.split('').map((ch) => charClass(ch) + TASHKEEL_OPT).join('');
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}

/** True when the station (name or city) matches the query. */
export function matchStation(name: string, city: string, query: string): boolean {
  const nq = normArQuery(query);
  if (!nq) return true;
  return normArQuery(name).includes(nq) || normArQuery(city || '').includes(nq);
}

/** Split original text into [before, match, after] for highlight rendering. */
export function splitHighlight(text: string, query: string): [string, string, string] | null {
  const rx = buildHighlightRegex(query);
  if (!rx) return null;
  const m = rx.exec(text || '');
  if (!m || m.index === undefined) return null;
  return [text.slice(0, m.index), m[0], text.slice(m.index + m[0].length)];
}

/** Today's date (yyyy-mm-dd) in Africa/Cairo timezone. */
export function cairoTodayISO(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return parts; // en-CA yields yyyy-mm-dd
}

/** Full Arabic date label, e.g. "الجمعة 2 أكتوبر 2026" (Latin digits). */
const fmtFullAr = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export function formatFullAr(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  try {
    return fmtFullAr.format(new Date(y, m - 1, d));
  } catch {
    return iso;
  }
}
