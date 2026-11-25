import { icon } from '../render/icons';
import { h, pulse } from './hud';
import { ICON } from './svg';

/**
 * Granny's speech bubble (typewriter text) plus the tutorial spotlight ring and pointing hand.
 */
export class CoachUi {
  readonly el: HTMLDivElement;
  private text: HTMLDivElement;
  private hint: HTMLDivElement;
  private scrim: HTMLDivElement;
  private ring: HTMLDivElement;
  private full = '';
  private shown = 0;
  private typing = false;
  private onTap: (() => void) | null = null;
  visible = false;

  constructor(parent: HTMLElement) {
    this.scrim = h('div', 'coach-scrim');
    this.scrim.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.tap();
    });
    parent.appendChild(this.scrim);

    this.ring = h('div', 'coach-ring', `<div class="halo"></div><div class="hand">${ICON.hand}</div>`);
    parent.appendChild(this.ring);

    this.el = h('div', 'coach');
    this.el.innerHTML = `<div class="portrait"><img src="${icon('granny')}" alt=""></div>`;
    const bubble = h('div', 'bubble');
    bubble.appendChild(h('div', 'who', 'Granny Rose'));
    this.text = h('div', 'say');
    bubble.appendChild(this.text);
    this.hint = h('div', 'hint', 'Tap to continue');
    bubble.appendChild(this.hint);
    this.el.appendChild(bubble);
    this.el.addEventListener('pointerdown', (e) => {
      if (!this.onTap && !this.typing) return;
      e.preventDefault();
      this.tap();
    });
    parent.appendChild(this.el);
  }

  /** onTap set ⇒ modal "tap to continue" step with a scrim */
  say(text: string, onTap: (() => void) | null = null) {
    this.full = text;
    this.shown = 0;
    this.typing = true;
    this.text.textContent = '';
    this.onTap = onTap;
    this.el.classList.toggle('modal', !!onTap);
    this.scrim.classList.toggle('on', !!onTap);
    this.hint.classList.remove('on');
    if (!this.visible) {
      this.visible = true;
      pulse(this.el, 'show');
    } else pulse(this.el, 'nudge');
  }

  hide() {
    if (!this.visible) return;
    this.visible = false;
    this.onTap = null;
    this.el.classList.remove('show', 'nudge', 'modal');
    this.scrim.classList.remove('on');
  }

  private tap() {
    if (this.typing) {
      this.shown = this.full.length;
      return;
    }
    const cb = this.onTap;
    if (cb) {
      this.onTap = null;
      cb();
    }
  }

  ringAt(x: number, y: number, r: number) {
    this.ring.classList.add('on');
    this.ring.style.transform = `translate(${x}px, ${y}px)`;
    this.ring.style.setProperty('--r', `${Math.max(30, r)}px`);
  }

  hideRing() {
    this.ring.classList.remove('on');
  }

  update(dt: number) {
    if (this.typing) {
      this.shown = Math.min(this.full.length, this.shown + dt * 52);
      this.text.textContent = this.full.slice(0, Math.floor(this.shown));
      if (this.shown >= this.full.length) {
        this.typing = false;
        if (this.onTap) this.hint.classList.add('on');
      }
    }
  }

  dispose() {
    this.el.remove();
    this.scrim.remove();
    this.ring.remove();
  }
}
