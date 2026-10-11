import * as C from "./constants";
import type { Assets } from "./presentation";
import { emptyMotion } from "./presentation";
import type { BoardState, CellRef, FacetState, GemState, Screen } from "./game";
import {
  adjacent,
  deal,
  exchange,
  index,
  legalSwap,
  letters,
  neighbors,
  productive,
  randomKind,
  runs,
  validateCell,
} from "./board";
export type Emit = (cue: C.CueName, rung?: number) => void;
export const silent: Emit = () => {};
export function initial(assets: Assets, muted = false): FacetState {
  return {
    assets,
    motion: emptyMotion(),
    screen: "title",
    menuIndex: 0,
    board: { cols: 0, rows: 0, cells: [] },
    phase: "idle",
    chainStep: 0,
    swapTimer: 0,
    stepTimer: 0,
    score: 0,
    level: 1,
    levelScore: 0,
    lastCleared: 0,
    lastPoints: 0,
    lastWaves: 0,
    moveScore: 0,
    bestMove: 0,
    bestChain: 0,
    selection: null,
    offer: null,
    refusal: null,
    armedTarget: null,
    pointer: { x: 0, y: 0, down: false, device: "mouse" },
    simTime: 0,
    muted,
    refillKinds: Array<string>(C.GRID_COLS).fill(""),
  };
}
export const lastFall = (s: FacetState) =>
  Math.max(0, ...s.board.cells.map((g) => g.fell));
export const stepHold = (s: FacetState) =>
  s.lastWaves * C.WAVE_SECONDS +
  lastFall(s) * C.FALL_SECONDS_PER_ROW +
  C.STEP_SECONDS;
export const show = (
  s: FacetState,
  screen: Screen,
  menuIndex = 0,
): FacetState => ({ ...s, screen, menuIndex, armedTarget: null });
export function openRound(s: FacetState): FacetState {
  const fresh = initial(s.assets, s.muted);
  return {
    ...fresh,
    refillKinds: s.refillKinds,
    screen: "playing",
    board: deal(),
    simTime: s.simTime,
    pointer: s.pointer,
    motion: { ...emptyMotion(), dealTime: 0 },
  };
}
export function nextLevel(s: FacetState): FacetState {
  return {
    ...s,
    screen: "playing",
    menuIndex: 0,
    armedTarget: null,
    board: deal(),
    level: s.level + 1,
    levelScore: 0,
    bestMove: 0,
    bestChain: 0,
    selection: null,
    offer: null,
    refusal: null,
    motion: { ...emptyMotion(), dealTime: 0 },
  };
}
export function quit(s: FacetState): FacetState {
  return {
    ...show(s, "title"),
    board: { cols: 0, rows: 0, cells: [] },
    phase: "idle",
    chainStep: 0,
    swapTimer: 0,
    stepTimer: 0,
    selection: null,
    offer: null,
    refusal: null,
    motion: emptyMotion(),
  };
}
export function requestSwap(
  s: FacetState,
  a: CellRef,
  b: CellRef,
  emit: Emit = silent,
): FacetState {
  validateCell(a.col, a.row);
  validateCell(b.col, b.row);
  if (!s.board.cells.length) throw new Error("No board in play");
  if (s.phase !== "idle" || !adjacent(a, b) || !productive(s.board, a, b)) {
    emit(C.CUES.refuse);
    return { ...s, refusal: { a, b, timer: 0 } };
  }
  emit(C.CUES.swap);
  return {
    ...s,
    board: exchange(s.board, a, b),
    phase: "swapping",
    swapTimer: 0,
    chainStep: 0,
    stepTimer: 0,
    moveScore: 0,
    refusal: null,
    motion: {
      ...s.motion,
      swap: [a, b],
      before: s.board.cells,
      cleared: [],
      created: [],
    },
  };
}
/** Breadth-first expansion gives the least wave, independently of traversal order. */
export function resolveStep(s: FacetState, emit: Emit = silent): FacetState {
  const cells = s.board.cells;
  let matches = runs(s.board);
  const waves = new Map<number, number>();
  const swapped = s.motion.swap.map((c) => cells[index(c)]);
  if (s.chainStep === 1 && swapped.some((g) => g.cut === "prism")) {
    matches = [];
    const both = swapped.every((g) => g.cut === "prism");
    const kind = swapped.find((g) => g.cut !== "prism")?.kind;
    cells.forEach((g, i) => {
      if (
        both ||
        g.kind === kind ||
        (g.cut === "prism" && s.motion.swap.some((c) => index(c) === i))
      )
        waves.set(i, 0);
    });
  } else matches.forEach((run) => run.cells.forEach((i) => waves.set(i, 0)));
  const queue = [...waves.keys()];
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head],
      gem = cells[i],
      wave = waves.get(i)!;
    const add = neighbors(gem).filter((j) => cells[j].strain === C.MAX_STRAIN);
    if (gem.cut === "brilliant") add.push(...neighbors(gem, true));
    if (gem.cut === "star")
      cells.forEach((g, j) => {
        if (g.col === gem.col || g.row === gem.row) add.push(j);
      });
    for (const j of add)
      if (!waves.has(j)) {
        waves.set(j, wave + 1);
        queue.push(j);
      }
  }
  const multiplier = Math.min(s.chainStep, C.MAX_MULTIPLIER);
  const points = queue.reduce(
    (sum, i) =>
      sum +
      (cells[i].strain === C.MAX_STRAIN ? C.FLAWED_SCORE : C.BASE_SCORE) *
        multiplier,
    0,
  );
  const created = new Map<number, GemState>();
  const priority = { plain: 0, brilliant: 1, star: 2, prism: 3 };
  const create = (i: number, cut: GemState["cut"]) => {
    if (priority[created.get(i)?.cut ?? "plain"] >= priority[cut]) return;
    created.set(i, {
      ...cells[i],
      cut,
      kind: cut === "prism" ? null : cells[i].kind,
      strain: 0,
      fell: 0,
    });
  };
  for (const run of matches) {
    if (run.cells.length >= C.MATCH_MIN + 1) {
      const chosen =
        run.cells.find((i) => s.motion.swap.some((c) => index(c) === i)) ??
        run.cells[Math.floor((run.cells.length - 1) / 2)];
      create(
        chosen,
        run.cells.length >= C.MATCH_MIN + 2 ? "prism" : "brilliant",
      );
    }
    for (const other of matches)
      if (run.vertical !== other.vertical)
        for (const i of run.cells)
          if (other.cells.includes(i)) create(i, "star");
  }
  const remaining: (GemState | null)[] = cells.map((gem, i) => {
    if (waves.has(i)) return created.get(i) ?? null;
    const strain = Math.min(
      C.MAX_STRAIN,
      gem.strain + (neighbors(gem).some((j) => waves.has(j)) ? 1 : 0),
    );
    if (strain === C.MAX_STRAIN && gem.strain < strain) emit(C.CUES.flaw);
    return { ...gem, strain, fell: 0 };
  });
  const settled: GemState[] = [...cells];
  const createdDest: CellRef[] = [];
  for (let col = 0; col < C.GRID_COLS; col++) {
    let to = C.GRID_ROWS - 1;
    for (let row = C.GRID_ROWS - 1; row >= 0; row--) {
      const i = index({ col, row }),
        gem = remaining[i];
      if (gem) {
        settled[index({ col, row: to })] = { ...gem, row: to, fell: to - row };
        if (created.has(i)) createdDest.push({ col, row: to });
        to--;
      }
    }
    const missing = to + 1;
    for (let row = 0; row <= to; row++) {
      const posed = s.refillKinds[col][row];
      settled[index({ col, row })] = {
        col,
        row,
        kind: posed ? C.GEM_KINDS[letters.indexOf(posed)] : randomKind(),
        strain: 0,
        cut: "plain",
        fell: missing,
      };
    }
  }
  emit(C.CUES.clear, multiplier);
  if (created.size) emit(C.CUES.cut);
  return {
    ...s,
    board: { ...s.board, cells: settled },
    score: s.score + points,
    levelScore: s.levelScore + points,
    moveScore: s.moveScore + points,
    lastCleared: queue.length,
    lastPoints: points,
    lastWaves: Math.max(0, ...waves.values()),
    bestChain: Math.max(s.bestChain, s.chainStep),
    motion: {
      ...s.motion,
      before: cells,
      cleared: queue.map((i) => ({ gem: cells[i], wave: waves.get(i)! })),
      created: createdDest,
    },
  };
}
/** Consume the full delta across phase boundaries, retaining the unspent remainder. */
export function advance(
  s: FacetState,
  dt: number,
  emit: Emit = silent,
): FacetState {
  if (s.screen !== "playing") return s;
  s = {
    ...s,
    motion: { ...s.motion, clock: s.motion.clock + dt },
    refusal:
      s.refusal && s.refusal.timer + dt < C.REFUSAL_SECONDS
        ? { ...s.refusal, timer: s.refusal.timer + dt }
        : null,
  };
  let left = dt;
  while (left > 1e-10 && s.phase !== "idle") {
    if (s.phase === "swapping") {
      const spend = Math.min(left, C.SWAP_SECONDS - s.swapTimer);
      s = { ...s, swapTimer: s.swapTimer + spend };
      left -= spend;
      if (s.swapTimer + 1e-10 >= C.SWAP_SECONDS)
        s = resolveStep(
          {
            ...s,
            phase: "resolving",
            swapTimer: 0,
            stepTimer: 0,
            chainStep: 1,
          },
          emit,
        );
    } else {
      const hold = stepHold(s),
        land = hold - C.STEP_SECONDS;
      const spend = Math.min(left, hold - s.stepTimer);
      if (
        s.stepTimer < land &&
        s.stepTimer + spend + 1e-10 >= land &&
        lastFall(s) > C.LAND_MIN_ROWS
      )
        emit(C.CUES.land);
      s = { ...s, stepTimer: s.stepTimer + spend };
      left -= spend;
      if (s.stepTimer + 1e-10 >= hold) {
        if (runs(s.board).length)
          s = resolveStep(
            { ...s, chainStep: s.chainStep + 1, stepTimer: 0 },
            emit,
          );
        else {
          s = {
            ...s,
            phase: "idle",
            chainStep: 0,
            stepTimer: 0,
            bestMove: Math.max(s.bestMove, s.moveScore),
          };
          if (s.levelScore >= C.LEVEL_TARGET_STEP * s.level) {
            s = show(s, "levelclear");
            emit(C.CUES.levelUp);
          } else if (!legalSwap(s.board)) {
            s = show(s, "gameover");
            emit(C.CUES.gameOver);
          }
        }
      }
    }
  }
  return s;
}
export function withBoard(s: FacetState, board: BoardState): FacetState {
  return { ...s, board };
}
