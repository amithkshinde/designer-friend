import { describe, expect, it } from "vitest";
import { DocumentModel, ROOT_ID, makeNode } from "../src/engine/document";
import { Editor } from "../src/engine/editor";
import { History } from "../src/engine/history";
import { fitRect, hitTest, resizeBox, screenToWorld, worldRect, zoomAt } from "../src/engine/geometry";
import { evalExpression } from "../src/engine/math";

function sampleDoc() {
  const doc = new DocumentModel();
  const frame = makeNode("frame", { x: 100, y: 100, width: 200, height: 200 });
  const rect = makeNode("rect", { x: 10, y: 10, width: 50, height: 50 });
  doc.apply({ kind: "add", nodes: [frame], parentId: ROOT_ID, index: 0 });
  doc.apply({ kind: "add", nodes: [rect], parentId: frame.id, index: 0 });
  return { doc, frame, rect };
}

describe("evalExpression", () => {
  it("evaluates arithmetic with precedence and parentheses", () => {
    expect(evalExpression("100+24*2")).toBe(148);
    expect(evalExpression("(10+5)/3")).toBe(5);
    expect(evalExpression("-4 + 10")).toBe(6);
    expect(evalExpression("1.5*2")).toBe(3);
  });

  it("rejects invalid or unsafe input", () => {
    expect(evalExpression("")).toBeNull();
    expect(evalExpression("2+")).toBeNull();
    expect(evalExpression("alert(1)")).toBeNull();
    expect(evalExpression("1/0")).toBeNull();
    expect(evalExpression("(1+2")).toBeNull();
  });
});

describe("DocumentModel", () => {
  it("applies operations and returns working inverses", () => {
    const { doc, frame, rect } = sampleDoc();
    const inverse = doc.apply({ kind: "update", id: rect.id, props: { x: 99 } });
    expect(doc.require(rect.id).x).toBe(99);
    doc.apply(inverse);
    expect(doc.require(rect.id).x).toBe(10);

    const restore = doc.apply({ kind: "remove", id: frame.id });
    expect(doc.get(frame.id)).toBeUndefined();
    expect(doc.get(rect.id)).toBeUndefined();
    doc.apply(restore);
    expect(doc.require(rect.id).parentId).toBe(frame.id);
    expect(doc.root.children).toEqual([frame.id]);
  });

  it("refuses to remove the page or add duplicate ids", () => {
    const { doc, frame } = sampleDoc();
    expect(() => doc.apply({ kind: "remove", id: ROOT_ID })).toThrow();
    expect(() => doc.apply({ kind: "add", nodes: [frame], parentId: ROOT_ID, index: 0 })).toThrow();
  });

  it("reorders siblings", () => {
    const doc = new DocumentModel();
    const a = makeNode("rect");
    const b = makeNode("rect");
    doc.apply({ kind: "add", nodes: [a], parentId: ROOT_ID, index: 0 });
    doc.apply({ kind: "add", nodes: [b], parentId: ROOT_ID, index: 1 });
    const inv = doc.apply({ kind: "reorder", id: a.id, index: 1 });
    expect(doc.root.children).toEqual([b.id, a.id]);
    doc.apply(inv);
    expect(doc.root.children).toEqual([a.id, b.id]);
  });

  it("round-trips through JSON", () => {
    const { doc, rect } = sampleDoc();
    const copy = DocumentModel.fromJSON(JSON.parse(JSON.stringify(doc.toJSON())));
    expect(copy.require(rect.id).width).toBe(50);
    expect(copy.nodes.size).toBe(doc.nodes.size);
  });

  it("rejects corrupt files", () => {
    const { doc, frame } = sampleDoc();
    const json = doc.toJSON();
    expect(() => DocumentModel.fromJSON(null)).toThrow();
    expect(() => DocumentModel.fromJSON({ version: 2, nodes: [] })).toThrow();

    const orphan = structuredClone(json);
    orphan.nodes.find((n) => n.id === frame.id)!.children = [];
    expect(() => DocumentModel.fromJSON(orphan)).toThrow(/Orphan/);

    const badParent = structuredClone(json);
    badParent.nodes.find((n) => n.id === frame.id)!.parentId = "nope";
    expect(() => DocumentModel.fromJSON(badParent)).toThrow();
  });
});

describe("History", () => {
  it("undoes and redoes a transaction as one step", () => {
    const { doc, rect } = sampleDoc();
    const history = new History(doc, () => {});
    history.begin();
    for (let x = 11; x <= 40; x++) history.apply({ kind: "update", id: rect.id, props: { x } });
    history.commit();
    expect(doc.require(rect.id).x).toBe(40);
    history.undo();
    expect(doc.require(rect.id).x).toBe(10);
    history.redo();
    expect(doc.require(rect.id).x).toBe(40);
  });

  it("cancel rolls back without recording", () => {
    const { doc, rect } = sampleDoc();
    const history = new History(doc, () => {});
    history.begin();
    history.apply({ kind: "update", id: rect.id, props: { x: 77 } });
    history.cancel();
    expect(doc.require(rect.id).x).toBe(10);
    expect(history.canUndo).toBe(false);
  });

  it("clears redo after a new edit", () => {
    const { doc, rect } = sampleDoc();
    const history = new History(doc, () => {});
    history.apply({ kind: "update", id: rect.id, props: { x: 1 } });
    history.undo();
    expect(history.canRedo).toBe(true);
    history.apply({ kind: "update", id: rect.id, props: { x: 2 } });
    expect(history.canRedo).toBe(false);
  });
});

describe("geometry", () => {
  it("computes world rects through nested parents", () => {
    const { doc, rect } = sampleDoc();
    expect(worldRect(doc, rect.id)).toEqual({ x: 110, y: 110, width: 50, height: 50 });
  });

  it("drills into children only once the parent is selected", () => {
    const { doc, frame, rect } = sampleDoc();
    expect(hitTest(doc, 120, 120)).toBe(frame.id);
    expect(hitTest(doc, 120, 120, { selected: new Set([frame.id]) })).toBe(rect.id);
    expect(hitTest(doc, 120, 120, { deep: true })).toBe(rect.id);
    expect(hitTest(doc, 500, 500)).toBeNull();
  });

  it("ignores hidden and locked nodes when hit-testing", () => {
    const { doc, frame } = sampleDoc();
    doc.apply({ kind: "update", id: frame.id, props: { locked: true } });
    expect(hitTest(doc, 120, 120)).toBeNull();
  });

  it("keeps the point under the cursor fixed while zooming", () => {
    const vp = { x: 30, y: -20, zoom: 1.5 };
    const before = screenToWorld(vp, 200, 150);
    const after = screenToWorld(zoomAt(vp, 2, 200, 150), 200, 150);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("fits a rect inside the viewport", () => {
    const vp = fitRect({ x: 0, y: 0, width: 1000, height: 500 }, 800, 600, 50);
    expect(vp.zoom).toBeCloseTo(0.7);
  });

  it("resizes from handles and keeps aspect ratio on request", () => {
    const box = { x: 0, y: 0, width: 100, height: 50 };
    expect(resizeBox(box, "se", 20, 10, false)).toEqual({ x: 0, y: 0, width: 120, height: 60 });
    expect(resizeBox(box, "nw", 10, 10, false)).toEqual({ x: 10, y: 10, width: 90, height: 40 });
    const locked = resizeBox(box, "e", 100, 0, true);
    expect(locked.width / locked.height).toBeCloseTo(2);
    expect(resizeBox(box, "e", -500, 0, false).width).toBe(1);
  });
});

describe("Editor", () => {
  it("adds, selects, duplicates and deletes with undo", () => {
    const editor = new Editor();
    const id = editor.addNode("rect", ROOT_ID, { x: 5, y: 5 });
    editor.select([id]);
    editor.duplicateSelection();
    expect(editor.doc.root.children).toHaveLength(2);
    expect(editor.selection).not.toContain(id);
    editor.deleteSelection();
    expect(editor.doc.root.children).toEqual([id]);
    editor.undo();
    expect(editor.doc.root.children).toHaveLength(2);
    editor.undo();
    expect(editor.doc.root.children).toEqual([id]);
  });

  it("does not record no-op property changes", () => {
    const editor = new Editor();
    const id = editor.addNode("rect", ROOT_ID, { x: 5 });
    editor.setProps([id], { x: 5 });
    // The only undo step is the add itself, so one undo removes the node and nothing is left.
    editor.undo();
    expect(editor.doc.get(id)).toBeUndefined();
    expect(editor.history.canUndo).toBe(false);
  });

  it("drops deleted nodes from the selection after undo", () => {
    const editor = new Editor();
    const id = editor.addNode("ellipse", ROOT_ID);
    editor.select([id]);
    editor.undo();
    expect(editor.selection).toEqual([]);
  });

  it("changes z-order", () => {
    const editor = new Editor();
    const a = editor.addNode("rect", ROOT_ID);
    const b = editor.addNode("rect", ROOT_ID);
    editor.select([a]);
    editor.reorder("front");
    expect(editor.doc.root.children).toEqual([b, a]);
    editor.reorder("back");
    expect(editor.doc.root.children).toEqual([a, b]);
  });

  it("generates unique layer names", () => {
    const editor = new Editor();
    editor.addNode("rect", ROOT_ID);
    editor.addNode("rect", ROOT_ID);
    const names = editor.doc.root.children.map((id) => editor.doc.require(id).name);
    expect(new Set(names).size).toBe(2);
  });
});
