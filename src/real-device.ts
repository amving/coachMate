// Keep the calibrated desktop preview; real phones and installed apps use their own chrome.
export const realDevice = typeof window !== 'undefined' && (
  new URLSearchParams(window.location.search).get('device') === 'real' ||
  window.matchMedia('(display-mode: standalone)').matches ||
  window.matchMedia('(pointer: coarse) and (max-width: 1024px)').matches
);
