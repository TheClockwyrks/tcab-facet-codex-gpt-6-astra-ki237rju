/// <reference types="node" />
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFile } from "node:fs/promises";
import {
  createEngine,
  ConstantClock,
  SequenceClock,
} from "@clockwyrks/simple-2d";
import { game, BACKGROUND } from "./game";
import * as C from "./constants";
import { cellX, cellY, productive } from "./board";

beforeAll(() => {
  vi.stubGlobal(
    "fetch",
    async (path: string) => new Response(await readFile(`public/${path}`)),
  );
  vi.stubGlobal("createImageBitmap", async (blob: Blob) =>
    loadImage(Buffer.from(await blob.arrayBuffer())),
  );
  vi.stubGlobal(
    "AudioContext",
    class {
      async decodeAudioData(data: ArrayBuffer) {
        return { data, duration: 1 };
      }
      resume() {
        return Promise.resolve();
      }
    },
  );
});
afterAll(() => vi.unstubAllGlobals());
async function harness(step = 10) {
  const canvas = createCanvas(C.STAGE_W, C.STAGE_H),
    events = new EventTarget();
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: C.STAGE_W,
    height: C.STAGE_H,
    game,
    background: BACKGROUND,
    layout: C.LAYOUT,
    clock: new ConstantClock(step),
    surface: {
      cssWidth: () => C.STAGE_W,
      cssHeight: () => C.STAGE_H,
      dpr: () => 1,
      events: () => events,
    },
  });
  const loaded: string[] = [];
  engine.events.on("asset:loaded", (e) => loaded.push(e.path));
  await engine.initialize();
  const key = (code: string) => {
    for (const type of ["keydown", "keyup"]) {
      const e = new Event(type);
      Object.assign(e, { code, repeat: false });
      events.dispatchEvent(e);
    }
  };
  const ptr = (type: string, x: number, y: number, primary = true) => {
    const e = new Event(type);
    Object.assign(e, {
      clientX: x,
      clientY: y,
      pointerId: primary ? 1 : 2,
      isPrimary: primary,
      pointerType: "mouse",
      button: 0,
      buttons: type === "pointerup" ? 0 : 1,
    });
    events.dispatchEvent(e);
  };
  return { engine, canvas, events, key, ptr, loaded };
}
describe("engine integration with real produced sprites", () => {
  it("waits for assets, registers diagnostics, renders every screen and resets by value", async () => {
    const { engine, canvas, key, loaded } = await harness();
    expect(loaded).toContain("gems/ruby-3.png");
    expect(loaded).toContain("fx/aura.json");
    expect(loaded).toContain("audio/play.wav");
    expect(engine.debug.version).toBe(C.FACET_DEBUG_VERSION);
    expect(engine.state.board.cells).toHaveLength(0);
    await engine.advance(1);
    expect(canvas.toBuffer("image/png").length).toBeGreaterThan(30000);
    key("ArrowDown");
    await engine.advance(1);
    key("Enter");
    await engine.advance(1);
    expect(engine.state.screen).toBe("howto");
    key("Escape");
    await engine.advance(1);
    expect(engine.state.menuIndex).toBe(1);
    key("ArrowUp");
    await engine.advance(1);
    key("Space");
    await engine.advance(50);
    expect(engine.state.screen).toBe("playing");
    expect(engine.diagnostics().every((r) => r.error === undefined)).toBe(true);
    for (const screen of [
      "paused",
      "levelclear",
      "gameover",
      "title",
    ] as const) {
      engine.apply((s) => engine.debug.setScreen(s, screen));
      await engine.advance(1);
      expect(canvas.toBuffer("image/png").length).toBeGreaterThan(10000);
    }
    engine.apply((s) => engine.debug.reset(s));
    expect(engine.state.simTime).toBe(0);
    engine.destroy();
  });
  it("takes primary pointer samples in arrival order, ignores secondary contact, and cues the frame", async () => {
    const { engine, ptr, key } = await harness();
    key("Enter");
    await engine.advance(50);
    let a = engine.state.board.cells[0],
      b = a;
    outer: for (const g of engine.state.board.cells)
      for (const n of engine.state.board.cells)
        if (productive(engine.state.board, g, n)) {
          a = g;
          b = n;
          break outer;
        }
    const cues: string[] = [];
    engine.events.on("cue:played", (e) => cues.push(e.cue));
    ptr("pointerdown", cellX(a.col), cellY(a.row));
    ptr("pointermove", cellX(b.col), cellY(b.row));
    ptr("pointerup", cellX(b.col), cellY(b.row));
    await engine.advance(1);
    expect(engine.state.phase).toBe("swapping");
    expect(cues).toContain(C.CUES.select);
    expect(cues).toContain(C.CUES.swap);
    await engine.advance(17);
    expect(cues).toContain(C.CUES.clear);
    expect(engine.state.lastCleared).toBeGreaterThanOrEqual(C.MATCH_MIN);
    key("KeyP");
    await engine.advance(1);
    const timer = engine.state.stepTimer;
    await engine.advance(30);
    expect(engine.state.stepTimer).toBe(timer);
    key("KeyP");
    await engine.advance(1);
    key("KeyM");
    await engine.advance(1);
    expect(engine.state.muted).toBe(true);
    ptr("pointerdown", 0, 0, false);
    await engine.advance(1);
    expect(engine.state.selection).toBeNull();
    engine.destroy();
  });
  it("renders wave breaks, cut overlays, prism turns, falls, marks and real particles", async () => {
    const { engine } = await harness(20);
    engine.apply((s) => engine.debug.dealBoard(s));
    engine.apply((s) => engine.debug.setScreen(s, "playing"));
    for (const [col, row, token] of [
      [0, 0, "R3b"],
      [1, 0, "R0"],
      [2, 0, "R0"],
      [3, 0, "X0"],
      [4, 0, "J0s"],
      [3, 1, "S3"],
    ] as const)
      engine.apply((s) => engine.debug.setGem(s, col, row, token));
    engine.apply((s) => engine.debug.setSelection(s, 0, 0));
    engine.apply((s) => engine.debug.setOffer(s, 1, 0));
    await engine.advance(1);
    engine.apply((s) => engine.debug.clearOffer(s));
    engine.apply((s) => engine.debug.requestSwap(s, 3, 0, 4, 0));
    engine.startRecording();
    await engine.advance(45);
    const recording = engine.stopRecording();
    expect(recording.frames).toHaveLength(45);
    expect(engine.state.assets.images["gems/prism-0.png"]).toBeDefined();
    expect(recording.ops.length).toBeGreaterThan(500);
    engine.apply((s) => engine.debug.clearChain(s));
    engine.apply((s) => engine.debug.requestSwap(s, 0, 0, 7, 7));
    await engine.advance(1);
    expect(engine.state.refusal).not.toBeNull();
    engine.destroy();
  });
  it("keeps clock time on menus and refreshes runtime pointer and mute readings", async () => {
    const { engine, ptr } = await harness();
    engine.setClock(new SequenceClock([5, 15, 30]));
    ptr("pointermove", 103, 237);
    await engine.advance(3);
    expect(engine.state.simTime).toBeCloseTo(0.05);
    expect(engine.state.pointer.x).toBe(103);
    expect(engine.state.pointer.y).toBe(237);
    expect(engine.state.phase).toBe("idle");
    engine.destroy();
  });
});
