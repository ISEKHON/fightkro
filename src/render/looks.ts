// Visual identity of every (fictional) fighter. All characters are original caricature archetypes.
export interface Look {
  skin: number;
  hair: number;
  hairStyle: 'bald' | 'side' | 'puff' | 'bun' | 'spiky' | 'combover' | 'slick' | 'mullet';
  mustache: 'none' | 'thick' | 'handlebar' | 'pencil' | 'walrus';
  beard: 'none' | 'stubble' | 'full' | 'goatee';
  glasses: 'none' | 'round' | 'shades' | 'square';
  brows: number;
  top: number;
  topStyle: 'kurta' | 'suit' | 'saree' | 'singlet' | 'robe' | 'safari';
  jacket: number | null;
  bottom: number;
  bottomStyle: 'pyjama' | 'dhoti' | 'pants';
  shoes: number;
  belly: number;
  build: number;
  headScale: number;
  accessory: ('goldchain' | 'hardhat' | 'mic' | 'moneybag' | 'sash' | 'garland' | 'crown' | 'cap' | 'bindi' | 'lathi' | 'pagdi' | 'watch' | 'pen' | 'bluetooth' | 'shawl')[];
  accent: number;
  partyColor: number;
  partySymbol: string;
  voice: { pitch: number; rate: number };
}

export const LOOKS: Record<string, Look> = {
  jumla: {
    skin: 0xc68a5a, hair: 0x222222, hairStyle: 'combover', mustache: 'handlebar', beard: 'none', glasses: 'none', brows: 0x1a1a1a,
    top: 0xff8a1f, topStyle: 'kurta', jacket: 0x3a3a52, bottom: 0xf3ecdc, bottomStyle: 'pyjama', shoes: 0x2b1a10,
    belly: 1.05, build: 1.0, headScale: 1.3, accessory: ['garland', 'watch'], accent: 0xffd23a, partyColor: 0xff8a1f, partySymbol: '📣', voice: { pitch: 0.9, rate: 1.05 },
  },
  ghotala: {
    skin: 0xd6a06e, hair: 0x101010, hairStyle: 'slick', mustache: 'pencil', beard: 'none', glasses: 'shades', brows: 0x111111,
    top: 0xf5f5f5, topStyle: 'safari', jacket: 0x0e5b3a, bottom: 0x0e5b3a, bottomStyle: 'pants', shoes: 0x7a4a12,
    belly: 1.45, build: 1.12, headScale: 1.25, accessory: ['goldchain', 'moneybag', 'watch'], accent: 0xffd700, partyColor: 0x17a35c, partySymbol: '💰', voice: { pitch: 0.75, rate: 0.95 },
  },
  bulldozer: {
    skin: 0xb5764a, hair: 0x2a2a2a, hairStyle: 'spiky', mustache: 'thick', beard: 'stubble', glasses: 'none', brows: 0x222222,
    top: 0xffc21a, topStyle: 'singlet', jacket: 0xff6a00, bottom: 0x4a4a4a, bottomStyle: 'pants', shoes: 0x3b2a1a,
    belly: 1.0, build: 1.18, headScale: 1.2, accessory: ['hardhat'], accent: 0xffc21a, partyColor: 0xffc21a, partySymbol: '🚜', voice: { pitch: 0.7, rate: 1.0 },
  },
  votechor: {
    skin: 0xc08a60, hair: 0x0a0a0a, hairStyle: 'side', mustache: 'pencil', beard: 'goatee', glasses: 'shades', brows: 0x0a0a0a,
    top: 0x2a2a35, topStyle: 'suit', jacket: 0x1b1b24, bottom: 0x1b1b24, bottomStyle: 'pants', shoes: 0x0a0a0a,
    belly: 0.92, build: 0.92, headScale: 1.25, accessory: ['bluetooth', 'pen'], accent: 0x8a5cff, partyColor: 0x8a5cff, partySymbol: '🗳️', voice: { pitch: 1.1, rate: 1.2 },
  },
  didi: {
    skin: 0xc48c62, hair: 0x1a1a1a, hairStyle: 'bun', mustache: 'none', beard: 'none', glasses: 'none', brows: 0x1a1a1a,
    top: 0xffffff, topStyle: 'saree', jacket: null, bottom: 0xffffff, bottomStyle: 'dhoti', shoes: 0xb01a1a,
    belly: 1.0, build: 0.95, headScale: 1.3, accessory: ['bindi', 'shawl'], accent: 0xe8173b, partyColor: 0xe8173b, partySymbol: '🧨', voice: { pitch: 1.35, rate: 1.25 },
  },
  bahubali: {
    skin: 0xa86c40, hair: 0x111111, hairStyle: 'mullet', mustache: 'walrus', beard: 'full', glasses: 'none', brows: 0x111111,
    top: 0xffffff, topStyle: 'kurta', jacket: 0x7a1010, bottom: 0xffffff, bottomStyle: 'dhoti', shoes: 0x5a3a1a,
    belly: 1.25, build: 1.3, headScale: 1.2, accessory: ['goldchain', 'pagdi'], accent: 0xb01818, partyColor: 0xb01818, partySymbol: '💪', voice: { pitch: 0.6, rate: 0.9 },
  },
  tolltax: {
    skin: 0xb07a50, hair: 0xd8d8d8, hairStyle: 'bald', mustache: 'walrus', beard: 'none', glasses: 'square', brows: 0xdddddd,
    top: 0xffffff, topStyle: 'kurta', jacket: 0x1f6fd1, bottom: 0xffffff, bottomStyle: 'dhoti', shoes: 0x3a2a1a,
    belly: 1.2, build: 1.0, headScale: 1.3, accessory: ['pagdi', 'lathi'], accent: 0x1f6fd1, partyColor: 0x1f6fd1, partySymbol: '🚧', voice: { pitch: 0.8, rate: 0.9 },
  },
  anchor: {
    skin: 0xd09a70, hair: 0x2a1a10, hairStyle: 'puff', mustache: 'none', beard: 'stubble', glasses: 'square', brows: 0x2a1a10,
    top: 0xffffff, topStyle: 'suit', jacket: 0x1a2a6a, bottom: 0x1a1a2a, bottomStyle: 'pants', shoes: 0x0a0a0a,
    belly: 0.95, build: 0.98, headScale: 1.35, accessory: ['mic'], accent: 0xff2a2a, partyColor: 0xff2a2a, partySymbol: '📺', voice: { pitch: 1.0, rate: 1.4 },
  },
  supremo: {
    skin: 0xe0b08a, hair: 0xf2f2f2, hairStyle: 'side', mustache: 'walrus', beard: 'full', glasses: 'round', brows: 0xf0f0f0,
    top: 0xffd700, topStyle: 'robe', jacket: 0x5a0a6a, bottom: 0xffd700, bottomStyle: 'dhoti', shoes: 0xffd700,
    belly: 1.3, build: 1.35, headScale: 1.25, accessory: ['crown', 'shawl', 'garland'], accent: 0xffd700, partyColor: 0x5a0a6a, partySymbol: '👑', voice: { pitch: 0.5, rate: 0.8 },
  },
};

export function lookFor(id: string): Look {
  return LOOKS[id] ?? LOOKS.jumla;
}

export function setLook(id: string, look: Look) {
  LOOKS[id] = look;
}

export const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
