// Deterministic fight simulation. Pure data in, pure data out: the same inputs always give the
// same state, which is what replays, rollback netcode and ghost fights rely on.
import { ATK_MASK, B, cleanSocd, isBack, isDown, isFwd, isUp, numpad } from './input';
import { HIST, at, matchDoubleTap, matchMotion, pushHistory } from './motion';
import { CHARS, getMove } from './roster';
import { STAGE_SIM } from './stages';
import type { FighterState, GameEvent, MatchCfg, MatchState, MoveDef, PlayerCfg, Proj, ProjDef, St } from './types';

export const WALL = 7.6;
export const MAX_SEP = 7.0;
export const FPS = 60;
const PRESS_MASK = ATK_MASK | B.RAGE | B.DODGE | B.ASSIST | B.TAUNT;
const ASSIST_CD = 720;
const PROP_RESPAWN = 900;

// ---------------------------------------------------------------- rng
export function rnd(s: MatchState): number {
  let t = (s.rng = (s.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ---------------------------------------------------------------- creation
function createFighter(side: 0 | 1, p: PlayerCfg): FighterState {
  const c = CHARS[p.char];
  if (!c) throw new Error('unknown char ' + p.char);
  const hpScale = p.hpScale ?? 1;
  const perks = p.perks ?? [];
  let maxHp = Math.round(c.stats.hp * hpScale);
  if (perks.includes('tank')) maxHp = Math.round(maxHp * 1.15);
  return {
    side,
    char: p.char,
    assistChar: p.assist ?? p.char,
    x: side === 0 ? -1.6 : 1.6,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    facing: side === 0 ? 1 : -1,
    hp: maxHp,
    maxHp,
    meter: perks.includes('richStart') ? 100 : 0,
    rage: perks.includes('angry') ? 50 : 0,
    guard: 100,
    power: (p.power ?? 1) * c.stats.power,
    st: 'intro',
    sf: 0,
    dur: 0,
    move: null,
    mf: 0,
    hitsDone: 0,
    connected: false,
    moveHit: false,
    stun: 0,
    juggle: 0,
    comboHits: 0,
    comboDmg: 0,
    groundBounced: false,
    otgUsed: false,
    splatPending: false,
    breakPending: false,
    invuln: 0,
    armorUsed: false,
    airJumps: 0,
    airDashes: 0,
    airAttack: false,
    hist: new Array(HIST).fill(0),
    hi: 0,
    prev: 0,
    bufPressed: 0,
    bufHeld: 0,
    bufF: -99,
    bufNeg: false,
    slow: 0,
    burstUsed: false,
    assistCd: 240,
    weapon: null,
    weaponDur: 0,
    grabTarget: false,
    techWindow: 0,
    throwMove: null,
    throwDir: 1,
    parryWindow: 0,
    parryCd: 0,
    install: 0,
    dizzyT: 0,
    wins: 0,
    perks,
    leniency: p.leniency ?? 1,
    dmgDealt: 0,
    maxCombo: 0,
    parries: 0,
    hitsLanded: 0,
    lastHitBy: null,
    recoveryPenalty: 0,
    sideDir: 1,
    dodgeDir: 1,
    hpScale,
    smart: !!p.smart,
    lastCmdMask: 0,
    lastCmdF: -99,
    lastHitMf: -99,
    bouncePending: false,
    jumpDir: 0,
    dead: false,
    everHit: false,
  };
}

export function createMatch(cfg: MatchCfg): MatchState {
  const stage = STAGE_SIM[cfg.stage] ?? STAGE_SIM.assembly;
  const s: MatchState = {
    frame: 0,
    rng: (cfg.seed ?? 12345) | 0,
    phase: 'intro',
    pf: 0,
    round: 1,
    winsNeeded: cfg.singleRound ? 1 : Math.ceil((cfg.rounds ?? 3) / 2),
    timer: (cfg.timer ?? 90) * FPS,
    cfg,
    f: [createFighter(0, cfg.p[0]), createFighter(1, cfg.p[1])],
    projs: [],
    nextProjId: 1,
    props: stage.props.map((p, i) => ({ id: i, kind: p.kind, x: p.x, taken: false, respawn: 0 })),
    assists: [],
    hazards: [],
    nextHazard: 1200,
    hitstop: 0,
    superFreeze: 0,
    superOwner: -1,
    slowFrames: 0,
    slowEvery: 1,
    zone: 0,
    zones: stage.zones,
    wallHp: [3, 3],
    spin: 0,
    events: [],
    roundWinner: -1,
    matchWinner: -1,
    finisher: null,
    firstBlood: false,
    perfect: false,
    timeUp: false,
    draws: 0,
    roundHistory: [],
  };
  if (cfg.startHp) {
    s.f[0].hp = Math.min(s.f[0].maxHp, cfg.startHp[0]);
    s.f[1].hp = Math.min(s.f[1].maxHp, cfg.startHp[1]);
  }
  if (cfg.training) {
    s.phase = 'fight';
    s.f[0].st = s.f[1].st = 'idle';
    s.f[0].meter = s.f[1].meter = 300;
  }
  return s;
}

function startRound(s: MatchState) {
  s.phase = 'roundIntro';
  s.pf = 0;
  s.timer = (s.cfg.timer ?? 90) * FPS;
  s.projs = [];
  s.assists = [];
  s.hazards = [];
  s.zone = 0;
  s.wallHp = [3, 3];
  s.spin = 0;
  s.hitstop = s.superFreeze = s.slowFrames = 0;
  s.roundWinner = -1;
  s.timeUp = false;
  s.perfect = false;
  s.firstBlood = false;
  s.nextHazard = s.frame + 1200 + Math.floor(rnd(s) * 600);
  s.props.forEach((p) => {
    p.taken = false;
    p.respawn = 0;
  });
  for (const f of s.f) {
    const keepHp = s.cfg.singleRound && s.round > 1;
    if (!keepHp) f.hp = f.maxHp;
    f.x = f.side === 0 ? -1.6 : 1.6;
    f.y = f.vx = f.vy = f.z = 0;
    f.facing = f.side === 0 ? 1 : -1;
    f.rage = f.perks.includes('angry') ? 50 : 0;
    f.guard = 100;
    setSt(f, 'idle');
    f.move = null;
    f.burstUsed = false;
    f.assistCd = 240;
    f.weapon = null;
    f.install = 0;
    f.dead = false;
    f.everHit = false;
    f.invuln = 0;
    resetCombo(f);
  }
  s.events.push({ t: 'round', n: s.round, v: isFinalRound(s) ? 1 : 0 });
}

export const isFinalRound = (s: MatchState) => s.f[0].wins === s.winsNeeded - 1 && s.f[1].wins === s.winsNeeded - 1;

function setSt(f: FighterState, st: St, dur = 0) {
  f.st = st;
  f.sf = 0;
  f.dur = dur;
  if (st !== 'attack') {
    f.move = null;
    f.recoveryPenalty = 0;
  }
}

function resetCombo(f: FighterState) {
  f.comboHits = 0;
  f.comboDmg = 0;
  f.juggle = 0;
  f.groundBounced = false;
  f.otgUsed = false;
  f.splatPending = false;
  f.breakPending = false;
  f.bouncePending = false;
}

const ev = (s: MatchState, e: GameEvent) => s.events.push(e);

// ---------------------------------------------------------------- helpers
const grounded = (f: FighterState) => f.y <= 0.0001 && f.vy <= 0;
const towardSign = (f: FighterState, o: FighterState) => (o.x >= f.x ? 1 : -1);
const curInput = (f: FighterState) => at(f, 0);

function holdingBackFrom(f: FighterState, attackerX: number): boolean {
  const m = curInput(f);
  if (m & B.BLOCK) return true;
  const away = attackerX >= f.x ? B.L : B.R;
  return (m & away) !== 0;
}

const ACTIONABLE: St[] = ['idle', 'walk', 'crouch', 'run'];
const isActionable = (f: FighterState) => ACTIONABLE.includes(f.st) || (f.st === 'dash' && f.sf >= 4);
const IN_STUN: St[] = ['hitstun', 'air', 'wallsplat', 'crumple', 'guardcrush', 'dizzy'];

function moveOf(f: FighterState): MoveDef | null {
  return f.move ? getMove(f.char, f.move) : null;
}

function moveTotal(m: MoveDef, f: FighterState) {
  return m.startup + m.active + m.recovery + f.recoveryPenalty;
}

function stats(f: FighterState) {
  return CHARS[f.char].stats;
}

// ---------------------------------------------------------------- command resolution
type Cmd =
  | { t: 'move'; id: string }
  | { t: 'rage'; follow: number }
  | { t: 'burst' }
  | { t: 'dodge'; d: number }
  | { t: 'assist' }
  | { t: 'taunt' }
  | { t: 'pickup' }
  | { t: 'finisher'; id: string; kind: string }
  | { t: 'tech'; d: number };

function strengthOf(pressed: number, btn: 'P' | 'K') {
  const l = btn === 'P' ? B.LP : B.LK;
  const h = btn === 'P' ? B.HP : B.HK;
  if (pressed & l && pressed & h) return 'ex';
  if (pressed & h) return 'h';
  if (pressed & l) return 'l';
  return null;
}

function resolve(s: MatchState, f: FighterState, o: FighterState, pressed: number, held: number, neg: boolean): Cmd | null {
  const c = CHARS[f.char];
  const d = numpad(held, f.facing);
  const air = !grounded(f) || f.st === 'jump' || f.st === 'airdash';
  const len = f.leniency;

  // Finishers (only the winner during FINISH HIM)
  if (s.phase === 'finishHim' && o.st === 'dizzy' && o.hp <= 0) {
    for (const fin of c.finishers) {
      if (pressed & B[fin.btn] && matchMotion(f, f.facing, fin.motion, len) && Math.abs(o.x - f.x) <= fin.range) {
        return { t: 'finisher', id: fin.id, kind: fin.kind };
      }
    }
  }

  if (!air) {
    // X-Ray: QCF x2 + HP+HK
    if (pressed & B.HP && pressed & B.HK && f.meter >= 300 && matchMotion(f, f.facing, 'QCF2', len)) return { t: 'move', id: c.xray };
    for (const sp of c.supers) {
      const str = strengthOf(pressed, sp.btn);
      if (str && f.meter >= 200 && matchMotion(f, f.facing, sp.motion, len)) return { t: 'move', id: sp.move };
    }
    for (const sp of c.specials) {
      const str = strengthOf(pressed, sp.btn);
      if (!str) continue;
      if (!matchMotion(f, f.facing, sp.motion, len)) continue;
      if (str === 'ex' && f.meter >= 100) return { t: 'move', id: sp.ex };
      return { t: 'move', id: str === 'h' ? sp.h : sp.l };
    }
  }
  if (neg) return null;

  if (pressed & B.RAGE) {
    if (IN_STUN.includes(f.st) || f.st === 'blockstun') return { t: 'burst' };
    return { t: 'rage', follow: pressed & ATK_MASK };
  }
  if (f.st === 'knockdown' && pressed & B.DODGE) return { t: 'tech', d };
  if (pressed & B.LP && pressed & B.LK && !air) return { t: 'move', id: 'throw' };
  if (pressed & B.DODGE) {
    if (pressed & B.HP || held & B.HP) {
      if (f.weapon) return { t: 'move', id: 'wThrow' };
      return { t: 'pickup' };
    }
    return { t: 'dodge', d };
  }
  if (pressed & B.ASSIST) return { t: 'assist' };
  if (pressed & B.TAUNT) return { t: 'taunt' };

  const btn = pressed & B.HK ? 'HK' : pressed & B.HP ? 'HP' : pressed & B.LK ? 'LK' : pressed & B.LP ? 'LP' : null;
  if (!btn) return null;
  if (air) return { t: 'move', id: 'j' + btn };
  if (f.weapon && (btn === 'HP' || btn === 'HK')) return { t: 'move', id: 'w' + btn };
  if (d === 3 && btn === 'HK' && c.moves['3HK']) return { t: 'move', id: '3HK' };
  if (isDown(d)) return { t: 'move', id: '2' + btn };
  if (isFwd(d) && c.moves['6' + btn]) return { t: 'move', id: '6' + btn };
  return { t: 'move', id: '5' + btn };
}

// can the fighter perform this command right now?
function canDo(s: MatchState, f: FighterState, cmd: Cmd): boolean {
  if (s.phase !== 'fight' && s.phase !== 'finishHim') return false;
  if (s.phase === 'finishHim' && f.dead) return false;
  switch (cmd.t) {
    case 'finisher':
      return isActionable(f) || f.st === 'attack';
    case 'burst':
      return !f.burstUsed && f.rage >= 25 && (IN_STUN.includes(f.st) || f.st === 'blockstun') && f.st !== 'dizzy';
    case 'rage':
      return f.rage >= 50 && (isActionable(f) || f.st === 'attack' || f.st === 'jump' || f.st === 'land');
    case 'tech':
      return f.st === 'knockdown' && f.techWindow > 0 && !f.dead;
    case 'dodge':
      if (f.st === 'jump') return f.airDashes < 1;
      return isActionable(f);
    case 'assist':
      return f.assistCd <= 0 && (isActionable(f) || f.st === 'jump' || (f.st === 'attack' && f.connected));
    case 'taunt':
    case 'pickup':
      return isActionable(f);
    case 'move': {
      const m = f.char ? CHARS[f.char].moves[cmd.id] : undefined;
      if (!m) return false;
      if (m.meterCost && f.meter < m.meterCost) return false;
      if (m.air) {
        if (f.st === 'jump' && !f.airAttack) return true;
        if (f.st === 'airdash' && f.sf > 4) return true;
        if (f.st === 'attack' && f.move) return canCancel(f, m);
        return false;
      }
      if (!grounded(f) && f.st !== 'prejump') return false;
      if (isActionable(f)) return true;
      if (f.st === 'prejump') return m.kind !== 'normal' && m.kind !== 'throw';
      if (f.st === 'attack') return canCancel(f, m);
      return false;
    }
  }
}

function canCancel(f: FighterState, next: MoveDef): boolean {
  const cur = moveOf(f);
  if (!cur) return false;
  // kara cancel: an early normal can be upgraded into a special, super or throw
  if (f.mf <= 2 && cur.kind === 'normal' && next.kind !== 'normal' && next.kind !== 'air') return true;
  if (!f.connected) return false;
  if (f.mf < cur.startup) return false;
  if (f.install > 0 && next.id !== cur.id) return true;
  if (cur.chains?.includes(next.id)) return true;
  const tier = (m: MoveDef) => (m.kind === 'xray' ? 5 : m.kind === 'super' ? 4 : m.kind === 'special' || m.kind === 'cmdgrab' ? 3 : m.cancel);
  if (cur.cancel === 0 || cur.cancel >= 4) return false;
  if (cur.cancel <= 2) return tier(next) >= 3;
  if (cur.cancel === 3) return tier(next) >= 4;
  return false;
}

function execute(s: MatchState, f: FighterState, o: FighterState, cmd: Cmd) {
  switch (cmd.t) {
    case 'move':
      startMove(s, f, o, cmd.id);
      break;
    case 'rage': {
      f.rage -= 50;
      const had = f.move;
      setSt(f, grounded(f) ? 'idle' : 'jump');
      f.airAttack = false;
      o.slow = 24;
      s.hitstop = Math.max(s.hitstop, 6);
      ev(s, { t: 'rageCancel', s: f.side, x: f.x, y: f.y + 1, k: had ?? '' });
      s.spin += f.side === 0 ? 6 : -6;
      if (cmd.follow) {
        const c2 = resolve(s, f, o, cmd.follow, curInput(f), false);
        if (c2 && c2.t === 'move' && canDo(s, f, c2)) startMove(s, f, o, c2.id);
      }
      break;
    }
    case 'burst':
      f.rage -= 25;
      f.burstUsed = true;
      setSt(f, 'burst', 32);
      f.invuln = 32;
      f.vx = 0;
      ev(s, { t: 'burst', s: f.side, x: f.x, y: f.y + 1 });
      break;
    case 'tech':
      setSt(f, 'getup', 16);
      f.invuln = 18;
      f.vx = (isBack(cmd.d) ? -1 : isFwd(cmd.d) ? 1 : 0) * f.facing * 0.12;
      ev(s, { t: 'tech', s: f.side, x: f.x, y: 0.3 });
      resetCombo(f);
      break;
    case 'dodge': {
      if (f.st === 'jump') {
        const dir = isBack(cmd.d) ? -f.facing : f.facing;
        setSt(f, 'airdash', 14);
        f.airDashes++;
        f.vx = dir * 0.17;
        f.vy = 0;
        ev(s, { t: 'dash', s: f.side, x: f.x, y: f.y });
        break;
      }
      if (isUp(cmd.d) || isDown(cmd.d) || cmd.d === 5) {
        setSt(f, 'sidestep', 18);
        f.sideDir = isDown(cmd.d) ? -1 : 1;
        f.vx = 0;
        ev(s, { t: 'sidestep', s: f.side, x: f.x, y: 0 });
      } else {
        setSt(f, 'roll', 24);
        f.dodgeDir = (isBack(cmd.d) ? -1 : 1) * f.facing;
        f.invuln = 17;
        ev(s, { t: 'roll', s: f.side, x: f.x, y: 0 });
      }
      break;
    }
    case 'assist': {
      f.assistCd = ASSIST_CD;
      s.assists.push({ owner: f.side, char: f.assistChar, x: f.x - f.facing * 1.1, facing: f.facing, t: 0, hit: false });
      ev(s, { t: 'assist', s: f.side, x: f.x, y: 0, k: f.assistChar });
      break;
    }
    case 'taunt':
      setSt(f, 'taunt', 50);
      f.vx = 0;
      ev(s, { t: 'taunt', s: f.side, x: f.x, y: 1.6, k: f.char });
      break;
    case 'pickup': {
      const p = s.props.find((p) => !p.taken && Math.abs(p.x - f.x) < 1.1);
      if (!p) {
        // no prop nearby: treat as a sidestep so the input never feels dead
        setSt(f, 'sidestep', 18);
        f.sideDir = 1;
        break;
      }
      setSt(f, 'pickup', 16);
      f.vx = 0;
      p.taken = true;
      p.respawn = PROP_RESPAWN;
      f.weapon = p.kind;
      f.weaponDur = f.perks.includes('weaponMaster') ? 5 : 3;
      ev(s, { t: 'pickup', s: f.side, x: p.x, y: 0.5, k: p.kind });
      break;
    }
    case 'finisher': {
      const fin = CHARS[f.char].finishers.find((x) => x.id === cmd.id)!;
      s.finisher = { by: f.side, id: cmd.id, kind: cmd.kind };
      s.phase = 'finisher';
      s.pf = 0;
      setSt(f, 'finisher', fin.frames);
      setSt(o, 'finished', fin.frames);
      f.vx = f.vy = o.vx = o.vy = 0;
      f.y = o.y = 0;
      const dir = towardSign(f, o);
      o.x = Math.max(-WALL + 1, Math.min(WALL - 1, f.x + dir * 1.25));
      f.facing = dir as 1 | -1;
      o.facing = -dir as 1 | -1;
      ev(s, { t: 'finisher', s: f.side, k: cmd.id, v: fin.frames, x: f.x, y: 0 });
      break;
    }
  }
}

function startMove(s: MatchState, f: FighterState, o: FighterState, id: string) {
  const m = getMove(f.char, id);
  if (m.meterCost) f.meter -= m.meterCost;
  const wasAir = !grounded(f);
  setSt(f, 'attack');
  f.move = id;
  f.mf = 0;
  f.hitsDone = 0;
  f.connected = false;
  f.moveHit = false;
  f.armorUsed = false;
  f.lastHitMf = -99;
  if (m.air) f.airAttack = true;
  if (!wasAir && !m.airborne) f.vx = 0;
  if (m.vy) {
    f.vy = m.vy;
    f.y = Math.max(f.y, 0.01);
  }
  if (m.invuln) f.invuln = Math.max(f.invuln, m.invuln[1]);
  if (m.kind === 'super' || m.kind === 'xray') {
    s.superFreeze = 40;
    s.superOwner = f.side;
    ev(s, { t: 'super', s: f.side, k: id, x: f.x, y: 1.2, v: m.kind === 'xray' ? 1 : 0 });
    s.spin += f.side === 0 ? 10 : -10;
  } else if (m.kind === 'special' && m.meterCost) {
    ev(s, { t: 'ex', s: f.side, k: id, x: f.x, y: 1.2 });
  }
  ev(s, { t: 'whoosh', s: f.side, k: m.sfx ?? 'light', x: f.x, y: 1 });
  void o;
}

// ---------------------------------------------------------------- input intake
function intake(s: MatchState, f: FighterState, o: FighterState, raw: number) {
  const input = cleanSocd(raw);
  const prev = curInput(f);
  pushHistory(f, input);
  const pressed = input & ~prev & PRESS_MASK;
  const released = ~input & prev & ATK_MASK;
  // forward tap opens a short parry window (with a cooldown so mashing does not work)
  const toward = o.x >= f.x ? B.R : B.L;
  if (input & toward && !(prev & toward) && f.parryCd <= 0) {
    f.parryWindow = 6;
    f.parryCd = 24;
  }
  if (pressed) {
    if (s.frame - f.bufF <= 2 && f.bufPressed && !f.bufNeg) f.bufPressed |= pressed;
    else {
      f.bufPressed = pressed;
      f.bufF = s.frame;
      f.bufNeg = false;
    }
    f.bufHeld = input;
    // chord upgrade: a button pressed right after another one that already fired (LP then HP => EX)
    if (s.frame - f.lastCmdF <= 2 && f.lastCmdMask) {
      f.bufPressed |= f.lastCmdMask;
    }
  } else if (released && !f.bufPressed) {
    f.bufPressed = released;
    f.bufF = s.frame;
    f.bufNeg = true;
    f.bufHeld = input;
  }
  f.prev = input;
}

function tryBuffered(s: MatchState, f: FighterState, o: FighterState) {
  if (!f.bufPressed) return false;
  const age = s.frame - f.bufF;
  if (age > 8) {
    f.bufPressed = 0;
    return false;
  }
  const cmd = resolve(s, f, o, f.bufPressed, f.bufHeld, f.bufNeg);
  if (!cmd) {
    if (f.bufNeg) f.bufPressed = 0;
    return false;
  }
  // don't let a chord re-trigger the exact same move
  if (cmd.t === 'move' && f.st === 'attack' && f.move === cmd.id && f.mf <= 2) {
    f.bufPressed = 0;
    return false;
  }
  if (!canDo(s, f, cmd)) return false;
  f.lastCmdMask = f.bufPressed;
  f.lastCmdF = s.frame;
  f.bufPressed = 0;
  execute(s, f, o, cmd);
  return true;
}

// ---------------------------------------------------------------- per-fighter update
function updateFighter(s: MatchState, f: FighterState, o: FighterState, control: boolean) {
  const st = stats(f);
  const input = curInput(f);
  const d = numpad(input, f.facing);
  const speedMul = f.install > 0 ? 1.25 : 1;

  if (f.invuln > 0) f.invuln--;
  if (f.parryWindow > 0) f.parryWindow--;
  if (f.parryCd > 0) f.parryCd--;
  if (f.assistCd > 0) f.assistCd--;
  if (f.install > 0) f.install--;
  if (f.techWindow > 0) f.techWindow--;
  if (f.st !== 'blockstun' && f.guard < 100) f.guard = Math.min(100, f.guard + 0.22);
  f.sf++;

  if (control && f.st !== 'attack') {
    if (tryBuffered(s, f, o)) return;
  } else if (control && f.st === 'attack') {
    if (tryBuffered(s, f, o)) return;
  }

  switch (f.st) {
    case 'intro':
    case 'win':
    case 'lose':
    case 'finisher':
    case 'finished':
      f.vx = 0;
      break;
    case 'idle':
    case 'walk':
    case 'crouch':
    case 'run': {
      if (!control) {
        if (f.st !== 'idle') setSt(f, 'idle');
        f.vx *= 0.7;
        break;
      }
      faceOpponent(f, o);
      if (matchDoubleTap(f, f.facing, true)) {
        setSt(f, 'dash', 18);
        f.vx = f.facing * st.dash * speedMul;
        ev(s, { t: 'dash', s: f.side, x: f.x, y: 0 });
        break;
      }
      if (matchDoubleTap(f, f.facing, false)) {
        setSt(f, 'backdash', 20);
        f.vx = -f.facing * st.dash * 0.9;
        f.invuln = Math.max(f.invuln, 7);
        ev(s, { t: 'dash', s: f.side, x: f.x, y: 0 });
        break;
      }
      if (f.st === 'run') {
        if (isFwd(d) && !isDown(d) && !isUp(d)) {
          f.vx = f.facing * 0.1 * speedMul;
          break;
        }
        setSt(f, 'idle');
      }
      if (isUp(d)) {
        setSt(f, 'prejump', 4);
        f.jumpDir = isFwd(d) ? f.facing : isBack(d) ? -f.facing : 0;
        f.vx *= 0.5;
        break;
      }
      if (isDown(d)) {
        if (f.st !== 'crouch') setSt(f, 'crouch');
        f.vx = 0;
        break;
      }
      if (isFwd(d)) {
        if (f.st !== 'walk') setSt(f, 'walk');
        f.vx = f.facing * st.walk * speedMul;
      } else if (isBack(d)) {
        if (f.st !== 'walk') setSt(f, 'walk');
        f.vx = -f.facing * st.back * speedMul;
      } else {
        if (f.st !== 'idle') setSt(f, 'idle');
        f.vx = 0;
      }
      break;
    }
    case 'prejump':
      if (f.sf >= f.dur) {
        const dd = numpad(input, f.facing);
        const dir = isFwd(dd) ? f.facing : isBack(dd) ? -f.facing : f.jumpDir;
        setSt(f, 'jump');
        f.vy = st.jumpV;
        f.vx = dir * st.jumpVx * speedMul;
        f.y = 0.01;
        f.airJumps = 0;
        f.airDashes = 0;
        f.airAttack = false;
        ev(s, { t: 'jump', s: f.side, x: f.x, y: 0 });
      }
      break;
    case 'jump': {
      if (!control) break;
      const prevD = numpad(at(f, 1), f.facing);
      const upEdge = isUp(d) && !isUp(prevD);
      if (upEdge && f.sf > 5) {
        const nearWall = Math.abs(f.x) > WALL - st.width - 0.35;
        if (nearWall && Math.sign(f.x) === (isFwd(d) ? f.facing : isBack(d) ? -f.facing : 0)) {
          f.vy = st.jumpV;
          f.vx = -Math.sign(f.x) * 0.1;
          f.facing = -Math.sign(f.x) as 1 | -1;
          f.airAttack = false;
          ev(s, { t: 'walljump', s: f.side, x: f.x, y: f.y });
        } else if (f.airJumps < 1) {
          f.airJumps++;
          f.vy = st.jumpV * 0.88;
          f.vx = (isFwd(d) ? f.facing : isBack(d) ? -f.facing : 0) * st.jumpVx;
          f.airAttack = false;
          ev(s, { t: 'jump', s: f.side, x: f.x, y: f.y, v: 2 });
        }
      }
      break;
    }
    case 'airdash':
      f.vy = 0;
      if (f.sf >= f.dur) {
        setSt(f, 'jump');
        f.vx *= 0.6;
      }
      break;
    case 'land':
    case 'pickup':
      f.vx = 0;
      if (f.sf >= f.dur) setSt(f, 'idle');
      break;
    case 'dash':
      f.vx *= 0.93;
      if (f.sf >= f.dur) {
        if (control && isFwd(d) && !isDown(d)) setSt(f, 'run');
        else setSt(f, 'idle');
      }
      break;
    case 'backdash':
      f.vx *= 0.9;
      if (f.sf >= f.dur) setSt(f, 'idle');
      break;
    case 'sidestep': {
      const t = f.sf / f.dur;
      f.z = f.sideDir * 0.7 * (t < 0.5 ? t * 2 : (1 - t) * 2);
      f.vx = 0;
      if (f.sf >= f.dur) {
        f.z = 0;
        setSt(f, 'idle');
      }
      break;
    }
    case 'roll':
      f.vx = f.sf < 18 ? f.dodgeDir * 0.11 : 0;
      if (f.sf >= f.dur) {
        setSt(f, 'idle');
        faceOpponent(f, o);
      }
      break;
    case 'taunt':
      if (f.sf >= f.dur) {
        f.meter = Math.min(300, f.meter + 30);
        f.rage = Math.min(100, f.rage + 10);
        s.spin += f.side === 0 ? 8 : -8;
        setSt(f, 'idle');
      }
      break;
    case 'burst':
      f.vx = 0;
      if (f.sf === 4) {
        resetCombo(f);
        if (Math.abs(o.x - f.x) < 3 && o.st !== 'grabbed') {
          const dir = towardSign(f, o);
          setSt(o, 'air');
          o.vx = dir * 0.14;
          o.vy = 0.17;
          o.y = Math.max(o.y, 0.05);
          o.juggle = 10;
        }
      }
      if (f.sf >= f.dur) setSt(f, grounded(f) ? 'idle' : 'jump');
      break;
    case 'attack':
      updateAttack(s, f, o);
      break;
    case 'hitstun':
    case 'blockstun':
      f.vx *= 0.85;
      f.stun--;
      if (f.stun <= 0) {
        if (f.st === 'hitstun') endCombo(s, f, o);
        setSt(f, 'idle');
      }
      break;
    case 'guardcrush':
      f.vx *= 0.85;
      if (f.sf >= f.dur) {
        f.guard = 60;
        setSt(f, 'idle');
      }
      break;
    case 'dizzy':
      f.vx *= 0.8;
      if (s.phase !== 'finishHim') {
        f.dizzyT--;
        if (f.dizzyT <= 0) {
          endCombo(s, f, o);
          setSt(f, 'idle');
        }
      }
      break;
    case 'crumple':
      f.vx *= 0.9;
      if (f.sf >= f.dur) toKnockdown(s, f);
      break;
    case 'air':
      break;
    case 'wallsplat':
      f.vx = 0;
      f.vy = -0.004;
      if (f.sf >= f.dur) {
        setSt(f, 'air');
        f.vy = 0;
        f.vx = -Math.sign(f.x) * 0.03;
        f.splatPending = false;
      }
      break;
    case 'knockdown':
      f.vx *= 0.8;
      if (f.dead) break;
      if (f.sf >= f.dur) {
        setSt(f, 'getup', 22);
        f.invuln = 24;
      }
      break;
    case 'getup':
      f.vx *= 0.88;
      if (f.sf >= f.dur) {
        endCombo(s, f, o);
        setSt(f, 'idle');
      }
      break;
    case 'grabbed':
      break;
    case 'throwing':
      updateThrow(s, f, o);
      break;
    case 'parry':
      if (f.sf >= f.dur) setSt(f, 'idle');
      break;
  }
}

function faceOpponent(f: FighterState, o: FighterState) {
  if (Math.abs(o.x - f.x) > 0.05) f.facing = o.x > f.x ? 1 : -1;
}

function endCombo(s: MatchState, f: FighterState, o: FighterState) {
  if (f.comboHits >= 2) {
    ev(s, { t: 'comboEnd', s: o.side, n: f.comboHits, v: Math.round(f.comboDmg), x: f.x, y: 1.5 });
    if (f.comboHits >= 5) s.spin += o.side === 0 ? 8 : -8;
  }
  if (s.cfg.training) {
    f.hp = f.maxHp;
  }
  resetCombo(f);
}

function updateAttack(s: MatchState, f: FighterState, o: FighterState) {
  const m = moveOf(f)!;
  const total = moveTotal(m, f);
  // lunge during startup, travel during active
  if (grounded(f) && !m.airborne) {
    if (m.lunge && f.mf < m.startup) f.vx = (f.facing * m.lunge) / Math.max(1, m.startup);
    else if (m.travel && f.mf >= m.startup && f.mf < m.startup + m.active) f.vx = f.facing * m.travel;
    else if (!m.travel) f.vx *= 0.7;
    else f.vx *= 0.8;
  } else if (m.airborne && m.travel && f.mf < m.startup + m.active) {
    f.vx = f.facing * m.travel;
  }
  if (f.mf === m.startup) {
    if (m.projectile) spawnProjectile(s, f, m.projectile, f.side, f.x, f.facing, f.power * (f.smart ? 0.9 : 1));
    if (m.teleport) {
      const dir = towardSign(f, o);
      const tx = m.teleport < 0 ? o.x + dir * -m.teleport : o.x - dir * m.teleport;
      f.x = Math.max(-WALL + 0.5, Math.min(WALL - 0.5, tx));
      faceOpponent(f, o);
      ev(s, { t: 'teleport', s: f.side, x: f.x, y: 1 });
    }
    if (m.install) {
      f.install = m.install;
      ev(s, { t: 'install', s: f.side, x: f.x, y: 1 });
    }
    if (m.id === 'wThrow' && f.weapon) {
      ev(s, { t: 'weaponThrow', s: f.side, k: f.weapon, x: f.x, y: 1 });
      f.weapon = null;
    }
  }
  // jump cancel from launchers on hit
  if (m.jumpCancel && f.moveHit && f.mf >= m.startup + 2 && isUp(numpad(curInput(f), f.facing))) {
    setSt(f, 'prejump', 3);
    f.jumpDir = f.facing;
    return;
  }
  f.mf++;
  if (f.mf >= total) {
    if (!grounded(f)) {
      setSt(f, 'jump');
      f.airAttack = true;
    } else setSt(f, 'idle');
  }
}

function updateThrow(s: MatchState, f: FighterState, o: FighterState) {
  const m = getMove(f.char, f.throwMove!);
  const g = m.grab!;
  f.vx = 0;
  // hold the victim in place
  o.x = f.x + f.facing * 0.75;
  o.y = Math.min(1.4, (f.sf / g.frames) * 1.6);
  o.vx = o.vy = 0;
  if (o.techWindow <= 0 && !g.cmd && f.sf === 9) {
    // window passed without a tech
  }
  if (f.sf >= g.frames) {
    const dmg = scaleDamage(s, f, o, g.dmg, m);
    applyDamage(s, f, o, dmg, m, 'grab');
    const dir = f.facing * f.throwDir;
    if (f.throwDir < 0) {
      // back throw: swap sides
      o.x = f.x - f.facing * 0.8;
    }
    setSt(o, 'air');
    o.vx = dir * g.vx;
    o.vy = g.vy * 0.9;
    o.y = Math.max(0.3, o.y);
    o.juggle = 6;
    o.splatPending = true;
    ev(s, { t: 'hit', s: f.side, x: o.x, y: o.y + 0.5, v: dmg, k: m.id, n: 3 + (m.kind === 'super' ? 2 : 0) });
    s.hitstop = 10;
    setSt(f, 'land', 14);
    if (o.hp <= 0) onKO(s, f, o);
  }
}

// ---------------------------------------------------------------- projectiles / assists / hazards
function spawnProjectile(s: MatchState, f: FighterState | null, def: ProjDef, owner: number, x: number, facing: number, power: number) {
  const n = def.count ?? 1;
  for (let i = 0; i < n; i++) {
    const k = i - (n - 1) / 2;
    const p: Proj = {
      id: s.nextProjId++,
      owner,
      def,
      x: def.stationary || def.box.x ? x + facing * (0.5 + def.box.x) : x + facing * 0.7,
      y: def.y,
      vx: facing * (def.speed + k * (def.spread ?? 0) * 1.5),
      vy: (def.vy ?? 0) + k * (def.spread ?? 0),
      facing,
      t: 0,
      hitsLeft: def.hits ?? 1,
      cooldown: 0,
      dead: false,
      power,
    };
    if (def.stationary) p.vx = 0;
    s.projs.push(p);
  }
  ev(s, { t: 'proj', s: owner, k: def.kind, x, y: def.y });
  void f;
}

function updateProjectiles(s: MatchState) {
  for (const p of s.projs) {
    if (p.dead) continue;
    p.t++;
    if (p.cooldown > 0) p.cooldown--;
    p.x += p.vx;
    if (p.def.gravity) {
      p.vy -= p.def.gravity;
      p.y += p.vy;
      if (p.y <= 0.05) {
        p.dead = true;
        ev(s, { t: 'projLand', s: p.owner, k: p.def.kind, x: p.x, y: 0 });
      }
    }
    if (p.t >= p.def.life || Math.abs(p.x) > WALL + 3) p.dead = true;
  }
  // clashes
  for (let i = 0; i < s.projs.length; i++) {
    const a = s.projs[i];
    if (a.dead) continue;
    for (let j = i + 1; j < s.projs.length; j++) {
      const b = s.projs[j];
      if (b.dead || a.owner === b.owner) continue;
      if (Math.abs(a.x - b.x) < a.def.box.w + b.def.box.w && Math.abs(a.y - b.y) < a.def.box.h + b.def.box.h + 0.2) {
        const sa = a.def.strength ?? 1;
        const sb = b.def.strength ?? 1;
        if (sa <= sb) a.dead = true;
        if (sb <= sa) b.dead = true;
        ev(s, { t: 'clash', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      }
    }
  }
  for (const p of s.projs) {
    if (p.dead || p.cooldown > 0) continue;
    const d = s.f[1 - p.owner];
    const a = s.f[p.owner];
    const hb = hurtbox(d, false);
    if (!hb) continue;
    const pw = p.def.box.w;
    const ph = p.def.box.h || 0.2;
    if (p.x + pw < hb.x0 || p.x - pw > hb.x1 || p.y + ph < hb.y0 || p.y - ph > hb.y1) continue;
    const mdef = projAsMove(p.def);
    const res = resolveHit(s, a, d, mdef, Math.sign(p.vx) || p.facing, p.power, p.x, p.y, 'proj');
    if (res === 'evade') continue;
    p.hitsLeft--;
    p.cooldown = p.def.hitEvery ?? 6;
    if (p.hitsLeft <= 0 && !p.def.stationary) p.dead = true;
    if (p.hitsLeft <= 0) p.dead = true;
  }
  s.projs = s.projs.filter((p) => !p.dead);
}

function projAsMove(d: ProjDef): MoveDef {
  return {
    id: 'proj:' + d.kind,
    name: d.kind,
    kind: 'special',
    startup: 0,
    active: 1,
    recovery: 0,
    damage: d.damage,
    height: d.height ?? 'mid',
    hitstun: d.hitstun,
    blockstun: d.blockstun,
    push: d.push,
    box: d.box,
    pose: '',
    launch: d.launch,
    knockdown: d.knockdown,
    cancel: 3,
    linear: d.linear,
    gore: d.gore ?? 1,
    dizzy: d.stunOnHit,
    sfx: 'proj',
  };
}

function updateAssists(s: MatchState) {
  for (const a of s.assists) {
    const def = CHARS[a.char].assist;
    const f = s.f[a.owner];
    const o = s.f[1 - a.owner];
    a.t++;
    if (def.projectile) {
      if (a.t === def.activeFrom) spawnProjectile(s, null, def.projectile, a.owner, a.x, a.facing, f.power * 0.85);
    } else {
      if (a.t >= def.activeFrom - 6 && a.t <= def.activeTo) a.x += a.facing * def.vx;
      if (!a.hit && a.t >= def.activeFrom && a.t <= def.activeTo) {
        const hb = hurtbox(o, false);
        if (hb) {
          const cx = a.x + a.facing * def.box.x;
          if (cx + def.box.w > hb.x0 && cx - def.box.w < hb.x1 && def.box.y + def.box.h > hb.y0 && def.box.y - def.box.h < hb.y1) {
            const m: MoveDef = { ...projAsMove({ kind: 'assist', speed: 0, life: 0, y: 0, box: def.box, damage: def.damage, hitstun: def.hitstun, blockstun: 16, push: def.push, launch: def.launch, knockdown: true, gore: 2 }), id: 'assist:' + a.char, linear: false };
            const r = resolveHit(s, f, o, m, a.facing, f.power * 0.85, cx, def.box.y, 'assist');
            if (r !== 'evade') a.hit = true;
          }
        }
      }
    }
  }
  s.assists = s.assists.filter((a) => a.t < CHARS[a.char].assist.frames);
}

function updateHazards(s: MatchState) {
  if (s.phase === 'fight' && s.cfg.hazards !== false && !s.cfg.training && s.frame >= s.nextHazard) {
    s.nextHazard = s.frame + 900 + Math.floor(rnd(s) * 900);
    const stage = STAGE_SIM[s.cfg.stage] ?? STAGE_SIM.assembly;
    if (Math.abs(s.spin) > 30) {
      const target = s.spin > 0 ? 1 : 0;
      const t = s.f[target];
      s.hazards.push({ kind: 'chappal', x: t.x + (rnd(s) - 0.5) * 0.6, y: 6, vx: 0, vy: 0, t: 0, warn: 0, target, hit: [false, false], dead: false });
      ev(s, { t: 'crowdThrow', s: target, x: t.x, y: 6 });
    } else {
      const dir = rnd(s) < 0.5 ? 1 : -1;
      s.hazards.push({ kind: stage.hazard, x: -dir * (WALL + 3), y: 0, vx: dir * 0.17, vy: 0, t: 0, warn: 100, target: -1, hit: [false, false], dead: false });
      ev(s, { t: 'hazardWarn', k: stage.hazard, v: dir, x: -dir * WALL, y: 0 });
    }
  }
  for (const h of s.hazards) {
    h.t++;
    if (h.warn > 0) {
      h.warn--;
      continue;
    }
    if (h.kind === 'chappal') {
      h.vy -= 0.012;
      h.y += h.vy;
      if (h.y <= 0) {
        h.dead = true;
        ev(s, { t: 'projLand', k: 'chappal', x: h.x, y: 0 });
      }
    } else {
      h.x += h.vx;
      if (Math.abs(h.x) > WALL + 4) h.dead = true;
    }
    for (const f of s.f) {
      if (h.dead || h.hit[f.side]) continue;
      if (h.target >= 0 && h.target !== f.side) continue;
      const hb = hurtbox(f, false);
      if (!hb) continue;
      const w = h.kind === 'chappal' ? 0.25 : 0.9;
      const y0 = h.kind === 'chappal' ? h.y - 0.2 : 0;
      const y1 = h.kind === 'chappal' ? h.y + 0.2 : 1.1;
      if (h.x + w < hb.x0 || h.x - w > hb.x1 || y1 < hb.y0 || y0 > hb.y1) continue;
      h.hit[f.side] = true;
      const dmg = h.kind === 'chappal' ? 25 : 70;
      const m = { ...projAsMove({ kind: h.kind, speed: 0, life: 0, y: 0, box: { x: 0, y: 0, w, h: 0.5 }, damage: dmg, hitstun: 20, blockstun: 12, push: 2, launch: h.kind === 'chappal' ? 0 : 8, knockdown: h.kind !== 'chappal', height: h.kind === 'chappal' ? 'mid' : 'unblockable', gore: 1 }), id: 'hazard:' + h.kind };
      // hazards hurt but never steal a KO from the other player: they cannot drop you below 1 hp
      const before = f.hp;
      resolveHit(s, null, f, m, Math.sign(h.vx) || 1, 1, h.x, h.y + 0.5, 'hazard');
      if (f.hp <= 0) f.hp = Math.min(before, 1);
    }
  }
  s.hazards = s.hazards.filter((h) => !h.dead);
}

// ---------------------------------------------------------------- hit detection
interface Rect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

function hurtbox(f: FighterState, otg: boolean): Rect | null {
  if (f.invuln > 0) return null;
  if (['getup', 'finished', 'finisher', 'win', 'lose', 'intro', 'grabbed', 'burst'].includes(f.st)) return null;
  const st = stats(f);
  const w = st.width;
  if (f.st === 'knockdown') {
    if (!otg || f.sf > 22 || f.otgUsed || f.dead) return null;
    return { x0: f.x - 0.9, x1: f.x + 0.9, y0: 0, y1: 0.45 };
  }
  if (f.st === 'roll' && f.sf < 17) return null;
  const crouch = f.st === 'crouch' || (f.st === 'attack' && !!f.move && f.move.startsWith('2'));
  const h = crouch ? st.height * 0.62 : f.st === 'air' ? st.height * 0.8 : st.height;
  return { x0: f.x - w, x1: f.x + w, y0: f.y, y1: f.y + h };
}

function checkMoveHits(s: MatchState, a: FighterState, d: FighterState) {
  if (a.st !== 'attack' || !a.move) return;
  const m = moveOf(a)!;
  const act0 = m.startup;
  const act1 = m.startup + m.active;
  if (a.mf < act0 || a.mf >= act1) return;
  if (m.counterInto) return; // counter stances have no hitbox
  const maxHits = m.hits ?? 1;
  if (a.hitsDone >= maxHits) return;
  if (a.hitsDone > 0 && a.mf - a.lastHitMf < (m.hitEvery ?? 4)) return;
  if (m.grab) {
    tryGrab(s, a, d, m);
    return;
  }
  if (m.projectile || m.teleport || m.install || m.box.w === 0) return;
  const hb = hurtbox(d, !!m.otg);
  if (!hb) return;
  const cx = a.x + a.facing * m.box.x;
  const cy = a.y + m.box.y;
  if (cx + m.box.w < hb.x0 || cx - m.box.w > hb.x1 || cy + m.box.h < hb.y0 || cy - m.box.h > hb.y1) return;
  if (d.st === 'knockdown') d.otgUsed = true;
  const r = resolveHit(s, a, d, m, a.facing, a.power * (a.smart && m.kind !== 'normal' ? 0.9 : 1), (cx + d.x) / 2, cy, 'move');
  if (r === 'evade') return;
  a.hitsDone++;
  a.lastHitMf = a.mf;
  a.connected = true;
  if (r === 'hit') a.moveHit = true;
  if (a.weapon && m.kind === 'weapon') {
    a.weaponDur--;
    if (a.weaponDur <= 0) {
      ev(s, { t: 'weaponBreak', s: a.side, k: a.weapon, x: cx, y: cy });
      a.weapon = null;
    }
  }
}

function tryGrab(s: MatchState, a: FighterState, d: FighterState, m: MoveDef) {
  const g = m.grab!;
  if (Math.abs(d.x - a.x) > g.range + stats(d).width) return;
  if (d.y > 0.2 || d.invuln > 0) return;
  if (['hitstun', 'blockstun', 'air', 'knockdown', 'getup', 'grabbed', 'throwing', 'wallsplat', 'finished', 'burst'].includes(d.st)) return;
  if (d.st === 'sidestep' && !g.cmd) return;
  if (d.st === 'attack' && d.move) {
    const dm = moveOf(d)!;
    if (dm.airborne && d.y > 0.05) return;
  }
  a.hitsDone = 99;
  a.connected = true;
  a.moveHit = true;
  const back = isBack(numpad(at(a, 0), a.facing)) || isBack(numpad(at(a, 2), a.facing));
  a.throwDir = !g.cmd && back ? -1 : 1;
  a.throwMove = m.id;
  setSt(a, 'throwing');
  a.move = null;
  d.techWindow = g.cmd ? 0 : 9;
  setSt(d, 'grabbed');
  d.vx = d.vy = 0;
  ev(s, { t: 'grab', s: a.side, k: m.id, x: d.x, y: 1.1, v: m.kind === 'super' ? 1 : 0 });
}

function checkThrowTech(s: MatchState, f: FighterState, o: FighterState) {
  if (f.st !== 'grabbed' || f.techWindow <= 0) return;
  const p = f.bufPressed;
  if (p & B.LP && p & B.LK && s.frame - f.bufF <= 7) {
    f.bufPressed = 0;
    const dir = towardSign(o, f);
    setSt(f, 'hitstun');
    f.stun = 14;
    f.vx = dir * 0.12;
    f.y = 0;
    setSt(o, 'hitstun');
    o.stun = 14;
    o.vx = -dir * 0.12;
    ev(s, { t: 'tech', s: f.side, x: (f.x + o.x) / 2, y: 1.2, k: 'throw' });
    s.hitstop = 8;
  }
}

function scaleDamage(s: MatchState, a: FighterState | null, d: FighterState, base: number, m: MoveDef) {
  const heavyKind = m.kind === 'super' || m.kind === 'xray';
  const minScale = heavyKind ? 0.5 : 0.3;
  const scale = d.comboHits <= 1 ? 1 : Math.max(minScale, 1 - 0.1 * (d.comboHits - 1));
  let dmg = base * scale;
  if (a) {
    dmg *= 1 + (a.install > 0 ? 0.2 : 0);
    if (a.perks.includes('power')) dmg *= 1.1;
    const spinFavor = a.side === 0 ? s.spin : -s.spin;
    dmg *= 1 + Math.max(-0.1, Math.min(0.1, spinFavor / 1000));
  }
  if (d.perks.includes('thickSkin')) dmg *= 0.92;
  return dmg;
}

type HitResult = 'hit' | 'block' | 'parry' | 'evade' | 'armor';

function resolveHit(s: MatchState, a: FighterState | null, d: FighterState, m: MoveDef, dir: number, power: number, hx: number, hy: number, src: string): HitResult {
  if (d.st === 'sidestep' && d.sf >= 2 && d.sf <= 14 && m.linear !== false) {
    if (a && !a.connected) ev(s, { t: 'evade', s: d.side, x: d.x, y: 1.2 });
    return 'evade';
  }
  const dGround = d.y <= 0.05;
  const dMove = d.st === 'attack' ? moveOf(d) : null;
  // parry
  const parryable = m.height !== 'unblockable' && dGround && (isActionable(d) || d.st === 'land');
  if (parryable && d.parryWindow > 0) {
    d.parryWindow = 0;
    d.parries++;
    d.meter = Math.min(300, d.meter + 25);
    d.rage = Math.min(100, d.rage + 8);
    setSt(d, 'parry', 8);
    d.vx = 0;
    if (a && src === 'move') a.recoveryPenalty += 14;
    s.hitstop = Math.max(s.hitstop, 14);
    s.spin += d.side === 0 ? 10 : -10;
    ev(s, { t: 'parry', s: d.side, x: hx, y: hy });
    return 'parry';
  }
  // counter stance
  if (dMove?.counterInto && d.mf >= dMove.startup && d.mf < dMove.startup + dMove.active && m.height !== 'unblockable') {
    startMove(s, d, a ?? d, dMove.counterInto);
    d.invuln = 10;
    s.hitstop = Math.max(s.hitstop, 12);
    ev(s, { t: 'counterStance', s: d.side, x: hx, y: hy });
    return 'parry';
  }
  // blocking
  const canBlockState = dGround && (['idle', 'walk', 'crouch', 'blockstun', 'land'].includes(d.st) || (d.st === 'dash' && d.sf > 10));
  const srcX = a ? a.x : hx - dir;
  if (canBlockState && m.height !== 'unblockable' && holdingBackFrom(d, srcX)) {
    const crouching = isDown(numpad(curInput(d), d.facing));
    const ok = m.height === 'low' ? crouching : m.height === 'overhead' ? !crouching : true;
    if (ok) {
      const chip = m.kind === 'normal' || m.kind === 'air' ? 0 : m.damage * 0.12 * power;
      d.hp = Math.max(1, d.hp - chip);
      d.guard -= m.damage * 0.12 + 4;
      d.meter = Math.min(300, d.meter + 4);
      if (a) a.meter = Math.min(300, a.meter + 3);
      if (d.guard <= 0) {
        d.guard = 0;
        setSt(d, 'guardcrush', 42);
        d.vx = dir * 0.06;
        s.hitstop = Math.max(s.hitstop, 16);
        ev(s, { t: 'guardCrush', s: d.side, x: hx, y: hy });
        s.spin += d.side === 0 ? -8 : 8;
        return 'block';
      }
      setSt(d, 'blockstun');
      d.stun = m.blockstun;
      d.vx = dir * m.push * 0.07;
      if (a && src === 'move' && Math.abs(d.x) > WALL - stats(d).width - 0.1) a.vx = -dir * m.push * 0.05;
      s.hitstop = Math.max(s.hitstop, 5);
      ev(s, { t: 'block', s: d.side, x: hx, y: hy, k: m.id });
      return 'block';
    }
  }
  // armor
  if (dMove?.armor && d.mf >= dMove.armor[0] && d.mf <= dMove.armor[1] && !d.armorUsed && m.kind !== 'super' && m.kind !== 'xray') {
    d.armorUsed = true;
    d.hp -= m.damage * power * 0.5;
    s.hitstop = Math.max(s.hitstop, 8);
    ev(s, { t: 'armor', s: d.side, x: hx, y: hy });
    if (d.hp <= 0 && a) onKO(s, a, d);
    return 'armor';
  }

  // ---- clean hit
  const counter = !!dMove && d.mf < dMove.startup;
  const punish = (!!dMove && d.mf >= dMove.startup + dMove.active) || ['land', 'backdash', 'taunt', 'guardcrush', 'roll', 'pickup'].includes(d.st);
  let dmg = scaleDamage(s, a, d, m.damage * power, m);
  if (counter) dmg *= 1.2;
  else if (punish) dmg *= 1.1;
  if (d.st === 'guardcrush') dmg *= 1.2;
  const wasAirborne = !dGround || ['air', 'wallsplat', 'crumple'].includes(d.st);
  const prevSt = d.st;
  const gore = (m.gore ?? 1) + (counter ? 1 : 0);

  applyDamage(s, a, d, dmg, m, src);
  d.comboHits++;
  d.comboDmg += dmg;
  if (a) {
    a.maxCombo = Math.max(a.maxCombo, d.comboHits);
    a.hitsLanded++;
  }
  if (d.weapon && (m.knockdown || m.launch)) {
    ev(s, { t: 'weaponDrop', s: d.side, k: d.weapon, x: d.x, y: 1 });
    d.weapon = null;
  }

  // reaction
  const launchV = m.launch ? m.launch * 0.021 : 0;
  if (d.hp <= 0 && s.phase !== 'finishHim') {
    // lethal: always send them flying
    setSt(d, 'air');
    d.vy = Math.max(0.12, launchV);
    d.vx = dir * Math.max(0.08, m.push * 0.05);
    d.y = Math.max(d.y, 0.05);
  } else if (m.dizzy && !wasAirborne) {
    setSt(d, 'dizzy');
    d.dizzyT = m.dizzy;
    d.vx = dir * 0.03;
  } else if (wasAirborne || launchV > 0 || m.knockdown) {
    const js = Math.max(0.3, 1 - 0.09 * d.juggle);
    setSt(d, 'air');
    d.juggle++;
    d.vy = (launchV || (wasAirborne ? 0.1 : 0.08)) * (wasAirborne ? js : 1);
    d.vx = dir * Math.min(0.16, m.push * 0.045);
    d.y = Math.max(d.y, 0.05);
    if (d.juggle > 9) d.invuln = 40;
    if (m.groundBounce && wasAirborne && !d.groundBounced) {
      d.vy = -0.22;
      d.bouncePending = true;
    }
    if (m.groundBounce && !wasAirborne && !d.groundBounced && counter) {
      d.vy = 0.05;
      d.bouncePending = true;
    }
  } else if (m.crumple && (counter || punish)) {
    setSt(d, 'crumple', 48);
    d.vx = dir * 0.02;
    ev(s, { t: 'crumple', s: d.side, x: d.x, y: 1 });
  } else {
    setSt(d, 'hitstun');
    d.stun = m.hitstun + (counter ? 6 : 0);
    d.vx = dir * m.push * 0.09;
    if (a && src === 'move' && Math.abs(d.x) > WALL - stats(d).width - 0.1) a.vx = -dir * m.push * 0.06;
  }
  if (m.wallSplat || m.wallBreak) d.splatPending = true;
  if (m.wallBreak) d.breakPending = true;
  void prevSt;

  let stop = m.kind === 'super' || m.kind === 'xray' ? 16 : m.damage >= 90 ? 12 : m.damage >= 60 ? 9 : 6;
  if (counter) stop += 4;
  s.hitstop = Math.max(s.hitstop, stop);
  if (m.kind === 'xray' && a && !a.moveHit) {
    s.slowFrames = 110;
    s.slowEvery = 3;
    ev(s, { t: 'xray', s: a.side, x: d.x, y: 1.2, k: a.char });
  }
  ev(s, { t: 'hit', s: a ? a.side : -1, x: hx, y: hy, v: Math.round(dmg), k: m.id, n: gore, c: counter ? 1 : punish ? 2 : 0 });
  if (counter) ev(s, { t: 'counter', s: a?.side ?? -1, x: hx, y: hy + 0.4, k: 'COUNTER' });
  else if (punish && a) ev(s, { t: 'counter', s: a.side, x: hx, y: hy + 0.4, k: 'PUNISH' });
  if (!s.firstBlood && a) {
    s.firstBlood = true;
    ev(s, { t: 'firstBlood', s: a.side, x: hx, y: hy });
    s.spin += a.side === 0 ? 10 : -10;
  }
  if (a) s.spin += (a.side === 0 ? 1 : -1) * Math.min(4, dmg * 0.03);
  if (d.hp <= 0 && a) onKO(s, a, d);
  else if (d.hp <= 0 && !a) d.hp = 1;
  return 'hit';
}

function applyDamage(s: MatchState, a: FighterState | null, d: FighterState, dmg: number, m: MoveDef, src: string) {
  d.hp -= dmg;
  d.everHit = true;
  if (s.cfg.training && d.hp < 1) d.hp = 1;
  d.lastHitBy = m.id;
  d.meter = Math.min(300, d.meter + dmg * 0.18);
  d.rage = Math.min(100, d.rage + dmg * 0.07);
  if (a) {
    const gain = a.install > 0 ? 0 : (a.perks.includes('fastMeter') ? 1.3 : 1) * (dmg * 0.22 + 3);
    if (m.kind !== 'super' && m.kind !== 'xray') a.meter = Math.min(300, a.meter + gain);
    a.rage = Math.min(100, a.rage + dmg * 0.02);
    a.dmgDealt += dmg;
    if (a.perks.includes('lifesteal')) a.hp = Math.min(a.maxHp, a.hp + dmg * 0.08);
  }
  void src;
}

// ---------------------------------------------------------------- KO / rounds
function onKO(s: MatchState, w: FighterState, l: FighterState) {
  if (s.cfg.training) {
    l.hp = l.maxHp;
    return;
  }
  if (s.phase === 'finishHim') {
    l.hp = 0;
    l.dead = true;
    s.phase = 'ko';
    s.pf = 0;
    w.wins++;
    s.roundWinner = w.side;
    s.slowFrames = 80;
    s.slowEvery = 4;
    ev(s, { t: 'ko', s: w.side, x: l.x, y: 1, v: 2 });
    return;
  }
  if (s.phase !== 'fight') return;
  l.hp = 0;
  if (w.wins + 1 >= s.winsNeeded && !s.cfg.singleRound) {
    s.phase = 'finishHim';
    s.pf = 0;
    setSt(l, 'dizzy');
    l.dizzyT = 9999;
    l.y = 0;
    l.vx = l.vy = 0;
    l.invuln = 50;
    s.projs = [];
    s.hitstop = 24;
    resetCombo(l);
    ev(s, { t: 'finishHim', s: w.side, x: l.x, y: 1.5 });
    return;
  }
  l.dead = true;
  s.phase = 'ko';
  s.pf = 0;
  w.wins++;
  s.roundWinner = w.side;
  s.perfect = w.hp >= w.maxHp;
  s.slowFrames = 80;
  s.slowEvery = 4;
  ev(s, { t: 'ko', s: w.side, x: l.x, y: 1, v: s.perfect ? 1 : 0 });
}

function onTimeUp(s: MatchState) {
  const [a, b] = s.f;
  const ra = a.hp / a.maxHp;
  const rb = b.hp / b.maxHp;
  s.timeUp = true;
  s.phase = 'ko';
  s.pf = 0;
  if (Math.abs(ra - rb) < 0.001) {
    s.roundWinner = -1;
    s.draws++;
    a.wins++;
    b.wins++;
  } else {
    const w = ra > rb ? a : b;
    w.wins++;
    s.roundWinner = w.side;
    (w === a ? b : a).dead = false;
  }
  ev(s, { t: 'timeUp', s: s.roundWinner });
}

// ---------------------------------------------------------------- physics
function physics(s: MatchState, f: FighterState) {
  if (f.st === 'grabbed' || f.st === 'finisher' || f.st === 'finished') return;
  const st = stats(f);
  const wasAir = f.y > 0.0001 || f.vy > 0;
  f.x += f.vx;
  if (f.st === 'wallsplat') {
    f.y = Math.max(0.3, f.y + f.vy);
    return;
  }
  if (wasAir && f.st !== 'airdash') {
    const g = f.st === 'air' ? st.gravity * 1.15 : st.gravity;
    f.vy -= g;
    f.y += f.vy;
  }
  if (f.y <= 0 && wasAir) {
    f.y = 0;
    const vyWas = f.vy;
    f.vy = 0;
    onLand(s, f, vyWas);
  }
  // walls
  const lim = WALL - st.width;
  if (f.x < -lim || f.x > lim) {
    const side = f.x < 0 ? 0 : 1;
    f.x = Math.max(-lim, Math.min(lim, f.x));
    if ((f.st === 'air' || f.st === 'hitstun') && f.splatPending && Math.abs(f.vx) > 0.02 && !f.dead) {
      wallSplat(s, f, side);
    }
  }
}

function wallSplat(s: MatchState, f: FighterState, side: number) {
  f.splatPending = false;
  s.wallHp[side]--;
  const doBreak = (f.breakPending || s.wallHp[side] <= 0) && s.zone < s.zones - 1;
  if (doBreak && s.phase === 'fight') {
    f.breakPending = false;
    s.phase = 'transition';
    s.pf = 0;
    s.wallHp = [3, 3];
    ev(s, { t: 'wallBreak', s: f.side, x: f.x, y: Math.max(0.6, f.y), n: s.zone + 1 });
    s.hitstop = 20;
    return;
  }
  setSt(f, 'wallsplat', 38);
  f.vx = 0;
  f.vy = 0;
  f.y = Math.max(0.5, f.y);
  s.hitstop = Math.max(s.hitstop, 10);
  ev(s, { t: 'wallSplat', s: f.side, x: f.x, y: f.y + 0.8 });
}

function toKnockdown(s: MatchState, f: FighterState) {
  setSt(f, 'knockdown', f.dead ? 9999 : 38);
  f.techWindow = 12;
  f.vx *= 0.4;
  ev(s, { t: 'knockdown', s: f.side, x: f.x, y: 0 });
}

function onLand(s: MatchState, f: FighterState, vy: number) {
  switch (f.st) {
    case 'jump':
      setSt(f, 'land', 4);
      f.vx = 0;
      ev(s, { t: 'land', s: f.side, x: f.x, y: 0 });
      break;
    case 'airdash':
      setSt(f, 'land', 6);
      break;
    case 'attack': {
      const m = moveOf(f);
      if (m?.air) {
        setSt(f, 'land', 5);
        f.vx = 0;
      } else f.vx *= 0.3;
      break;
    }
    case 'air':
      if (f.bouncePending && !f.groundBounced) {
        f.groundBounced = true;
        f.bouncePending = false;
        f.vy = 0.16;
        f.y = 0.01;
        f.vx *= 0.5;
        ev(s, { t: 'groundBounce', s: f.side, x: f.x, y: 0 });
        s.hitstop = Math.max(s.hitstop, 6);
        break;
      }
      if (vy < -0.18 && !f.dead) ev(s, { t: 'slam', s: f.side, x: f.x, y: 0 });
      toKnockdown(s, f);
      break;
    case 'burst':
    case 'hitstun':
    case 'blockstun':
      break;
    default:
      if (f.st !== 'knockdown') f.vx *= 0.5;
  }
}

function separate(a: FighterState, b: FighterState) {
  const noPush: St[] = ['roll', 'grabbed', 'throwing', 'finished', 'finisher', 'knockdown'];
  if (noPush.includes(a.st) || noPush.includes(b.st)) return;
  if (a.y > 1.0 && b.y > 1.0 ? false : Math.abs(a.y - b.y) > 1.2) return;
  const wa = stats(a).width;
  const wb = stats(b).width;
  const dx = b.x - a.x;
  const minD = wa + wb;
  if (Math.abs(dx) >= minD) return;
  const overlap = minD - Math.abs(dx);
  const dir = dx === 0 ? (a.side === 0 ? 1 : -1) : Math.sign(dx);
  const la = WALL - wa;
  const lb = WALL - wb;
  let pa = overlap / 2;
  let pb = overlap / 2;
  if (Math.abs(a.x - dir * pa) > la) {
    pb = overlap;
    pa = 0;
  }
  if (Math.abs(b.x + dir * pb) > lb) {
    pa = overlap;
    pb = 0;
  }
  a.x -= dir * pa;
  b.x += dir * pb;
}

function clampSeparation(a: FighterState, b: FighterState) {
  const dx = b.x - a.x;
  if (Math.abs(dx) > MAX_SEP) {
    const ex = (Math.abs(dx) - MAX_SEP) / 2;
    const dir = Math.sign(dx);
    a.x += dir * ex;
    b.x -= dir * ex;
  }
}

// ---------------------------------------------------------------- main step
export function step(s: MatchState, inputs: [number, number]) {
  s.events = [];
  s.frame++;
  const [A, Bf] = s.f;
  const live = s.phase === 'fight' || s.phase === 'finishHim';
  intake(s, A, Bf, live ? inputs[0] : 0);
  intake(s, Bf, A, live ? inputs[1] : 0);
  if (s.phase === 'intro' || s.phase === 'roundIntro' || s.phase === 'matchOver') {
    // menus can skip intros with any button
    if (s.phase === 'intro' && s.pf > 30 && (inputs[0] | inputs[1]) & ATK_MASK) s.pf = 9999;
  }
  s.pf++;

  switch (s.phase) {
    case 'intro':
      for (const f of s.f) setSt(f, 'intro');
      if (s.pf >= 170) startRound(s);
      return;
    case 'roundIntro':
      for (const f of s.f) {
        f.sf++;
        f.vx = 0;
      }
      if (s.pf === 70) ev(s, { t: 'fight' });
      if (s.pf >= 90) {
        s.phase = 'fight';
        s.pf = 0;
      }
      return;
    case 'matchOver':
      for (const f of s.f) {
        f.sf++;
        physics(s, f);
      }
      return;
    case 'finisher':
      for (const f of s.f) f.sf++;
      if (s.pf >= s.f[s.finisher!.by].dur) {
        const w = s.f[s.finisher!.by];
        const l = s.f[1 - s.finisher!.by];
        w.wins++;
        l.dead = true;
        s.roundWinner = w.side;
        endMatch(s);
      }
      return;
    case 'transition': {
      if (s.pf === 45) {
        s.zone++;
        const [a, b] = s.f;
        const victim = a.splatPending === false && a.st === 'air' && a.y > 0 ? a : b.st === 'air' ? b : a;
        void victim;
        // reposition both fighters in the new zone, victim on the floor
        for (const f of s.f) {
          f.x = f.side === 0 ? -1.4 : 1.4;
          f.y = 0;
          f.vx = f.vy = 0;
        }
        for (const f of s.f) {
          if (f.st === 'air' || f.st === 'wallsplat') {
            f.hp -= 60;
            if (f.hp <= 1) f.hp = 1;
            toKnockdown(s, f);
            f.dur = 50;
          } else setSt(f, 'idle');
          faceOpponent(f, s.f[1 - f.side]);
        }
        s.projs = [];
        s.hazards = [];
        ev(s, { t: 'zone', n: s.zone });
      }
      if (s.pf >= 100) {
        s.phase = 'fight';
        s.pf = 0;
      }
      if (s.pf < 45) return;
      break;
    }
    case 'ko':
      break;
    default:
      break;
  }

  if (s.superFreeze > 0) {
    s.superFreeze--;
    // the super owner keeps animating the flash pose; nothing else moves
    return;
  }
  if (s.hitstop > 0) {
    s.hitstop--;
    return;
  }
  if (s.slowFrames > 0) {
    s.slowFrames--;
    if (s.frame % s.slowEvery !== 0) return;
  }

  // fight timer
  if (s.phase === 'fight' && !s.cfg.training && (s.cfg.timer ?? 90) > 0) {
    s.timer--;
    if (s.timer <= 0) {
      s.timer = 0;
      onTimeUp(s);
    }
  }
  if (s.phase === 'finishHim' && s.pf >= 330) {
    const l = s.f.find((f) => f.st === 'dizzy' && f.hp <= 0) ?? s.f[0];
    const w = s.f[1 - l.side];
    l.dead = true;
    setSt(l, 'air');
    l.vy = 0.05;
    l.y = 0.05;
    s.phase = 'ko';
    s.pf = 0;
    w.wins++;
    s.roundWinner = w.side;
    ev(s, { t: 'ko', s: w.side, x: l.x, y: 1, v: 0 });
  }

  const control = s.phase === 'fight' || s.phase === 'finishHim';
  for (const f of s.f) {
    const o = s.f[1 - f.side];
    if (f.slow > 0) {
      f.slow--;
      if (f.slow % 2 === 1) continue;
    }
    const ctl = control && !(s.phase === 'finishHim' && f.hp <= 0) && !f.dead;
    checkThrowTech(s, f, o);
    updateFighter(s, f, o, ctl);
  }
  for (const f of s.f) physics(s, f);
  separate(A, Bf);
  clampSeparation(A, Bf);

  if (s.phase === 'fight' || s.phase === 'finishHim' || s.phase === 'ko') {
    checkMoveHits(s, A, Bf);
    checkMoveHits(s, Bf, A);
    updateProjectiles(s);
    updateAssists(s);
    updateHazards(s);
  }
  for (const p of s.props) {
    if (p.taken && p.respawn > 0) {
      p.respawn--;
      if (p.respawn === 0) {
        p.taken = false;
        ev(s, { t: 'propRespawn', x: p.x, y: 0, k: p.kind });
      }
    }
  }
  s.spin = Math.max(-100, Math.min(100, s.spin * 0.9995));

  if (s.phase === 'ko' && s.pf >= 190) {
    s.roundHistory.push(s.roundWinner);
    if (s.f[0].wins >= s.winsNeeded || s.f[1].wins >= s.winsNeeded) endMatch(s);
    else {
      s.round++;
      startRound(s);
    }
  }
}

function endMatch(s: MatchState) {
  const [a, b] = s.f;
  s.phase = 'matchOver';
  s.pf = 0;
  s.matchWinner = a.wins === b.wins ? -1 : a.wins > b.wins ? 0 : 1;
  if (s.roundHistory.length < s.round) s.roundHistory.push(s.roundWinner);
  for (const f of s.f) {
    if (s.matchWinner === f.side) {
      setSt(f, 'win');
      f.y = 0;
    } else if (s.matchWinner >= 0 && !s.finisher) setSt(f, f.dead ? 'knockdown' : 'lose', 99999);
  }
  ev(s, { t: 'matchOver', s: s.matchWinner, v: s.finisher ? 1 : 0 });
}

// ---------------------------------------------------------------- state utilities
export function cloneState(s: MatchState): MatchState {
  return structuredClone(s);
}

/** Cheap rolling hash of the important parts of the state (desync detection, tests). */
export function hashState(s: MatchState): number {
  let h = 2166136261 >>> 0;
  const mix = (v: number) => {
    const n = Math.round(v * 10000) | 0;
    h ^= n & 0xff;
    h = Math.imul(h, 16777619) >>> 0;
    h ^= (n >>> 8) & 0xffffff;
    h = Math.imul(h, 16777619) >>> 0;
  };
  mix(s.frame);
  mix(s.rng);
  mix(s.timer);
  for (const f of s.f) {
    mix(f.x);
    mix(f.y);
    mix(f.vx);
    mix(f.vy);
    mix(f.hp);
    mix(f.meter);
    mix(f.mf);
    mix(f.sf);
    mix(f.st.length + f.st.charCodeAt(0));
  }
  mix(s.projs.length);
  return h >>> 0;
}

export { getMove };
