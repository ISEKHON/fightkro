// Automatic fullscreen. Browsers only allow entering fullscreen from a user gesture, so we
// request it on the first tap / click / key press, and again on the next gesture whenever the
// player has left fullscreen (Esc, swipe, app switch). Can be turned off in Settings.
import { settings } from './store';
import { isTouchDevice } from './input';

type FsDoc = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => void };

const doc = document as FsDoc;

export const isFullscreen = () => !!(doc.fullscreenElement || doc.webkitFullscreenElement);

export function fullscreenSupported() {
  const el = document.documentElement as FsEl;
  return !!(el.requestFullscreen || el.webkitRequestFullscreen);
}

/** Running as an installed app already fills the screen. */
const standalone = () => matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function enterFullscreen() {
  if (isFullscreen() || standalone()) return;
  const el = document.documentElement as FsEl;
  try {
    const p = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : (el.webkitRequestFullscreen?.(), undefined);
    Promise.resolve(p)
      .then(lockLandscape)
      .catch(() => {});
  } catch {
    /* not allowed right now */
  }
}

export function exitFullscreen() {
  if (!isFullscreen()) return;
  if (doc.exitFullscreen) doc.exitFullscreen().catch(() => {});
  else doc.webkitExitFullscreen?.();
}

export function toggleFullscreen() {
  if (isFullscreen()) exitFullscreen();
  else enterFullscreen();
}

function lockLandscape() {
  if (!isTouchDevice()) return;
  (screen.orientation as unknown as { lock?: (o: string) => Promise<void> })?.lock?.('landscape').catch(() => {});
}

export function initAutoFullscreen(onUnsupported?: () => void) {
  const auto = (e: Event) => {
    if (!settings.autoFullscreen) return;
    // Esc / F11 are how people leave fullscreen on purpose: don't fight them on that key
    if (e instanceof KeyboardEvent && (e.code === 'Escape' || e.code === 'F11')) return;
    enterFullscreen();
  };
  // pointerup / click / keydown all count as user activation for the Fullscreen API
  window.addEventListener('pointerup', auto, true);
  window.addEventListener('keydown', auto, true);
  if (!fullscreenSupported() && !standalone() && isTouchDevice()) onUnsupported?.();
}
