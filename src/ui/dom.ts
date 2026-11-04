// Tiny DOM + focus-navigation helpers shared by all menu screens.
import { onNav, type NavDir } from '../core/input';
import { audio } from '../audio/audio';

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else e.setAttribute(k, v);
  }
  if (html) e.innerHTML = html;
  return e;
}

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Spatial focus navigation for keyboard / gamepad across `.nav` elements in a root. */
export class FocusNav {
  root: HTMLElement | null = null;
  off: (() => void) | null = null;
  private keyOff: (() => void) | null = null;
  onBack: (() => void) | null = null;
  custom: ((d: NavDir, player: number) => boolean) | null = null;
  private attachedAt = 0;

  attach(root: HTMLElement, onBack: (() => void) | null, custom: ((d: NavDir, player: number) => boolean) | null = null) {
    this.detach();
    this.root = root;
    this.attachedAt = performance.now();
    this.onBack = onBack;
    this.custom = custom;
    this.off = onNav((d, p) => this.nav(d, p));
    const kh = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' && e.key !== 'Escape' && e.key !== 'Enter') return;
      const map: Record<string, NavDir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right', Enter: 'ok', KeyU: 'ok', Space: 'ok', Escape: 'back', Backspace: 'back', KeyI: 'back' };
      const p2: Record<string, NavDir> = { Numpad8: 'up', Numpad2: 'down', Numpad4: 'left', Numpad6: 'right', Numpad5: 'ok', NumpadEnter: 'ok', Numpad0: 'back' };
      const d = map[e.code] ?? p2[e.code];
      if (!d) return;
      const player = p2[e.code] ? 1 : e.code.startsWith('Arrow') || e.code === 'Enter' ? 0 : 0;
      if (e.code === 'Space' && (e.target as HTMLElement)?.tagName === 'BUTTON') return;
      e.preventDefault();
      this.nav(d, player);
    };
    window.addEventListener('keydown', kh);
    this.keyOff = () => window.removeEventListener('keydown', kh);
    const first = root.querySelector<HTMLElement>('.nav.default') ?? root.querySelector<HTMLElement>('.nav');
    if (first && !matchMedia('(hover: none)').matches) first.focus({ preventScroll: true });
  }

  detach() {
    this.off?.();
    this.keyOff?.();
    this.off = this.keyOff = null;
  }

  nav(d: NavDir, player: number) {
    if (!this.root || !this.root.isConnected) return;
    // swallow the key/button press that opened this screen
    if (performance.now() - this.attachedAt < 220) return;
    if (this.custom && this.custom(d, player)) return;
    if (d === 'back') {
      if (this.onBack) {
        audio.play('back');
        this.onBack();
      }
      return;
    }
    const items = [...this.root.querySelectorAll<HTMLElement>('.nav')].filter((e) => e.offsetParent !== null && !e.hasAttribute('disabled'));
    if (!items.length) return;
    let cur = document.activeElement as HTMLElement;
    if (!items.includes(cur)) {
      items[0].focus();
      audio.play('ui');
      return;
    }
    if (d === 'ok' || d === 'start') {
      cur.click();
      return;
    }
    const r = cur.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let best: HTMLElement | null = null;
    let bestScore = Infinity;
    for (const it of items) {
      if (it === cur) continue;
      const q = it.getBoundingClientRect();
      const x = q.left + q.width / 2 - cx;
      const y = q.top + q.height / 2 - cy;
      const along = d === 'up' ? -y : d === 'down' ? y : d === 'left' ? -x : x;
      const across = d === 'up' || d === 'down' ? Math.abs(x) : Math.abs(y);
      if (along <= 4) continue;
      const score = along + across * 2.2;
      if (score < bestScore) {
        bestScore = score;
        best = it;
      }
    }
    if (best) {
      best.focus();
      best.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      audio.play('ui');
      best.dispatchEvent(new CustomEvent('navfocus'));
    } else if (cur.tagName === 'INPUT' && (cur as HTMLInputElement).type === 'range' && (d === 'left' || d === 'right')) {
      const inp = cur as HTMLInputElement;
      inp.value = String(Number(inp.value) + (d === 'right' ? 1 : -1) * Number(inp.step || 1));
      inp.dispatchEvent(new Event('input'));
    }
    void cur;
    cur = cur as HTMLElement;
  }
}

export function toast(msg: string, ms = 2200) {
  const t = el('div', { class: 'toast', role: 'status' }, esc(msg));
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('out'), ms);
  setTimeout(() => t.remove(), ms + 400);
}

/** aria-live announcer for screen readers */
let live: HTMLElement | null = null;
export function announce(text: string) {
  if (!live) {
    live = el('div', { class: 'sr-only', 'aria-live': 'polite' });
    document.body.appendChild(live);
  }
  live.textContent = text;
}
