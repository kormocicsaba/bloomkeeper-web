import { LEVELS } from '../data/levels';

const KEY = 'bloomkeeper.v1';

export interface SaveData {
  stars: Record<string, number>;
  /** per-level star flags [finish, par, noLoss, bonus] */
  flags: Record<string, boolean[]>;
  best: Record<string, number>;
  tutorialSkipped: boolean;
  music: boolean;
  sound: boolean;
  seen: string[];
}

const fresh = (): SaveData => ({ stars: {}, flags: {}, best: {}, tutorialSkipped: false, music: true, sound: true, seen: [] });

export const save: SaveData = (() => {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...fresh(), ...JSON.parse(raw) };
  } catch {
    /* private mode etc. */
  }
  return fresh();
})();

export function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* ignore */
  }
}

export function recordResult(id: string, flags: boolean[], time: number) {
  const prev = save.flags[id] ?? [false, false, false, false];
  const merged = prev.map((v, i) => v || flags[i]);
  save.flags[id] = merged;
  save.stars[id] = merged.filter(Boolean).length;
  if (flags[0]) save.best[id] = Math.min(save.best[id] ?? Infinity, Math.round(time));
  persist();
}

export function isUnlocked(id: string): boolean {
  const idx = LEVELS.findIndex((l) => l.id === id);
  if (idx <= 0) return true;
  const lvl = LEVELS[idx];
  if (lvl.world === 1 && lvl.index === 1 && save.tutorialSkipped) return true;
  const prev = LEVELS[idx - 1];
  return (save.stars[prev.id] ?? 0) >= 1;
}

export function totalStars(): number {
  return Object.values(save.stars).reduce((a, b) => a + b, 0);
}

export function resetSave() {
  const f = fresh();
  for (const k of Object.keys(save) as (keyof SaveData)[]) delete (save as Partial<SaveData>)[k];
  Object.assign(save, f);
  persist();
}
