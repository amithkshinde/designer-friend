import "./style.css";
import { downloadBlob as download, unsupportedReason } from "./engine/compat";
import { DocumentModel } from "./engine/document";
import { Editor } from "./engine/editor";
import { InputController } from "./engine/input";
import { Renderer } from "./engine/renderer";
import { loadSaved, seedDocument, startAutosave } from "./persistence";
import { mountLayers } from "./ui/layers";
import { mountProperties } from "./ui/properties";
import { mountTextEditor } from "./ui/textEditor";
import { mountToolbar } from "./ui/toolbar";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as T;
};

const unsupported = unsupportedReason();
if (unsupported) {
  document.body.innerHTML = `<div style="padding:24px;max-width:480px;margin:auto;font:16px system-ui,sans-serif;color:#ececf1"><h2>This browser is not supported</h2><p>${unsupported} Please use a recent version of Chrome, Edge, Firefox or Safari.</p></div>`;
  throw new Error(unsupported);
}

const editor = new Editor(loadSaved() ?? seedDocument());
const canvas = $<HTMLCanvasElement>("canvas");
const renderer = new Renderer(canvas, editor);
const startTextEdit = mountTextEditor(editor, $<HTMLTextAreaElement>("text-editor"));
new InputController(canvas, editor, startTextEdit);

const fileInput = document.createElement("input");
fileInput.type = "file";
fileInput.accept = "application/json,.json";
fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  fileInput.value = "";
  if (!file) return;
  try {
    editor.loadDocument(DocumentModel.fromJSON(JSON.parse(await file.text())));
  } catch (err) {
    window.alert(`Could not open that file: ${err instanceof Error ? err.message : "unknown error"}`);
  }
});

mountToolbar(editor, $("tools"), $("actions"), { layers: $("layers-panel"), props: $("props-panel") }, {
  exportPng: async () => {
    const ids = editor.selection.length > 0 ? editor.topLevelSelection() : editor.doc.root.children;
    const blob = await renderer.exportPng(ids, 2);
    if (blob) download(blob, "design.png");
    else window.alert("Nothing to export yet.");
  },
  saveJson: () => download(new Blob([JSON.stringify(editor.doc.toJSON(), null, 2)], { type: "application/json" }), "design.json"),
  openJson: () => fileInput.click(),
});
mountLayers(editor, $("layers"));
mountProperties(editor, $("props"));

const zoomChip = $("zoom-chip");
const updateZoom = () => (zoomChip.textContent = `${Math.round(editor.viewport.zoom * 100)}%`);
editor.onChange(updateZoom);

startAutosave(editor);
renderer.resize();
editor.zoomToFit();
updateZoom();
