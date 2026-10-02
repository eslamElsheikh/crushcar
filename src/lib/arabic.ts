/** Arabic-tolerant match: strip tashkeel, unify alef/hamza, taa-marbouta, alef-maqsura. */
export function normAr(s: string): string {
  return (s || '')
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .trim();
}
