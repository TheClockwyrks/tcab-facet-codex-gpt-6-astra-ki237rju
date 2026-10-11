import { describe, expect, it, vi } from "vitest";
import * as C from "./constants";
import { debug } from "./debug";
import {
  adjacent,
  cellX,
  cellY,
  deal,
  exchange,
  index,
  legalSwap,
  parseBoard,
  parseGem,
  productive,
  runs,
} from "./board";
import { action, pointer, targets } from "./controls";
import {
  advance,
  initial,
  lastFall,
  nextLevel,
  openRound,
  quit,
  requestSwap,
  resolveStep,
  stepHold,
} from "./simulation";
import type { FacetState, Screen } from "./game";

const pattern = Array.from({ length: C.GRID_ROWS }, (_, r) =>
  Array.from(
    { length: C.GRID_COLS },
    (_, c) => `${"RACJBSM"[(c + r * 2) % C.GEM_KIND_COUNT]}0`,
  ).join(" "),
);
function state(): FacetState {
  let s = debug.setScreen(
    debug.loadBoard(initial({ images: {}, effects: {} }), pattern),
    "playing",
  );
  for (let c = 0; c < C.GRID_COLS; c++)
    s = debug.setRefillKinds(
      s,
      c,
      Array.from(
        { length: C.GRID_ROWS },
        (_, r) => "RACJBSM"[(r * 2 + c + 3) % C.GEM_KIND_COUNT],
      ).join(""),
    );
  return s;
}
function line(s: FacetState, row = 4, length = 3, token = "R0"): FacetState {
  for (let c = 1; c <= length; c++) s = debug.setGem(s, c, row, token);
  return { ...s, phase: "resolving" as const, chainStep: 1 };
}
function swapReady(): FacetState {
  let s = state();
  for (const [c, r] of [
    [0, 0],
    [1, 0],
    [2, 1],
  ])
    s = debug.setGem(s, c, r, "R0");
  s = debug.setGem(s, 2, 0, "J0");
  return s;
}

describe("board geometry, notation and dealing", () => {
  it("reads every kind, strain and cut and rejects invalid notation", () => {
    expect(parseGem("X3", 1, 2)).toEqual({
      col: 1,
      row: 2,
      kind: null,
      strain: 3,
      cut: "prism",
      fell: 0,
    });
    expect(parseGem("S1b", 0, 0).cut).toBe("brilliant");
    expect(parseGem("C0s", 0, 0).cut).toBe("star");
    for (const token of ["X0b", "Q0", "R4", "R", "R0bb"])
      expect(() => parseGem(token, 0, 0)).toThrow();
    expect(() => parseBoard([])).toThrow();
    expect(() => parseBoard(pattern.map(() => "R0"))).toThrow();
    expect(cellX(0)).toBe(388);
    expect(cellY(7)).toBe(648);
  });
  it("deals only settled productive boards with every gem arriving from above", () => {
    for (let i = 0; i < 40; i++) {
      const b = deal();
      expect(runs(b)).toHaveLength(0);
      expect(legalSwap(b)).toBe(true);
      expect(
        b.cells.every(
          (g) => g.cut === "plain" && g.strain === 0 && g.fell >= g.row + 1,
        ),
      ).toBe(true);
    }
  });
  it("finds maximal runs, excluding prisms, and every legal direction", () => {
    let s = line(state(), 4, 5);
    s = debug.setGem(s, 4, 2, "X0");
    s = debug.setGem(s, 6, 4, "J0");
    expect(runs(s.board).some((r) => r.cells.length === 5)).toBe(true);
    expect(legalSwap(state().board)).toBe(false);
    expect(adjacent({ col: 0, row: 0 }, { col: 1, row: 1 })).toBe(false);
    expect(
      productive(swapReady().board, { col: 2, row: 0 }, { col: 2, row: 1 }),
    ).toBe(true);
    expect(
      exchange(swapReady().board, { col: 2, row: 0 }, { col: 2, row: 1 })
        .cells[2].fell,
    ).toBe(0);
  });
});
describe("resolution rules", () => {
  it("scores the union and strains each outside neighbor once", () => {
    const before = line(state());
    const after = resolveStep(before);
    expect(after.lastCleared).toBe(3);
    expect(after.lastPoints).toBe(30);
    expect(after.score).toBe(30);
    expect(after.levelScore).toBe(30);
    expect(after.moveScore).toBe(30);
    expect(after.board.cells.some((g) => g.strain === 1)).toBe(true);
    expect(before.score).toBe(0);
    expect(before.board.cells.every((g) => !g.strain)).toBe(true);
  });
  it("expands flawed stones in least-distance waves and scores them twice", () => {
    let s = line(state());
    s = debug.setGem(s, 4, 4, "A3");
    s = debug.setGem(s, 5, 4, "C3");
    s = debug.setGem(s, 6, 4, "J2");
    const cue = vi.fn();
    const next = resolveStep(s, cue);
    expect(next.lastCleared).toBe(5);
    expect(next.lastWaves).toBe(2);
    expect(next.lastPoints).toBe(70);
    expect(next.board.cells[index({ col: 6, row: 4 })].strain).toBe(3);
    expect(cue).toHaveBeenCalledWith(C.CUES.flaw);
  });
  it("chains brilliant, star and flawed expansion to closure", () => {
    let s = line(state());
    s = debug.setGem(s, 2, 4, "R0b");
    s = debug.setGem(s, 3, 3, "J0s");
    s = debug.setGem(s, 4, 2, "B3");
    const next = resolveStep(s);
    expect(next.lastCleared).toBe(20);
    expect(next.lastWaves).toBeGreaterThanOrEqual(2);
    const ids = next.motion.cleared.map((x) => index(x.gem));
    expect(new Set(ids).size).toBe(ids.length);
  });
  it.each([
    [4, "brilliant"],
    [5, "prism"],
    [6, "prism"],
  ] as const)("creates the cut for a line of %i", (length, cut) => {
    const next = resolveStep(line(state(), 4, length));
    expect(next.board.cells.some((g) => g.cut === cut && g.strain === 0)).toBe(
      true,
    );
    expect(next.board.cells.filter((g) => g.cut === cut)).toHaveLength(1);
  });
  it("places the run cut at the lowest-index swapped cell", () => {
    let s = line(state(), 4, 4);
    s = {
      ...s,
      motion: {
        ...s.motion,
        swap: [
          { col: 4, row: 4 },
          { col: 3, row: 4 },
        ],
      },
    };
    const next = resolveStep(s);
    expect(next.board.cells.find((g) => g.cut === "brilliant")?.col).toBe(3);
  });
  it("creates a star at an intersection, and prism wins an overlapping placement", () => {
    let s = line(state(), 4, 3);
    for (const r of [3, 5]) s = debug.setGem(s, 2, r, "R0");
    expect(resolveStep(s).board.cells.some((g) => g.cut === "star")).toBe(true);
    s = line(s, 4, 5);
    s = {
      ...s,
      motion: {
        ...s.motion,
        swap: [
          { col: 2, row: 4 },
          { col: 2, row: 3 },
        ],
      },
    };
    const next = resolveStep(s);
    expect(next.board.cells.some((g) => g.cut === "prism")).toBe(true);
    expect(next.board.cells.some((g) => g.cut === "star")).toBe(false);
  });
  it("a prism swap seeds all of the partner kind without creating cuts", () => {
    let s = state();
    s = debug.setGem(s, 1, 0, "X0");
    const kind = s.board.cells[0].kind;
    const count = s.board.cells.filter((g) => g.kind === kind).length + 1;
    s = requestSwap(s, { col: 0, row: 0 }, { col: 1, row: 0 });
    s = advance(s, C.SWAP_SECONDS);
    expect(s.lastCleared).toBe(count);
    expect(s.motion.created).toHaveLength(0);
    expect(s.chainStep).toBe(1);
  });
  it("two prisms clear the whole board, refill from above, and preserve the pose", () => {
    let s = debug.setGem(debug.setGem(state(), 0, 0, "X0"), 1, 0, "X3");
    s = advance(
      requestSwap(s, { col: 0, row: 0 }, { col: 1, row: 0 }),
      C.SWAP_SECONDS,
    );
    expect(s.lastCleared).toBe(C.GRID_ROWS * C.GRID_COLS);
    expect(s.lastPoints).toBe(650);
    expect(
      s.board.cells.every(
        (g) => g.fell >= g.row + 1 && g.strain === 0 && g.cut === "plain",
      ),
    ).toBe(true);
    expect(s.refillKinds[0]).not.toBe("");
  });
  it("preserves the order, strain and cut of survivors and keeps fell at rest", () => {
    let s = line(state());
    s = debug.setGem(s, 2, 0, "B1s");
    const next = resolveStep(s);
    const survivor = next.board.cells.find((g) => g.cut === "star");
    expect(survivor?.strain).toBe(1);
    expect(survivor?.row).toBe(1);
    expect(survivor?.fell).toBe(1);
    const resting = advance(next, stepHold(next));
    expect(resting.phase).toBe("idle");
    expect(resting.board.cells).toEqual(next.board.cells);
  });
  it("caps points at the eighth multiplier and tracks the deepest chain", () => {
    const s = resolveStep({ ...line(state()), chainStep: 14 });
    expect(s.lastPoints).toBe(240);
    expect(s.bestChain).toBe(14);
  });
});
describe("timers and round lifecycle", () => {
  it("accepts a swap immediately, clearing only at the swap boundary", () => {
    let s = requestSwap(swapReady(), { col: 2, row: 0 }, { col: 2, row: 1 });
    expect(s.phase).toBe("swapping");
    expect(s.score).toBe(0);
    s = advance(s, C.SWAP_SECONDS - 0.01);
    expect(s.score).toBe(0);
    s = advance(s, 0.01);
    expect(s.score).toBeGreaterThan(0);
    expect(s.swapTimer).toBe(0);
  });
  it("refuses nonproductive, nonadjacent and busy swaps without exchanging", () => {
    for (const [s, a, b] of [
      [state(), { col: 0, row: 0 }, { col: 1, row: 0 }],
      [state(), { col: 0, row: 0 }, { col: 2, row: 0 }],
      [
        { ...state(), phase: "resolving" as const },
        { col: 0, row: 0 },
        { col: 1, row: 0 },
      ],
    ] as const) {
      const next = requestSwap(s, a, b);
      expect(next.board).toBe(s.board);
      expect(next.refusal?.a).toEqual(a);
    }
    let s = requestSwap(state(), { col: 0, row: 0 }, { col: 1, row: 0 });
    s = advance(s, C.REFUSAL_SECONDS);
    expect(s.refusal).toBeNull();
  });
  it("freezes board timers on every nonplaying screen", () => {
    const swapping = requestSwap(
      swapReady(),
      { col: 2, row: 0 },
      { col: 2, row: 1 },
    );
    for (const screen of [
      "title",
      "howto",
      "paused",
      "levelclear",
      "gameover",
    ] as Screen[])
      expect(advance({ ...swapping, screen }, 10).swapTimer).toBe(0);
  });
  it("spends a long delta across phases exactly like small frames", () => {
    const start = requestSwap(
      swapReady(),
      { col: 2, row: 0 },
      { col: 2, row: 1 },
    );
    let many = start;
    for (let i = 0; i < 37; i++) many = advance(many, 0.01);
    const one = advance(start, 0.37);
    expect(one.board).toEqual(many.board);
    expect(one.phase).toBe(many.phase);
    expect(one.stepTimer).toBeCloseTo(many.stepTimer);
    expect(one.score).toBe(many.score);
  });
  it("levels take precedence over no moves and the next level resets its figures", () => {
    let s: FacetState = {
      ...state(),
      phase: "resolving" as const,
      chainStep: 2,
      levelScore: C.LEVEL_TARGET_STEP,
      bestChain: 2,
      moveScore: 120,
      score: 4000,
    };
    s = advance(s, stepHold(s));
    expect(s.screen).toBe("levelclear");
    expect(s.bestMove).toBe(120);
    const next = nextLevel(s);
    expect(next.level).toBe(2);
    expect(next.score).toBe(4000);
    expect(next.levelScore).toBe(0);
    expect(next.bestChain).toBe(0);
    expect(next.bestMove).toBe(0);
  });
  it("a settled dead board ends the round and a posed board never ends itself", () => {
    const s = state();
    expect(advance(s, 10).screen).toBe("playing");
    expect(
      advance({ ...s, phase: "resolving", chainStep: 1 }, C.STEP_SECONDS)
        .screen,
    ).toBe("gameover");
  });
  it("fresh rounds clear round totals; quit abandons only the board", () => {
    const s = {
      ...state(),
      score: 500,
      level: 3,
      levelScore: 100,
      selection: { col: 0, row: 0 },
    };
    const q = quit(s);
    expect(q.board.cells).toHaveLength(0);
    expect(q.score).toBe(500);
    expect(q.selection).toBeNull();
    const r = openRound(q);
    expect(r.level).toBe(1);
    expect(r.score).toBe(0);
    expect(legalSwap(r.board)).toBe(true);
  });
});
describe("pointer, menus and diagnostic poses", () => {
  it.each(["mouse", "touch", "pen"] as const)(
    "selects, offers, withdraws, then plays on release with %s",
    (device) => {
      let s = swapReady();
      const x = cellX(2),
        y = cellY(0);
      s = pointer(s, "down", x, y, device);
      expect(s.selection).toEqual({ col: 2, row: 0 });
      s = pointer(s, "move", x, y + C.CELL_PITCH, device);
      expect(s.offer).toEqual({ col: 2, row: 1 });
      expect(s.phase).toBe("idle");
      s = pointer(s, "move", x, y, device);
      expect(s.offer).toBeNull();
      s = pointer(s, "move", x, y + C.CELL_PITCH, device);
      s = pointer(s, "move", 0, 0, device);
      expect(s.offer).not.toBeNull();
      s = pointer(s, "up", 0, 0, device);
      expect(s.phase).toBe("swapping");
      expect(s.selection).toBeNull();
      expect(s.offer).toBeNull();
    },
  );
  it("supports tapping a neighbor and the lower-index hit-test tie", () => {
    let s = swapReady();
    s = debug.pointerDown(s, cellX(2), cellY(0));
    s = debug.pointerUp(s);
    s = debug.pointerDown(s, cellX(2), cellY(1));
    expect(s.offer).not.toBeNull();
    s = debug.pointerUp(s);
    expect(s.phase).toBe("swapping");
    s = debug.pointerDown(state(), cellX(0) + C.GEM_HIT_R, cellY(0));
    expect(s.selection).toEqual({ col: 0, row: 0 });
    s = debug.pointerDown(s, 0, 0);
    expect(s.selection).toBeNull();
  });
  it("moves selection to nonadjacent cells and withdraws offers on re-press", () => {
    let s = debug.pointerDown(state(), cellX(0), cellY(0));
    s = debug.pointerDown(s, cellX(7), cellY(7));
    expect(s.selection).toEqual({ col: 7, row: 7 });
    s = debug.setOffer(s, 6, 7);
    s = debug.pointerDown(s, cellX(7), cellY(7));
    expect(s.offer).toBeNull();
  });
  it("targets are usable, nonoverlapping, drawn inside the stage and activate on release only", () => {
    for (const screen of [
      "title",
      "howto",
      "playing",
      "paused",
      "levelclear",
      "gameover",
    ] as Screen[]) {
      const ts = targets(screen);
      for (const t of ts) {
        expect(t.w).toBeGreaterThanOrEqual(C.TARGET_MIN_W);
        expect(t.h).toBeGreaterThanOrEqual(C.TARGET_MIN_H);
        expect(t.x + t.w).toBeLessThanOrEqual(C.STAGE_W);
        expect(t.y + t.h).toBeLessThanOrEqual(C.STAGE_H);
      }
      let s = { ...state(), screen };
      const t = ts[0];
      s = debug.pointerDown(s, t.x + 20, t.y + 20, "touch");
      expect(s.armedTarget).toBe(t.id);
      expect(s.screen).toBe(screen);
      s = debug.pointerUp(s, "touch");
      expect(s.screen).not.toBe(screen);
      expect(s.armedTarget).toBeNull();
    }
  });
  it("cancels a menu press outside and highlights hover", () => {
    let s = debug.setScreen(state(), "title");
    const t = targets("title")[1];
    s = debug.pointerMove(s, t.x + 10, t.y + 10);
    expect(s.menuIndex).toBe(1);
    s = debug.pointerDown(s, t.x + 10, t.y + 10);
    s = debug.pointerMove(s, 0, 0);
    s = debug.pointerUp(s);
    expect(s.screen).toBe("title");
  });
  it("wraps keyboard navigation and follows every screen transition", () => {
    let s = initial({ images: {}, effects: {} });
    s = action(s, "up");
    expect(s.menuIndex).toBe(1);
    s = action(s, "confirm");
    expect(s.screen).toBe("howto");
    s = action(s, "back");
    expect(s.menuIndex).toBe(1);
    s = action(s, "down");
    expect(s.menuIndex).toBe(0);
    s = action(s, "confirm");
    expect(s.screen).toBe("playing");
    s = action(s, "pause");
    expect(s.screen).toBe("paused");
    s = action(s, "confirm");
    expect(s.screen).toBe("playing");
    s = action(s, "pause");
    s = action(s, "down");
    s = action(s, "confirm");
    expect(s.screen).toBe("title");
    expect(s.board.cells).toHaveLength(0);
  });
  it("poses change only their named value, reconcile is pure, reset retains mute", () => {
    let s = state();
    s = debug.setMenuIndex(s, 30);
    s = debug.setScore(s, 500);
    s = debug.setLevel(s, 4);
    s = debug.setLevelScore(s, 800);
    s = debug.setBestChain(s, 9);
    s = debug.setBestMove(s, 200);
    s = debug.setMoveScore(s, 100);
    s = debug.setSelection(s, 7, 7);
    s = debug.setOffer(s, 0, 0);
    const snap = debug.snapshot(s);
    expect(snap.levelTarget).toBe(8000);
    expect(snap.legalSwap).toBe(false);
    expect(snap.lastFall).toBe(0);
    expect(snap.stepHold).toBe(C.STEP_SECONDS);
    expect(debug.reconcile(s)).toEqual(s);
    const posed = debug.loadBoard(s, pattern);
    expect(posed.score).toBe(500);
    expect(posed.selection).toEqual(s.selection);
    expect(debug.clearBoard(s).selection).toEqual(s.selection);
    expect(debug.clearSelection(s).offer).toEqual(s.offer);
    expect(debug.clearOffer(s).selection).toEqual(s.selection);
    expect(debug.clearChain(s).score).toBe(500);
    expect(debug.clearRefillKinds(s).refillKinds.every((k) => k === "")).toBe(
      true,
    );
    expect(lastFall(debug.dealBoard(s))).toBeGreaterThan(0);
    expect(debug.clearRefusal(s).refusal).toBeNull();
    const reset = debug.reset({ ...s, muted: true });
    expect(reset).toEqual(initial(s.assets, true));
  });
  it("fails loudly for invalid poses", () => {
    const s = state();
    for (const op of [
      () => debug.setMenuIndex(s, -1),
      () => debug.setLevel(s, 0),
      () => debug.setScore(s, NaN),
      () => debug.setBestChain(s, 0.3),
      () => debug.setGem(s, 8, 0, "R0"),
      () => debug.setRefillKinds(s, 0, "X"),
      () => debug.setScreen(s, "other" as Screen),
      () => debug.setSelection(s, 1, -1),
      () => debug.setGem(debug.clearBoard(s), 0, 0, "R0"),
      () => debug.requestSwap(debug.clearBoard(s), 0, 0, 1, 0),
    ])
      expect(op).toThrow();
  });
});
