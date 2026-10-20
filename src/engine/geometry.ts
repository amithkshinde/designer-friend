import { ROOT_ID, type DocumentModel } from "./document";
import type { Rect, Viewport } from "./types";
import { clamp } from "./math";

export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 256;

export function screenToWorld(vp: Viewport, sx: number, sy: number): { x: number; y: number } {
  return { x: (sx - vp.x) / vp.zoom, y: (sy - vp.y) / vp.zoom };
}

export function worldToScreen(vp: Viewport, wx: number, wy: number): { x: number; y: number } {
  return { x: wx * vp.zoom + vp.x, y: wy * vp.zoom + vp.y };
}

/** Zooms by `factor`, keeping the world point under screen position (sx, sy) fixed. */
export function zoomAt(vp: Viewport, factor: number, sx: number, sy: number): Viewport {
  const zoom = clamp(vp.zoom * factor, MIN_ZOOM, MAX_ZOOM);
  const k = zoom / vp.zoom;
  return { zoom, x: sx - (sx - vp.x) * k, y: sy - (sy - vp.y) * k };
}

export function fitRect(rect: Rect, width: number, height: number, padding: number, maxZoom = 4): Viewport {
  const availW = Math.max(1, width - padding * 2);
  const availH = Math.max(1, height - padding * 2);
  const zoom = clamp(Math.min(availW / Math.max(1, rect.width), availH / Math.max(1, rect.height)), MIN_ZOOM, maxZoom);
  return {
    zoom,
    x: (width - rect.width * zoom) / 2 - rect.x * zoom,
    y: (height - rect.height * zoom) / 2 - rect.y * zoom,
  };
}

/** World-space position of the node's top-left corner. */
export function worldOrigin(doc: DocumentModel, id: string): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let cur = doc.get(id);
  while (cur && cur.id !== ROOT_ID) {
    x += cur.x;
    y += cur.y;
    cur = cur.parentId ? doc.get(cur.parentId) : undefined;
  }
  return { x, y };
}

export function worldRect(doc: DocumentModel, id: string): Rect {
  const node = doc.require(id);
  const o = worldOrigin(doc, id);
  return { x: o.x, y: o.y, width: node.width, height: node.height };
}

export function unionRects(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const r of rects) {
    x1 = Math.min(x1, r.x);
    y1 = Math.min(y1, r.y);
    x2 = Math.max(x2, r.x + r.width);
    y2 = Math.max(y2, r.y + r.height);
  }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

export function boundsOf(doc: DocumentModel, ids: string[]): Rect | null {
  return unionRects(ids.filter((id) => doc.get(id)).map((id) => worldRect(doc, id)));
}

export function normalizeRect(x1: number, y1: number, x2: number, y2: number): Rect {
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
}

export function pointInRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
}

export interface HitOptions {
  /** Return the deepest node under the point instead of drilling one level at a time. */
  deep?: boolean;
  /** Currently selected ids. Hitting inside a selected node drills into its children. */
  selected?: ReadonlySet<string>;
}

/** Chain of nodes under the point from the page's direct child down to the deepest hit. */
function hitChain(doc: DocumentModel, wx: number, wy: number): string[] {
  const visit = (parentId: string, ox: number, oy: number): string[] | null => {
    const parent = doc.require(parentId);
    for (let i = parent.children.length - 1; i >= 0; i--) {
      const child = doc.require(parent.children[i]!);
      if (!child.visible || child.locked) continue;
      const cx = ox + child.x;
      const cy = oy + child.y;
      const inside = pointInRect({ x: cx, y: cy, width: child.width, height: child.height }, wx, wy);
      if (child.type === "frame" || child.children.length > 0) {
        if (inside || !child.clip) {
          const deeper = visit(child.id, cx, cy);
          if (deeper) return [child.id, ...deeper];
        }
      }
      if (inside) return [child.id];
    }
    return null;
  };
  return visit(ROOT_ID, 0, 0) ?? [];
}

/** Picks the node under a world-space point following Figma-style selection drilling. */
export function hitTest(doc: DocumentModel, wx: number, wy: number, opts: HitOptions = {}): string | null {
  const chain = hitChain(doc, wx, wy);
  if (chain.length === 0) return null;
  if (opts.deep) return chain[chain.length - 1]!;
  let i = 0;
  while (i < chain.length - 1 && opts.selected?.has(chain[i]!)) i++;
  return chain[i]!;
}

/** The deepest frame under a point, used as the parent for newly drawn shapes. */
export function frameAt(doc: DocumentModel, wx: number, wy: number): string {
  const chain = hitChain(doc, wx, wy);
  for (let i = chain.length - 1; i >= 0; i--) {
    if (doc.require(chain[i]!).type === "frame") return chain[i]!;
  }
  return ROOT_ID;
}

export type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export const HANDLES: readonly HandleId[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

export function handlePosition(box: Rect, h: HandleId): { x: number; y: number } {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const r = box.x + box.width;
  const b = box.y + box.height;
  switch (h) {
    case "nw": return { x: box.x, y: box.y };
    case "n": return { x: cx, y: box.y };
    case "ne": return { x: r, y: box.y };
    case "e": return { x: r, y: cy };
    case "se": return { x: r, y: b };
    case "s": return { x: cx, y: b };
    case "sw": return { x: box.x, y: b };
    case "w": return { x: box.x, y: cy };
  }
}

export const HANDLE_CURSOR: Record<HandleId, string> = {
  nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize",
  n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize",
};

/**
 * Computes the new bounding box when dragging `handle` by (dx, dy) in world units.
 * Dimensions never go below 1. With `keepAspect` the box keeps its original ratio.
 */
export function resizeBox(box: Rect, handle: HandleId, dx: number, dy: number, keepAspect: boolean): Rect {
  let x1 = box.x;
  let y1 = box.y;
  let x2 = box.x + box.width;
  let y2 = box.y + box.height;
  if (handle.includes("w")) x1 += dx;
  if (handle.includes("e")) x2 += dx;
  if (handle.includes("n")) y1 += dy;
  if (handle.includes("s")) y2 += dy;

  let w = Math.max(1, x2 - x1);
  let h = Math.max(1, y2 - y1);
  if (keepAspect && box.width > 0 && box.height > 0) {
    const ratio = box.width / box.height;
    const horizontal = handle === "e" || handle === "w";
    const vertical = handle === "n" || handle === "s";
    if (horizontal) h = w / ratio;
    else if (vertical) w = h * ratio;
    else if (w / ratio > h) h = w / ratio;
    else w = h * ratio;
  }
  const left = handle.includes("w") ? box.x + box.width - w : box.x;
  const top = handle.includes("n") ? box.y + box.height - h : box.y;
  return { x: handle === "n" || handle === "s" ? box.x + (box.width - w) / 2 : left, y: handle === "e" || handle === "w" ? box.y + (box.height - h) / 2 : top, width: w, height: h };
}
