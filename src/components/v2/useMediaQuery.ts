'use client';

import { useEffect, useState } from 'react';

/** Reactive matchMedia hook (SSR-safe, defaults to false). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query ]);

  return matches;
}

/** True on screens narrower than the md breakpoint (mobile sheet mode). */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767px)');
}
