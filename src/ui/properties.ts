import type { Editor } from "../engine/editor";
import { evalExpression, round2 } from "../engine/math";
import type { Node, NodeProps } from "../engine/types";

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

const SHORTCUTS: [string, string][] = [
  ["V F R O T H", "Move, Frame, Rect, Ellipse, Text, Hand"],
  ["Space + drag", "Pan the canvas"],
  ["Ctrl + scroll", "Zoom (pinch on touch)"],
  ["Shift + 1 / 2 / 0", "Fit, selection, 100%"],
  ["Ctrl + Z / Shift + Z", "Undo, redo"],
  ["Ctrl + D", "Duplicate"],
  ["Ctrl + [ / ]", "Send backward, bring forward"],
  ["Arrows (Shift = 10)", "Nudge"],
  ["Enter / Shift + Enter", "Select children, select parent"],
  ["Two-finger tap", "Undo on touch"],
];

type Shown<T> = T | "mixed";

function common<T>(nodes: Node[], pick: (n: Node) => T): Shown<T> {
  const first = pick(nodes[0]!);
  return nodes.every((n) => pick(n) === first) ? first : "mixed";
}

export function mountProperties(editor: Editor, host: HTMLElement): void {
  let lastVersion = -1;

  const section = (title: string): [HTMLElement, HTMLElement] => {
    const s = document.createElement("div");
    s.className = "section";
    const h = document.createElement("h4");
    h.textContent = title;
    const g = document.createElement("div");
    g.className = "grid2";
    s.append(h, g);
    return [s, g];
  };

  const field = (label: string, wide = false): { wrap: HTMLElement; input: HTMLInputElement } => {
    const wrap = document.createElement("div");
    wrap.className = "field" + (wide ? " wide" : "");
    const l = document.createElement("label");
    l.textContent = label;
    const input = document.createElement("input");
    input.type = "text";
    input.autocomplete = "off";
    input.inputMode = "decimal";
    wrap.append(l, input);
    return { wrap, input };
  };

  const numberField = (
    parent: HTMLElement,
    label: string,
    get: (n: Node) => number,
    set: (value: number) => NodeProps,
    opts: { min?: number; max?: number; wide?: boolean } = {},
  ) => {
    const { wrap, input } = field(label, opts.wide);
    parent.append(wrap);
    const commit = () => {
      const v = evalExpression(input.value);
      if (v === null) return render(true);
      const clamped = Math.min(opts.max ?? Infinity, Math.max(opts.min ?? -Infinity, v));
      editor.setProps(editor.selection, set(clamped));
      render(true);
    };
    input.addEventListener("change", commit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") input.blur();
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const cur = evalExpression(input.value) ?? 0;
        input.value = String(cur + (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 10 : 1));
        commit();
      }
    });
    return (nodes: Node[]) => {
      const v = common(nodes, get);
      if (document.activeElement !== input) input.value = v === "mixed" ? "" : String(round2(v));
      input.placeholder = v === "mixed" ? "Mixed" : "";
    };
  };

  const colorField = (
    parent: HTMLElement,
    label: string,
    get: (n: Node) => string | null,
    set: (value: string | null) => NodeProps,
  ) => {
    const { wrap, input } = field(label, true);
    input.inputMode = "text";
    const picker = document.createElement("input");
    picker.type = "color";
    picker.setAttribute("aria-label", `${label} colour`);
    wrap.insertBefore(picker, input);
    parent.append(wrap);
    picker.addEventListener("change", () => {
      editor.setProps(editor.selection, set(picker.value));
      render(true);
    });
    input.addEventListener("change", () => {
      const raw = input.value.trim();
      if (raw === "") editor.setProps(editor.selection, set(null));
      else {
        const hex = raw.startsWith("#") ? raw : `#${raw}`;
        if (HEX.test(hex)) editor.setProps(editor.selection, set(hex.toLowerCase()));
      }
      render(true);
    });
    input.addEventListener("keydown", (e) => e.key === "Enter" && input.blur());
    return (nodes: Node[]) => {
      const v = common(nodes, get);
      if (document.activeElement !== input) input.value = v === "mixed" ? "" : (v ?? "");
      input.placeholder = v === "mixed" ? "Mixed" : "none";
      picker.value = typeof v === "string" && /^#[0-9a-f]{6}/i.test(v) ? v.slice(0, 7) : "#cccccc";
    };
  };

  // Build the controls once and just update their values on change.
  const [layout, layoutGrid] = section("Layout");
  const syncX = numberField(layoutGrid, "X", (n) => n.x, (v) => ({ x: v }));
  const syncY = numberField(layoutGrid, "Y", (n) => n.y, (v) => ({ y: v }));
  const syncW = numberField(layoutGrid, "W", (n) => n.width, (v) => ({ width: v }), { min: 1 });
  const syncH = numberField(layoutGrid, "H", (n) => n.height, (v) => ({ height: v }), { min: 1 });

  const [appearance, appGrid] = section("Appearance");
  const syncOpacity = numberField(appGrid, "%", (n) => Math.round(n.opacity * 100), (v) => ({ opacity: v / 100 }), { min: 0, max: 100 });
  const syncRadius = numberField(appGrid, "R", (n) => n.cornerRadius, (v) => ({ cornerRadius: v }), { min: 0 });

  const [fill, fillGrid] = section("Fill");
  const syncFill = colorField(fillGrid, "Fill", (n) => n.fill, (v) => ({ fill: v }));

  const [stroke, strokeGrid] = section("Stroke");
  const syncStroke = colorField(strokeGrid, "Line", (n) => n.stroke, (v) => ({ stroke: v }));
  const syncStrokeW = numberField(strokeGrid, "W", (n) => n.strokeWidth, (v) => ({ strokeWidth: v }), { min: 0, wide: true });

  const [typo, typoGrid] = section("Text");
  const contentWrap = document.createElement("div");
  contentWrap.className = "field wide multiline";
  const contentLabel = document.createElement("label");
  contentLabel.textContent = "Aa";
  const contentArea = document.createElement("textarea");
  contentArea.rows = 3;
  contentArea.spellcheck = false;
  contentWrap.append(contentLabel, contentArea);
  typoGrid.append(contentWrap);
  contentArea.addEventListener("change", () => {
    const id = editor.selection[0];
    if (id) editor.setText(id, contentArea.value);
    render(true);
  });
  contentArea.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) contentArea.blur();
  });
  const sizeField = field("S", true);
  typoGrid.append(sizeField.wrap);
  sizeField.input.addEventListener("change", () => {
    const v = evalExpression(sizeField.input.value);
    const id = editor.selection[0];
    if (v !== null && id) editor.setText(id, editor.doc.require(id).text, Math.max(1, Math.min(500, v)));
    render(true);
  });
  sizeField.input.addEventListener("keydown", (e) => e.key === "Enter" && sizeField.input.blur());

  const help = document.createElement("div");
  help.className = "section";
  help.innerHTML = `<h4>Shortcuts</h4>${SHORTCUTS.map(([k, v]) => `<div class="hint"><strong>${k}</strong><br>${v}</div>`).join("")}`;

  const hint = document.createElement("div");
  hint.className = "hint";
  hint.textContent = "Select a layer to edit its properties.";

  host.replaceChildren(hint, layout, appearance, fill, stroke, typo, help);

  function render(force = false): void {
    if (!force && editor.panelVersion === lastVersion) return;
    lastVersion = editor.panelVersion;
    const nodes = editor.selection.map((id) => editor.doc.get(id)).filter((n): n is Node => !!n);
    const any = nodes.length > 0;
    const single = nodes.length === 1 ? nodes[0]! : null;
    hint.hidden = any;
    help.hidden = any;
    layout.hidden = !single;
    appearance.hidden = !any;
    fill.hidden = !any;
    stroke.hidden = !any || nodes.every((n) => n.type === "text");
    typo.hidden = !single || single.type !== "text";
    if (!any) return;

    syncX(nodes);
    syncY(nodes);
    syncW(nodes);
    syncH(nodes);
    syncOpacity(nodes);
    syncRadius(nodes);
    syncFill(nodes);
    syncStroke(nodes);
    syncStrokeW(nodes);
    if (single?.type === "text") {
      if (document.activeElement !== contentArea) contentArea.value = single.text;
      if (document.activeElement !== sizeField.input) sizeField.input.value = String(single.fontSize);
    }
  }

  editor.onChange(() => render());
  render(true);
}
