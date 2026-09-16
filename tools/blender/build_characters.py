"""Create, rig, texture, render and export the Wings of Freedom character set.
Run: blender --background --python tools/blender/build_characters.py
Custom meshes, materials and rigs are authored in Blender. Facial topology is derived
from the CC0 MakeHuman base mesh; see assets/blender/reference for provenance.
"""
import bpy
import bmesh
import math
import os
import sys
import json
import random
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion, Euler
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'assets' / 'blender'
EXPORT = ROOT / 'public' / 'models'
RENDERS = ROOT / 'output' / 'blender'
for folder in [SOURCE, SOURCE / 'textures', EXPORT, RENDERS]: folder.mkdir(parents=True, exist_ok=True)
random.seed(741)
np.random.seed(741)
bpy.ops.wm.read_factory_settings(use_empty=True)
MATERIALS = {}
PARTS = []
SKIN_PARTS = []
CURRENT = ''
FINGER_RIG = {}


def image_from_array(name, rgb, noncolor=False, alpha=None):
    height, width = rgb.shape[:2]
    image = bpy.data.images.new(name, width=width, height=height, alpha=True)
    image.colorspace_settings.name = 'Non-Color' if noncolor else 'sRGB'
    rgba = np.ones((height, width, 4), dtype=np.float32)
    rgba[:, :, :3] = np.clip(rgb, 0, 1)
    if alpha is not None: rgba[:, :, 3] = np.clip(alpha, 0, 1)
    image.pixels.foreach_set(rgba.ravel())
    image.filepath_raw = str(SOURCE / 'textures' / (name + '.png'))
    image.file_format = 'PNG'
    image.save()
    image.pack()
    return image


def material(name, color, kind='plain', metallic=0, roughness=.65, emission=0):
    if name in MATERIALS: return MATERIALS[name]
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    tree = mat.node_tree
    shader = tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Metallic'].default_value = metallic
    shader.inputs['Roughness'].default_value = roughness
    if 'Subsurface Weight' in shader.inputs and kind == 'skin':
        shader.inputs['Subsurface Weight'].default_value = .085
        shader.inputs['Subsurface Radius'].default_value = (1, .42, .22)
        shader.inputs['Specular IOR Level'].default_value = .28
    if kind == 'cloth':
        shader.inputs['Sheen Weight'].default_value = .16
        shader.inputs['Sheen Roughness'].default_value = .8
    if emission:
        shader.inputs['Emission Color'].default_value = (*color, 1)
        shader.inputs['Emission Strength'].default_value = emission
    if kind != 'plain':
        n = 512 if kind in ('skin', 'cloth') else 256
        yy, xx = np.mgrid[0:n, 0:n] / n
        noise = np.random.rand(n, n)
        broad = np.sin(xx * 32 + np.cos(yy * 14)) * np.sin(yy * 25 + xx * 8)
        if kind == 'skin':
            mottling = np.sin(xx*67+np.sin(yy*37))*np.cos(yy*81+xx*13)
            detail = (noise - .5) * .025 + broad * .025 + mottling*.014
            pores = np.power(noise, 22) * .16
            height = noise * .035 + broad * .02 - pores
            rgb = np.array(color)[None,None,:] * (1 + detail[:, :, None])
            rgb[:,:,0] += mottling * .007
            rgb[:,:,2] -= broad * .004
        elif kind == 'cloth':
            weave = np.sin(xx * math.pi * 128) * np.sin(yy * math.pi * 128)
            height = weave * .085 + noise * .025
            rgb = np.array(color)[None,None,:] * (1 + ((noise-.5)*.1 + weave*.04 + broad*.035)[:,:,None])
        elif kind == 'leather':
            height = noise * .25 + np.sin(xx*160+np.sin(yy*250))* .08
            rgb = np.array(color)[None,None,:] * (1 + ((noise-.5)*.17 + broad*.08)[:,:,None])
        else:
            height = np.sin(xx*500+np.sin(yy*8))*.2 + noise*.04
            rgb = np.array(color)[None,None,:] * (1 + ((noise-.5)*.08 + broad*.02)[:,:,None])
        color_image = image_from_array(name + '_basecolor', rgb)
        color_node = tree.nodes.new('ShaderNodeTexImage'); color_node.image = color_image
        tree.links.new(color_node.outputs['Color'], shader.inputs['Base Color'])
        dy, dx = np.gradient(height)
        normal = np.stack([-dx*2, -dy*2, np.ones_like(dx)], axis=-1)
        normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
        normal_image = image_from_array(name + '_normal', normal*.5+.5, True)
        normal_tex = tree.nodes.new('ShaderNodeTexImage'); normal_tex.image = normal_image
        normal_node = tree.nodes.new('ShaderNodeNormalMap'); normal_node.inputs['Strength'].default_value = .32 if kind=='skin' else .28 if kind=='cloth' else .35
        tree.links.new(normal_tex.outputs['Color'], normal_node.inputs['Color']); tree.links.new(normal_node.outputs['Normal'], shader.inputs['Normal'])
        rough = np.clip(roughness + (noise-.5)*.10 + broad*.035, .08, .98)
        rough_image = image_from_array(name + '_roughness', np.repeat(rough[:,:,None],3,axis=2), True)
        rough_tex = tree.nodes.new('ShaderNodeTexImage'); rough_tex.image = rough_image
        tree.links.new(rough_tex.outputs['Color'], shader.inputs['Roughness'])
    if kind in ('skin','cloth','leather'):
        attr=tree.nodes.new('ShaderNodeVertexColor'); attr.layer_name='SurfacePigment'
        multiply=tree.nodes.new('ShaderNodeMixRGB'); multiply.blend_type='MULTIPLY'; multiply.inputs[0].default_value=1
        tree.links.new(color_node.outputs['Color'],multiply.inputs[1]); tree.links.new(attr.outputs['Color'],multiply.inputs[2])
        tree.links.new(multiply.outputs[0],shader.inputs['Base Color'])
    MATERIALS[name] = mat
    return mat


def strand_material():
    """Exportable alpha-cutout hair atlas with fine, lengthwise fibers."""
    name='Chestnut strand cards'
    if name in MATERIALS: return MATERIALS[name]
    mat=material(name,(.032,.018,.010),roughness=.82)
    shader=mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Specular IOR Level'].default_value=.10
    n=512; yy,xx=np.mgrid[0:n,0:n]/(n-1)
    fibers=.5+.5*np.sin(xx*math.tau*33+.5*np.sin(yy*9+xx*5))
    fine=.5+.5*np.sin(xx*math.tau*71+yy*2)
    rgb=np.array([.047,.025,.012])[None,None,:]*(.48+.52*fibers+.12*fine)[:,:,None]
    taper=np.clip((1-yy)/.28,0,1)
    edge=np.clip((.49-np.abs(xx-.5))/.08,0,1)
    alpha=edge*(.06+.94*fibers**1.2)*np.clip(taper*3-fine*.9,0,1)
    tex=mat.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image=image_from_array('Chestnut strand atlas',rgb,alpha=alpha)
    mat.node_tree.links.new(tex.outputs['Color'],shader.inputs['Base Color'])
    cutoff=mat.node_tree.nodes.new('ShaderNodeMath'); cutoff.operation='GREATER_THAN'; cutoff.inputs[1].default_value=.35
    mat.node_tree.links.new(tex.outputs['Alpha'],cutoff.inputs[0])
    mat.node_tree.links.new(cutoff.outputs[0],shader.inputs['Alpha'])
    # glTF exports a masked, double-sided material: no transparent sorting issues.
    mat.surface_render_method='DITHERED'
    mat.use_backface_culling=False
    MATERIALS[name]=mat
    return mat


def facial_material(skin):
    """Cylindrical facial paint: warm cheeks/nose, lip color and pore roughness."""
    name=skin.name.replace(' skin',' face skin')
    if name in MATERIALS: return MATERIALS[name]
    mat=material(name,tuple(skin.diffuse_color[:3]),roughness=.64)
    n=512; vv,uu=np.mgrid[0:n,0:n]/(n-1)
    theta=(uu-.5)*math.tau; x=np.sin(theta)*.13; z=1.90+vv*.48
    front=np.maximum(0,np.cos(theta))**8
    cheeks=np.exp(-((np.abs(x)-.069)/.031)**2-((z-2.141)/.026)**2)*front
    nose=np.exp(-(x/.022)**2-((z-2.151)/.025)**2)*front
    lip=np.exp(-(x/.034)**4-((z-2.110)/.0055)**2)*front
    socket=np.exp(-((np.abs(x)-.044)/.026)**2-((z-2.191)/.016)**2)*front
    noise=np.random.random((n,n)); fine=(noise-.5)*.024
    rgb=np.array(skin.diffuse_color[:3])[None,None,:]*(1+fine[:,:,None])
    rgb*=1-(cheeks*.11+nose*.10+lip*.23+socket*.16)[:,:,None]
    rgb[:,:,0]+=.017*(cheeks+nose)-.012*lip
    rgb[:,:,1]-=.018*(cheeks+nose)+.035*lip
    rgb[:,:,2]-=.012*(cheeks+nose)+.024*lip
    # Sparse, low-contrast skin marks break up an otherwise uniform surface.
    for _ in range(55):
        fx=random.choice([-1,1])*random.uniform(.033,.099); fz=random.uniform(2.125,2.164)
        spot=np.exp(-((x-fx)/random.uniform(.0007,.0014))**2-((z-fz)/.0009)**2)*front
        rgb*=1-.11*spot[:,:,None]
    shader=mat.node_tree.nodes.get('Principled BSDF'); shader.inputs['Specular IOR Level'].default_value=.24
    shader.inputs['Subsurface Weight'].default_value=.085; shader.inputs['Subsurface Radius'].default_value=(1,.42,.22)
    base=mat.node_tree.nodes.new('ShaderNodeTexImage'); base.image=image_from_array(name+'_basecolor',rgb)
    mat.node_tree.links.new(base.outputs['Color'],shader.inputs['Base Color'])
    rough=np.clip(.66-.13*nose-.07*lip+(noise-.5)*.12,.40,.79)
    tex=mat.node_tree.nodes.new('ShaderNodeTexImage'); tex.image=image_from_array(name+'_roughness',np.repeat(rough[:,:,None],3,axis=2),True)
    mat.node_tree.links.new(tex.outputs['Color'],shader.inputs['Roughness'])
    height=noise*.05-np.power(noise,18)*.20; dy,dx=np.gradient(height)
    normal=np.stack([-dx*2,-dy*2,np.ones_like(dx)],axis=-1); normal/=np.linalg.norm(normal,axis=-1,keepdims=True)
    tex=mat.node_tree.nodes.new('ShaderNodeTexImage'); tex.image=image_from_array(name+'_normal',normal*.5+.5,True)
    bump=mat.node_tree.nodes.new('ShaderNodeNormalMap'); bump.inputs['Strength'].default_value=.30
    mat.node_tree.links.new(tex.outputs['Color'],bump.inputs['Color']); mat.node_tree.links.new(bump.outputs['Normal'],shader.inputs['Normal'])
    return mat


def activate(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def finish(obj, name, mat, bone=None, skin=False):
    obj.name = name
    if mat: obj.data.materials.append(mat)
    if obj.type == 'MESH':
        for polygon in obj.data.polygons: polygon.use_smooth = True
    obj['rig_region'] = bone or 'AUTO'
    if bone == 'Head': obj.location.z -= .045
    PARTS.append(obj)
    if skin: SKIN_PARTS.append(obj)
    return obj


def ellipsoid(name, location, scale, mat, bone=None, skin=False, rotation=None, segments=24):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=12, radius=1, location=location)
    obj = bpy.context.object
    obj.scale = scale
    if rotation: obj.rotation_euler = rotation
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj,name,mat,bone,skin)


def block(name, location, scale, mat, bone=None, bevel=.01, rotation=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj=bpy.context.object; obj.scale=scale
    if rotation: obj.rotation_euler=rotation
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod=obj.modifiers.new('Soft manufactured edges','BEVEL'); mod.width=bevel; mod.segments=2
        bpy.ops.object.modifier_apply(modifier=mod.name)
        mod=obj.modifiers.new('Weighted normals','WEIGHTED_NORMAL'); bpy.ops.object.modifier_apply(modifier=mod.name)
    return finish(obj,name,mat,bone)


def tube(name, points, radius, mat, bone=None, radii=None, resolution=3):
    curve=bpy.data.curves.new(name,'CURVE'); curve.dimensions='3D'; curve.resolution_u=resolution
    curve.bevel_depth=radius; curve.bevel_resolution=1
    spline=curve.splines.new('BEZIER'); spline.bezier_points.add(len(points)-1)
    for i,(p,co) in enumerate(zip(spline.bezier_points,points)):
        p.co=co; p.handle_left_type='AUTO'; p.handle_right_type='AUTO'
        if radii: p.radius=radii[i]
    obj=bpy.data.objects.new(name,curve); bpy.context.collection.objects.link(obj); activate(obj)
    bpy.ops.object.convert(target='MESH')
    return finish(bpy.context.object,name,mat,bone)


def surface(name, verts, faces, mat, bone=None, solidify=0, subdiv=0):
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(verts,[],faces); mesh.update()
    obj=bpy.data.objects.new(name,mesh); bpy.context.collection.objects.link(obj); activate(obj)
    if subdiv:
        mod=obj.modifiers.new('Tailored surface','SUBSURF'); mod.levels=subdiv; bpy.ops.object.modifier_apply(modifier=mod.name)
    if solidify:
        mod=obj.modifiers.new('Fabric thickness','SOLIDIFY'); mod.thickness=solidify; bpy.ops.object.modifier_apply(modifier=mod.name)
    return finish(obj,name,mat,bone)


def ring_surface(name, rings, mat, bone=None, segments=32, skin=False):
    verts=[]
    for z,rx,ry,cy in rings:
        for i in range(segments):
            a=i/segments*math.tau
            verts.append((math.sin(a)*rx, math.cos(a)*ry+cy, z))
    faces=[]
    for j in range(len(rings)-1):
        for i in range(segments): faces.append((j*segments+i,j*segments+(i+1)%segments,(j+1)*segments+(i+1)%segments,(j+1)*segments+i))
    faces += [tuple(reversed(range(segments))),tuple((len(rings)-1)*segments+i for i in range(segments))]
    obj=surface(name,verts,faces,mat,bone,subdiv=1)
    if skin: SKIN_PARTS.append(obj)
    return obj


def join_objects(objects,name):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects: obj.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.object.join(); obj=bpy.context.object; obj.name=name
    for old in objects:
        if old in PARTS: PARTS.remove(old)
    PARTS.append(obj)
    return obj


def remesh_skin(mat):
    obj=join_objects(SKIN_PARTS[:],CURRENT+'_continuous_skin')
    activate(obj)
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    obj.data.remesh_voxel_size=.008 if CURRENT=='eren' else .009
    bpy.ops.object.voxel_remesh()
    smooth=obj.modifiers.new('Sculpt surface relaxation','SMOOTH'); smooth.factor=1.25; smooth.iterations=5
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    decimate=obj.modifiers.new('Game topology','DECIMATE'); decimate.ratio=.24 if CURRENT=='eren' else .09 if CURRENT=='pure-titan' else .18
    bpy.ops.object.modifier_apply(modifier=decimate.name)
    obj.data.materials.clear(); obj.data.materials.append(mat)
    for poly in obj.data.polygons: poly.use_smooth=True
    obj['rig_region']='AUTO'
    SKIN_PARTS.clear()
    return obj


def reference_head(skin, titan=False):
    """Reshape the CC0 MakeHuman anatomical head in Blender; retain its facial topology."""
    coords=[]; faces=[]; group=''; eye_faces={'helper-l-eye':[],'helper-r-eye':[]}
    for line in (SOURCE/'reference'/'makehuman-base.obj').read_text().splitlines():
        if line.startswith('v '): coords.append(tuple(map(float,line.split()[1:])))
        elif line.startswith('g '): group=line[2:]
        elif line.startswith('f '):
            face=tuple(int(p.split('/')[0])-1 for p in line.split()[1:])
            if group=='body' and min(coords[i][1] for i in face)>5.90: faces.append(face)
            elif group in eye_faces: eye_faces[group].append(face)
    def convert(v):
        x,y,z=v
        # More angular jaw and a slightly broader brow on the Titan variants.
        width=1+.065*math.exp(-((y-6.45)/.48)**2) if titan else 1+.025*math.exp(-((y-6.35)/.3)**2)
        neck=max(0,min(1,(6.15-y)/.25))
        px=x*.14*width*(1-.15*neck); py=.0778-z*.14-.036*neck; pz=1.1712+y*.14-.08*neck
        if py<-.06:
            # Preserve the source's eye/lip loops while sculpting cheekbones,
            # nasal bridge, jaw corners and subtle natural asymmetry.
            front=max(0,min(1,(-py-.06)/.045))
            cheek=math.exp(-((abs(px)-.070)/.031)**2-((pz-2.153)/.035)**2)
            jaw=math.exp(-((abs(px)-.068)/.035)**2-((pz-2.070)/.044)**2)
            bridge=math.exp(-(px/.019)**2-((pz-2.174)/.050)**2)
            py-=front*(.0045*cheek+.003*bridge)
            px*=1+.045*jaw
            pz+=front*.0015*math.sin(px*33)*cheek
        if titan and py<-.065:
            py-=.009*math.exp(-((pz-2.22)/.022)**2)*math.exp(-((abs(px)-.049)/.035)**2)
            px*=1+.10*math.exp(-((pz-2.095)/.06)**2)
            py+=.004*math.exp(-((pz-2.12)/.035)**2)*math.exp(-((abs(px)-.07)/.025)**2)
        return (px,py,pz)
    def build_mesh(name,polys,mat,subdiv=None):
        if subdiv is None: subdiv=1
        used=sorted({i for f in polys for i in f}); lookup={old:new for new,old in enumerate(used)}
        verts=[convert(coords[i]) for i in used]
        if name=='Anatomical facial topology':
            # Terminate the extracted neck in an even ring beneath the collar.
            for index,original in enumerate(used):
                if coords[original][1]<6.1: verts[index]=(verts[index][0],verts[index][1],1.903)
        return surface(name,verts,[tuple(lookup[i] for i in f) for f in polys],mat,'Head',subdiv=subdiv)
    head=build_mesh('Anatomical facial topology',faces,facial_material(skin))
    activate(head)
    detail=head.modifiers.new('Facial detail budget','DECIMATE'); detail.ratio=.32 if CURRENT=='pure-titan' else .52
    bpy.ops.object.modifier_apply(modifier=detail.name)
    uv=head.data.uv_layers.new(name='Facial cylindrical UV')
    for polygon in head.data.polygons:
        values=[]
        for index in polygon.loop_indices:
            p=head.data.vertices[head.data.loops[index].vertex_index].co
            values.append((index,math.atan2(p.x,-p.y)/math.tau+.5,(p.z-1.90)/.48))
        seam=max(u for _,u,_ in values)-min(u for _,u,_ in values)>.5
        for index,u,v in values: uv.data[index].uv=(u+1 if seam and u<.5 else u,v)
    # Slightly warmer lip material, assigned to the original lip polygons.
    lip=material('Natural lip pigmentation',(.40,.225,.18),'skin',roughness=.57)
    head.data.materials.append(lip)
    for poly in head.data.polygons:
        center=sum((head.data.vertices[i].co for i in poly.vertices),Vector())/len(poly.vertices)
        # Lip tint is smoothly painted in SurfacePigment, avoiding a hard
        # polygon boundary around the philtrum after mesh reduction.
        poly.material_index=0
    sclera=material('Warm sclera',(.67,.64,.59),roughness=.22)
    iris=material('Jade iris',(.060,.125,.074),roughness=.29,emission=.05 if titan else 0)
    pupil=material('Pupil',(.002,.003,.002),roughness=.16)
    if not iris.get('iris_detail'):
        n=256; vv,uu=np.mgrid[0:n,0:n]/(n-1)*2-1
        radius=np.sqrt(uu*uu+vv*vv); angle=np.arctan2(vv,uu)
        fibers=.75+.16*np.sin(angle*61+radius*18)+.09*np.sin(angle*103-radius*27)
        limbal=1-.75*np.exp(-((radius-.91)/.08)**2)
        amber=np.exp(-((radius-.39)/.12)**2)
        rgb=np.array([.10,.18,.10])[None,None,:]*(fibers*limbal)[:,:,None]
        rgb[:,:,0]+=.045*amber
        tex=iris.node_tree.nodes.new('ShaderNodeTexImage'); tex.image=image_from_array('Jade radial iris',rgb)
        iris.node_tree.links.new(tex.outputs['Color'],iris.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
        iris['iris_detail']=True
    for name,polys in eye_faces.items():
        build_mesh('Anatomical eyeball',polys,sclera,subdiv=1)
        side=1 if 'l-eye' in name else -1
        x=side*.043085
        eye=ellipsoid('Jade iris',(x,-.1205,2.191),(.0076,.0021,.0076),iris,'Head',segments=32)
        uv=eye.data.uv_layers.active
        for loop in eye.data.loops:
            p=eye.data.vertices[loop.vertex_index].co
            uv.data[loop.index].uv=(p.x/.0152+.5,p.z/.0152+.5)
        ellipsoid('Pupil',(x,-.1224,2.191),(.0028,.0007,.0029),pupil,'Head',segments=24)
    return head


def build_head(skin, titan=False, attack=False):
    # The anatomical source includes a complete neck, extending beneath the collar.
    pass


def face_details(skin,titan=False,attack=False):
    face=reference_head(skin,titan)
    bpy.context.view_layer.update()
    hair=material('Dark chestnut',(.055,.028,.017),'hair',roughness=.78)
    hair.node_tree.nodes.get('Principled BSDF').inputs['Specular IOR Level'].default_value=.12
    hair.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.87
    for side in [-1,1]:
        points=[]
        for x,z in [(side*.021,2.214),(side*.047,2.226),(side*.079,2.221)]:
            hit,point,normal,index=face.ray_cast(Vector((x,-1,z)),Vector((0,1,0)))
            points.append((x,point.y-.002 if hit else -.14,z))
        tube('Eyebrow',points,.0014,hair,'Head',radii=[.4,1,.08])
        for j in range(18):
            t=j/17; p=Vector(points[0]).lerp(Vector(points[1]),min(t*2,1)) if t<.5 else Vector(points[1]).lerp(Vector(points[2]),(t-.5)*2)
            tube('Individual brow hair',[p,p+Vector((side*.002,-.0005,.0026)),p+Vector((side*.003,-.0003,.004))],.00025,hair,'Head',radii=[.8,1,.05])
    if titan:
        teeth=material('Natural ivory',(.63,.56,.41),roughness=.4)
        mouth=material('Mouth interior',(.035,.009,.007),roughness=.8)
        tissue=material('Titan facial sinew',(.24,.075,.046),'skin',roughness=.76)
        # The Attack Titan's exposed teeth are modeled across the lower face.
        ellipsoid('Titan jaw recess',(0,-.136,2.111),(.071,.007,.018),mouth,'Head')
        for row in [-1,1]:
            for j in range(12):
                x=(j-5.5)*.011
                block('Titan tooth',(x,-.145+(abs(x)/.07)**2*.013,2.111+row*.0065),(.009,.009,.011),teeth,'Head',bevel=.002)
        for side in [-1,1]:
            for j in range(3): tube('Facial sinew',[(side*(.061+j*.007),-.114+j*.007,2.145),(side*(.071+j*.006),-.114+j*.007,2.115),(side*(.055+j*.006),-.11+j*.007,2.081)],.0027,tissue,'Head')
    # Close-fitting hair cap with many swept, tapered locks and fine striations.
    hair2=material('Chestnut highlights',(.09,.049,.027),'hair',roughness=.79)
    hair3=material('Chestnut shadow',(.029,.016,.011),'hair',roughness=.82)
    verts=[]; faces=[]; count=48; rows=12
    for j in range(rows):
        v=j/(rows-1)
        for i in range(count):
            a=i/count*math.tau
            bottom=(1.99 if math.cos(a)>-.25 else 2.263) if attack else (2.18 if math.cos(a)>-.25 else 2.263)
            endphi=math.acos(max(-1,min(1,(bottom-2.20)/.168)))
            phi=.025+v*(endphi-.025)
            verts.append((math.sin(a)*math.sin(phi)*(.142 if titan else .129),-.007+math.cos(a)*math.sin(phi)*.151,2.20+math.cos(phi)*.168))
    for j in range(rows-1):
        for i in range(count): faces.append((j*count+i,j*count+(i+1)%count,(j+1)*count+(i+1)%count,(j+1)*count+i))
    surface('Scalp hair',verts,faces,hair,'Head',solidify=.004)
    # Layered, tapered hair clumps: modeled silhouettes, not expensive tubular strands.
    # Close the crown and overlap swept layers to avoid a visible bald pole.
    surface('Hair crown',[(0,-.007,2.364)]+verts[:count],[(0,i+1,(i+1)%count+1) for i in range(count)],hair,'Head')
    cards=strand_material()
    locks=104 if attack else 84 if not titan else 64
    for i in range(locks):
        a=i/locks*math.tau+random.uniform(-.13,.13)
        front=math.cos(a)<-.28
        root=Vector((.012+math.sin(a)*.036,math.cos(a)*.038,2.366+random.uniform(-.002,.013)))
        middle=Vector((math.sin(a)*(.147 if titan else .13),-.006+math.cos(a)*.16,2.30+random.uniform(-.012,.022)))
        endz=random.uniform(1.91,2.11) if attack and not front else random.uniform(2.13,2.23)
        tip=Vector((math.sin(a+.18)*(.175 if attack else .148),math.cos(a+.18)*.159,endz))
        if front:
            tip=Vector((math.sin(a+.30)*.116,-.159,random.uniform(2.215,2.262)))
            if attack: tip.x += .024*(1 if tip.x>0 else -1)
        hv=[]; hf=[]; width=random.uniform(.007,.014)
        for j in range(12):
            t=j/11; center=(1-t)**2*root+2*t*(1-t)*middle+t*t*tip
            tangent=(2*(1-t)*(middle-root)+2*t*(tip-middle)).normalized()
            normal=Vector((math.sin(a),math.cos(a),.35)).normalized()
            across=tangent.cross(normal).normalized(); outward=across.cross(tangent).normalized()
            taper=math.sin((.12+t*.88)*math.pi)**.7 if t<1 else .012
            for k in range(4):
                across_t=k/3*2-1
                hv.append(center+across*(across_t*width*taper)+outward*((1-across_t**2)*width*.10))
        for j in range(11):
            for k in range(3): hf.append((j*4+k,j*4+k+1,(j+1)*4+k+1,(j+1)*4+k))
        lock=surface('Swept fine hair card',hv,hf,cards,'Head')
        uv=lock.data.uv_layers.new(name='Strand UV')
        for loop in lock.data.loops:
            vi=loop.vertex_index; uv.data[loop.index].uv=((vi%4)/3,(vi//4)/11)


def titan_anatomy(skin,attack):
    """Retarget CC0 anatomical topology and weights into our relaxed combat bind pose.
    Continuous edge loops preserve deltoids, elbows, knuckles, knees and feet.
    """
    global FINGER_RIG
    FINGER_RIG={}
    coords=[]; faces=[]; group=''
    for line in (SOURCE/'reference'/'makehuman-base.obj').read_text().splitlines():
        if line.startswith('v '): coords.append(Vector(tuple(map(float,line.split()[1:]))))
        elif line.startswith('g '): group=line[2:]
        elif line.startswith('f ') and group=='body': faces.append(tuple(int(p.split('/')[0])-1 for p in line.split()[1:]))
    original=[v.copy() for v in coords]
    for filename,strength in [('male-young.target',.85),('male-muscle.target',1.0 if attack else .6)]:
        for line in (SOURCE/'reference'/filename).read_text().splitlines():
            if not line or line.startswith('#'): continue
            i,x,y,z=line.split(); coords[int(i)]+=Vector((float(x),float(y),float(z)))*strength
    reference=json.loads((SOURCE/'reference'/'default.mhskel').read_text())
    source_weights=json.loads((SOURCE/'reference'/'default_weights.mhw').read_text())['weights']
    def joint(bone,part='head'):
        indices=reference['joints'][reference['bones'][bone][part]]
        return sum((coords[i] for i in indices),Vector())/len(indices)
    def map_bone(name):
        # Source left is +X, the game's Blender rig labels -X as left.
        tag='R' if name.endswith('.L') else 'L'
        for prefix,target in [('upperarm','UpperArm'),('lowerarm','Forearm'),('upperleg','UpperLeg'),('lowerleg','Shin'),('foot','Foot'),('toe','Foot')]:
            if name.startswith(prefix): return target+'_'+tag
        if name.startswith('finger'):
            digit=int(name[6]); segment=min(2,int(name[8])); return f'Finger{digit}_{segment}_{tag}'
        if name.startswith(('metacarpal','wrist')): return 'Hand_'+tag
        if name.startswith(('neck','head','jaw','special','eye','tongue')): return 'Head'
        return 'Torso'
    weights={}
    for name,entries in source_weights.items():
        dest=map_bone(name)
        for index,value in entries:
            weights.setdefault(index,{})[dest]=weights.setdefault(index,{}).get(dest,0)+value
    transforms={}
    for s in [-1,1]:
        source='.L' if s>0 else '.R'; tag='_R' if s>0 else '_L'
        shoulder=joint('upperarm01'+source); elbow=joint('lowerarm01'+source); wrist=joint('wrist'+source)
        hip=joint('upperleg01'+source); knee=joint('lowerleg01'+source); ankle=joint('foot'+source)
        definitions=[('UpperArm',shoulder,elbow,(s*.407,0,1.818),(s*.53,0,1.404),.17),
          ('Forearm',elbow,wrist,(s*.53,0,1.404),(s*.57,-.01,1.105),.16),
          ('Hand',wrist,wrist+Vector((0,-.6,.7)),(s*.57,-.01,1.105),(s*.575,-.035,.965),.16),
          ('UpperLeg',hip,knee,(s*.17,0,1.09),(s*.17,-.01,.572),.17),
          ('Shin',knee,ankle,(s*.17,-.01,.572),(s*.17,0,.1),.15),
          ('Foot',ankle,ankle+Vector((0,-.3,1.2)),(s*.17,0,.1),(s*.17,-.165,.055),.14)]
        for name,a,b,c,d,width in definitions:
            if attack and name in ('UpperArm','Forearm','UpperLeg','Shin'): width*=1.12
            axis=(b-a).normalized(); dest=(Vector(d)-Vector(c)); rotate=axis.rotation_difference(dest.normalized())
            transforms[name+tag]=(a,axis,rotate,Vector(c),dest.length/(b-a).length,width)
    pelvis_y=joint('upperleg01.L').y
    neck_y=joint('neck01').y
    shoulder_x=joint('upperarm01.L').x
    hip_x=joint('upperleg01.L').x
    def deform(v,bone):
        if bone.startswith('Finger'): bone='Hand_'+bone[-1]
        if bone in transforms:
            origin,axis,rotate,dest,length,width=transforms[bone]
            delta=v-origin; along=axis*delta.dot(axis)
            return dest+rotate@(along*length+(delta-along)*width)
        x,y,z=v
        width=float(np.interp(y,[pelvis_y,neck_y-.7],[.17/hip_x,.407/shoulder_x]))
        return Vector((x*width,.02-(z-.123)*.17,1.09+(y-pelvis_y)/(neck_y-pelvis_y)*.85))
    for side,tag in [('.L','R'),('.R','L')]:
        for digit in range(1,6):
            for segment in [1,2]:
                source=f'finger{digit}-{segment}'+side
                tail=f'finger{digit}-{3 if segment==2 else 1}'+side
                name=f'Finger{digit}_{segment}_{tag}'
                head=deform(joint(source), 'Hand_'+tag); end=deform(joint(tail,'tail'),'Hand_'+tag)
                parent='Hand_'+tag if segment==1 else f'Finger{digit}_1_{tag}'
                FINGER_RIG[name]=(head,end,parent)
    faces=[f for f in faces if max(original[i].y for i in f)<6.0]
    used=sorted({i for f in faces for i in f}); lookup={v:i for i,v in enumerate(used)}
    vertices=[]
    for i in used:
        ws=weights.get(i,{'Torso':1}); total=sum(ws.values())
        p=sum((deform(coords[i],bone)*w/total for bone,w in ws.items()),Vector())
        # Titans have a neutral, smooth lower pelvis.
        blend=math.exp(-(p.x/.11)**4-((p.z-1.02)/.11)**4)
        if p.y<0: p.y=p.y*(1-blend)-.105*blend
        vertices.append(p)
    obj=surface('Retopologized anatomical body',vertices,[tuple(lookup[i] for i in f) for f in faces],skin,'SOURCE')
    for bone in {b for i in used for b in weights.get(i,{'Torso':1})}: obj.vertex_groups.new(name=bone)
    for vi,i in enumerate(used):
        ws=weights.get(i,{'Torso':1}); total=sum(ws.values())
        for b,w in ws.items(): obj.vertex_groups[b].add([vi],w/total,'REPLACE')
    activate(obj)
    mod=obj.modifiers.new('Anatomical subdivision','SUBSURF'); mod.levels=1; bpy.ops.object.modifier_apply(modifier=mod.name)
    for v in obj.data.vertices:
        x,y,z=v.co
        if y<-.06 and 1.15<z<1.88 and abs(x)<.35:
            front=max(0,min(1,(-y-.06)/.08)); relief=0
            for side in [-1,1]:
                relief+=.04*math.exp(-((x-side*.155)/.12)**2-((z-1.705)/.095)**2)
                for h in [1.29,1.39,1.49,1.58]: relief+=.023*math.exp(-((x-side*.073)/.048)**2-((z-h)/.034)**2)
            v.co.y-=relief*front*(1 if attack else .35)
            # Sternum, obliques and serratus connect the larger muscle masses.
            detail=-.008*math.exp(-(x/.020)**2-((z-1.65)/.22)**2)
            for s in [-1,1]:
                detail+=.011*math.exp(-((x-s*.215)/.043)**2-((z-1.44)/.18)**2)
                for h in [1.55,1.62,1.69]:
                    detail+=.006*math.exp(-((x-s*.245)/.047)**2-((z-h-s*x*.12)/.019)**2)
            v.co.y-=detail*front*(1 if attack else .45)
        if y>.06 and 1.35<z<1.91:
            for s in [-1,1]:
                v.co.y+=.012*math.exp(-((x-s*.16)/.10)**2-((z-1.73)/.12)**2)
    face_details(skin,True,attack)


def eren_uniform(skin):
    shirt=material('Linen undershirt',(.49,.46,.365),'cloth',roughness=.78)
    jacket=material('Weathered scout canvas',(.29,.195,.106),'cloth',roughness=.76)
    seam=material('Canvas stitching',(.41,.3,.171),roughness=.8)
    trousers=material('Ivory cavalry twill',(.52,.50,.416),'cloth',roughness=.80)
    leather=material('Harness leather',(.07,.052,.039),'leather',roughness=.62)
    boot=material('Worn riding boots',(.053,.043,.033),'leather',roughness=.58)
    metal=material('Brushed ODM steel',(.28,.32,.33),'metal',metallic=.85,roughness=.3)
    blade=material('Tempered blades',(.5,.55,.56),metallic=.93,roughness=.2)
    darkmetal=material('Gunmetal housings',(.065,.083,.086),metallic=.8,roughness=.36)
    cape=material('Survey green wool',(.07,.125,.093),'cloth',roughness=.86)
    white=material('Emblem ivory thread',(.62,.64,.55),'cloth',roughness=.9)
    blue=material('Emblem blue thread',(.055,.17,.24),'cloth',roughness=.86)
    ring_surface('Trouser pelvis',[(1.0,.072,.087,0),(1.045,.166,.124,.007),(1.10,.200,.135,.007),(1.173,.201,.128,0)],trousers,segments=40)
    ring_surface('Linen torso',[(1.1,.195,.114,0),(1.28,.177,.115,0),(1.5,.236,.133,0),(1.72,.278,.146,.008),(1.85,.222,.117,.015),(1.94,.074,.064,.005)],shirt,'Torso')
    # Open, tailored front panels rather than a solid box jacket.
    for s in [-1,1]:
        pv=[]; pf=[]; cols=11; rows=23
        for j in range(rows):
            t=j/(rows-1); z=1.31+t*.56
            outer=float(np.interp(z,[1.31,1.55,1.74,1.87],[.215,.260,.274,.15]))
            inner=.044+.014*t
            for i in range(cols):
                u=i/(cols-1); x=inner+(outer-inner)*u
                y=-.157+.033*u*u-.014*math.sin(math.pi*t)*math.sin(math.pi*u)
                y+=.0035*math.sin(u*11+t*7)*math.sin(math.pi*t)*math.sin(math.pi*u)
                pv.append((s*x,y,z+.009*math.sin(u*math.pi)*(1-t)**4))
        for j in range(rows-1):
            for i in range(cols-1): pf.append((j*cols+i,j*cols+i+1,(j+1)*cols+i+1,(j+1)*cols+i))
        surface('Draped jacket front',pv,pf,jacket,'Torso',solidify=.004)
        surface('Folded lapel',[(s*.073,-.158,1.716),(s*.156,-.133,1.82),(s*.11,-.12,1.907),(s*.04,-.14,1.867)],[(0,1,2,3)],jacket,'Torso',solidify=.004)
        block('Chest pocket',(s*.173,-.181,1.633),(.115,.014,.126),jacket,'Torso',bevel=.008)
        block('Pocket flap',(s*.173,-.193,1.69),(.122,.013,.027),jacket,'Torso',bevel=.004)
        ellipsoid('Pocket stud',(s*.173,-.203,1.683),(.006,.003,.006),metal,'Torso',segments=12)
        tube('Jacket opening seam',[(s*.039,-.154,1.32),(s*.046,-.158,1.53),(s*.055,-.16,1.72)],.0021,seam,'Torso')
        tube('Shoulder seam',[(s*.11,-.098,1.914),(s*.25,-.083,1.877),(s*.315,.004,1.836)],.0025,seam,'Torso')
    ring_surface('Jacket back',[(1.31,.209,.115,.012),(1.5,.256,.149,.022),(1.72,.285,.149,.018),(1.85,.213,.112,.022)],jacket,'Torso')
    # Front slit of the back shell is masked by shirt and tailored lapels.
    block('Center linen placket',(0,-.154,1.58),(.075,.018,.49),shirt,'Torso',bevel=.008)
    for z in [1.77,1.69,1.61]: ellipsoid('Linen button',(0,-.165,z),(.005,.0025,.005),leather,'Torso',segments=12)
    build_head(skin)
    for s in [-1,1]:
        tag='L' if s<0 else 'R'
        sleeve_verts=[]; sleeve_faces=[]; rings=26; sides=24
        for row in range(rings):
            z=1.17+row/(rings-1)*.72
            cx=float(np.interp(z,[1.17,1.40,1.64,1.80,1.89],[.378,.365,.333,.297,.287]))
            rx=float(np.interp(z,[1.17,1.40,1.64,1.80,1.89],[.067,.082,.089,.106,.022]))
            for col in range(sides):
                a=col/sides*math.tau
                wrinkle=.003*math.sin(z*105+math.cos(a)*2)*math.exp(-((z-1.43)/.15)**2)
                sleeve_verts.append((s*(cx+math.sin(a)*(rx+wrinkle)),math.cos(a)*(rx*1.08+wrinkle),z))
        for row in range(rings-1):
            for col in range(sides): sleeve_faces.append((row*sides+col,row*sides+(col+1)%sides,(row+1)*sides+(col+1)%sides,(row+1)*sides+col))
        sleeve_faces.append(tuple((rings-1)*sides+i for i in range(sides)))
        surface('Tailored sleeve with compression folds',sleeve_verts,[tuple(reversed(f)) if s>0 else f for f in sleeve_faces],jacket)
        block('Sleeve cuff',(s*.377,-.004,1.185),(.137,.15,.047),jacket,'Forearm_'+tag,bevel=.015)
        ellipsoid('Hand palm',(s*.385,-.017,1.108),(.046,.031,.071),skin,skin=True)
        for j in range(4): ellipsoid('Hand finger',(s*(.349+j*.021),-.028,1.054+abs(j-1.4)*.005),(.013,.019,.04),skin,skin=True,segments=16)
        ellipsoid('Thumb',(s*.337,-.027,1.115),(.015,.022,.04),skin,skin=True,rotation=(0,s*-.25,0),segments=16)
        leg=ring_surface('Continuous tailored twill leg',[(.55,.077,.086,-.005),(.59,.089,.103,-.010),(.65,.096,.105,.001),(.76,.110,.122,.004),(.91,.123,.127,.003),(1.04,.114,.118,.003),(1.10,.087,.097,.003)],trousers,segments=32)
        leg.location.x=s*.131
        bootshaft=ring_surface('Fitted leather boot',[(.06,.071,.085,-.014),(.14,.063,.074,.01),(.27,.076,.085,.015),(.42,.083,.093,.011),(.565,.078,.086,.007)],boot,'Shin_'+tag,segments=32)
        bootshaft.location.x=s*.138
        block('Boot top cuff',(s*.138,.008,.568),(.176,.184,.037),boot,'Shin_'+tag,bevel=.015)
        ellipsoid('Boot foot',(s*.138,-.071,.072),(.087,.164,.069),boot,'Foot_'+tag)
        block('Boot sole',(s*.138,-.07,.024),(.178,.326,.034),leather,'Foot_'+tag,bevel=.016)
        block('Boot heel',(s*.138,.042,.037),(.15,.105,.072),leather,'Foot_'+tag,bevel=.011)
        tube('Boot rear seam',[(s*.138,.105,.12),(s*.138,.112,.37),(s*.138,.094,.55)],.002,seam,'Shin_'+tag)
        for z in [.86,.66]:
            block('Thigh harness band',(s*.131,-.129,z),(.237,.014,.036),leather,'UpperLeg_'+tag,bevel=.005)
            block('Leg harness buckle',(s*.131,-.14,z),(.04,.013,.031),metal,'UpperLeg_'+tag,bevel=.004)
        tube('Leg harness vertical',[(s*.187,-.12,1.06),(s*.189,-.132,.83),(s*.159,-.119,.61)],.012,leather,'UpperLeg_'+tag)
        surface('Cross chest harness',[(s*.219,-.153,1.87),(s*.189,-.154,1.87),(-s*.095,-.187,1.53),(-s*.187,-.152,1.22),(-s*.157,-.152,1.22),(-s*.065,-.187,1.53)],[(0,1,2,3,4,5)],leather,'Torso',solidify=.006)
        block('ODM blade magazine',(s*.307,.002,1.034),(.161,.405,.216),darkmetal,'Torso',bevel=.018)
        for j in range(5): block('Magazine blade rib',(s*.31,-.03+j*.057,1.149),(.13,.014,.009),metal,'Torso',bevel=.003)
        block('Magazine faceplate',(s*.399,-.01,1.034),(.017,.33,.145),metal,'Torso',bevel=.006)
        for z in [1.0,1.07]: ellipsoid('Magazine bolt',(s*.41,-.105,z),(.004,.006,.006),darkmetal,'Torso',segments=12)
        # Gas cylinder, pressure gauge, flexible hose, and trigger grips.
        ellipsoid('ODM compressed gas tank',(s*.262,.177,1.127),(.065,.223,.065),metal,'Torso')
        block('Tank retaining strap',(s*.262,.18,1.127),(.139,.037,.135),leather,'Torso',bevel=.005)
        tube('Gas hose',[(s*.262,.32,1.12),(s*.338,.24,1.25),(s*.36,.04,1.15)],.009,leather,'Torso')
        block('Trigger grip',(s*.389,-.04,1.088),(.045,.045,.114),leather,'Hand_'+tag,bevel=.008)
        block('Blade guard',(s*.389,-.09,1.107),(.12,.065,.03),metal,'Hand_'+tag,bevel=.009)
        # Segmented, thin cutting blade extends forward from each hand.
        block('Segmented blade',(s*.389,-.47,1.112),(.039,.72,.007),blade,'Hand_'+tag,bevel=.002)
        for j in range(9): tube('Blade score',[(s*.372,-.17-j*.067,1.117),(s*.406,-.185-j*.067,1.117)],.0007,darkmetal,'Hand_'+tag)
    remesh_skin(skin)
    face_details(skin)
    # Waist harness and actual metal buckle frame.
    ring_surface('Waist leather belt',[(1.164,.208,.133,0),(1.223,.204,.132,0)],leather,'Torso',segments=40)
    for x,z,w,h in [(-.028,1.195,.007,.05),(.028,1.195,.007,.05),(0,1.219,.057,.006),(0,1.171,.057,.006)]: block('Belt buckle',(x,-.145,z),(w,.012,h),metal,'Torso',bevel=.002)
    # A shaped cloak with broad folds and a sewn double-wing emblem.
    verts=[]; faces=[]; cols=23; rows=24
    for j in range(rows):
        v=j/(rows-1)
        for i in range(cols):
            u=i/(cols-1)*2-1
            verts.append((u*(.19+.155*math.sin(v*math.pi*.85)), .175+v*.116+math.cos(u*math.pi*4)*.023*v+math.sin(u*13+v*7)*.006*v, 1.932-v*1.06+.047*u*u*v))
    for j in range(rows-1):
        for i in range(cols-1): faces.append((j*cols+i,j*cols+i+1,(j+1)*cols+i+1,(j+1)*cols+i))
    surface('Survey cloak',verts,faces,cape,'Cape',solidify=.006,subdiv=0)
    tube('Cloak hem',[verts[(rows-1)*cols+i] for i in range(cols)],.004,cape,'Cape')
    for s in [-1,1]:
        for j in range(6):
            x=s*(.023+j*.016); z=1.628-j*.024
            surface('Wings of Freedom embroidery',[(x,.216,z+.12),(x+s*.065,.227,z+.087),(x+s*.047,.237,z-.035),(x,.237,z-.086)],[(0,1,2,3)],blue if s<0 else white,'Cape',solidify=.0015)
    tube('Cloak clasp',[(-.055,-.067,1.934),(0,-.081,1.919),(.055,-.067,1.934)],.006,metal,'Torso')


def eren_fabric_details():
    """Add low-amplitude drape folds to fabric, retaining the established silhouette."""
    for obj in PARTS:
        name=obj.name
        if 'lapel' in name.lower() or 'Cross chest harness' in name:
            activate(obj); bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
            for v in obj.data.vertices: v.co.y-=.018
        mat=obj.data.materials[0].name if obj.data.materials else ''
        if not any(word in mat for word in ['canvas','undershirt','twill']): continue
        if any(word in name for word in ['stud','button','seam','flap']): continue
        activate(obj); bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
        for v in obj.data.vertices:
            x,y,z=v.co; side=-1 if x<0 else 1
            if 'sleeve' in name.lower():
                a=math.atan2(x-side*.35,y)
                fold=.0035*math.sin(z*83+a*1.7)*math.exp(-((z-1.405)/.125)**2)
                v.co.y+=fold*math.cos(a)
            elif 'twill' in name.lower() or 'Knee fabric' in name:
                a=math.atan2(x-side*.135,y)
                fold=.0035*math.sin(z*90+1.3*a)*math.exp(-((z-.63)/.115)**2)
                fold+=.0028*math.sin(z*50-a*2)*math.exp(-((z-1.02)/.13)**2)
                v.co.y+=fold*math.cos(a); v.co.x+=fold*math.sin(a)
            elif 'Linen torso' in name:
                v.co.y+=(.003*math.sin(x*44+z*30)+.002*math.sin(x*71-z*18))*math.exp(-((z-1.26)/.18)**2)


def create_rig(titan):
    arm=bpy.data.armatures.new(CURRENT+'_skeleton'); rig=bpy.data.objects.new('CharacterRig',arm); bpy.context.collection.objects.link(rig)
    activate(rig); bpy.ops.object.mode_set(mode='EDIT')
    def bone(name,head,tail,parent=None):
        b=arm.edit_bones.new(name); b.head=head; b.tail=tail
        if parent: b.parent=arm.edit_bones[parent]
    bone('Root',(0,0,0),(0,0,.2))
    bone('Pelvis',(0,0,1.09),(0,0,1.28),'Root')
    bone('Torso',(0,0,1.09),(0,0,1.55),'Pelvis')
    bone('Chest',(0,0,1.55),(0,0,1.94),'Torso')
    if not titan: bone('Neck',(0,.015,1.925),(0,.015,1.995),'Chest')
    bone('Head',(0,.015,1.94 if titan else 1.995),(0,.015,2.34),'Chest' if titan else 'Neck')
    bone('Cape',(0,.1,1.87),(0,.17,1.25),'Chest')
    if not titan:
        bone('CapeMid',(0,.205,1.53),(0,.24,1.15),'Cape')
        bone('CapeTip',(0,.24,1.15),(0,.29,.87),'CapeMid')
        bone('HairFront',(0,-.08,2.27),(0,-.12,2.18),'Head')
        bone('HairBack',(0,.07,2.25),(0,.13,2.13),'Head')
    for s in [-1,1]:
        tag='L' if s<0 else 'R'
        if not titan:
            bone('Clavicle_'+tag,(s*.07,0,1.83),(s*.29,0,1.818),'Chest')
            bone('Jacket_'+tag,(s*.13,-.02,1.53),(s*.14,-.03,1.31),'Torso')
            bone('Lapel_'+tag,(s*.11,-.13,1.86),(s*.1,-.15,1.72),'Chest')
        shoulder=.407 if titan else .29; elbow=.53 if titan else .365; wrist=.57 if titan else .384
        hip=.17 if titan else .135
        bone('UpperArm_'+tag,(s*shoulder,0,1.818),(s*elbow,0,1.404),'Chest' if titan else 'Clavicle_'+tag)
        bone('Forearm_'+tag,(s*elbow,0,1.404),(s*wrist,-.01,1.105 if titan else 1.155),'UpperArm_'+tag)
        bone('Hand_'+tag,(s*wrist,-.01,1.105 if titan else 1.155),(s*(wrist+.006),-.03,.954 if titan else 1.05),'Forearm_'+tag)
        if not titan:
            bone('Fingers_'+tag,(s*.385,-.019,1.091),(s*.385,-.026,1.047),'Hand_'+tag)
            bone('Thumb_'+tag,(s*.345,-.02,1.128),(s*.336,-.03,1.084),'Hand_'+tag)
        bone('UpperLeg_'+tag,(s*hip,0,1.09),(s*hip,-.01 if titan else 0,.572),'Pelvis')
        bone('Shin_'+tag,(s*hip,-.01 if titan else 0,.572),(s*hip,0,.1),'UpperLeg_'+tag)
        bone('Foot_'+tag,(s*hip,0,.1),(s*hip,0,-.05),'Shin_'+tag)
        if not titan:
            bone('Toe_'+tag,(s*hip,-.16,.035),(s*hip,-.16,-.045),'Foot_'+tag)
            bone('ElbowCorrect_'+tag,(s*elbow,0,1.404),(s*elbow,0,1.31),'UpperArm_'+tag)
            bone('KneeCorrect_'+tag,(s*hip,0,.572),(s*hip,0,.46),'UpperLeg_'+tag)
    if titan:
        for name,(head,tail,parent) in FINGER_RIG.items(): bone(name,head,tail,parent)
    bpy.ops.object.mode_set(mode='OBJECT')
    rig.show_in_front=True; arm.display_type='STICK'
    return rig


def weights_at(co,titan):
    x,y,z=co; ax=abs(x); tag='L' if x<0 else 'R'
    def blend(a,b,t):
        t=max(0,min(1,t)); t=t*t*(3-2*t); return {a:1-t,b:t}
    if not titan and z>1.90 and ax<.17:
        if z>=2.03: return {'Head':1}
        return blend('Neck','Head',(z-1.94)/.09)
    if z>1.985: return {'Head':1}
    if z>1.91 and ax<.17: return blend('Torso','Head',(z-1.91)/.075)
    threshold=.325 if titan else .282
    if ax>threshold and z>.87 and (z>1.3 or ax>(.43 if titan else .29)):
        elbow=1.404; wrist=1.105 if titan else 1.155
        if z>1.745: return blend('Torso','UpperArm_'+tag,(ax-threshold)/.105)
        if abs(z-elbow)<.105: return blend('Forearm_'+tag,'UpperArm_'+tag,(z-elbow+.105)/.21)
        if z>elbow: return {'UpperArm_'+tag:1}
        if abs(z-wrist)<.045: return blend('Hand_'+tag,'Forearm_'+tag,(z-wrist+.045)/.09)
        if z>wrist: return {'Forearm_'+tag:1}
        return {'Hand_'+tag:1}
    if z>1.12 or (z>.96 and ax<.08): return {'Torso':1}
    if z>.99: return blend('UpperLeg_'+tag,'Torso',(z-.99)/.13)
    if abs(z-.572)<.10: return blend('Shin_'+tag,'UpperLeg_'+tag,(z-.472)/.20)
    return {'UpperLeg_'+tag if z>.572 else 'Shin_'+tag:1}


def bind_and_batch(rig,titan):
    for obj in PARTS[:]:
        activate(obj); bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
        bm=bmesh.new(); bm.from_mesh(obj.data); bmesh.ops.recalc_face_normals(bm,faces=bm.faces); bm.to_mesh(obj.data); bm.free()
        region=obj.get('rig_region','AUTO')
        colors=obj.data.color_attributes.new(name='SurfacePigment',type='FLOAT_COLOR',domain='POINT')
        is_skin='skin' in obj.data.materials[0].name.lower() or 'facial' in obj.name.lower()
        for v in obj.data.vertices:
            x,y,z=v.co; grain=.975+.022*math.sin(x*97+z*119)*math.cos(y*133-z*73)
            pigment=Vector((grain,grain,grain))
            if is_skin:
                front=max(0,min(1,(-y-.055)*15))
                if z>1.99:
                    cheeks=math.exp(-((abs(x)-.075)/.028)**2-((z-2.096)/.035)**2)*front
                    sockets=math.exp(-((abs(x)-.044)/.023)**2-((z-2.153)/.017)**2)*front
                    lips=math.exp(-(x/.039)**4-((z-2.065)/.008)**2)*front
                    pigment-=Vector((.02,.16,.17))*cheeks+Vector((.22,.25,.25))*sockets+Vector((.1,.34,.29))*lips
                    if titan:
                        markings=math.exp(-((abs(x)-.051)/.013)**2-((z-2.112)/.039)**2)*front
                        pigment-=Vector((.19,.24,.21))*markings
                else:
                    folds=sum(math.exp(-((z-h)/.016)**2)*math.exp(-(x/.17)**4) for h in [1.32,1.43,1.54,1.66])*front
                    pigment-=Vector((.035,.065,.075))*folds
                    joint_tint=math.exp(-((z-.575)/.07)**2)+math.exp(-((z-1.4)/.06)**2)*max(0,abs(x)-.35)*5
                    pigment-=Vector((.025,.09,.1))*joint_tint
                    if titan:
                        midline=math.exp(-(x/.021)**2-((z-1.47)/.25)**2)*front
                        collar=math.exp(-((z-1.82+abs(x)*.20)/.024)**2)*front
                        pigment-=Vector((.10,.13,.14))*(midline+collar*.5)
            elif obj.data.materials[0].name in ['Weathered scout canvas','Ivory cavalry twill','Survey green wool']:
                # Broad dust/wear variation is attached to the mesh, so it stays
                # coherent across UV islands and survives the glTF export.
                wear=.5+.5*math.sin(x*21+z*19)*math.cos(y*29-z*8)
                cuffs=math.exp(-((z-1.20)/.055)**2) if 'sleeve' in obj.name.lower() else 0
                knees=math.exp(-((z-.60)/.085)**2) if 'twill' in obj.name.lower() else 0
                pigment*=1-.09*wear-.12*cuffs-.10*knees
            colors.data[v.index].color=(*[max(.3,c) for c in pigment],1)
        for b in rig.data.bones:
            if b.name not in obj.vertex_groups: obj.vertex_groups.new(name=b.name)
        for v in obj.data.vertices:
            if region=='SOURCE': continue
            weights={region:1} if region!='AUTO' else weights_at(v.co,titan)
            for name,weight in weights.items():
                if weight>.0001: obj.vertex_groups[name].add([v.index],weight,'REPLACE')
        torso_group=obj.vertex_groups.get('Torso')
        if torso_group:
            for v in obj.data.vertices:
                amount=next((g.weight for g in v.groups if g.group==torso_group.index),0)
                if amount==0: continue
                z=v.co.z
                upper=max(0,min(1,(z-1.44)/.28)); lower=max(0,min(1,(1.25-z)/.16))
                torso_group.add([v.index],amount*(1-upper)*(1-lower),'REPLACE')
                if upper: obj.vertex_groups['Chest'].add([v.index],amount*upper,'REPLACE')
                if lower: obj.vertex_groups['Pelvis'].add([v.index],amount*lower,'REPLACE')
        if not titan:
            def transfer(v,source,dest,factor):
                g=obj.vertex_groups.get(source)
                w=next((e.weight for e in v.groups if g and e.group==g.index),0)
                if w*factor<1e-6: return
                g.add([v.index],w*(1-factor),'REPLACE')
                existing=next((e.weight for e in v.groups if e.group==obj.vertex_groups[dest].index),0)
                obj.vertex_groups[dest].add([v.index],existing+w*factor,'REPLACE')
            for v in obj.data.vertices:
                x,y,z=v.co; tag='L' if x<0 else 'R'
                if region=='Head' and z<2.03 and 'hair' not in obj.name.lower(): transfer(v,'Head','Neck',max(0,min(1,(2.03-z)/.09)))
                if 'hair' in obj.name.lower() and z<2.28:
                    transfer(v,'Head','HairFront' if y<0 else 'HairBack',min(.85,max(0,(2.28-z)/.13)))
                if region=='Cape':
                    middle=max(0,min(1,(1.78-z)/.3)); tip=max(0,min(1,(1.32-z)/.28))
                    transfer(v,'Cape','CapeMid',middle); transfer(v,'CapeMid','CapeTip',tip)
                if 'jacket' in obj.name.lower() and z<1.54: transfer(v,'Torso','Jacket_'+tag,min(.7,max(0,(1.54-z)/.23)))
                if 'lapel' in obj.name.lower(): transfer(v,'Chest','Lapel_'+tag,min(.65,max(0,(1.86-z)/.17)))
                if obj.data.materials[0].name in ['Weathered scout canvas','Ivory cavalry twill']:
                    for j,a,b,h in [('ElbowCorrect','UpperArm','Forearm',1.404),('KneeCorrect','UpperLeg','Shin',.572)]:
                        w=.62*math.exp(-((z-h)/.065)**2)
                        transfer(v,a+'_'+tag,j+'_'+tag,w); transfer(v,b+'_'+tag,j+'_'+tag,w)
                if region=='Foot_'+tag: transfer(v,'Foot_'+tag,'Toe_'+tag,max(0,min(1,(-y-.13)/.07)))
                if 'continuous_skin' in obj.name and z<1.10 and abs(x)>.33:
                    transfer(v,'Hand_'+tag,'Fingers_'+tag,.65 if abs(x)>.35 else .1)
        if not obj.data.uv_layers:
            bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.smart_project(angle_limit=1.1519,island_margin=.01); bpy.ops.object.mode_set(mode='OBJECT')
    # One skinned object per material to keep web draw calls low.
    groups={}
    for obj in PARTS[:]:
        mat=obj.data.materials[0] if obj.data.materials else None
        groups.setdefault(mat,[]).append(obj)
    for mat,objects in groups.items():
        obj=join_objects(objects,CURRENT+'__'+mat.name.replace(' ','_')) if len(objects)>1 else objects[0]
        mod=obj.modifiers.new('Weighted character skeleton','ARMATURE'); mod.object=rig; mod.use_deform_preserve_volume=False
        obj.parent=rig
    return rig


def solve_leg_ik(rig,tag,target,pitch):
    upper=rig.pose.bones['UpperLeg_'+tag]; lower=rig.pose.bones['Shin_'+tag]; foot=rig.pose.bones['Foot_'+tag]
    bpy.context.view_layer.update()
    hip=upper.head.copy(); direction=target-hip; distance=direction.length
    l1=rig.data.bones[upper.name].length; l2=rig.data.bones[lower.name].length
    reach=min(l1+l2-.0005,max(abs(l1-l2)+.001,distance)); axis=direction.normalized()
    pole=Vector((0,-1,0)); pole=(pole-axis*pole.dot(axis)).normalized()
    along=(l1*l1-l2*l2+reach*reach)/(2*reach)
    knee=hip+axis*along+pole*math.sqrt(max(0,l1*l1-along*along))
    def point(b,child,dest):
        delta=(child.head-b.head).normalized().rotation_difference((dest-b.head).normalized())
        b.matrix=Matrix.LocRotScale(b.head,delta@b.matrix.to_quaternion(),Vector((1,1,1)))
        bpy.context.view_layer.update()
    point(upper,lower,knee); point(lower,foot,target)
    q=Quaternion((1,0,0),pitch)@rig.data.bones[foot.name].matrix_local.to_quaternion()
    foot.matrix=Matrix.LocRotScale(foot.head,q,Vector((1,1,1)))
    bpy.context.view_layer.update()
    return (foot.head-target).length


def create_walk(rig):
    motions=json.loads((SOURCE/'motion-samples.json').read_text())['human' if CURRENT=='eren' else 'titan']
    rig.animation_data_create(); max_error=0
    for name,clip in motions.items():
        action=bpy.data.actions.new(CURRENT+'_'+name); rig.animation_data.action=action
        for index,sample in enumerate(clip['frames']):
            frame=round(index/(len(clip['frames'])-1)*clip['duration']*60,6)
            for b in rig.pose.bones:
                b.rotation_mode='QUATERNION'; b.rotation_quaternion=(1,0,0,0); b.location=(0,0,0); b.scale=(1,1,1)
            for name_b,rotation in sample['bones'].items():
                b=rig.pose.bones.get(name_b)
                if b: b.rotation_quaternion=Euler(rotation,'XYZ').to_quaternion()
            for b in rig.pose.bones:
                if b.name.startswith('Finger') and not b.name.startswith('Fingers'):
                    b.rotation_quaternion=Euler((-sample.get('grip',0)*(1.25 if '_1_' in b.name else 1.55),0,0)).to_quaternion()
            root=rig.pose.bones['Root']; root.location=sample.get('root',(0,sample.get('height',0),0))
            bpy.context.view_layer.update()
            if clip.get('ik'):
                # Keep a soft knee and lower the pelvis when either target approaches full reach.
                drops=[]
                for tag,contact in sample['feet'].items():
                    target=Vector(contact['position']); target.y-=root.location.z
                    hip=rig.pose.bones['UpperLeg_'+tag].head
                    horizontal=(target.x-hip.x)**2+(target.y-hip.y)**2
                    safe_z=target.z+math.sqrt(max(.01,.977**2-horizontal))
                    drops.append(hip.z-safe_z)
                drop=max(0,*drops)
                if drop>0: root.location.y-=drop; bpy.context.view_layer.update()
                for tag,contact in sample['feet'].items():
                    target=Vector(contact['position']); target.y-=root.location.z
                    max_error=max(max_error,solve_leg_ik(rig,tag,target,contact['pitch']))
            if CURRENT=='eren':
                for tag in ['L','R']:
                    for helper,joint in [('ElbowCorrect','Forearm'),('KneeCorrect','Shin')]:
                        b=rig.pose.bones.get(helper+'_'+tag)
                        if b:
                            bend=rig.pose.bones[joint+'_'+tag].rotation_quaternion.to_euler().x
                            b.rotation_quaternion=Euler((bend*.5,0,0)).to_quaternion()
                            bulge=1+min(abs(bend),1.6)*.045; b.scale=(bulge,1,bulge)
            for b in rig.pose.bones:
                b.keyframe_insert('rotation_quaternion',frame=frame,group=b.name)
                if b.name=='Root': b.keyframe_insert('location',frame=frame,group=b.name)
                if 'Correct' in b.name: b.keyframe_insert('scale',frame=frame,group=b.name)
        track=rig.animation_data.nla_tracks.new(); track.name=CURRENT+'_'+name
        strip=track.strips.new(action.name,0,action); track.mute=True
    rig.animation_data.action=None
    for b in rig.pose.bones: b.rotation_quaternion=(1,0,0,0); b.location=(0,0,0); b.scale=(1,1,1)
    bpy.context.scene.render.fps=60; bpy.context.scene.frame_start=0; bpy.context.scene.frame_end=180; bpy.context.scene.frame_set(0)
    if CURRENT=='eren':
        rig['walk_stride_metres']=1.3; rig['walk_duration_seconds']=1.1
        rig['walk_ik_max_error_metres']=max_error
        print('WALK_IK_MAX_ERROR',max_error,flush=True)
        if max_error>.008: raise RuntimeError('Foot target is unreachable: '+str(max_error))
        (EXPORT/'eren.motion.json').write_text(json.dumps({'duration':1.1,'distance':1.3,'fps':60,'forward':'glTF +Z; gameplay -Z','inPlace':'eren_walk_in_place','rootMotion':'eren_walk_root_motion','stanceEnd':.62,'flatContact':[.12,.46],'sprint':{'clip':'eren_run','duration':.6,'distance':4.6,'flatContact':[.04,.15]},'maxBakedAnkleError':max_error},indent=2))


def optimize_for_web():
    # Allocate triangles before batching by material. Faces, eyes and strand
    # UVs must not be collapsed at the same rate as broad body surfaces.
    budget=54000 if CURRENT=='eren' else 56000 if CURRENT=='attack-titan' else 40000
    counts={obj:sum(len(p.vertices)-2 for p in obj.data.polygons) for obj in PARTS}
    protected={obj for obj,tris in counts.items() if tris<150 or any(key in obj.name for key in ['Anatomical facial','Anatomical eyeball','Jade iris','Pupil','fine hair card','Eyebrow'])}
    fixed=sum(counts[obj] for obj in protected)
    flexible=sum(tris for obj,tris in counts.items() if obj not in protected)
    factor=min(1,max(.12,(budget-fixed)/max(1,flexible)))
    for obj in PARTS:
        if obj in protected: continue
        activate(obj)
        mod=obj.modifiers.new('Web geometry budget','DECIMATE'); mod.ratio=factor
        mod.delimit={'UV','SEAM','MATERIAL'}
        bpy.ops.object.modifier_apply(modifier=mod.name)
        for polygon in obj.data.polygons: polygon.use_smooth=True


def setup_studio():
    scene=bpy.context.scene
    scene.render.engine='CYCLES'; scene.cycles.samples=32; scene.cycles.use_denoising=True
    scene.render.resolution_x=900; scene.render.resolution_y=1100; scene.render.resolution_percentage=100
    scene.world=bpy.data.worlds.new('Portrait studio'); scene.world.use_nodes=True; scene.world.node_tree.nodes.get('Background').inputs[0].default_value=(.06,.076,.083,1); scene.world.node_tree.nodes.get('Background').inputs[1].default_value=.35
    floor=material('Studio charcoal',(.025,.034,.034),roughness=.83)
    bpy.ops.mesh.primitive_plane_add(size=200); ground=bpy.context.object; ground.name='STUDIO_ground'; ground.data.materials.append(floor); ground.location.z=-.014
    def light(name,location,power,color,size):
        data=bpy.data.lights.new(name,'AREA'); data.energy=power; data.color=color; data.shape='DISK'; data.size=size
        obj=bpy.data.objects.new(name,data); scene.collection.objects.link(obj); obj.location=location; obj.rotation_euler=(Vector((0,0,1.2))-obj.location).to_track_quat('-Z','Y').to_euler()
    light('STUDIO_key',(-3,-4,5),450,(1,.82,.66),4)
    light('STUDIO_fill',(3,-2,3),170,(.61,.76,1),3)
    light('STUDIO_rim',(1,2.5,4),600,(.76,.9,1),2.5)
    data=bpy.data.cameras.new('STUDIO_camera'); camera=bpy.data.objects.new('STUDIO_camera',data); scene.collection.objects.link(camera)
    camera.location=(3.1,-6.5,2.9); target=Vector((0,0,1.23)); camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler(); data.type='ORTHO'; data.ortho_scale=2.88; data.lens=70; scene.camera=camera
    scene.view_settings.view_transform='AgX'
    return camera


def main():
    global CURRENT,PARTS,SKIN_PARTS
    manifest_path=EXPORT/'manifest.json'
    report=json.loads(manifest_path.read_text()).get('characters',{}) if manifest_path.exists() else {}
    requested=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else ['eren','attack-titan','pure-titan']
    for name in requested:
        CURRENT=name; PARTS=[]; SKIN_PARTS=[]
        bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
        for old_action in list(bpy.data.actions): bpy.data.actions.remove(old_action)
        titan=name!='eren'; attack=name=='attack-titan'
        skin=material('Eren skin' if not titan else 'Titan skin' if attack else 'Pure Titan skin',(.56,.385,.28) if not titan else (.49,.29,.19) if attack else (.54,.405,.305),'skin',roughness=.63 if not titan else .74)
        print('MODELING',name,flush=True)
        if titan: titan_anatomy(skin,attack)
        else: eren_uniform(skin); eren_fabric_details()
        optimize_for_web()
        rig=create_rig(titan); bind_and_batch(rig,titan); create_walk(rig)
        # Export the selected character only, including armature, weights, PBR maps, and a walk cycle.
        bpy.ops.object.select_all(action='DESELECT'); rig.select_set(True)
        for obj in PARTS: obj.select_set(True)
        bpy.context.view_layer.objects.active=rig
        path=EXPORT/(name+'.glb')
        bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=True,export_skins=True,export_yup=True,export_apply=False,export_animation_mode='ACTIONS')
        triangles=sum(sum(len(p.vertices)-2 for p in obj.data.polygons) for obj in PARTS)
        report[name]={'triangles':triangles,'meshes':len(PARTS),'bones':len(rig.data.bones),'bytes':path.stat().st_size,'source':name+'.blend','animations':[a.name for a in bpy.data.actions]}
        camera=setup_studio()
        # Save editable geometry, packed maps, bone weights, animation and studio lighting.
        activate(rig)
        if name=='eren':
            rig.animation_data.action=bpy.data.actions['eren_walk_in_place']; bpy.context.scene.frame_end=66; bpy.context.scene.frame_set(0)
        bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/(name+'.blend')))
        bpy.context.scene.render.filepath=str(RENDERS/(name+'.png')); bpy.ops.render.render(write_still=True)
        camera.location=(.75,-3.5,2.23); camera.rotation_euler=(Vector((0,-.015,2.13))-camera.location).to_track_quat('-Z','Y').to_euler(); camera.data.ortho_scale=.77
        bpy.context.scene.render.resolution_x=850; bpy.context.scene.render.resolution_y=850
        bpy.context.scene.render.filepath=str(RENDERS/(name+'-portrait.png')); bpy.ops.render.render(write_still=True)
        print('FINISHED',name,json.dumps(report[name]),flush=True)
    (EXPORT/'manifest.json').write_text(json.dumps({'generator':'Blender '+bpy.app.version_string,'characters':report},indent=2))
    print('CHARACTER_BUILD_COMPLETE',flush=True)

if __name__=='__main__': main()
