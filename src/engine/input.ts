import type { Editor } from "./editor";
import {
  HANDLES,
  HANDLE_CURSOR,
  boundsOf,
  frameAt,
  handlePosition,
  hitTest,
  normalizeRect,
  rectsIntersect,
  resizeBox,
  screenToWorld,
  worldOrigin,
  worldRect,
  type HandleId,
} from "./geometry";
import { ROOT_ID } from "./document";
import type { Rect, Tool } from "./types";

type Drag =
  | { kind: "pan"; sx: number; sy: number; vx: number; vy: number }
  | { kind: "move"; start: { x: number; y: number }; origins: Map<string, { x: number; y: number }>; moved: boolean }
  | { kind: "resize"; handle: HandleId; box: Rect; rects: Map<string, Rect>; start: { x: number; y: number } }
  | { kind: "create"; tool: Tool; parentId: string; start: { x: number; y: number }; sx: number; sy: number; id: string | null }
  | { kind: "marquee"; start: { x: number; y: number }; base: string[] }
  | { kind: "gesture" };

const DRAG_THRESHOLD = 3;
const TAP_MS = 280;

/** Turns pointer, touch, wheel and keyboard input into editor actions. */
export class InputController {
  private pointers = new Map<number, { x: number; y: number }>();
  private drag: Drag | null = null;
  private spaceDown = false;
  private gesture: { dist: number; mx: number; my: number; zoom: number; vx: number; vy: number; t: number; moved: boolean; max: number } | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private editor: Editor,
    private onEditText: (id: string) => void,
  ) {
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", (e) => this.pointerDown(e));
    canvas.addEventListener("pointermove", (e) => this.pointerMove(e));
    canvas.addEventListener("pointerup", (e) => this.pointerUp(e, false));
    canvas.addEventListener("pointercancel", (e) => this.pointerUp(e, true));
    canvas.addEventListener("pointerleave", () => this.setHover(null));
    canvas.addEventListener("wheel", (e) => this.wheel(e), { passive: false });
    canvas.addEventListener("dblclick", (e) => this.doubleClick(e));
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", (e) => this.keyDown(e));
    window.addEventListener("keyup", (e) => this.keyUp(e));
  }

  // ---- helpers ----

  private local(e: PointerEvent | MouseEvent | WheelEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private world(p: { x: number; y: number }): { x: number; y: number } {
    return screenToWorld(this.editor.viewport, p.x, p.y);
  }

  private setHover(id: string | null): void {
    if (this.editor.hoverId !== id) {
      this.editor.hoverId = id;
      this.editor.emit();
    }
  }

  private setCursor(c: string): void {
    this.canvas.style.cursor = c;
  }

  private handleAt(p: { x: number; y: number }, touch: boolean): HandleId | null {
    const { editor } = this;
    const box = boundsOf(editor.doc, editor.selection);
    if (!box || editor.selection.length === 0) return null;
    const vp = editor.viewport;
    const sb = { x: box.x * vp.zoom + vp.x, y: box.y * vp.zoom + vp.y, width: box.width * vp.zoom, height: box.height * vp.zoom };
    const radius = touch ? 18 : 8;
    for (const h of HANDLES) {
      const hp = handlePosition(sb, h);
      if (Math.abs(p.x - hp.x) <= radius && Math.abs(p.y - hp.y) <= radius) return h;
    }
    return null;
  }

  private additive(e: { shiftKey: boolean }): boolean {
    return e.shiftKey || this.editor.multiSelect;
  }

  // ---- pointer events ----

  private pointerDown(e: PointerEvent): void {
    if (e.button === 2) return;
    this.canvas.setPointerCapture(e.pointerId);
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);

    if (this.pointers.size >= 2) {
      this.startGesture();
      return;
    }
    const { editor } = this;
    const touch = e.pointerType === "touch";
    const w = this.world(p);

    if (e.button === 1 || this.spaceDown || editor.tool === "hand") {
      this.drag = { kind: "pan", sx: p.x, sy: p.y, vx: editor.viewport.x, vy: editor.viewport.y };
      this.setCursor("grabbing");
      return;
    }

    if (editor.tool === "move") {
      const handle = this.handleAt(p, touch);
      if (handle) {
        const ids = editor.topLevelSelection();
        const rects = new Map(ids.map((id) => [id, worldRect(editor.doc, id)] as const));
        editor.history.begin();
        this.drag = { kind: "resize", handle, box: boundsOf(editor.doc, ids)!, rects, start: w };
        return;
      }
      const hit = hitTest(editor.doc, w.x, w.y, { deep: e.ctrlKey || e.metaKey, selected: new Set(editor.selection) });
      if (hit) {
        if (this.additive(e)) {
          editor.toggleSelect(hit);
          if (!editor.selection.includes(hit)) return;
        } else if (!editor.selection.includes(hit)) {
          editor.select([hit]);
        }
        const ids = editor.topLevelSelection();
        const origins = new Map(ids.map((id) => [id, { x: editor.doc.require(id).x, y: editor.doc.require(id).y }] as const));
        editor.history.begin();
        this.drag = { kind: "move", start: w, origins, moved: false };
      } else {
        const base = this.additive(e) ? [...editor.selection] : [];
        if (base.length === 0) editor.select([]);
        this.drag = { kind: "marquee", start: w, base };
      }
      return;
    }

    if (editor.tool === "text") {
      this.drag = { kind: "create", tool: "text", parentId: frameAt(editor.doc, w.x, w.y), start: w, sx: p.x, sy: p.y, id: null };
      return;
    }

    this.drag = { kind: "create", tool: editor.tool, parentId: frameAt(editor.doc, w.x, w.y), start: w, sx: p.x, sy: p.y, id: null };
    editor.history.begin();
  }

  private pointerMove(e: PointerEvent): void {
    const p = this.local(e);
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, p);
    const { editor } = this;

    if (this.gesture) {
      this.updateGesture();
      return;
    }

    const d = this.drag;
    if (!d) {
      if (e.pointerType === "mouse") this.updateHover(p, e);
      return;
    }
    const w = this.world(p);

    switch (d.kind) {
      case "pan":
        editor.setViewport({ ...editor.viewport, x: d.vx + (p.x - d.sx), y: d.vy + (p.y - d.sy) });
        break;
      case "move": {
        let dx = w.x - d.start.x;
        let dy = w.y - d.start.y;
        if (!d.moved && Math.hypot(dx, dy) * editor.viewport.zoom < DRAG_THRESHOLD) return;
        d.moved = true;
        if (e.shiftKey) (Math.abs(dx) > Math.abs(dy) ? (dy = 0) : (dx = 0));
        for (const [id, o] of d.origins) {
          editor.history.apply({ kind: "update", id, props: { x: Math.round(o.x + dx), y: Math.round(o.y + dy) } });
        }
        break;
      }
      case "resize": {
        const next = resizeBox(d.box, d.handle, w.x - d.start.x, w.y - d.start.y, e.shiftKey);
        const sx = next.width / Math.max(1, d.box.width);
        const sy = next.height / Math.max(1, d.box.height);
        for (const [id, r] of d.rects) {
          const node = editor.doc.require(id);
          const po = node.parentId ? worldOrigin(editor.doc, node.parentId) : { x: 0, y: 0 };
          const nx = next.x + (r.x - d.box.x) * sx;
          const ny = next.y + (r.y - d.box.y) * sy;
          editor.history.apply({
            kind: "update",
            id,
            props: {
              x: Math.round(nx - po.x),
              y: Math.round(ny - po.y),
              width: Math.max(1, Math.round(r.width * sx)),
              height: Math.max(1, Math.round(r.height * sy)),
            },
          });
        }
        break;
      }
      case "create": {
        if (d.tool === "text") return;
        if (!d.id) {
          if (Math.hypot(p.x - d.sx, p.y - d.sy) < DRAG_THRESHOLD) return;
          const origin = worldOrigin(editor.doc, d.parentId);
          const type = d.tool === "frame" ? "frame" : d.tool === "ellipse" ? "ellipse" : "rect";
          d.id = editor.addNode(type, d.parentId, { x: Math.round(d.start.x - origin.x), y: Math.round(d.start.y - origin.y), width: 1, height: 1 });
          editor.select([d.id]);
        }
        const origin = worldOrigin(editor.doc, d.parentId);
        let r = normalizeRect(d.start.x, d.start.y, w.x, w.y);
        if (e.shiftKey) {
          const side = Math.max(r.width, r.height);
          r = normalizeRect(d.start.x, d.start.y, d.start.x + Math.sign(w.x - d.start.x || 1) * side, d.start.y + Math.sign(w.y - d.start.y || 1) * side);
        }
        editor.history.apply({
          kind: "update",
          id: d.id,
          props: { x: Math.round(r.x - origin.x), y: Math.round(r.y - origin.y), width: Math.max(1, Math.round(r.width)), height: Math.max(1, Math.round(r.height)) },
        });
        break;
      }
      case "marquee": {
        const rect = normalizeRect(d.start.x, d.start.y, w.x, w.y);
        editor.marquee = rect;
        const hits = editor.doc.root.children.filter((id) => {
          const n = editor.doc.require(id);
          return n.visible && !n.locked && rectsIntersect(rect, worldRect(editor.doc, id));
        });
        editor.select([...new Set([...d.base, ...hits])]);
        break;
      }
      case "gesture":
        break;
    }
  }

  private pointerUp(e: PointerEvent, cancelled: boolean): void {
    const { editor } = this;
    const wasGesture = this.gesture !== null;
    this.pointers.delete(e.pointerId);

    if (wasGesture) {
      this.endGestureMaybe();
      return;
    }

    const d = this.drag;
    this.drag = null;
    this.setCursor(this.spaceDown || editor.tool === "hand" ? "grab" : "default");
    if (!d) return;

    if (cancelled) {
      editor.history.cancel();
      editor.marquee = null;
      editor.emit();
      return;
    }

    switch (d.kind) {
      case "move":
      case "resize":
        editor.history.commit();
        break;
      case "create": {
        if (d.tool === "text") {
          const origin = worldOrigin(editor.doc, d.parentId);
          const id = editor.addNode("text", d.parentId, { x: Math.round(d.start.x - origin.x), y: Math.round(d.start.y - origin.y) });
          editor.setText(id, "Text");
          editor.select([id]);
          editor.setTool("move");
          this.onEditText(id);
          break;
        }
        if (!d.id) {
          const origin = worldOrigin(editor.doc, d.parentId);
          const type = d.tool === "frame" ? "frame" : d.tool === "ellipse" ? "ellipse" : "rect";
          const size = type === "frame" ? { width: 400, height: 300 } : { width: 100, height: 100 };
          d.id = editor.addNode(type, d.parentId, { x: Math.round(d.start.x - origin.x), y: Math.round(d.start.y - origin.y), ...size });
          editor.select([d.id]);
        }
        editor.history.commit();
        editor.setTool("move");
        break;
      }
      case "marquee":
        editor.marquee = null;
        editor.emit();
        break;
      default:
        break;
    }
  }

  private updateHover(p: { x: number; y: number }, e: PointerEvent): void {
    const { editor } = this;
    if (editor.tool !== "move" || this.spaceDown) return;
    const handle = this.handleAt(p, false);
    if (handle) {
      this.setCursor(HANDLE_CURSOR[handle]);
      this.setHover(null);
      return;
    }
    this.setCursor("default");
    const w = this.world(p);
    this.setHover(hitTest(editor.doc, w.x, w.y, { deep: e.ctrlKey || e.metaKey, selected: new Set(editor.selection) }));
  }

  // ---- multi-touch ----

  private startGesture(): void {
    const { editor } = this;
    if (editor.history.inTransaction) editor.history.cancel();
    editor.marquee = null;
    this.drag = { kind: "gesture" };
    const pts = [...this.pointers.values()];
    const a = pts[0]!;
    const b = pts[1]!;
    this.gesture = {
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      mx: (a.x + b.x) / 2,
      my: (a.y + b.y) / 2,
      zoom: editor.viewport.zoom,
      vx: editor.viewport.x,
      vy: editor.viewport.y,
      t: performance.now(),
      moved: false,
      max: pts.length,
    };
    editor.emit();
  }

  private updateGesture(): void {
    const g = this.gesture;
    if (!g) return;
    const pts = [...this.pointers.values()];
    g.max = Math.max(g.max, pts.length);
    if (pts.length < 2) return;
    const a = pts[0]!;
    const b = pts[1]!;
    const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    if (Math.abs(dist - g.dist) > 8 || Math.hypot(mx - g.mx, my - g.my) > 8) g.moved = true;
    if (!g.moved) return;
    const zoom = Math.min(256, Math.max(0.02, g.zoom * (dist / g.dist)));
    const k = zoom / g.zoom;
    // Keep the world point that started under the fingers under their current midpoint.
    this.editor.setViewport({ zoom, x: mx - (g.mx - g.vx) * k, y: my - (g.my - g.vy) * k });
  }

  private endGestureMaybe(): void {
    const g = this.gesture;
    if (!g) return;
    g.max = Math.max(g.max, this.pointers.size + 1);
    if (this.pointers.size > 0) return;
    // All fingers lifted: a quick still tap with 2 fingers is undo, 3 fingers is redo.
    if (!g.moved && performance.now() - g.t < TAP_MS) {
      if (g.max >= 3) this.editor.redo();
      else this.editor.undo();
    }
    this.gesture = null;
    this.drag = null;
  }

  // ---- wheel, double click ----

  private wheel(e: WheelEvent): void {
    e.preventDefault();
    const { editor } = this;
    const p = this.local(e);
    if (e.ctrlKey || e.metaKey) {
      // Clamp so one mouse-wheel notch zooms about 25% while small trackpad pinch deltas stay smooth.
      editor.zoomBy(Math.exp(-Math.max(-25, Math.min(25, e.deltaY)) * 0.01), p.x, p.y);
    } else {
      const dx = e.shiftKey && e.deltaX === 0 ? e.deltaY : e.deltaX;
      const dy = e.shiftKey && e.deltaX === 0 ? 0 : e.deltaY;
      editor.setViewport({ ...editor.viewport, x: editor.viewport.x - dx, y: editor.viewport.y - dy });
    }
  }

  private doubleClick(e: MouseEvent): void {
    const { editor } = this;
    if (editor.tool !== "move") return;
    const w = this.world(this.local(e));
    const hit = hitTest(editor.doc, w.x, w.y, { deep: true });
    if (!hit) return;
    editor.select([hit]);
    if (editor.doc.require(hit).type === "text") this.onEditText(hit);
  }

  // ---- keyboard ----

  private keyUp(e: KeyboardEvent): void {
    if (e.code === "Space") {
      this.spaceDown = false;
      this.setCursor(this.editor.tool === "hand" ? "grab" : "default");
    }
  }

  private keyDown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
    const { editor } = this;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();

    if (e.code === "Space" && !mod) {
      e.preventDefault();
      if (!this.spaceDown) {
        this.spaceDown = true;
        this.setCursor("grab");
      }
      return;
    }

    // Zoom shortcuts use the physical digit keys so Shift + 0/1/2 works on every layout.
    if (e.shiftKey && !mod && /^Digit[012]$/.test(e.code)) {
      e.preventDefault();
      if (e.code === "Digit0") editor.zoomTo100();
      else if (e.code === "Digit1") editor.zoomToFit();
      else editor.zoomToSelection();
      return;
    }

    if (mod) {
      switch (key) {
        case "z":
          e.preventDefault();
          if (e.shiftKey) editor.redo();
          else editor.undo();
          return;
        case "y":
          e.preventDefault();
          editor.redo();
          return;
        case "a":
          e.preventDefault();
          editor.selectAll();
          return;
        case "d":
          e.preventDefault();
          editor.duplicateSelection();
          return;
        case "]":
          e.preventDefault();
          editor.reorder(e.shiftKey ? "front" : "forward");
          return;
        case "[":
          e.preventDefault();
          editor.reorder(e.shiftKey ? "back" : "backward");
          return;
        case "=":
        case "+":
          e.preventDefault();
          editor.zoomBy(1.25);
          return;
        case "-":
          e.preventDefault();
          editor.zoomBy(0.8);
          return;
      }
      return;
    }

    const tools: Record<string, Tool> = { v: "move", f: "frame", a: "frame", r: "rect", o: "ellipse", t: "text", h: "hand" };
    if (tools[key] && !e.altKey) {
      editor.setTool(tools[key]!);
      this.setCursor(tools[key] === "hand" ? "grab" : "default");
      return;
    }

    switch (e.key) {
      case "Delete":
      case "Backspace":
        e.preventDefault();
        editor.deleteSelection();
        return;
      case "Escape":
        editor.select([]);
        editor.setTool("move");
        return;
      case "Enter": {
        const only = editor.selection.length === 1 ? editor.doc.require(editor.selection[0]!) : null;
        if (only?.type === "text") {
          e.preventDefault();
          this.onEditText(only.id);
        } else if (only && only.children.length > 0 && !e.shiftKey) {
          e.preventDefault();
          editor.select(only.children.slice());
        } else if (only && e.shiftKey && only.parentId && only.parentId !== ROOT_ID) {
          e.preventDefault();
          editor.select([only.parentId]);
        }
        return;
      }
      case "ArrowLeft":
      case "ArrowRight":
      case "ArrowUp":
      case "ArrowDown": {
        if (editor.selection.length === 0) return;
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        editor.nudge(e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0, e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0);
        return;
      }
    }
  }
}
