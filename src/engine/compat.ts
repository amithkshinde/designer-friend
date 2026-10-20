/**
 * Small fallbacks for APIs that older or stricter browsers lack.
 * Everything here is feature-detected, so modern browsers use their native versions.
 */

/** crypto.randomUUID needs a secure context (HTTPS or localhost) and Safari 15.4+. */
export function uuid(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

/** structuredClone is missing before Safari 15.4 and Firefox 94. Our data is plain JSON, so this is safe. */
export function clone<T>(value: T): T {
  return typeof structuredClone === "function" ? structuredClone(value) : (JSON.parse(JSON.stringify(value)) as T);
}

/** Adds a rounded rectangle to the current path. CanvasRenderingContext2D.roundRect is missing before Safari 16 and Firefox 112. */
export function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/**
 * Normalises wheel deltas to pixels. Firefox reports mouse-wheel steps in lines
 * (deltaMode 1) rather than pixels, which would make panning and zooming far too slow.
 */
export function wheelDeltaPixels(e: { deltaX: number; deltaY: number; deltaMode: number }, pageHeight: number): { dx: number; dy: number } {
  const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? pageHeight : 1;
  return { dx: e.deltaX * k, dy: e.deltaY * k };
}

/** Triggers a file download. The link must be in the DOM for Firefox to honour the click. */
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.style.display = "none";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Why the editor cannot run in this browser, or null if everything it needs is present. */
export function unsupportedReason(): string | null {
  if (typeof window.PointerEvent === "undefined") return "Pointer Events are not available.";
  if (typeof ResizeObserver === "undefined") return "ResizeObserver is not available.";
  const canvas = document.createElement("canvas");
  if (!canvas.getContext || !canvas.getContext("2d")) return "Canvas 2D is not available.";
  return null;
}
