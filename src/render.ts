import type { DeepReadonly } from "ts-essentials";
import type { RenderApi } from "@clockwyrks/simple-2d";
import { ParticleSimulator } from "@clockwyrks/particle-runtime";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import * as C from "./constants";
import type { CellRef, FacetState, GemState } from "./game";
import { adjacent, cellX, cellY, index, same } from "./board";
import { menuItems, targets } from "./controls";

const ink = "#f1ecda",
  gold = "#d9be86",
  muted = "#8198a2",
  lineColor = "#29414b";
function text(
  ctx: CanvasRenderingContext2D,
  content: string,
  x: number,
  y: number,
  size = 16,
  color = ink,
  align: CanvasTextAlign = "left",
  serif = false,
) {
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.font = `${serif ? "" : "500 "}${size}px ${serif ? "Georgia, serif" : '"Trebuchet MS", sans-serif'}`;
  ctx.fillText(content, x, y);
}
function rule(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  color = lineColor,
) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, 1);
}
function tracking(
  ctx: CanvasRenderingContext2D,
  content: string,
  x: number,
  y: number,
  size = 12,
  color = muted,
  spacing = 3,
) {
  ctx.font = `500 ${size}px "Trebuchet MS", sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = "left";
  for (const char of content) {
    ctx.fillText(char, x, y);
    x += ctx.measureText(char).width + spacing;
  }
}
function sprite(
  ctx: CanvasRenderingContext2D,
  s: FacetState,
  path: string,
  x: number,
  y: number,
  size = C.GEM_R * 2 + 4,
) {
  const img = s.assets.images[path];
  if (img) ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
}
function gem(
  ctx: CanvasRenderingContext2D,
  s: FacetState,
  g: GemState,
  x: number,
  y: number,
  size = C.GEM_R * 2 + 4,
) {
  const path = `gems/${g.kind ?? "prism"}-${g.strain}.png`;
  if (g.cut === "prism") {
    const turn = `gems/prism-turn/${Math.floor(s.motion.clock * 7) % 8}.png`;
    sprite(ctx, s, g.strain === 0 ? turn : path, x, y, size);
    if (g.strain > 0) {
      ctx.save();
      ctx.globalAlpha *= 0.18;
      sprite(ctx, s, turn, x, y, size);
      ctx.restore();
    }
  } else {
    sprite(ctx, s, path, x, y, size);
    if (g.cut !== "plain") sprite(ctx, s, `gems/${g.cut}.png`, x, y, size);
  }
}
/** Reconstruct a bounded particle simulation from the transition's age. Rendering
 * never retains an emitter or advances authoritative state. */
function effect(
  ctx: CanvasRenderingContext2D,
  s: FacetState,
  name: string,
  x: number,
  y: number,
  age: number,
  seed: number,
) {
  if (age < 0 || (name !== "aura" && age > 1.1)) return;
  const system = s.assets.effects[name];
  if (!system) return;
  const sim = new ParticleSimulator(system as ParticleSystem, {
    seed,
    maxParticles: 64,
  });
  const elapsed = name === "aura" ? 1.2 + (age % 1.2) : age;
  for (let t = 0; t < elapsed; t += 1 / 30)
    sim.step(Math.min(1 / 30, elapsed - t) * 1000);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const p of sim.capture()) {
    ctx.globalAlpha = p.opacity;
    ctx.fillStyle = `rgb(${p.color.map((v) => Math.round(v * 255)).join(",")})`;
    const px = x + p.position[0],
      py = y - p.position[1],
      r = p.size;
    ctx.beginPath();
    ctx.moveTo(px, py - r * 1.8);
    ctx.lineTo(px + r, py);
    ctx.lineTo(px, py + r * 1.8);
    ctx.lineTo(px - r, py);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}
function background(ctx: CanvasRenderingContext2D) {
  const glow = ctx.createRadialGradient(
    C.STAGE_CX,
    C.STAGE_CY,
    10,
    C.STAGE_CX,
    C.STAGE_CY,
    730,
  );
  glow.addColorStop(0, "#15313b");
  glow.addColorStop(1, "#08141d");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
  // Fine architectural lines frame the bench without competing with the stones.
  ctx.strokeStyle = "#1d3038";
  ctx.lineWidth = 1;
  for (const x of [28, C.STAGE_W - 28]) {
    ctx.beginPath();
    ctx.moveTo(x, 24);
    ctx.lineTo(x, C.STAGE_H - 24);
    ctx.stroke();
  }
  rule(ctx, 28, 24, C.STAGE_W - 56);
  rule(ctx, 28, C.STAGE_H - 24, C.STAGE_W - 56);
  for (const x of [28, C.STAGE_W - 28])
    for (const y of [24, C.STAGE_H - 24]) {
      ctx.fillStyle = gold;
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }
}
function button(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  active: boolean,
  hint = "",
) {
  ctx.fillStyle = active ? "#ddc895" : "#10232d";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = active ? "#f8e3b3" : "#49606a";
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  tracking(
    ctx,
    label,
    x + 27,
    y + h / 2 + 5,
    15,
    active ? "#152a31" : "#d2ddda",
    2,
  );
  text(
    ctx,
    hint || "→",
    x + w - 26,
    y + h / 2 + 6,
    21,
    active ? "#31433b" : gold,
    "right",
  );
}
function title(ctx: CanvasRenderingContext2D, s: FacetState) {
  tracking(ctx, "THE LAPIDARY COLLECTION", 160, 118, 12, gold);
  rule(ctx, 160, 150, 74, gold);
  text(ctx, C.TITLE_TEXT, 150, 286, 108, ink, "left", true);
  tracking(ctx, C.TAGLINE_TEXT, 162, 334, 14, gold, 3.1);
  text(
    ctx,
    "Seven stones. One fault line. A beautiful chain reaction.",
    162,
    373,
    16,
    muted,
  );
  const ts = targets("title");
  ts.forEach((t, i) =>
    button(ctx, t.x, t.y, t.w, t.h, C.TITLE_ITEMS[i], s.menuIndex === i),
  );
  tracking(ctx, "A PUZZLE OF PATIENCE & PRESSURE", 160, 649, 10, muted, 2);
  // An oversized specimen and its seven-kind orbit, all using the shipped art.
  const cx = 906,
    cy = 345;
  ctx.save();
  ctx.strokeStyle = "#344a4e";
  for (const r of [132, 218, 234]) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.setLineDash([2, 9]);
  ctx.beginPath();
  ctx.arc(cx, cy, 194, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  for (let i = 0; i < C.GEM_KIND_COUNT; i++) {
    const a = (i / C.GEM_KIND_COUNT) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(a) * 216,
      y = cy + Math.sin(a) * 216;
    sprite(ctx, s, `gems/${C.GEM_KINDS[i]}-0.png`, x, y, 64);
  }
  ctx.save();
  ctx.shadowColor = "#62c3c144";
  ctx.shadowBlur = 55;
  sprite(ctx, s, "gems/prism-0.png", cx, cy, 232);
  ctx.restore();
  tracking(ctx, "SPECIMEN  /  008", 824, 624, 11, gold, 2);
  text(ctx, "The prism", cx, 655, 22, ink, "center", true);
}
function board(ctx: CanvasRenderingContext2D, s: FacetState) {
  const frame = s.assets.images["gems/board.png"];
  if (frame) {
    ctx.save();
    ctx.shadowColor = "#0009";
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 10;
    ctx.drawImage(frame, C.BOARD_CX - 306, C.BOARD_CY - 306);
    ctx.restore();
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(
    C.BOARD_CX - (C.GRID_COLS * C.CELL_PITCH) / 2,
    C.BOARD_CY - (C.GRID_ROWS * C.CELL_PITCH) / 2,
    C.GRID_COLS * C.CELL_PITCH,
    C.GRID_ROWS * C.CELL_PITCH,
  );
  ctx.clip();
  const shatterEnd = s.lastWaves * C.WAVE_SECONDS;
  for (const g of s.board.cells) {
    let x = cellX(g.col),
      y = cellY(g.row);
    if (s.phase === "swapping" && s.motion.swap.some((c) => same(c, g))) {
      const other = s.motion.swap.find((c) => !same(c, g))!;
      const p = Math.min(1, s.swapTimer / C.SWAP_SECONDS),
        ease = p * p * (3 - 2 * p);
      x = cellX(other.col) + (x - cellX(other.col)) * ease;
      y = cellY(other.row) + (y - cellY(other.row)) * ease;
    } else if (s.phase === "resolving") {
      const t = Math.max(0, s.stepTimer - shatterEnd),
        duration = g.fell * C.FALL_SECONDS_PER_ROW;
      const p = duration ? Math.min(1, t / duration) : 1;
      y -= g.fell * C.CELL_PITCH * (1 - p * p);
    } else if (
      s.motion.clock - s.motion.dealTime <
      C.GRID_ROWS * C.FALL_SECONDS_PER_ROW
    ) {
      const p = Math.min(
        1,
        (s.motion.clock - s.motion.dealTime) /
          (C.GRID_ROWS * C.FALL_SECONDS_PER_ROW),
      );
      y -= g.fell * C.CELL_PITCH * (1 - p * p);
    }
    let shown = g;
    if (s.selection && s.offer && adjacent(s.selection, s.offer)) {
      if (same(g, s.selection)) shown = s.board.cells[index(s.offer)];
      if (same(g, s.offer)) shown = s.board.cells[index(s.selection)];
    }
    gem(ctx, s, shown, x, y);
    if (shown.cut !== "plain")
      effect(ctx, s, "aura", x, y, s.motion.clock, index(g) * 47 + 19);
  }
  if (s.phase === "resolving") {
    for (const item of s.motion.cleared) {
      const age = s.stepTimer - item.wave * C.WAVE_SECONDS;
      const x = cellX(item.gem.col),
        y = cellY(item.gem.row);
      if (age < 0) gem(ctx, s, item.gem, x, y);
      else if (age < 0.23) {
        const f = Math.min(5, Math.floor(age / 0.038));
        if (item.gem.kind) {
          ctx.globalAlpha = 1 - age / 0.23;
          sprite(ctx, s, `gems/break/${item.gem.kind}/${f}.png`, x, y);
          ctx.globalAlpha = 1;
        }
      }
      effect(
        ctx,
        s,
        item.gem.strain === C.MAX_STRAIN ? "flawed" : "clear",
        x,
        y,
        age,
        index(item.gem) + Math.floor(s.motion.clock - s.stepTimer) * 101,
      );
    }
    for (const c of s.motion.created)
      effect(
        ctx,
        s,
        "cut",
        cellX(c.col),
        cellY(c.row),
        s.stepTimer -
          shatterEnd -
          s.board.cells[index(c)].fell * C.FALL_SECONDS_PER_ROW,
        index(c) + 499,
      );
  }
  ctx.restore();
  const mark = (cell: CellRef, color: string, dashed = false) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    if (dashed) ctx.setLineDash([4, 4]);
    ctx.strokeRect(
      cellX(cell.col) - C.GEM_HIT_R + 3,
      cellY(cell.row) - C.GEM_HIT_R + 3,
      C.GEM_HIT_R * 2 - 6,
      C.GEM_HIT_R * 2 - 6,
    );
    ctx.restore();
  };
  if (s.selection) mark(s.selection, "#fff1bb");
  if (s.offer) mark(s.offer, "#b7e9dd", true);
  if (s.refusal) {
    mark(s.refusal.a, "#ff7284");
    mark(s.refusal.b, "#ff7284");
  }
}
function hud(ctx: CanvasRenderingContext2D, s: FacetState) {
  text(ctx, C.TITLE_TEXT, 67, 86, 39, ink, "left", true);
  tracking(ctx, "THE CUTTING ROOM", 68, 112, 10, gold, 1.8);
  tracking(ctx, C.HUD_LEVEL_LABEL, 356, 58, 12, muted);
  text(ctx, String(s.level).padStart(2, "0"), 431, 59, 22, ink);
  const progress = Math.min(1, s.levelScore / (s.level * C.LEVEL_TARGET_STEP));
  text(
    ctx,
    `${s.levelScore.toLocaleString()} / ${(s.level * C.LEVEL_TARGET_STEP).toLocaleString()}`,
    919,
    59,
    16,
    ink,
    "right",
  );
  ctx.fillStyle = "#253a41";
  ctx.fillRect(355, 75, 570, 4);
  ctx.fillStyle = gold;
  ctx.fillRect(355, 75, 570 * progress, 4);
  tracking(ctx, C.HUD_SCORE_LABEL, 68, 206, 12, gold);
  text(
    ctx,
    s.score.toLocaleString().padStart(4, "0"),
    65,
    262,
    48,
    ink,
    "left",
    true,
  );
  rule(ctx, 68, 290, 218);
  if (s.phase === "resolving") {
    tracking(ctx, C.HUD_CHAIN_LABEL, 68, 337, 12, gold);
    text(
      ctx,
      `×${Math.min(s.chainStep, C.MAX_MULTIPLIER)}`,
      68,
      413,
      70,
      ink,
      "left",
      true,
    );
    text(
      ctx,
      `+${s.lastPoints}  ·  ${s.lastCleared} stones`,
      70,
      444,
      16,
      gold,
    );
  } else {
    text(ctx, "Find the fault.", 68, 339, 25, ink, "left", true);
    text(ctx, "Swap neighboring stones", 68, 375, 16, muted);
    text(ctx, "to make a line of three.", 68, 399, 16, muted);
    text(ctx, "Every clear leaves pressure.", 68, 438, 15, muted);
  }
  tracking(ctx, "THIS LEVEL", 68, 550, 11, muted);
  text(ctx, `Best move   ${s.bestMove}`, 68, 585, 17, ink);
  text(ctx, `Longest chain   ${s.bestChain}`, 68, 616, 17, ink);
  const t = targets("playing")[0];
  button(
    ctx,
    t.x,
    t.y,
    t.w,
    t.h,
    C.PAUSE_LABEL,
    s.armedTarget === "pause",
    "Ⅱ",
  );
  tracking(ctx, "PRESSURE", 992, 191, 12, gold);
  text(ctx, "A flaw is an opportunity.", 992, 221, 16, ink);
  for (let strain = 0; strain <= C.MAX_STRAIN; strain++) {
    sprite(ctx, s, `gems/beryl-${strain}.png`, 1023, 274 + strain * 63, 50);
    text(
      ctx,
      ["Pristine", "Stressed", "Fractured", "Flawed  ·  2×"][strain],
      1063,
      280 + strain * 63,
      15,
      strain === C.MAX_STRAIN ? gold : muted,
    );
  }
  rule(ctx, 990, 513, 220);
  text(ctx, "Flawed stones break with", 992, 545, 15, muted);
  text(ctx, "any clear beside them.", 992, 568, 15, muted);
  tracking(ctx, "BUILD THE CHAIN", 992, 620, 10, gold, 2);
  tracking(
    ctx,
    s.muted ? "M  /  SOUND OFF" : "M  /  SOUND ON",
    68,
    669,
    10,
    muted,
    1.5,
  );
}
function howto(ctx: CanvasRenderingContext2D, s: FacetState) {
  tracking(ctx, "THE LAPIDARY’S HANDBOOK", 66, 82, 12, gold);
  text(
    ctx,
    "A little pressure goes a long way.",
    64,
    143,
    43,
    ink,
    "left",
    true,
  );
  const columns = [66, 483, 899];
  const heading = (i: number, label: string, title: string) => {
    tracking(ctx, label, columns[i], 207, 11, gold);
    text(ctx, title, columns[i], 249, 29, ink, "left", true);
    rule(ctx, columns[i], 274, 315);
  };
  heading(0, "01  /  MAKE A MOVE", "Seven kinds of stone");
  heading(1, "02  /  APPLY PRESSURE", "Spend the strain");
  heading(2, "03  /  EARN A CUT", "Make something rare");
  const lines = [
    [
      "Hold a gem, carry it onto its neighbor,",
      "then let go. Mouse, pen, or finger.",
      "Carry it back to cancel the offer.",
      "",
      "Three or more alike in a line shatter.",
      "A move that clears nothing is refused.",
      "",
      "Falling stones can match again.",
      "Each chain step scores more, up to 8×.",
    ],
    [
      "Every clear strains the stones beside it.",
      "After three hits, a stone is flawed.",
      "Clear beside it to shatter it for double.",
      "",
      "A fault can spread across the board.",
      "Plan a move beside a fractured corner.",
      "",
      "Fill the target to finish the level.",
      "No legal move left ends the round.",
    ],
    [
      "Four in a line → a brilliant.",
      "It clears the eight stones around it.",
      "",
      "Crossing lines → a star.",
      "It clears its whole row and column.",
      "",
      "Five or more → a kindless prism.",
      "Swap it to clear every stone of a kind.",
    ],
  ];
  lines.forEach((list, i) =>
    list.forEach((l, j) =>
      text(ctx, l, columns[i], 315 + j * 26, 16, j === 0 ? ink : muted),
    ),
  );
  for (let i = 0; i < C.GEM_KIND_COUNT; i++)
    sprite(ctx, s, `gems/${C.GEM_KINDS[i]}-0.png`, 83 + i * 43, 565, 38);
  for (let i = 0; i <= C.MAX_STRAIN; i++)
    sprite(ctx, s, `gems/ruby-${i}.png`, 505 + i * 70, 565, 49);
  gem(
    ctx,
    s,
    { col: 0, row: 0, kind: "jade", cut: "brilliant", strain: 0, fell: 0 },
    932,
    565,
    50,
  );
  gem(
    ctx,
    s,
    { col: 0, row: 0, kind: "amethyst", cut: "star", strain: 0, fell: 0 },
    1010,
    565,
    50,
  );
  sprite(ctx, s, "gems/prism-0.png", 1088, 565, 50);
  const t = targets("howto")[0];
  button(ctx, t.x, t.y, t.w, t.h, C.BACK_LABEL, s.armedTarget === "back", "←");
  text(
    ctx,
    "↑ ↓  Menu     Enter / Space  Choose     Esc / P  Pause     M  Mute     Esc  Back",
    282,
    645,
    16,
    muted,
  );
}
function overlay(ctx: CanvasRenderingContext2D, s: FacetState) {
  ctx.fillStyle = "#06121ce6";
  ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
  ctx.fillStyle = "#10232e";
  ctx.fillRect(400, 147, 480, 451);
  ctx.strokeStyle = "#6e705c";
  ctx.strokeRect(400.5, 147.5, 479, 450);
  tracking(ctx, "THE LAPIDARY COLLECTION", 502, 190, 10, gold, 2);
  const heading =
    s.screen === "paused"
      ? C.PAUSED_TITLE_TEXT
      : s.screen === "levelclear"
        ? C.LEVELCLEAR_TITLE_TEXT
        : C.GAMEOVER_TITLE_TEXT;
  text(
    ctx,
    heading,
    C.STAGE_CX,
    266,
    s.screen === "gameover" ? 38 : 44,
    ink,
    "center",
    true,
  );
  rule(ctx, 465, 292, 350);
  if (s.screen === "paused") {
    text(
      ctx,
      "A moment to study the stones.",
      C.STAGE_CX,
      338,
      20,
      muted,
      "center",
      true,
    );
    text(
      ctx,
      "Your board is held exactly as you left it.",
      C.STAGE_CX,
      368,
      15,
      muted,
      "center",
    );
  }
  if (s.screen === "levelclear") {
    text(
      ctx,
      `${C.HUD_LEVEL_LABEL} ${s.level} COMPLETE`,
      C.STAGE_CX,
      322,
      14,
      gold,
      "center",
    );
    text(
      ctx,
      `${C.BEST_CHAIN_LABEL}  ${s.bestChain}     ${C.BEST_MOVE_LABEL}  ${s.bestMove}`,
      C.STAGE_CX,
      363,
      15,
      ink,
      "center",
    );
  }
  if (s.screen === "gameover") {
    text(
      ctx,
      `${C.HUD_SCORE_LABEL}  ${s.score.toLocaleString()}`,
      C.STAGE_CX,
      331,
      26,
      gold,
      "center",
    );
    text(
      ctx,
      `${C.HUD_LEVEL_LABEL} ${s.level} reached  ·  Every stone had its moment.`,
      C.STAGE_CX,
      366,
      15,
      muted,
      "center",
    );
  }
  targets(s.screen).forEach((t, i) =>
    button(ctx, t.x, t.y, t.w, t.h, menuItems(s.screen)[i], s.menuIndex === i),
  );
}
export function render(s: DeepReadonly<FacetState>, api: RenderApi): void {
  const ctx = api.ctx;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  background(ctx);
  if (s.screen === "title") title(ctx, s);
  else if (s.screen === "howto") howto(ctx, s);
  else {
    board(ctx, s);
    hud(ctx, s);
    if (s.screen !== "playing") overlay(ctx, s);
  }
  ctx.restore();
}
