import { DocumentModel, ROOT_ID, makeNode } from "./engine/document";
import type { Editor } from "./engine/editor";
import { measureText } from "./engine/text";

const KEY = "designer-friend:document:v1";

export function loadSaved(): DocumentModel | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? DocumentModel.fromJSON(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function startAutosave(editor: Editor): void {
  let timer: number | undefined;
  let lastSaved = -1;
  editor.onChange(() => {
    if (editor.panelVersion === lastSaved) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(editor.doc.toJSON()));
        lastSaved = editor.panelVersion;
      } catch {
        // Storage can be full or blocked (private mode). Editing keeps working without autosave.
      }
    }, 400);
  });
}

/** A small starter page so the canvas is not blank on first launch. */
export function seedDocument(): DocumentModel {
  const doc = new DocumentModel();
  const add = (type: Parameters<typeof makeNode>[0], parentId: string, props: Parameters<typeof makeNode>[1]) => {
    const node = makeNode(type, props);
    doc.apply({ kind: "add", nodes: [node], parentId, index: doc.require(parentId).children.length });
    return node.id;
  };
  const frame = add("frame", ROOT_ID, { name: "Welcome", x: 0, y: 0, width: 420, height: 300, fill: "#ffffff", cornerRadius: 12 });
  add("rect", frame, { name: "Accent", x: 24, y: 24, width: 72, height: 72, fill: "#4f7cff", cornerRadius: 16 });
  add("ellipse", frame, { name: "Dot", x: 112, y: 48, width: 24, height: 24, fill: "#ffb347" });
  const title = add("text", frame, { name: "Title", x: 24, y: 124, text: "Designer Friend", fontSize: 28 });
  const sub = add("text", frame, {
    name: "Subtitle",
    x: 24,
    y: 168,
    text: "Draw with R, O, F and T.\nPan with Space, zoom with Ctrl + scroll.",
    fontSize: 14,
    fill: "#666666",
  });
  for (const id of [title, sub]) {
    const n = doc.require(id);
    const m = measureText(n.text, n.fontSize);
    n.width = m.width;
    n.height = m.height;
  }
  return doc;
}
