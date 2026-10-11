import type { DeepReadonly } from "ts-essentials";
import type { InitApi, UpdateApi } from "@clockwyrks/simple-2d";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import * as C from "./constants";
import type { FacetDebugApi, FacetState } from "./game";
import { debug } from "./debug";
import { action, pointer } from "./controls";
import { advance, initial, lastFall } from "./simulation";
import { legalSwap } from "./board";

export async function initialize(
  api: InitApi<FacetState>,
): Promise<[FacetState, FacetDebugApi]> {
  for (const name of C.ACTIONS)
    api.input.register(name, { keys: [...C.BINDINGS[name]] });
  const imagePaths = ["gems/board.png", "gems/brilliant.png", "gems/star.png"];
  for (const kind of [...C.GEM_KINDS, "prism"])
    for (let strain = 0; strain <= C.MAX_STRAIN; strain++)
      imagePaths.push(`gems/${kind}-${strain}.png`);
  for (const kind of C.GEM_KINDS)
    for (let frame = 0; frame < 6; frame++)
      imagePaths.push(`gems/break/${kind}/${frame}.png`);
  for (let frame = 0; frame < 8; frame++)
    imagePaths.push(`gems/prism-turn/${frame}.png`);
  const images: Record<string, ImageBitmap> = {};
  const effects: Record<string, ParticleSystem> = {};
  // All tasks settle before the surface is published, including a failed load.
  const loads = await Promise.allSettled([
    ...imagePaths.map(async (path) => {
      images[path] = await api.assets.loadImage(path);
    }),
    ...["clear", "flawed", "cut", "aura"].map(async (name) => {
      effects[name] = JSON.parse(
        await (await api.assets.load(`fx/${name}.json`)).text(),
      ) as ParticleSystem;
    }),
    ...Object.values(C.CUES).map((cue) =>
      api.audio.load(
        cue,
        `audio/${cue === C.CUES.clear ? "shatter" : cue}.wav`,
      ),
    ),
    ...Array.from({ length: C.MAX_MULTIPLIER }, (_, i) =>
      api.audio.load(`ladder-${i + 1}`, `audio/chain-${i + 1}.wav`),
    ),
    api.audio.load("title-theme", "audio/title.wav"),
    api.audio.load("play-bed", "audio/play.wav"),
  ]);
  const failed = loads.find((r) => r.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;
  for (const name of [
    "screen",
    "phase",
    "score",
    "level",
    "levelScore",
    "chainStep",
    "lastCleared",
    "lastPoints",
    "lastWaves",
    "bestMove",
    "bestChain",
  ] as const)
    api.diagnostics.register(name, (s) => s[name]);
  api.diagnostics.register(
    "board cols / rows",
    (s) => `${s.board.cols} / ${s.board.rows}`,
  );
  api.diagnostics.register(
    "level progress",
    (s) => `${s.levelScore} / ${s.level * C.LEVEL_TARGET_STEP}`,
  );
  api.diagnostics.register("multiplier", (s) =>
    Math.min(s.chainStep, C.MAX_MULTIPLIER),
  );
  api.diagnostics.register("lastFall", lastFall);
  api.diagnostics.register("selection", (s) =>
    s.selection ? `${s.selection.col},${s.selection.row}` : "none",
  );
  api.diagnostics.register("offer", (s) =>
    s.offer ? `${s.offer.col},${s.offer.row}` : "none",
  );
  api.diagnostics.register("legalSwap", (s) => legalSwap(s.board));
  api.diagnostics.register(
    "pointer",
    (s) =>
      `${s.pointer.x.toFixed(0)},${s.pointer.y.toFixed(0)} ${s.pointer.device}`,
  );
  return [initial({ images, effects }), debug];
}
export function update(
  state: DeepReadonly<FacetState>,
  api: UpdateApi,
  dt: number,
): FacetState {
  let s = state;
  const cues = new Set<C.CueName>();
  let clearRung = 1;
  const emit = (cue: C.CueName, rung = 1) => {
    cues.add(cue);
    if (cue === C.CUES.clear) clearRung = Math.max(clearRung, rung);
  };
  // Read every edge once. Escape's two actions are evaluated on the original screen.
  const pressed = new Set(C.ACTIONS.filter((name) => api.input.pressed(name)));
  if (pressed.has("mute")) api.audio.setMuted(!api.audio.muted());
  for (const name of ["up", "down", "confirm"] as const)
    if (pressed.has(name)) s = action(s, name);
  if (
    pressed.has("pause") &&
    (state.screen === "playing" || state.screen === "paused")
  )
    s = action(s, "pause");
  if (
    pressed.has("back") &&
    (state.screen === "howto" || state.screen === "gameover")
  )
    s = action(s, "back");
  for (const sample of api.input.pointerSamples()) {
    if (
      !sample.primary ||
      (sample.type !== "move" && sample.button !== "primary")
    )
      continue;
    s = pointer(s, sample.type, sample.x, sample.y, sample.device, emit);
  }
  s = advance(s, dt, emit);
  const { x, y, down, device } = api.input.pointer();
  s = {
    ...s,
    simTime: state.simTime + dt,
    pointer: { x, y, down, device },
    muted: api.audio.muted(),
  };
  for (const cue of cues) {
    api.audio.play(cue);
    if (cue === C.CUES.clear) api.audio.play(`ladder-${clearRung}`);
  }
  const title = s.screen === "title" || s.screen === "howto";
  api.audio.stop(title ? "play-bed" : "title-theme");
  api.audio.loop(title ? "title-theme" : "play-bed");
  return s;
}
