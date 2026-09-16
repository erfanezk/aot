"""Render the existing Eren asset as a transparent title-screen portrait."""
import bpy
from mathutils import Vector
from pathlib import Path
root=Path(__file__).resolve().parents[2]
bpy.ops.wm.open_mainfile(filepath=str(root/'assets/blender/eren.blend'))
scene=bpy.context.scene
rig=next(o for o in scene.objects if o.type=='ARMATURE')
rig.animation_data.action=None
for b in rig.pose.bones:
    b.rotation_quaternion=(1,0,0,0);b.location=(0,0,0);b.scale=(1,1,1)
scene.frame_set(0)
bpy.data.objects['STUDIO_ground'].hide_render=True
camera=scene.camera;camera.location=(.9,-3.5,2.18)
camera.rotation_euler=(Vector((0,-.015,2.16))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.ortho_scale=.67
for name,power in [('STUDIO_key',330),('STUDIO_fill',65),('STUDIO_rim',700)]:bpy.data.objects[name].data.energy=power
scene.world.node_tree.nodes.get('Background').inputs[1].default_value=.16
scene.render.engine='CYCLES';scene.cycles.samples=64;scene.cycles.use_denoising=True
scene.render.resolution_x=1050;scene.render.resolution_y=1300;scene.render.resolution_percentage=100
scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
(root/'public/images').mkdir(exist_ok=True)
scene.render.filepath=str(root/'public/images/eren-menu.png')
bpy.ops.render.render(write_still=True)
