import type { CropId } from '../data/crops';
import type { CritterId, SoilId } from '../data/world';

export const PITCH = 1.14;

export interface Weed {
  growth: number;
  taps: number;
}

export interface Tile {
  i: number;
  c: number;
  r: number;
  x: number;
  z: number;
  soil: SoilId;
  /** taps left to dig out, 0 = no rock */
  rock: number;
  moisture: number;
  plant: Plant | null;
  weed: Weed | null;
  /** set when a grown weed is next to this tile */
  smothered: boolean;
}

export type PlantMood = 'ok' | 'thirsty' | 'wilt' | 'yellow';

export interface Plant {
  id: number;
  crop: CropId;
  tile: number;
  growth: number;
  harvestsLeft: number;
  /** has produced at least once */
  fruited: boolean;
  ripeHold: number;
  dryTime: number;
  mood: PlantMood;
  age: number;
  trellisBonus: boolean;
  /** synergy results, refreshed every 0.4 s */
  growMult: number;
  drinkMult: number;
  sellMult: number;
  /** a critter is eating this plant */
  eatenBy: number;
}

export type VeggieKind = 'veggie' | 'clock';
export type VeggiePhase = 'pop' | 'roll' | 'lane';

export interface Veggie {
  id: number;
  kind: VeggieKind;
  crop: CropId;
  golden: boolean;
  phase: VeggiePhase;
  t: number;
  age: number;
  x: number;
  y: number;
  z: number;
  sx: number;
  sz: number;
  lx: number;
  lz: number;
  popDur: number;
  rollDur: number;
  laneLeft: number;
  laneMax: number;
  spin: number;
  /** base value incl. soil + synergy, before roll & chain multipliers */
  base: number;
}

export type CritterPhase = 'arrive' | 'eat' | 'flee';

export interface Critter {
  id: number;
  type: CritterId;
  hp: number;
  maxHp: number;
  phase: CritterPhase;
  t: number;
  dur: number;
  x: number;
  y: number;
  z: number;
  fx: number;
  fy: number;
  fz: number;
  tx: number;
  ty: number;
  tz: number;
  target: number;
  eatT: number;
  eatTime: number;
  hitFlash: number;
  fromBoss: boolean;
}

export type BossPhase = 'enter' | 'high' | 'swoop' | 'perch' | 'rise' | 'defeated';

export interface Boss {
  kind: 'crowKing';
  hp: number;
  maxHp: number;
  phase: BossPhase;
  t: number;
  dur: number;
  x: number;
  y: number;
  z: number;
  fx: number;
  fy: number;
  fz: number;
  tx: number;
  ty: number;
  tz: number;
  angle: number;
  hitFlash: number;
  plantsLost: number;
}

export interface ComboLink {
  a: number;
  b: number;
  key: ComboKey;
}

export type ComboKey = 'radishCarrot' | 'coolLettuce' | 'pumpkinMulch' | 'trellis' | 'rootCellar';

export type LoseReason = 'time' | 'overrun';
export type FailReason = 'coins' | 'can' | 'notThirsty' | 'blocked' | 'noSeed';

export type SimEvent =
  | { type: 'plant'; tile: number; crop: CropId; cost: number }
  | { type: 'water'; tile: number }
  | { type: 'pop'; id: number; tile: number }
  | { type: 'ripe'; tile: number }
  | {
      type: 'catch'; id: number; x: number; y: number; z: number; coins: number; perfect: boolean;
      chain: number; golden: boolean; crop: CropId; kind: VeggieKind; by: 'player' | 'tortoise'; mult: number;
    }
  | { type: 'miss'; id: number; x: number; z: number }
  | { type: 'plantDone'; tile: number; crop: CropId }
  | { type: 'plantLost'; tile: number; crop: CropId; cause: 'rot' | 'crow' | 'rabbit' }
  | { type: 'mood'; tile: number; mood: PlantMood }
  | { type: 'critterSpawn'; id: number; critter: CritterId }
  | { type: 'critterHit'; id: number; hp: number; x: number; y: number; z: number }
  | { type: 'critterFlee'; id: number; shooed: boolean }
  | { type: 'critterGone'; id: number }
  | { type: 'weedSprout'; tile: number }
  | { type: 'weedGrown'; tile: number }
  | { type: 'weedTap'; tile: number }
  | { type: 'weedPulled'; tile: number; cost: number }
  | { type: 'rockHit'; tile: number; left: number }
  | { type: 'pay'; index: number; amount: number }
  | { type: 'orderStep'; count: number; need: number }
  | { type: 'combo'; key: ComboKey; tiles: number[] }
  | { type: 'goalsMet' }
  | { type: 'bossStart' }
  | { type: 'bossPhase'; phase: BossPhase }
  | { type: 'bossHit'; hp: number }
  | { type: 'bossBlocked' }
  | { type: 'bossCall' }
  | { type: 'won' }
  | { type: 'lost'; reason: LoseReason }
  | { type: 'clockBonus'; x: number; z: number }
  | { type: 'dash'; count: number }
  | { type: 'fail'; reason: FailReason; tile?: number }
  | { type: 'canRefill'; charges: number };

export const COMBO_NAMES: Record<ComboKey, string> = {
  radishCarrot: 'Radish + Carrot',
  coolLettuce: 'Cool Lettuce',
  pumpkinMulch: 'Pumpkin Mulch',
  trellis: 'Trellis Vines',
  rootCellar: 'Root Cellar',
};

export const COMBO_BRIEFS: Record<ComboKey, string> = {
  radishCarrot: 'A carrot beside a radish grows 20% faster.',
  coolLettuce: 'Lettuce beside a tall tomato drinks 30% less.',
  pumpkinMulch: 'Plots around a pumpkin dry out 20% slower.',
  trellis: 'A pea beside a tomato climbs for one extra harvest.',
  rootCellar: 'Three or more roots together all sell 15% more.',
};
