export const FONT_FAMILY = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export const lineHeight = (fontSize: number): number => Math.round(fontSize * 1.25);

export const fontCss = (fontSize: number): string => `${fontSize}px ${FONT_FAMILY}`;

let measureCtx: CanvasRenderingContext2D | null | undefined;

/** Measures auto-width text. Falls back to an estimate where no canvas exists (tests, SSR). */
export function measureText(text: string, fontSize: number): { width: number; height: number } {
  const lines = text.split("\n");
  if (measureCtx === undefined) {
    measureCtx = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
  }
  let width = 0;
  for (const line of lines) {
    if (measureCtx) {
      measureCtx.font = fontCss(fontSize);
      width = Math.max(width, measureCtx.measureText(line).width);
    } else {
      width = Math.max(width, line.length * fontSize * 0.55);
    }
  }
  return { width: Math.max(1, Math.ceil(width)), height: lineHeight(fontSize) * lines.length };
}
