import type { DeepReadonly } from "ts-essentials";
import * as C from "./constants";
import type { FacetState, PointerDevice, Screen } from "./game";
import {
  cellX,
  cellY,
  deal,
  index,
  legalSwap,
  parseBoard,
  parseGem,
  validateCell,
} from "./board";
import { initial, lastFall, requestSwap, stepHold } from "./simulation";
import { pointer, targets } from "./controls";
const integer = (value: number, min = 0) => {
  if (!Number.isInteger(value) || value < min)
    throw new RangeError("Expected nonnegative integer");
  return value;
};
const points = (value: number) => {
  if (!Number.isFinite(value) || value < 0)
    throw new RangeError("Invalid points");
  return value;
};
const cell = (col: number, row: number) => {
  validateCell(col, row);
  return { col, row };
};
export const debug = {
  version: C.FACET_DEBUG_VERSION,
  reset: (s: DeepReadonly<FacetState>): FacetState =>
    initial(s.assets, s.muted),
  reconcile: (s: DeepReadonly<FacetState>): FacetState => ({ ...s }),
  snapshot(s: DeepReadonly<FacetState>) {
    const { assets: _assets, motion: _motion, ...fields } = s;
    return {
      version: C.FACET_DEBUG_VERSION,
      ...fields,
      pointer: { ...s.pointer },
      selection: s.selection ? { ...s.selection } : null,
      offer: s.offer ? { ...s.offer } : null,
      refillKinds: [...s.refillKinds],
      board: {
        ...s.board,
        cells: s.board.cells.map((g) => ({
          ...g,
          x: cellX(g.col),
          y: cellY(g.row),
        })),
      },
      levelTarget: C.LEVEL_TARGET_STEP * s.level,
      multiplier: Math.min(s.chainStep, C.MAX_MULTIPLIER),
      lastFall: lastFall(s),
      stepHold: stepHold(s),
      legalSwap: legalSwap(s.board),
      targets: targets(s.screen),
      refusal: s.refusal
        ? { a: { ...s.refusal.a }, b: { ...s.refusal.b } }
        : null,
    };
  },
  setScreen(s: DeepReadonly<FacetState>, screen: Screen): FacetState {
    if (
      ![
        "title",
        "howto",
        "playing",
        "paused",
        "levelclear",
        "gameover",
      ].includes(screen)
    )
      throw new Error("Invalid screen");
    return { ...s, screen };
  },
  setMenuIndex: (
    s: DeepReadonly<FacetState>,
    menuIndex: number,
  ): FacetState => ({ ...s, menuIndex: integer(menuIndex) }),
  loadBoard: (
    s: DeepReadonly<FacetState>,
    rows: readonly string[],
  ): FacetState => ({ ...s, board: parseBoard(rows) }),
  dealBoard: (s: DeepReadonly<FacetState>): FacetState => ({
    ...s,
    board: deal(),
    motion: { ...s.motion, dealTime: s.motion.clock },
  }),
  clearBoard: (s: DeepReadonly<FacetState>): FacetState => ({
    ...s,
    board: { cols: 0, rows: 0, cells: [] },
  }),
  setGem(
    s: DeepReadonly<FacetState>,
    col: number,
    row: number,
    token: string,
  ): FacetState {
    validateCell(col, row);
    if (!s.board.cells.length) throw new Error("No board in play");
    const gem = parseGem(token, col, row);
    return {
      ...s,
      board: {
        ...s.board,
        cells: s.board.cells.map((g, i) => (i === index(gem) ? gem : g)),
      },
    };
  },
  setRefillKinds(
    s: DeepReadonly<FacetState>,
    col: number,
    kinds: string,
  ): FacetState {
    validateCell(col, 0);
    if (!/^[RACJBSM]*$/.test(kinds)) throw new Error("Invalid refill kinds");
    return {
      ...s,
      refillKinds: s.refillKinds.map((v, i) => (i === col ? kinds : v)),
    };
  },
  clearRefillKinds: (s: DeepReadonly<FacetState>): FacetState => ({
    ...s,
    refillKinds: Array<string>(C.GRID_COLS).fill(""),
  }),
  setScore: (s: DeepReadonly<FacetState>, score: number): FacetState => ({
    ...s,
    score: points(score),
  }),
  setLevel: (s: DeepReadonly<FacetState>, level: number): FacetState => ({
    ...s,
    level: integer(level, 1),
  }),
  setLevelScore: (
    s: DeepReadonly<FacetState>,
    levelScore: number,
  ): FacetState => ({ ...s, levelScore: points(levelScore) }),
  setBestChain: (
    s: DeepReadonly<FacetState>,
    bestChain: number,
  ): FacetState => ({ ...s, bestChain: integer(bestChain) }),
  setBestMove: (s: DeepReadonly<FacetState>, bestMove: number): FacetState => ({
    ...s,
    bestMove: points(bestMove),
  }),
  setMoveScore: (
    s: DeepReadonly<FacetState>,
    moveScore: number,
  ): FacetState => ({ ...s, moveScore: points(moveScore) }),
  setSelection: (
    s: DeepReadonly<FacetState>,
    col: number,
    row: number,
  ): FacetState => ({ ...s, selection: cell(col, row) }),
  clearSelection: (s: DeepReadonly<FacetState>): FacetState => ({
    ...s,
    selection: null,
  }),
  setOffer: (
    s: DeepReadonly<FacetState>,
    col: number,
    row: number,
  ): FacetState => ({ ...s, offer: cell(col, row) }),
  clearOffer: (s: DeepReadonly<FacetState>): FacetState => ({
    ...s,
    offer: null,
  }),
  clearRefusal: (s: DeepReadonly<FacetState>): FacetState => ({
    ...s,
    refusal: null,
  }),
  clearChain: (s: DeepReadonly<FacetState>): FacetState => ({
    ...s,
    phase: "idle",
    chainStep: 0,
    swapTimer: 0,
    stepTimer: 0,
  }),
  requestSwap: (
    s: DeepReadonly<FacetState>,
    colA: number,
    rowA: number,
    colB: number,
    rowB: number,
  ): FacetState => requestSwap(s, cell(colA, rowA), cell(colB, rowB)),
  pointerDown: (
    s: DeepReadonly<FacetState>,
    x: number,
    y: number,
    device: PointerDevice = "mouse",
  ): FacetState => pointer(s, "down", x, y, device),
  pointerMove: (
    s: DeepReadonly<FacetState>,
    x: number,
    y: number,
    device: PointerDevice = "mouse",
  ): FacetState => pointer(s, "move", x, y, device),
  pointerUp: (
    s: DeepReadonly<FacetState>,
    device: PointerDevice = "mouse",
  ): FacetState => pointer(s, "up", s.pointer.x, s.pointer.y, device),
};
