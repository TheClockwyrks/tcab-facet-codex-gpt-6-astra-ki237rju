# Facet

A browser puzzle of cut stones, pressure, and chain reactions. Swap neighboring gems into lines of three or more. Each clear strains the surrounding stones; flawed gems join nearby clears for double points. Longer and intersecting matches create brilliant, star, and prism cuts with distinct powers.

Reach the level target to continue onto a new board. A round ends when no productive swap remains. There is no timer, backend, account, or persistence.

## Run

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. The game uses a fixed logical stage, fitted and letterboxed by Simple 2D for the current window and pixel density.

## Production

```sh
npm run build
npm run preview
```

`dist/` is the complete static site. Serve it at the origin root or any subdirectory; every runtime asset URL is relative. Building only compiles and bundles committed files. No asset generator, external service, or credential is needed.

## Controls

- **Mouse, pen, or touch:** press a gem, drag onto an orthogonal neighbor, and release. You can also tap a gem, then tap its neighbor. Carrying back to the selected gem withdraws the offer.
- **Menus:** click or tap; alternatively use ↑ / ↓ and Enter / Space.
- **Esc / P:** pause or resume. Esc also leaves the handbook and game-over screen.
- **M:** mute or unmute all audio. Sound unlocks after the first interaction.
- **Backtick:** toggle the engine’s diagnostic overlay.

## Checks

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

The tests cover match detection, least-wave expansion, strain, cut placement and precedence, prism swaps, scoring, refill and gravity, delta-time boundaries, level transitions, pointer input, debug poses, and the engine running over a real Node canvas. Integration tests load the committed art and particle systems; the browser audio decoder alone is replaced in the Node test host.

## Source and assets

- `src/game.ts` declares the public immutable state and exports the engine game.
- `src/board.ts` and `src/simulation.ts` implement board rules and timed resolution.
- `src/controls.ts` and `src/debug.ts` share immediate input and pose transitions.
- `src/runtime.ts` loads resources, registers engine input and diagnostics, and plays cues.
- `src/render.ts` draws the stage, sprites, and live particle simulations without changing game state.
- `public/assets/` contains original, committed PNG sprites and animation frames, authored particle systems, synthesized and sampled WAV cues, and two sequenced WAV/MIDI pieces.
- `showcase/` contains player-facing copy, screenshots, and a genuine engine drawing replay.

`tools/produce_assets.py` records the one-time asset recipe using `draw`, `draw-sheet`, `particle-2d`, `sfx-synth`, `sfx-sample`, and `music`. Those authoring binaries are only necessary to regenerate the artwork and audio, never to install, build, or play. The sampled shatter uses the supplied combat-core material; the original scores use the supplied gm-lite instruments.

To recapture the showcase while the development server is running, run `node tools/capture.mjs`. This creates an isolated engine instance and uses its own recorder; no capture handle is installed by the shipped game.
