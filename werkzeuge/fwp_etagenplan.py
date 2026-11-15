"""Aus einem Feuerwehrplan (PDF, je Etage ein Geschossplan auf einem Blatt) saubere Etagenpläne machen.

Aufruf:  python3 werkzeuge/fwp_etagenplan.py <feuerwehrplan.pdf> <zielordner> [Etage ...] [--ohne-schrift]
         Etage z. B. 2UG, 1UG, EG, 1OG. Ohne Angabe: alle Etagen.
Braucht: pip install pymupdf      (für die Gegenprobe zusätzlich: numpy)

Hintergrund: Ein Feuerwehrplan nach DIN 14095 zeigt jede Etage ganz auf einem Blatt, mit Türen und Raumnamen, dazu
viele Schilder, Hinweislinien und ein Raster. Das Blatt ist in fester Reihenfolge gezeichnet: erst eine weiße Fläche
hinter dem Gebäude, dann das Gebäude selbst (Treppen, Wände, Stützen, Türen), danach alles Übrige. Das Werkzeug

  1. nimmt je Geschossplan nur diesen Gebäudeteil (ab der weißen Fläche bis zur ersten roten oder blauen Linie),
  2. lässt darin Farbiges weg (Fluchtwege, Treppenräume) und alles, was außerhalb des Gebäudes liegt,
  3. übernimmt die Raumnamen (schmale Schrift), nicht aber die Texte der Schilder,
  4. dreht den Plan so, wie das Blatt gedacht ist (Norden oben), und schreibt SVG, PDF und PNG,
  5. prüft zur Gegenprobe, dass jede gezeichnete Linie auch auf dem Originalblatt an dieser Stelle dunkel ist.

Ergebnis je Etage: <Etage>.svg und <Etage>.pdf (Vektor), <Etage>.png und ein Eintrag in etagen.json.
"""
import sys, os, re, json, math, collections

import pymupdf

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import frp_etagenplan as F                                       # Linien, Zeichnen, PDF und SVG wie beim Rettungsplan


def etage_der_seite(text):
    """Etage aus dem Schriftfeld: „GESCHOSSPLAN … (+4)“ → 4OG, „(E)“ → EG, „(-2)“ oder „( 2)“ → 2UG."""
    i = text.find("GESCHOSSPLAN")
    if i < 0:
        return None
    m = re.search(r"\(\s*([+\-E]?)\s*(\d?)\s*\)", text[i:i + 80])
    if not m:
        return None
    if m.group(1) == "E":
        return "EG"
    return m.group(2) + ("OG" if m.group(1) == "+" else "UG") if m.group(2) else None


def _gruen(c):
    return c is not None and c[1] > c[0] + 0.1 and c[1] > c[2] + 0.1


def gebaeude(seite):
    """Linien des Gebäudes auf einem Geschossplan (Seite ohne Drehung). Liefert Pfade, den Rahmen um das Gebäude
    und eine kleine Statistik."""
    ze = seite.get_drawings(extended=True)
    blatt = seite.rect.width * seite.rect.height

    def weisse_flaeche(g):
        return g["type"] != "clip" and g.get("fill") is not None and min(g["fill"]) > 0.97 and g["rect"].width * g["rect"].height > 0.04 * blatt

    def schild_linie(g):          # erste rote oder blaue Linie: ab hier kommen Brandwände in Rot, Schilder, Hinweislinien
        return g["type"] != "clip" and "s" in g["type"] and not F.neutral(g.get("color")) and not _gruen(g.get("color"))

    start = next((i for i, g in enumerate(ze) if weisse_flaeche(g)), None)
    if start is None:
        return [], None, {}
    ende = next((i for i in range(start + 1, len(ze)) if schild_linie(ze[i])), len(ze))
    rahmen = pymupdf.Rect(ze[start]["rect"]) + (-4, -4, 4, 4)
    schilder = [g["rect"] for g in ze[ende:] if g["type"] != "clip" and "s" in g["type"] and not F.neutral(g.get("color"))]
    pfade, weg = [], collections.Counter()
    for i in range(start + 1, ende):
        g = ze[i]
        if g["type"] == "clip" or not g["items"]:
            continue
        if not (F.neutral(g.get("color")) and F.neutral(g.get("fill"))):
            weg["farbig"] += 1
            continue
        r = g["rect"]
        if not (r.x0 >= rahmen.x0 and r.y0 >= rahmen.y0 and r.x1 <= rahmen.x1 and r.y1 <= rahmen.y1):
            weg["ausserhalb"] += 1
            continue
        p = F.Pfad(g, seite.number + 1, i)
        if not p.teile:
            continue
        if "f" in p.art and p.kat == "schwarz" and len(p.punkte) <= 5 and min(r.width, r.height) > 6 and all(t != "c" for t, _ in p.teile):
            weg["zugangspfeil"] += 1             # großes schwarzes Dreieck: Zeichen für einen Gebäudezugang, kein Bauteil
            continue
        if p.art == "f" and p.kat == "weiss" and any(abs(r.x0 - k.x0) < 1 and abs(r.y0 - k.y0) < 1 and abs(r.x1 - k.x1) < 1 and abs(r.y1 - k.y1) < 1 for k in schilder):
            weg["schildgrund"] += 1              # weiße Fläche hinter einem Schild: würde ein Loch in den Plan stanzen
            continue
        pfade.append(p)
    return pfade, rahmen, {"elemente": len(ze), "von": start, "bis": ende, "weggelassen": dict(weg)}


def raster_abstand(seite):
    """Abstand der Rasterlinien in Punkt. Im Feuerwehrplan liegt das Raster alle 10 m („10m“ steht am Blattrand).
    Die Rasterlinien sind die langen, dünnen, geraden Linien, die vor dem Gebäude gezeichnet werden.
    Liefert None, wenn kein gleichmäßiges Raster zu finden ist."""
    ze = seite.get_drawings(extended=True)
    blatt = seite.rect.width * seite.rect.height
    start = next((i for i, g in enumerate(ze) if g["type"] != "clip" and g.get("fill") is not None and min(g["fill"]) > 0.97
                  and g["rect"].width * g["rect"].height > 0.04 * blatt), None)
    if start is None:
        return None
    lagen = {"x": [], "y": []}
    for g in ze[:start]:
        if g["type"] != "s" or not F.neutral(g.get("color")) or (g.get("width") or 0) > 0.6:
            continue
        for it in g["items"]:
            if it[0] != "l":
                continue
            a, b = it[1], it[2]
            if abs(a.x - b.x) < 0.5 and abs(a.y - b.y) > 150:
                lagen["x"].append(a.x)
            elif abs(a.y - b.y) < 0.5 and abs(a.x - b.x) > 150:
                lagen["y"].append(a.y)
    abstaende = []
    for werte in lagen.values():
        werte = sorted(set(round(v, 1) for v in werte))
        abstaende += [b - a for a, b in zip(werte, werte[1:]) if b - a > 20]
    if len(abstaende) < 4:
        return None
    abstaende.sort()
    mitte = abstaende[len(abstaende) // 2]
    return mitte if sum(1 for a in abstaende if abs(a - mitte) < 0.6) >= 0.6 * len(abstaende) else None


def beschriftung(seite, rahmen):
    """Raumnamen im Gebäude: schmale Schrift. Die Texte der Schilder (Ziffern, „S“, „T1“ …) stehen in anderer Schrift.
    Hinweise in farbig umrandeten Kästen (etwa „Sprinklerschutz über gesamte Etage“) sind keine Raumnamen."""
    kaesten = [pymupdf.Rect(g["rect"]) + (-1, -1, 1, 1) for g in seite.get_drawings()
               if "s" in g["type"] and not F.neutral(g.get("color")) and len(g["items"]) == 1 and g["items"][0][0] in ("re", "qu")
               and g["rect"].width > 25 and g["rect"].height > 12]
    aus = []
    for block in seite.get_text("dict")["blocks"]:
        if block["type"] != 0:
            continue
        for zeile in block["lines"]:
            dx, dy = zeile["dir"]
            for sp in zeile["spans"]:
                text = sp["text"].strip()
                if not text or not sp["font"].startswith("ArialNarrow"):
                    continue
                if re.fullmatch(r"[+\-]?\d+|S|\d+\s?x", text) or (sp["color"] >> 16) > 0x60:    # Ziffern, Schild-„S“, „2x“, farbige Schrift
                    continue
                r = pymupdf.Rect(sp["bbox"])
                mitte = pymupdf.Point((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2)
                if not rahmen.contains(mitte) or any(k.contains(mitte) for k in kaesten):
                    continue
                laenge = r.width if abs(dx) > abs(dy) else r.height
                aus.append({"text": text, "x": sp["origin"][0], "y": sp["origin"][1], "groesse": sp["size"], "dx": round(dx), "dy": round(dy),
                            "laenge": laenge, "schraeg": "Italic" in sp["font"]})
    return aus


def _lage(schrift, T, drehung):
    """Ursprung und Laufrichtung einer Beschriftung auf dem fertigen Blatt."""
    x, y = T((schrift["x"], schrift["y"]))
    dx, dy = schrift["dx"], schrift["dy"]
    for _ in range(drehung // 90):                  # Vierteldrehung im Uhrzeigersinn: (dx, dy) → (−dy, dx)
        dx, dy = -dy, dx
    return x, y, dx, dy


def schrift_ins_pdf(doc, schriften, T, drehung):
    """Raumnamen ins PDF schreiben. Die Vorlage nutzt eine schmale Schrift, hier steht nur Helvetica bereit: alle Namen
    werden deshalb um denselben Faktor kleiner gesetzt, damit sie so viel Platz brauchen wie im Original."""
    seite = doc[0]
    faktoren = sorted(s["laenge"] / pymupdf.get_text_length(s["text"], fontname="helv", fontsize=s["groesse"]) for s in schriften if len(s["text"]) >= 4)
    faktor = min(1.0, faktoren[len(faktoren) // 2]) if faktoren else 0.82
    for s in schriften:
        x, y, dx, dy = _lage(s, T, drehung)
        winkel = {(1, 0): 0, (0, -1): 90, (-1, 0): 180, (0, 1): 270}.get((dx, dy), 0)
        seite.insert_text((x, y), s["text"], fontsize=s["groesse"] * faktor, fontname="helv", rotate=winkel, color=(0.14, 0.12, 0.13))


def schrift_ins_svg(svg, schriften, T, drehung):
    aus = ['<g class="schrift" font-family="\'Arial Narrow\', \'Liberation Sans Narrow\', Arial, Helvetica, sans-serif" fill="#231f20">']
    for s in schriften:
        x, y, dx, dy = _lage(s, T, drehung)
        winkel = round(math.degrees(math.atan2(dy, dx)))
        dreh = f' transform="rotate({winkel} {F._z(x)} {F._z(y)})"' if winkel else ""
        stil = ' font-style="italic"' if s["schraeg"] else ""
        text = s["text"].replace("&", "&amp;").replace("<", "&lt;")
        aus.append(f'<text x="{F._z(x)}" y="{F._z(y)}" font-size="{F._z(s["groesse"])}" textLength="{F._z(s["laenge"])}" lengthAdjust="spacingAndGlyphs"{stil}{dreh}>{text}</text>')
    aus.append("</g>")
    return svg.replace("</svg>", "\n".join(aus) + "\n</svg>")


def gegenprobe(seite, bestand, rahmen, zoom=3.0):
    """Zeichne ich etwas, das auf dem Originalblatt nicht zu sehen ist? Vergleicht meine dunklen Bildpunkte mit dem
    Original (zwei Bildpunkte Spielraum). Farbige Stellen des Originals (Schilder, Fluchtwege) verdecken dort Linien,
    die zählen nicht. Liefert (eigene dunkle Bildpunkte, davon ohne Gegenstück) oder None ohne numpy."""
    try:
        import numpy as np
    except ImportError:
        return None

    def dicker(m, r=2):
        aus = m.copy()
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                if dx or dy:
                    v = np.zeros_like(m)
                    v[max(dy, 0):m.shape[0] + min(dy, 0), max(dx, 0):m.shape[1] + min(dx, 0)] = m[max(-dy, 0):m.shape[0] + min(-dy, 0), max(-dx, 0):m.shape[1] + min(-dx, 0)]
                    aus |= v
        return aus

    pm = seite.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), clip=rahmen, alpha=False)
    orig = np.frombuffer(pm.samples, dtype=np.uint8).reshape(pm.height, pm.width, 3).astype(np.int16)
    doc = F.als_pdf(bestand, lambda p: (p[0] - rahmen.x0, p[1] - rahmen.y0), rahmen.width, rahmen.height)
    pm2 = doc[0].get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False)
    mein = np.frombuffer(pm2.samples, dtype=np.uint8).reshape(pm2.height, pm2.width, 3).astype(np.int16)
    h, w = min(orig.shape[0], mein.shape[0]), min(orig.shape[1], mein.shape[1])
    orig, mein = orig[:h, :w], mein[:h, :w]
    hell, farbe = orig.mean(axis=2), orig.max(axis=2) - orig.min(axis=2)
    dunkel = mein.mean(axis=2) < 90
    ohne = dunkel & ~dicker((hell < 215) | (farbe >= 20))
    ohne[:6, :] = False; ohne[-6:, :] = False; ohne[:, :6] = False; ohne[:, -6:] = False
    return int(dunkel.sum()), int(ohne.sum())


def main():
    wahl = [a for a in sys.argv[1:] if a.startswith("--")]
    rest = [a for a in sys.argv[1:] if not a.startswith("--")]
    pdf = pymupdf.open(rest[0]); ziel = rest[1]; nur = rest[2:]
    mit_schrift = "--ohne-schrift" not in wahl
    os.makedirs(ziel, exist_ok=True)
    stand = next((m for m in (re.search(r"\b(\d{2}/20\d{2})\b", seite.get_text()) for seite in list(pdf)[:4]) if m), None)     # „Stand: 03/2026“ im Textteil
    meta = []
    for seite in pdf:
        code = etage_der_seite(seite.get_text())
        if not code or (nur and code not in nur):
            continue
        drehung = seite.rotation                       # so ist das Blatt gedacht: gedreht anzeigen
        seite.set_rotation(0)
        pfade, rahmen, zahlen = gebaeude(seite)
        if not pfade:
            print(f"{F.etagenname(code)}: auf Seite {seite.number + 1} keine Gebäudezeichnung gefunden")
            continue
        bestand = F.Bestand()
        bestand.folge = pfade
        schriften = beschriftung(seite, rahmen) if mit_schrift else []
        T, breite, hoehe, _ = F.ausgabe_masse([(rahmen.x0, rahmen.y0, rahmen.x1, rahmen.y1)], drehung=drehung, rand=6)
        doc = F.als_pdf(bestand, T, breite, hoehe)
        schrift_ins_pdf(doc, schriften, T, drehung)
        doc.save(f"{ziel}/{code}.pdf", deflate=True, garbage=3)
        zoom = min(8.0, 9000 / max(breite, hoehe))
        doc[0].get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False).save(f"{ziel}/{code}.png")
        open(f"{ziel}/{code}.svg", "w", encoding="utf-8").write(schrift_ins_svg(F.als_svg(bestand, T, breite, hoehe, F.etagenname(code)), schriften, T, drehung))
        probe = gegenprobe(seite, bestand, rahmen)
        raster = raster_abstand(seite)
        meta.append({"etage": F.etagenname(code), "code": code, "datei": f"{code}.png", "pdf": f"{code}.pdf", "svg": f"{code}.svg", "seite": seite.number + 1,
                     "stand": stand.group(1) if stand else "", "linien": len(pfade), "raumnamen": len(schriften), "breite_pt": round(breite, 1),
                     "hoehe_pt": round(hoehe, 1), "drehung": drehung, "rahmen": [round(v, 1) for v in rahmen], "pt_je_10m": None if raster is None else round(raster, 2), **zahlen,
                     "gegenprobe": None if probe is None else {"dunkle_bildpunkte": probe[0], "ohne_gegenstueck": probe[1]}})
        print(f"{F.etagenname(code)}: Seite {seite.number + 1} → {len(pfade)} Linien, {len(schriften)} Raumnamen, {round(breite)} × {round(hoehe)} pt"
              + (f", 10 m = {raster:.1f} pt" if raster else "") + f" · weggelassen {zahlen['weggelassen']} · Gegenprobe: "
              + ("ohne numpy nicht möglich" if probe is None else f"{probe[1]} von {probe[0]} dunklen Bildpunkten ohne Gegenstück im Original"))
    json.dump(meta, open(f"{ziel}/etagen.json", "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
