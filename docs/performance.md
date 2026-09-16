# Compact district and character revision

Measured September 14, 2026 at 1280 × 800 in the default menu scene.

| Metric | Before | After |
| --- | ---: | ---: |
| Buildings | 88 | 24 |
| Wall diameter | 404 m | 224 m |
| Enemy Titans | 12 | 6 |
| Rendered triangles, including shadows | 1,626,212 | 319,212 peak |
| Draw calls, including shadows | 287 | 237 peak |
| Shadow-map size | 2048² | 1024² |
| Shadow update rate | Every frame | At most 30 Hz |
| Eren mesh triangles | 99,036 | 30,067 |
| Attack Titan mesh triangles | 98,374 | 25,989 |
| Pure Titan mesh triangles | 54,886 | 15,990 |

The final 120-frame sample averaged 224,877 rendered triangles; frames without a shadow refresh are cheaper. Peak rendered geometry was about 80% below the original menu sample. World batches use four quadrants to keep draw calls below the original while retaining some off-screen culling.

Both local samples had a 16.7 ms median frame interval (display-limited at approximately 60 FPS). The baseline used a headed browser and the final production check an isolated headless browser, so these timings are not a controlled GPU-speed comparison. The geometry, object counts, shadow cost, and asset-size reductions are the meaningful evidence; lower-end hardware will vary. The menu compositions differ because the district itself is smaller.

## Verification

- Production build passes.
- All three GLBs pass geometry/download budgets, embedded PNG validation, independent skeleton cloning, normalized weights, required joints, and seven animation-clip checks.
- Browser gameplay passes 11 checks: house/enemy counts, walking, held ODM grapple, nape kill, transformation, punch contact timing (100 HP before contact, 48 afterward), two-punch kill, human reversion, pause, and absence of JavaScript runtime errors.
- Browser character viewer checked running and alternating attacks with animation enabled and wireframe disabled.
- Initial shadow map is generated before the first visible render to avoid uninitialized shadow-sampler warnings.

Review artifacts and browser scripts are in `output/blender/`. Editable model sources are in `assets/blender/`, and the production assets are in `public/models/`.

## Subsequent human walk revision

The current Eren export contains 30,069 triangles, 39 bones and nine clips, including both walk variants, and is 5.06 MB. City budgets and Titan assets remain as measured above. Those historical scene timings were not re-measured for this character revision. See [the rig and walk notes](eren-character.md) for the current deformation and contact validation.
