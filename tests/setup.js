// Adds the DOM matchers (toBeInTheDocument, toHaveAttribute, …) used by the
// component-level tests and the two browser APIs jsdom does not implement but
// the dashboard queries (`matchMedia`, `scrollIntoView`).
import '@testing-library/jest-dom/vitest';

if (typeof window !== 'undefined') {
  if (!window.matchMedia) {
    window.matchMedia = (query) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    });
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function scrollIntoView() {};
  }
  if (!window.requestAnimationFrame) {
    window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
    window.cancelAnimationFrame = (id) => clearTimeout(id);
  }
}
