#!/usr/bin/env python3
# ============ Pipeline de personajes 3D para "Ajedrez 2.0" ============
# Los personajes que provee el usuario (carpeta characters/, uno por .zip)
# son mallas generadas por IA (Tripo3D) SIN esqueleto ni animación —
# confirmado inspeccionando el binario FBX a mano (cero apariciones de
# "Deformer"/"Skin"/"Cluster"/"AnimationStack") — y sin decimar/comprimir
# son gigantescas: 250-400 mil triángulos, 18-66MB por personaje entre
# malla y texturas. Ese tamaño es inviable tal cual para una página web.
#
# Además, GameHub corre siempre desde file:// (doble clic a index.html, sin
# servidor) — y ahí GLTFLoader/FBXLoader de Three.js no pueden cargar nada
# de la forma normal (.load()) porque usan fetch()/XMLHttpRequest por
# dentro, y Chrome bloquea ambos contra archivos locales sin el flag
# --allow-file-access-from-files (que un usuario normal jamás va a pasar).
# Confirmado en vivo: tanto fetch() como XHR fallan ("Failed to fetch")
# incluso pidiendo un archivo de la misma carpeta.
#
# Este script resuelve las dos cosas de una: decima la malla (preservando
# UV, por eso no se usa el wrapper simplify_quadric_decimation() de trimesh
# — ese pierde el mapeo de textura; acá se usa fast_simplification
# directo + replay_simplification() para poder remapear los UV originales
# a los vértices nuevos), achica y recomprime la textura, arma un GLB
# final chico, y lo embebe en Base64 dentro de un <script> plano de JS
# (window.PERSONAJES_DATA.<id> = "<base64>") — así en el navegador se
# decodifica en memoria y se le pasa a GLTFLoader.parse() (que NO hace
# ninguna carga de red, sólo procesa bytes que ya están ahí), esquivando
# el bloqueo de file:// por completo. Confirmado funcionando de punta a
# punta: decodificar + parsear un personaje de ~2MB tarda ~40ms.
#
# Uso:
#   python scripts/procesar_personaje.py <entrada.glb|entrada.fbx> <id_js> [--faces 12000] [--tex 1024]
#
# `id_js` es la clave con la que va a quedar en window.PERSONAJES_DATA
# (ej. "medievalKnight") y también el nombre del archivo de salida en
# js/personajes/<id_js>.js — agregar ese archivo como <script> nuevo en
# index.html es lo único manual que queda por hacer por personaje.

import sys, os, base64, argparse
import numpy as np
import trimesh
import fast_simplification as fs
from PIL import Image


def procesar(ruta_entrada, id_js, target_faces=12000, tex_size=1024, salida_dir=None):
    print(f"Cargando {ruta_entrada}…")
    escena = trimesh.load(ruta_entrada, force="scene")
    nombre_geo = list(escena.geometry.keys())[0]
    malla = escena.geometry[nombre_geo]
    print(f"  original: {len(malla.vertices)} vértices, {len(malla.faces)} caras")

    visual = malla.visual
    tiene_textura = hasattr(visual, "uv") and visual.uv is not None and hasattr(visual, "material")
    if not tiene_textura:
        raise SystemExit(f"'{ruta_entrada}' no tiene UV/textura — revisar a mano, el pipeline asume un material con baseColorTexture.")

    uv = np.asarray(visual.uv)
    material = visual.material
    imagen = getattr(material, "baseColorTexture", None) or getattr(material, "image", None)
    if imagen is None:
        raise SystemExit(f"'{ruta_entrada}' no tiene baseColorTexture — revisar a mano.")

    puntos = malla.vertices.astype(np.float64)
    caras = malla.faces.astype(np.int32)

    print(f"  decimando a {target_faces} caras (preservando UV)…")
    _, _, colapsos = fs.simplify(puntos, caras, target_count=target_faces, return_collapses=True)
    nuevos_puntos, nuevas_caras, mapa_indices = fs.replay_simplification(puntos, caras, colapsos)
    print(f"  decimado: {len(nuevos_puntos)} vértices, {len(nuevas_caras)} caras")

    nuevo_uv = np.zeros((len(nuevos_puntos), 2), dtype=np.float64)
    for i_orig, i_nuevo in enumerate(mapa_indices):
        nuevo_uv[i_nuevo] = uv[i_orig]

    img = imagen.convert("RGB")
    img.thumbnail((tex_size, tex_size), Image.LANCZOS)
    print(f"  textura reducida a {img.size}")

    nuevo_material = trimesh.visual.material.PBRMaterial(
        baseColorTexture=img,
        metallicFactor=float(getattr(material, "metallicFactor", 0.0) or 0.0),
        roughnessFactor=float(getattr(material, "roughnessFactor", 1.0) or 1.0),
    )
    nueva_malla = trimesh.Trimesh(
        vertices=nuevos_puntos, faces=nuevas_caras, process=False,
        visual=trimesh.visual.TextureVisuals(uv=nuevo_uv, material=nuevo_material),
    )

    glb_bytes = nueva_malla.export(file_type="glb")
    print(f"  GLB final: {len(glb_bytes) / 1024 / 1024:.2f} MB")

    b64 = base64.b64encode(glb_bytes).decode("ascii")
    salida_dir = salida_dir or os.path.join(os.path.dirname(__file__), "..", "js", "personajes")
    os.makedirs(salida_dir, exist_ok=True)
    ruta_salida = os.path.join(salida_dir, f"{id_js}.js")
    with open(ruta_salida, "w", encoding="utf-8") as f:
        f.write("// Generado por scripts/procesar_personaje.py — no editar a mano.\n")
        f.write("window.PERSONAJES_DATA = window.PERSONAJES_DATA || {};\n")
        f.write(f'window.PERSONAJES_DATA.{id_js} = "{b64}";\n')
    print(f"  escrito: {ruta_salida} ({os.path.getsize(ruta_salida) / 1024 / 1024:.2f} MB)")
    return ruta_salida


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("entrada")
    ap.add_argument("id_js")
    ap.add_argument("--faces", type=int, default=12000)
    ap.add_argument("--tex", type=int, default=1024)
    args = ap.parse_args()
    procesar(args.entrada, args.id_js, args.faces, args.tex)
