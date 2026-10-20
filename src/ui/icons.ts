const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const icons = {
  move: svg('<path d="M5 3l14 8-6 2-2 6z"/>'),
  frame: svg('<path d="M7 3v18M17 3v18M3 7h18M3 17h18"/>'),
  rect: svg('<rect x="4" y="6" width="16" height="12" rx="1"/>'),
  ellipse: svg('<ellipse cx="12" cy="12" rx="8" ry="6"/>'),
  text: svg('<path d="M5 6V4h14v2M12 4v16M9 20h6"/>'),
  hand: svg('<path d="M8 12V6a1.5 1.5 0 013 0v5M11 11V4.5a1.5 1.5 0 013 0V11M14 11V6a1.5 1.5 0 013 0v7c0 4-2 7-6 7-3 0-4-1.5-6-4l-1.5-2.5a1.5 1.5 0 012.5-1.5L8 14"/>'),
  undo: svg('<path d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3"/>'),
  redo: svg('<path d="M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3"/>'),
  fit: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  multi: svg('<rect x="3" y="3" width="10" height="10" rx="1"/><rect x="11" y="11" width="10" height="10" rx="1"/>'),
  layers: svg('<path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5"/>'),
  props: svg('<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>'),
  file: svg('<path d="M6 3h8l4 4v14H6zM14 3v4h4"/>'),
  eye: svg('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: svg('<path d="M3 3l18 18M10.6 6.1A9.8 9.8 0 0112 5c6 0 10 7 10 7a17 17 0 01-3.2 3.9M6.5 7.5A17 17 0 002 12s4 7 10 7a9.6 9.6 0 004-.9"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="9" rx="1"/><path d="M8 11V8a4 4 0 018 0v3"/>'),
  unlock: svg('<rect x="5" y="11" width="14" height="9" rx="1"/><path d="M8 11V8a4 4 0 017.5-2"/>'),
};

export type IconName = keyof typeof icons;
