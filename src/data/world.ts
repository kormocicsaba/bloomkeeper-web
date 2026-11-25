import type { CropId } from './crops';

export type SoilId = 'loam' | 'sandy' | 'clay';
export type CritterId = 'crow' | 'rabbit';
export type CompanionId = 'tortoise';

export interface SoilDef {
  id: SoilId;
  name: string;
  /** moisture drain multiplier */
  drain: number;
  /** growth multiplier for non-friends */
  growth: number;
  friends: CropId[];
  friendGrowth: number;
  friendSell: number;
  downside: string;
  bonus: string;
}

export const SOILS: Record<SoilId, SoilDef> = {
  loam: {
    id: 'loam', name: 'Garden Soil', drain: 1, growth: 1, friends: [], friendGrowth: 1, friendSell: 1,
    downside: 'No downside', bonus: 'Good at everything, best at nothing.',
  },
  sandy: {
    id: 'sandy', name: 'Sandy Soil', drain: 1.6, growth: 1, friends: ['carrot', 'radish'], friendGrowth: 1, friendSell: 1.5,
    downside: 'Drains 1.6× faster', bonus: 'Carrots & radishes sell for 50% more.',
  },
  clay: {
    id: 'clay', name: 'Clay Soil', drain: 0.75, growth: 0.85, friends: ['lettuce', 'pumpkin'], friendGrowth: 1.15, friendSell: 1,
    downside: 'Most plants grow 15% slower', bonus: 'Holds water. Lettuce & pumpkin grow 15% faster.',
  },
};

export interface CritterDef {
  id: CritterId;
  name: string;
  hp: number;
  tool: 'Hush' | 'Slap' | 'Spray';
  /** seconds on a plant before it is lost */
  eatTime: number;
  blurb: string;
}

export const CRITTERS: Record<CritterId, CritterDef> = {
  crow: { id: 'crow', name: 'Crow', hp: 3, tool: 'Hush', eatTime: 5, blurb: 'Dives on plants and pecks them. Tap to hush it away!' },
  rabbit: { id: 'rabbit', name: 'Rabbit', hp: 4, tool: 'Hush', eatTime: 5.5, blurb: 'Hops in and nibbles young plants. Tap it before it munches!' },
};

/** damage per tap at tool level 1 */
export const TOOL_DAMAGE = 1.5;

export interface CompanionDef {
  id: CompanionId;
  name: string;
  ability: string;
  cooldown: number;
  blurb: string;
}

export const COMPANIONS: Record<CompanionId, CompanionDef> = {
  tortoise: {
    id: 'tortoise', name: 'Tortoise', ability: 'Shell Dash', cooldown: 24,
    blurb: 'Saves veggies about to vanish. Shell Dash sweeps the whole lane.',
  },
};
