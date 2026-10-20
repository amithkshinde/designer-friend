# designer-friend

A browser-based design tool in the spirit of Figma: infinite canvas, frames, shapes, text, layers, and a properties panel, built to work with mouse, trackpad, touch, and stylus. This is **Phase 0**: the engine foundations and a usable solo editor shell.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests for the engine
npm run build      # typecheck + production build into dist/
```

Requires Node 20 or newer.

## What works today

| Area | Status |
| --- | --- |
| Infinite canvas, pan, zoom (1%–25,600%), pixel grid at high zoom | Done |
| Frames (clip content, nesting), rectangles, ellipses, text | Done |
| Selection: click, shift-click, marquee, drill into frames, deep select (Ctrl/Cmd + click) | Done |
| Move, resize with 8 handles (Shift keeps aspect ratio), nudge | Done |
| Layers panel: nesting, select, rename (double-click), hide, lock | Done |
| Properties: X/Y/W/H, opacity, corner radius, fill, stroke, text content and size; number fields accept math like `100+24*2` | Done |
| Undo and redo with grouped drags | Done |
| Duplicate, delete, z-order | Done |
| Autosave to the browser, save and open as JSON, export PNG (2x) | Done |
| Touch: pinch zoom, two-finger pan, two-finger tap = undo, three-finger tap = redo, multi-select toggle | Done |
| Responsive layout: desktop three-column, tablet floating panels, phone bottom toolbar with sheets | Done |

Not built yet (see the PRD build order): pen and vector network, boolean ops, auto layout, constraints, styles, components and variants, variables, prototyping, Dev Mode, multiplayer, comments, version history, plugins, and the rest of the roadmap.

## Shortcuts

Ctrl means Cmd on macOS.

| Action | Shortcut |
| --- | --- |
| Move, Frame, Rectangle, Ellipse, Text, Hand | V, F (or A), R, O, T, H |
| Pan | Space + drag, middle mouse, two-finger scroll |
| Zoom | Ctrl + scroll, Ctrl + `+` / `-`, pinch |
| Zoom to 100%, fit, selection | Shift + 0, Shift + 1, Shift + 2 |
| Undo, redo | Ctrl + Z, Ctrl + Shift + Z (or Ctrl + Y) |
| Select all, duplicate, delete | Ctrl + A, Ctrl + D, Delete |
| Bring forward, to front | Ctrl + `]`, Ctrl + Shift + `]` |
| Send backward, to back | Ctrl + `[`, Ctrl + Shift + `[` |
| Nudge 1 px, 10 px | Arrows, Shift + Arrows |
| Select children, select parent | Enter, Shift + Enter |
| Edit text | Enter or double-click on a text layer |
| Constrain drag to an axis, square shapes | Hold Shift |

## Code layout

```
src/engine/      Framework-free editor core
  document.ts    Scene graph, operations, JSON load with validation
  history.ts     Undo/redo with transactions and compaction
  geometry.ts    Viewport math, hit-testing, resize math
  editor.ts      Selection, tools, editing commands
  renderer.ts    Canvas 2D renderer and overlays, PNG export
  input.ts       Pointer, touch, wheel and keyboard handling
src/ui/          Toolbar, layers panel, properties panel, text editor
src/persistence.ts  Autosave and starter document
tests/           Vitest unit tests
```

Design notes:

- Every document change is an operation (`add`, `remove`, `update`, `reorder`) that returns its own inverse. Undo/redo, and later multiplayer sync, build on that.
- The engine does not depend on the DOM, except the renderer and text measurement, so it can move to a Web Worker or WebAssembly later.
- Rendering is Canvas 2D for now. The PRD targets a WASM + WebGPU renderer for large files.

## Legal

This is an independent implementation of common design-tool features and shortcuts. It does not use Figma's code, assets, name, or branding. Importing `.fig` files is intentionally not implemented pending legal review.
