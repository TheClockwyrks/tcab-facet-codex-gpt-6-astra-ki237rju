import * as C from "./constants";
import type { CellRef, FacetState, PointerDevice, Screen } from "./game";
import { adjacent, cellX, cellY, same } from "./board";
import {
  nextLevel,
  openRound,
  quit,
  requestSwap,
  show,
  silent,
} from "./simulation";
import type { Emit } from "./simulation";
export interface Target {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
export function menuItems(screen: Screen): readonly string[] {
  switch (screen) {
    case "title":
      return C.TITLE_ITEMS;
    case "paused":
      return C.PAUSED_ITEMS;
    case "levelclear":
      return C.LEVELCLEAR_ITEMS;
    case "gameover":
      return C.GAMEOVER_ITEMS;
    default:
      return [];
  }
}
export function targets(screen: Screen): Target[] {
  if (screen === "playing")
    return [{ id: "pause", x: 1052, y: 36, w: 160, h: C.TARGET_MIN_H }];
  if (screen === "howto")
    return [{ id: "back", x: 64, y: 600, w: 180, h: C.TARGET_MIN_H }];
  return menuItems(screen).map((_, i) => ({
    id: `menu-${i}`,
    x: screen === "title" ? 160 : 490,
    y: (screen === "title" ? 414 : 400) + i * 88,
    w: 300,
    h: C.TARGET_MIN_H,
  }));
}
export function confirm(s: FacetState): FacetState {
  if (s.menuIndex === 1)
    return s.screen === "title"
      ? show(s, "howto")
      : menuItems(s.screen).length
        ? quit(s)
        : s;
  if (s.menuIndex !== 0) return s;
  switch (s.screen) {
    case "title":
    case "gameover":
      return openRound(s);
    case "paused":
      return show(s, "playing");
    case "levelclear":
      return nextLevel(s);
    default:
      return s;
  }
}
export function action(s: FacetState, name: C.ActionName): FacetState {
  if ((name === "up" || name === "down") && menuItems(s.screen).length)
    return {
      ...s,
      menuIndex:
        (s.menuIndex + (name === "up" ? -1 : 1) + menuItems(s.screen).length) %
        menuItems(s.screen).length,
    };
  if (name === "confirm") return confirm(s);
  if (name === "pause" && (s.screen === "playing" || s.screen === "paused"))
    return show(s, s.screen === "playing" ? "paused" : "playing");
  if (name === "back" && (s.screen === "howto" || s.screen === "gameover"))
    return show(s, "title", s.screen === "howto" ? 1 : 0);
  return s;
}
function hit(s: FacetState, x: number, y: number): CellRef | null {
  let nearest: CellRef | null = null,
    distance = C.GEM_HIT_R ** 2;
  for (const g of s.board.cells) {
    const d = (x - cellX(g.col)) ** 2 + (y - cellY(g.row)) ** 2;
    if (d <= distance && (d < distance || !nearest)) {
      nearest = { col: g.col, row: g.row };
      distance = d;
    }
  }
  return nearest;
}
export function pointer(
  s: FacetState,
  type: "down" | "move" | "up",
  x: number,
  y: number,
  device: PointerDevice = "mouse",
  emit: Emit = silent,
): FacetState {
  if (
    !["mouse", "pen", "touch"].includes(device) ||
    !Number.isFinite(x) ||
    !Number.isFinite(y)
  )
    throw new Error("Invalid pointer");
  s = {
    ...s,
    pointer: {
      x,
      y,
      device,
      down: type === "down" || (type === "move" && s.pointer.down),
    },
  };
  const target = targets(s.screen).find(
    (t) => x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h,
  );
  if (
    target &&
    (type === "down" || (type === "move" && !s.pointer.down)) &&
    target.id.startsWith("menu-")
  )
    s = { ...s, menuIndex: Number(target.id.slice(5)) };
  if (type === "down") {
    s = { ...s, armedTarget: target?.id ?? null };
    if (target || s.screen !== "playing") return s;
    const cell = hit(s, x, y);
    if (!cell) return { ...s, selection: null, offer: null };
    if (same(cell, s.selection)) return { ...s, offer: null };
    if (s.selection && adjacent(cell, s.selection))
      return { ...s, offer: cell };
    emit(C.CUES.select);
    return { ...s, selection: cell, offer: null };
  }
  if (
    type === "move" &&
    s.pointer.down &&
    s.screen === "playing" &&
    !s.armedTarget &&
    s.selection
  ) {
    const cell = hit(s, x, y);
    if (same(cell, s.selection)) return { ...s, offer: null };
    if (cell && adjacent(cell, s.selection)) return { ...s, offer: cell };
  }
  if (type === "up") {
    const armed = s.armedTarget;
    s = { ...s, armedTarget: null };
    if (armed) {
      if (target?.id !== armed) return s;
      return armed === "pause"
        ? action(s, "pause")
        : armed === "back"
          ? action(s, "back")
          : confirm(s);
    }
    if (s.screen === "playing" && s.selection && s.offer)
      return {
        ...requestSwap(s, s.selection, s.offer, emit),
        selection: null,
        offer: null,
      };
  }
  return s;
}
