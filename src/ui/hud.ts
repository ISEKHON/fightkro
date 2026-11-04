import { CHARS, getMove } from '../sim/roster';
import { STAGE_SIM } from '../sim/stages';
import type { GameEvent, MatchState } from '../sim/types';
import { portrait } from '../render/portrait';
import { hex, lookFor } from '../render/looks';
import { channel, liveHeadline, TICKER } from './news';
import { settings } from '../core/store';

const h = (tag: string, cls = '', html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

interface Side {
  root: HTMLElement;
  hp: HTMLElement;
  trail: HTMLElement;
  guard: HTMLElement;
  pips: HTMLElement;
  meter: HTMLElement[];
  meterNum: HTMLElement;
  rage: HTMLElement;
  combo: HTMLElement;
  assist: HTMLElement;
  weapon: HTMLElement;
  name: HTMLElement;
  img: HTMLImageElement;
  trailV: number;
  comboT: number;
}

export class HUD {
  el: HTMLElement;
  sides: Side[] = [];
  timer!: HTMLElement;
  spin!: HTMLElement;
  center: HTMLElement;
  popups: HTMLElement;
  news: HTMLElement;
  newsText: HTMLElement;
  newsChan: HTMLElement;
  ticker: HTMLElement;
  warn: HTMLElement;
  fin: HTMLElement;
  training: HTMLElement;
  zone: HTMLElement;
  newsT = 0;
  lastNewsAt = 0;
  project: (x: number, y: number) => { x: number; y: number } = () => ({ x: 0, y: 0 });
  private centerT = 0;
  private lastAdv = '';
  private hidden = false;

  constructor(parent: HTMLElement) {
    this.el = h('div', 'hud hidden');
    parent.appendChild(this.el);
    const top = h('div', 'hud-top');
    this.el.appendChild(top);
    for (let i = 0; i < 2; i++) {
      const root = h('div', 'hud-side s' + i);
      const img = h('img', 'hud-portrait') as HTMLImageElement;
      const col = h('div', 'hud-col');
      const name = h('div', 'hud-name');
      const bar = h('div', 'hud-hp');
      const trail = h('div', 'hud-hp-trail');
      const fill = h('div', 'hud-hp-fill');
      bar.append(trail, fill);
      const guard = h('div', 'hud-guard', '<i></i>');
      const pips = h('div', 'hud-pips');
      col.append(name, bar, guard, pips);
      root.append(img, col);
      top.appendChild(root);
      if (i === 0) {
        const mid = h('div', 'hud-mid');
        this.timer = h('div', 'hud-timer', '90');
        this.spin = h('div', 'hud-spin', '<span class="l"></span><span class="r"></span><b>📢</b>');
        mid.append(this.timer, this.spin);
        top.appendChild(mid);
      }
      const bottom = h('div', 'hud-bottom s' + i);
      const meter = h('div', 'hud-meter');
      const segs: HTMLElement[] = [];
      for (let k = 0; k < 3; k++) {
        const sg = h('div', 'seg', '<i></i>');
        meter.appendChild(sg);
        segs.push(sg.firstChild as HTMLElement);
      }
      const meterNum = h('div', 'hud-meter-num', '0');
      const rage = h('div', 'hud-rage', '<i></i><span>RAGE</span>');
      const assist = h('div', 'hud-assist', 'TAG');
      const weapon = h('div', 'hud-weapon');
      bottom.append(meterNum, meter, rage, assist, weapon);
      this.el.appendChild(bottom);
      const combo = h('div', 'hud-combo s' + i);
      this.el.appendChild(combo);
      this.sides.push({ root, hp: fill, trail, guard: guard.firstChild as HTMLElement, pips, meter: segs, meterNum, rage: rage.firstChild as HTMLElement, combo, assist, weapon, name, img, trailV: 1, comboT: 0 });
    }
    this.center = h('div', 'hud-center');
    this.popups = h('div', 'hud-popups');
    this.warn = h('div', 'hud-warn hidden');
    this.fin = h('div', 'hud-fin hidden');
    this.zone = h('div', 'hud-zone hidden');
    this.news = h('div', 'hud-news hidden');
    this.newsChan = h('div', 'chan');
    this.newsText = h('div', 'txt');
    const live = h('div', 'live', '● LIVE');
    this.news.append(live, this.newsChan, this.newsText);
    this.ticker = h('div', 'hud-ticker', '<span></span>');
    (this.ticker.firstChild as HTMLElement).textContent = TICKER.join('').repeat(3);
    this.training = h('div', 'hud-training hidden');
    this.el.append(this.center, this.popups, this.warn, this.fin, this.zone, this.news, this.ticker, this.training);
  }

  show(on: boolean) {
    this.hidden = !on;
    this.el.classList.toggle('hidden', !on);
  }

  setMatch(s: MatchState, names?: [string, string]) {
    s.f.forEach((f, i) => {
      const sd = this.sides[i];
      const c = CHARS[f.char];
      sd.img.src = portrait(f.char);
      sd.name.innerHTML = `<b>${names?.[i] ?? c.name}</b><small style="color:${hex(lookFor(f.char).partyColor)}">${c.party}</small>`;
      sd.trailV = 1;
      sd.pips.innerHTML = '';
      for (let k = 0; k < s.winsNeeded; k++) sd.pips.appendChild(h('span', 'pip'));
    });
    this.training.classList.toggle('hidden', !s.cfg.training);
    this.ticker.classList.toggle('hidden', !!s.cfg.training);
    this.center.innerHTML = '';
    this.fin.classList.add('hidden');
    this.news.classList.add('hidden');
  }

  update(s: MatchState, dt: number) {
    if (this.hidden) return;
    s.f.forEach((f, i) => {
      const sd = this.sides[i];
      const r = Math.max(0, f.hp / f.maxHp);
      sd.hp.style.width = r * 100 + '%';
      sd.hp.classList.toggle('low', r < 0.25);
      if (sd.trailV > r) sd.trailV = Math.max(r, sd.trailV - dt * (f.comboHits > 0 ? 0.02 : 0.45));
      else sd.trailV = r;
      sd.trail.style.width = sd.trailV * 100 + '%';
      sd.guard.style.width = f.guard + '%';
      sd.guard.parentElement!.classList.toggle('crushed', f.guard < 25);
      [...sd.pips.children].forEach((p, k) => p.classList.toggle('on', k < f.wins));
      for (let k = 0; k < 3; k++) {
        const v = Math.max(0, Math.min(1, (f.meter - k * 100) / 100));
        sd.meter[k].style.width = v * 100 + '%';
        sd.meter[k].parentElement!.classList.toggle('full', v >= 1);
      }
      sd.meterNum.textContent = String(Math.floor(f.meter / 100));
      sd.rage.style.width = f.rage + '%';
      sd.rage.parentElement!.classList.toggle('ready', f.rage >= 50);
      sd.assist.style.setProperty('--cd', String(Math.max(0, f.assistCd) / 720));
      sd.assist.classList.toggle('ready', f.assistCd <= 0);
      sd.weapon.textContent = f.weapon ? `${weaponIcon(f.weapon)} ×${f.weaponDur}` : '';
      if (sd.comboT > 0) {
        sd.comboT -= dt;
        if (sd.comboT <= 0) sd.combo.classList.remove('show');
      }
      const opp = s.f[1 - i];
      if (opp.comboHits >= 2) {
        sd.combo.innerHTML = `<b>${opp.comboHits}</b> HITS<small>${Math.round(opp.comboDmg)} DMG</small>`;
        sd.combo.classList.add('show');
        sd.comboT = 1.2;
      }
    });
    const secs = Math.ceil(s.timer / 60);
    this.timer.textContent = s.cfg.training || (s.cfg.timer ?? 90) <= 0 ? '∞' : String(secs);
    this.timer.classList.toggle('urgent', secs <= 10 && s.phase === 'fight');
    const sp = s.spin;
    (this.spin.children[0] as HTMLElement).style.width = 50 + sp / 2 + '%';
    (this.spin.children[1] as HTMLElement).style.width = 50 - sp / 2 + '%';
    if (this.centerT > 0) {
      this.centerT -= dt;
      if (this.centerT <= 0) this.center.innerHTML = '';
    }
    if (this.newsT > 0) {
      this.newsT -= dt;
      if (this.newsT <= 0) this.news.classList.add('hidden');
    }
    if (s.cfg.training) this.trainingPanel(s);
  }

  big(text: string, cls = '', t = 1.4) {
    this.center.innerHTML = `<div class="big ${cls}">${text}</div>`;
    this.centerT = t;
  }

  popup(text: string, x: number, y: number, cls = '') {
    const p = this.project(x, y);
    const e = h('div', 'pop ' + cls, text);
    e.style.left = p.x + 'px';
    e.style.top = p.y + 'px';
    this.popups.appendChild(e);
    setTimeout(() => e.remove(), 1100);
  }

  breaking(text: string) {
    const now = performance.now();
    if (now - this.lastNewsAt < 3500) return;
    this.lastNewsAt = now;
    this.newsChan.textContent = channel();
    this.newsText.textContent = text;
    this.news.classList.remove('hidden');
    this.news.classList.remove('anim');
    void this.news.offsetWidth;
    this.news.classList.add('anim');
    this.newsT = 3.2;
  }

  event(e: GameEvent, s: MatchState) {
    const x = e.x ?? 0;
    const y = e.y ?? 1;
    switch (e.t) {
      case 'round':
        this.big(e.v ? 'FINAL ROUND' : `ROUND ${e.n}`, 'round', 1.6);
        break;
      case 'fight':
        this.big('FIGHT!', 'fight', 1.0);
        break;
      case 'ko':
        this.big(e.v === 1 ? 'PERFECT K.O.' : 'K.O.', 'ko', 2.6);
        break;
      case 'timeUp':
        this.big('TIME UP', 'ko', 2.2);
        break;
      case 'finishHim':
        this.big('KHATAM KARO!', 'finish', 5);
        break;
      case 'counter':
        this.popup(e.k ?? 'COUNTER', x, y + 0.5, e.k === 'PUNISH' ? 'punish' : 'counter');
        break;
      case 'parry':
        this.popup('PARRY!', x, y + 0.4, 'parry');
        break;
      case 'firstBlood':
        this.popup('FIRST BLOOD', x, y + 0.6, 'blood');
        break;
      case 'wallSplat':
        this.popup('WALL SPLAT!', x, y, 'splat');
        break;
      case 'wallBreak':
        this.zone.textContent = `WALL BREAK! → ${STAGE_SIM[s.cfg.stage]?.zoneNames[(e.n ?? 1)] ?? ''}`;
        this.zone.classList.remove('hidden');
        setTimeout(() => this.zone.classList.add('hidden'), 2200);
        break;
      case 'groundBounce':
        this.popup('BOUNCE!', x, 0.8, 'small');
        break;
      case 'guardCrush':
        this.popup('GUARD CRUSH!', x, y, 'punish');
        break;
      case 'tech':
        this.popup(e.k === 'throw' ? 'THROW TECH' : 'TECH!', x, y, 'small');
        break;
      case 'evade':
        this.popup('EVADE', x, y, 'small');
        break;
      case 'armor':
        this.popup('ARMOR', x, y, 'small');
        break;
      case 'rageCancel':
        this.popup('RAGE CANCEL!', x, y + 0.5, 'rage');
        break;
      case 'burst':
        this.popup('BURST!', x, y + 0.5, 'rage');
        break;
      case 'super': {
        const f = s.f[e.s ?? 0];
        const m = e.k ? safeName(f.char, e.k) : '';
        this.popup((e.v ? 'X-RAY: ' : '') + m.toUpperCase(), f.x, 2.4, e.v ? 'xray' : 'super');
        break;
      }
      case 'ex':
        this.popup('EX!', x, 2.2, 'small');
        break;
      case 'install':
        this.popup('DHAMAKA MODE!', x, 2.2, 'rage');
        break;
      case 'comboEnd':
        if ((e.n ?? 0) >= 8) this.popup(`${e.n}-HIT BRUTAL!`, x, 2.2, 'blood');
        break;
      case 'hazardWarn':
        this.warn.innerHTML = `⚠ ${e.k === 'convoy' ? 'VIP CONVOY' : 'STRAY BULL'} INCOMING ${e.v && e.v > 0 ? '→' : '←'}`;
        this.warn.classList.remove('hidden');
        setTimeout(() => this.warn.classList.add('hidden'), 1800);
        break;
      case 'pickup':
        this.popup(`${weaponIcon(e.k ?? '')} ${String(e.k).toUpperCase()}!`, x, 1.6, 'small');
        break;
      case 'weaponBreak':
        this.popup('BROKEN!', x, y, 'small');
        break;
      case 'finisher': {
        const f = s.f[e.s ?? 0];
        const fin = CHARS[f.char].finishers.find((ff) => ff.id === e.k);
        const name = e.k === 'stage' ? STAGE_SIM[s.cfg.stage]?.finisher ?? 'STAGE FINISHER' : fin?.name ?? 'FINISHER';
        const kind = fin?.kind ?? 'stage';
        this.fin.innerHTML = `<div class="k ${kind}">${kind === 'comedy' ? 'COMEDY FINISH' : kind === 'stage' ? 'STAGE BRUTALITY' : 'BRUTALITY'}</div><div class="n">${name.toUpperCase()}</div>`;
        this.fin.classList.remove('hidden');
        this.center.innerHTML = '';
        setTimeout(() => this.fin.classList.add('hidden'), 4600);
        break;
      }
      case 'matchOver':
        break;
    }
    const news = liveHeadline(e, s);
    if (news && !s.cfg.training) this.breaking(news);
    if (s.cfg.training && (e.t === 'hit' || e.t === 'block')) this.frameData(e, s);
  }

  private frameData(e: GameEvent, s: MatchState) {
    if (e.s === undefined || e.s < 0) return;
    const a = s.f[e.t === 'hit' ? e.s : 1 - e.s];
    const d = s.f[1 - a.side];
    if (!a.move || !e.k || e.k.includes(':')) return;
    let m;
    try {
      m = getMove(a.char, e.k);
    } catch {
      return;
    }
    const remaining = m.startup + m.active + m.recovery - a.mf;
    const stun = e.t === 'hit' ? (d.st === 'hitstun' ? d.stun : 0) : d.stun;
    const adv = d.st === 'air' || d.st === 'knockdown' ? 'KD' : (stun - remaining > 0 ? '+' : '') + (stun - remaining);
    this.lastAdv = `<b>${m.name}</b> <span>${m.startup}f startup · ${m.active} active · ${m.recovery} recovery</span><span>${e.t === 'hit' ? 'ON HIT' : 'ON BLOCK'}: <b class="${adv.startsWith('-') ? 'neg' : 'pos'}">${adv}</b> · ${m.height.toUpperCase()} · ${m.damage} dmg</span>`;
  }

  private trainingPanel(s: MatchState) {
    if (!settings.showFrameData) {
      this.training.classList.add('hidden');
      return;
    }
    this.training.classList.remove('hidden');
    const d = s.f[1];
    this.training.innerHTML = `<div class="tp-title">TRAINING · ${s.f[0].char.toUpperCase()}</div>${this.lastAdv || '<span>Hit the dummy to see frame data.</span>'}<span>Combo: ${d.comboHits} hits / ${Math.round(d.comboDmg)} dmg · Juggle ${d.juggle}</span><span class="tp-keys">F1 dummy: <b>${(window as unknown as { __dummyMode?: string }).__dummyMode ?? 'stand'}</b> · F2 hitboxes · F3 reset</span>`;
  }
}

function safeName(char: string, id: string) {
  try {
    return getMove(char, id).name;
  } catch {
    return id;
  }
}

function weaponIcon(k: string) {
  return { chair: '🪑', mic: '🎤', placard: '🪧', lathi: '🦯', cone: '🚧' }[k] ?? '🔧';
}
