# Wings of Freedom

A playable, unofficial Attack on Titan fan game, built with JavaScript, Three.js, and Vite. Play as Eren Yeager in a procedurally modeled Trost District with Blender-built characters, eliminate six Titans, and transform into the Attack Titan.

## Run locally

Live site: [Wings of Freedom](https://erfanezk.github.io/aot/).

```sh
npm install
npm run dev
```

Open the local URL printed by Vite (normally http://localhost:5173/aot/). Use a desktop browser with WebGPU and hardware acceleration. WebGPU requires localhost or HTTPS; the renderer falls back to WebGL 2 when WebGPU is unavailable.

```sh
npm run build
npm run preview
```

The production build is generated in `dist/` and can be served by any static web host. Fonts load from Google Fonts with local fallbacks; the GLB character models and their embedded PBR textures are served locally with the game. No remote game services are required.

## GitHub Pages

Pushing to `master` runs `.github/workflows/deploy.yml`, which installs dependencies, builds the game, and deploys `dist/` to GitHub Pages. The repository Pages source is **GitHub Actions**. Vite uses `/aot/` as its base path for assets and navigation.

To manually deploy the latest commit already pushed to `master`:

```sh
npm run deploy
```

This requests a GitHub Actions deployment and prints the link to follow its progress. Commit and push local changes first; the command does not upload uncommitted files. Authentication uses `GH_TOKEN`, `GITHUB_TOKEN`, or your existing GitHub HTTPS credential from Git's credential helper. The token needs Actions write access to this repository. SSH authentication alone cannot trigger the GitHub API.

## Controls

| Input | Action |
| --- | --- |
| WASD | Walk relative to the camera |
| Mouse | Look around after clicking the battlefield |
| Arrow keys | Turn / tilt the camera without mouse capture |
| Shift | Sprint / boost the grapple |
| Space | Jump; press again in midair for an ODM jump |
| Hold E or right mouse | Grapple toward a Titan or rooftop |
| Left mouse or F | Human nape strike / Titan punch |
| T | Transform / return to human form |
| R | Resupply within 11 m of a green supply station |
| Escape or P | Pause / resume |

Human attacks assist with the final approach to the nape within 46 m and consume gas. Buildings block the strike path. Grapple above rooftops to establish a clear approach. Titan punches land within 20 m; two hits defeat a full-health enemy. You begin with a full transformation charge, which lasts 45 seconds. Human kills recharge transformation. Supply stations restore all three resources.

## Features

- WebGPU rendering for the game and character studio, with a node-based sky, instanced particle sprites, PBR environment lighting, and 30 Hz game shadow updates.
- A compact 224 m walled district with 24 houses with textured plaster and masonry, pitched tile roofs, framed windows, a gatehouse, trees, street lamps, fountain, and supply crates.
- Blender-built Eren, Attack Titan, and Pure Titan GLB models with weighted bone rigs, embedded PBR textures, anatomical facial topology, layered hair, clothing, ODM equipment, and authored movement/combat clips, including in-place and root-motion human walks.
- Third-person camera with collision avoidance, gravity, rooftops, double jumps, grappling cables, and air control.
- Six enemy Titans with proximity pursuit, melee attacks, stagger, death animation, and steam particles.
- Human nape strikes and a timed playable Attack Titan form with lightning, impact particles, and camera shake.
- Health, gas, transformation charge, minimap, target assistance, mission progress, pause, restart, victory, and defeat.
- Background music uses the supplied `public/audio/_attack_on titan.mp3` file, looping at 40% volume alongside synthesized sound effects. Sound starts off; use the header sound button to enable both or pause playback. Turning sound back on resumes the music. The audio is served with the game and requires no YouTube connection.

## Project structure

- `src/main.js`: input, gameplay, AI, camera, effects, audio, and HUD.
- `src/world.js`: deterministic city geometry, textures, collision bounds, and supplies.
- `src/motion.js`: authored pose sampling, stance correction, jump and landing transitions, spine counter-rotation, and combat anticipation/contact/recovery.
- `src/characters.js`: GLB loading, independent skinned model cloning, bone animation and pose transitions.
- `src/human-walk.js`: distance-based heel-to-toe walk, body balance and secondary motion.
- `src/foot-ik.js`: runtime two-bone planted-foot correction.
- `src/character-studio.js`: orbitable character viewer, face inspection, wireframe, and idle, walk, sprint, airborne, ODM, and alternating attack previews.
- `assets/blender/`: editable `.blend` projects and packed texture sources.
- `public/models/`: game-ready `.glb` exports and asset manifest.
- `tools/blender/build_characters.py`: reproducible Blender modeling, rigging, rendering, and export pipeline.
- `src/style.css`: title screen, HUD, and responsive overlays.

This is a complete small browser-game prototype with a cinematic stylized look, not a photorealistic production game. The city is generated in JavaScript. Character meshes, rigs, and materials are built in Blender; anatomical topology and skin weights are adapted from the CC0 MakeHuman base mesh. It has no imported anime assets, multiplayer, saved progression, or destructible buildings. Attack on Titan and its characters belong to their respective rights holders; this is an unofficial fan project.

`window.getGameState()` exposes a read-only diagnostic snapshot for browser smoke testing.

## Rendering

Both pages use Three.js `WebGPURenderer`, initialized before generating environment maps or compiling the scene. The game uses `SkyMesh` and instanced `PointsNodeMaterial` sprites because WebGPU point primitives only support one-pixel points. Shader pipelines are compiled before the loading screen clears. The Vite alias keeps addons and application modules on the same Three.js WebGPU build.

Check `getGameState().render.backend` in the game or `getStudioState().backend` in the studio: `webgpu` confirms the active GPU backend; `webgl2` identifies the compatibility fallback. The fallback uses the same node materials. Draw-call diagnostics use the new renderer's per-frame `drawCalls` counter. The earlier performance figures in `docs/performance.md` predate this renderer migration and do not establish a WebGPU speedup.

## Blender models

The latest [character realism revision](docs/character-realism.md) adds preserved facial detail, strand-card hair, painted facial maps, tailored fabric and Titan muscle definition. It increases the asset budgets; current exported counts are in `public/models/manifest.json`.

Open `/aot/characters.html` on the local server for the interactive character studio. Drag to rotate, scroll to zoom, inspect faces, toggle wireframe, or preview the movement and combat poses used by the game.

Editable sources:

- `assets/blender/eren.blend`
- `assets/blender/attack-titan.blend`
- `assets/blender/pure-titan.blend`

Each source contains mesh geometry, packed texture maps, a 39-bone human rig or 38-bone Titan rig, and studio lighting. Eren has nine animation clips, including a 60 FPS walk in both in-place and root-motion forms; the Titans have seven clips each. Web exports embed their textures. Three.js clones the skeleton for each character and applies gameplay poses relative to the imported bind rotations.

```sh
npm run models:build
npm run models:check
npm run walk:check
# Rebuild just one model:
npm run models:build -- eren
```

The build script detects Blender in `/Applications` on macOS or uses `blender` on PATH. Set `BLENDER` to an alternative executable path if needed. Blender renders are written to `output/blender/`. The ordinary `npm run build` uses the checked-in GLB files and does not require Blender.

These models have improved anatomy and material detail but retain a stylized game-art appearance. Anatomical topology derives from the [MakeHuman CC0 base mesh](https://github.com/makehumancommunity/makehuman/blob/master/makehuman/data/3dobjs/base.obj). Source provenance and the upstream license are recorded in `assets/blender/reference/`.

## Performance revision

The district was reduced from 88 to 24 buildings and from a 404 m to 224 m diameter. The mission now has six enemies. City batches are split into four spatial quadrants so off-screen structures can be culled. Shadows use a 1024 px map updated at most 30 times per second; hidden and paused games skip rendering. Pixel density starts capped at 1.25 and adapts downward on sustained slow frames.

Character budgets are approximately 30k triangles for Eren, 26k for the Attack Titan, and 16k per Pure Titan, down from 99k, 98k, and 55k. Texture and geometry resources are shared between instances. The rigs include pelvis/chest counter-rotation, ankle movement, and Titan finger joints. General motions are authored in `src/motion.js`; the revised human walk comes from `src/human-walk.js`. Both are baked into the GLBs using `tools/build-motion.mjs`. Gameplay adds pose transitions, distance-driven walking, foot contact IK, and damped cloth/hair movement. These are authored animations, not motion capture.

`npm run models:check` verifies geometry/download budgets, embedded PNGs, normalized skin weights, independent skeletons, required joints, and all exported motion clips. `npm run walk:check` additionally measures exported foot drift, knee continuity, loop seams, sole clearance, root travel and runtime foot locking.

See [Eren rig and walk revision](docs/eren-character.md) for the asset specifications, export conventions, measured results and limitations.
