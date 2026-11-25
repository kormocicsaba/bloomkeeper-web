/** Inline SVG icon set — rounded, chunky, cozy. */
export const ICON = {
  pause: `<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4.2" height="14" rx="1.8"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.8"/></svg>`,
  play: `<svg viewBox="0 0 24 24"><path d="M8 5.6c0-1.1 1.2-1.8 2.2-1.2l9 6.4c.9.6.9 1.9 0 2.5l-9 6.4c-1 .7-2.2 0-2.2-1.2z"/></svg>`,
  retry: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5"/><path d="M4 4.5v4.5h4.5"/></svg>`,
  map: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6z"/><path d="M9 4v14M15 6v14"/></svg>`,
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`,
  lock: `<svg viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="3"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" stroke-width="2.6"/></svg>`,
  star: `<svg viewBox="0 0 24 24"><path d="M12 2.8l2.7 5.6 6.1.8c.8.1 1.1 1.1.5 1.6l-4.5 4.2 1.1 6c.1.8-.7 1.4-1.4 1L12 19.1 6.5 22c-.7.4-1.6-.2-1.4-1l1.1-6-4.5-4.2c-.6-.5-.3-1.5.5-1.6l6.1-.8z"/></svg>`,
  drop: `<svg viewBox="0 0 24 24"><path d="M12 2.5c3.6 4.6 6.5 8.3 6.5 12a6.5 6.5 0 0 1-13 0c0-3.7 2.9-7.4 6.5-12z"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>`,
  music: `<svg viewBox="0 0 24 24"><path d="M9 17.5V6.2c0-.6.4-1.1 1-1.2l8-1.7c.8-.2 1.5.4 1.5 1.2V15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><ellipse cx="6.6" cy="17.6" rx="3" ry="2.5"/><ellipse cx="17" cy="15.3" rx="3" ry="2.5"/></svg>`,
  sound: `<svg viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`,
  mail: `<svg viewBox="0 0 24 24"><rect x="3" y="5.5" width="18" height="13" rx="2.6"/><path d="M4 7.5l8 5.5 8-5.5" fill="none" stroke="#fff6e5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  sparkle: `<svg viewBox="0 0 24 24"><path d="M12 2c.6 4.6 2.4 6.9 7 8-4.6 1.1-6.4 3.4-7 8-.6-4.6-2.4-6.9-7-8 4.6-1.1 6.4-3.4 7-8z"/></svg>`,
  leaf: `<svg viewBox="0 0 24 24"><path d="M5 19c0-9 5-14 15-14 0 10-5 15-14 15"/><path d="M5 19c3-4 6-7 10-9" fill="none" stroke="#fff6e5" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  hand: `<svg viewBox="0 0 48 48"><path d="M19 6.5c1.9 0 3.4 1.5 3.4 3.4v12.3l1.3-.2c1.3-2.1 4.3-2.2 5.5.2 1.6-1.5 4.3-1 5.2 1.1 2-.9 4.6.4 4.6 2.9v8.2c0 6.3-5 11.1-11.3 11.1h-2.6c-3.4 0-6.5-1.6-8.6-4.3l-6.6-8.7c-1.2-1.6-.7-3.9 1.1-4.8 1.3-.7 2.9-.4 4 .6l1.7 1.6V9.9c0-1.9 1.5-3.4 3.3-3.4z" fill="#fff" stroke="#5a3d2b" stroke-width="2.4" stroke-linejoin="round"/></svg>`,
};

export const coinSvg = (size = 22) =>
  `<svg class="coin-ico" width="${size}" height="${size}" viewBox="0 0 24 24"><defs><radialGradient id="cg" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#fff2a8"/><stop offset=".55" stop-color="#ffcf3e"/><stop offset="1" stop-color="#e59a1c"/></radialGradient></defs><circle cx="12" cy="12" r="10.5" fill="url(#cg)" stroke="#c97f12" stroke-width="1.6"/><circle cx="12" cy="12" r="6.6" fill="none" stroke="#e8a62a" stroke-width="1.6"/><path d="M12 8.6v6.8" stroke="#c97f12" stroke-width="2" stroke-linecap="round"/></svg>`;
