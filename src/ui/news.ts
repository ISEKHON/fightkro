// Satirical fake-news generator: in-fight "Breaking News" director + post-match front page.
import { CHARS } from '../sim/roster';
import type { GameEvent, MatchState } from '../sim/types';

const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

const CHANNELS = ['TRP 24x7', 'Chikh News', 'Jumla Times', 'Godi Live', 'Breaking Bharat', 'Kursi TV'];

const LIVE: Record<string, string[]> = {
  firstBlood: ['{A} DRAWS FIRST BLOOD — OPPOSITION CALLS IT "FOREIGN CONSPIRACY"', 'FIRST HIT BY {A}! {B} DEMANDS JPC PROBE', 'SOURCES: {B}\'S FACE "TEMPORARILY UNAVAILABLE"'],
  combo: ['{N}-HIT COMBO! {A} CALLS IT "MASTERSTROKE"', '{A} LANDS {N} HITS — EXPERTS SAY IT\'S "VIKAS"', 'SHOCKING: {N}-HIT COMBO. {B} BLAMES PREVIOUS GOVERNMENT'],
  wallSplat: ['{B} SPLATTERED ON WALL — WALL DEMANDS COMPENSATION', 'WALL OF DEMOCRACY CRACKS UNDER {B}\'S FACE'],
  wallBreak: ['BREAKING (LITERALLY): FIGHT SPILLS INTO NEW ZONE', 'BUILDING DAMAGED — CONTRACTOR SAYS "WAS ALREADY LIKE THAT"'],
  super: ['{A} UNLEASHES SUPER — MARKETS CRASH', '{A} USES SPECIAL POWERS. EC "LOOKING INTO IT"'],
  xray: ['X-RAY REVEALS {B} HAS NO SPINE — "WE ALWAYS KNEW" SAY VOTERS', 'BONES BROKEN, PROMISES INTACT'],
  parry: ['{A} PARRIES! FIRST TIME A NETA HAS DODGED ANYTHING EXCEPT QUESTIONS', 'PERFECT PARRY BY {A} — "JUST LIKE OUR TAX DEPARTMENT"'],
  comeback: ['COMEBACK! {A} RISES LIKE PETROL PRICES', 'EXIT POLLS WRONG AGAIN — {A} FIGHTS BACK'],
  hazard: ['STRAY BULL STORMS THE ARENA — DECLARED "MOST HONEST PARTICIPANT"', 'VIP CONVOY RUNS THROUGH FIGHT. NOBODY SURPRISED'],
  crowdThrow: ['CROWD THROWS CHAPPAL AT {B} — DEMOCRACY IN ACTION', 'AUDIENCE FEEDBACK DELIVERED VIA FOOTWEAR'],
  guardCrush: ['{B}\'S DEFENCE COLLAPSES FASTER THAN A NEW FLYOVER'],
  burst: ['{A} BREAKS FREE — "POLITICAL VENDETTA" HE SHOUTS'],
  rageCancel: ['{A} GOES FULL RAGE — PRESS CONFERENCE CANCELLED'],
  pickup: ['{A} PICKS UP A {K} — PARLIAMENTARY PROCEDURE FOLLOWED'],
  taunt: ['{A} TAUNTS — SAYS OPPONENT "NOT EVEN A FACTOR"'],
  finishHim: ['KHATAM KARO! NATION HOLDS ITS BREATH', 'FINISH HIM — TRP AT ALL TIME HIGH'],
};

const HEADLINES = [
  '{W} WINS "FRIENDLY DEBATE" — {L} ADMITTED WITH "MINOR INJURIES"',
  'EXIT POLLS PREDICTED {L} WOULD WIN. EXIT POLLS, AS USUAL, WERE WRONG',
  '{W} CLAIMS VICTORY WAS "FOR THE PEOPLE"; PEOPLE UNAVAILABLE FOR COMMENT',
  '{L} TO HOLD PRESS CONFERENCE FROM HOSPITAL BED, BLAMES EVMs',
  'COMMITTEE FORMED TO INVESTIGATE {L}\'S FACE. REPORT EXPECTED BY 2047',
  '{W}\'S SUPPORTERS DISTRIBUTE LADDOOS; {L}\'S SUPPORTERS DISTRIBUTE BANDAGES',
  'BREAKING: {W} DECLARES FIGHT "HISTORIC", "UNPRECEDENTED", "MASTERSTROKE"',
  '{L} JOINS {WP} AFTER LOSS, CITES "CHANGE OF HEART AND JAW"',
];

const SUBS = [
  'Sources say the chai-wala in the stands has demanded compensation for broken cups.',
  'A stray bull that crossed the arena was later offered a party ticket.',
  'The Election Commission has taken "strict note" and gone back to sleep.',
  'Both parties have declared victory. The scoreboard disagrees.',
  'IT cell trends #FightWasFixed within 4 seconds of the final blow.',
  'Prime-time anchors screamed for 6 hours straight; 2 microphones were hospitalised.',
  'Opposition demands a recount of the hits.',
];

export function liveHeadline(e: GameEvent, s: MatchState): string | null {
  const key = e.t === 'comboEnd' ? ((e.n ?? 0) >= 6 ? 'combo' : null) : e.t === 'hazardWarn' ? 'hazard' : e.t;
  if (!key || !LIVE[key]) return null;
  const a = e.s !== undefined && e.s >= 0 ? s.f[e.s] : null;
  const A = a ? CHARS[a.char].name : 'NETA';
  const B = a ? CHARS[s.f[1 - a.side].char].name : 'NETA';
  let target = B;
  if (['wallSplat', 'crowdThrow', 'guardCrush'].includes(key) && e.s !== undefined) target = CHARS[s.f[e.s].char].name;
  return pick(LIVE[key])
    .replace('{A}', key === 'wallSplat' || key === 'guardCrush' || key === 'crowdThrow' ? (e.s !== undefined ? CHARS[s.f[1 - e.s].char].name : A) : A)
    .replace('{B}', target)
    .replace('{N}', String(e.n ?? 0))
    .replace('{K}', (e.k ?? 'chair').toUpperCase());
}

export function channel() {
  return pick(CHANNELS);
}

export function frontPage(s: MatchState): { headline: string; sub: string; paper: string } {
  const w = s.matchWinner >= 0 ? s.f[s.matchWinner] : s.f[0];
  const l = s.f[1 - w.side];
  const W = CHARS[w.char].name;
  const L = CHARS[l.char].name;
  let headline = pick(HEADLINES).replace(/{W}/g, W).replace(/{L}/g, L).replace('{WP}', CHARS[w.char].party.toUpperCase());
  if (s.finisher) {
    const fin = CHARS[w.char].finishers.find((f) => f.id === s.finisher!.id);
    headline = `${W} PERFORMS "${(fin?.name ?? 'FINISHER').toUpperCase()}" ON ${L}. ${s.finisher.kind === 'comedy' ? 'NATION LAUGHS' : 'NATION SHOCKED, TRP DOUBLES'}`;
  } else if (s.matchWinner < 0) headline = `DRAW! BOTH ${W} AND ${L} CLAIM VICTORY, FORM COALITION`;
  return { headline, sub: pick(SUBS), paper: pick(['THE DAILY JUMLA', 'KURSI KHABAR', 'THE VAADA POST', 'SATYA (KABHI KABHI) TIMES']) };
}

export const TICKER = [
  'PETROL ₹420/L • ',
  'SENSEX UP 2 POINTS AFTER NETA PUNCHED • ',
  '15 LAKH TO BE CREDITED "VERY SOON" • ',
  'NEW FLYOVER COLLAPSES BEFORE INAUGURATION RIBBON CUT • ',
  'MONSOON SESSION ADJOURNED DUE TO MONSOON • ',
  'ALL CHARACTERS ARE FICTIONAL. ANY RESEMBLANCE IS YOUR IMAGINATION • ',
];
