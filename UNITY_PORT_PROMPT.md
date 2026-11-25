# Bloomkeeper → Unity: port prompt

This file is a ready-to-paste prompt for Claude Code. It ports the web version of Bloomkeeper (this repo) to a native Unity mobile game that looks and feels exactly the same.

## How to use it

1. Install Unity Hub and the current **Unity 6 LTS** with the iOS and Android build modules.
2. Make a work folder with two things side by side:
   ```
   bloomkeeper/
   ├── bloomkeeper-web/     ← git clone https://github.com/kormocicsaba/bloomkeeper-web
   └── BloomkeeperUnity/    ← new, empty Unity project (Universal 3D / URP template)
   ```
3. In `bloomkeeper-web`, run `npm install && npm run dev` once. This confirms the game runs at http://localhost:5173 and puts the three.js source in `node_modules`, where Claude will read it.
4. Open Claude Code in the `bloomkeeper/` folder, so it can see both projects. Paste everything below the line.
5. Let it work one milestone at a time. Check the side-by-side screenshots it produces at the end of each milestone.

---

## PROMPT

You are porting **Bloomkeeper**, a cozy 3D garden game, from the web to a native **Unity mobile game** (iOS and Android, portrait). The web version is finished and loved. Your job is an **exact port**: same look, same feel, same rules, same numbers. A player who knows the web version should not be able to tell them apart, except that the Unity version runs smoother.

- Web source (the spec): `./bloomkeeper-web` (TypeScript, three.js, Vite). Live: https://kormocicsaba.github.io/bloomkeeper-web/
- Unity project (your output): `./BloomkeeperUnity`

### 0. Golden rules

1. **The web code is the spec, not this prompt.** Every number in this prompt is a checklist item to confirm in the code, not a replacement for reading it. When this prompt and the code disagree, the code wins. Note the difference in `PORT_NOTES.md`.
2. **Port, don't redesign.** Use the same colours, timings, easing, sizes, camera, text, level data and sounds. Don't "improve" balance, wording, layout or art during the port. Improvements are allowed only when they make it look or feel *better than the web* in a way that is clearly in the same style (crisper shadows, smoother AA, 60 to 120 fps, native haptics later). Log each one in `PORT_NOTES.md` under "Deliberate upgrades".
3. **Verify by eye, not by belief.** Every visual milestone ends with side-by-side screenshots of web and Unity at the same resolution (section 9). "It should look the same" is not done. "Here are the pairs and the diff" is done.
4. **Mirror the structure.** One Unity script per web module, with the same names and the same responsibilities, so anyone can diff `sim.ts` against `Sim.cs`.
5. Work in milestones (section 10). Commit at the end of each one with a Conventional Commit message. Keep `PORT_NOTES.md` up to date: decisions, deviations, open issues.
6. If something can't be matched exactly in Unity, stop and explain the options before you pick one.

### 1. Read the web project first

Read all of `bloomkeeper-web/src` before you write any Unity code. It's about 8.7k lines:

| Web file | What it is | Unity counterpart |
|---|---|---|
| `src/sim/sim.ts`, `types.ts`, `rng.ts`, `synergy.ts` | Pure, deterministic game simulation. No rendering. Emits events. | `Sim/*.cs`: plain C# with no `UnityEngine`, in its own asmdef |
| `src/data/levels.ts`, `crops.ts`, `world.ts`, `times.ts` | All level, crop, soil, critter, companion and time-limit data | `Data/*.cs`, ported verbatim (C# static data or generated ScriptableObjects) |
| `src/game/controller.ts` | Input, Granny's coach and tutorial script, time-scale (freeze and bullet-time), sim events to juice, end-of-level | `Game/GameController.cs` |
| `src/game/save.ts` | Save data: stars, flags, best times, settings | `Game/SaveSystem.cs` |
| `src/game/autoplay.ts`, `tools/bot.ts` | Headless bot. Plays levels, used for balance and the title-screen showcase | `Game/Autoplay.cs` plus an editor bot runner |
| `src/render/scene.ts` | Stage: renderer, lights, fog, **camera auto-fit**, orbit, shake | `Render/Stage.cs` plus URP assets |
| `src/render/kit.ts` | Primitive geometries and material cache | `Render/Kit.cs`: procedural mesh generators |
| `src/render/models.ts` | Every 3D model, built procedurally from primitives (plants, veggies, crows, Crow King, rabbit, tortoise, Granny, cart, can, weeds, rocks…) | `Render/Models.cs` (builders) plus baked prefabs |
| `src/render/gameView.ts` | Renders the sim and holds **all the juice**: pops, squash, elastic, shakes, droop, ripening, critters, boss | `Render/GameView.cs` |
| `src/render/fx.ts` | Pooled particle effects (water, dirt, leaves, sparkle, feathers, fur, coins, poof, dust, confetti, petals) | `Render/Fx.cs` (pooled, same shapes and motion) |
| `src/render/icons.ts` | Renders the real 3D models into UI icons, so the UI matches the diorama | Editor tool that bakes icon sprites with the same lights and framing |
| `src/audio/audio.ts` | 100% procedural WebAudio: SFX, reverb, generative pentatonic music | Baked WAVs plus `Audio/AudioManager.cs` and a music sequencer (section 7) |
| `src/ui/hud.ts`, `screens.ts`, `coach.ts`, `svg.ts`, `src/styles.css` | DOM and CSS UI: HUD, seed tray, title, map, modals, results, coach bubble, wipe transition | `UI/*` (section 6) |
| `src/main.ts` | Boot, screen flow, title showcase garden, transitions, main loop | `App/Main.cs` |

Also read the three.js geometry and material sources you need in `bloomkeeper-web/node_modules/three/src/` (geometries, `MeshStandardMaterial`, tonemapping shader chunks, lights) and `node_modules/three/examples/jsm/geometries/RoundedBoxGeometry.js`. You'll replicate their math.

### 2. Tech decisions (already made)

- **Unity 6 LTS, URP, Linear colour space**, portrait only, safe area respected. Target 60 fps on a mid-range 2021 phone; allow 120 Hz where the device supports it.
- **C# only.** No Visual Scripting.
- **Sim:** a plain C# assembly (no `UnityEngine` reference) so it runs in EditMode tests and command-line tools.
- **UI: uGUI + TextMeshPro + a custom SDF "rounded panel" shader**: fill, gradient, border, inner highlight, soft drop shadow and per-corner radius. Together these reproduce the CSS cards, buttons and pills exactly. Use the **Fredoka** font (OFL; it ships in `node_modules/@fontsource/fredoka`, or get it from Google Fonts) as TMP SDF assets for weights 400, 500, 600 and 700. If you think UI Toolkit would match better, argue it in `PORT_NOTES.md` before you switch. It has no box-shadow and limited easing curves.
- **Tweens:** PrimeTween (free, zero-alloc) or a small in-house tweener. Port the web's easing functions exactly (`smooth`, `easeOutBack`, `easeOutElastic` from `kit.ts`, and the CSS curves `--pop: cubic-bezier(0.3, 1.6, 0.5, 1)` and `--soft: cubic-bezier(0.25, 0.8, 0.3, 1)`). Write a real cubic-bezier evaluator; don't approximate with AnimationCurves by hand.
- **Driving Unity from the CLI:** use Unity in batch mode (`-batchmode -projectPath … -executeMethod …` and `-runTests`) for tests, asset generation, screenshot capture and builds, so you can verify your own work without a human clicking. A Unity MCP bridge is fine too if one is installed.

### 3. The look: rendering spec

The web look comes from flat-coloured procedural primitives, one warm sun with soft shadows, a hemisphere ambient light, linear fog that blends into a pale green background, and the Khronos "PBR Neutral" tonemapper. Match every one of these.

**Values to confirm in `scene.ts`:**
- Background and fog colour `#dff0cf`. Linear fog follows the camera distance: near = dist + 6, far = dist + 30.
- Camera: perspective, **vertical FOV 30** (Unity's FOV is also vertical, so 30 maps 1:1).
- Sun: directional `#fff0d4`, intensity 2.6, casts shadows. It sits at the camera target + (-4.5, 10, 6.5) and follows the target, so the shadow box always covers the garden.
  - Shadow map 2048, bias -0.0004, normal bias 0.025, PCF radius 5, ortho shadow camera ±9.
- Fill: directional `#d8e8ff`, intensity 0.55, position (6, 4, -3), no shadows.
- Hemisphere: sky `#fff6e6`, ground `#9cc77f`, intensity 1.55.
- Tonemapping: `NeutralToneMapping` at exposure 1.05, sRGB output. MSAA on; pixel ratio capped at 2.

**Traps. Read these before touching lights:**
1. **Light units differ.** three.js (r155+) divides the Lambert diffuse by π; Unity folds π into light intensity. As a starting point, use Unity intensity ≈ three intensity ÷ π (sun ≈ 0.83, fill ≈ 0.175). For the hemisphere light, use URP *Gradient* ambient: sky = `#fff6e6`, ground = `#9cc77f`, equator = their midpoint, scaled by 1.55 ÷ π. Then **calibrate against screenshots** (section 9) until a flat cream surface, a leaf-green surface and the shadow under the cart all match the web pixels within a few RGB values.
2. **URP's "Neutral" tonemapper is not Khronos PBR Neutral.** It's a different curve. Implement Khronos PBR Neutral exactly: read three's `tonemapping_pars_fragment` and port it as a URP full-screen pass or renderer feature after opaque and transparent, with exposure 1.05. Alternatively, bake it into a 3D LUT. Set URP tonemapping to None, keep HDR on, and check that the result is right before going further.
3. **No environment reflections on the web.** three's scene has no envMap, so metallic and gold surfaces only reflect the lights. In Unity, set the environment reflection intensity to 0 or use a flat reflection source. Otherwise gold coins and the golden veggies will look different.
4. **Materials:** `MeshStandardMaterial` maps to URP Lit with smoothness = 1 − roughness (default roughness 0.78 gives smoothness 0.22) and metallic = metalness. Hex colours are sRGB; let Unity's colour pipeline convert them. Port the material cache in `kit.ts` (`mat()` options rough, emissive, ei, flat, metal; `basic()` is unlit). Gold: `#ffcd3c`, roughness 0.28, metalness 0.55, emissive `#ffae00` at 0.35. `flatShading` needs flat normals; generate split-vertex meshes for those.
5. **Handedness.** three.js is right-handed; Unity is left-handed. Use **one** conversion at the boundary: position (x, y, z) → (x, y, −z), with rotations adjusted to match, applied in one helper. Don't scatter sign flips through the code. Check it with something asymmetric: Granny's cart side, the sun's shadow direction, the crow facing direction, and the seed-tray order versus the garden grid must all match the web screenshots.
6. **Shadows:** a single cascade covering the same ±9 area, 2048 resolution, soft shadows (high), with depth and normal bias tuned to match the web's contact shadows. No peter-panning, no acne.

**Geometry (`kit.ts`):** generate meshes **identical in topology** to three's generators, porting their algorithms from `node_modules/three/src/geometries`:
- sphere 22×16, sphereLo 12×9, hemi 22×12 (top half)
- cyl 18, cylLo 8, cone 18, coneLo 7
- capsule (0.5, 1, 6, 14), torus (1, 0.12, 8, 28)
- RoundedBox (1, 1, 1, segments 3, radius 0.14) and soft (4, 0.3)
- icosahedron detail 1 (rock), ring (0.42, 0.5, 40), disc 28

Use the same smooth normals. Silhouettes have to match, because the faceting on rocks and low-poly cones is part of the style.

**Models (`models.ts`):** port each builder 1:1 (same child primitives, transforms, colours and pivots) as runtime C# builders. Then add an editor menu item that bakes each one to a prefab with combined meshes per material, to save draw calls. The palette `C` and per-crop colours must match exactly. Keep the animated parts that `gameView.ts` moves (leaves, heads, wings, eyes, the clock-flower hand) as separate transforms.

**Camera auto-fit (`scene.ts`, the core of the framing):**
- Elevation 0.92 rad, plus up to 0.26 more on tall screens: `tall = clamp01((safeH/safeW − 0.9) / 0.5)`.
- A binary search on distance fits the view's `fitPoints()` inside the *safe rect*: the screen minus the HUD insets measured from the real UI rects (top bar, seed tray, and on the title screen the logo and footer).
- The fitted content centres at 54% of the safe rect vertically.
- Smoothing toward the target, the slow title-screen orbit (0.12), and the shake decay must match.
- Port it line by line. The UI must report its inset rects to the Stage the same way the DOM does (`titleInsets()` in `main.ts`, `layout()` in the controller).

### 4. The feel: motion, time and input

- **Main loop:** `dt = min(0.05, frameDelta)`. Port the order of `game.update`, `sim.step`, `view.handle(events)` and `view.update` exactly.
- **Time-scale (`controller.ts`):** the coach can freeze the sim (scale 0), or use bullet-time 0.12 while showing the veggie ring. The view keeps animating at `max(scale, 0.35)` while frozen, so the world never looks dead. Match this exactly; it's a big part of why the tutorial feels gentle.
- **Juice (`gameView.ts`):** port every per-entity animation with the same constants. That includes:
  - plant pop-in with `easeOutElastic`
  - squash `sin(squash·π)·0.25` decaying at 3.5/s
  - tile bump and shake (`sin(shake·40)·shake·0.05`)
  - weed and rock shakes
  - droop and tint when thirsty, wilt yellow then rot
  - ripe bob, veggie arc and roll, the catch ring
  - critter hops and squash, the boss attacks
  - camera shakes (0.025 / 0.05 / 0.06 / 0.07 on the matching events)
  - idle sways using per-entity random phases

  Go through `gameView.ts` top to bottom and tick off each block in `PORT_NOTES.md`.
- **FX (`fx.ts`):** pooled (360 on the web), same spawn counts, velocities, gravity, spin, fade and scale curves for each effect type.
- **Input (`controller.ts` `onDown`/`onMove`, `gameView.ts` `pick()`/`veggiesNear()`):**
  - Tap picks in priority order: boss (radius `max(56, unit·0.75)`), then the nearest critter (`max(44, unit·0.48)`), then the nearest veggie (`max(48, unit·0.5)`), then a tile. A tile is hit by raycasting onto the plot-top plane, with a fallback to the nearest projected plot centre within `unit·0.45`.
  - `unit` is `stage.pixelScale()` at the origin.
  - **Swipe-catch samples the whole segment between pointer moves** in 18 px steps with radius `max(36, unit·0.34)`, so fast flicks never skip a veggie.
  - Track one active pointer, as the web does.
  - These radii are **CSS px**. Convert them to Unity screen pixels using the same reference scale as the UI, or hit areas will shrink on high-DPI phones.

  Use the new Input System (EnhancedTouch) with projections and screen-space distance tests that copy this logic. Don't use physics colliders.
- **Coach (`coach.ts` plus the tutorial script in the controller):** same lines, same triggers, same pointing hand, same freeze points. Text is copied verbatim.

### 5. The rules: sim port and parity tests

- Port `sim.ts`, `types.ts`, `synergy.ts` and `rng.ts` **line by line** to C#. Use **`double`** everywhere the TS uses `number` in sim logic (JS numbers are doubles, and `float` will drift).
- `Rng` is mulberry32. Port it with `uint` and `unchecked` arithmetic: `Math.imul` → `unchecked((uint)a * (uint)b)`, and `>>>` → `>>` on `uint`. The first 1,000 outputs for seeds 1, 7 and 12345 must match the TS bit for bit (add this as a test).
- Constants to confirm: `CAN_MAX` 5, `CAN_REFILL` 1.55, `DRINK_SCALE` 0.62, `POP_DUR` 0.55, `ROLL_SPEED` 2.1, `LANE_TIME` 4.6, `CHAIN_WINDOW` 3, `WILT_YELLOW` 5, `WILT_ROT` 10, `THIRSTY_AT` 0.28, `TORTOISE_SAVE_CD` 9. There are more in the file; port them all.
- **Parity harness:** in the web repo, add `tools/trace.ts` (run with `npx tsx`). For every level, it runs `Sim(level, seed)` with the `autoplay.act()` bot at a fixed action gap and dt (as `tools/bot.ts` does), then writes a JSON trace: the event stream plus a state snapshot every N steps (coins, can, plant growth and water, critter positions, status, stars). The sim has no `Math.random`, so this is deterministic. In Unity, an EditMode test replays the same seeds and actions with `Sim.cs` and `Autoplay.cs` and asserts the traces match (exact for ints and events, 1e-9 for doubles). **All 21 levels (0-1…0-5, 1-1…1-16) must pass** before you build any rendering on top.
- Port the bot runner as an editor or CLI tool so balance can be re-checked later. It should give the same medians as `npm run bot`.

### 6. UI spec

The UI is HTML and CSS overlaid on the canvas. Rebuild it pixel-faithfully in uGUI.

- **Design tokens (`styles.css :root`):**
  - Colours: cream `#fff6e5`, cream-2 `#fbebcb`, cream-edge `#e6d0a4`, ink `#5a3d2b`, ink-soft `#8d6c55`, leaf `#7bc96f` / `#4f9d4c` / `#3c7d3b`, tomato `#f2665c` / `#c94c43`, wood `#b07a4a`, butter `#ffd66b` / `#e3a93a`, water `#4fb0f0`, plum `#3f3149`.
  - Put them in one `UiTheme` ScriptableObject.
- **Scale:** the CSS is written in CSS px for a ~375×812 portrait viewport. Use a Canvas Scaler with reference 375×812, *match width or height* tuned so that type, card sizes and spacing in screenshots match the web at 375×812, 390×844, 430×932 and an iPad portrait. Respect the safe areas the way the CSS `env(safe-area-inset-*)` usage does.
- **Every screen and element:**
  - boot sprout
  - title: logo, Play, music and sound toggles, the live 3D showcase garden behind it
  - map: the winding node path, world headers "Granny's Lessons" and "Spring Garden", star counts, locks, skip lessons
  - intro modal and pause modal
  - results: big star pops, star lines, the Time / Caught / Earned / Best chain stat chips, Map / Retry / Next
  - the world-done modal ("Spring is saved")
  - the **wipe transition**: a radial-gradient circle reveal over 0.36 s with `cubic-bezier(0.6, 0, 0.4, 1)` and a sprouting-leaf loop in the middle; the screen swaps at 360 ms, then it reverses (see `transition()` in `main.ts` and `.wipe` in `styles.css`)
  - HUD: coins, level pill, timer ring, bill goals, boss bar, water-can meter, Shell Dash button
  - seed tray cards with prices and affordability states
  - toasts, and the coach bubble with Granny's portrait and pointing hand

  Copy every string verbatim.
- **Animations:** port each CSS `@keyframes`, `transition` and `animation` (durations, delays, easing) to tweens. That includes pop-ins with `--pop`, breathing buttons, star pops, coin tick-ups, toast slides and press states. Make a checklist from `styles.css` in `PORT_NOTES.md`.
- **Icons:** `svg.ts` icons become sprites. Rasterise at 4× or use the Vector Graphics package. Keep stroke-only icons stroke-only. The **3D icons** (veggies, crows, rabbit, tortoise, Granny) come from an editor tool that renders the real models like `icons.ts` does: same lights (hemi `#fffaf0` / `#b8d9a0` at 2.0, key `#fff3dd` at 2.4, rim `#dfeeff` at 1.0), FOV 26, the same per-model yaw, pitch, padding and lookY, Neutral tonemapping at exposure 1.1, transparent background. Render at 2 to 4× the web's 160 px for crispness.

### 7. Audio

All web audio is synthesised at runtime in `audio.ts` (plucks, bells, filtered noise, compressor, convolver reverb, a generative pentatonic music loop with scale [0, 2, 4, 7, 9]). To get **identical** sound:

1. Add `tools/render-audio` in the web repo. It runs each `sfx.*` method into an `OfflineAudioContext` in headless Chrome (puppeteer-core plus the system Chrome works) and writes 48 kHz WAVs, with reverb and compression included.
2. For parametrised or randomised SFX, render all the variants the game uses:
   - `catchV(chain, perfect, golden)` for each chain step up to the cap, × perfect × golden
   - `star(i)` for i = 0 to 2
   - several takes of any SFX that uses random detune, played round-robin
3. Music: port the generative sequencer's logic to C#. Either schedule pre-rendered note and pad samples on the DSP clock (`AudioSettings.dspTime`), or render a long seamless loop if the generator is effectively periodic. Read the code and pick the more faithful option.
4. Volumes: sfx 0.9 and music 0.55 master. Mute toggles persist. Audio pauses when the app goes to the background, and the game opens the pause modal (as `visibilitychange` does on the web).

Put a small in-editor "soundboard" window in the project so each sound can be A/B-checked against the browser.

### 8. Save

Port `save.ts` with the same schema: stars, per-level flags `[finish, par, noLoss, bonus]`, best times, tutorialSkipped, music, sound, seen. Store it as JSON in `Application.persistentDataPath`, written atomically (temp file, then rename). Keep the same unlock rules and first-launch flow: a fresh player goes straight into lesson 0-1, everyone else lands on the map.

### 9. Visual verification (required)

Build a repeatable side-by-side check:

- **Web side:** a puppeteer script in the web repo. It opens the dev server at a given viewport (deviceScaleFactor 2, `isMobile`, `hasTouch`) and uses the dev hook `window.__bk` (`start(id)`, `map()`, `game`, `stage`, `save`; see `main.ts`) to reach each state, wait for animations to settle, and screenshot.
- **Unity side:** an editor or batch-mode method that loads the same states (add a debug hook mirroring `__bk`) and captures the Game view at the same pixel size.
- **Canonical shots** at 750×1624 (375×812 @2x), plus at least one 1290×2796:
  1. title
  2. map, top and scrolled to 1-16
  3. 1-1 intro modal
  4. 0-1 with the coach bubble
  5. 1-4 mid-level with plants at mixed growth, a ripe veggie and the catch ring
  6. thirsty and wilting plants
  7. crows and rabbit on screen
  8. 1-16 boss phase
  9. results with 3 stars
  10. the world-done modal
- Make a composite (web | Unity | abs-diff heatmap) for each shot and save them to `BloomkeeperUnity/Verification/<milestone>/`. Freeze time or use fixed seeds and timestamps so the shots are comparable.
- Pass bar: framing, colours, shadow shape and density, UI layout and type are indistinguishable at a glance, and the diff shows no structural differences. Expect tiny AA or noise differences. Include the composites in the milestone summary.

### 10. Milestones (each ends with tests passing, screenshots where relevant, a commit, and a short summary)

1. **Project skeleton:** URP and linear colour space set up, portrait, safe area, folders and asmdefs mirroring the web, the Fredoka TMP assets, `UiTheme`, `PORT_NOTES.md`, and batch-mode scripts for tests, screenshots and builds.
2. **Sim parity:** Rng, data, sim, synergy, autoplay and save in C#. The trace harness passes for all 21 levels. Bot medians match.
3. **Diorama look:** Kit geometry, every model builder, Stage (lights, Khronos Neutral pass, fog, shadows, camera fit, orbit, shake), and the title showcase garden running on the bot. Screenshot parity on shots 1 and 5 (with the UI hidden) before going on. *This milestone decides the look. Take the time to calibrate.*
4. **GameView and FX:** all juice, critters, boss and effects, driven by the C# sim.
5. **Input, time-scale and coach:** tap, swipe-catch, bullet-time and freezes, and the full tutorial 0-1…0-5 playable.
6. **UI:** HUD, seed tray, every screen and modal, the wipe, baked 3D icons, every CSS animation. Screenshot parity on all canonical shots.
7. **Audio:** baked SFX, the music sequencer, the soundboard, settings.
8. **Device pass:** iOS and Android builds. Check 60 fps and the frame-time budget (aim for ≤ 8 ms CPU and ≤ 10 ms GPU on a mid-range phone), plus memory, battery and thermals over a 15-minute session, background and resume, notches, and a small Android phone. Record the profiler numbers in `PORT_NOTES.md`.
9. **Final parity review:** play every level start to finish on a device next to the web version on another phone. List and fix every difference you notice, or log it as a deliberate upgrade.

### 11. Performance notes

- Bake the static garden per level and combine meshes per material. Use GPU instancing for repeated primitives (leaves, pebbles, FX particles). The web draws hundreds of small meshes; Unity on mobile should batch them.
- No per-frame allocations in the sim, view, FX or UI. Pool everything the web pools, and more.
- Use the Adaptive Performance or Frame Timing APIs only for monitoring; don't change the look dynamically.

### 12. Out of scope for now (do not build yet)

Ads, IAP, analytics, cloud save, accounts, leaderboards, push notifications, localisation, haptics, new worlds, levels or mechanics, and store listing assets. Design the code so these can be added later; for example, keep a thin `Services` layer. If you notice a natural place for one, write it down in `PORT_NOTES.md` under "Later".

**Start now:** read the whole web project, then reply with (a) your understanding of the architecture in 10 to 15 bullets, (b) anything that looks hard to match exactly in Unity, with how you'd handle it, and (c) your plan for milestone 1. Then begin milestone 1.
