import type { Editor } from "./editor";
import { ROOT_ID, type DocumentModel } from "./document";
import { HANDLES, boundsOf, handlePosition, worldOrigin } from "./geometry";
import { fontCss, lineHeight } from "./text";
import type { Node, Rect } from "./types";

const ACCENT = "#4f7cff";
const CANVAS_BG = "#e9e9ec";

function pathShape(ctx: CanvasRenderingContext2D, node: Node, x: number, y: number): void {
  ctx.beginPath();
  if (node.type === "ellipse") {
    ctx.ellipse(x + node.width / 2, y + node.height / 2, node.width / 2, node.height / 2, 0, 0, Math.PI * 2);
    return;
  }
  const r = Math.min(node.cornerRadius, node.width / 2, node.height / 2);
  if (r > 0) ctx.roundRect(x, y, node.width, node.height, r);
  else ctx.rect(x, y, node.width, node.height);
}

/** Paints a node and its descendants. (ox, oy) is the world position of the node's parent. */
export function drawNode(ctx: CanvasRenderingContext2D, doc: DocumentModel, node: Node, ox: number, oy: number, alpha = 1): void {
  if (!node.visible) return;
  const x = ox + node.x;
  const y = oy + node.y;
  const a = alpha * node.opacity;
  ctx.save();
  ctx.globalAlpha = a;

  if (node.type === "text") {
    if (node.fill) {
      ctx.fillStyle = node.fill;
      ctx.font = fontCss(node.fontSize);
      ctx.textBaseline = "top";
      const lh = lineHeight(node.fontSize);
      node.text.split("\n").forEach((line, i) => ctx.fillText(line, x, y + i * lh + (lh - node.fontSize) / 2));
    }
  } else {
    pathShape(ctx, node, x, y);
    if (node.fill) {
      ctx.fillStyle = node.fill;
      ctx.fill();
    }
    if (node.stroke && node.strokeWidth > 0) {
      ctx.strokeStyle = node.stroke;
      ctx.lineWidth = node.strokeWidth;
      ctx.stroke();
    }
    if (node.children.length > 0) {
      if (node.clip) {
        pathShape(ctx, node, x, y);
        ctx.clip();
      }
      for (const id of node.children) drawNode(ctx, doc, doc.require(id), x, y, a);
    }
  }
  ctx.restore();
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private queued = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private editor: Editor,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is not available");
    this.ctx = ctx;
    editor.onChange(() => this.invalidate());
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * this.dpr));
    this.editor.size = { width: rect.width, height: rect.height };
    this.invalidate();
  }

  invalidate(): void {
    if (this.queued) return;
    this.queued = true;
    requestAnimationFrame(() => {
      this.queued = false;
      this.draw();
    });
  }

  private draw(): void {
    const { ctx, editor } = this;
    const { width, height } = editor.size;
    const vp = editor.viewport;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = CANVAS_BG;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(vp.x, vp.y);
    ctx.scale(vp.zoom, vp.zoom);
    for (const id of editor.doc.root.children) drawNode(ctx, editor.doc, editor.doc.require(id), 0, 0);
    ctx.restore();

    if (vp.zoom >= 16) this.drawPixelGrid(width, height);
    this.drawOverlays();
  }

  private drawPixelGrid(width: number, height: number): void {
    const { ctx, editor } = this;
    const vp = editor.viewport;
    ctx.save();
    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    const startX = Math.floor(-vp.x / vp.zoom);
    const endX = Math.ceil((width - vp.x) / vp.zoom);
    for (let wx = startX; wx <= endX; wx++) {
      const sx = Math.round(wx * vp.zoom + vp.x) + 0.5;
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, height);
    }
    const startY = Math.floor(-vp.y / vp.zoom);
    const endY = Math.ceil((height - vp.y) / vp.zoom);
    for (let wy = startY; wy <= endY; wy++) {
      const sy = Math.round(wy * vp.zoom + vp.y) + 0.5;
      ctx.moveTo(0, sy);
      ctx.lineTo(width, sy);
    }
    ctx.stroke();
    ctx.restore();
  }

  private screenRect(r: Rect): Rect {
    const vp = this.editor.viewport;
    return { x: r.x * vp.zoom + vp.x, y: r.y * vp.zoom + vp.y, width: r.width * vp.zoom, height: r.height * vp.zoom };
  }

  private drawOverlays(): void {
    const { ctx, editor } = this;
    const { doc } = editor;
    ctx.save();
    ctx.lineWidth = 1;

    if (editor.hoverId && !editor.selection.includes(editor.hoverId) && editor.hoverId !== ROOT_ID && doc.get(editor.hoverId)) {
      const hr = this.screenRect({ ...boundsOf(doc, [editor.hoverId])! });
      ctx.strokeStyle = ACCENT;
      ctx.globalAlpha = 0.7;
      ctx.strokeRect(hr.x + 0.5, hr.y + 0.5, hr.width, hr.height);
      ctx.globalAlpha = 1;
    }

    ctx.strokeStyle = ACCENT;
    for (const id of editor.selection) {
      const b = boundsOf(doc, [id]);
      if (!b) continue;
      const r = this.screenRect(b);
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.width, r.height);
    }

    const box = boundsOf(doc, editor.selection);
    if (box && editor.editingTextId === null) {
      const r = this.screenRect(box);
      if (editor.selection.length > 1) ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.width, r.height);
      const hs = 8;
      for (const h of HANDLES) {
        const p = handlePosition(r, h);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(p.x - hs / 2, p.y - hs / 2, hs, hs);
        ctx.strokeRect(p.x - hs / 2 + 0.5, p.y - hs / 2 + 0.5, hs, hs);
      }
      const label = `${Math.round(box.width)} × ${Math.round(box.height)}`;
      ctx.font = "11px system-ui, sans-serif";
      const tw = ctx.measureText(label).width + 10;
      const lx = r.x + r.width / 2 - tw / 2;
      const ly = r.y + r.height + 10;
      ctx.fillStyle = ACCENT;
      ctx.beginPath();
      ctx.roundRect(lx, ly, tw, 18, 4);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.textBaseline = "middle";
      ctx.fillText(label, lx + 5, ly + 9.5);
    }

    if (editor.marquee) {
      const r = this.screenRect(editor.marquee);
      ctx.fillStyle = "rgba(79,124,255,0.12)";
      ctx.fillRect(r.x, r.y, r.width, r.height);
      ctx.strokeStyle = ACCENT;
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.width, r.height);
    }
    ctx.restore();
  }

  /** Renders nodes to a PNG blob, cropped to their combined bounds. */
  async exportPng(ids: string[], scale: number): Promise<Blob | null> {
    const { doc } = this.editor;
    const bounds = boundsOf(doc, ids);
    if (!bounds || bounds.width < 1 || bounds.height < 1) return null;
    const maxSide = 8192;
    const s = Math.min(scale, maxSide / bounds.width, maxSide / bounds.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(bounds.width * s);
    canvas.height = Math.ceil(bounds.height * s);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.scale(s, s);
    ctx.translate(-bounds.x, -bounds.y);
    for (const id of ids) {
      const node = doc.require(id);
      const parentOrigin = node.parentId ? worldOrigin(doc, node.parentId) : { x: 0, y: 0 };
      drawNode(ctx, doc, node, parentOrigin.x, parentOrigin.y);
    }
    return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  }
}
