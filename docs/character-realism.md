# Blender character realism revision

This revision updates the editable Blender projects and the GLB assets used by the WebGPU game and character studio. It keeps the existing skeletons, gameplay scale and animation clips.

## Visual changes

- Faces retain substantially more anatomical topology. Cheekbones, the nasal bridge and jaw contours receive small shape adjustments. The face has its own cylindrical UV layout and painted color, pore-normal and roughness maps, with restrained cheek, nose and lip coloring.
- Eyes have smaller, less saturated irises and pupils, radial iris detail and a dark outer iris ring. Eyebrows include individual fine hairs.
- Hair uses layered, curved strand cards with a masked, double-sided strand atlas. The crown is closed without the old raised cap. Fine texture gaps and lower specular reflectance reduce the broad plastic highlights of the old solid clumps.
- Eren has continuous trouser legs, more cape folds, woven cloth detail and surface wear around cuffs and knees.
- Titans have additional sternum, oblique, serratus and shoulder-blade definition, plus coherent body color variation. Pure Titan face and body materials receive the same gameplay variation tint.

These remain authored real-time game characters. Their geometry and textures are made in Blender and Python from the existing CC0 MakeHuman reference; they are not scans. Blender's portrait skin shading includes subsurface scattering. The web exports use the supported glTF color, normal, roughness and specular material properties.

## Export and performance

Geometry reduction happens before objects are combined by material. Facial loops, eyes, brows, small hardware and hair-card UVs receive separate treatment from broad body and garment surfaces. Render budgets are 56,000 triangles for Eren, 58,000 for the Attack Titan and 42,000 for the Pure Titan. Download limits are 16 MB for Eren and 12 MB for each Titan, including embedded textures and animation. Actual exported counts are recorded in `public/models/manifest.json`.

The increased geometry and texture sizes trade some loading time and GPU work for close-up detail. The old scene benchmarks in `performance.md` predate both this revision and the WebGPU migration.

## Rebuild and review

```sh
npm run models:build
npm run models:check
npm run walk:check
npm run build
```

The generator is `tools/blender/build_characters.py`. Source projects are `assets/blender/{eren,attack-titan,pure-titan}.blend`; exports are under `public/models/`. Blender full-body and portrait renders are in `output/blender/`. Re-render the title portrait with Blender's background Python runner and `tools/blender/render_menu_portrait.py`.

`models:check` validates the real exported files, including texture embedding, masked hair materials, facial texture maps, geometry/download budgets, normalized skin weights, skeleton cloning and animation tracks. `walk:check` samples the exported walk and sprint for foot placement and motion continuity. Original GLBs and close-up renders are retained in `output/realism-before/` for comparison.

## Character design update

The September 16 design update replaces the straight hair fringe with solid tapered locks and overlapping strand cards. Eren has a leaner lower face, stronger brows, greener irises, warmer Scout canvas, lighter trousers, sleeve insignia, a shaped shoulder yoke and a gathered green cloak collar. Floating shoulder seams were removed.

The Attack Titan has a stronger jaw and cheek silhouette, longer parted hair, curved rows of exposed teeth inside a mouth opening, and deeper pectoral and sternum relief. The Pure Titan uses shorter uneven hair and a softer torso, without the Attack Titan's exposed cheek sinews. Both Titan bodies have a welded, weighted neck transition to close the old opening around the extracted head.

The editable `.blend` files and embedded-texture `.glb` exports are rebuilt together. Skeletons, gameplay scale, animation names and the existing triangle/download limits are retained. Current counts are in `public/models/manifest.json`. Review renders are in `output/blender/`; the preceding design renders are retained in `output/design-before/`.
