import * as C from "./constants";
import type { BoardState, CellRef, Cut, GemKind, GemState } from "./game";
export const letters = "RACJBSM";
export const cellX = (col: number) =>
  C.BOARD_CX - ((C.GRID_COLS - 1) * C.CELL_PITCH) / 2 + col * C.CELL_PITCH;
export const cellY = (row: number) =>
  C.BOARD_CY - ((C.GRID_ROWS - 1) * C.CELL_PITCH) / 2 + row * C.CELL_PITCH;
export const index = (c: CellRef) => c.row * C.GRID_COLS + c.col;
export const same = (a: CellRef | null, b: CellRef | null) =>
  !!a && !!b && a.col === b.col && a.row === b.row;
export const adjacent = (a: CellRef, b: CellRef) =>
  Math.abs(a.col - b.col) + Math.abs(a.row - b.row) === 1;
export function validateCell(col: number, row: number) {
  if (
    !Number.isInteger(col) ||
    !Number.isInteger(row) ||
    col < 0 ||
    row < 0 ||
    col >= C.GRID_COLS ||
    row >= C.GRID_ROWS
  )
    throw new RangeError("Cell outside board");
}
export function parseGem(token: string, col: number, row: number): GemState {
  if (!/^(?:[RACJBSM][0-3][bs]?|X[0-3])$/.test(token))
    throw new Error(`Invalid gem token: ${token}`);
  const kind = token[0] === "X" ? null : C.GEM_KINDS[letters.indexOf(token[0])];
  const cut: Cut =
    kind === null
      ? "prism"
      : token[2] === "b"
        ? "brilliant"
        : token[2] === "s"
          ? "star"
          : "plain";
  return { col, row, kind, cut, strain: Number(token[1]), fell: 0 };
}
export function parseBoard(rows: readonly string[]): BoardState {
  if (rows.length !== C.GRID_ROWS) throw new Error("Expected eight rows");
  const cells = rows.flatMap((row, r) => {
    const tokens = row.trim().split(/\s+/);
    if (tokens.length !== C.GRID_COLS)
      throw new Error("Expected eight columns");
    return tokens.map((t, c) => parseGem(t, c, r));
  });
  return { cols: C.GRID_COLS, rows: C.GRID_ROWS, cells };
}
export interface Run {
  readonly cells: readonly number[];
  readonly vertical: boolean;
  readonly kind: GemKind;
}
export function runs(board: BoardState): Run[] {
  const result: Run[] = [];
  if (!board.cells.length) return result;
  for (const vertical of [false, true]) {
    for (let line = 0; line < (vertical ? board.cols : board.rows); line++) {
      const limit = vertical ? board.rows : board.cols;
      for (let start = 0; start < limit;) {
        const at = (n: number) =>
          vertical ? n * board.cols + line : line * board.cols + n;
        const kind = board.cells[at(start)].kind;
        let end = start + 1;
        while (
          end < limit &&
          kind !== null &&
          board.cells[at(end)].kind === kind
        )
          end++;
        if (kind && end - start >= C.MATCH_MIN)
          result.push({
            kind,
            vertical,
            cells: Array.from({ length: end - start }, (_, i) => at(start + i)),
          });
        start = end;
      }
    }
  }
  return result;
}
export function exchange(
  board: BoardState,
  a: CellRef,
  b: CellRef,
): BoardState {
  const cells = [...board.cells];
  cells[index(a)] = {
    ...board.cells[index(b)],
    col: a.col,
    row: a.row,
    fell: 0,
  };
  cells[index(b)] = {
    ...board.cells[index(a)],
    col: b.col,
    row: b.row,
    fell: 0,
  };
  return { ...board, cells };
}
export function productive(board: BoardState, a: CellRef, b: CellRef): boolean {
  return (
    board.cells.length > 0 &&
    adjacent(a, b) &&
    (board.cells[index(a)].cut === "prism" ||
      board.cells[index(b)].cut === "prism" ||
      runs(exchange(board, a, b)).length > 0)
  );
}
export function legalSwap(board: BoardState): boolean {
  return board.cells.some((g) =>
    [
      { col: g.col + 1, row: g.row },
      { col: g.col, row: g.row + 1 },
    ].some(
      (b) =>
        b.col < board.cols && b.row < board.rows && productive(board, g, b),
    ),
  );
}
export const randomKind = () =>
  C.GEM_KINDS[Math.floor(Math.random() * C.GEM_KIND_COUNT)];
export function deal(): BoardState {
  for (;;) {
    const cells: GemState[] = [];
    for (let row = 0; row < C.GRID_ROWS; row++)
      for (let col = 0; col < C.GRID_COLS; col++) {
        let kind: GemKind;
        do {
          kind = randomKind();
        } while (
          (col >= 2 &&
            cells[cells.length - 1].kind === kind &&
            cells[cells.length - 2].kind === kind) ||
          (row >= 2 &&
            cells[cells.length - C.GRID_COLS].kind === kind &&
            cells[cells.length - C.GRID_COLS * 2].kind === kind)
        );
        cells.push({
          col,
          row,
          kind,
          cut: "plain",
          strain: 0,
          fell: C.GRID_ROWS,
        });
      }
    const board = { cols: C.GRID_COLS, rows: C.GRID_ROWS, cells };
    if (legalSwap(board)) return board;
  }
}
export function neighbors(g: CellRef, diagonal = false): number[] {
  const result: number[] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if ((!dx && !dy) || (!diagonal && Math.abs(dx) + Math.abs(dy) !== 1))
        continue;
      const col = g.col + dx,
        row = g.row + dy;
      if (col >= 0 && col < C.GRID_COLS && row >= 0 && row < C.GRID_ROWS)
        result.push(index({ col, row }));
    }
  return result;
}
