// Persistent settings / progress in localStorage (always wrapped: private windows can throw).
const NS = 'kursi-kand:';

export function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(NS + key);
    if (v === null) return fallback;
    const parsed = JSON.parse(v);
    if (fallback && typeof fallback === 'object' && !Array.isArray(fallback)) return { ...fallback, ...parsed };
    return parsed as T;
  } catch {
    return fallback;
  }
}

export function save(key: string, v: unknown) {
  try {
    localStorage.setItem(NS + key, JSON.stringify(v));
  } catch {
    /* storage full or blocked */
  }
}

export interface Settings {
  quality: number; // -1 auto
  gore: 'red' | 'green' | 'off';
  music: number;
  sfx: number;
  voice: boolean;
  shake: number;
  flashes: boolean;
  touchLayout: 'pro' | 'gesture' | 'smart';
  touchOpacity: number;
  touchScale: number;
  leftHanded: boolean;
  haptics: boolean;
  leniency: number;
  colorblind: boolean;
  oneHand: boolean;
  fpsCap: number;
  showFrameData: boolean;
  showHitboxes: boolean;
  ageOk: boolean;
  difficulty: 'easy' | 'normal' | 'hard' | 'brutal';
  rounds: number;
  timer: number;
  hazards: boolean;
  playerName: string;
}

export const DEFAULT_SETTINGS: Settings = {
  quality: -1,
  gore: 'red',
  music: 0.55,
  sfx: 0.85,
  voice: true,
  shake: 1,
  flashes: true,
  touchLayout: 'pro',
  touchOpacity: 0.75,
  touchScale: 1,
  leftHanded: false,
  haptics: true,
  leniency: 1.35,
  colorblind: false,
  oneHand: false,
  fpsCap: 0,
  showFrameData: true,
  showHitboxes: false,
  ageOk: false,
  difficulty: 'normal',
  rounds: 3,
  timer: 90,
  hazards: true,
  playerName: 'NETA',
};

export const settings: Settings = load('settings', DEFAULT_SETTINGS);
export function saveSettings() {
  save('settings', settings);
}

export interface Progress {
  bossUnlocked: boolean;
  arcadeClears: Record<string, number>;
  perksUnlocked: string[];
  wins: number;
  losses: number;
  finishers: number;
  maxCombo: number;
  rating: number;
  ranked: number;
  dailyBest: Record<string, number>;
  survivalBest: number;
  campaignBest: number;
  tutorialDone: boolean;
}

export const progress: Progress = load('progress', {
  bossUnlocked: false,
  arcadeClears: {},
  perksUnlocked: ['lifesteal', 'fastMeter', 'power'],
  wins: 0,
  losses: 0,
  finishers: 0,
  maxCombo: 0,
  rating: 1000,
  ranked: 0,
  dailyBest: {},
  survivalBest: 0,
  campaignBest: 0,
  tutorialDone: false,
} as Progress);

export function saveProgress() {
  save('progress', progress);
}
