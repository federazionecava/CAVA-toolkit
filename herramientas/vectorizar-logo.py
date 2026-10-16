"""Vectoriza logooficial.png en capas de color planas (potrace) y escribe js/logo-vectores.js.

Uso (necesita: pip install numpy pillow scipy potracer):
    python herramientas/vectorizar-logo.py logooficial.png js/logo-vectores.js control.svg

control.svg es un SVG suelto del logo completo, solo para comparar a ojo con el PNG original.
"""
import json
import sys

import numpy as np
import potrace
from PIL import Image
from scipy import ndimage

src, out_js, preview = sys.argv[1], sys.argv[2], sys.argv[3]

im = np.asarray(Image.open(src).convert("RGB")).astype(np.float32)
W = np.array([254, 254, 253], np.float32)
PALETA = {
    "verde": np.array([25, 109, 74], np.float32),
    "azul": np.array([9, 163, 224], np.float32),
    "rojo": np.array([234, 42, 48], np.float32),
    "naranja": np.array([213, 111, 60], np.float32),
}

# Para cada píxel: qué color de la paleta explica mejor la mezcla blanco->color, y cuánto (t).
mejor_err = np.full(im.shape[:2], np.inf, np.float32)
mejor_idx = np.full(im.shape[:2], -1, np.int8)
mejor_t = np.zeros(im.shape[:2], np.float32)
d = W - im
for i, c in enumerate(PALETA.values()):
    v = W - c
    t = np.clip((d @ v) / (v @ v), 0, 1)
    err = np.linalg.norm(d - t[..., None] * v, axis=2)
    m = err < mejor_err
    mejor_err[m], mejor_idx[m], mejor_t[m] = err[m], i, t[m]

capas = {}
for i, nombre in enumerate(PALETA):
    cov = np.where(mejor_idx == i, mejor_t, 0)
    cov = ndimage.gaussian_filter(cov, 1.0)
    mask = cov > 0.5
    # fuera manchitas sueltas
    lab, n = ndimage.label(mask)
    if n:
        sizes = ndimage.sum(mask, lab, range(1, n + 1))
        mask = np.isin(lab, np.nonzero(sizes >= 60)[0] + 1)
    capas[nombre] = mask
    print(nombre, int(mask.sum()))

# El borde rojo/blanco de la franja roja a veces cae como "naranja": fuera esas islas
cerca_rojo = ndimage.binary_dilation(capas["rojo"], iterations=8)
lab, n = ndimage.label(capas["naranja"])
malas = np.unique(lab[cerca_rojo & capas["naranja"]])
capas["naranja"] &= ~np.isin(lab, malas[malas > 0])

# Separar el verde: letras CAVA (arriba) vs. leyenda de texto (abajo)
filas_verde = np.nonzero(capas["verde"].any(axis=1))[0]
huecos = [y for y in range(filas_verde.min(), filas_verde.max()) if not capas["verde"][y].any()]
corte = huecos[0]
print("corte verde en y=", corte)
letras = capas["verde"].copy(); letras[corte:] = False
texto = capas["verde"].copy(); texto[:corte] = False


def trazar(mask):
    bm = potrace.Bitmap(~mask)  # potracer toma como "tinta" lo que NO es True
    plist = bm.trace(turdsize=20, alphamax=1.0, opticurve=True, opttolerance=0.2)
    partes = []
    for curva in plist:
        x0, y0 = curva.start_point.x, curva.start_point.y
        s = [f"M{x0:.1f} {y0:.1f}"]
        for seg in curva.segments:
            if seg.is_corner:
                s.append(f"L{seg.c.x:.1f} {seg.c.y:.1f}L{seg.end_point.x:.1f} {seg.end_point.y:.1f}")
            else:
                s.append(f"C{seg.c1.x:.1f} {seg.c1.y:.1f} {seg.c2.x:.1f} {seg.c2.y:.1f} {seg.end_point.x:.1f} {seg.end_point.y:.1f}")
        partes.append("".join(s) + "Z")
    return "".join(partes)


def bbox(*masks):
    m = np.logical_or.reduce(masks)
    ys, xs = np.nonzero(m)
    return [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]


datos = {
    "leon": trazar(capas["naranja"]),
    "letras": trazar(letras),
    "azul": trazar(capas["azul"]),
    "rojo": trazar(capas["rojo"]),
    "texto": trazar(texto),
    "cajaCompleto": bbox(capas["naranja"], capas["verde"], capas["azul"], capas["rojo"]),
    "cajaIsotipo": bbox(capas["naranja"], letras, capas["azul"], capas["rojo"]),
}

with open(out_js, "w", encoding="utf-8") as f:
    f.write("// Logo oficial CAVA vectorizado (generado a partir de logooficial.png, ver README).\n")
    f.write("// Coordenadas en píxeles de la imagen original (2058x2048); cada caja es [x0, y0, x1, y1].\n")
    f.write("const LOGO_CAVA_VECTORES = " + json.dumps(datos, ensure_ascii=False) + ";\n")

# SVG de control para comparar con el original
x0, y0, x1, y1 = datos["cajaCompleto"]
svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0} {y0} {x1-x0} {y1-y0}" fill-rule="evenodd">'
       f'<path fill="#D56F3C" d="{datos["leon"]}"/><path fill="#196D4A" d="{datos["letras"]}"/>'
       f'<path fill="#09A3E0" d="{datos["azul"]}"/><path fill="#EA2A30" d="{datos["rojo"]}"/>'
       f'<path fill="#196D4A" d="{datos["texto"]}"/></svg>')
with open(preview, "w", encoding="utf-8") as f:
    f.write(svg)
print("bytes js:", len(json.dumps(datos)))
