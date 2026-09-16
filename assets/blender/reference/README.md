# Anatomical reference mesh

`makehuman-base.obj` is the CC0 anatomical base mesh from the MakeHuman Community project, downloaded from:
https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/3dobjs/base.obj

The file's header explicitly states its CC0 release in September 2020. The upstream license is preserved in `MAKEHUMAN-LICENSE.md`; section C covers base meshes and other graphical assets under CC0 1.0 Universal.

The Blender modeling script adapts facial and eye topology, retargets anatomical body geometry and skin weights for the Titans, and combines these with authored costumes, hair, equipment, PBR materials, sculpted muscular relief, and rigs. The MakeHuman program source is not bundled or executed.

The rebuilt Titan bodies also use the base mesh's continuous body topology and the following official CC0 MakeHuman data:

- `male-young.target`: `makehuman/data/targets/macrodetails/caucasian-male-young.target`
- `male-muscle.target`: `makehuman/data/targets/macrodetails/universal-male-young-maxmuscle-averageweight.target`
- `default.mhskel` and `default_weights.mhw`: `makehuman/data/rigs/`

All are from https://github.com/makehumancommunity/makehuman/tree/master . The target headers explicitly state CC0; both rig JSON files declare CC0. The Blender pipeline applies the anatomical targets, retargets geometry and skin weights to the game's skeleton, sculpts additional muscular relief, adds authored hair and face details, and exports a geometry-budgeted GLB. The MakeHuman application code is not executed or distributed.
