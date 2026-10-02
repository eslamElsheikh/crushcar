/** Arabic-tolerant match: unify alef/hamza, taa-marbouta, alef-maqsura. */
export function normAr(s: string): string {
  return (s || '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .trim();
}
