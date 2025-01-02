import type { Crop, XY } from "~/utils/tauri";

type Size = XY<number>;

export type Props = {
  containerSize: Size,
  aspectRatio: number,
  showRuleOfThirds: boolean,
  value: Crop,
};

type Direction = "n" | "e" | "s" | "w" | "nw" | "ne" | "se" | "sw";
type BiNumber = 1 | 0;
type Handle = {
  position: [number, number];
  constraints: [BiNumber, BiNumber, BiNumber, BiNumber];
  direction: Direction;
  cursor: string;
  hovered: boolean;
}

const HANDLES: Omit<Handle, "hovered">[] = [
  { position: [0.0, 0.0], constraints: [1, 0, 0, 1], direction: "nw", cursor: "nwse" },
  { position: [0.5, 0.0], constraints: [1, 0, 0, 0], direction: "n", cursor: "nesw" },
  { position: [1.0, 0.0], constraints: [1, 1, 0, 0], direction: "ne", cursor: "nesw" },
  { position: [1.0, 0.5], constraints: [0, 1, 0, 0], direction: "e", cursor: "nwse" },
  { position: [1.0, 1.0], constraints: [0, 1, 1, 0], direction: "se", cursor: "ns" },
  { position: [0.5, 1.0], constraints: [0, 0, 1, 0], direction: "s", cursor: "ns" },
  { position: [0.0, 1.0], constraints: [0, 0, 1, 1], direction: "sw", cursor: "ew" },
  { position: [0.0, 0.5], constraints: [0, 0, 0, 1], direction: "w", cursor: "ew" }
];

