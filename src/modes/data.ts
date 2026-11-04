// Mode data: manifesto perks, election campaign map, daily challenge modifiers.
export interface Perk {
  id: string;
  name: string;
  desc: string;
  icon: string;
  cost: number;
}

export const PERKS: Perk[] = [
  { id: 'lifesteal', name: 'Gareebi Hatao', desc: 'Heal 8% of damage you deal', icon: '🩸', cost: 0 },
  { id: 'fastMeter', name: 'Meter Mudra', desc: '+30% super meter gain', icon: '⚡', cost: 0 },
  { id: 'power', name: 'Bahubal', desc: '+10% damage', icon: '💪', cost: 0 },
  { id: 'tank', name: 'Z+ Security', desc: '+15% max health', icon: '🛡️', cost: 120 },
  { id: 'thickSkin', name: 'Gainda Skin', desc: 'Take 8% less damage', icon: '🦏', cost: 120 },
  { id: 'richStart', name: 'Black Money', desc: 'Start every round with 1 bar', icon: '💰', cost: 160 },
  { id: 'angry', name: 'Jan Aakrosh', desc: 'Start every round with 50 rage', icon: '😡', cost: 160 },
  { id: 'weaponMaster', name: 'Lathi Raj', desc: 'Stage weapons last 5 hits', icon: '🦯', cost: 100 },
];

export const PERK_UNLOCKS: Record<string, string> = {
  tank: 'Win 3 matches',
  thickSkin: 'Clear Arcade once',
  richStart: 'Land a finisher',
  angry: 'Land a 10-hit combo',
  weaponMaster: 'Win 10 matches',
};

export interface CampaignState {
  name: string;
  region: string;
  opp: string;
  stage: string;
  votes: number;
  scandal: Scandal;
  x: number;
  y: number;
}

export interface Scandal {
  id: string;
  name: string;
  desc: string;
  /** applied to the match config */
  oppHp?: number;
  youHp?: number;
  oppPower?: number;
  noHud?: boolean;
  timer?: number;
  hazards?: boolean;
  youMeter?: boolean;
}

export const SCANDALS: Scandal[] = [
  { id: 'budget', name: 'Budget Slashed', desc: "Opponent's budget cut: -20% HP", oppHp: 0.8 },
  { id: 'blackout', name: 'Media Blackout', desc: 'No HUD this fight', noHud: true },
  { id: 'scam', name: 'Scam Exposed', desc: 'Opponent hits 15% harder', oppPower: 1.15 },
  { id: 'snap', name: 'Snap Poll', desc: '30-second rounds', timer: 30 },
  { id: 'bulls', name: 'Bull Season', desc: 'Stage hazards are on', hazards: true },
  { id: 'donor', name: 'Mystery Donor', desc: 'You start with 1 bar of meter', youMeter: true },
  { id: 'injury', name: 'Old Injury', desc: 'You start at 85% HP', youHp: 0.85 },
];

export const CAMPAIGN: CampaignState[] = [
  { name: 'Uttar Paradox', region: 'north', opp: 'bulldozer', stage: 'maidan', votes: 80, scandal: SCANDALS[4], x: 48, y: 30 },
  { name: 'Maha Rashtra Mela', region: 'west', opp: 'ghotala', stage: 'studio', votes: 48, scandal: SCANDALS[2], x: 30, y: 58 },
  { name: 'Bangla Bonanza', region: 'east', opp: 'didi', stage: 'maidan', votes: 42, scandal: SCANDALS[3], x: 74, y: 46 },
  { name: 'Tamil Thunder', region: 'south', opp: 'anchor', stage: 'studio', votes: 39, scandal: SCANDALS[1], x: 48, y: 86 },
  { name: 'Bihari Babu-land', region: 'east', opp: 'votechor', stage: 'tollplaza', votes: 40, scandal: SCANDALS[0], x: 64, y: 38 },
  { name: 'Haryana Highway', region: 'north', opp: 'tolltax', stage: 'tollplaza', votes: 10, scandal: SCANDALS[6], x: 38, y: 24 },
  { name: 'Gujarat Gymkhana', region: 'west', opp: 'bahubali', stage: 'assembly', votes: 26, scandal: SCANDALS[5], x: 22, y: 44 },
  { name: 'Kerala Comrade Coast', region: 'south', opp: 'jumla', stage: 'maidan', votes: 20, scandal: SCANDALS[3], x: 40, y: 92 },
  { name: 'CAPITAL: KURSI KHAS', region: 'centre', opp: 'supremo', stage: 'assembly', votes: 100, scandal: SCANDALS[2], x: 44, y: 18 },
];

export const CAMPAIGN_EVENTS = [
  { text: 'A billionaire offers "no-strings" funding.', funds: 120, votes: -8 },
  { text: 'Your rally goes viral for the wrong reasons.', funds: 0, votes: -5 },
  { text: 'You kiss a baby on camera. Voters swoon.', funds: 0, votes: 10 },
  { text: 'An old tweet resurfaces. IT cell deletes it.', funds: -40, votes: 0 },
  { text: 'You promise free WiFi AND free laddoos.', funds: 0, votes: 14 },
  { text: 'Opposition leader joins your party mid-speech.', funds: 60, votes: 6 },
  { text: 'Your helicopter lands in a pond. Sympathy wave!', funds: -20, votes: 12 },
];

export function campaignEnding(pct: number) {
  if (pct >= 75) return { title: 'LANDSLIDE!', text: 'You win with a brute majority. The Kursi is yours. Your first act: renaming the country after yourself.' };
  if (pct >= 55) return { title: 'MAJORITY GOVERNMENT', text: 'You form the government. Coalition partners demand 14 ministries each. You have 12.' };
  if (pct >= 40) return { title: 'HUNG PARLIAMENT', text: 'Nobody wins. Resort politics begins. Your MLAs are last seen at a luxury pool.' };
  return { title: 'DEPOSIT FORFEITED', text: 'You lose so badly that even your own family voted NOTA. Time to become a TV panelist.' };
}

export interface DailyMod {
  id: string;
  name: string;
  desc: string;
  apply: (cfg: import('../sim/types').MatchCfg) => void;
}

export const DAILY_MODS: DailyMod[] = [
  { id: 'glass', name: 'Glass Jaws', desc: 'Everyone has half health', apply: (c) => c.p.forEach((p) => (p.hpScale = 0.5)) },
  { id: 'rich', name: 'Election Funding', desc: 'Both start with full meter', apply: (c) => c.p.forEach((p) => (p.perks = [...(p.perks ?? []), 'richStart', 'fastMeter'])) },
  { id: 'rage', name: 'Jan Aakrosh', desc: 'Everyone starts enraged', apply: (c) => c.p.forEach((p) => (p.perks = [...(p.perks ?? []), 'angry'])) },
  { id: 'chaos', name: 'Bull Stampede', desc: 'Hazards on, 45s timer', apply: (c) => ((c.hazards = true), (c.timer = 45)) },
  { id: 'vampire', name: 'Blood Money', desc: 'Lifesteal for both', apply: (c) => c.p.forEach((p) => (p.perks = [...(p.perks ?? []), 'lifesteal'])) },
  { id: 'boss', name: 'Supremo Day', desc: 'The opponent is a powered-up Supremo', apply: (c) => ((c.p[1].char = 'supremo'), (c.p[1].hpScale = 1.3)) },
];

export function dailySeed(d = new Date()) {
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

export const RANK_TIERS = [
  { min: 0, name: 'PANCHAYAT', color: '#9a8a6a' },
  { min: 1100, name: 'NAGAR NIGAM', color: '#6aa0d8' },
  { min: 1250, name: 'VIDHAN SABHA', color: '#40c080' },
  { min: 1400, name: 'LOK SABHA', color: '#ffb020' },
  { min: 1600, name: 'PRADHAN NETA', color: '#ff3a3a' },
];

export function tierFor(r: number) {
  let t = RANK_TIERS[0];
  for (const x of RANK_TIERS) if (r >= x.min) t = x;
  return t;
}
