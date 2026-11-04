export type Height = 'high' | 'mid' | 'low' | 'overhead' | 'unblockable';
export type MoveKind = 'normal' | 'special' | 'super' | 'xray' | 'throw' | 'cmdgrab' | 'air' | 'weapon';

export interface Box {
  /** forward offset from fighter centre (m) */
  x: number;
  /** centre height (m) */
  y: number;
  /** half width */
  w: number;
  /** half height */
  h: number;
}

export interface ProjDef {
  kind: string;
  speed: number;
  vy?: number;
  gravity?: number;
  life: number;
  y: number;
  box: Box;
  damage: number;
  hitstun: number;
  blockstun: number;
  push: number;
  launch?: number;
  knockdown?: boolean;
  height?: Height;
  hits?: number;
  hitEvery?: number;
  /** stays where it was spawned (traps / barriers) */
  stationary?: boolean;
  /** stuns the target (dizzy) on hit */
  stunOnHit?: number;
  count?: number;
  spread?: number;
  linear?: boolean;
  gore?: number;
  /** projectiles with higher strength beat weaker ones in a clash */
  strength?: number;
}

export interface MoveDef {
  id: string;
  name: string;
  kind: MoveKind;
  startup: number;
  active: number;
  recovery: number;
  damage: number;
  height: Height;
  hitstun: number;
  blockstun: number;
  push: number;
  box: Box;
  pose: string;
  lunge?: number;
  launch?: number;
  knockdown?: boolean;
  wallSplat?: boolean;
  wallBreak?: boolean;
  groundBounce?: boolean;
  otg?: boolean;
  crumple?: boolean;
  /** cancel level: 1 = light normal, 2 = heavy normal, 3 = special, 4 = super (no cancels) */
  cancel: number;
  chains?: string[];
  jumpCancel?: boolean;
  invuln?: [number, number];
  armor?: [number, number];
  /** vertical speed given when the move starts (rising specials) */
  vy?: number;
  /** horizontal travel speed during active frames */
  travel?: number;
  airborne?: boolean;
  air?: boolean;
  hits?: number;
  hitEvery?: number;
  meterCost?: number;
  projectile?: ProjDef;
  linear?: boolean;
  gore?: number;
  /** grab moves: damage dealt at the end of the throw animation */
  grab?: { range: number; dmg: number; frames: number; vx: number; vy: number; cmd?: boolean; ground?: boolean };
  /** teleport: distance relative to opponent (negative = behind) */
  teleport?: number;
  /** counter stance: if hit during active frames, auto-counters with this move */
  counterInto?: string;
  /** buff install duration in frames (rage mode supers) */
  install?: number;
  /** hits on the opponent that cause dizzy */
  dizzy?: number;
  sfx?: string;
  limb?: 'fist' | 'foot' | 'weapon' | 'body' | 'head';
  /** shown in move list */
  input?: string;
}

export interface SpecialInput {
  motion: import('./motion').MotionName;
  btn: 'P' | 'K';
  l: string;
  h: string;
  ex: string;
  air?: boolean;
}

export interface FinisherDef {
  id: string;
  name: string;
  motion: import('./motion').MotionName;
  btn: 'LP' | 'HP' | 'LK' | 'HK';
  kind: 'brutal' | 'comedy' | 'stage';
  range: number;
  frames: number;
}

export interface CharStats {
  hp: number;
  walk: number;
  back: number;
  dash: number;
  jumpV: number;
  jumpVx: number;
  gravity: number;
  power: number;
  width: number;
  height: number;
}

export interface CharDef {
  id: string;
  name: string;
  title: string;
  party: string;
  bio: string;
  slogan: string;
  boss?: boolean;
  stats: CharStats;
  moves: Record<string, MoveDef>;
  specials: SpecialInput[];
  supers: { motion: import('./motion').MotionName; btn: 'P' | 'K'; move: string }[];
  xray: string;
  finishers: FinisherDef[];
  assist: AssistDef;
}

export interface AssistDef {
  name: string;
  /** total frames on screen */
  frames: number;
  /** frames when the hitbox is active */
  activeFrom: number;
  activeTo: number;
  vx: number;
  box: Box;
  damage: number;
  launch: number;
  push: number;
  hitstun: number;
  pose: string;
  projectile?: ProjDef;
}

export type St =
  | 'intro'
  | 'idle'
  | 'walk'
  | 'crouch'
  | 'prejump'
  | 'jump'
  | 'land'
  | 'dash'
  | 'backdash'
  | 'run'
  | 'airdash'
  | 'sidestep'
  | 'roll'
  | 'attack'
  | 'hitstun'
  | 'blockstun'
  | 'air'
  | 'knockdown'
  | 'getup'
  | 'wallsplat'
  | 'crumple'
  | 'grabbed'
  | 'throwing'
  | 'guardcrush'
  | 'dizzy'
  | 'burst'
  | 'taunt'
  | 'pickup'
  | 'win'
  | 'lose'
  | 'finisher'
  | 'finished'
  | 'parry';

export interface FighterState {
  side: 0 | 1;
  char: string;
  assistChar: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  hp: number;
  maxHp: number;
  meter: number;
  rage: number;
  guard: number;
  power: number;
  st: St;
  sf: number;
  dur: number;
  move: string | null;
  mf: number;
  hitsDone: number;
  connected: boolean;
  moveHit: boolean;
  stun: number;
  juggle: number;
  comboHits: number;
  comboDmg: number;
  groundBounced: boolean;
  otgUsed: boolean;
  splatPending: boolean;
  breakPending: boolean;
  invuln: number;
  armorUsed: boolean;
  airJumps: number;
  airDashes: number;
  airAttack: boolean;
  hist: number[];
  hi: number;
  prev: number;
  bufPressed: number;
  bufHeld: number;
  bufF: number;
  bufNeg: boolean;
  slow: number;
  burstUsed: boolean;
  assistCd: number;
  weapon: string | null;
  weaponDur: number;
  grabTarget: boolean;
  techWindow: number;
  throwMove: string | null;
  throwDir: number;
  parryWindow: number;
  parryCd: number;
  install: number;
  dizzyT: number;
  wins: number;
  perks: string[];
  leniency: number;
  dmgDealt: number;
  maxCombo: number;
  parries: number;
  hitsLanded: number;
  lastHitBy: string | null;
  recoveryPenalty: number;
  /** sidestep direction (+1 into screen / -1 out of screen) */
  sideDir: number;
  dodgeDir: number;
  hpScale: number;
  smart: boolean;
  lastCmdMask: number;
  lastCmdF: number;
  lastHitMf: number;
  bouncePending: boolean;
  jumpDir: number;
  dead: boolean;
  everHit: boolean;
}

export interface Proj {
  id: number;
  owner: number;
  def: ProjDef;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number;
  t: number;
  hitsLeft: number;
  cooldown: number;
  dead: boolean;
  power: number;
}

export interface Prop {
  id: number;
  kind: string;
  x: number;
  taken: boolean;
  respawn: number;
}

export interface Assist {
  owner: number;
  char: string;
  x: number;
  facing: number;
  t: number;
  hit: boolean;
}

export interface Hazard {
  kind: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  warn: number;
  target: number;
  hit: [boolean, boolean];
  dead: boolean;
}

export type Phase = 'intro' | 'roundIntro' | 'fight' | 'ko' | 'finishHim' | 'finisher' | 'transition' | 'roundOver' | 'matchOver';

export interface GameEvent {
  t: string;
  s?: number;
  x?: number;
  y?: number;
  v?: number;
  k?: string;
  n?: number;
  /** 1 = counter hit, 2 = punish */
  c?: number;
}

export interface PlayerCfg {
  char: string;
  assist?: string;
  perks?: string[];
  hpScale?: number;
  power?: number;
  leniency?: number;
  smart?: boolean;
}

export interface MatchCfg {
  p: [PlayerCfg, PlayerCfg];
  stage: string;
  rounds?: number;
  timer?: number;
  seed?: number;
  hazards?: boolean;
  training?: boolean;
  /** survival: carry hp, single round */
  singleRound?: boolean;
  startHp?: [number, number];
}

export interface MatchState {
  frame: number;
  rng: number;
  phase: Phase;
  pf: number;
  round: number;
  winsNeeded: number;
  timer: number;
  cfg: MatchCfg;
  f: [FighterState, FighterState];
  projs: Proj[];
  nextProjId: number;
  props: Prop[];
  assists: Assist[];
  hazards: Hazard[];
  nextHazard: number;
  hitstop: number;
  superFreeze: number;
  superOwner: number;
  slowFrames: number;
  slowEvery: number;
  zone: number;
  zones: number;
  wallHp: [number, number];
  spin: number;
  events: GameEvent[];
  roundWinner: number;
  matchWinner: number;
  finisher: { by: number; id: string; kind: string } | null;
  firstBlood: boolean;
  perfect: boolean;
  timeUp: boolean;
  draws: number;
  roundHistory: number[];
}
