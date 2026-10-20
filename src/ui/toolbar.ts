import type { Editor } from "../engine/editor";
import type { Tool } from "../engine/types";
import { icons, type IconName } from "./icons";

interface ToolDef {
  tool: Tool;
  icon: IconName;
  label: string;
  key: string;
}

const TOOLS: ToolDef[] = [
  { tool: "move", icon: "move", label: "Move", key: "V" },
  { tool: "frame", icon: "frame", label: "Frame", key: "F" },
  { tool: "rect", icon: "rect", label: "Rectangle", key: "R" },
  { tool: "ellipse", icon: "ellipse", label: "Ellipse", key: "O" },
  { tool: "text", icon: "text", label: "Text", key: "T" },
  { tool: "hand", icon: "hand", label: "Hand", key: "H" },
];

function button(icon: IconName, label: string, extraClass = ""): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `btn ${extraClass}`.trim();
  b.title = label;
  b.setAttribute("aria-label", label);
  b.innerHTML = icons[icon];
  return b;
}

export interface FileActions {
  exportPng: () => void;
  saveJson: () => void;
  openJson: () => void;
}

export function mountToolbar(
  editor: Editor,
  toolsEl: HTMLElement,
  actionsEl: HTMLElement,
  panels: { layers: HTMLElement; props: HTMLElement },
  file: FileActions,
): void {
  const toolButtons = new Map<Tool, HTMLButtonElement>();
  for (const def of TOOLS) {
    const b = button(def.icon, `${def.label} (${def.key})`);
    b.addEventListener("click", () => editor.setTool(def.tool));
    toolsEl.append(b);
    toolButtons.set(def.tool, b);
  }

  const undo = button("undo", "Undo (Ctrl+Z)");
  const redo = button("redo", "Redo (Ctrl+Shift+Z)");
  const fit = button("fit", "Zoom to fit (Shift+1)");
  const multi = button("multi", "Multi-select (touch)");
  const layers = button("layers", "Layers", "only-small");
  const props = button("props", "Properties", "only-small");
  const fileBtn = button("file", "File");

  undo.addEventListener("click", () => editor.undo());
  redo.addEventListener("click", () => editor.redo());
  fit.addEventListener("click", () => editor.zoomToFit());
  multi.addEventListener("click", () => {
    editor.multiSelect = !editor.multiSelect;
    editor.emit();
  });

  const closeOthers = (keep: HTMLElement) => {
    for (const p of [panels.layers, panels.props]) if (p !== keep) p.classList.remove("open");
  };
  layers.addEventListener("click", () => {
    closeOthers(panels.layers);
    panels.layers.classList.toggle("open");
  });
  props.addEventListener("click", () => {
    closeOthers(panels.props);
    panels.props.classList.toggle("open");
  });

  // File menu
  const menu = document.createElement("div");
  menu.className = "menu";
  menu.hidden = true;
  const items: [string, () => void][] = [
    ["Export PNG (2x)", file.exportPng],
    ["Save as JSON", file.saveJson],
    ["Open JSON…", file.openJson],
  ];
  for (const [text, fn] of items) {
    const m = document.createElement("button");
    m.type = "button";
    m.textContent = text;
    m.addEventListener("click", () => {
      menu.hidden = true;
      fn();
    });
    menu.append(m);
  }
  fileBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const r = fileBtn.getBoundingClientRect();
    menu.hidden = !menu.hidden;
    menu.style.right = `${Math.max(8, window.innerWidth - r.right)}px`;
    if (r.top > window.innerHeight / 2) {
      menu.style.bottom = `${window.innerHeight - r.top + 6}px`;
      menu.style.top = "auto";
    } else {
      menu.style.top = `${r.bottom + 6}px`;
      menu.style.bottom = "auto";
    }
  });
  document.addEventListener("click", () => (menu.hidden = true));
  document.body.append(menu);

  const sep = () => {
    const s = document.createElement("span");
    s.className = "sep";
    return s;
  };
  actionsEl.append(undo, redo, sep(), fit, multi, sep(), layers, props, fileBtn);

  const sync = () => {
    for (const [tool, b] of toolButtons) b.setAttribute("aria-pressed", String(editor.tool === tool));
    multi.setAttribute("aria-pressed", String(editor.multiSelect));
    undo.disabled = !editor.history.canUndo;
    redo.disabled = !editor.history.canRedo;
  };
  editor.onChange(sync);
  sync();
}
