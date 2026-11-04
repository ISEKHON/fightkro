// All menus and game modes.
import { Game, type MatchOpts, type Replay, type SourceKind } from './game';
import { createMatch } from './sim/sim';
import { CHARS, PLAYABLE, ROSTER, registerChar } from './sim/roster';
import { STAGE_IDS, STAGE_SIM } from './sim/stages';
import type { CharDef, MatchCfg, MatchState } from './sim/types';
import { STAGE_LIST } from './render/stages';
import { portrait, clearPortrait } from './render/portrait';
import { LOOKS, hex, lookFor, setLook, type Look } from './render/looks';
import { audio } from './audio/audio';
import { settings, saveSettings, progress, saveProgress, load, save, DEFAULT_SETTINGS } from './core/store';
import { keyBindings, saveKeys, resetKeys, onAnyKey, padBindings, savePad, connectedPads, isTouchDevice, DEFAULT_PAD } from './core/input';
import { el, esc, FocusNav, toast, announce } from './ui/dom';
import { frontPage } from './ui/news';
import { PERKS, PERK_UNLOCKS, CAMPAIGN, CAMPAIGN_EVENTS, campaignEnding, DAILY_MODS, dailySeed, tierFor } from './modes/data';
import { decodeReplay, deleteReplay, encodeReplay, savedReplays, storeReplay, b64u, unb64u, deflate, inflate } from './core/replay';
import { ClipRecorder, shareOrDownload } from './core/clip';
import { NetClient } from './net/net';
import { RollbackDriver, SpectatorDriver } from './net/rollback';
import { mergeGhost, type Difficulty, type GhostProfile } from './ai/cpu';
import type { ButtonName } from './sim/input';

type Mode = 'arcade' | 'versus' | 'local' | 'training' | 'survival' | 'campaign' | 'rally' | 'daily' | 'online' | 'ghost' | 'replay' | 'spectate';

interface Pick {
  p1: string;
  p2: string;
  a1: string;
  a2: string;
  stage: string;
  diff: Difficulty;
  perks: string[];
}

const PLAYER_ID: string = (() => {
  let id = load('pid', '');
  if (!id) {
    id = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
    save('pid', id);
  }
  return id;
})();

export class App {
  game: Game;
  ui: HTMLElement;
  nav = new FocusNav();
  screen = '';
  pick: Pick = { p1: 'jumla', p2: 'ghotala', a1: 'tolltax', a2: 'anchor', stage: 'assembly', diff: settings.difficulty, perks: [] };
  mode: Mode = 'versus';
  arcade: { ladder: string[]; idx: number; continues: number } | null = null;
  survival: { streak: number; hp: number } | null = null;
  campaign: { idx: number; funds: number; votes: number; perks: string[]; won: string[]; lost: string[] } | null = null;
  rally: { mine: string[]; theirs: string[]; hp: number; loyalty: number[]; log: string[] } | null = null;
  net: NetClient | null = null;
  clip = new ClipRecorder();
  lastReplay: Replay | null = null;
  ghost: GhostProfile | null = load('ghost', null as GhostProfile | null);
  menuState: MatchState | null = null;
  private lastMatchCfg: { cfg: MatchCfg; opts: MatchOpts } | null = null;
  private dailyMod = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.ui = document.getElementById('ui')!;
    const q = settings.quality < 0 ? autoQuality() : settings.quality;
    this.game = new Game(canvas, document.getElementById('hudroot')!, { quality: q, gore: settings.gore, shake: settings.shake, flashes: settings.flashes });
    this.game.onPause = () => this.pause();
    this.loadCustomChars();
    this.setupMenuScene();
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.game.running && !this.game.paused && this.screen === 'fight') this.pause();
      if (this.game.running && this.mode === 'training' && this.screen === 'fight') this.trainingKeys(e);
    });
    onNavStart(() => {
      if (this.game.running && !this.game.paused && this.screen === 'fight') this.pause();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.game.running && !this.game.paused && this.screen === 'fight' && this.mode !== 'online') this.pause();
    });
    this.autoQualityWatch();
  }

  // ------------------------------------------------------------------ helpers
  clear(name: string) {
    this.screen = name;
    this.ui.innerHTML = '';
    this.ui.className = 'screen-' + name;
    this.nav.detach();
    document.body.classList.toggle('in-fight', name === 'fight');
  }

  btn(label: string, fn: () => void, cls = '') {
    const b = el('button', { class: 'nav btn ' + cls }, label);
    b.addEventListener('click', () => {
      audio.unlock();
      audio.play('confirm');
      fn();
    });
    return b;
  }

  panel(title: string, back?: () => void) {
    const p = el('div', { class: 'panel' });
    const head = el('div', { class: 'panel-head' });
    if (back) {
      const b = el('button', { class: 'nav back', 'data-back': '1', 'aria-label': 'Back' }, '‹ BACK');
      b.addEventListener('click', () => {
        audio.play('back');
        back();
      });
      head.appendChild(b);
    }
    head.appendChild(el('h2', {}, title));
    p.appendChild(head);
    this.ui.appendChild(p);
    return p;
  }

  setupMenuScene() {
    const stages = STAGE_IDS;
    let a = PLAYABLE[Math.floor(Math.random() * PLAYABLE.length)];
    let b = PLAYABLE.filter((x) => x !== a)[Math.floor(Math.random() * (PLAYABLE.length - 1))];
    const make = () => {
      const s = createMatch({ p: [{ char: a }, { char: b }], stage: stages[Math.floor(Math.random() * stages.length)] });
      s.phase = 'fight';
      s.f.forEach((f) => (f.st = 'idle'));
      return s;
    };
    this.menuState = make();
    this.game.renderer.setMatch(this.menuState);
    this.game.menuScene = (dt) => {
      const s = this.menuState!;
      s.f[0].x = -1.3;
      s.f[1].x = 1.3;
      this.game.renderer.frame(s, [], dt);
    };
    this.refreshMenuScene = (p1?: string, p2?: string) => {
      a = p1 ?? a;
      b = p2 ?? b;
      this.menuState = make();
      this.game.renderer.setMatch(this.menuState);
    };
  }
  refreshMenuScene: (p1?: string, p2?: string) => void = () => {};

  loadCustomChars() {
    const custom = load('customChars', [] as { base: string; id: string; name: string; party: string; slogan: string; look: Look }[]);
    for (const c of custom) this.registerCustom(c);
  }

  registerCustom(c: { base: string; id: string; name: string; party: string; slogan: string; look: Look }) {
    const base = CHARS[c.base];
    if (!base) return;
    const def: CharDef = { ...base, id: c.id, name: c.name.toUpperCase(), title: 'Custom Neta', party: c.party, slogan: c.slogan, bio: `Built in the Neta Creator on the ${base.name} archetype.`, boss: false };
    registerChar(def);
    setLook(c.id, c.look);
    clearPortrait(c.id);
    if (!PLAYABLE.includes(c.id)) PLAYABLE.push(c.id);
  }

  autoQualityWatch() {
    if (settings.quality >= 0) return;
    let lowFor = 0;
    setInterval(() => {
      if (!this.game.running || this.game.paused) return;
      const fps = this.game.fps;
      const q = this.game.renderer.settings.quality;
      if (fps < 42 && q > 0) {
        lowFor++;
        if (lowFor >= 2) {
          this.game.renderer.applySettings({ ...this.game.renderer.settings, quality: q - 1 });
          toast(`Auto quality: ${['LOW', 'MEDIUM', 'HIGH'][q - 1]}`);
          lowFor = 0;
        }
      } else lowFor = 0;
    }, 2000);
  }

  // ------------------------------------------------------------------ boot
  boot() {
    const hash = location.hash;
    if (!settings.ageOk) return this.disclaimer(() => this.boot());
    if (hash.startsWith('#replay=')) {
      decodeReplay(hash.slice(8))
        .then((r) => this.playReplay(r))
        .catch(() => this.title());
      history.replaceState(null, '', location.pathname);
      return;
    }
    if (hash.startsWith('#room=')) {
      const code = hash.slice(6);
      history.replaceState(null, '', location.pathname);
      return this.title(() => this.online(code));
    }
    if (hash.startsWith('#watch=')) {
      const code = hash.slice(7);
      history.replaceState(null, '', location.pathname);
      return this.title(() => this.spectate(code));
    }
    if (hash.startsWith('#ghost=')) {
      const code = hash.slice(7);
      history.replaceState(null, '', location.pathname);
      inflate(unb64u(code))
        .then((t) => {
          const g = JSON.parse(t) as GhostProfile;
          save('ghostFriend', g);
          toast(`Ghost of ${g.name} loaded — fight it from GHOSTS`);
        })
        .catch(() => {});
    }
    this.title();
  }

  disclaimer(next: () => void) {
    this.clear('disclaimer');
    const p = this.panel('SATIRE & VIOLENCE NOTICE · व्यंग्य सूचना');
    p.classList.add('narrow');
    p.appendChild(
      el(
        'div',
        { class: 'legal' },
        `<p><b>KURSI KAND</b> is an original work of political <b>satire and parody</b>. Every character, party, slogan and headline is <b>fictional</b>; none depicts or represents any real person, party or organisation. Any resemblance is coincidental and satirical.</p>
<p>The game contains <b>cartoon violence and stylised gore</b> (blood can be recoloured or switched off below and in Settings). Please don't imitate it in real life.</p>
<p>यह एक काल्पनिक व्यंग्यात्मक खेल है। सभी पात्र और घटनाएँ काल्पनिक हैं। इसमें कार्टून हिंसा है — कृपया वास्तविक जीवन में नकल न करें।</p>`,
      ),
    );
    const row = el('div', { class: 'row' });
    const gore = el('div', { class: 'seg-pick' });
    for (const g of ['red', 'green', 'off'] as const) {
      const b = el('button', { class: 'nav chip' + (settings.gore === g ? ' on' : '') }, g === 'red' ? '🩸 Blood' : g === 'green' ? '🟢 Green blood' : '🚫 No gore');
      b.onclick = () => {
        settings.gore = g;
        saveSettings();
        gore.querySelectorAll('.chip').forEach((c) => c.classList.remove('on'));
        b.classList.add('on');
      };
      gore.appendChild(b);
    }
    row.appendChild(gore);
    p.appendChild(row);
    p.appendChild(
      this.btn(
        'I UNDERSTAND — LET ME IN',
        () => {
          settings.ageOk = true;
          saveSettings();
          this.game.renderer.applySettings({ ...this.game.renderer.settings, gore: settings.gore });
          next();
        },
        'primary default',
      ),
    );
    this.nav.attach(p, null);
  }

  title(after?: () => void) {
    this.clear('title');
    const t = el('div', { class: 'title' });
    t.innerHTML = `<div class="logo"><span class="k1">KURSI</span><span class="k2">KAND</span></div><div class="tag">THE BRUTAL BATTLE FOR THE THRONE</div><div class="press">${isTouchDevice() ? 'TAP TO START' : 'PRESS ANY KEY / BUTTON'}</div><div class="fine">Original satire · All characters fictional · v${__APP_VERSION__}</div>`;
    this.ui.appendChild(t);
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      off();
      audio.unlock();
      audio.play('confirm');
      audio.startMusic('menu');
      requestFullscreenMaybe();
      if (after) after();
      else this.menu();
    };
    const off = onAnyKey(go);
    t.addEventListener('pointerdown', go);
    const padPoll = setInterval(() => {
      if (done) return clearInterval(padPoll);
      if (connectedPads().some((p) => p.buttons.some((b) => b.pressed))) go();
    }, 100);
  }

  menu() {
    this.game.stop();
    this.clear('menu');
    this.refreshMenuScene();
    audio.startMusic('menu');
    const wrap = el('div', { class: 'menu' });
    wrap.innerHTML = `<div class="logo small"><span class="k1">KURSI</span><span class="k2">KAND</span></div>`;
    const grid = el('div', { class: 'menu-grid' });
    const items: [string, string, () => void, string?][] = [
      ['ARCADE', 'Fight the ladder, beat SUPREMO', () => this.startSelect('arcade'), 'primary default'],
      ['VERSUS CPU', 'Quick fight vs the computer', () => this.startSelect('versus')],
      ['LOCAL 2P', 'Same screen: keyboard / gamepads', () => this.startSelect('local')],
      ['ONLINE', 'Rooms, ranked & spectate', () => this.online()],
      ['ELECTION CAMPAIGN', 'Roguelite run across the states', () => this.startSelect('campaign')],
      ['RALLY 3v3', 'Alliance war (watch for traitors)', () => this.rallySelect()],
      ['SURVIVAL', 'How many netas can you beat?', () => this.startSelect('survival')],
      ['DAILY CHALLENGE', 'Seeded fight, global board', () => this.daily()],
      ['TRAINING', 'Frame data, dummy, combos', () => this.startSelect('training')],
      ['GHOSTS', 'Fight AI trained on your habits', () => this.ghosts()],
      ['REPLAYS', 'Watch & share fights', () => this.replays()],
      ['NETA CREATOR', 'Build your own fighter', () => this.creator()],
      ['HOW TO PLAY', 'Controls & move lists', () => this.howto()],
      ['SETTINGS', 'Video, audio, controls, gore', () => this.settingsScreen()],
    ];
    for (const [label, sub, fn, cls] of items) {
      const b = this.btn(`<b>${label}</b><small>${sub}</small>`, fn, 'menu-item ' + (cls ?? ''));
      grid.appendChild(b);
    }
    wrap.appendChild(grid);
    const stats = el('div', { class: 'menu-stats' }, `W ${progress.wins} · L ${progress.losses} · Finishers ${progress.finishers} · Best combo ${progress.maxCombo} · <span style="color:${tierFor(progress.rating).color}">${tierFor(progress.rating).name} ${progress.rating}</span>`);
    wrap.appendChild(stats);
    this.ui.appendChild(wrap);
    this.nav.attach(wrap, null);
    announce('Main menu');
  }

  // ------------------------------------------------------------------ character select
  startSelect(mode: Mode) {
    this.mode = mode;
    this.select({
      players: mode === 'local' ? 2 : 1,
      allowBoss: progress.bossUnlocked && mode !== 'campaign',
      title: { arcade: 'ARCADE', versus: 'VERSUS CPU', local: 'LOCAL VERSUS', training: 'TRAINING', survival: 'SURVIVAL', campaign: 'ELECTION CAMPAIGN', ghost: 'GHOST FIGHT', daily: 'DAILY', rally: 'RALLY', online: 'ONLINE', replay: '', spectate: '' }[mode],
      pickOpponent: mode === 'versus' || mode === 'local' || mode === 'training' || mode === 'ghost',
      stage: mode !== 'arcade' && mode !== 'campaign' && mode !== 'survival',
      diff: mode === 'versus' || mode === 'arcade' || mode === 'survival' || mode === 'campaign' || mode === 'ghost',
      perks: mode !== 'training' && mode !== 'campaign',
      onDone: () => this.afterSelect(),
      onBack: () => this.menu(),
    });
  }

  select(o: { players: number; allowBoss: boolean; title: string; pickOpponent: boolean; stage: boolean; diff: boolean; perks: boolean; onDone: () => void; onBack: () => void }) {
    this.clear('select');
    const ids = ROSTER.filter((c) => !c.boss || o.allowBoss).map((c) => c.id);
    let phase: 'p1' | 'a1' | 'p2' | 'a2' | 'opts' = 'p1';
    const cursor = { p1: Math.max(0, ids.indexOf(this.pick.p1)), p2: Math.max(0, ids.indexOf(this.pick.p2)) };
    const root = el('div', { class: 'select' });
    root.innerHTML = `
      <div class="sel-top"><button class="nav back" data-back="1">‹ BACK</button><h2>${o.title} — <span class="sel-phase"></span></h2></div>
      <div class="sel-main">
        <div class="sel-side s0"><img class="sel-full"><div class="sel-info"></div></div>
        <div class="sel-center"><div class="sel-grid"></div><div class="sel-opts"></div></div>
        <div class="sel-side s1"><img class="sel-full"><div class="sel-info"></div></div>
      </div>
      <div class="sel-bottom"></div>`;
    this.ui.appendChild(root);
    const grid = root.querySelector('.sel-grid') as HTMLElement;
    const phaseEl = root.querySelector('.sel-phase') as HTMLElement;
    const opts = root.querySelector('.sel-opts') as HTMLElement;
    const bottom = root.querySelector('.sel-bottom') as HTMLElement;
    const tiles: HTMLElement[] = [];
    ids.forEach((id, i) => {
      const c = CHARS[id];
      const t = el('button', { class: 'nav tile' + (c.boss ? ' boss' : ''), 'aria-label': c.name }, `<img src="${portrait(id)}" alt=""><span>${esc(c.name)}</span>`);
      t.style.setProperty('--pc', hex(lookFor(id).partyColor));
      t.onclick = () => {
        audio.play('select');
        if (phase === 'p1' || phase === 'a1') cursor.p1 = i;
        else cursor.p2 = i;
        confirm();
      };
      t.addEventListener('pointerenter', () => {
        if (phase === 'p1' || phase === 'a1') cursor.p1 = i;
        else if (phase === 'p2' || phase === 'a2') cursor.p2 = i;
        draw();
      });
      t.addEventListener('focus', () => {
        if (phase === 'p1' || phase === 'a1') cursor.p1 = i;
        else if (phase === 'p2' || phase === 'a2') cursor.p2 = i;
        draw();
      });
      grid.appendChild(t);
      tiles.push(t);
    });
    if (!o.allowBoss && !progress.bossUnlocked) {
      const lock = el('div', { class: 'tile locked' }, `<span>🔒</span><span>Beat Arcade to unlock</span>`);
      grid.appendChild(lock);
    }
    const info = (side: 0 | 1, id: string, assist?: string) => {
      const c = CHARS[id];
      const s = c.stats;
      const sideEl = root.querySelector('.sel-side.s' + side) as HTMLElement;
      (sideEl.querySelector('.sel-full') as HTMLImageElement).src = portrait(id, 'full');
      const bar = (label: string, v: number) => `<div class="stat"><span>${label}</span><i style="width:${Math.round(v * 100)}%"></i></div>`;
      const specials = c.specials.map((sp) => `<li>${esc(c.moves[sp.l].name)} <code>${esc(c.moves[sp.l].input ?? '')}</code></li>`).join('');
      (sideEl.querySelector('.sel-info') as HTMLElement).innerHTML = `
        <div class="nm" style="color:${hex(lookFor(id).partyColor)}">${esc(c.name)}</div>
        <div class="ttl">${esc(c.title)} · ${esc(c.party)}</div>
        <div class="bio">"${esc(c.slogan)}" — ${esc(c.bio)}</div>
        ${bar('POWER', (s.power - 0.9) / 0.25)}${bar('SPEED', (s.walk - 0.03) / 0.025)}${bar('HEALTH', (s.hp - 900) / 350)}
        <ul class="specials">${specials}</ul>
        ${assist ? `<div class="assist">TAG PARTNER: <b>${esc(CHARS[assist].name)}</b> (${esc(CHARS[assist].assist.name)})</div>` : ''}`;
    };
    const draw = () => {
      const p1 = ids[cursor.p1];
      const p2 = ids[cursor.p2];
      tiles.forEach((t, i) => {
        t.classList.toggle('c1', i === cursor.p1 && phase !== 'p2' && phase !== 'a2' ? true : i === cursor.p1 && phase !== 'p1');
        t.classList.toggle('c2', o.pickOpponent || o.players === 2 ? i === cursor.p2 && (phase === 'p2' || phase === 'a2' || phase === 'opts') : false);
      });
      const labels = { p1: 'PICK YOUR NETA', a1: 'PICK YOUR TAG PARTNER', p2: o.players === 2 ? 'PLAYER 2: PICK' : 'PICK OPPONENT', a2: o.players === 2 ? 'PLAYER 2: TAG PARTNER' : 'OPPONENT TAG PARTNER', opts: 'READY?' };
      phaseEl.textContent = labels[phase];
      info(0, phase === 'p1' ? p1 : this.pick.p1, phase === 'a1' ? p1 : phase === 'p1' ? undefined : this.pick.a1);
      if (o.pickOpponent || o.players === 2) info(1, phase === 'p2' ? p2 : this.pick.p2, phase === 'a2' ? p2 : phase === 'opts' ? this.pick.a2 : undefined);
      else (root.querySelector('.sel-side.s1') as HTMLElement).style.visibility = 'hidden';
      announce(labels[phase] + ': ' + CHARS[phase === 'p2' || phase === 'a2' ? p2 : p1].name);
    };
    const confirm = () => {
      if (phase === 'p1') {
        this.pick.p1 = ids[cursor.p1];
        phase = 'a1';
        cursor.p1 = (cursor.p1 + 1) % ids.length;
        audio.say(CHARS[this.pick.p1].name, { pitch: lookFor(this.pick.p1).voice.pitch, voice: 'char' });
      } else if (phase === 'a1') {
        this.pick.a1 = ids[cursor.p1];
        phase = o.pickOpponent || o.players === 2 ? 'p2' : 'opts';
      } else if (phase === 'p2') {
        this.pick.p2 = ids[cursor.p2];
        phase = 'a2';
        cursor.p2 = (cursor.p2 + 1) % ids.length;
      } else if (phase === 'a2') {
        this.pick.a2 = ids[cursor.p2];
        phase = 'opts';
      }
      this.refreshMenuScene(this.pick.p1, phase === 'opts' && (o.pickOpponent || o.players === 2) ? this.pick.p2 : undefined);
      draw();
      if (phase === 'opts') showOpts();
      else (tiles[phase === 'p2' || phase === 'a2' ? cursor.p2 : cursor.p1] ?? tiles[0]).focus({ preventScroll: true });
    };
    const showOpts = () => {
      opts.innerHTML = '';
      opts.classList.add('show');
      if (o.stage) {
        const st = el('div', { class: 'opt-row' }, '<label>STAGE</label>');
        for (const s of STAGE_LIST) {
          const b = el('button', { class: 'nav chip' + (this.pick.stage === s.id ? ' on' : ''), title: s.blurb }, s.name);
          b.onclick = () => {
            this.pick.stage = s.id;
            st.querySelectorAll('.chip').forEach((c) => c.classList.remove('on'));
            b.classList.add('on');
            audio.play('select');
          };
          st.appendChild(b);
        }
        const rnd = el('button', { class: 'nav chip' }, '🎲');
        rnd.onclick = () => {
          this.pick.stage = STAGE_IDS[Math.floor(Math.random() * STAGE_IDS.length)];
          st.querySelectorAll('.chip').forEach((c, i) => c.classList.toggle('on', STAGE_LIST[i]?.id === this.pick.stage));
        };
        st.appendChild(rnd);
        opts.appendChild(st);
      }
      if (o.diff) {
        const df = el('div', { class: 'opt-row' }, '<label>CPU</label>');
        for (const d of ['easy', 'normal', 'hard', 'brutal'] as Difficulty[]) {
          const b = el('button', { class: 'nav chip' + (this.pick.diff === d ? ' on' : '') }, d.toUpperCase());
          b.onclick = () => {
            this.pick.diff = d;
            settings.difficulty = d;
            saveSettings();
            df.querySelectorAll('.chip').forEach((c) => c.classList.remove('on'));
            b.classList.add('on');
          };
          df.appendChild(b);
        }
        opts.appendChild(df);
      }
      const go = this.btn(o.perks ? 'NEXT: MANIFESTO ›' : 'FIGHT! ›', () => (o.perks ? this.perksScreen(o.onDone, () => this.startSelect(this.mode)) : o.onDone()), 'primary default');
      opts.appendChild(go);
      go.focus();
    };
    const back = () => {
      if (phase === 'p1') return o.onBack();
      if (phase === 'opts') {
        opts.classList.remove('show');
        phase = o.pickOpponent || o.players === 2 ? 'a2' : 'a1';
      } else if (phase === 'a2') phase = 'p2';
      else if (phase === 'p2') phase = 'a1';
      else if (phase === 'a1') phase = 'p1';
      draw();
    };
    (root.querySelector('.back') as HTMLElement).onclick = back;
    const cols = () => {
      const r0 = tiles[0].getBoundingClientRect().top;
      return tiles.filter((t) => Math.abs(t.getBoundingClientRect().top - r0) < 5).length || 3;
    };
    this.nav.attach(root, back, (d) => {
      if (phase === 'opts') return false;
      const key = phase === 'p2' || phase === 'a2' ? 'p2' : 'p1';
      const n = ids.length;
      const c = cols();
      if (d === 'left') cursor[key] = (cursor[key] - 1 + n) % n;
      else if (d === 'right') cursor[key] = (cursor[key] + 1) % n;
      else if (d === 'up') cursor[key] = (cursor[key] - c + n) % n;
      else if (d === 'down') cursor[key] = (cursor[key] + c) % n;
      else if (d === 'ok' || d === 'start') {
        audio.play('select');
        confirm();
        return true;
      } else return false;
      audio.play('ui');
      tiles[cursor[key]].focus({ preventScroll: true });
      draw();
      return true;
    });
    draw();
    tiles[cursor.p1]?.focus({ preventScroll: true });
    bottom.innerHTML = isTouchDevice() ? 'Tap a face to pick' : 'Move: WASD/Arrows/D-pad · Pick: Enter/U/A · Back: Esc/I/B';
  }

  perksScreen(next: () => void, back: () => void) {
    this.clear('perks');
    const p = this.panel('MANIFESTO — PICK UP TO 3 PROMISES', back);
    const chosen = new Set(this.pick.perks.filter((x) => progress.perksUnlocked.includes(x)));
    const grid = el('div', { class: 'perk-grid' });
    for (const perk of PERKS) {
      const unlocked = progress.perksUnlocked.includes(perk.id);
      const b = el('button', { class: 'nav perk' + (chosen.has(perk.id) ? ' on' : '') + (unlocked ? '' : ' locked') }, `<span class="ic">${perk.icon}</span><b>${perk.name}</b><small>${unlocked ? perk.desc : '🔒 ' + (PERK_UNLOCKS[perk.id] ?? '')}</small>`);
      if (!unlocked) b.setAttribute('disabled', '');
      b.onclick = () => {
        if (chosen.has(perk.id)) chosen.delete(perk.id);
        else if (chosen.size < 3) chosen.add(perk.id);
        b.classList.toggle('on', chosen.has(perk.id));
        audio.play('select');
      };
      grid.appendChild(b);
    }
    p.appendChild(grid);
    const row = el('div', { class: 'row' });
    row.appendChild(this.btn('NO PROMISES (PURE SKILL)', () => {
      this.pick.perks = [];
      next();
    }));
    row.appendChild(this.btn('FIGHT! ›', () => {
      this.pick.perks = [...chosen];
      next();
    }, 'primary default'));
    p.appendChild(row);
    this.nav.attach(p, back);
  }

  afterSelect() {
    switch (this.mode) {
      case 'arcade': {
        const others = PLAYABLE.filter((x) => x !== this.pick.p1 && !CHARS[x].boss && !x.startsWith('custom'));
        shuffle(others);
        this.arcade = { ladder: [...others.slice(0, 6), 'supremo'], idx: 0, continues: 3 };
        return this.arcadeNext();
      }
      case 'survival':
        this.survival = { streak: 0, hp: 1 };
        return this.survivalNext();
      case 'campaign':
        this.campaign = { idx: -1, funds: 100, votes: 0, perks: [], won: [], lost: [] };
        return this.campaignMap();
      case 'training':
        return this.fight({ p: [{ char: this.pick.p1, assist: this.pick.a1 }, { char: this.pick.p2, assist: this.pick.a2 }], stage: this.pick.stage, training: true, timer: 0 }, { sources: [srcP1(), 'dummy'] });
      case 'local':
        return this.vsScreen(this.pick.p1, this.pick.p2, this.pick.stage, () => this.fight(this.cfgFromPick(), { sources: ['kb0', 'kb1'], names: ['PLAYER 1', 'PLAYER 2'] }));
      case 'ghost':
        return this.vsScreen(this.pick.p1, this.pick.p2, this.pick.stage, () => this.fight(this.cfgFromPick(), { sources: [srcP1(), 'cpu'], difficulty: 'hard', ghost: this.currentGhost, names: ['YOU', 'GHOST: ' + (this.currentGhost?.name ?? '???')] }));
      default:
        return this.vsScreen(this.pick.p1, this.pick.p2, this.pick.stage, () => this.fight(this.cfgFromPick(), { sources: [srcP1(), 'cpu'], difficulty: this.pick.diff }));
    }
  }
  currentGhost: GhostProfile | null = null;

  cfgFromPick(): MatchCfg {
    return {
      p: [
        { char: this.pick.p1, assist: this.pick.a1, perks: this.pick.perks, leniency: isTouchDevice() ? settings.leniency : 1, smart: isTouchDevice() && settings.touchLayout === 'smart' },
        { char: this.pick.p2, assist: this.pick.a2, perks: this.mode === 'local' ? this.pick.perks : [], hpScale: CHARS[this.pick.p2].boss && this.pick.diff !== 'easy' ? (this.pick.diff === 'normal' ? 1.2 : 1.6) : 1 },
      ],
      stage: this.pick.stage,
      rounds: settings.rounds,
      timer: settings.timer,
      seed: (Math.random() * 1e9) | 0,
      hazards: settings.hazards,
    };
  }

  vsScreen(a: string, b: string, stage: string, next: () => void, sub = '') {
    this.clear('vs');
    const ca = CHARS[a];
    const cb = CHARS[b];
    const v = el('div', { class: 'vs' });
    v.innerHTML = `
      <div class="vs-side l" style="--pc:${hex(lookFor(a).partyColor)}"><img src="${portrait(a, 'full')}"><div class="vs-name">${esc(ca.name)}</div><div class="vs-party">${esc(ca.party)}</div><div class="vs-quote">"${esc(ca.slogan)}"</div></div>
      <div class="vs-mid"><div class="vs-vs">VS</div><div class="vs-stage">${esc(STAGE_SIM[stage]?.name ?? '')}</div><div class="vs-sub">${sub}</div></div>
      <div class="vs-side r" style="--pc:${hex(lookFor(b).partyColor)}"><img src="${portrait(b, 'full')}"><div class="vs-name">${esc(cb.name)}</div><div class="vs-party">${esc(cb.party)}</div><div class="vs-quote">"${esc(cb.slogan)}"</div></div>`;
    this.ui.appendChild(v);
    audio.play('boom');
    audio.say(`${ca.name}. versus. ${cb.name}`, { pitch: 0.5 });
    let gone = false;
    const go = () => {
      if (gone) return;
      gone = true;
      off();
      next();
    };
    const off = onAnyKey(go);
    v.addEventListener('pointerdown', go);
    setTimeout(go, 2600);
  }

  // ------------------------------------------------------------------ fight lifecycle
  fight(cfg: MatchCfg, opts: MatchOpts) {
    this.clear('fight');
    this.lastMatchCfg = { cfg, opts };
    const userEnd = opts.onEnd;
    opts.onEnd = (s, rep) => {
      this.lastReplay = rep;
      this.recordStats(s);
      if (userEnd) userEnd(s, rep);
      else this.results(s);
    };
    this.game.start(cfg, opts);
    this.ui.appendChild(el('div', { class: 'fight-layer' }));
    if (this.mode === 'training') this.trainingBar();
    const noHud = this.campaign && CAMPAIGN[this.campaign.idx]?.scandal.noHud;
    document.body.classList.toggle('no-hud', !!noHud);
    if (load('clipsOn', false)) {
      this.clip.start(this.game.canvas);
      this.clip.overlay = { title: `${CHARS[cfg.p[0].char].name} vs ${CHARS[cfg.p[1].char].name}`, sub: STAGE_SIM[cfg.stage]?.name ?? '' };
    }
    if (opts.sources.includes('touch') || (isTouchDevice() && opts.sources.includes('p1'))) this.game.touch.show(true);
  }

  recordStats(s: MatchState) {
    if (this.mode === 'replay' || this.mode === 'spectate' || this.mode === 'training') return;
    const me = s.f[0];
    if (this.mode !== 'local' && this.mode !== 'online') {
      if (s.matchWinner === 0) progress.wins++;
      else if (s.matchWinner === 1) progress.losses++;
    }
    if (s.finisher && s.finisher.by === 0) progress.finishers++;
    progress.maxCombo = Math.max(progress.maxCombo, me.maxCombo);
    const unlock = (id: string) => {
      if (!progress.perksUnlocked.includes(id)) {
        progress.perksUnlocked.push(id);
        setTimeout(() => toast(`Promise unlocked: ${PERKS.find((p) => p.id === id)?.name}`), 1200);
      }
    };
    if (progress.wins >= 3) unlock('tank');
    if (progress.wins >= 10) unlock('weaponMaster');
    if (progress.finishers >= 1) unlock('richStart');
    if (progress.maxCombo >= 10) unlock('angry');
    saveProgress();
    // learn the player's habits for their ghost
    if (this.mode !== 'local' && this.mode !== 'online') {
      this.ghost = mergeGhost(this.ghost, this.game.ghostRec.profile(settings.playerName));
      save('ghost', this.ghost);
    }
  }

  results(s: MatchState, extra?: { title?: string; buttons?: [string, () => void, string?][] }) {
    this.clip.overlay = { title: frontPage(s).headline, sub: '' };
    this.clear('results');
    this.game.touch.show(false);
    this.game.hud.show(false);
    const fp = frontPage(s);
    const w = s.matchWinner;
    const youWin = w === 0;
    const r = el('div', { class: 'results' });
    const winnerName = w >= 0 ? CHARS[s.f[w].char].name : 'NOBODY';
    r.innerHTML = `
      <div class="paper">
        <div class="paper-name">${fp.paper}</div>
        <div class="paper-date">${new Date().toDateString().toUpperCase()} · PRICE: ONE VOTE</div>
        <div class="paper-head">${esc(fp.headline)}</div>
        <div class="paper-body"><img src="${portrait(s.f[Math.max(0, w)].char, 'full')}"><p>${esc(fp.sub)}</p></div>
      </div>
      <div class="res-side">
        <div class="res-title ${youWin ? 'win' : 'lose'}">${extra?.title ?? (this.mode === 'local' || this.mode === 'replay' || this.mode === 'spectate' ? `${esc(winnerName)} WINS` : youWin ? 'YOU WIN!' : w < 0 ? 'DRAW' : 'YOU LOSE')}</div>
        <div class="res-stats">
          ${s.f.map((f) => `<div><b>${esc(CHARS[f.char].name)}</b><span>Damage ${Math.round(f.dmgDealt)}</span><span>Best combo ${f.maxCombo}</span><span>Parries ${f.parries}</span></div>`).join('')}
        </div>
        <div class="res-btns"></div>
      </div>`;
    this.ui.appendChild(r);
    const btns = r.querySelector('.res-btns') as HTMLElement;
    const buttons: [string, () => void, string?][] = extra?.buttons ?? [
      ['REMATCH', () => this.lastMatchCfg && this.fight({ ...this.lastMatchCfg.cfg, seed: (Math.random() * 1e9) | 0 }, { ...this.lastMatchCfg.opts, onEnd: undefined }), 'primary default'],
      ['CHARACTER SELECT', () => this.startSelect(this.mode)],
      ['MAIN MENU', () => this.menu()],
    ];
    for (const [label, fn, cls] of buttons) btns.appendChild(this.btn(label, fn, cls));
    const share = el('div', { class: 'res-share' });
    if (this.lastReplay && this.mode !== 'replay') {
      share.appendChild(this.btn('💾 SAVE REPLAY', async () => {
        await storeReplay(this.lastReplay!, `${CHARS[s.f[0].char].name} vs ${CHARS[s.f[1].char].name}`);
        toast('Replay saved');
      }, 'small'));
      share.appendChild(this.btn('🔗 SHARE REPLAY LINK', async () => {
        const code = await encodeReplay(this.lastReplay!);
        shareText(`${fp.headline} — watch the fight in KURSI KAND`, `${location.origin}${location.pathname}#replay=${code}`);
      }, 'small'));
    }
    if (this.clip.active) {
      share.appendChild(this.btn('🎬 SHARE CLIP', async () => {
        const b = await this.clip.grab();
        if (!b) return toast('No clip recorded yet');
        const how = await shareOrDownload(b, 'kursi-kand-clip', fp.headline);
        toast(how === 'shared' ? 'Shared!' : 'Clip downloaded');
      }, 'small'));
    }
    share.appendChild(this.btn('📲 WHATSAPP', () => {
      window.open(`https://wa.me/?text=${encodeURIComponent(`${fp.headline} 🥊 Play KURSI KAND: ${location.origin}${location.pathname}`)}`, '_blank');
    }, 'small'));
    btns.appendChild(share);
    this.nav.attach(r, () => this.menu());
    audio.play(youWin ? 'cheer' : 'boo');
    announce(fp.headline);
  }

  pause() {
    if (!this.game.running || this.mode === 'online' || this.mode === 'spectate') return;
    this.game.paused = true;
    this.game.touch.show(false);
    const ov = el('div', { class: 'pause' });
    ov.innerHTML = `<h2>CHAI BREAK ☕</h2><p>Sansad adjourned till further notice.</p>`;
    const list = el('div', { class: 'pause-btns' });
    const resume = () => {
      ov.remove();
      this.game.paused = false;
      this.nav.detach();
      if (this.game.opts?.sources.includes('touch') || isTouchDevice()) this.game.touch.show(true);
    };
    list.appendChild(this.btn('RESUME', resume, 'primary default'));
    list.appendChild(this.btn('MOVE LIST', () => this.moveList(this.game.s?.f[0].char ?? 'jumla', ov)));
    list.appendChild(this.btn('RESTART', () => {
      ov.remove();
      if (this.lastMatchCfg) this.fight({ ...this.lastMatchCfg.cfg }, { ...this.lastMatchCfg.opts });
    }));
    list.appendChild(this.btn(`SOUND: ${settings.sfx > 0 ? 'ON' : 'OFF'}`, () => {
      const on = settings.sfx > 0;
      settings.sfx = on ? 0 : 0.85;
      settings.music = on ? 0 : 0.55;
      saveSettings();
      audio.applyVolumes();
      (list.children[3] as HTMLElement).textContent = `SOUND: ${!on ? 'ON' : 'OFF'}`;
    }));
    list.appendChild(this.btn('QUIT', () => {
      ov.remove();
      this.game.paused = false;
      this.clip.stop();
      this.menu();
    }));
    ov.appendChild(list);
    this.ui.appendChild(ov);
    this.nav.attach(ov, resume);
  }

  moveList(id: string, parent?: HTMLElement) {
    const c = CHARS[id];
    const box = el('div', { class: 'movelist' });
    const row = (name: string, input: string, note = '') => `<tr><td>${esc(name)}</td><td><code>${esc(input)}</code></td><td>${esc(note)}</td></tr>`;
    const ms = c.moves;
    box.innerHTML = `<h3>${esc(c.name)} — MOVE LIST</h3><table>
      <tr><th colspan="3">SPECIALS (LP/LK light · HP/HK heavy · both = EX, 1 bar)</th></tr>
      ${c.specials.map((s) => row(ms[s.l].name, ms[s.l].input ?? '', `${ms[s.l].damage || ''}${ms[s.l].projectile ? ' projectile' : ''}${ms[s.l].grab ? ' command grab' : ''}`)).join('')}
      <tr><th colspan="3">SUPERS</th></tr>
      ${c.supers.map((s) => row(ms[s.move].name, ms[s.move].input ?? '', '2 bars')).join('')}
      ${row(ms[c.xray].name, ms[c.xray].input ?? '', '3 bars · X-RAY')}
      <tr><th colspan="3">FINISHERS (during KHATAM KARO!)</th></tr>
      ${c.finishers.map((f) => row(f.id === 'stage' ? 'Stage Brutality' : f.name, `${motionText(f.motion)} + ${f.btn}`, f.kind)).join('')}
      <tr><th colspan="3">COMMAND NORMALS & SYSTEM</th></tr>
      ${['6HP', '6HK', '3HK', '2HP', '2HK', 'throw'].map((k) => (ms[k] ? row(ms[k].name, ms[k].input ?? '', '') : '')).join('')}
      ${row('Rage Cancel', 'RAGE (+attack)', 'cancel anything, slows foe · 50 rage')}
      ${row('Burst', 'RAGE while being hit', 'combo breaker · once per round')}
      ${row('Just Parry', 'tap → as a hit arrives', 'refunds meter, free punish')}
      ${row('Throw Tech', 'LP+LK when grabbed', '')}
      ${row('Sidestep', 'DODGE + ↑/↓', 'evades straight attacks')}
      ${row('Roll', 'DODGE + ←/→', 'invincible roll')}
      ${row('Air dash / Double jump / Wall jump', 'DODGE in air / ↑ again / ↑ at wall', '')}
      ${row('Tech roll', 'DODGE on landing', '')}
      ${row('Pick up / throw weapon', 'DODGE + HP near a prop', '')}
      ${row('Tag partner assist', 'ASSIST', '12 s cooldown')}
      ${row('Taunt', 'TAUNT', '+meter, sways the crowd')}
      </table>`;
    const close = this.btn('CLOSE', () => {
      box.remove();
      if (parent) this.nav.attach(parent, () => (parent.querySelector('.primary') as HTMLElement)?.click());
    }, 'primary default');
    box.appendChild(close);
    (parent ?? this.ui).appendChild(box);
    this.nav.attach(box, () => close.click());
  }

  // ------------------------------------------------------------------ arcade
  arcadeNext() {
    const a = this.arcade!;
    const opp = a.ladder[a.idx];
    const stage = opp === 'supremo' ? 'assembly' : STAGE_IDS[a.idx % STAGE_IDS.length];
    const partner = PLAYABLE.filter((x) => x !== opp)[a.idx % (PLAYABLE.length - 1)];
    const boss = CHARS[opp].boss;
    const sub = boss ? '⚠ FINAL BOSS ⚠' : `STAGE ${a.idx + 1} / ${a.ladder.length}`;
    this.vsScreen(this.pick.p1, opp, stage, () =>
      this.fight(
        {
          p: [
            { char: this.pick.p1, assist: this.pick.a1, perks: this.pick.perks, leniency: isTouchDevice() ? settings.leniency : 1, smart: isTouchDevice() && settings.touchLayout === 'smart' },
            { char: opp, assist: partner, hpScale: boss ? { easy: 1, normal: 1.25, hard: 1.6, brutal: 2 }[this.pick.diff] : 1, power: boss && this.pick.diff !== 'easy' ? 1.1 : 1 },
          ],
          stage,
          rounds: settings.rounds,
          timer: settings.timer,
          seed: (Math.random() * 1e9) | 0,
          hazards: settings.hazards,
        },
        {
          sources: [srcP1(), 'cpu'],
          difficulty: boss ? (this.pick.diff === 'easy' ? 'normal' : this.pick.diff === 'normal' ? 'hard' : 'brutal') : arcadeDiff(this.pick.diff, a.idx),
          onEnd: (s) => {
            if (s.matchWinner === 0) {
              a.idx++;
              if (a.idx >= a.ladder.length) {
                progress.bossUnlocked = true;
                progress.arcadeClears[this.pick.p1] = (progress.arcadeClears[this.pick.p1] ?? 0) + 1;
                if (!progress.perksUnlocked.includes('thickSkin')) progress.perksUnlocked.push('thickSkin');
                saveProgress();
                this.results(s, { title: 'ARCADE CLEARED! 👑', buttons: [['ENDING', () => this.ending(this.pick.p1), 'primary default'], ['MAIN MENU', () => this.menu()]] });
              } else this.results(s, { title: `YOU WIN! ${a.idx}/${a.ladder.length}`, buttons: [['NEXT FIGHT ›', () => this.arcadeNext(), 'primary default'], ['QUIT', () => this.menu()]] });
            } else {
              this.results(s, {
                title: 'YOU LOSE',
                buttons: [
                  [`CONTINUE (${a.continues})`, () => (a.continues-- > 0 ? this.arcadeNext() : this.menu()), 'primary default'],
                  ['QUIT', () => this.menu()],
                ],
              });
            }
          },
        },
      ),
      sub,
    );
  }

  ending(id: string) {
    this.clear('ending');
    const c = CHARS[id];
    const p = this.panel(`${c.name} — ENDING`, () => this.menu());
    p.appendChild(
      el(
        'div',
        { class: 'ending' },
        `<img src="${portrait(id, 'full')}"><p>With SUPREMO dethroned, <b>${esc(c.name)}</b> finally sits on the Eternal Kursi.</p><p>The first order of business: a 400-foot statue of themself, a national holiday on their birthday, and an investigation into who leaked the investigation.</p><p>Within a week the chair begins whispering... <i>"kursi meri, desh mera..."</i></p><p class="fin">THE END?</p><p class="small">${progress.bossUnlocked ? 'SUPREMO is now playable!' : ''}</p>`,
      ),
    );
    this.nav.attach(p, () => this.menu());
  }

  // ------------------------------------------------------------------ survival
  survivalNext() {
    const sv = this.survival!;
    const opp = PLAYABLE.filter((x) => x !== this.pick.p1)[Math.floor(Math.random() * (PLAYABLE.length - 1))];
    const diff: Difficulty = sv.streak < 3 ? 'easy' : sv.streak < 7 ? 'normal' : sv.streak < 12 ? 'hard' : 'brutal';
    const c = CHARS[this.pick.p1];
    const cfg: MatchCfg = {
      p: [
        { char: this.pick.p1, assist: this.pick.a1, perks: this.pick.perks, leniency: isTouchDevice() ? settings.leniency : 1 },
        { char: opp, hpScale: 0.6 + Math.min(0.8, sv.streak * 0.05) },
      ],
      stage: STAGE_IDS[sv.streak % STAGE_IDS.length],
      singleRound: true,
      timer: 60,
      seed: (Math.random() * 1e9) | 0,
      startHp: [Math.round(sv.hp * c.stats.hp * (this.pick.perks.includes('tank') ? 1.15 : 1)), 99999],
      hazards: true,
    };
    this.fight(cfg, {
      sources: [srcP1(), 'cpu'],
      difficulty: diff,
      names: [CHARS[this.pick.p1].name, `#${sv.streak + 1} ${CHARS[opp].name}`],
      onEnd: (s) => {
        if (s.matchWinner === 0) {
          sv.streak++;
          sv.hp = Math.min(1, s.f[0].hp / s.f[0].maxHp + 0.2);
          this.results(s, { title: `SURVIVED ${sv.streak}! (+20% HP)`, buttons: [['NEXT ›', () => this.survivalNext(), 'primary default'], ['QUIT', () => this.menu()]] });
        } else {
          progress.survivalBest = Math.max(progress.survivalBest, sv.streak);
          saveProgress();
          this.results(s, { title: `STREAK OVER: ${sv.streak} (BEST ${progress.survivalBest})`, buttons: [['TRY AGAIN', () => this.startSelect('survival'), 'primary default'], ['MENU', () => this.menu()]] });
        }
      },
    });
  }

  // ------------------------------------------------------------------ election campaign
  campaignMap() {
    const cp = this.campaign!;
    this.clear('campaign');
    const p = this.panel('ELECTION CAMPAIGN', () => this.menu());
    const total = CAMPAIGN.reduce((a, s) => a + s.votes, 0);
    const pct = Math.round((cp.votes / total) * 100);
    const map = el('div', { class: 'cmap' });
    map.innerHTML = `<div class="cmap-bg">🗺️</div>`;
    const avail = CAMPAIGN.map((_s, i) => i).filter((i) => !cp.won.includes(CAMPAIGN[i].name) && !cp.lost.includes(CAMPAIGN[i].name));
    const capitalOnly = avail.length === 1 && CAMPAIGN[avail[0]].opp === 'supremo';
    CAMPAIGN.forEach((st, i) => {
      const won = cp.won.includes(st.name);
      const lost = cp.lost.includes(st.name);
      const isCap = st.opp === 'supremo';
      const can = !won && !lost && (!isCap || capitalOnly || cp.won.length >= 5);
      const b = el('button', { class: 'nav cnode' + (won ? ' won' : lost ? ' lost' : '') + (isCap ? ' cap' : ''), style: `left:${st.x}%;top:${st.y}%` }, `<img src="${portrait(st.opp)}"><span>${esc(st.name)}</span><small>${st.votes} seats · ${esc(st.scandal.name)}</small>`);
      if (!can) b.setAttribute('disabled', '');
      b.onclick = () => this.campaignFight(i);
      map.appendChild(b);
    });
    p.appendChild(map);
    const side = el('div', { class: 'cside' });
    side.innerHTML = `<div class="cstat">SEATS <b>${cp.votes}</b> / ${total} (${pct}%)</div><div class="cstat">FUNDS <b>₹${cp.funds} Cr</b></div><div class="cstat">PROMISES: ${cp.perks.map((x) => PERKS.find((p) => p.id === x)?.icon).join(' ') || '—'}</div>`;
    const shop = el('div', { class: 'shop' }, '<h4>PARTY FUND SHOP</h4>');
    for (const perk of PERKS.filter((x) => !cp.perks.includes(x.id))) {
      const cost = perk.cost || 80;
      const b = el('button', { class: 'nav chip' }, `${perk.icon} ${perk.name} · ₹${cost}`);
      b.title = perk.desc;
      if (cp.funds < cost || cp.perks.length >= 4) b.setAttribute('disabled', '');
      b.onclick = () => {
        cp.funds -= cost;
        cp.perks.push(perk.id);
        audio.play('coins');
        this.campaignMap();
      };
      shop.appendChild(b);
    }
    side.appendChild(shop);
    if (avail.length === 0 || (cp.won.length + cp.lost.length >= CAMPAIGN.length)) {
      const end = campaignEnding(pct);
      progress.campaignBest = Math.max(progress.campaignBest, pct);
      saveProgress();
      side.innerHTML += `<div class="cend"><h3>${end.title}</h3><p>${end.text}</p></div>`;
      side.appendChild(this.btn('NEW CAMPAIGN', () => this.startSelect('campaign'), 'primary'));
    }
    p.appendChild(side);
    this.nav.attach(p, () => this.menu());
  }

  campaignFight(i: number) {
    const cp = this.campaign!;
    cp.idx = i;
    const st = CAMPAIGN[i];
    // random campaign event first
    const ev = CAMPAIGN_EVENTS[Math.floor(Math.random() * CAMPAIGN_EVENTS.length)];
    if (Math.random() < 0.6) {
      cp.funds = Math.max(0, cp.funds + ev.funds);
      cp.votes = Math.max(0, cp.votes + ev.votes);
      toast(`📰 ${ev.text} (${ev.funds ? (ev.funds > 0 ? '+' : '') + '₹' + ev.funds + ' ' : ''}${ev.votes ? (ev.votes > 0 ? '+' : '') + ev.votes + ' seats' : ''})`, 3500);
    }
    const sc = st.scandal;
    const perks = [...cp.perks, ...(sc.youMeter ? ['richStart'] : [])];
    const cfg: MatchCfg = {
      p: [
        { char: this.pick.p1, assist: this.pick.a1, perks, hpScale: sc.youHp ?? 1, leniency: isTouchDevice() ? settings.leniency : 1 },
        { char: st.opp, hpScale: (sc.oppHp ?? 1) * (st.opp === 'supremo' ? 1.4 : 1), power: sc.oppPower ?? 1 },
      ],
      stage: st.stage,
      rounds: 3,
      timer: sc.timer ?? settings.timer,
      seed: (Math.random() * 1e9) | 0,
      hazards: sc.hazards ?? settings.hazards,
    };
    this.vsScreen(this.pick.p1, st.opp, st.stage, () =>
      this.fight(cfg, {
        sources: [srcP1(), 'cpu'],
        difficulty: st.opp === 'supremo' ? 'hard' : this.pick.diff,
        onEnd: (s) => {
          document.body.classList.remove('no-hud');
          if (s.matchWinner === 0) {
            cp.won.push(st.name);
            cp.votes += st.votes;
            cp.funds += 60 + (s.finisher ? 40 : 0);
          } else cp.lost.push(st.name);
          this.results(s, { title: s.matchWinner === 0 ? `${st.name.toUpperCase()} WON! +${st.votes} SEATS` : `${st.name.toUpperCase()} LOST`, buttons: [['CAMPAIGN MAP ›', () => this.campaignMap(), 'primary default']] });
        },
      }),
      `${st.name} · SCANDAL: ${st.scandal.name} — ${st.scandal.desc}`,
    );
  }

  // ------------------------------------------------------------------ rally 3v3
  rallySelect() {
    this.mode = 'rally';
    this.clear('rally');
    const chosen: string[] = [];
    const p = this.panel('RALLY 3v3 — BUILD YOUR ALLIANCE', () => this.menu());
    const grid = el('div', { class: 'sel-grid wide' });
    const info = el('div', { class: 'rally-info' }, 'Pick 3 netas. Fights are elimination; HP carries over. Your teammates are your TAG assists — but if you play badly their <b>loyalty</b> drops and they may <b>defect to the enemy</b>!');
    const team = el('div', { class: 'rally-team' });
    const draw = () => (team.innerHTML = chosen.map((c) => `<img src="${portrait(c)}" title="${CHARS[c].name}">`).join('') + '<span class="slot"></span>'.repeat(3 - chosen.length));
    for (const id of PLAYABLE) {
      const t = el('button', { class: 'nav tile' }, `<img src="${portrait(id)}"><span>${esc(CHARS[id].name)}</span>`);
      t.onclick = () => {
        if (chosen.includes(id)) chosen.splice(chosen.indexOf(id), 1);
        else if (chosen.length < 3) chosen.push(id);
        t.classList.toggle('c1', chosen.includes(id));
        draw();
        if (chosen.length === 3) start.removeAttribute('disabled');
        else start.setAttribute('disabled', '');
      };
      grid.appendChild(t);
    }
    const start = this.btn('START RALLY ›', () => {
      const pool = PLAYABLE.filter((x) => !chosen.includes(x) && !x.startsWith('custom'));
      shuffle(pool);
      this.rally = { mine: [...chosen], theirs: pool.slice(0, 3), hp: 1, loyalty: [100, 100, 100], log: [] };
      this.rallyNext();
    }, 'primary');
    start.setAttribute('disabled', '');
    p.append(info, team, grid, start);
    draw();
    this.nav.attach(p, () => this.menu());
  }

  rallyNext() {
    const r = this.rally!;
    if (!r.mine.length || !r.theirs.length) {
      const won = r.mine.length > 0;
      this.clear('rally');
      const p = this.panel(won ? 'ALLIANCE WINS! 🏆' : 'ALLIANCE COLLAPSED', () => this.menu());
      p.appendChild(el('div', { class: 'rally-log' }, r.log.map((l) => `<p>${esc(l)}</p>`).join('')));
      p.appendChild(this.btn('MENU', () => this.menu(), 'primary default'));
      this.nav.attach(p, () => this.menu());
      return;
    }
    const me = r.mine[0];
    const opp = r.theirs[0];
    const partner = r.mine[1] ?? r.mine[0];
    const oppPartner = r.theirs[1] ?? r.theirs[0];
    const cfg: MatchCfg = {
      p: [
        { char: me, assist: partner, leniency: isTouchDevice() ? settings.leniency : 1 },
        { char: opp, assist: oppPartner },
      ],
      stage: STAGE_IDS[(r.log.length + 1) % STAGE_IDS.length],
      singleRound: true,
      timer: 75,
      seed: (Math.random() * 1e9) | 0,
      startHp: [Math.round(r.hp * CHARS[me].stats.hp), 99999],
    };
    this.vsScreen(me, opp, cfg.stage, () =>
      this.fight(cfg, {
        sources: [srcP1(), 'cpu'],
        difficulty: this.pick.diff,
        names: [`${CHARS[me].name} (+${r.mine.length - 1})`, `${CHARS[opp].name} (+${r.theirs.length - 1})`],
        onEnd: (s) => {
          let note = '';
          if (s.matchWinner === 0) {
            r.theirs.shift();
            r.hp = s.f[0].hp / s.f[0].maxHp;
            r.log.push(`${CHARS[me].name} defeated ${CHARS[opp].name}.`);
          } else {
            r.mine.shift();
            r.loyalty.shift();
            r.hp = 1;
            r.log.push(`${CHARS[opp].name} knocked out ${CHARS[me].name}.`);
          }
          // loyalty drain: bad performance makes partners nervous
          const perf = s.f[0].dmgDealt / Math.max(1, s.f[1].dmgDealt);
          r.loyalty = r.loyalty.map((l, i) => (i === 0 ? l : l - Math.round(Math.random() * 30 + (perf < 1 ? 25 : 0))));
          const traitor = r.loyalty.findIndex((l, i) => i > 0 && l < 20);
          if (traitor > 0 && r.mine[traitor]) {
            const t = r.mine.splice(traitor, 1)[0];
            r.loyalty.splice(traitor, 1);
            r.theirs.push(t);
            note = `💔 BETRAYAL! ${CHARS[t].name} defects to the enemy alliance!`;
            r.log.push(note);
            audio.play('boo');
          }
          this.results(s, { title: note || (s.matchWinner === 0 ? 'ROUND WON' : 'FIGHTER DOWN'), buttons: [['CONTINUE ›', () => this.rallyNext(), 'primary default'], ['QUIT', () => this.menu()]] });
        },
      }),
      `YOUR ALLIANCE: ${r.mine.map((x) => CHARS[x].name).join(', ')}`,
    );
  }

  // ------------------------------------------------------------------ daily challenge
  async daily() {
    this.mode = 'daily';
    this.clear('daily');
    const seed = dailySeed();
    let x = seed;
    const rnd = () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const me = PLAYABLE.filter((c) => !c.startsWith('custom'))[Math.floor(rnd() * 8)];
    const opp = PLAYABLE.filter((c) => c !== me && !c.startsWith('custom'))[Math.floor(rnd() * 7)];
    const stage = STAGE_IDS[Math.floor(rnd() * STAGE_IDS.length)];
    this.dailyMod = Math.floor(rnd() * DAILY_MODS.length);
    const mod = DAILY_MODS[this.dailyMod];
    const p = this.panel(`DAILY CHALLENGE · ${seed}`, () => this.menu());
    p.appendChild(el('div', { class: 'daily' }, `<div class="dm"><img src="${portrait(me)}"><b>${CHARS[me].name}</b> vs <img src="${portrait(opp)}"><b>${CHARS[mod.id === 'boss' ? 'supremo' : opp].name}</b></div><div class="mod">MODIFIER: <b>${mod.name}</b> — ${mod.desc}</div><div class="best">Your best today: ${progress.dailyBest[seed] ?? '—'}</div><div class="board">Loading leaderboard…</div>`));
    const cfg: MatchCfg = { p: [{ char: me, leniency: isTouchDevice() ? settings.leniency : 1 }, { char: opp }], stage, rounds: 3, timer: 60, seed, hazards: false };
    mod.apply(cfg);
    p.appendChild(
      this.btn('PLAY ›', () =>
        this.fight(cfg, {
          sources: [srcP1(), 'cpu'],
          difficulty: 'hard',
          onEnd: (s) => {
            const f = s.f[0];
            const score = s.matchWinner === 0 ? Math.round(1000 + (f.hp / f.maxHp) * 2000 + f.maxCombo * 50 + (s.finisher ? 1000 : 0) + Math.ceil(s.timer / 60) * 10) : Math.round(f.dmgDealt);
            progress.dailyBest[seed] = Math.max(progress.dailyBest[seed] ?? 0, score);
            saveProgress();
            fetch(apiBase() + '/api/daily', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ day: String(seed), id: PLAYER_ID, name: settings.playerName, score, char: me }) }).catch(() => {});
            this.results(s, { title: `SCORE ${score}`, buttons: [['LEADERBOARD', () => this.daily(), 'primary default'], ['MENU', () => this.menu()]] });
          },
        }),
      'primary default'),
    );
    this.nav.attach(p, () => this.menu());
    try {
      const res = await fetch(apiBase() + `/api/daily?day=${seed}`);
      const j = await res.json();
      const board = p.querySelector('.board')!;
      board.innerHTML = j.board.length ? `<ol>${j.board.map((b: { n: string; s: number; c: string }) => `<li><b>${esc(b.n)}</b> (${esc(CHARS[b.c]?.name ?? b.c)}) — ${b.s}</li>`).join('')}</ol>` : 'No scores yet today. Be the first!';
    } catch {
      const board = p.querySelector('.board');
      if (board) board.textContent = 'Leaderboard offline (local best only).';
    }
  }

  // ------------------------------------------------------------------ training
  trainingBar() {
    const bar = el('div', { class: 'train-bar' });
    const modes = ['stand', 'crouch', 'jump', 'block', 'cpu', 'record', 'playback'] as const;
    for (const m of modes) {
      const b = el('button', { class: 'chip' + (this.game.dummyMode === m ? ' on' : '') }, m.toUpperCase());
      b.onclick = () => {
        this.game.dummyMode = m;
        if (m === 'record') this.game.dummyRec = [];
        this.game.dummyPlay = 0;
        (window as unknown as { __dummyMode: string }).__dummyMode = m;
        bar.querySelectorAll('.chip').forEach((c) => c.classList.remove('on'));
        b.classList.add('on');
        if (m === 'record') toast('Recording dummy: control P2 with arrows + numpad / pad 2');
      };
      bar.appendChild(b);
    }
    const reset = el('button', { class: 'chip' }, '↺ RESET');
    reset.onclick = () => this.trainingReset();
    const meter = el('button', { class: 'chip' }, '∞ METER');
    meter.onclick = () => this.game.s?.f.forEach((f) => ((f.meter = 300), (f.rage = 100)));
    const moves = el('button', { class: 'chip' }, 'MOVES');
    moves.onclick = () => this.moveList(this.pick.p1);
    bar.append(reset, meter, moves);
    this.ui.appendChild(bar);
  }

  trainingReset() {
    const s = this.game.s;
    if (!s) return;
    s.f.forEach((f, i) => {
      f.x = i === 0 ? -1.6 : 1.6;
      f.y = f.vx = f.vy = 0;
      f.hp = f.maxHp;
      f.st = 'idle';
      f.move = null;
      f.comboHits = 0;
      f.comboDmg = 0;
    });
    s.projs = [];
  }

  trainingKeys(e: KeyboardEvent) {
    if (e.code === 'F1') {
      e.preventDefault();
      const order = ['stand', 'crouch', 'jump', 'block', 'cpu', 'record', 'playback'] as const;
      this.game.dummyMode = order[(order.indexOf(this.game.dummyMode) + 1) % order.length];
      (window as unknown as { __dummyMode: string }).__dummyMode = this.game.dummyMode;
    } else if (e.code === 'F2') {
      e.preventDefault();
      settings.showHitboxes = !settings.showHitboxes;
    } else if (e.code === 'F3') {
      e.preventDefault();
      this.trainingReset();
    }
  }

  // ------------------------------------------------------------------ ghosts
  ghosts() {
    this.clear('ghosts');
    const p = this.panel('GHOSTS — AI THAT FIGHTS LIKE A PERSON', () => this.menu());
    const mine = this.ghost;
    const friend = load('ghostFriend', null as GhostProfile | null);
    const desc = (g: GhostProfile | null) => (g ? Object.keys(g.w).length + ' situations learned' : 'not trained yet — play a few fights');
    p.appendChild(el('div', { class: 'ghost-info' }, `<p>Every fight you play trains <b>your ghost</b>: the CPU learns how often you approach, jump, poke, throw and use specials in each situation. Share it and friends can fight "you" even when you're offline.</p><p>YOUR GHOST: <b>${desc(mine)}</b></p><p>FRIEND'S GHOST: <b>${friend ? esc(friend.name) + ' · ' + desc(friend) : 'none (open a ghost link to load one)'}</b></p>`));
    const row = el('div', { class: 'row wrap' });
    row.appendChild(this.btn('FIGHT YOUR OWN GHOST', () => {
      if (!mine) return toast('Play some fights first!');
      this.currentGhost = mine;
      this.startSelect('ghost');
    }, 'primary default'));
    row.appendChild(this.btn("FIGHT FRIEND'S GHOST", () => {
      if (!friend) return toast('No friend ghost loaded');
      this.currentGhost = friend;
      this.startSelect('ghost');
    }));
    row.appendChild(this.btn('SHARE MY GHOST LINK', async () => {
      if (!mine) return toast('Play some fights first!');
      const code = b64u(await deflate(JSON.stringify({ ...mine, name: settings.playerName })));
      shareText(`Fight my ghost in KURSI KAND 👻`, `${location.origin}${location.pathname}#ghost=${code}`);
    }));
    row.appendChild(this.btn('RESET MY GHOST', () => {
      this.ghost = null;
      save('ghost', null);
      this.ghosts();
    }));
    p.appendChild(row);
    this.nav.attach(p, () => this.menu());
  }

  // ------------------------------------------------------------------ replays
  replays() {
    this.clear('replays');
    const p = this.panel('REPLAYS', () => this.menu());
    const list = savedReplays();
    const ul = el('div', { class: 'replay-list' });
    if (!list.length) ul.innerHTML = '<p>No saved replays yet. Save one from the results screen.</p>';
    for (const r of list) {
      const row = el('div', { class: 'replay-row' }, `<span>${esc(r.title)}<small>${new Date(r.date).toLocaleString()}</small></span>`);
      row.appendChild(this.btn('▶ WATCH', async () => this.playReplay(await decodeReplay(r.code)), 'small'));
      row.appendChild(this.btn('🔗', () => shareText('Watch this KURSI KAND fight', `${location.origin}${location.pathname}#replay=${r.code}`), 'small'));
      row.appendChild(this.btn('🗑', () => {
        deleteReplay(r.id);
        this.replays();
      }, 'small'));
      ul.appendChild(row);
    }
    p.appendChild(ul);
    const imp = el('div', { class: 'row' });
    const input = el('input', { class: 'nav', placeholder: 'Paste a replay link or code' }) as HTMLInputElement;
    imp.appendChild(input);
    imp.appendChild(this.btn('LOAD', async () => {
      const v = input.value.trim();
      const code = v.includes('#replay=') ? v.split('#replay=')[1] : v;
      try {
        this.playReplay(await decodeReplay(code));
      } catch {
        toast('Invalid replay code');
      }
    }));
    p.appendChild(imp);
    this.nav.attach(p, () => this.menu());
  }

  playReplay(r: Replay) {
    this.mode = 'replay';
    this.fight(r.cfg, { sources: ['replay', 'replay'], replay: r, record: false, names: r.names, onEnd: (s) => this.results(s, { title: 'REPLAY OVER', buttons: [['WATCH AGAIN', () => this.playReplay(r), 'primary default'], ['MENU', () => this.menu()]] }) });
  }

  // ------------------------------------------------------------------ online
  async online(joinCode?: string) {
    this.mode = 'online';
    this.clear('online');
    const p = this.panel('ONLINE', () => {
      this.net?.close();
      this.net = null;
      this.menu();
    });
    const status = el('div', { class: 'net-status' }, 'Connecting to the room server…');
    p.appendChild(status);
    const body = el('div', { class: 'net-body' });
    p.appendChild(body);
    this.nav.attach(p, () => {
      this.net?.close();
      this.net = null;
      this.menu();
    });
    this.net?.close();
    const net = new NetClient();
    this.net = net;
    try {
      await net.connect();
    } catch {
      status.innerHTML = `Can't reach the room server. Online play needs the game server (<code>npm run server</code>) running alongside the site.`;
      return;
    }
    status.textContent = `Connected · You: ${settings.playerName} · ${tierFor(progress.rating).name} ${progress.rating}`;
    const startNet = (role: 'host' | 'guest', ranked: boolean, oppName: string) => {
      // host decides the config and sends it
      if (role === 'host') {
        this.mode = 'online';
        this.select({
          players: 1,
          allowBoss: false,
          title: ranked ? 'RANKED' : 'ONLINE',
          pickOpponent: false,
          stage: true,
          diff: false,
          perks: false,
          onBack: () => this.online(),
          onDone: () => {
            const myPick = { char: this.pick.p1, assist: this.pick.a1 };
            const sub = el('div', { class: 'net-wait' }, `Waiting for ${esc(oppName)} to pick…`);
            this.clear('online-wait');
            this.ui.appendChild(sub);
            const off = net.on((m) => {
              if (m.t === 'pick') {
                off();
                const cfg: MatchCfg = { p: [myPick, m.pick as { char: string; assist: string }], stage: this.pick.stage, rounds: 3, timer: 90, seed: (Math.random() * 1e9) | 0, hazards: false };
                net.send({ t: 'start', cfg });
                this.netFight(net, cfg, 0, ranked, oppName);
              }
            });
          },
        });
      } else {
        this.select({
          players: 1,
          allowBoss: false,
          title: ranked ? 'RANKED' : 'ONLINE',
          pickOpponent: false,
          stage: false,
          diff: false,
          perks: false,
          onBack: () => this.online(),
          onDone: () => {
            net.send({ t: 'pick', pick: { char: this.pick.p1, assist: this.pick.a1 } });
            this.clear('online-wait');
            this.ui.appendChild(el('div', { class: 'net-wait' }, `Waiting for host to start…`));
            const off = net.on((m) => {
              if (m.t === 'start') {
                off();
                this.netFight(net, m.cfg as MatchCfg, 1, ranked, oppName);
              }
            });
          },
        });
      }
    };
    net.on((m) => {
      if (m.t === 'room') {
        body.innerHTML = `<div class="room-code">ROOM CODE<b>${esc(m.code as string)}</b></div><p>Share it, or send the link:</p>`;
        const link = `${location.origin}${location.pathname}#room=${m.code}`;
        const row = el('div', { class: 'row' });
        row.appendChild(this.btn('📲 WHATSAPP', () => window.open(`https://wa.me/?text=${encodeURIComponent('Fight me in KURSI KAND! ' + link)}`, '_blank')));
        row.appendChild(this.btn('🔗 COPY LINK', () => {
          navigator.clipboard?.writeText(link);
          toast('Link copied');
        }));
        row.appendChild(this.btn('👁 SPECTATE LINK', () => {
          navigator.clipboard?.writeText(`${location.origin}${location.pathname}#watch=${m.code}`);
          toast('Spectator link copied');
        }));
        body.appendChild(row);
        body.appendChild(el('p', { class: 'blink' }, 'Waiting for your friend to join…'));
      } else if (m.t === 'peer') {
        const opp = (m.opp as { name?: string } | null)?.name ?? 'Opponent';
        toast(`${opp} connected!`);
        startNet(m.role as 'host' | 'guest', !!m.ranked, opp);
      } else if (m.t === 'queued') {
        body.innerHTML = `<p class="blink">Searching for an opponent near ${m.rating}…</p>`;
      } else if (m.t === 'error') {
        toast(String(m.msg));
      } else if (m.t === 'opponentLeft' || m.t === 'disconnected') {
        if (this.screen === 'fight') {
          this.game.stop();
          toast('Opponent disconnected');
          this.online();
        }
      } else if (m.t === 'rating') {
        progress.rating = m.r as number;
        progress.ranked++;
        saveProgress();
        toast(`Rating ${m.r} (${(m.d as number) >= 0 ? '+' : ''}${m.d})`);
      }
    });
    if (joinCode) {
      net.join(joinCode);
      body.innerHTML = '<p class="blink">Joining…</p>';
      return;
    }
    const nameRow = el('div', { class: 'row' }, '<label>NAME</label>');
    const nameIn = el('input', { class: 'nav', value: settings.playerName, maxlength: '14' }) as HTMLInputElement;
    nameIn.onchange = () => {
      settings.playerName = nameIn.value.trim().slice(0, 14) || 'NETA';
      saveSettings();
    };
    nameRow.appendChild(nameIn);
    body.appendChild(nameRow);
    const row = el('div', { class: 'row wrap' });
    row.appendChild(this.btn('HOST A ROOM', () => net.host({ info: { name: settings.playerName } }), 'primary default'));
    row.appendChild(this.btn('RANKED MATCH', () => net.queue(PLAYER_ID, progress.rating, settings.playerName)));
    body.appendChild(row);
    const jr = el('div', { class: 'row' });
    const code = el('input', { class: 'nav code', placeholder: 'CODE', maxlength: '4' }) as HTMLInputElement;
    jr.appendChild(code);
    jr.appendChild(this.btn('JOIN', () => code.value.trim().length === 4 && net.join(code.value.trim())));
    jr.appendChild(this.btn('SPECTATE', () => code.value.trim().length === 4 && this.spectate(code.value.trim(), net)));
    body.appendChild(jr);
    const lb = el('div', { class: 'board' }, 'Loading ranked leaderboard…');
    body.appendChild(lb);
    fetch(apiBase() + '/api/ranked')
      .then((r) => r.json())
      .then((j) => (lb.innerHTML = `<h4>TOP NETAS</h4><ol>${j.top.map((t: { name: string; r: number }) => `<li><b>${esc(t.name)}</b> <span style="color:${tierFor(t.r).color}">${tierFor(t.r).name}</span> ${t.r}</li>`).join('') || '<li>No ranked games yet</li>'}</ol>`))
      .catch(() => (lb.textContent = ''));
  }

  netFight(net: NetClient, cfg: MatchCfg, side: 0 | 1, ranked: boolean, oppName: string) {
    this.mode = 'online';
    const driver = new RollbackDriver(net, cfg, side, net.p2p ? 2 : 3);
    if (side === 0) {
      let sentCfg = false;
      driver.onSpectatorBatch = (from, inputs) => {
        net.sendServer({ t: 'spec', data: { ...(sentCfg ? {} : { cfg }), from, i: inputs } });
        sentCfg = true;
      };
    }
    const names: [string, string] = side === 0 ? [settings.playerName, oppName] : [oppName, settings.playerName];
    const local: SourceKind = isTouchDevice() ? 'touch' : 'p1';
    this.fight(cfg, {
      sources: side === 0 ? [local, 'net'] : ['net', local],
      driver,
      names,
      onEnd: (s) => {
        if (ranked) net.sendServer({ t: 'result', winner: s.matchWinner });
        const youWon = s.matchWinner === side;
        this.results(s, {
          title: youWon ? 'YOU WIN!' : s.matchWinner < 0 ? 'DRAW' : 'YOU LOSE',
          buttons: [
            ['REMATCH', () => (side === 0 ? (net.send({ t: 'start', cfg: { ...cfg, seed: (Math.random() * 1e9) | 0 } }), this.netFight(net, { ...cfg, seed: (Math.random() * 1e9) | 0 }, 0, ranked, oppName)) : toast('Waiting for host…')), 'primary default'],
            ['LEAVE', () => (net.close(), this.menu())],
          ],
        });
        if (side === 1) {
          const off = net.on((m) => {
            if (m.t === 'start') {
              off();
              this.netFight(net, m.cfg as MatchCfg, 1, ranked, oppName);
            }
          });
        }
      },
    });
    const st = el('div', { class: 'net-hud' });
    this.ui.appendChild(st);
    const iv = setInterval(() => {
      if (this.screen !== 'fight') return clearInterval(iv);
      st.textContent = driver.status();
    }, 500);
  }

  async spectate(code: string, existing?: NetClient) {
    this.mode = 'spectate';
    const net = existing ?? new NetClient();
    this.net = net;
    if (!existing) {
      try {
        await net.connect();
      } catch {
        toast('Room server unreachable');
        return this.menu();
      }
    }
    const driver = new SpectatorDriver(net);
    net.spectate(code);
    net.on((m) => {
      if (m.t === 'error') {
        toast(String(m.msg));
        this.menu();
      }
    });
    this.fight({ p: [{ char: 'jumla' }, { char: 'ghotala' }], stage: 'assembly' }, { sources: ['net', 'net'], driver, names: ['PLAYER 1', 'PLAYER 2'], onEnd: (s) => this.results(s, { title: 'MATCH OVER', buttons: [['MENU', () => this.menu(), 'primary default']] }) });
  }

  // ------------------------------------------------------------------ neta creator
  creator() {
    this.clear('creator');
    const p = this.panel('NETA CREATOR', () => this.menu());
    const custom = load('customChars', [] as { base: string; id: string; name: string; party: string; slogan: string; look: Look }[]);
    const base = { base: 'jumla', id: 'custom' + Date.now().toString(36), name: 'MERA NETA', party: 'Apni Party', slogan: 'Vote do, vaada lo!', look: structuredClone(LOOKS.jumla) as Look };
    const c = base;
    const preview = el('img', { class: 'creator-preview' }) as HTMLImageElement;
    const form = el('div', { class: 'creator-form' });
    const redraw = () => {
      setLook(c.id, c.look);
      clearPortrait(c.id);
      registerChar({ ...CHARS[c.base], id: c.id, name: c.name.toUpperCase() });
      preview.src = portrait(c.id, 'full');
    };
    const text = (label: string, key: 'name' | 'party' | 'slogan') => {
      const r = el('label', { class: 'cf' }, label);
      const i = el('input', { class: 'nav', value: c[key], maxlength: '24' }) as HTMLInputElement;
      i.oninput = () => (c[key] = i.value);
      r.appendChild(i);
      form.appendChild(r);
    };
    const choice = <T extends string>(label: string, opts: T[], get: () => T, set: (v: T) => void) => {
      const r = el('div', { class: 'cf' }, `<span>${label}</span>`);
      for (const o of opts) {
        const b = el('button', { class: 'nav chip' + (get() === o ? ' on' : '') }, o);
        b.onclick = () => {
          set(o);
          r.querySelectorAll('.chip').forEach((x) => x.classList.remove('on'));
          b.classList.add('on');
          redraw();
        };
        r.appendChild(b);
      }
      form.appendChild(r);
    };
    const color = (label: string, key: 'skin' | 'hair' | 'top' | 'bottom' | 'accent' | 'partyColor') => {
      const r = el('label', { class: 'cf' }, label);
      const i = el('input', { class: 'nav', type: 'color', value: hex(c.look[key]) }) as HTMLInputElement;
      i.oninput = () => {
        c.look[key] = parseInt(i.value.slice(1), 16);
        redraw();
      };
      r.appendChild(i);
      form.appendChild(r);
    };
    text('NAME', 'name');
    text('PARTY', 'party');
    text('SLOGAN', 'slogan');
    choice('FIGHTING STYLE', PLAYABLE.filter((x) => !x.startsWith('custom')), () => c.base, (v) => (c.base = v));
    choice('HAIR', ['bald', 'side', 'puff', 'bun', 'spiky', 'combover', 'slick', 'mullet'], () => c.look.hairStyle, (v) => (c.look.hairStyle = v));
    choice('MOUSTACHE', ['none', 'thick', 'handlebar', 'pencil', 'walrus'], () => c.look.mustache, (v) => (c.look.mustache = v));
    choice('BEARD', ['none', 'stubble', 'full', 'goatee'], () => c.look.beard, (v) => (c.look.beard = v));
    choice('GLASSES', ['none', 'round', 'shades', 'square'], () => c.look.glasses, (v) => (c.look.glasses = v));
    choice('OUTFIT', ['kurta', 'suit', 'saree', 'singlet', 'robe', 'safari'], () => c.look.topStyle, (v) => (c.look.topStyle = v));
    choice('HEAD SIZE', ['1.1', '1.25', '1.4', '1.6'], () => String(c.look.headScale) as '1.1', (v) => (c.look.headScale = Number(v)));
    choice('BELLY', ['0.9', '1.1', '1.3', '1.6'], () => String(c.look.belly) as '0.9', (v) => (c.look.belly = Number(v)));
    color('SKIN', 'skin');
    color('HAIR COLOUR', 'hair');
    color('TOP', 'top');
    color('BOTTOM', 'bottom');
    color('ACCENT', 'accent');
    color('PARTY COLOUR', 'partyColor');
    const acc = el('div', { class: 'cf' }, '<span>ACCESSORIES</span>');
    for (const a of ['garland', 'goldchain', 'hardhat', 'crown', 'pagdi', 'bindi', 'shawl', 'sash', 'mic', 'moneybag', 'lathi', 'watch', 'cap'] as Look['accessory']) {
      const b = el('button', { class: 'nav chip' + (c.look.accessory.includes(a) ? ' on' : '') }, a);
      b.onclick = () => {
        const i = c.look.accessory.indexOf(a);
        if (i >= 0) c.look.accessory.splice(i, 1);
        else c.look.accessory.push(a);
        b.classList.toggle('on');
        redraw();
      };
      acc.appendChild(b);
    }
    form.appendChild(acc);
    const wrap = el('div', { class: 'creator' });
    wrap.append(preview, form);
    p.appendChild(wrap);
    const row = el('div', { class: 'row' });
    row.appendChild(this.btn('SAVE NETA', () => {
      const list = custom.filter((x) => x.id !== c.id);
      list.push(structuredClone(c));
      save('customChars', list);
      this.registerCustom(c);
      toast(`${c.name} joins the roster!`);
      this.menu();
    }, 'primary default'));
    if (custom.length) {
      row.appendChild(this.btn('DELETE ALL CUSTOM', () => {
        save('customChars', []);
        toast('Custom netas removed (reload to clear from roster)');
      }));
    }
    p.appendChild(row);
    redraw();
    this.nav.attach(p, () => this.menu());
  }

  // ------------------------------------------------------------------ how to play
  howto() {
    this.clear('howto');
    const p = this.panel('HOW TO PLAY', () => this.menu());
    const k = keyBindings[0];
    const kn = (b: ButtonName) => (k[b]?.[0] ?? '').replace('Key', '').replace('Left', '').replace('Right', '');
    p.appendChild(
      el(
        'div',
        { class: 'howto' },
        `<div class="cols">
        <div><h4>⌨ KEYBOARD (P1)</h4><p>Move <b>${kn('U')}${kn('L')}${kn('D')}${kn('R')}</b> (or arrows) · Hold back to block<br>LP <b>${kn('LP')}</b> · HP <b>${kn('HP')}</b> · LK <b>${kn('LK')}</b> · HK <b>${kn('HK')}</b><br>RAGE <b>${kn('RAGE')}</b> · DODGE <b>${kn('DODGE')}</b> · ASSIST <b>${kn('ASSIST')}</b> · TAUNT <b>${kn('TAUNT')}</b> · Pause <b>Esc</b></p>
        <h4>🎮 GAMEPAD</h4><p>X/□ LP · Y/△ HP · A/✕ LK · B/○ HK · RB RAGE · LB DODGE · LT ASSIST · RT BLOCK · Select TAUNT · Start pause. Stick or D-pad to move. Pads rumble on hits.</p>
        <h4>📱 TOUCH</h4><p><b>PRO</b>: stick + 8 buttons, slide between buttons, press between two buttons for EX / throw.<br><b>GESTURE</b>: swipe ↓→ / ↓← / →↓↘ / circle on the right, then tap a button for specials; quick swipe = dash; flick ↑ = launcher; long-press then tap = charge move; two-finger tap = Rage Cancel.<br><b>SMART</b>: one-tap SPECIAL & SUPER pick the best move for the situation (90% damage).</p></div>
        <div><h4>🔥 SYSTEMS</h4><ul>
        <li><b>Motion inputs</b>: ↓↘→ (QCF), ↓↙← (QCB), →↓↘ (DP), 360°, [hold ←] → (charge), ↓↘→↓↘→ (super).</li>
        <li><b>Light / Heavy / EX</b>: L or H button for specials; both punches or both kicks = EX (1 bar).</li>
        <li><b>Chains</b>: LP→LP→HP, LP→LK→HK, LK→HK, ↓LP→↓LK→↓HK. Normals cancel into specials, specials into supers.</li>
        <li><b>Supers</b> 2 bars, <b>X-RAY</b> 3 bars (↓↘→↓↘→ + HP+HK).</li>
        <li><b>Rage Cancel</b> (RAGE, 50 rage): cancel any move, opponent slows down. <b>Burst</b>: RAGE while getting comboed, once per round.</li>
        <li><b>Just Parry</b>: tap toward the opponent right as a hit lands. <b>Throw tech</b>: LP+LK when grabbed.</li>
        <li><b>Guard Crush</b>: block too much and your guard shatters.</li>
        <li><b>Wall splat → wall break</b> into the next zone of the stage!</li>
        <li><b>Weapons</b>: DODGE+HP near a chair / mic / lathi; DODGE+HP again throws it.</li>
        <li><b>KHATAM KARO!</b> In the deciding round, the loser is left dizzy: input a finisher (see Move List) for a brutal, stage or comedy finish.</li>
        <li><b>Crowd Spin</b>: big combos, taunts and parries win the crowd (+damage). An angry crowd throws chappals!</li></ul></div></div>`,
      ),
    );
    const row = el('div', { class: 'row wrap' });
    for (const id of PLAYABLE.filter((x) => !CHARS[x].boss || progress.bossUnlocked)) row.appendChild(this.btn(CHARS[id].name, () => this.moveList(id), 'small'));
    p.appendChild(row);
    this.nav.attach(p, () => this.menu());
  }

  // ------------------------------------------------------------------ settings
  settingsScreen(tab = 'video') {
    this.clear('settings');
    const p = this.panel('SETTINGS', () => this.menu());
    const tabs = el('div', { class: 'tabs' });
    for (const t of ['video', 'audio', 'gameplay', 'controls', 'touch', 'access']) {
      const b = el('button', { class: 'nav chip' + (t === tab ? ' on' : '') }, t.toUpperCase());
      b.onclick = () => this.settingsScreen(t);
      tabs.appendChild(b);
    }
    p.appendChild(tabs);
    const body = el('div', { class: 'set-body' });
    p.appendChild(body);
    const apply = () => {
      saveSettings();
      const q = settings.quality < 0 ? this.game.renderer.settings.quality : settings.quality;
      this.game.renderer.applySettings({ quality: q, gore: settings.gore, shake: settings.shake, flashes: settings.flashes });
      audio.applyVolumes();
      this.game.touch.layout();
      document.body.classList.toggle('colorblind', settings.colorblind);
    };
    const choice = <T extends string | number>(label: string, opts: [T, string][], get: () => T, set: (v: T) => void) => {
      const r = el('div', { class: 'set-row' }, `<label>${label}</label>`);
      const g = el('div', { class: 'seg-pick' });
      for (const [v, name] of opts) {
        const b = el('button', { class: 'nav chip' + (get() === v ? ' on' : '') }, name);
        b.onclick = () => {
          set(v);
          apply();
          g.querySelectorAll('.chip').forEach((x) => x.classList.remove('on'));
          b.classList.add('on');
        };
        g.appendChild(b);
      }
      r.appendChild(g);
      body.appendChild(r);
    };
    const slider = (label: string, min: number, max: number, stepv: number, get: () => number, set: (v: number) => void) => {
      const r = el('div', { class: 'set-row' }, `<label>${label}</label>`);
      const i = el('input', { class: 'nav', type: 'range', min: String(min), max: String(max), step: String(stepv), value: String(get()) }) as HTMLInputElement;
      i.oninput = () => {
        set(Number(i.value));
        apply();
      };
      r.appendChild(i);
      body.appendChild(r);
    };
    if (tab === 'video') {
      choice('QUALITY', [[-1, 'AUTO'], [0, 'LOW'], [1, 'MEDIUM'], [2, 'HIGH']], () => settings.quality, (v) => (settings.quality = v));
      slider('SCREEN SHAKE', 0, 1.5, 0.1, () => settings.shake, (v) => (settings.shake = v));
      choice('IMPACT FLASHES', [[1, 'ON'], [0, 'OFF']], () => (settings.flashes ? 1 : 0), (v) => (settings.flashes = !!v));
      choice('CLIP CAPTURE (last ~10s)', [[1, 'ON'], [0, 'OFF']], () => (load('clipsOn', false) ? 1 : 0), (v) => save('clipsOn', !!v));
      const fs = this.btn('TOGGLE FULLSCREEN', () => toggleFullscreen());
      body.appendChild(fs);
    } else if (tab === 'audio') {
      slider('MUSIC', 0, 1, 0.05, () => settings.music, (v) => (settings.music = v));
      slider('SFX', 0, 1, 0.05, () => settings.sfx, (v) => (settings.sfx = v));
      choice('ANNOUNCER VOICE', [[1, 'ON'], [0, 'OFF']], () => (settings.voice ? 1 : 0), (v) => (settings.voice = !!v));
    } else if (tab === 'gameplay') {
      choice('GORE', [['red', 'RED'], ['green', 'GREEN'], ['off', 'OFF']], () => settings.gore, (v) => (settings.gore = v));
      choice('CPU', [['easy', 'EASY'], ['normal', 'NORMAL'], ['hard', 'HARD'], ['brutal', 'BRUTAL']], () => settings.difficulty, (v) => ((settings.difficulty = v), (this.pick.diff = v)));
      choice('ROUNDS', [[1, '1'], [3, 'BEST OF 3'], [5, 'BEST OF 5']], () => settings.rounds, (v) => (settings.rounds = v));
      choice('TIMER', [[45, '45s'], [60, '60s'], [90, '90s'], [0, '∞']], () => settings.timer, (v) => (settings.timer = v));
      choice('STAGE HAZARDS', [[1, 'ON'], [0, 'OFF']], () => (settings.hazards ? 1 : 0), (v) => (settings.hazards = !!v));
      const nr = el('div', { class: 'set-row' }, '<label>PLAYER NAME</label>');
      const ni = el('input', { class: 'nav', value: settings.playerName, maxlength: '14' }) as HTMLInputElement;
      ni.onchange = () => {
        settings.playerName = ni.value.trim() || 'NETA';
        apply();
      };
      nr.appendChild(ni);
      body.appendChild(nr);
    } else if (tab === 'controls') {
      body.appendChild(el('p', { class: 'hint' }, 'Click a key slot, then press the new key. Gamepad: click a slot, then press a pad button.'));
      const t = el('table', { class: 'remap' });
      t.innerHTML = '<tr><th>ACTION</th><th>P1 KEY</th><th>P2 KEY</th><th>PAD</th></tr>';
      for (const b of ['U', 'D', 'L', 'R', 'LP', 'HP', 'LK', 'HK', 'RAGE', 'DODGE', 'ASSIST', 'TAUNT', 'BLOCK'] as ButtonName[]) {
        const tr = el('tr', {}, `<td>${b}</td>`);
        for (const pl of [0, 1] as const) {
          const td = el('td');
          const btn = el('button', { class: 'nav chip' }, (keyBindings[pl][b] ?? []).join(' / ').replace(/Key/g, '') || '—');
          btn.onclick = () => {
            btn.textContent = 'press…';
            const off = onAnyKey((code) => {
              off();
              if (code !== 'Escape') {
                keyBindings[pl][b] = [code];
                saveKeys();
              }
              this.settingsScreen('controls');
            });
          };
          td.appendChild(btn);
          tr.appendChild(td);
        }
        const td = el('td');
        const padIdx = Object.entries(padBindings).find(([, v]) => v === b)?.[0];
        const pb = el('button', { class: 'nav chip' }, ['U', 'D', 'L', 'R'].includes(b) ? 'stick' : padIdx !== undefined ? `B${padIdx}` : '—');
        pb.onclick = () => {
          if (['U', 'D', 'L', 'R'].includes(b)) return;
          pb.textContent = 'press pad…';
          const start = performance.now();
          const iv = setInterval(() => {
            const pad = connectedPads()[0];
            if (!pad || performance.now() - start > 5000) {
              clearInterval(iv);
              this.settingsScreen('controls');
              return;
            }
            const i = pad.buttons.findIndex((x) => x.pressed);
            if (i >= 0 && i !== 9) {
              clearInterval(iv);
              for (const [k, v] of Object.entries(padBindings)) if (v === b) delete padBindings[+k];
              padBindings[i] = b;
              savePad();
              this.settingsScreen('controls');
            }
          }, 30);
        };
        td.appendChild(pb);
        tr.appendChild(td);
        t.appendChild(tr);
      }
      body.appendChild(t);
      const row = el('div', { class: 'row' });
      row.appendChild(this.btn('RESET KEYS', () => (resetKeys(), this.settingsScreen('controls'))));
      row.appendChild(this.btn('RESET PAD', () => {
        for (const k of Object.keys(padBindings)) delete padBindings[+k];
        Object.assign(padBindings, DEFAULT_PAD);
        savePad();
        this.settingsScreen('controls');
      }));
      body.appendChild(row);
      body.appendChild(el('p', { class: 'hint' }, `Gamepads connected: ${connectedPads().map((p) => p.id.slice(0, 30)).join(', ') || 'none (press a button on your pad)'}`));
    } else if (tab === 'touch') {
      choice('LAYOUT', [['pro', 'PRO'], ['gesture', 'GESTURE'], ['smart', 'SMART']], () => settings.touchLayout, (v) => (settings.touchLayout = v));
      slider('BUTTON OPACITY', 0.2, 1, 0.05, () => settings.touchOpacity, (v) => (settings.touchOpacity = v));
      slider('BUTTON SIZE', 0.7, 1.5, 0.05, () => settings.touchScale, (v) => (settings.touchScale = v));
      slider('MOTION LENIENCY', 1, 2, 0.05, () => settings.leniency, (v) => (settings.leniency = v));
      choice('LEFT-HANDED', [[1, 'ON'], [0, 'OFF']], () => (settings.leftHanded ? 1 : 0), (v) => (settings.leftHanded = !!v));
      choice('HAPTICS', [[1, 'ON'], [0, 'OFF']], () => (settings.haptics ? 1 : 0), (v) => (settings.haptics = !!v));
      body.appendChild(this.btn('✏ EDIT BUTTON LAYOUT', () => this.touchEditor()));
    } else if (tab === 'access') {
      choice('COLOUR-BLIND HUD', [[1, 'ON'], [0, 'OFF']], () => (settings.colorblind ? 1 : 0), (v) => (settings.colorblind = !!v));
      choice('ONE-HAND TOUCH', [[1, 'ON'], [0, 'OFF']], () => (settings.oneHand ? 1 : 0), (v) => (settings.oneHand = !!v));
      choice('TRAINING FRAME DATA', [[1, 'ON'], [0, 'OFF']], () => (settings.showFrameData ? 1 : 0), (v) => (settings.showFrameData = !!v));
      choice('BLOOD COLOUR', [['red', 'RED'], ['green', 'GREEN'], ['off', 'OFF']], () => settings.gore, (v) => (settings.gore = v));
      body.appendChild(this.btn('RESET ALL SETTINGS', () => {
        Object.assign(settings, DEFAULT_SETTINGS, { ageOk: true });
        apply();
        this.settingsScreen('access');
      }));
    }
    this.nav.attach(p, () => this.menu());
  }

  touchEditor() {
    this.clear('touchedit');
    const t = this.game.touch;
    t.startEdit();
    const bar = el('div', { class: 'edit-bar' }, '<b>Drag buttons to move them.</b>');
    bar.appendChild(this.btn('RESET', () => t.resetLayout(), 'small'));
    bar.appendChild(this.btn('DONE', () => {
      t.stopEdit();
      t.show(false);
      this.settingsScreen('touch');
    }, 'small primary'));
    this.ui.appendChild(bar);
  }
}

// ------------------------------------------------------------------ utils
declare const __APP_VERSION__: string;

function shuffle<T>(a: T[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function srcP1(): SourceKind {
  return isTouchDevice() ? 'touch' : 'p1';
}

function arcadeDiff(base: Difficulty, idx: number): Difficulty {
  const order: Difficulty[] = ['easy', 'normal', 'hard', 'brutal'];
  const b = order.indexOf(base);
  return order[Math.min(3, b + (idx >= 4 ? 1 : 0))];
}

function motionText(m: string) {
  return ({ BFD: '←→↓', FBF: '→←→', DDOWN: '↓↓', QCF: '↓↘→', QCB: '↓↙←', DP: '→↓↘', QCF2: '↓↘→↓↘→', SPD: '360°' } as Record<string, string>)[m] ?? m;
}

export function apiBase() {
  const env = (import.meta as unknown as { env?: Record<string, string> }).env;
  if (env?.VITE_SERVER_URL) return env.VITE_SERVER_URL;
  const loc = window.location;
  return loc.port === '5173' || loc.port === '4173' ? `${loc.protocol}//${loc.hostname}:8787` : '';
}

function shareText(text: string, url: string) {
  const nav = navigator as Navigator;
  if (nav.share) nav.share({ text, url }).catch(() => {});
  else {
    navigator.clipboard?.writeText(url);
    toast('Link copied to clipboard');
  }
}

function autoQuality(): number {
  const mobile = isTouchDevice() && Math.min(screen.width, screen.height) < 900;
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 4;
  if (mobile) return mem >= 6 ? 1 : 0;
  return 2;
}

function requestFullscreenMaybe() {
  if (!isTouchDevice()) return;
  const d = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  try {
    (d.requestFullscreen?.({ navigationUI: 'hide' }) ?? d.webkitRequestFullscreen?.())?.catch?.(() => {});
    (screen.orientation as unknown as { lock?: (o: string) => Promise<void> })?.lock?.('landscape').catch(() => {});
  } catch {
    /* not allowed */
  }
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

function onNavStart(fn: () => void) {
  import('./core/input').then(({ onNav }) => onNav((d) => d === 'start' && fn()));
}
