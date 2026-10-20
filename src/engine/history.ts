import type { DocumentModel } from "./document";
import type { Op } from "./types";

interface Entry {
  forward: Op[];
  inverse: Op[];
}

const MAX_ENTRIES = 500;

/** Merges repeated updates to the same node so a long drag becomes one small entry. */
function compact(ops: Op[]): Op[] {
  const out: Op[] = [];
  const lastUpdate = new Map<string, number>();
  for (const op of ops) {
    if (op.kind === "update") {
      const at = lastUpdate.get(op.id);
      if (at !== undefined) {
        const prev = out[at] as Extract<Op, { kind: "update" }>;
        prev.props = { ...prev.props, ...op.props };
        continue;
      }
      lastUpdate.set(op.id, out.length);
      out.push({ kind: "update", id: op.id, props: { ...op.props } });
    } else {
      lastUpdate.clear();
      out.push(op);
    }
  }
  return out;
}

/** Undo and redo over a DocumentModel using recorded inverse operations. */
export class History {
  private undoStack: Entry[] = [];
  private redoStack: Entry[] = [];
  private depth = 0;
  private forward: Op[] = [];
  private inverse: Op[] = [];

  constructor(
    private doc: DocumentModel,
    private onChange: () => void,
  ) {}

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get inTransaction(): boolean {
    return this.depth > 0;
  }

  begin(): void {
    this.depth++;
  }

  /** Applies an operation. Outside a transaction it becomes its own undo step. */
  apply(op: Op): void {
    if (this.depth === 0) {
      this.begin();
      try {
        this.apply(op);
      } finally {
        this.commit();
      }
      return;
    }
    const inv = this.doc.apply(op);
    this.forward.push(op);
    this.inverse.unshift(inv);
    this.onChange();
  }

  commit(): void {
    if (this.depth === 0) return;
    this.depth--;
    if (this.depth > 0) return;
    if (this.forward.length > 0) {
      this.undoStack.push({ forward: compact(this.forward), inverse: compact(this.inverse) });
      if (this.undoStack.length > MAX_ENTRIES) this.undoStack.shift();
      this.redoStack = [];
    }
    this.forward = [];
    this.inverse = [];
    this.onChange();
  }

  /** Rolls back everything applied in the open transaction without recording it. */
  cancel(): void {
    if (this.depth === 0) return;
    for (const op of this.inverse) this.doc.apply(op);
    this.depth = 0;
    this.forward = [];
    this.inverse = [];
    this.onChange();
  }

  run<T>(fn: () => T): T {
    this.begin();
    try {
      return fn();
    } finally {
      this.commit();
    }
  }

  undo(): boolean {
    if (this.depth > 0) return false;
    const entry = this.undoStack.pop();
    if (!entry) return false;
    for (const op of entry.inverse) this.doc.apply(op);
    this.redoStack.push(entry);
    this.onChange();
    return true;
  }

  redo(): boolean {
    if (this.depth > 0) return false;
    const entry = this.redoStack.pop();
    if (!entry) return false;
    for (const op of entry.forward) this.doc.apply(op);
    this.undoStack.push(entry);
    this.onChange();
    return true;
  }
}
