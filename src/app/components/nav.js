import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Table2,
  BarChart3,
  SlidersHorizontal,
  Boxes,
  CircleAlert,
} from 'lucide-react';

/**
 * Top-navigation tabs. Every entry maps to a real section rendered on the
 * dashboard — no phantom routes. `chip` values are supplied by the page from
 * actual run data.
 */
export const NAV_ITEMS = [
  { id: 'overview', label: 'Summary', icon: LayoutDashboard },
  { id: 'roster', label: 'Roster', icon: Table2 },
  { id: 'dark-reasons', label: 'Dark hours', icon: CircleAlert },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'shop-stats', label: 'Shops', icon: Boxes },
  { id: 'configuration', label: 'Configuration', icon: SlidersHorizontal },
];

export const SECTION_IDS = NAV_ITEMS.map((item) => item.id);

/** Scroll spy: the last section that has scrolled past the sticky header. */
export function useActiveSection(ids) {
  const [activeId, setActiveId] = useState(ids[0]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    let frame = 0;

    const measure = () => {
      frame = 0;
      let current = null;
      let bestTop = -Infinity;
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        const top = el.getBoundingClientRect().top - 160;
        if (top <= 0 && top > bestTop) {
          bestTop = top;
          current = id;
        }
      }
      if (!current) {
        // Above the first section: stay on whichever is nearest the top.
        let closest = ids[0];
        let closestDist = Infinity;
        for (const id of ids) {
          const el = document.getElementById(id);
          if (!el) continue;
          const dist = Math.abs(el.getBoundingClientRect().top - 160);
          if (dist < closestDist) {
            closestDist = dist;
            closest = id;
          }
        }
        current = closest;
      }
      setActiveId((prev) => (prev === current ? prev : current));
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [ids]);

  return activeId;
}

export function scrollToSection(id) {
  if (typeof document === 'undefined') return;
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}
