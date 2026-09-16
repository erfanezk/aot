# Eren character: rig and walk revision

This document records the earlier animation revision. The subsequent [character realism revision](character-realism.md) updates the face, hair, materials and garment geometry while preserving these rigs and clips. Its manifest contains the current mesh and download sizes.

The original face, hair silhouette, body proportions, clothing palette, blades, and ODM equipment are retained. This revision changes the rig, deformation, fabric surfaces and materials, and the human walk. The result remains stylized game art; the motion is authored rather than captured from an actor.

## Deliverables

- `assets/blender/eren.blend`: editable geometry, 39-bone rig, packed textures, nine actions, studio lighting. The in-place walk is active on frames 0–66 when opened in Blender.
- `public/models/eren.glb`: glTF 2.0 with embedded textures, skeleton, skin weights, and animation tracks; 30,070 triangles, 18 material meshes, 5,066,808 bytes.
- `public/models/eren.motion.json`: stride, contact timing, coordinate convention, and clip metadata.
- `/characters.html`: interactive preview of both exported walks, other movement states, portrait inspection and wireframe.

## Motion and deformation

The 1.1-second walk has a 1.3 m stride, a 62% stance phase, heel roll, toe-off, bent knees, lateral weight transfer, pelvis rotation and shoulder counter-rotation. Arm swing is slightly asymmetric. The head, chest, wrists, fingers and thumbs have small periodic offsets. The foot trajectory uses continuous endpoint velocities and smooth heel/ball pivot transitions. All cycle poses match at the seam.

The humanoid hierarchy adds clavicles, a neck joint, toes, simplified finger/thumb articulation, two hair controls, jacket/lapel controls, a three-link cape and elbow/knee volume helpers. Joint blend zones use smooth weight falloffs. Helper rotations and scale preserve some joint fullness with standard linear skinning; the exported asset does not depend on Blender-only dual-quaternion deformation or live IK constraints.

Jacket panels use curved quad grids and thin layers. Fabric has subtle elbow, waist, hip and knee folds, reduced normal-map intensity and moderately high roughness. Pockets, lapels and harnesses were spaced to reduce intersections. Cloth and hair motion is baked into the walk, with small damped spring offsets during gameplay acceleration and turning. This is an efficient bone-based approximation, not a collision-based cloth simulation; extreme combat poses can still need manual cleanup.

## Engine integration

| Clip | Root translation | Usage |
| --- | --- | --- |
| `eren_walk_in_place` | No forward travel; includes body sway and bob | Move the game entity separately; advance phase by actual distance / 1.3 m. |
| `eren_walk_root_motion` | Root advances 1.3 m along glTF +Z per cycle | Extract or accumulate forward root displacement across loops. Do not also apply full manual movement. |
| `eren_walk` | Same as in-place | Compatibility alias. |

Playback at 1× corresponds to 1.3 / 1.1 ≈ 1.18 m/s. The game walks at up to 1.3 m/s, drives phase from actual displacement, and uses Shift for an 8 m/s sprint. Blender faces −Y; glTF faces +Z; the game rotates the imported model to face −Z. Root-motion consumers should accumulate only forward travel and retain the periodic lateral/vertical body movement.

The web game uses the baked in-place action, world-space two-bone ankle locking during flat stance, and a 160 ms pose transition when entering or leaving the walk. Contact anchors release during swing or a large turn. Ground contact is designed for the game's flat streets and flat rooftop surfaces, not arbitrary terrain stair solving. The character studio follows root motion across cycle boundaries so travel can be inspected continuously.

Rebuild and validate:

```sh
npm run models:build -- eren
npm run models:check
npm run walk:check
npm run build
```

The Blender generator is `tools/blender/build_characters.py`. Shared walk authoring is in `src/human-walk.js`; `tools/build-motion.mjs` samples it at 60 FPS for Blender baking. Runtime contact correction is in `src/foot-ik.js` and game transitions in `src/characters.js`.

## Verification

`tools/validate-walk.mjs` loads the actual GLB in Three.js and samples each walk at 265 points, including the loop boundary. Latest results are in `output/walk-review/metrics.json`:

- Maximum flat-stance foot drift: 0.048 mm for both variants, after accounting for actor travel.
- Maximum ankle target interpolation error: 1.44 mm.
- Minimum knee bend: 24.48°; largest adjacent sampled change: 1.44°.
- Root travel: 1.3000 m; in-place forward travel: 0 m.
- Sampled skinned soles remain above the floor; minimum clearance: 0.89 mm.
- Runtime foot lock maintains the planted ankle within 0.002 mm during the tested 6.88° turn.

`models:check` also checks triangle/download budgets, required joints, normalized weights, embedded PNG textures, independent cloned skeletons, finite animated skin positions and all nine human clips. Export checks target glTF/Three.js; no FBX export is supplied.

Browser checks exercised both walk clips over multiple cycles and 14 gameplay conditions: walk, idle stop, sprint, jump, landing, compact city counts, grapple, nape strike, transformation, punch contact, two-punch kill, human reversion, pause, and absence of JavaScript/WebGL errors. Review screenshots and repeatable browser scripts are in `output/walk-review/`.

## Sprint, grapple and title-screen follow-up

The human sprint now uses a dedicated exported `eren_run` action: 0.6 seconds, 4.6 m per full stride, with a 24% support phase, two flight phases, higher heel recovery, bent arms and forward torso lean. Runtime phase follows actual travel; the studio plays this exported action directly. Its maximum sampled stance drift is 1.77 mm and sampled soles remain above ground. Fast swing interpolation differs from the authored IK targets by up to 11.7 mm between 60 FPS keys.

Grappling has its own animation state, 300 ms entry/release blending, and a short ground-contact grace period. Airborne facing follows travel velocity. The camera follows player displacement before smoothing its offset, keeping a stable trailing distance during ODM acceleration. A browser replay checks that all 18 human material meshes continue rendering during walking, sprinting and held grappling, and that the pose does not jump at release. Development-only rig diagnostics are available as `window.__motionDebug`; they are removed from the production build by Vite.

The simplified title screen keeps the live city and Titans, adds a large transparent Blender portrait on the right, and retains Play, Character studio, sound and controls. Recreate the portrait with `blender --background --python tools/blender/render_menu_portrait.py`. Browser review captures and regression scripts are in `output/playwright/`.
