# Pipeline de datos (Fase 1 del plan "TEG con los 256 países reales del
# SVG"): lee assets/world.svg (un <path> por país, provisto por el
# usuario) y genera js/worldpaises.js con, por país: nombre, el path `d`
# (para seguir dibujándolo), un centroide aproximado en el espacio de
# coordenadas del propio SVG (para posicionar la ficha), el continente
# (tabla ISO2 -> continente escrita a mano) y sus vecinos (heurística de
# cercanía de bounding boxes, ver comentario más abajo). No hay ningún
# dataset real de fronteras/adyacencia cargado en este proyecto ni en el
# SVG — es una aproximación, documentada como tal en el plan.
import re
import json

with open("assets/world.svg", encoding="utf-8") as f:
    svg = f.read()

w = float(re.search(r'width="([\d.]+)"', svg).group(1))
h = float(re.search(r'height="([\d.]+)"', svg).group(1))

entradas = re.findall(
    r'<path\s+d="([^"]+)"(?:\s+title="([^"]*)")?\s+id="([^"]+)"', svg
)
print("paths encontrados:", len(entradas))

NUM_RE = re.compile(r'-?\d+\.?\d*(?:e-?\d+)?', re.IGNORECASE)

def puntos_de_path(d):
    # Los paths de este SVG sólo usan m/l(implícito)/z, todo en minúscula
    # (relativo) salvo el primer punto de cada subpath. Para el centroide
    # no hace falta ser exactos con los resets de "z": simplemente se
    # acumula todo en secuencia como una cadena de deltas relativos y se
    # devuelven los puntos absolutos visitados — alcanza para ubicar una
    # ficha dentro del país, no para redibujar el contorno con precisión
    # (eso lo sigue haciendo el propio `d` original, sin tocar).
    nums = [float(n) for n in NUM_RE.findall(d)]
    pts = []
    x = y = 0.0
    for i in range(0, len(nums) - 1, 2):
        x += nums[i]
        y += nums[i + 1]
        pts.append((x, y))
    return pts

paises = {}
for d, title, pid in entradas:
    pts = puntos_de_path(d)
    if not pts:
        continue
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    cx = sum(xs) / len(xs)
    cy = sum(ys) / len(ys)
    paises[pid] = {
        "nombre": title or pid,
        "d": d,
        "x": round(cx, 2), "y": round(cy, 2),
        "bbox": (min(xs), min(ys), max(xs), max(ys)),
    }

print("paises con geometria:", len(paises))

# ---- continente por código ISO2 (tabla a mano) ----
AMERICA_NORTE = set("US CA MX GL BM".split())
AMERICA_CENTRAL = set("GT BZ HN SV NI CR PA CU JM HT DO BS BB TT GD LC VC AG DM KN".split())
AMERICA_SUR = set("CO VE GY SR GF EC PE BR BO PY CL AR UY".split())
EUROPA = set("IS IE GB PT ES FR AD MC BE NL LU DE CH AT LI IT SM VA MT SI HR BA ME RS MK AL GR BG RO MD UA BY PL CZ SK HU LT LV EE FI SE NO DK XK".split())
# Rusia y el Cáucaso/Asia Central entran en Asia+Oceanía a propósito, para
# no partir el continente europeo en dos mitades desconectadas del resto.
AFRICA = set("MA DZ TN LY EG SD SS ER DJ SO ET KE UG TZ RW BI CD CG GA GQ CM CF TD NE NG BJ TG GH CI LR SL GN GW SN GM ML BF MR EH AO ZM MW MZ ZW BW NA ZA SZ LS MG KM MU SC ST CV".split())
ASIA_OCEANIA = set("RU GE AM AZ TR KZ UZ TM TJ KG AF PK IN NP BT BD LK MM TH LA KH VN CN MN KP KR JP TW PH MY SG ID TL BN PS LB SY IQ IR IL JO SA YE OM AE QA BH KW CY AU NZ PG FJ SB VU NC PF WS TO FM PW KI TV NR MH".split())

CONTINENTE_DE = {}
for cs, nombre in [
    (AMERICA_NORTE, "america_norte"), (AMERICA_CENTRAL, "america_central"),
    (AMERICA_SUR, "america_sur"), (EUROPA, "europa"),
    (AFRICA, "africa"), (ASIA_OCEANIA, "asia_oceania"),
]:
    for c in cs:
        CONTINENTE_DE[c] = nombre

sin_continente = [pid for pid in paises if pid not in CONTINENTE_DE]
print("sin continente asignado (van a asia_oceania por defecto):", sin_continente)
for pid in sin_continente:
    CONTINENTE_DE[pid] = "asia_oceania"

for pid, info in paises.items():
    info["continente"] = CONTINENTE_DE[pid]

# ---- adyacencia: bboxes inflados que se solapan ----
MARGEN = 14.0  # unidades del SVG (~1010x666 de ancho total) - cruza mares chicos tipo Gibraltar/Bering
ids = list(paises.keys())
vecinos = {pid: set() for pid in ids}
for i in range(len(ids)):
    a = paises[ids[i]]["bbox"]
    for j in range(i + 1, len(ids)):
        b = paises[ids[j]]["bbox"]
        if (a[0] - MARGEN <= b[2] and b[0] - MARGEN <= a[2] and
                a[1] - MARGEN <= b[3] and b[1] - MARGEN <= a[3]):
            vecinos[ids[i]].add(ids[j])
            vecinos[ids[j]].add(ids[i])

aislados = [pid for pid in ids if not vecinos[pid]]
print("paises sin vecinos tras el bbox-check:", len(aislados), aislados[:20])

def distancia(pid1, pid2):
    x1, y1 = paises[pid1]["x"], paises[pid1]["y"]
    x2, y2 = paises[pid2]["x"], paises[pid2]["y"]
    return ((x1 - x2) ** 2 + (y1 - y2) ** 2) ** 0.5

for pid in aislados:
    mejor = min((o for o in ids if o != pid), key=lambda o: distancia(pid, o))
    vecinos[pid].add(mejor)
    vecinos[mejor].add(pid)

# BFS de conectividad global (islas del grafo completo, no sólo nodos sueltos)
visto = set()
pila = [ids[0]]
visto.add(ids[0])
while pila:
    cur = pila.pop()
    for v in vecinos[cur]:
        if v not in visto:
            visto.add(v)
            pila.append(v)
componentes_sueltos = [pid for pid in ids if pid not in visto]
print("paises en componentes desconectados del resto (tras forzar vecino mas cercano):", len(componentes_sueltos))
# forzar conexión también para componentes enteros sueltos (no sólo nodos aislados)
while componentes_sueltos:
    pid = componentes_sueltos[0]
    mejor = min((o for o in visto), key=lambda o: distancia(pid, o))
    vecinos[pid].add(mejor)
    vecinos[mejor].add(pid)
    visto.add(pid)
    nuevos = [v for v in vecinos[pid] if v not in visto]
    pila = nuevos
    while pila:
        cur = pila.pop()
        visto.add(cur)
        for v in vecinos[cur]:
            if v not in visto:
                pila.append(v)
    componentes_sueltos = [pid for pid in ids if pid not in visto]
print("conectado por completo:", len(visto) == len(ids))

por_continente = {}
for pid, info in paises.items():
    por_continente[info["continente"]] = por_continente.get(info["continente"], 0) + 1
print("paises por continente:", por_continente)

total_aristas = sum(len(v) for v in vecinos.values()) // 2
print("total aristas de adyacencia:", total_aristas)

# ---- emitir js/worldpaises.js ----
def js_str(s):
    return json.dumps(s, ensure_ascii=False)

out = []
out.append("// ============ Países del mapa mundi real (assets/world.svg) ============\n")
out.append("// Generado por scripts/generar_paises.py — no editar a mano. Cada entrada:\n")
out.append("// { nombre, d (el path SVG original), x/y (centroide aproximado en el\n")
out.append("// espacio de coordenadas del propio SVG), continente, vecinos (heurística\n")
out.append("// de cercanía de bounding boxes — no hay un dataset real de fronteras acá\n")
out.append("// ni en el SVG, ver comentario del script para el criterio exacto).\n")
out.append(f"const PAISES_SVG_TAM = {{ w: {w}, h: {h} }};\n")
out.append("const PAISES_SVG = {\n")
for pid in ids:
    info = paises[pid]
    vs = sorted(vecinos[pid])
    out.append(
        f'  {js_str(pid)}: {{ nombre: {js_str(info["nombre"])}, '
        f'd: {js_str(info["d"])}, x: {info["x"]}, y: {info["y"]}, '
        f'continente: {js_str(info["continente"])}, '
        f'vecinos: {json.dumps(vs)} }},\n'
    )
out.append("};\n")

with open("js/worldpaises.js", "w", encoding="utf-8") as f:
    f.write("".join(out))

import os
print("tamano js/worldpaises.js:", round(os.path.getsize("js/worldpaises.js") / 1024 / 1024, 2), "MB")
