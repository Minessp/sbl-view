"""
Exporta as malhas cruas do Z-Anatomy (Blender headless) para o pipeline anatômico do SBL View.

    blender -b --disable-autoexec --factory-startup <Startup.blend> --python tools/anatomy/export.py -- <saída>

<Startup.blend> sai de Z-Anatomy.zip (https://github.com/Z-Anatomy/Models-of-human-anatomy, CC BY-SA 4.0).
`--disable-autoexec` é obrigatório: o .blend traz scripts próprios, que não devem rodar.

Grava em <saída>:
  raw.json  lista de objetos (nome, coleção, contagens, deslocamentos em raw.bin)
  raw.bin   por objeto: posições Float32×3 (coordenadas do Blender, metros, mundo) e índices Uint32×3

Só exporta o lado direito (sufixo .r) e a linha média (sem sufixo). O esquerdo é espelhado no navegador.
Coleções: ossos, músculos, regiões da pele e, das articulações, só discos e ligamentos de interesse.
Nada de sistema nervoso, órgãos dos sentidos ou vísceras: é ali que estão as peças com licença
não comercial (ouvido interno, rim). A seleção fina (o que entra no pacote) fica em src/data/anatomy.json.

Modificadores: HOOK, MIRROR e SUBSURF (no máximo nível 1) são aplicados; SOLIDIFY, WIREFRAME, SKIN e
BOOLEAN são desligados (a pele vira superfície simples, sem espessura).
"""

import json
import os
import struct
import sys

import bpy

COLLECTIONS = {
    "1: Skeletal system": "bone",
    "4: Muscular system": "muscle",
    "9: Regions of human body": "skin",
    "3: Joints": "joint",
}
JOINT_KEEP = ("Intervertebral disc", "Patellar ligament", "Pubic symphysis", "Interpubic disc")
DROP_MODIFIERS = {"SOLIDIFY", "WIREFRAME", "SKIN", "BOOLEAN"}


def wanted(obj, kind):
    if obj.type != "MESH" or len(obj.data.vertices) < 3:
        return False
    name = obj.name
    # .l = esquerdo; .j/.g/.i = rótulos e grupos do atlas do Z-Anatomy.
    if len(name) > 2 and name[-2] == "." and name[-1] != "r":
        return False
    if kind == "joint" and not name.startswith(JOINT_KEEP):
        return False
    return True


def main():
    out = sys.argv[sys.argv.index("--") + 1]
    os.makedirs(out, exist_ok=True)

    picked = []
    for cname, kind in COLLECTIONS.items():
        coll = bpy.data.collections[cname]
        coll.hide_viewport = False
        for obj in coll.objects:
            if wanted(obj, kind):
                picked.append((obj, cname, kind))

    for obj, _, _ in picked:
        obj.hide_viewport = False
        obj.hide_set(False)
        for m in obj.modifiers:
            if m.type in DROP_MODIFIERS:
                m.show_viewport = False
            elif m.type == "SUBSURF":
                m.levels = min(m.levels, 1)
    for lc in bpy.context.view_layer.layer_collection.children:
        lc.exclude = False
        lc.hide_viewport = False
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()

    objects = []
    with open(os.path.join(out, "raw.bin"), "wb") as f:
        offset = 0
        for obj, cname, kind in picked:
            ev = obj.evaluated_get(deps)
            me = ev.to_mesh()
            me.calc_loop_triangles()
            mw = obj.matrix_world
            pos = []
            for v in me.vertices:
                p = mw @ v.co
                pos.extend((p.x, p.y, p.z))
            idx = []
            for t in me.loop_triangles:
                idx.extend(t.vertices)
            ev.to_mesh_clear()
            if not idx:
                continue
            nv, nt = len(pos) // 3, len(idx) // 3
            f.write(struct.pack(f"<{len(pos)}f", *pos))
            f.write(struct.pack(f"<{len(idx)}I", *idx))
            objects.append({"name": obj.name, "collection": cname, "kind": kind, "vertexCount": nv,
                            "triangleCount": nt, "offset": offset})
            offset += nv * 12 + nt * 12

    meta = {"blend": os.path.basename(bpy.data.filepath), "blender": bpy.app.version_string, "objects": objects}
    with open(os.path.join(out, "raw.json"), "w", encoding="utf8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=0)
    print(f"export: {len(objects)} objetos em {out}")


main()
