import type { CropId } from './crops';
import type { CompanionId, CritterId } from './world';
import { TIMES } from './times';

export type RingTarget = 'veggie' | 'emptyPlot' | 'thirstyPlot' | 'bill' | 'critter';
export type CoachUntil = 'next' | 'catch' | 'plant' | 'water' | 'pay' | 'goal' | 'hush';

export interface CoachStep {
  say: string;
  until: CoachUntil;
  count?: number;
  ring?: RingTarget;
  /** freeze the garden while the ringed target exists */
  freeze?: boolean;
}

export interface CritterWave {
  type: CritterId;
  firstAt: number;
  interval: number;
  max: number;
}

export interface LevelDef {
  id: string;
  world: number;
  index: number;
  title: string;
  intro: string;
  /** rows from back (top) to front. '.' loam  's' sandy  'c' clay  'r' rock  '#' no plot */
  garden: string[];
  seeds: CropId[];
  starters: { crop: CropId; growth?: number; soil?: 's' | 'c'; moisture?: number }[];
  goals: { bills?: number[]; order?: { crop: CropId; count: number }; perfect?: number };
  /** seconds, null = no clock */
  time: number | null;
  /** target finishing time in seconds */
  par: number | null;
  critters?: CritterWave[];
  weeds?: { firstAt: number; interval: number };
  companions?: CompanionId[];
  boss?: 'crowKing';
  bonus: 'perfect5' | 'chain5';
  startCoins?: number;
  /** no rot, veggies never vanish */
  gentle?: boolean;
  /** soil never dries */
  noThirst?: boolean;
  coach?: CoachStep[];
  bossLine?: string;
}

const half = 0.5;

export const LEVELS: LevelDef[] = [
  // ───────────── World 0 · Granny's tutorial ─────────────
  {
    id: '0-1', world: 0, index: 1, title: 'Catch!',
    intro: 'Ripe veggies pop off and roll toward the cart. Catch them before they stop!',
    garden: ['...', '...'], seeds: [],
    starters: [{ crop: 'radish', growth: 0.86 }, { crop: 'radish', growth: 0.7 }, { crop: 'radish', growth: 0.55 }],
    goals: { order: { crop: 'radish', count: 6 } }, time: null, par: null, bonus: 'perfect5',
    gentle: true, noThirst: true,
    coach: [
      { say: 'Hello, dear! Welcome to my little garden. Ripe veggies pop right off the plant.', until: 'next' },
      { say: 'Here comes one! Tap the radish while it’s still rolling.', until: 'catch', ring: 'veggie', freeze: true },
      { say: 'Lovely catch! Catching while it rolls is a Perfect — worth more coins.', until: 'next' },
      { say: 'Now catch six radishes for Granny’s soup.', until: 'goal' },
    ],
  },
  {
    id: '0-2', world: 0, index: 2, title: 'Plant a Seed',
    intro: 'Empty plots earn nothing. Spend your coins on seeds!',
    garden: ['...', '...'], seeds: ['radish'], startCoins: 10,
    starters: [{ crop: 'radish', growth: 0.75 }],
    goals: { order: { crop: 'radish', count: 8 } }, time: null, par: null, bonus: 'perfect5',
    gentle: true, noThirst: true,
    coach: [
      { say: 'I’ve left you ten coins. A radish seed costs five.', until: 'next' },
      { say: 'Tap an empty plot to plant a radish.', until: 'plant', ring: 'emptyPlot', freeze: true },
      { say: 'Wonderful! Plant one more.', until: 'plant', ring: 'emptyPlot', freeze: true },
      { say: 'Catch radishes to earn coins, and keep every plot busy. Gather eight!', until: 'goal' },
    ],
  },
  {
    id: '0-3', world: 0, index: 3, title: 'Thirsty Plants',
    intro: 'Plants drink. Dry soil makes them stop growing — and later wilt.',
    garden: ['...', '...'], seeds: ['radish'],
    starters: [{ crop: 'radish', growth: 0.5, moisture: 0.12 }, { crop: 'radish', growth: 0.4, moisture: 0.5 }],
    goals: { order: { crop: 'radish', count: 8 } }, time: null, par: null, bonus: 'perfect5',
    gentle: true,
    coach: [
      { say: 'Oh my, this one is parched! Tap a growing plant to water it.', until: 'water', ring: 'thirstyPlot', freeze: true },
      { say: 'The can holds five splashes and refills by itself. Watch the droplets!', until: 'next' },
      { say: 'Keep the soil dark and wet, plant the empty plots, and catch eight radishes.', until: 'goal' },
    ],
  },
  {
    id: '0-4', world: 0, index: 4, title: 'Granny’s Bills',
    intro: 'Coins pay Granny’s bills. Pay each one in order.',
    garden: ['...', '...', '...'], seeds: ['radish', 'lettuce'],
    starters: [{ crop: 'radish', growth: half }, { crop: 'lettuce', growth: half }],
    goals: { bills: [10, 15] }, time: null, par: null, bonus: 'perfect5',
    gentle: true,
    coach: [
      { say: 'The postman brought my bills. Earn coins, then tap a bill to pay it.', until: 'next' },
      { say: 'You have enough! Tap the glowing bill to pay it.', until: 'pay', ring: 'bill', freeze: true },
      { say: 'Paying early frees nothing up — but seeds earn more coins. You choose!', until: 'goal' },
    ],
  },
  {
    id: '0-5', world: 0, index: 5, title: 'Beat the Clock',
    intro: 'Every real garden job has a clock. Finish fast for extra stars!',
    garden: ['...', '...', '...'], seeds: ['radish', 'lettuce'],
    starters: [{ crop: 'radish' }, { crop: 'lettuce' }],
    goals: { bills: [10, 14, 18] }, time: 120, par: 82, bonus: 'perfect5',
    coach: [
      { say: 'Now plants can rot and veggies can roll away. Pay all three bills before the clock runs out!', until: 'next' },
    ],
  },

  // ───────────── World 1 · Spring Garden ─────────────
  {
    id: '1-1', world: 1, index: 1, title: 'First Sprouts',
    intro: 'Granny’s spring garden needs you. Radishes are quick money!',
    garden: ['...', '...', '...'], seeds: ['radish'],
    starters: [{ crop: 'radish' }, { crop: 'radish' }],
    goals: { bills: [12, 18, 24] }, time: 0, par: 0, bonus: 'perfect5',
  },
  {
    id: '1-2', world: 1, index: 2, title: 'Lettuce Leaves',
    intro: 'Lettuce sells for a little more. Mix it in!',
    garden: ['...', '...', '...'], seeds: ['radish', 'lettuce'],
    starters: [{ crop: 'radish' }, { crop: 'lettuce' }],
    goals: { bills: [16, 22, 30] }, time: 0, par: 0, bonus: 'perfect5',
  },
  {
    id: '1-3', world: 1, index: 3, title: 'Caw Caw!',
    intro: 'A crow has spotted your sprouts. Tap it to hush it away!',
    garden: ['....', '....', '....'], seeds: ['radish', 'lettuce'],
    starters: [{ crop: 'radish' }, { crop: 'lettuce' }],
    goals: { bills: [18, 28, 36] }, time: 0, par: 0, bonus: 'chain5',
    critters: [{ type: 'crow', firstAt: 14, interval: 15, max: 1 }],
  },
  {
    id: '1-4', world: 1, index: 4, title: 'Carrot Patch',
    intro: 'Carrots earn well — and grow faster beside a radish.',
    garden: ['....', '....', '....'], seeds: ['radish', 'lettuce', 'carrot'],
    starters: [{ crop: 'carrot' }, { crop: 'radish' }],
    goals: { bills: [22, 34, 46] }, time: 0, par: 0, bonus: 'perfect5',
    critters: [{ type: 'crow', firstAt: 16, interval: 15, max: 1 }],
  },
  {
    id: '1-5', world: 1, index: 5, title: 'Sandy Corner',
    intro: 'Sandy soil drains fast, but carrots and radishes sell for 50% more there.',
    garden: ['ss..', 'ss..', 'ss..'], seeds: ['radish', 'lettuce', 'carrot'],
    starters: [{ crop: 'carrot', soil: 's' }, { crop: 'lettuce' }],
    goals: { bills: [24, 36, 48] }, time: 0, par: 0, bonus: 'perfect5',
    critters: [{ type: 'crow', firstAt: 15, interval: 14, max: 1 }],
  },
  {
    id: '1-6', world: 1, index: 6, title: 'Market Order',
    intro: 'The market wants carrots! Every carrot you catch fills the order.',
    garden: ['s..s', '....', 's..s'], seeds: ['radish', 'carrot'],
    starters: [{ crop: 'carrot' }, { crop: 'radish' }],
    goals: { bills: [22, 30], order: { crop: 'carrot', count: 6 } }, time: 0, par: 0, bonus: 'chain5',
    critters: [{ type: 'crow', firstAt: 15, interval: 14, max: 1 }],
  },
  {
    id: '1-7', world: 1, index: 7, title: 'Turnip Time',
    intro: 'Plant three roots together for a Root Cellar: they all sell 15% more.',
    garden: ['....', '....', '....'], seeds: ['radish', 'turnip', 'carrot'],
    starters: [{ crop: 'turnip' }, { crop: 'radish' }],
    goals: { bills: [24, 36, 48] }, time: 0, par: 0, bonus: 'perfect5',
    critters: [{ type: 'crow', firstAt: 14, interval: 13, max: 1 }],
  },
  {
    id: '1-8', world: 1, index: 8, title: 'Clay Beds',
    intro: 'Clay holds water, but slows most plants. Lettuce loves it!',
    garden: ['..cc', '..cc', '..cc'], seeds: ['radish', 'lettuce', 'carrot'],
    starters: [{ crop: 'lettuce', soil: 'c' }, { crop: 'carrot' }],
    goals: { bills: [28, 40, 52] }, time: 0, par: 0, bonus: 'chain5',
    critters: [{ type: 'crow', firstAt: 14, interval: 13, max: 1 }],
  },
  {
    id: '1-9', world: 1, index: 9, title: 'Tomato Stakes',
    intro: 'Tall tomatoes shade their neighbours — lettuce beside one drinks less.',
    garden: ['....', '....', '....', '....'], seeds: ['radish', 'lettuce', 'carrot', 'tomato'],
    starters: [{ crop: 'tomato' }, { crop: 'lettuce' }],
    goals: { bills: [30, 46, 60] }, time: 0, par: 0, bonus: 'perfect5',
    critters: [{ type: 'crow', firstAt: 14, interval: 13, max: 1 }],
  },
  {
    id: '1-10', world: 1, index: 10, title: 'Bunny Trouble',
    intro: 'A rabbit nibbles young plants. Tap it a few times to send it home.',
    garden: ['s..s', '....', '....', 'c..c'], seeds: ['radish', 'lettuce', 'carrot', 'tomato'],
    starters: [{ crop: 'carrot' }, { crop: 'tomato' }],
    goals: { bills: [30, 46, 60] }, time: 0, par: 0, bonus: 'chain5',
    critters: [{ type: 'rabbit', firstAt: 14, interval: 16, max: 1 }],
  },
  {
    id: '1-11', world: 1, index: 11, title: 'Pea Trellis',
    intro: 'Peas give five pods each. Beside a tomato they climb for one more!',
    garden: ['....', '....', '....', '....'], seeds: ['radish', 'pea', 'carrot', 'tomato'],
    starters: [{ crop: 'pea' }, { crop: 'tomato' }],
    goals: { bills: [34, 48, 64] }, time: 0, par: 0, bonus: 'perfect5',
    critters: [{ type: 'crow', firstAt: 14, interval: 16, max: 1 }, { type: 'rabbit', firstAt: 30, interval: 22, max: 1 }],
  },
  {
    id: '1-12', world: 1, index: 12, title: 'Slow and Steady',
    intro: 'Meet the Tortoise! It saves veggies about to vanish. Shell Dash sweeps the lane.',
    garden: ['....', '.ss.', '....', '....'], seeds: ['radish', 'lettuce', 'carrot', 'pea', 'tomato'],
    starters: [{ crop: 'pea' }, { crop: 'carrot' }],
    goals: { bills: [36, 52, 66], order: { crop: 'pea', count: 8 } }, time: 0, par: 0, bonus: 'chain5',
    companions: ['tortoise'],
    critters: [{ type: 'crow', firstAt: 12, interval: 14, max: 1 }, { type: 'rabbit', firstAt: 28, interval: 20, max: 1 }],
  },
  {
    id: '1-13', world: 1, index: 13, title: 'Rocky Ground',
    intro: 'Rocks block plots. Tap a rock three times to dig it out.',
    garden: ['.r..', '..r.', 'r...', '...r'], seeds: ['radish', 'turnip', 'carrot', 'tomato'],
    starters: [{ crop: 'turnip' }, { crop: 'carrot' }],
    goals: { bills: [36, 52, 66] }, time: 0, par: 0, bonus: 'perfect5',
    companions: ['tortoise'],
    critters: [{ type: 'crow', firstAt: 12, interval: 14, max: 1 }, { type: 'rabbit', firstAt: 26, interval: 20, max: 1 }],
  },
  {
    id: '1-14', world: 1, index: 14, title: 'Weed Season',
    intro: 'Weeds sprout on empty plots and smother their neighbours. Keep the garden full!',
    garden: ['s..s', '....', '.cc.', '....'], seeds: ['radish', 'lettuce', 'carrot', 'pea', 'tomato'],
    starters: [{ crop: 'tomato' }, { crop: 'pea' }],
    goals: { bills: [40, 54, 70] }, time: 0, par: 0, bonus: 'chain5',
    companions: ['tortoise'],
    weeds: { firstAt: 10, interval: 9 },
    critters: [{ type: 'crow', firstAt: 14, interval: 15, max: 1 }, { type: 'rabbit', firstAt: 30, interval: 22, max: 1 }],
  },
  {
    id: '1-15', world: 1, index: 15, title: 'The Great Pumpkin',
    intro: 'Pumpkins are slow but sell for 30! Plant them early, and they keep their neighbours moist.',
    garden: ['c..c', '....', '....', 'c..c'], seeds: ['radish', 'lettuce', 'carrot', 'tomato', 'pumpkin'],
    starters: [{ crop: 'pumpkin', soil: 'c', growth: 0.55 }, { crop: 'radish' }],
    goals: { bills: [46, 68, 90] }, time: 0, par: 0, bonus: 'perfect5',
    companions: ['tortoise'],
    weeds: { firstAt: 14, interval: 11 },
    critters: [{ type: 'crow', firstAt: 12, interval: 13, max: 2 }, { type: 'rabbit', firstAt: 26, interval: 20, max: 1 }],
  },
  {
    id: '1-16', world: 1, index: 16, title: 'The Crow King',
    intro: 'Pay the bills, then defend the garden. The Crow King wants it all!',
    bossLine: 'Boss: the Crow King flies high, then perches to rest — tap him only while he perches. Lose 3 plants and he takes the garden.',
    garden: ['s..s', '....', '....', '.cc.'], seeds: ['radish', 'lettuce', 'carrot', 'pea', 'tomato'],
    starters: [{ crop: 'tomato' }, { crop: 'carrot' }],
    goals: { bills: [36, 52, 66] }, time: 0, par: 0, bonus: 'chain5',
    companions: ['tortoise'],
    boss: 'crowKing',
    weeds: { firstAt: 16, interval: 12 },
    critters: [{ type: 'crow', firstAt: 12, interval: 13, max: 1 }, { type: 'rabbit', firstAt: 24, interval: 20, max: 1 }],
  },
];

for (const l of LEVELS) {
  const t = TIMES[l.id];
  if (t && l.time !== null) {
    l.time = t[0];
    l.par = t[1];
  }
}

export function levelById(id: string): LevelDef | undefined {
  return LEVELS.find((l) => l.id === id);
}

export function nextLevel(id: string): LevelDef | undefined {
  const i = LEVELS.findIndex((l) => l.id === id);
  return i >= 0 ? LEVELS[i + 1] : undefined;
}
