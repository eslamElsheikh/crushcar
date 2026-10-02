import { normAr } from '@/lib/arabic';

/**
 * Single source of truth for governorate/destination imagery.
 * Priority everywhere: DB imageUrl → local map below → /v2/city.jpg
 * Local files under public/destinations are licensed (see src/data/imageCredits.ts).
 */

export const HOME_DESTINATIONS_LIMIT = 8;
export const HOME_TRIPS_LIMIT = 8;
export const FALLBACK_IMAGE = '/v2/city.jpg';

interface MapEntry {
  keys: string[];
  src: string;
}

const ENTRIES: MapEntry[] = [
  { keys: ['اسوان', 'أسوان'], src: '/destinations/aswan.jpg' },
  { keys: ['الاقصر', 'الأقصر'], src: '/destinations/luxor.jpg' },
  { keys: ['الاسكندريه', 'الإسكندرية', 'سموحه', 'سموحة', 'سيدي بشر', 'سيدي بشر'], src: '/destinations/alexandria.jpg' },
  { keys: ['الاسماعيليه', 'الإسماعيلية'], src: '/destinations/ismailia.jpg' },
  { keys: ['القاهره', 'القاهرة', 'الجيزه', 'الجيزة', '6 اكتوبر', '6 أكتوبر', 'العاشر من رمضان'], src: '/destinations/cairo.jpg' },
  { keys: ['الغردقه', 'الغردقة'], src: '/destinations/hurghada.jpg' },
  { keys: ['شرم الشيخ', 'شرم'], src: '/destinations/sharm-el-sheikh.jpg' },
  { keys: ['العين السخنه', 'العين السخنة', 'السخنه', 'السخنة', 'السويس', 'بورتو سخنه', 'بورتو سخنة'], src: '/destinations/sokhna.jpg' },
  { keys: ['دهب', 'الطور', 'سانت كاترين'], src: '/destinations/dahab.jpg' },
  { keys: ['سهل حشيش', 'سوما باي', 'مكادي', 'مرسي علم', 'مرسى علم', 'البحر الاحمر', 'البحر الأحمر'], src: '/destinations/sahl-hashish.jpg' },
  // Region fallbacks (no dedicated photo yet → nearest licensed photo)
  { keys: ['مطروح', 'دمياط'], src: '/destinations/alexandria.jpg' },
  { keys: ['بورسعيد', 'العريش', 'شمال سيناء'], src: '/destinations/ismailia.jpg' },
  { keys: ['المنيا', 'بني سويف', 'بنى سويف', 'اسيوط', 'أسيوط', 'سوهاج', 'قنا', 'الفيوم', 'الوادي الجديد'], src: '/destinations/luxor.jpg' },
  { keys: ['المنصوره', 'المنصورة', 'طنطا', 'الزقازيق', 'الشرقيه', 'الشرقية', 'دمنهور', 'البحيره', 'البحيرة', 'كفر الشيخ', 'بنها', 'القليوبيه', 'القليوبية', 'شبين الكوم', 'المنوفيه', 'المنوفية', 'الغربيه', 'الغربية'], src: '/destinations/cairo.jpg' },
];

const normKeys = ENTRIES.map((e) => ({ src: e.src, keys: e.keys.map((k) => normAr(k)) }));

/** Local image for an Arabic city/region name (or null when nothing matches). */
export function localImageForCity(name: string | null | undefined): string | null {
  const n = normAr(name || '');
  if (!n) return null;
  for (const e of normKeys) {
    if (e.keys.some((k) => k && (n.includes(k) || k.includes(n)))) return e.src;
  }
  return null;
}

/** Local image for a destination slug (e.g. demo-dest-sokhna → sokhna). */
export function localImageForSlug(slug: string | null | undefined): string | null {
  const s = (slug || '').toLowerCase();
  if (!s) return null;
  if (s.includes('aswan')) return '/destinations/aswan.jpg';
  if (s.includes('luxor')) return '/destinations/luxor.jpg';
  if (s.includes('alex')) return '/destinations/alexandria.jpg';
  if (s.includes('ismailia')) return '/destinations/ismailia.jpg';
  if (s.includes('cairo') || s.includes('giza')) return '/destinations/cairo.jpg';
  if (s.includes('hurghada')) return '/destinations/hurghada.jpg';
  if (s.includes('sharm')) return '/destinations/sharm-el-sheikh.jpg';
  if (s.includes('sokhna') || s.includes('sokhna') || s.includes('suez')) return '/destinations/sokhna.jpg';
  if (s.includes('dahab') || s.includes('kath') || s.includes('tour')) return '/destinations/dahab.jpg';
  if (s.includes('sahl') || s.includes('soma') || s.includes('makadi') || s.includes('marsa') || s.includes('alam')) return '/destinations/sahl-hashish.jpg';
  return null;
}

export interface DestinationLike {
  slug?: string | null;
  nameAr: string;
  nameEn?: string | null;
  imageUrl?: string | null;
}

/** Resolve display image for a destination: DB upload → slug map → city map → fallback. */
export function destinationImage(d: DestinationLike): string {
  if (d.imageUrl) return d.imageUrl;
  return (
    localImageForSlug(d.slug) ||
    localImageForCity(d.nameAr) ||
    localImageForCity(d.nameEn) ||
    FALLBACK_IMAGE
  );
}

/** Resolve trip header image: matching destination first, then city map, then fallback. */
export function tripImageForDestination(
  destinationName: string,
  destinations: DestinationLike[],
): string {
  const n = normAr(destinationName);
  if (n) {
    const match = destinations.find((d) => {
      const a = normAr(d.nameAr);
      const e = normAr(d.nameEn || '');
      return (a && (a.includes(n) || n.includes(a))) || (e && (e.includes(n) || n.includes(e)));
    });
    if (match) return destinationImage(match);
  }
  return localImageForCity(destinationName) || FALLBACK_IMAGE;
}

/** Remove duplicates by normalized Arabic name (keep first = lowest sortOrder). */
export function dedupeDestinations<T extends DestinationLike>(list: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const d of list) {
    const key = normAr(d.nameAr) || (d.slug || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out;
}

/** Remove duplicate trip routes (origin→destination), keep earliest first. */
export function dedupeTrips<T extends { origin: string; destination: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const t of list) {
    const key = `${normAr(t.origin)}>${normAr(t.destination)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}
