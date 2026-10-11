import type { DeepReadonly } from "ts-essentials";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import type { CellRef, GemState } from "./game";
/** Immutable loaded resources; no running simulation is kept in the renderer. */
export interface Assets {
  readonly images: Readonly<Record<string, ImageBitmap>>;
  readonly effects: Readonly<Record<string, DeepReadonly<ParticleSystem>>>;
}
/** Presentation records derived when a board transition occurs. */
export interface Motion {
  readonly swap: readonly CellRef[];
  readonly before: readonly GemState[];
  readonly cleared: readonly { gem: GemState; wave: number }[];
  readonly created: readonly CellRef[];
  readonly dealTime: number;
  readonly clock: number;
}
export const emptyMotion = (): Motion => ({
  swap: [],
  before: [],
  cleared: [],
  created: [],
  dealTime: -10,
  clock: 0,
});
