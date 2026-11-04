import './style.css';
import { App } from './app';
import { initKeyboard, pollPadNav } from './core/input';
import { audio } from './audio/audio';
import { settings } from './core/store';

initKeyboard();
const canvas = document.getElementById('game') as HTMLCanvasElement;
const app = new App(canvas);
(window as unknown as { __app: App }).__app = app;
document.body.classList.toggle('colorblind', settings.colorblind);

// unlock audio on first interaction (mobile browsers require a gesture)
const unlock = () => audio.unlock();
window.addEventListener('pointerdown', unlock, { once: true });
window.addEventListener('keydown', unlock, { once: true });

// gamepad menu navigation
const padLoop = (t: number) => {
  pollPadNav(t);
  requestAnimationFrame(padLoop);
};
requestAnimationFrame(padLoop);
window.addEventListener('gamepadconnected', (e) => {
  import('./ui/dom').then(({ toast }) => toast(`🎮 ${(e as GamepadEvent).gamepad.id.slice(0, 32)} connected`));
  app.game.touch.show(false);
});

// rotate hint for portrait phones
const rot = document.getElementById('rotate')!;
const checkRot = () => rot.classList.toggle('show', window.innerHeight > window.innerWidth && window.innerWidth < 900);
window.addEventListener('resize', checkRot);
checkRot();

// remove loader and start
document.getElementById('loader')?.remove();
app.boot();

// offline / installable
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
