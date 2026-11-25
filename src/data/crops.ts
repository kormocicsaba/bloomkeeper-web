export type CropId = 'radish' | 'lettuce' | 'carrot' | 'turnip' | 'tomato' | 'pea' | 'pumpkin';
export type Family = 'Quick' | 'Staple' | 'Giant' | 'Repeater';
export type Habit = 'root' | 'rosette' | 'upright' | 'climb' | 'spread';

export interface CropDef {
  id: CropId;
  name: string;
  plural: string;
  family: Family;
  /** seconds from seed to first ripe veggie */
  grow: number;
  sell: number;
  seed: number;
  harvests: number;
  habit: Habit;
  /** moisture drunk per second (0..1 scale) */
  waterUse: number;
  root?: boolean;
  tall?: boolean;
  climber?: boolean;
  /** UI accent colour */
  color: string;
  blurb: string;
}

export const CROPS: Record<CropId, CropDef> = {
  radish: {
    id: 'radish', name: 'Radish', plural: 'radishes', family: 'Quick', grow: 14, sell: 4, seed: 5, harvests: 3,
    habit: 'root', waterUse: 0.055, root: true, color: '#ef5f7a',
    blurb: 'Quick and cheap. Great for early coins.',
  },
  lettuce: {
    id: 'lettuce', name: 'Lettuce', plural: 'lettuces', family: 'Quick', grow: 16, sell: 5, seed: 6, harvests: 3,
    habit: 'rosette', waterUse: 0.06, color: '#8fd16a',
    blurb: 'A crisp quick crop. Loves a little shade.',
  },
  turnip: {
    id: 'turnip', name: 'Turnip', plural: 'turnips', family: 'Quick', grow: 15, sell: 5, seed: 6, harvests: 3,
    habit: 'root', waterUse: 0.06, root: true, color: '#b07cd8',
    blurb: 'A plump purple root that grows fast.',
  },
  carrot: {
    id: 'carrot', name: 'Carrot', plural: 'carrots', family: 'Staple', grow: 22, sell: 8, seed: 10, harvests: 3,
    habit: 'root', waterUse: 0.065, root: true, color: '#ff9a3c',
    blurb: 'The everyday earner. Grows faster beside radishes.',
  },
  tomato: {
    id: 'tomato', name: 'Tomato', plural: 'tomatoes', family: 'Staple', grow: 25, sell: 10, seed: 13, harvests: 3,
    habit: 'upright', waterUse: 0.075, tall: true, color: '#f2554b',
    blurb: 'A tall staked vine. Shades lettuce, props up peas.',
  },
  pea: {
    id: 'pea', name: 'Pea', plural: 'peas', family: 'Repeater', grow: 15, sell: 4, seed: 8, harvests: 5,
    habit: 'climb', waterUse: 0.055, climber: true, color: '#6cc25a',
    blurb: 'Keeps giving: five pods per plant.',
  },
  pumpkin: {
    id: 'pumpkin', name: 'Pumpkin', plural: 'pumpkins', family: 'Giant', grow: 50, sell: 30, seed: 26, harvests: 2,
    habit: 'spread', waterUse: 0.08, color: '#ff8a2a',
    blurb: 'Slow, but sells for a fortune. Plant it early.',
  },
};

export const CROP_ORDER: CropId[] = ['radish', 'lettuce', 'turnip', 'carrot', 'pea', 'tomato', 'pumpkin'];

/** fraction of growth a plant keeps after each harvest (higher = faster regrow) */
export function regrowStart(c: CropDef): number {
  if (c.family === 'Repeater') return 0.62;
  if (c.family === 'Giant') return 0.35;
  return 0.48;
}
