"""Build the original voxel transformer landmark. Run with Blender --background --python this_file."""
import bpy, math, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def material(name, rgb, glow=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*rgb, 1)
    mat.use_nodes = True
    node = mat.node_tree.nodes.get('Principled BSDF')
    node.inputs['Base Color'].default_value = (*rgb, 1)
    node.inputs['Roughness'].default_value = .8
    if glow:
        node.inputs['Emission Color'].default_value = (*rgb, 1)
        node.inputs['Emission Strength'].default_value = glow
    return mat

stone = material('Deep slate', (.09, .17, .20))
edge = material('Weathered copper', (.31, .53, .51))
light = material('Attention cyan', (.10, .75, .85), 1.5)
gold = material('Signal gold', (.95, .56, .19), .3)
dark = material('Recessed panels', (.025, .07, .10))

def box(name, loc, scale, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    return obj

box('Foundation', (0, 0, .15), (12, 10, .3), stone)
box('Copper plinth', (0, 0, .4), (11.2, 9.2, .2), edge)
for x in [-4.3, 4.3]:
    for y in [-3.3, 3.3]:
        box('Pillar base', (x,y,.9), (1.9,1.9,.8), edge)
        box('Slated column', (x,y,4.7), (1.3,1.3,7.2), stone)
        for z in range(2,9):
            box('Voxel trim', (x,y,z), (1.55,1.55,.18), edge)
            box('Signal window', (x,y-.67,z+.37), (.72,.08,.4), light)
        box('Capital', (x,y,8.8), (2,2,.65), gold)
for y in [-3.3, 3.3]:
    box('Top arch', (0,y,9.3), (10.7,1.5,.6), stone)
    box('Arch light', (0,y-.77,9.3), (7.4,.05,.12), light)
    for x in range(-4,5):
        box('Crenellation', (x,y,9.9), (.62,1.5,.65), edge)
for x in [-4.3,4.3]:
    box('Crossbeam', (x,0,9.3), (1.5,8,.6), stone)
# Recessed memory machinery leaves the middle open to fly through.
for x in [-3.2,3.2]:
    for y in [-2,0,2]:
        box('Memory rack', (x,y,2.3), (.75,1.4,3.5), dark)
        for z in range(1,4):
            box('Memory drawer', (x,y-.72,z), (.7,.1,.65), edge)
            for offset in [-.2,0,.2]:
                box('Memory bit', (x+offset,y-.79,z), (.1,.03,.12), gold)
# Pixel circuit floor, visible through the frame.
for x in range(-3,4):
    box('Circuit track', (x,0,.57), (.045,6,.035), light)
for y in range(-3,4):
    box('Circuit track', (0,y,.58), (6,.045,.035), edge)
box('Core pedestal', (0,0,.9), (2.2,2.2,.6), stone)
box('Core rim', (0,0,1.25), (2.5,2.5,.12), gold)

# Join by material: a handful of draw calls, despite hundreds of authored blocks.
for mat in [stone,edge,light,gold,dark]:
    bpy.ops.object.select_all(action='DESELECT')
    objects=[obj for obj in bpy.context.scene.objects if obj.type=='MESH' and obj.data.materials[0]==mat]
    for obj in objects: obj.select_set(True)
    if objects:
        bpy.context.view_layer.objects.active=objects[0]
        bpy.ops.object.join()
        bpy.context.object.name=mat.name
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/blender/transformer-core.blend'))
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/transformer-core.glb'), export_format='GLB', export_yup=True)
