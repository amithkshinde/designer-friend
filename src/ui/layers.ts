import type { Editor } from "../engine/editor";
import type { Node, NodeType } from "../engine/types";
import { icons } from "./icons";

const KIND_GLYPH: Record<NodeType, string> = { frame: "#", rect: "▭", ellipse: "◯", text: "T" };

export function mountLayers(editor: Editor, host: HTMLElement): void {
  let renaming = false;
  let lastVersion = -1;

  const row = (node: Node, depth: number): HTMLElement => {
    const el = document.createElement("div");
    el.className = "layer" + (editor.selection.includes(node.id) ? " selected" : "");
    el.dataset.id = node.id;
    el.style.paddingLeft = `${6 + depth * 14}px`;

    const kind = document.createElement("span");
    kind.className = "kind";
    kind.textContent = KIND_GLYPH[node.type];

    const name = document.createElement("span");
    name.className = "name" + (node.visible ? "" : " dim");
    name.textContent = node.name;

    const vis = document.createElement("button");
    vis.type = "button";
    vis.className = "btn mini";
    vis.dataset.action = "visible";
    vis.setAttribute("aria-label", node.visible ? "Hide layer" : "Show layer");
    vis.innerHTML = node.visible ? icons.eye : icons.eyeOff;

    const lock = document.createElement("button");
    lock.type = "button";
    lock.className = "btn mini";
    lock.dataset.action = "lock";
    lock.setAttribute("aria-label", node.locked ? "Unlock layer" : "Lock layer");
    lock.innerHTML = node.locked ? icons.lock : icons.unlock;

    el.append(kind, name, vis, lock);
    return el;
  };

  const render = () => {
    if (renaming || editor.panelVersion === lastVersion) return;
    lastVersion = editor.panelVersion;
    const frag = document.createDocumentFragment();
    const walk = (id: string, depth: number) => {
      const children = editor.doc.require(id).children;
      // Front-most layer first, like a layers panel should read.
      for (let i = children.length - 1; i >= 0; i--) {
        const node = editor.doc.require(children[i]!);
        frag.append(row(node, depth));
        walk(node.id, depth + 1);
      }
    };
    walk(editor.doc.root.id, 0);
    host.replaceChildren(frag);
    if (!host.firstChild) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No layers yet. Pick a tool and draw on the canvas.";
      host.append(empty);
    }
  };

  host.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const rowEl = target.closest<HTMLElement>(".layer");
    if (!rowEl || target.tagName === "INPUT") return;
    const id = rowEl.dataset.id as string;
    const action = target.closest<HTMLElement>("[data-action]")?.dataset.action;
    if (action === "visible") {
      editor.setProps([id], { visible: !editor.doc.require(id).visible });
    } else if (action === "lock") {
      editor.setProps([id], { locked: !editor.doc.require(id).locked });
    } else if (e.shiftKey || editor.multiSelect) {
      editor.toggleSelect(id);
    } else {
      editor.select([id]);
    }
  });

  host.addEventListener("dblclick", (e) => {
    const nameEl = (e.target as HTMLElement).closest<HTMLElement>(".name");
    const rowEl = nameEl?.closest<HTMLElement>(".layer");
    if (!nameEl || !rowEl) return;
    const id = rowEl.dataset.id as string;
    const input = document.createElement("input");
    input.value = editor.doc.require(id).name;
    renaming = true;
    nameEl.replaceWith(input);
    input.focus();
    input.select();
    const finish = (commit: boolean) => {
      if (!renaming) return;
      renaming = false;
      const value = input.value.trim();
      if (commit && value) editor.setProps([id], { name: value });
      lastVersion = -1;
      render();
    };
    input.addEventListener("blur", () => finish(true));
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") finish(true);
      if (ev.key === "Escape") finish(false);
    });
  });

  editor.onChange(render);
  render();
}
