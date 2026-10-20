import type { Editor } from "../engine/editor";
import { worldOrigin } from "../engine/geometry";
import { fontCss, lineHeight } from "../engine/text";

/** In-place text editing: a textarea laid over the canvas at the node's on-screen position. */
export function mountTextEditor(editor: Editor, area: HTMLTextAreaElement): (id: string) => void {
  let activeId: string | null = null;
  let startViewport = editor.viewport;

  const close = (commit: boolean) => {
    const id = activeId;
    if (!id) return;
    activeId = null;
    editor.editingTextId = null;
    area.hidden = true;
    const node = editor.doc.get(id);
    if (!node) return;
    const value = area.value;
    if (commit) {
      if (value.trim() === "") {
        editor.select([id]);
        editor.deleteSelection();
      } else {
        editor.setText(id, value);
      }
    }
    editor.emit();
  };

  area.addEventListener("blur", () => close(true));
  area.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") close(true);
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) close(true);
  });
  area.addEventListener("input", () => {
    // Grow with the text so nothing is clipped while typing.
    const lines = area.value.split("\n");
    area.rows = lines.length;
    area.style.width = `${Math.max(...lines.map((l) => l.length), 1) + 2}ch`;
  });

  // Moving the viewport while editing would leave the box misplaced, so commit instead.
  editor.onChange(() => {
    if (activeId && editor.viewport !== startViewport) close(true);
  });

  return (id: string) => {
    const node = editor.doc.get(id);
    if (!node || node.type !== "text") return;
    const vp = editor.viewport;
    const o = worldOrigin(editor.doc, id);
    activeId = id;
    startViewport = vp;
    editor.editingTextId = id;
    editor.emit();

    area.hidden = false;
    area.value = node.text;
    area.style.left = `${o.x * vp.zoom + vp.x}px`;
    area.style.top = `${o.y * vp.zoom + vp.y}px`;
    area.style.font = fontCss(node.fontSize * vp.zoom);
    area.style.lineHeight = `${lineHeight(node.fontSize) * vp.zoom}px`;
    area.style.color = node.fill ?? "#1a1a1a";
    area.rows = node.text.split("\n").length;
    area.style.width = `${Math.max(node.width * vp.zoom, 40)}px`;
    area.style.height = "auto";
    area.focus();
    area.select();
  };
}
