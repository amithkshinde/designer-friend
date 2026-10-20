import { NODE_TYPES, type Node, type NodeType, type Op } from "./types";

export const ROOT_ID = "root";

export function newId(): string {
  return globalThis.crypto.randomUUID();
}

const DEFAULTS: Record<NodeType, Partial<Node>> = {
  frame: { fill: "#ffffff", clip: true, width: 400, height: 300 },
  rect: { fill: "#d9d9d9", width: 100, height: 100 },
  ellipse: { fill: "#d9d9d9", width: 100, height: 100 },
  text: { fill: "#1a1a1a", text: "Text", fontSize: 16, width: 40, height: 20 },
};

export function makeNode(type: NodeType, partial: Partial<Node> = {}): Node {
  return {
    id: newId(),
    type,
    name: type,
    parentId: null,
    children: [],
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    fill: null,
    stroke: null,
    strokeWidth: 1,
    cornerRadius: 0,
    opacity: 1,
    visible: true,
    locked: false,
    clip: false,
    text: "",
    fontSize: 16,
    ...DEFAULTS[type],
    ...partial,
  };
}

export interface DocJSON {
  version: 1;
  nodes: Node[];
}

/** The scene graph. All mutations go through apply(), which returns the inverse operation. */
export class DocumentModel {
  readonly nodes = new Map<string, Node>();

  constructor() {
    this.nodes.set(ROOT_ID, makeNode("frame", { id: ROOT_ID, name: "Page 1", fill: null, clip: false, width: 0, height: 0 }));
  }

  get(id: string): Node | undefined {
    return this.nodes.get(id);
  }

  require(id: string): Node {
    const node = this.nodes.get(id);
    if (!node) throw new Error(`Node not found: ${id}`);
    return node;
  }

  get root(): Node {
    return this.require(ROOT_ID);
  }

  childrenOf(id: string): Node[] {
    return this.require(id).children.map((c) => this.require(c));
  }

  /** The node followed by all descendants, in paint order. */
  subtree(id: string): Node[] {
    const out: Node[] = [];
    const walk = (n: Node) => {
      out.push(n);
      for (const c of n.children) walk(this.require(c));
    };
    walk(this.require(id));
    return out;
  }

  /** True when `ancestorId` is a strict ancestor of `id`. */
  isAncestor(ancestorId: string, id: string): boolean {
    let cur = this.get(id)?.parentId ?? null;
    while (cur) {
      if (cur === ancestorId) return true;
      cur = this.get(cur)?.parentId ?? null;
    }
    return false;
  }

  apply(op: Op): Op {
    switch (op.kind) {
      case "add": {
        const parent = this.require(op.parentId);
        const top = op.nodes[0];
        if (!top) throw new Error("add: no nodes");
        for (const n of op.nodes) {
          if (this.nodes.has(n.id)) throw new Error(`add: id already exists: ${n.id}`);
        }
        for (const n of op.nodes) this.nodes.set(n.id, structuredClone(n));
        this.require(top.id).parentId = parent.id;
        const index = Math.max(0, Math.min(op.index, parent.children.length));
        parent.children.splice(index, 0, top.id);
        return { kind: "remove", id: top.id };
      }
      case "remove": {
        if (op.id === ROOT_ID) throw new Error("Cannot remove the page");
        const node = this.require(op.id);
        const parent = this.require(node.parentId as string);
        const index = parent.children.indexOf(op.id);
        const removed = this.subtree(op.id).map((n) => structuredClone(n));
        removed[0]!.parentId = parent.id;
        for (const n of removed) this.nodes.delete(n.id);
        parent.children.splice(index, 1);
        return { kind: "add", nodes: removed, parentId: parent.id, index };
      }
      case "update": {
        const node = this.require(op.id);
        const prev: Record<string, unknown> = {};
        const target = node as unknown as Record<string, unknown>;
        for (const [key, value] of Object.entries(op.props)) {
          if (!(key in node) || key === "id" || key === "type" || key === "parentId" || key === "children") continue;
          prev[key] = target[key];
          target[key] = value;
        }
        return { kind: "update", id: op.id, props: prev };
      }
      case "reorder": {
        const node = this.require(op.id);
        const parent = this.require(node.parentId as string);
        const from = parent.children.indexOf(op.id);
        parent.children.splice(from, 1);
        const to = Math.max(0, Math.min(op.index, parent.children.length));
        parent.children.splice(to, 0, op.id);
        return { kind: "reorder", id: op.id, index: from };
      }
    }
  }

  toJSON(): DocJSON {
    return { version: 1, nodes: [...this.nodes.values()].map((n) => structuredClone(n)) };
  }

  /** Builds a document from untrusted JSON, throwing if the structure is inconsistent. */
  static fromJSON(data: unknown): DocumentModel {
    if (!data || typeof data !== "object") throw new Error("Invalid file");
    const { version, nodes } = data as { version?: unknown; nodes?: unknown };
    if (version !== 1 || !Array.isArray(nodes)) throw new Error("Unsupported file version");

    const doc = new DocumentModel();
    doc.nodes.clear();
    const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
    const str = (v: unknown, fallback: string) => (typeof v === "string" ? v : fallback);
    const color = (v: unknown) => (typeof v === "string" ? v : null);

    for (const raw of nodes as Record<string, unknown>[]) {
      if (!raw || typeof raw.id !== "string" || doc.nodes.has(raw.id)) throw new Error("Invalid node id");
      if (!NODE_TYPES.includes(raw.type as NodeType)) throw new Error("Invalid node type");
      const base = makeNode(raw.type as NodeType);
      doc.nodes.set(raw.id, {
        id: raw.id,
        type: raw.type as NodeType,
        name: str(raw.name, base.name),
        parentId: typeof raw.parentId === "string" ? raw.parentId : null,
        children: Array.isArray(raw.children) ? raw.children.filter((c): c is string => typeof c === "string") : [],
        x: num(raw.x, 0),
        y: num(raw.y, 0),
        width: Math.max(0, num(raw.width, base.width)),
        height: Math.max(0, num(raw.height, base.height)),
        fill: color(raw.fill),
        stroke: color(raw.stroke),
        strokeWidth: Math.max(0, num(raw.strokeWidth, 1)),
        cornerRadius: Math.max(0, num(raw.cornerRadius, 0)),
        opacity: Math.min(1, Math.max(0, num(raw.opacity, 1))),
        visible: raw.visible !== false,
        locked: raw.locked === true,
        clip: raw.clip === true,
        text: str(raw.text, ""),
        fontSize: Math.max(1, num(raw.fontSize, 16)),
      });
    }

    const root = doc.nodes.get(ROOT_ID);
    if (!root || root.parentId !== null) throw new Error("Missing page");
    const seen = new Set<string>();
    const walk = (id: string) => {
      if (seen.has(id)) throw new Error("Cycle in file");
      seen.add(id);
      const node = doc.nodes.get(id);
      if (!node) throw new Error("Dangling child reference");
      for (const c of node.children) {
        if (doc.nodes.get(c)?.parentId !== id) throw new Error("Inconsistent parent link");
        walk(c);
      }
    };
    walk(ROOT_ID);
    if (seen.size !== doc.nodes.size) throw new Error("Orphaned nodes in file");
    return doc;
  }
}
