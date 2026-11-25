import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import './styles.css';

import { sfx } from './audio/audio';
import { LEVELS, levelById, nextLevel, type LevelDef } from './data/levels';
import { act } from './game/autoplay';
import { Game, type EndResult } from './game/controller';
import { persist, recordResult, save } from './game/save';
import { GameView } from './render/gameView';
import { renderIcons } from './render/icons';
import { Stage } from './render/scene';
import { Sim } from './sim/sim';
import { h } from './ui/hud';
import { introModal, leave, mapScreen, pauseModal, resultsModal, titleScreen, worldDoneModal } from './ui/screens';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLDivElement;

// ───────────────────────── showcase garden (title backdrop) ─────────────────────────

const SHOWCASE: LevelDef = {
  ...(levelById('1-11') as LevelDef),
  id: 'showcase',
  garden: ['s..c', '....', '....', 's..c'],
  seeds: ['radish', 'lettuce', 'carrot', 'tomato', 'pea'],
  starters: [
    { crop: 'tomato', growth: 0.7 },
    { crop: 'pea', growth: 0.55 },
    { crop: 'carrot', growth: 0.85, soil: 's' },
    { crop: 'lettuce', growth: 0.4, soil: 'c' },
    { crop: 'radish', growth: 0.65 },
    { crop: 'tomato', growth: 0.25 },
  ],
  goals: { bills: [99999] },
  time: null,
  par: null,
  critters: [],
  weeds: undefined,
  boss: undefined,
  companions: ['tortoise'],
  startCoins: 30,
  gentle: true,
  coach: undefined,
};

interface Showcase {
  sim: Sim;
  view: GameView;
  think: number;
}

let stage: Stage;
let show: Showcase | null = null;
let game: Game | null = null;
let screen: HTMLElement | null = null;
let modal: HTMLElement | null = null;
let covered = false; // an opaque screen hides the canvas → skip rendering
let titleEl: HTMLElement | null = null;

function startShowcase() {
  if (show) return;
  const sim = new Sim(SHOWCASE, 7);
  const view = new GameView(stage, sim);
  stage.world.add(view.root);
  stage.setFit(view.fitPoints(), true);
  stage.setOrbit(0.12);
  show = { sim, view, think: 0.6 };
}

function stopShowcase() {
  if (!show) return;
  stage.world.remove(show.view.root);
  show.view.dispose();
  show = null;
  stage.setOrbit(0);
}

function updateShowcase(dt: number) {
  if (!show) return;
  const s = show;
  s.think -= dt;
  if (s.think <= 0) {
    act(s.sim);
    s.think = 0.32 + Math.random() * 0.3;
  }
  s.sim.step(Math.min(dt, 1 / 20));
  s.view.handle(s.sim.drainEvents());
  s.view.update(dt);
}

function titleInsets() {
  if (!titleEl) return;
  const logo = titleEl.querySelector('.logo')!.getBoundingClientRect();
  const foot = titleEl.querySelector('.title-foot')!.getBoundingClientRect();
  stage.setInsets({ top: logo.bottom + 4, bottom: Math.max(0, innerHeight - foot.top + 4), left: 0, right: 0 }, true);
}

// ───────────────────────── transitions ─────────────────────────

const wipe = h('div', 'wipe', '<div class="wipe-leaf"></div>');
document.body.appendChild(wipe);
let wiping = false;

function transition(fn: () => void) {
  if (wiping) return;
  wiping = true;
  wipe.classList.add('on');
  sfx.swoosh();
  setTimeout(() => {
    fn();
    requestAnimationFrame(() => {
      wipe.classList.remove('on');
      setTimeout(() => (wiping = false), 380);
    });
  }, 360);
}

function clearOverlays() {
  if (modal) leave(modal, 0), (modal = null);
  if (screen) screen.remove(), (screen = null);
  titleEl = null;
  covered = false;
}

// ───────────────────────── flow ─────────────────────────

function showTitle() {
  clearOverlays();
  endGame();
  startShowcase();
  titleEl = screen = titleScreen(ui, {
    play: () => {
      const fresh = !save.tutorialSkipped && Object.keys(save.stars).length === 0;
      if (fresh) transition(() => startLevel(LEVELS[0]));
      else transition(showMap);
    },
  });
  requestAnimationFrame(titleInsets);
  setTimeout(titleInsets, 300);
}

function showMap() {
  clearOverlays();
  endGame();
  startShowcase();
  screen = mapScreen(ui, {
    pick: (l) => openIntro(l),
    back: () => transition(showTitle),
  });
  covered = true;
}

function openIntro(l: LevelDef) {
  if (modal) return;
  modal = introModal(ui, l, {
    play: () => transition(() => startLevel(l)),
    back: () => {
      if (modal) leave(modal), (modal = null);
    },
  });
}

function startLevel(l: LevelDef) {
  clearOverlays();
  endGame();
  stopShowcase();
  game = new Game(stage, ui, l, {
    onPause: () => openPause(),
    onEnd: (r) => onEnd(r),
  });
}

function endGame() {
  if (!game) return;
  game.dispose();
  game = null;
}

function openPause() {
  if (!game || modal || game.ended) return;
  const g = game;
  g.paused = true;
  modal = pauseModal(ui, g.sim.level, {
    resume: () => {
      if (modal) leave(modal), (modal = null);
      g.paused = false;
    },
    restart: () => transition(() => startLevel(g.sim.level)),
    map: () => transition(showMap),
  });
}

function onEnd(r: EndResult) {
  if (r.won) recordResult(r.level.id, r.flags, r.time);
  const nxt = nextLevel(r.level.id);
  const finale = r.won && !!r.level.boss && !nxt;
  modal = resultsModal(ui, r, !!nxt || finale, {
    retry: () => transition(() => startLevel(r.level)),
    map: () => transition(showMap),
    next: () => {
      if (finale) {
        if (modal) leave(modal), (modal = null);
        modal = worldDoneModal(ui, { map: () => transition(showMap) });
        sfx.win();
        return;
      }
      if (!nxt) return transition(showMap);
      // tutorial lessons flow straight on; real levels show their briefing first
      if (nxt.world === 0) transition(() => startLevel(nxt));
      else
        transition(() => {
          showMap();
          openIntro(nxt);
        });
    },
  });
}

// ───────────────────────── boot & loop ─────────────────────────

function unlockAudio() {
  sfx.unlock();
  sfx.setSfx(save.sound ? 0.9 : 0);
  sfx.music(save.music);
  window.removeEventListener('pointerdown', unlockAudio, true);
}

function boot() {
  stage = new Stage(canvas);
  try {
    renderIcons();
  } catch (e) {
    console.warn('icon render failed', e);
  }
  sfx.setSfx(save.sound ? 0.9 : 0);
  window.addEventListener('pointerdown', unlockAudio, true);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('resize', () => {
    stage.resize();
    game?.layout(true);
    titleInsets();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) openPause();
  });

  showTitle();

  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (game) game.update(dt);
    else updateShowcase(dt);
    if (!covered || game) stage.render(dt);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  const bootEl = document.getElementById('boot');
  if (bootEl) {
    requestAnimationFrame(() => bootEl.classList.add('done'));
    setTimeout(() => bootEl.remove(), 700);
  }
  persist();
}

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__bk = {
    get game() {
      return game;
    },
    get stage() {
      return stage;
    },
    start: (id: string) => transition(() => startLevel(levelById(id)!)),
    map: () => transition(showMap),
    act,
    save,
  };
}

// let the boot sprout paint once before heavy WebGL work
requestAnimationFrame(() => setTimeout(boot, 30));
