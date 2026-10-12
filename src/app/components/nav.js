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
 * Every entry maps to a real section rendered on the dashboard — no phantom
 * routes. `chip` values are supplied by the page from actual run data.
 */
export const NAV_GROUPS = [
  {
    label: 'Dashboard',
    items: [{ id: 'overview', label: 'Executive summary', icon: LayoutDashboard }],
  },
  {
    label: 'Optimization results',
    items: [
      { id: 'roster', label: 'Generator roster', icon: Table2 },
      { id: 'dark-reasons', label: 'Dark hours', icon: CircleAlert },
    ],
  },
  {
    label: 'Energy analytics',
    items: [
      { id: 'analytics', label: 'Hourly load & fuel', icon: BarChart3 },
      { id: 'shop-stats', label: 'Shop statistics', icon: Boxes },
    ],
  },
  {
    label: 'Configuration',
    items: [{ id: 'configuration', label: 'Input & solver', icon: SlidersHorizontal }],
  },
];

export const SECTION_IDS = NAV_GROUPS.flatMap((group) => group.items.map((item) => item.id));

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
        const top = el.getBoundingClientRect().top - 150;
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
          const dist = Math.abs(el.getBoundingClientRect().top - 150);
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

export function scrollToSection(id, setOpen) {
  if (typeof document === 'undefined') return;
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  if (setOpen) setOpen(false);
}
