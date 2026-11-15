"""Aus einem Feuerwehrplan (PDF, je Etage ein Geschossplan auf einem Blatt) saubere Etagenpläne machen.

Aufruf:  python3 werkzeuge/fwp_etagenplan.py <feuerwehrplan.pdf> <zielordner> [Etage ...] [--ohne-schrift]
                 [--neuer=<PDF oder Ordner>] [--blaetter=3OG/4,3OG/5]
         Etage z. B. 2UG, 1UG, EG, 1OG. Ohne Angabe: alle Etagen.
         --neuer: Rettungsplan-Blätter (einzelne PDF oder ein Ordner voll davon, mehrfach möglich). Jedes Blatt, dessen
                  Stand jünger ist als der Feuerwehrplan, gilt in seinem Ausschnitt: alte Wände samt Türen raus, neue
                  Wände rein. Ältere Blätter bleiben unbeachtet. --blaetter schränkt das auf bestimmte Plannummern ein.
Braucht: pip install pymupdf      (für die Gegenprobe zusätzlich: numpy)

Hintergrund: Ein Feuerwehrplan nach DIN 14095 zeigt jede Etage ganz auf einem Blatt, mit Türen und Raumnamen, dazu
viele Schilder, Hinweislinien und ein Raster. Das Blatt ist in fester Reihenfolge gezeichnet: erst eine weiße Fläche
hinter dem Gebäude, dann das Gebäude selbst (Treppen, Wände, Stützen, Türen), danach alles Übrige. Das Werkzeug

  1. nimmt je Geschossplan nur diesen Gebäudeteil (ab der weißen Fläche bis zur ersten roten oder blauen Linie),
  2. lässt darin Farbiges weg (Fluchtwege, Treppenräume) und alles, was außerhalb des Gebäudes liegt,
  3. übernimmt die Raumnamen (schmale Schrift), nicht aber die Texte der Schilder,
  4. arbeitet auf Wunsch neuere Rettungsplan-Blätter ein (--neuer), wo sie andere Wände zeigen,
  5. dreht den Plan so, wie das Blatt gedacht ist (Norden oben), und schreibt SVG, PDF und PNG,
  6. prüft zur Gegenprobe, dass jede gezeichnete Linie auch auf dem Originalblatt an dieser Stelle dunkel ist. Wo ein
     neueres Blatt gilt, wird stattdessen gegen dieses Blatt geprüft.

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


# ---------------------------------------------------------------------------------------------------------------
# Neuere Rettungsplan-Blätter einarbeiten: Wo ein einzelnes Blatt jünger ist als der Feuerwehrplan und andere Wände
# zeigt, gilt in seinem Ausschnitt das Blatt. Feuerwehrplan und Blätter stammen aus derselben Grundzeichnung: gleich
# gebliebene Wände liegen deshalb genau aufeinander, und jede Abweichung ist eine echte Änderung.
#
#   Wände    Was nur der Feuerwehrplan zeigt, kommt weg. Was nur das Blatt zeigt, kommt dazu. Eine Wand bleibt auch,
#            wenn das Blatt an ihrer Stelle nur eine dünne Linie zeigt (Brüstung, Dachkante).
#   Türen    Das Blatt zeigt Türen nur als Lücke in der Wand. Ein Türzeichen bleibt, wenn das Blatt dort eine Lücke
#            hat (ist sie verschoben oder schmaler, wandert das Zeichen mit). Sonst kommt es weg. Neue Lücken bleiben
#            Öffnungen ohne Türzeichen: Wie die Tür aufgeht, weiß das Blatt nicht.
#   Mobile Trennwände (im Blatt gestrichelt) werden gestrichelt übernommen.
#   Fassade, Stützen, Treppen, Aufzüge und dünne Linien bleiben, wie der Feuerwehrplan sie zeigt.

Q_WAND = 1.0          # Punkt quer: so nah müssen zwei gleich laufende Wände liegen, um dieselbe zu sein (rund 12 cm)
MIN_STUECK = 1.5      # um so viel darf die Lücke einer Tür im Blatt anders sein, ohne dass sich etwas ändert (rund 18 cm)
MIN_KURZ = 0.8        # kürzere Wandstücke zählen nie: Sie sind kürzer als die halbe Wandstärke und verschwinden in der Nachbarwand
SIN_GLEICH = 0.035    # bis 2 Grad Unterschied laufen zwei Wände gleich
WAND_AB = 0.7         # Feuerwehrplan: ab dieser Strichbreite ist eine dunkle Linie eine Wand (Türen 0,58, Treppen 0,39)


def _strecken(p):
    """Gerade Stücke eines Pfads als (ax, ay, bx, by)."""
    aus = []
    for typ, q in p.teile:
        if typ == "l":
            aus.append((q[0][0], q[0][1], q[1][0], q[1][1]))
        elif typ == "q":
            aus += [(q[i][0], q[i][1], q[(i + 1) % 4][0], q[(i + 1) % 4][1]) for i in range(4)]
    return [st for st in aus if math.hypot(st[2] - st[0], st[3] - st[1]) > 1e-6]


def _ist_wand(p, mindest):
    return p.art == "s" and not p.strich and p.breite >= mindest and (p.farbe is None or max(p.farbe) < 0.5)


class _Netz:
    """Strecken, nach Feldern sortiert: schnell alle in der Nähe einer anderen Strecke finden."""

    def __init__(self, strecken, zelle=20.0):
        self.zelle, self.feld = zelle, collections.defaultdict(list)
        for st in strecken:
            for feld in self._felder(st, 0.0):
                self.feld[feld].append(st)

    def _felder(self, st, rand):
        z = self.zelle
        for ix in range(int((min(st[0], st[2]) - rand) // z), int((max(st[0], st[2]) + rand) // z) + 1):
            for iy in range(int((min(st[1], st[3]) - rand) // z), int((max(st[1], st[3]) + rand) // z) + 1):
                yield ix, iy

    def nahe(self, st, rand=2.0):
        aus = {}
        for feld in self._felder(st, rand):
            for c in self.feld.get(feld, ()):
                aus[id(c)] = c
        return aus.values()


def _belegt(st, netz, kreuzend=False):
    """Auf welchen Abschnitten der Strecke liegt im Netz eine gleich laufende Wand? Liefert die Abschnitte in Punkt ab
    dem Anfang und die Länge. Mit kreuzend=True zählt auch die Stelle, an der eine quer laufende Wand auftrifft."""
    ax, ay, bx, by = st
    laenge = math.hypot(bx - ax, by - ay)
    if laenge < 1e-6:
        return [], 0.0
    ux, uy = (bx - ax) / laenge, (by - ay) / laenge
    stuecke = []
    for cx, cy, dx, dy in netz.nahe(st, Q_WAND + 1.0):
        l2 = math.hypot(dx - cx, dy - cy)
        vx, vy = (dx - cx) / l2, (dy - cy) / l2
        kreuz = ux * vy - uy * vx
        q1 = (cy - ay) * ux - (cx - ax) * uy                      # Abstand der beiden Enden quer zur Strecke
        q2 = (dy - ay) * ux - (dx - ax) * uy
        if abs(kreuz) <= SIN_GLEICH:
            if abs(q1) <= Q_WAND and abs(q2) <= Q_WAND:
                t1, t2 = (cx - ax) * ux + (cy - ay) * uy, (dx - ax) * ux + (dy - ay) * uy
                lo, hi = max(0.0, min(t1, t2)), min(laenge, max(t1, t2))
                if hi > lo:
                    stuecke.append((lo, hi))
        elif kreuzend and min(q1, q2) <= Q_WAND and max(q1, q2) >= -Q_WAND:
            t = ((cx - ax) * vy - (cy - ay) * vx) / kreuz             # Schnittpunkt der beiden Linien
            if -Q_WAND <= t <= laenge + Q_WAND:
                stuecke.append((max(0.0, t - 0.8), min(laenge, t + 0.8)))
    stuecke.sort()
    aus = []
    for lo, hi in stuecke:
        if aus and lo <= aus[-1][1] + 1e-6:
            aus[-1][1] = max(aus[-1][1], hi)
        else:
            aus.append([lo, hi])
    return aus, laenge


def _frei(belegt, von, bis, mindest):
    """Die nicht belegten Abschnitte zwischen `von` und `bis`, die mindestens `mindest` lang sind."""
    aus, t = [], von
    for lo, hi in belegt:
        if lo > t:
            aus.append((t, min(lo, bis)))
        t = max(t, hi)
        if t >= bis:
            break
    if t < bis:
        aus.append((t, bis))
    return [(a, b) for a, b in aus if b - a >= mindest]


def _im_kasten(st, kasten):
    """Der Teil der Strecke im Kasten: Abschnitt (von, bis) in Punkt ab dem Anfang, oder None."""
    ax, ay, bx, by = st
    laenge = math.hypot(bx - ax, by - ay)
    t0, t1 = 0.0, 1.0
    for p, q in ((ax - bx, ax - kasten[0]), (bx - ax, kasten[2] - ax), (ay - by, ay - kasten[1]), (by - ay, kasten[3] - ay)):
        if abs(p) < 1e-12:
            if q < 0:
                return None
        elif p < 0:
            t0 = max(t0, q / p)
        else:
            t1 = min(t1, q / p)
    return (t0 * laenge, t1 * laenge) if t1 > t0 else None


def _punkt(st, t):
    laenge = math.hypot(st[2] - st[0], st[3] - st[1])
    return st[0] + (st[2] - st[0]) * t / laenge, st[1] + (st[3] - st[1]) * t / laenge


def _linie(a, b, breite, seite, nr, farbe=(0.137, 0.122, 0.125), strich=None):
    g = {"type": "s", "color": farbe, "fill": None, "width": breite, "items": [("l", pymupdf.Point(*a), pymupdf.Point(*b))], "closePath": False,
         "even_odd": False, "lineCap": (0, 0, 0), "lineJoin": 0, "dashes": "[] 0"}
    p = F.Pfad(g, seite, nr)
    if strich:
        p.strich, p.kat = list(strich), "strich"
    return p


def _tuerzeichen(p):
    """Türzeichen: dünner Viertelkreis mit Türblatt. Liefert (freies Ende, Drehpunkt) der Öffnung, sonst None."""
    if p.art != "s" or p.strich or not 0.4 <= p.breite < WAND_AB or sorted(t for t, _ in p.teile) != ["c", "l"]:
        return None
    bogen = next(q for t, q in p.teile if t == "c")
    blatt = next(q for t, q in p.teile if t == "l")
    abstand, i, j = min((math.hypot(bogen[i][0] - blatt[j][0], bogen[i][1] - blatt[j][1]), i, j) for i in (0, 3) for j in (0, 1))
    if abstand > 0.6:
        return None
    frei, dreh, spitze = bogen[3 - i], blatt[1 - j], blatt[j]
    weite, blattlaenge = math.hypot(frei[0] - dreh[0], frei[1] - dreh[1]), math.hypot(spitze[0] - dreh[0], spitze[1] - dreh[1])
    return (frei, dreh) if weite >= 3 and abs(weite - blattlaenge) <= 0.25 * weite else None


def _tuereinheiten(pfade):
    """Türen als Einheiten: einzelne Tür oder zwei Flügel, die sich in der Mitte treffen. Je Einheit die Pfade und
    die beiden Enden der Öffnung."""
    einzeln = [(p, t) for p, t in ((p, _tuerzeichen(p)) for p in pfade) if t]
    aus, verbraucht = [], set()
    for n, (p, (frei, dreh)) in enumerate(einzeln):
        if n in verbraucht:
            continue
        partner = None
        for m in range(n + 1, len(einzeln)):
            if m in verbraucht:
                continue
            frei2, dreh2 = einzeln[m][1]
            if math.hypot(frei[0] - frei2[0], frei[1] - frei2[1]) <= 0.7:
                ux, uy, vx, vy = frei[0] - dreh[0], frei[1] - dreh[1], dreh2[0] - frei2[0], dreh2[1] - frei2[1]
                if abs(ux * vy - uy * vx) <= 0.1 * math.hypot(ux, uy) * math.hypot(vx, vy) and ux * vx + uy * vy > 0:
                    partner = m
                    break
        if partner is None:
            aus.append(([p], dreh, frei))
        else:
            verbraucht.add(partner)
            aus.append(([p, einzeln[partner][0]], dreh, einzeln[partner][1][1]))
    return aus


def blatt_einarbeiten(pfade, blatt, fenster, seite_nr=0):
    """Wände eines neueren Blatts in die Zeichnung übernehmen. `blatt` sind die Pfade des Blatts, schon im Maß der
    Zeichnung, `fenster` sein Ausschnitt. Liefert die neue Pfadliste, Zahlen dazu (Längen in Punkt) und eine Spur
    der Änderungen (für Prüfbilder)."""
    kasten = (fenster[0] + 1, fenster[1] + 1, fenster[2] - 1, fenster[3] - 1)
    drin = lambda x, y: kasten[0] <= x <= kasten[2] and kasten[1] <= y <= kasten[3]
    striche = [p for p in blatt if p.art == "s" and (p.farbe is None or max(p.farbe) < 0.5) and _strecken(p)]
    zahlen = {"entfernt_pt": 0.0, "neu_pt": 0.0, "tueren_entfernt": 0, "tueren_versetzt": 0, "trennwaende": 0, "abweichung_pt": 0.0}
    spur = {"weg": [], "neu": [], "tueren_weg": [], "tueren_versetzt": [], "trennwaende": []}
    if not striche:
        return pfade, zahlen, spur
    umriss = max(striche, key=lambda p: sum(math.hypot(st[2] - st[0], st[3] - st[1]) for st in _strecken(p)))      # längster Linienzug: der Gebäudeumriss
    blatt_waende = [p for p in striche if not p.strich and p.breite >= 0.42 * umriss.breite]
    trennwaende = [p for p in striche if p.strich and p.breite >= 0.42 * umriss.breite]
    alt_waende = [p for p in pfade if _ist_wand(p, WAND_AB)]
    netz_blatt = _Netz([st for p in blatt_waende for st in _strecken(p)])
    netz_linien = _Netz([st for p in striche if not p.strich for st in _strecken(p)])      # auch dünne Linien: Dort ist im Blatt etwas gezeichnet
    netz_alt = _Netz([st for p in alt_waende for st in _strecken(p)])
    breiten = collections.Counter(round(p.breite, 2) for p in alt_waende if any(drin((st[0] + st[2]) / 2, (st[1] + st[3]) / 2) for st in _strecken(p)))
    wandbreite = breiten.most_common(1)[0][0] if breiten else 1.54

    # 1. Türen: bleibt, wandert mit oder kommt weg
    weg, fest = set(), []                                             # fest: Türöffnungen, die bleiben, wie sie sind

    def zaehlt(st, lo, hi):
        """Ist dieser Abschnitt der Strecke eine Änderung? Kurze Stücke zählen auch, nur nicht an einer Tür, die
        bleibt: Dort weicht die Lücke des Blatts höchstens um ein Weniges ab, und das Türzeichen soll weiter passen."""
        if hi - lo >= MIN_STUECK:
            return True
        if hi - lo < MIN_KURZ:
            return False
        mx, my = _punkt(st, (lo + hi) / 2)
        for zx0, zy0, zx1, zy1 in fest:
            l2 = (zx1 - zx0) ** 2 + (zy1 - zy0) ** 2
            t = max(0.0, min(1.0, ((mx - zx0) * (zx1 - zx0) + (my - zy0) * (zy1 - zy0)) / l2))
            if math.hypot(mx - zx0 - t * (zx1 - zx0), my - zy0 - t * (zy1 - zy0)) <= Q_WAND:
                return False
        return True

    for zeichen, e1, e2 in _tuereinheiten(pfade):
        if not drin((e1[0] + e2[0]) / 2, (e1[1] + e2[1]) / 2):
            continue
        weite = math.hypot(e2[0] - e1[0], e2[1] - e1[1])
        ux, uy = (e2[0] - e1[0]) / weite, (e2[1] - e1[1]) / weite
        vor = max(weite, 6.0)                                         # so weit links und rechts der Tür mit ansehen
        x0, y0 = e1[0] - vor * ux, e1[1] - vor * uy
        if not (drin(x0, y0) and drin(e2[0] + vor * ux, e2[1] + vor * uy)):
            fest.append((x0, y0, e2[0] + vor * ux, e2[1] + vor * uy))  # am Rand des Ausschnitts: Das Blatt zeigt die Wand
            continue                                                  # neben der Tür nicht mehr, die Tür bleibt
        belegt, laenge = _belegt((x0, y0, e2[0] + vor * ux, e2[1] + vor * uy), netz_blatt, kreuzend=True)
        luecke = max(_frei(belegt, 0.0, laenge, 0.0), key=lambda l: min(l[1], vor + weite) - max(l[0], vor), default=None)
        passt = (luecke is not None and min(luecke[1], vor + weite) - max(luecke[0], vor) >= 0.5 * weite
                 and luecke[0] > 1e-6 and luecke[1] < laenge - 1e-6 and 0.55 * weite <= luecke[1] - luecke[0] <= 1.6 * weite)
        if not passt:
            weg.update(id(p) for p in zeichen)
            spur["tueren_weg"] += zeichen
            zahlen["tueren_entfernt"] += 1
            continue
        versatz, mehr = (luecke[0] + luecke[1]) / 2 - (vor + weite / 2), (luecke[1] - luecke[0]) - weite
        if abs(versatz) <= 0.75 and abs(mehr) <= MIN_STUECK:
            fest.append((e1[0] - (MIN_STUECK + 0.1) * ux, e1[1] - (MIN_STUECK + 0.1) * uy, e2[0] + (MIN_STUECK + 0.1) * ux, e2[1] + (MIN_STUECK + 0.1) * uy))
            continue                                                  # sitzt, wie sie ist
        faktor = (luecke[1] - luecke[0]) / weite                      # Zeichen in die Lücke des Blatts setzen
        nx, ny = x0 + luecke[0] * ux, y0 + luecke[0] * uy
        for p in zeichen:
            p.teile = [(typ, [(nx + faktor * (x - e1[0]), ny + faktor * (y - e1[1])) for x, y in q]) for typ, q in p.teile]
            p._pkt = p._masse = None
        spur["tueren_versetzt"] += zeichen
        zahlen["tueren_versetzt"] += 1

    # 2. alte Wände: Stücke ohne Gegenstück im Blatt herausnehmen
    for p in alt_waende:
        neu_teile, geaendert = [], False
        for typ, q in p.teile:
            st = (q[0][0], q[0][1], q[1][0], q[1][1]) if typ == "l" else None
            bereich = _im_kasten(st, kasten) if st and math.hypot(st[2] - st[0], st[3] - st[1]) > 1e-6 else None
            raus = [r for r in _frei(_belegt(st, netz_linien)[0], bereich[0], bereich[1], 0.0) if zaehlt(st, *r)] if bereich else []
            if not raus:
                neu_teile.append((typ, q))
                continue
            geaendert, laenge, t = True, math.hypot(st[2] - st[0], st[3] - st[1]), 0.0
            for lo, hi in raus + [(laenge, laenge)]:
                if lo - t > 0.05:
                    neu_teile.append(("l", [_punkt(st, t), _punkt(st, lo)]))
                if hi > lo:
                    spur["weg"].append(_punkt(st, lo) + _punkt(st, hi))
                    zahlen["entfernt_pt"] += hi - lo
                t = hi
        if geaendert:
            p.teile = neu_teile
            p._pkt = p._masse = None

    # 3. neue Wände: Stücke des Blatts ohne Gegenstück im Feuerwehrplan
    stuecke = []                                                      # je Stück: Anfang, Ende, schließt vorn an, schließt hinten an
    for p in blatt_waende:
        for st in _strecken(p):
            bereich = _im_kasten(st, kasten)
            belegt = _belegt(st, netz_alt)[0] if bereich else []
            for lo, hi in (_frei(belegt, bereich[0], bereich[1], 0.0) if bereich else []):
                if zaehlt(st, lo, hi):
                    stuecke.append((_punkt(st, lo), _punkt(st, hi), any(abs(b[1] - lo) < 1e-6 for b in belegt), any(abs(b[0] - hi) < 1e-6 for b in belegt)))
                    zahlen["neu_pt"] += hi - lo
    # Enden sauber machen. Trifft ein neues Stück mit seinem Ende auf das Ende einer quer laufenden Wand, reicht es um
    # die halbe Wandstärke weiter: Sonst bliebe an der Außenecke eine Kerbe. Setzt es eine alte Wand fort, greift es
    # ein wenig in sie hinein: Sonst zeigt sich an der Naht ein Haarriss.
    enden = [(st[i], st[i + 1], st[2 - i] - st[i], st[3 - i] - st[i + 1]) for p in alt_waende for st in _strecken(p) for i in (0, 2)]
    enden += [(a[0], a[1], b[0] - a[0], b[1] - a[1]) for a, b, _, _ in stuecke] + [(b[0], b[1], a[0] - b[0], a[1] - b[1]) for a, b, _, _ in stuecke]
    ecken = collections.defaultdict(list)
    for x, y, rx, ry in enden:
        ecken[(round(x / 2), round(y / 2))].append((x, y, rx, ry))
    neue = []
    for a, b, vorn, hinten in stuecke:
        laenge = math.hypot(b[0] - a[0], b[1] - a[1])
        ux, uy = (b[0] - a[0]) / laenge, (b[1] - a[1]) / laenge
        ende = []
        for (x, y), richtung, schliesst_an in ((a, -1, vorn), (b, 1, hinten)):
            quer = any(math.hypot(x - ex, y - ey) <= 0.3 and abs(ux * ry - uy * rx) > 0.3 * math.hypot(rx, ry)
                       for ix in (-1, 0, 1) for iy in (-1, 0, 1) for ex, ey, rx, ry in ecken.get((round(x / 2) + ix, round(y / 2) + iy), ()))
            mehr = richtung * (wandbreite / 2 if quer else 0.2 if schliesst_an else 0.0)
            ende.append((x + mehr * ux, y + mehr * uy))
        neue.append(_linie(ende[0], ende[1], wandbreite, seite_nr, 900000 + len(neue)))
        spur["neu"].append(a + b)

    # 4. mobile Trennwände: im Blatt gestrichelt, hier ebenso
    for p in trennwaende:
        for st in _strecken(p):
            bereich = _im_kasten(st, kasten)
            if bereich and bereich[1] - bereich[0] >= MIN_STUECK:
                a, b = _punkt(st, bereich[0]), _punkt(st, bereich[1])
                neue.append(_linie(a, b, max(0.5, p.breite), seite_nr, 900000 + len(neue), strich=p.strich))
                spur["trennwaende"].append(a + b)
                zahlen["trennwaende"] += 1

    bleibt = [p for p in pfade if p.teile and id(p) not in weg]
    # neue Wände zu den alten: vor Stützen und Türen, die liegen dann wie gewohnt darüber
    stelle = next((i for i, p in enumerate(bleibt) if (p.art == "fs" and any(t == "c" for t, _ in p.teile)) or _tuerzeichen(p)), None)
    if stelle is None:
        stelle = max((i for i, p in enumerate(bleibt) if _ist_wand(p, WAND_AB)), default=len(bleibt) - 1) + 1
    bleibt[stelle:stelle] = neue

    # 5. Probe: Decken sich Zeichnung und Blatt jetzt im Ausschnitt?
    netz_neu = _Netz([st for p in bleibt if _ist_wand(p, WAND_AB) for st in _strecken(p)])
    rest = 0.0
    for liste, netz in (([p for p in bleibt if _ist_wand(p, WAND_AB)], netz_linien), (blatt_waende, netz_neu)):
        for p in liste:
            for st in _strecken(p):
                bereich = _im_kasten(st, kasten)
                rest += sum(hi - lo for lo, hi in (_frei(_belegt(st, netz)[0], bereich[0], bereich[1], MIN_STUECK) if bereich else []))
    zahlen["abweichung_pt"] = rest
    zahlen = {k: (round(v, 1) if isinstance(v, float) else v) for k, v in zahlen.items()}
    return bleibt, zahlen, spur


def geaenderte_stellen(spur, abstand=8.0):
    """Wo wurde etwas geändert? Fasst alle Änderungen eines Blatts zu Kästen (x0, y0, x1, y1) zusammen: Was näher als
    `abstand` beieinander liegt, kommt in denselben Kasten. Für Markierungen im Programm und in Prüfbildern."""
    kaesten = [[min(st[0], st[2]), min(st[1], st[3]), max(st[0], st[2]), max(st[1], st[3])] for st in spur["weg"] + spur["neu"] + spur["trennwaende"]]
    for p in spur["tueren_weg"] + spur["tueren_versetzt"]:
        xs, ys = [x for _, q in p.teile for x, _ in q], [y for _, q in p.teile for _, y in q]
        kaesten.append([min(xs), min(ys), max(xs), max(ys)])
    zusammen = True
    while zusammen:
        zusammen = False
        for i in range(len(kaesten)):
            for j in range(len(kaesten) - 1, i, -1):
                a, b = kaesten[i], kaesten[j]
                if a[0] - abstand <= b[2] and b[0] - abstand <= a[2] and a[1] - abstand <= b[3] and b[1] - abstand <= a[3]:
                    kaesten[i] = [min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3])]
                    del kaesten[j]
                    zusammen = True
    return [[round(v, 1) for v in k] for k in sorted(kaesten)]


def blatt_lesen(doc, nr, quelle=""):
    """Ein Rettungsplan-Blatt lesen: Etage, Plannummer, Stand, Linien der Zeichnung, Ausschnitt und dunkle Beschriftung."""
    seite = doc[nr - 1]
    if seite.rotation:
        seite.set_rotation(0)
    text = seite.get_text()
    kennung = F.plannummer(text)
    if not kennung:
        return None
    tage = [f"{j}-{m}-{t}" for t, m, j in F.DATUM.findall(text)]
    gruppe, fenster = F.plan_pfade(seite)
    pfade = [F.Pfad(g, nr, i) for i, g in enumerate(gruppe) if g["items"] and F.brauchbar(g)]
    pfade = [p for p in pfade if p.teile]
    schriften = []
    for block in seite.get_text("dict")["blocks"] if fenster is not None else []:
        if block["type"] != 0:
            continue
        for zeile in block["lines"]:
            for sp in zeile["spans"]:
                t, r, c = sp["text"].strip(), pymupdf.Rect(sp["bbox"]), sp["color"]
                if not t or re.fullmatch(r"[+\-]?\d+|\d+\s?x", t) or max(c >> 16, (c >> 8) & 255, c & 255) > 0x60:
                    continue                                      # Ziffern, „2x“ und farbige oder weiße Schrift der Schilder
                if fenster.contains(pymupdf.Point((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2)):
                    quer = abs(zeile["dir"][0]) > abs(zeile["dir"][1])
                    schriften.append({"text": t, "x": sp["origin"][0], "y": sp["origin"][1], "groesse": sp["size"], "dx": round(zeile["dir"][0]),
                                      "dy": round(zeile["dir"][1]), "laenge": r.width if quer else r.height, "schraeg": False})
    return {"etage": kennung[0], "plannr": kennung[1], "stand": max(tage) if tage else "", "quelle": quelle, "pfade": pfade,
            "fenster": fenster, "schriften": schriften}


def neuere_blaetter(quellen, nur=None):
    """Alle Blätter aus PDF-Dateien oder Ordnern, je Plannummer das mit dem jüngsten Stand. `nur`: Liste von Plannummern."""
    dateien = []
    for q in quellen:
        if os.path.isdir(q):
            for ordner, _, namen in sorted(os.walk(q)):
                dateien += [os.path.join(ordner, n) for n in sorted(namen) if n.lower().endswith(".pdf")]
        else:
            dateien.append(q)
    beste = {}
    for datei in dateien:
        doc = pymupdf.open(datei)
        for nr in range(1, len(doc) + 1):
            b = blatt_lesen(doc, nr, os.path.basename(datei))
            if b and b["pfade"] and b["fenster"] is not None and (not nur or b["plannr"] in nur):
                if b["plannr"] not in beste or b["stand"] >= beste[b["plannr"]]["stand"]:
                    beste[b["plannr"]] = b
    return beste


SCHRIFT_BLATT = 5.6       # Punkt: so groß wird Beschriftung aus einem Blatt gesetzt (Raumnamen im Feuerwehrplan: 8,1)
SCHMAL = 0.82             # so viel schmaler als Helvetica läuft die schmale Schrift der Raumnamen


def schrift_vom_blatt(sch, lage, drehung, strecken):
    """Beschriftung eines Blatts ins Maß der Zeichnung bringen. Nur Text, der an einer der `strecken` steht (mobile
    Trennwand). Er behält seine Mitte, hält etwas Abstand zur Linie und wird um seine Mitte gedreht, wenn er auf dem
    fertigen Blatt sonst auf dem Kopf stünde."""
    ms, k, tx, ty = lage
    x, y = F.drehen((sch["x"], sch["y"]), k)
    x, y = ms * x + tx, ms * y + ty
    dx, dy = F.drehen((sch["dx"], sch["dy"]), k)
    laenge, hoehe = sch["laenge"] * ms, sch["groesse"] * ms
    hx, hy = dy, -dx                                              # „oben“ aus Sicht der Schrift
    mx, my = x + dx * laenge / 2 + hx * 0.36 * hoehe, y + dy * laenge / 2 + hy * 0.36 * hoehe
    naechste = None
    for st in strecken:
        l2 = (st[2] - st[0]) ** 2 + (st[3] - st[1]) ** 2
        t = max(0.0, min(1.0, ((mx - st[0]) * (st[2] - st[0]) + (my - st[1]) * (st[3] - st[1])) / l2)) if l2 else 0.0
        fx, fy = st[0] + t * (st[2] - st[0]), st[1] + t * (st[3] - st[1])
        if naechste is None or math.hypot(mx - fx, my - fy) < naechste[0]:
            naechste = (math.hypot(mx - fx, my - fy), fx, fy)
    if naechste is None or naechste[0] > 12:
        return None
    abstand, fx, fy = naechste
    noetig = 0.36 * SCHRIFT_BLATT + 1.8                           # die größere Schrift soll die Linie nicht berühren
    if 0.05 < abstand < noetig:
        mx, my = fx + (mx - fx) * noetig / abstand, fy + (my - fy) * noetig / abstand
    rx, ry = dx, dy
    for _ in range(drehung // 90):
        rx, ry = -ry, rx
    if (rx, ry) in ((-1, 0), (0, 1)):                             # stünde auf dem Kopf oder liefe von oben nach unten
        dx, dy, hx, hy = -dx, -dy, -hx, -hy
    lang = pymupdf.get_text_length(sch["text"], fontname="helv", fontsize=SCHRIFT_BLATT) * SCHMAL
    return {"text": sch["text"], "x": mx - dx * lang / 2 - hx * 0.36 * SCHRIFT_BLATT, "y": my - dy * lang / 2 - hy * 0.36 * SCHRIFT_BLATT,
            "groesse": SCHRIFT_BLATT, "dx": dx, "dy": dy, "laenge": lang, "schraeg": False}


def gegenprobe(seite, bestand, rahmen, zoom=3.0, ausser=()):
    """Zeichne ich etwas, das auf dem Originalblatt nicht zu sehen ist? Vergleicht meine dunklen Bildpunkte mit dem
    Original (zwei Bildpunkte Spielraum). Farbige Stellen des Originals (Schilder, Fluchtwege) verdecken dort Linien,
    die zählen nicht. `ausser`: Ausschnitte, in denen ein neueres Blatt gilt, dort wird nicht verglichen.
    Liefert (eigene dunkle Bildpunkte, davon ohne Gegenstück) oder None ohne numpy."""
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
    for x0, y0, x1, y1 in ausser:
        feld = (slice(max(0, int((y0 - rahmen.y0) * zoom)), max(0, int((y1 - rahmen.y0) * zoom))), slice(max(0, int((x0 - rahmen.x0) * zoom)), max(0, int((x1 - rahmen.x0) * zoom))))
        dunkel[feld] = False
        ohne[feld] = False
    return int(dunkel.sum()), int(ohne.sum())


def main():
    wahl = [a for a in sys.argv[1:] if a.startswith("--")]
    rest = [a for a in sys.argv[1:] if not a.startswith("--")]
    pdf = pymupdf.open(rest[0]); ziel = rest[1]; nur = rest[2:]
    mit_schrift = "--ohne-schrift" not in wahl
    quellen = [a.split("=", 1)[1] for a in wahl if a.startswith("--neuer=")]
    auswahl = next((a.split("=", 1)[1].split(",") for a in wahl if a.startswith("--blaetter=")), None)
    blaetter = neuere_blaetter(quellen, auswahl) if quellen else {}
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
        schriften = beschriftung(seite, rahmen) if mit_schrift else []
        eingearbeitet = []
        stand_fwp = (stand.group(1)[3:] + "-" + stand.group(1)[:2] + "-31") if stand else ""          # „03/2026“ → 2026-03-31
        for b in sorted((b for b in blaetter.values() if b["etage"] == code and b["stand"] > stand_fwp), key=lambda b: b["plannr"]):
            suche = F.Bestand()
            for p in pfade:
                suche.dazu(p)
            lage = F.lage_finden(b["pfade"], suche, b["fenster"], [])
            if lage is None:
                eingearbeitet.append({"plannr": b["plannr"], "stand": b["stand"], "quelle": b["quelle"], "fehler": "Lage nicht gefunden"})
                continue
            ms, k, tx, ty = lage[:4]
            for p in b["pfade"]:
                p.abbilden(ms, k, tx, ty)
            ecken = [(ms * F.drehen(e, k)[0] + tx, ms * F.drehen(e, k)[1] + ty) for e in ((b["fenster"].x0, b["fenster"].y0), (b["fenster"].x1, b["fenster"].y1))]
            fenster = (min(e[0] for e in ecken), min(e[1] for e in ecken), max(e[0] for e in ecken), max(e[1] for e in ecken))
            pfade, zahlen_b, spur = blatt_einarbeiten(pfade, b["pfade"], fenster, seite.number + 1)
            if mit_schrift:                                       # Beschriftung der mobilen Trennwände mitnehmen
                schriften += [t for t in (schrift_vom_blatt(sch, (ms, k, tx, ty), drehung, spur["trennwaende"]) for sch in b["schriften"]) if t]
            eingearbeitet.append({"plannr": b["plannr"], "stand": b["stand"], "quelle": b["quelle"], "fenster": [round(v, 1) for v in fenster], **zahlen_b,
                                  "stellen": geaenderte_stellen(spur)})
        bestand = F.Bestand()
        bestand.folge = pfade
        T, breite, hoehe, _ = F.ausgabe_masse([(rahmen.x0, rahmen.y0, rahmen.x1, rahmen.y1)], drehung=drehung, rand=6)
        doc = F.als_pdf(bestand, T, breite, hoehe)
        schrift_ins_pdf(doc, schriften, T, drehung)
        doc.save(f"{ziel}/{code}.pdf", deflate=True, garbage=3)
        zoom = min(8.0, 9000 / max(breite, hoehe))
        doc[0].get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False).save(f"{ziel}/{code}.png")
        open(f"{ziel}/{code}.svg", "w", encoding="utf-8").write(schrift_ins_svg(F.als_svg(bestand, T, breite, hoehe, F.etagenname(code)), schriften, T, drehung))
        probe = gegenprobe(seite, bestand, rahmen, ausser=[e["fenster"] for e in eingearbeitet if "fenster" in e])
        raster = raster_abstand(seite)
        meta.append({"etage": F.etagenname(code), "code": code, "datei": f"{code}.png", "pdf": f"{code}.pdf", "svg": f"{code}.svg", "seite": seite.number + 1,
                     "stand": stand.group(1) if stand else "", "linien": len(pfade), "raumnamen": len(schriften), "breite_pt": round(breite, 1),
                     "hoehe_pt": round(hoehe, 1), "drehung": drehung, "rahmen": [round(v, 1) for v in rahmen], "pt_je_10m": None if raster is None else round(raster, 2), **zahlen,
                     "eingearbeitet": eingearbeitet,
                     "gegenprobe": None if probe is None else {"dunkle_bildpunkte": probe[0], "ohne_gegenstueck": probe[1]}})
        print(f"{F.etagenname(code)}: Seite {seite.number + 1} → {len(pfade)} Linien, {len(schriften)} Raumnamen, {round(breite)} × {round(hoehe)} pt"
              + (f", 10 m = {raster:.1f} pt" if raster else "") + f" · weggelassen {zahlen['weggelassen']} · Gegenprobe: "
              + ("ohne numpy nicht möglich" if probe is None else f"{probe[1]} von {probe[0]} dunklen Bildpunkten ohne Gegenstück im Original"))
        for e in eingearbeitet:
            print("    ", e["plannr"], "Stand", e["stand"], e.get("fehler") or f"eingearbeitet: {e['entfernt_pt']} pt Wand entfernt, {e['neu_pt']} pt neu, "
                  f"{e['tueren_entfernt']} Türen entfernt, {e['tueren_versetzt']} versetzt, {e['trennwaende']} mobile Trennwände, "
                  f"danach {e['abweichung_pt']} pt Abweichung zum Blatt")
    json.dump(meta, open(f"{ziel}/etagen.json", "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
