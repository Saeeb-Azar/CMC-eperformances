import { useEffect, useState } from 'react';

/**
 * Responsive-Primitive für alle Seiten: true unterhalb des Breakpoints.
 * Inline-Style-Layouts (grid-template-columns etc.) lassen sich nicht per
 * Media-Query überschreiben — deshalb dieser Hook als EINE gemeinsame
 * Quelle. Standard-Breakpoint 768px (Handy/kleines Tablet hochkant).
 */
export function useIsMobile(breakpoint = 768): boolean {
  const query = `(max-width: ${breakpoint - 1}px)`;
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', onChange);
    setIsMobile(mq.matches);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return isMobile;
}
