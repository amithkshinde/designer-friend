import { clone } from "./compat";
import { DocumentModel, ROOT_ID, makeNode, newId } from "./document";
import { History } from "./history";
import { boundsOf, fitRect, unionRects, worldRect, zoomAt } from "./geometry";
import { measureText } from "./text";
import { TYPE_LABEL, type Node, type NodeProps, type NodeType, type Rect, type Tool, type Viewport } from "./types";

export type ZOrder = "front" | "back" | "forward" | "backward";

/** Holds the document plus all editing state: selection, viewport, active tool. */
export class Editor {
  doc: DocumentModel;
  history: History;
  selection: string[] = [];
  viewport: Viewport = { x: 0, y: 0, zoom: 1 };
  tool: Tool = "move";
  hoverId: string | null = null;
  marquee: Rect | null = null;
  /** Touch-friendly stand-in for holding Shift while selecting. */
  multiSelect = false;
  /** Id of the text node currently being edited in the overlay. */
  editingTextId: string | null = null;
  /** Canvas size in CSS pixels, kept up to date by the renderer. */
  size = { width: 800, height: 600 };
  /** Bumps on every change, including viewport moves. */
  version = 0;
  /** Bumps only when the document or selection changes; panels use it to know when to rebuild. */
  panelVersion = 0;

  private listeners = new Set<() => void>();

  constructor(doc: DocumentModel = new DocumentModel()) {
    this.doc = doc;
    this.history = new History(doc, () => this.handleDocChange());
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(): void {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  private handleDocChange(): void {
    this.selection = this.selection.filter((id) => this.doc.get(id));
    if (this.hoverId && !this.doc.get(this.hoverId)) this.hoverId = null;
    this.panelVersion++;
    this.emit();
  }

  loadDocument(doc: DocumentModel): void {
    this.doc = doc;
    this.history = new History(doc, () => this.handleDocChange());
    this.selection = [];
    this.hoverId = null;
    this.editingTextId = null;
    this.panelVersion++;
    this.zoomToFit();
  }

  // ---- selection ----

  select(ids: string[]): void {
    const next = ids.filter((id) => this.doc.get(id) && id !== ROOT_ID);
    this.selection = [...new Set(next)];
    this.panelVersion++;
    this.emit();
  }

  toggleSelect(id: string): void {
    this.select(this.selection.includes(id) ? this.selection.filter((s) => s !== id) : [...this.selection, id]);
  }

  selectAll(): void {
    const parent = this.selection.length > 0 ? this.doc.get(this.selection[0]!)?.parentId ?? ROOT_ID : ROOT_ID;
    this.select(this.doc.require(parent).children.filter((id) => !this.doc.require(id).locked));
  }

  /** Selected nodes whose ancestors are not also selected. */
  topLevelSelection(): string[] {
    const set = new Set(this.selection);
    return this.selection.filter((id) => {
      let p = this.doc.get(id)?.parentId ?? null;
      while (p) {
        if (set.has(p)) return false;
        p = this.doc.get(p)?.parentId ?? null;
      }
      return true;
    });
  }

  setTool(tool: Tool): void {
    this.tool = tool;
    this.emit();
  }

  // ---- editing ----

  nextName(type: NodeType): string {
    const label = TYPE_LABEL[type];
    const names = new Set([...this.doc.nodes.values()].map((n) => n.name));
    let i = 1;
    while (names.has(`${label} ${i}`)) i++;
    return `${label} ${i}`;
  }

  /** Adds a node under `parentId` and returns its id. The new node is not selected. */
  addNode(type: NodeType, parentId: string, props: Partial<Node> = {}, index?: number): string {
    const node = makeNode(type, { name: this.nextName(type), ...props });
    const parent = this.doc.require(parentId);
    this.history.apply({ kind: "add", nodes: [node], parentId, index: index ?? parent.children.length });
    return node.id;
  }

  /** Sets properties, skipping values that are already current so no-ops never create undo steps. */
  setProps(ids: string[], props: NodeProps): void {
    this.history.run(() => {
      for (const id of ids) {
        const node = this.doc.get(id);
        if (!node) continue;
        const changed: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(props)) {
          if ((node as unknown as Record<string, unknown>)[k] !== v) changed[k] = v;
        }
        if (Object.keys(changed).length > 0) this.history.apply({ kind: "update", id, props: changed as NodeProps });
      }
    });
  }

  /** Changes a text node's content or size and refits its box to the text. */
  setText(id: string, text: string, fontSize?: number): void {
    const node = this.doc.get(id);
    if (!node || node.type !== "text") return;
    const size = fontSize ?? node.fontSize;
    const m = measureText(text, size);
    this.setProps([id], { text, fontSize: size, width: m.width, height: m.height });
  }

  deleteSelection(): void {
    const ids = this.topLevelSelection();
    if (ids.length === 0) return;
    this.history.run(() => {
      for (const id of ids) this.history.apply({ kind: "remove", id });
    });
    this.select([]);
  }

  duplicateSelection(): void {
    const ids = this.topLevelSelection();
    if (ids.length === 0) return;
    const created: string[] = [];
    this.history.run(() => {
      for (const id of ids) {
        const original = this.doc.require(id);
        const parent = this.doc.require(original.parentId as string);
        const idMap = new Map<string, string>();
        const nodes = this.doc.subtree(id).map((n) => {
          const copy = clone(n);
          copy.id = newId();
          idMap.set(n.id, copy.id);
          return copy;
        });
        for (const copy of nodes) {
          copy.children = copy.children.map((c) => idMap.get(c) as string);
          if (copy.parentId && idMap.has(copy.parentId)) copy.parentId = idMap.get(copy.parentId) as string;
        }
        nodes[0]!.x += 10;
        nodes[0]!.y += 10;
        nodes[0]!.name = `${original.name} copy`;
        this.history.apply({ kind: "add", nodes, parentId: parent.id, index: parent.children.indexOf(id) + 1 });
        created.push(nodes[0]!.id);
      }
    });
    this.select(created);
  }

  nudge(dx: number, dy: number): void {
    const ids = this.topLevelSelection();
    this.history.run(() => {
      for (const id of ids) {
        const n = this.doc.require(id);
        this.history.apply({ kind: "update", id, props: { x: n.x + dx, y: n.y + dy } });
      }
    });
  }

  reorder(direction: ZOrder): void {
    const ids = this.topLevelSelection();
    this.history.run(() => {
      for (const id of ids) {
        const node = this.doc.require(id);
        const siblings = this.doc.require(node.parentId as string).children;
        const at = siblings.indexOf(id);
        const target =
          direction === "front" ? siblings.length - 1 : direction === "back" ? 0 : direction === "forward" ? at + 1 : at - 1;
        const clamped = Math.max(0, Math.min(siblings.length - 1, target));
        if (clamped !== at) this.history.apply({ kind: "reorder", id, index: clamped });
      }
    });
  }

  undo(): void {
    this.history.undo();
  }

  redo(): void {
    this.history.redo();
  }

  // ---- viewport ----

  setViewport(vp: Viewport): void {
    this.viewport = vp;
    this.emit();
  }

  zoomBy(factor: number, sx = this.size.width / 2, sy = this.size.height / 2): void {
    this.setViewport(zoomAt(this.viewport, factor, sx, sy));
  }

  zoomTo100(): void {
    this.zoomBy(1 / this.viewport.zoom);
  }

  zoomToFit(): void {
    const rects = this.doc.root.children.map((id) => worldRect(this.doc, id));
    const all = unionRects(rects);
    this.setViewport(
      all
        ? fitRect(all, this.size.width, this.size.height, 64)
        : { x: this.size.width / 2, y: this.size.height / 2, zoom: 1 },
    );
  }

  zoomToSelection(): void {
    const b = boundsOf(this.doc, this.selection);
    if (b) this.setViewport(fitRect(b, this.size.width, this.size.height, 64));
  }
}
