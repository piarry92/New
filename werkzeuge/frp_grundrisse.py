"""Flucht- und Rettungspläne (PDF, ein Plan je Seite) in saubere Grundrisse für Casa CAFM umwandeln.

Aufruf:  python3 werkzeuge/frp_grundrisse.py <plaene.pdf> <zielordner>
Braucht: pip install pymupdf numpy pillow

Je Seite entsteht ein PNG ohne Fluchtwege, Zeichen, Standort und Beschriftung, dazu plaene.json.
Gebäude und Etage kommen aus der Plannummer (z. B. 2OG/1a = Finger 1, 2. OG, Teil a).
Den Zielordner als ZIP packen und im Programm unter Standorte & Pläne › „Mehrere importieren (ZIP)“ einspielen.
"""
import sys, re, json

import io, pymupdf, numpy as np
from PIL import Image

def neutral(c):
    return c is None or (max(c) - min(c) < 0.08)

def grundriss(seite, zoom=2.6):
    drehung = seite.rotation
    if drehung:
        seite.set_rotation(0)
    z = seite.get_drawings()
    A = seite.rect.width * seite.rect.height
    rahmen = [pymupdf.Rect(g["rect"]) for g in z
              if g.get("fill") and min(g["fill"]) > 0.97 and g["rect"].width * g["rect"].height < A * 0.8]
    if not rahmen:
        return None
    bereich = max(rahmen, key=lambda r: r.width * r.height) + (3.5, 3.5, -3.5, -3.5)
    # Zeichen und Markierungen: kleine farbige Flächen samt Inhalt weiß abdecken
    kisten = [pymupdf.Rect(g["rect"]) + (-1.2, -1.2, 1.2, 1.2) for g in z
              if g["rect"].intersects(bereich) and not (neutral(g.get("color")) and neutral(g.get("fill")))
              and g["rect"].width < 45 and g["rect"].height < 45]
    texte = [pymupdf.Rect(b[:4]) + (-1, -1, 1, 1) for b in seite.get_text("blocks") if pymupdf.Rect(b[:4]).intersects(bereich)]
    pm = seite.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), clip=bereich, alpha=False)
    a = np.asarray(Image.open(io.BytesIO(pm.tobytes("png"))).convert("RGB")).astype(np.int16)
    chroma = a.max(axis=2) - a.min(axis=2)
    a[chroma > 22] = 255
    def weiss(r):
        x0, y0 = int((r.x0 - bereich.x0) * zoom), int((r.y0 - bereich.y0) * zoom)
        x1, y1 = int((r.x1 - bereich.x0) * zoom) + 1, int((r.y1 - bereich.y0) * zoom) + 1
        a[max(y0, 0):max(y1, 0), max(x0, 0):max(x1, 0)] = 255
    for r in kisten + texte:
        weiss(r)
    # leichte Graustufen aus Kantenglättung farbiger Flächen entfernen, Linien kräftigen
    grau = a.mean(axis=2)
    a[grau > 225] = 255
    bild = Image.fromarray(a.astype(np.uint8))
    # auf den Inhalt zuschneiden
    maske = np.asarray(bild.convert("L")) < 200
    ys, xs = np.where(maske)
    if len(xs) == 0:
        return None
    rand = 30
    bild = bild.crop((max(xs.min() - rand, 0), max(ys.min() - rand, 0), min(xs.max() + rand, bild.width), min(ys.max() + rand, bild.height)))
    if drehung:
        bild = bild.rotate(-drehung, expand=True)
    return bild


def main():
    import os
    d = pymupdf.open(sys.argv[1]); ziel = sys.argv[2]
    os.makedirs(ziel, exist_ok=True)
    meta, probleme = [], []
    def etage(c):
        if c == "EG": return "EG"
        m = re.match(r"(\d)(UG|OG)", c); return f"{m.group(1)}. {m.group(2)}"
    for i, s in enumerate(d, 1):
        t = s.get_text()
        m = re.search(r"\b(\dUG|EG|\dOG)\s*/\s*(\d)([a-c]?)\b", t)
        if not m:
            probleme.append((i, "keine Plannummer")); continue
        e, f, teil = etage(m.group(1)), m.group(2), m.group(3)
        pm = grundriss(s)
        if pm is None:
            probleme.append((i, "leer")); continue
        titel = f"Finger {f} {e}" + (f" Teil {teil}" if teil else "")
        datei = f"Finger{f}_{m.group(1)}{('_' + teil) if teil else ''}.png"
        pm.save(f"{ziel}/{datei}", optimize=True)
        meta.append({"datei": datei, "gebaeude": f"Finger {f}", "etage": e, "titel": titel, "seite": i, "plannr": m.group(0).replace(" ", ""),
                     "notiz": f"Grundriss aus Flucht- und Rettungsplan Bürogebäude Nord 1, Plan-Nr. {m.group(0).replace(' ', '')}, Stand 26.08.2022 (Seite {i})."})
    json.dump(meta, open(f"{ziel}/plaene.json", "w"), ensure_ascii=False, indent=1)
    print(len(meta), "Grundrisse;", probleme)
    from collections import Counter
    print(sorted(Counter(m["plannr"] for m in meta).items(), key=lambda x: x[1])[-3:])


if __name__ == "__main__":
    main()
