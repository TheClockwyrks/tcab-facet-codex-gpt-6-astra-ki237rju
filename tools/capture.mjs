/* global document */
import { chromium } from "playwright";
import { writeFile, mkdir } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import process from "node:process";

// Run against `npm run dev`. No capture code is bundled into the game.
const origin = process.env.FACET_ORIGIN || "http://localhost:5173";
await mkdir("showcase", { recursive: true });
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.route(`${origin}/capture`, (route) =>
  route.fulfill({
    contentType: "text/html",
    body: '<html><body style="margin:0;background:#08141d"><canvas id="game" style="width:100vw;height:100vh;display:block"></canvas></body></html>',
  }),
);
await page.exposeFunction("captureFrame", async (name) =>
  page.screenshot({ path: `showcase/${name}.png` }),
);
await page.goto(`${origin}/capture`);
const recording = await page.evaluate(async () => {
  const { createEngine, ConstantClock } =
    await import("/node_modules/@clockwyrks/simple-2d/dist/index.js");
  const { game, BACKGROUND } = await import("/src/game.ts");
  const { cellX, cellY } = await import("/src/board.ts");
  const engine = createEngine({
    canvas: document.getElementById("game"),
    width: 1280,
    height: 720,
    background: BACKGROUND,
    game,
    clock: new ConstantClock(1000 / 30),
    assetRoot: "assets/",
  });
  await engine.initialize();
  await engine.advance(1);
  await globalThis.captureFrame("title");
  const debug = engine.debug;
  const rows = Array.from({ length: 8 }, (_, r) =>
    Array.from({ length: 8 }, (_, c) => `${"RACJBSM"[(c + 2 * r) % 7]}0`).join(
      " ",
    ),
  );
  engine.apply((s) => debug.loadBoard(s, rows));
  engine.apply((s) => debug.setScreen(s, "playing"));
  for (const [c, r, token] of [
    [1, 4, "R1"],
    [2, 4, "R0b"],
    [3, 4, "J0"],
    [3, 3, "R0"],
    [4, 4, "A3"],
    [5, 4, "C3"],
    [5, 3, "J3"],
    [5, 2, "B3"],
    [4, 2, "M3b"],
    [3, 2, "S1s"],
    [6, 1, "X0"],
    [1, 1, "A2"],
    [2, 0, "C1"],
    [6, 6, "M0s"],
    [4, 7, "B2"],
  ])
    engine.apply((s) => debug.setGem(s, c, r, token));
  for (let col = 0; col < 8; col++) {
    const kinds = Array.from({ length: 8 }, (_, row) =>
      row === 1 && col >= 1 && col <= 4
        ? "R"
        : "RACJBSM"[(row * 2 + col + 3) % 7],
    ).join("");
    engine.apply((s) => debug.setRefillKinds(s, col, kinds));
  }
  engine.apply((s) => debug.setLevel(s, 2));
  engine.apply((s) => debug.setScore(s, 3240));
  engine.apply((s) => debug.setLevelScore(s, 1240));
  engine.apply((s) => debug.setBestMove(s, 280));
  engine.apply((s) => debug.setBestChain(s, 3));
  engine.apply((s) => debug.setSelection(s, 3, 3));
  await engine.advance(1);
  await globalThis.captureFrame("board");
  engine.startRecording();
  await engine.advance(10);
  engine.apply((s) => debug.pointerDown(s, cellX(3), cellY(3)));
  engine.apply((s) => debug.pointerMove(s, cellX(3), cellY(4)));
  await engine.advance(8);
  engine.apply((s) => debug.pointerUp(s));
  await engine.advance(110);
  const result = engine.stopRecording();
  engine.destroy();
  return result;
});
await writeFile("showcase/chain.json.gz", gzipSync(JSON.stringify(recording)));
await browser.close();
