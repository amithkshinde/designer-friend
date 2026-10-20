export type NodeType = "frame" | "rect" | "ellipse" | "text";

export interface Node {
  id: string;
  type: NodeType;
  name: string;
  parentId: string | null;
  children: string[];
  /** Position relative to the parent node's origin. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** CSS colour, or null for no fill. For text nodes this is the text colour. */
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  cornerRadius: number;
  /** 0 to 1 */
  opacity: number;
  visible: boolean;
  locked: boolean;
  /** Frames only: clip children to the frame bounds. */
  clip: boolean;
  /** Text nodes only. */
  text: string;
  fontSize: number;
}

export type NodeProps = Partial<Omit<Node, "id" | "type" | "parentId" | "children">>;

export type Op =
  | { kind: "add"; nodes: Node[]; parentId: string; index: number }
  | { kind: "remove"; id: string }
  | { kind: "update"; id: string; props: NodeProps }
  | { kind: "reorder"; id: string; index: number };

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Viewport {
  /** Screen-space offset of the world origin, in CSS pixels. */
  x: number;
  y: number;
  zoom: number;
}

export type Tool = "move" | "frame" | "rect" | "ellipse" | "text" | "hand";

export const NODE_TYPES: readonly NodeType[] = ["frame", "rect", "ellipse", "text"];

export const TYPE_LABEL: Record<NodeType, string> = {
  frame: "Frame",
  rect: "Rectangle",
  ellipse: "Ellipse",
  text: "Text",
};
