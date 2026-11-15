"""Aus einem Flucht- und Rettungsplan (PDF, viele Seiten je Etage) EINEN kompletten Etagenplan je Etage bauen.

Aufruf:  python3 werkzeuge/frp_etagenplan.py <plaene.pdf> <zielordner> [Etage ...] [--drehung=0|90|180|270]
         Etage z. B. 2UG, 1UG, EG, 1OG. Ohne Angabe: alle Etagen.
         --drehung dreht den fertigen Plan im Uhrzeigersinn, etwa damit Norden oben liegt. Ohne Angabe: Querformat.
Braucht: pip install pymupdf      (für die Gegenprobe zusätzlich: numpy)

Hintergrund: In solchen Plänen zeigt jede Seite nur einen Ausschnitt der Etage, oft gedreht oder in anderem Maßstab,
und die Ausschnitte überlappen sich stark oder zeigen sogar dieselbe Fläche (Teil a, b, c). Die Seiten enthalten die
Zeichnung aber als Linien (Vektoren). Das Werkzeug

  1. liest je Seite nur die Zeichnung des Gebäudes (ohne Schilder, Fluchtwege, Standort und Text),
  2. findet über gleiche Formen heraus, wie die Seiten zueinander liegen (Verschiebung, Drehung, Maßstab);
     der Gebäudeumriss steht auf jeder Seite und gibt die Lage genau vor,
  3. legt alles in ein gemeinsames Maß und übernimmt jede Linie nur einmal, in der Reihenfolge der Zeichnung,
  4. zeichnet zur Gegenprobe jede Seite einzeln neu und vergleicht sie Bildpunkt für Bildpunkt mit dem fertigen Plan.

Ergebnis je Etage: <Etage>.svg und <Etage>.pdf (Vektor, beliebig vergrößerbar), <Etage>.png und ein Eintrag in
etagen.json. Dort steht je Seite auch, wo ihr Ausschnitt im neuen Plan liegt (fenster_blatt) und wie man von der Seite
in den Plan umrechnet (abbildung). Damit lassen sich Markierungen aus alten Teilplänen übertragen.

Die Etage steht in der Plannummer auf jeder Seite (z. B. „2UG/1a“, „EG/3b“, „4OG/2“).
"""
import sys, re, json, math, collections

import pymupdf

TOL = 0.35          # Punkte: so genau müssen gleiche Linien nach dem Übereinanderlegen passen
WINKEL = (0, 90, 180, 270)


def neutral(c, tol=0.08):
    return c is None or (max(c) - min(c) < tol)


def kategorie(g):
    c, f, t = g.get("color"), g.get("fill"), g["type"]
    if not (neutral(c) and neutral(f)):
        return "farbig"                      # Fluchtwege und andere farbige Flächen: nicht übernehmen
    if t == "s":
        return "linie"
    if f is not None and min(f) > 0.97:
        return "weiss"
    if f is not None and max(f) < 0.3:
        return "schwarz"
    return "grau"


def brauchbar(g):
    """Gehört die Linie zur Zeichnung des Gebäudes? Farbige Flächen (Fluchtwege, Markierungen) nicht, ihr dunkler Rand schon."""
    if kategorie(g) != "farbig":
        return True
    return "s" in g["type"] and neutral(g.get("color"))


def plan_pfade(seite):
    """Zeichnung des Gebäudes auf einer Seite: alle Linien im großen Ausschnittfenster. Dazu das Fenster."""
    ze = seite.get_drawings(extended=True)
    kandidaten = [i for i, g in enumerate(ze) if g["type"] == "clip" and g.get("level") == 1 and g.get("scissor") is not None]
    if not kandidaten:
        return [], None
    gi = max(kandidaten, key=lambda i: ze[i]["scissor"].width * ze[i]["scissor"].height)
    stufe = ze[gi]["level"]
    plan = []
    for g in ze[gi + 1:]:
        if g.get("level", 0) <= stufe:
            break
        if g["type"] != "clip":
            plan.append(g)
    return plan, pymupdf.Rect(ze[gi]["scissor"])


def drehen(p, k):
    x, y = p
    return (x, y) if k == 0 else (-y, x) if k == 1 else (-x, -y) if k == 2 else (y, -x)


class Pfad:
    """Ein Linienzug oder eine Fläche, unabhängig von der Seite."""
    __slots__ = ("art", "farbe", "fuellung", "breite", "teile", "kat", "zu", "gerade_ungerade", "kappe", "ecke", "strich", "seite", "nr", "_pkt", "_masse")

    def __init__(self, g, seite, nr):
        self.art, self.kat = g["type"], kategorie(g)
        self.farbe, self.fuellung = g.get("color"), g.get("fill")
        if self.kat == "farbig":             # farbige Fläche mit grauem oder schwarzem Rand (Stufen im Fluchtweg): nur der Rand zählt
            self.art, self.fuellung, self.kat = "s", None, "linie"
        self.breite = g.get("width") or 0
        self.zu, self.gerade_ungerade = bool(g.get("closePath")), bool(g.get("even_odd"))
        kap = g.get("lineCap")
        self.kappe = max(kap) if isinstance(kap, (tuple, list)) else (kap or 0)
        self.ecke = int(g.get("lineJoin") or 0)
        self.strich = [float(v) for v in re.findall(r"[\d.]+", (g.get("dashes") or "").split("]")[0])] if "s" in self.art else []
        if self.strich:
            self.kat = "strich"
        self.seite, self.nr = seite, nr
        self._pkt = self._masse = None
        self.teile = []
        for it in g["items"]:
            if it[0] == "l":
                self.teile.append(("l", [(it[1].x, it[1].y), (it[2].x, it[2].y)]))
            elif it[0] == "re":
                r = it[1]
                self.teile.append(("q", [(r.x0, r.y0), (r.x1, r.y0), (r.x1, r.y1), (r.x0, r.y1)]))
            elif it[0] == "qu":
                q = it[1]
                self.teile.append(("q", [(q.ul.x, q.ul.y), (q.ur.x, q.ur.y), (q.lr.x, q.lr.y), (q.ll.x, q.ll.y)]))
            elif it[0] == "c":
                self.teile.append(("c", [(p.x, p.y) for p in it[1:5]]))

    def abbilden(self, s, k, tx, ty):
        """Maßstab s, Drehung k·90°, dann Verschiebung."""
        neu = []
        for typ, pts in self.teile:
            neu.append((typ, [(s * drehen(p, k)[0] + tx, s * drehen(p, k)[1] + ty) for p in pts]))
        self.teile = neu
        self.breite *= s
        self.strich = [v * s for v in self.strich]
        self._pkt = self._masse = None

    @property
    def punkte(self):
        """Eckpunkte in einheitlicher Form: jeder Punkt eines Zuges einmal, der Schlusspunkt eines geschlossenen Zuges nicht noch einmal,
        keine Zwischenpunkte auf gerader Strecke. So gleicht ein Rechteck einem Rechteck, auch wenn es auf einer Seite als vier
        einzelne Linien gezeichnet ist oder eine Wand dort einen Punkt mehr hat."""
        if self._pkt is None:
            zuege, letzter = [], None         # je Zug: [Punkte, nur Geraden?]
            for typ, p in self.teile:
                if typ == "q":
                    zuege.append([list(p), False])
                    letzter = None
                    continue
                if letzter is None or abs(letzter[0] - p[0][0]) > 0.02 or abs(letzter[1] - p[0][1]) > 0.02:
                    zuege.append([[p[0]], True])
                z = zuege[-1]
                z[0].extend(p[1:])
                if typ == "c":
                    z[1] = False
                letzter = p[-1]
                if len(z[0]) > 2 and abs(letzter[0] - z[0][0][0]) <= 0.02 and abs(letzter[1] - z[0][0][1]) <= 0.02:
                    z[0].pop()
                    letzter = None
            pts = []
            for z, gerade in zuege:
                if gerade and len(z) > 2:
                    kurz = [z[0]]
                    for i in range(1, len(z) - 1):
                        (ax, ay), (bx, by), (cx, cy) = kurz[-1], z[i], z[i + 1]
                        quer = abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax))
                        laengs = (bx - ax) * (cx - bx) + (by - ay) * (cy - by)
                        if quer > 0.02 * max(1.0, math.hypot(cx - ax, cy - ay)) or laengs < 0:      # Knick oder Umkehr: Punkt bleibt
                            kurz.append(z[i])
                    kurz.append(z[-1])
                    z = kurz
                pts.extend(z)
            self._pkt = pts
        return self._pkt

    def masse(self):
        if self._masse is None:
            pts = self.punkte
            xs, ys = [p[0] for p in pts], [p[1] for p in pts]
            self._masse = (sum(xs) / len(xs), sum(ys) / len(ys), math.hypot(max(xs) - min(xs), max(ys) - min(ys)), len(pts))
        return self._masse

    def muster(self):
        """Form unabhängig von Lage, Drehung und Maßstab: Abstände der Punkte zur Mitte, geteilt durch die Größe."""
        cx, cy, d, n = self.masse()
        if d < 1e-6:
            return (self.kat, n)
        return (self.kat, n, tuple(sorted(round(math.hypot(p[0] - cx, p[1] - cy) / d, 2) for p in self.punkte)))


def gleich(a_pts, b_pts, tol=TOL):
    if len(a_pts) != len(b_pts):
        return False
    return all(abs(p[0] - q[0]) <= tol and abs(p[1] - q[1]) <= tol for p, q in zip(sorted(a_pts), sorted(b_pts))) or _gleich_menge(a_pts, b_pts, tol)


def _gleich_menge(a_pts, b_pts, tol):
    rest = list(b_pts)
    for p in a_pts:
        for i, q in enumerate(rest):
            if abs(p[0] - q[0]) <= tol and abs(p[1] - q[1]) <= tol:
                rest.pop(i)
                break
        else:
            return False
    return True


class Bestand:
    """Alle schon eingeordneten Linien einer Etage, mit schneller Suche nach gleichen."""

    def __init__(self):
        self.folge = []                      # Zeichenreihenfolge
        self.raster = collections.defaultdict(list)

    def _schluessel(self, cx, cy):
        return int(cx // 2), int(cy // 2)

    def finde(self, pfad=None, cx=None, cy=None, d=None, n=None, pts=None, kat=None):
        if pfad is not None:
            cx, cy, d, n = pfad.masse(); pts = pfad.punkte; kat = pfad.kat
        raster = self.raster
        for ix in range(int((cx - TOL) // 2), int((cx + TOL) // 2) + 1):
            for iy in range(int((cy - TOL) // 2), int((cy + TOL) // 2) + 1):
                for q in raster.get((ix, iy), ()):
                    qx, qy, qd, qn = q.masse()
                    if qn == n and q.kat == kat and abs(qx - cx) <= TOL and abs(qy - cy) <= TOL and abs(qd - d) <= 2 * TOL and (pts is None or gleich(pts, q.punkte)):
                        return q
        return None

    def dazu(self, pfad, nach=None, vor=None):
        """Neu aufnehmen: direkt nach `nach` oder direkt vor `vor` in der Zeichenreihenfolge, sonst ans Ende."""
        cx, cy, _, _ = pfad.masse()
        self.raster[self._schluessel(cx, cy)].append(pfad)
        if nach is not None:
            self.folge.insert(self.folge.index(nach) + 1, pfad)
        elif vor is not None:
            self.folge.insert(self.folge.index(vor), pfad)
        else:
            self.folge.append(pfad)


def lage_finden(pfade, bestand, fenster=None, fenster_alle=()):
    """Maßstab, Drehung und Verschiebung einer Seite gegenüber dem Bestand. Gibt (s, k, tx, ty, Treffer, Gewicht) oder None.

    Jede große Form der Seite wird mit jeder gleich gebauten Form im Bestand verglichen. Passt eine, wird geprüft,
    wie viele weitere Linien damit zur Deckung kommen. Große Formen mit vielen Ecken (etwa der Gebäudeumriss) zählen
    dabei viel mehr als kleine, die sich im Haus wiederholen (Aufzüge, Treppen). Linien, die dort liegen, wo schon eine
    andere Seite gezeichnet hat, aber nicht passen, zählen dagegen."""
    gruppen = collections.defaultdict(list)
    for q in bestand.folge:
        gruppen[(q.kat, q.masse()[3])].append(q)
    oft = collections.Counter(p.muster() for p in pfade)        # Formen, die sich auf der Seite wiederholen, taugen wenig als Anhalt
    anker = sorted((p for p in pfade if p.masse()[3] >= 4 and p.masse()[2] >= 8),
                   key=lambda p: (min(oft[p.muster()], 3), -(p.masse()[2] * p.masse()[3])))[:24]
    mitten = [(p.masse(), p.kat) for p in pfade]
    bestes, geprueft = None, set()
    for a in anker:
        ax, ay, ad, an = a.masse()
        for b in gruppen.get((a.kat, an), ()):
            bx, by, bd, bn = b.masse()
            s = bd / ad
            if not 0.25 < s < 4:
                continue
            for k in range(4):
                rx, ry = drehen((ax, ay), k)
                tx, ty = bx - s * rx, by - s * ry
                marke = (round(s, 2), k, round(tx / 2), round(ty / 2))
                if marke in geprueft:
                    continue
                pts = [(s * drehen(p, k)[0] + tx, s * drehen(p, k)[1] + ty) for p in a.punkte]
                if not gleich(pts, b.punkte, max(2 * TOL, 0.0005 * bd)):
                    continue
                geprueft.add(marke)
                treffer, gewicht, dagegen = [], 0.0, 0
                for (cx, cy, d, n), kat in mitten:
                    qx, qy = drehen((cx, cy), k)
                    mx, my = s * qx + tx, s * qy + ty
                    q = bestand.finde(cx=mx, cy=my, d=s * d, n=n, kat=kat)
                    if q is not None:
                        treffer.append(((cx, cy, d), q.masse()))
                        gewicht += n * s * d
                    elif any(f[0] + 3 < mx < f[2] - 3 and f[1] + 3 < my < f[3] - 3 for f in fenster_alle):
                        dagegen += 1
                gewicht *= len(treffer) / (len(treffer) + dagegen)
                if bestes is None or gewicht > bestes[5]:
                    bestes = (s, k, tx, ty, treffer, gewicht, dagegen)
        if bestes and bestes[6] == 0 and len(bestes[4]) >= 0.6 * len(pfade):
            break               # fast alles deckt sich schon: besser wird es nicht
    if not bestes:
        return None
    s, k, tx, ty, treffer, gewicht, dagegen = bestes
    # verfeinern: Maßstab aus großen Formen, Verschiebung als Mittel über alle Treffer
    grosse = sorted((b[2] / a[2] for a, b in treffer if a[2] > 25))
    if grosse:
        s = grosse[len(grosse) // 2]
    dx = sorted(b[0] - s * drehen((a[0], a[1]), k)[0] for a, b in treffer)
    dy = sorted(b[1] - s * drehen((a[0], a[1]), k)[1] for a, b in treffer)
    return s, k, dx[len(dx) // 2], dy[len(dy) // 2], len(treffer), round(gewicht), dagegen


def etage_bauen(pdf, seiten):
    """seiten: Liste (Seitennummer ab 1, Plannummer). Liefert Bestand, Fenster (im Etagenmaß) und Bericht."""
    roh = []
    for nr, plannr in seiten:
        s = pdf[nr - 1]
        if s.rotation:
            s.set_rotation(0)
        gruppe, fenster = plan_pfade(s)
        pfade = [Pfad(g, nr, i) for i, g in enumerate(gruppe) if g["items"] and brauchbar(g)]
        pfade = [p for p in pfade if p.teile]
        roh.append({"seite": nr, "plannr": plannr, "pfade": pfade, "fenster": fenster})
    # Start mit der Seite, die am meisten zeigt
    roh.sort(key=lambda r: -len(r["pfade"]))
    bestand = Bestand()
    bericht, fenster_alle = [], []

    def einordnen(r, s, k, tx, ty, treffer, gewicht=0, dagegen=0):
        # Die Reihenfolge auf der Seite bestimmt, was über was liegt (eine Fläche kann Linien verdecken). Jede neue Linie
        # kommt deshalb direkt hinter ihre Vorgängerin auf der Seite. Hat sie keine, dann direkt vor die erste, die nach ihr kommt.
        for p in r["pfade"]:
            p.abbilden(s, k, tx, ty)
        schon = [bestand.finde(p) for p in r["pfade"]]
        vorher, neu = None, 0
        for i, p in enumerate(r["pfade"]):
            if schon[i] is None:
                schon[i] = bestand.finde(p)          # dieselbe Linie zweimal auf einer Seite
            if schon[i] is not None:
                vorher = schon[i]
                continue
            if vorher is not None:
                bestand.dazu(p, nach=vorher)
            else:
                bestand.dazu(p, vor=next((t for t in schon[i + 1:] if t is not None), None))
            vorher = p
            neu += 1
        f = r["fenster"]
        ecken = [(s * drehen(e, k)[0] + tx, s * drehen(e, k)[1] + ty) for e in ((f.x0, f.y0), (f.x1, f.y1))]
        fx = (min(e[0] for e in ecken), min(e[1] for e in ecken), max(e[0] for e in ecken), max(e[1] for e in ecken))
        fenster_alle.append(fx)
        bericht.append({"seite": r["seite"], "plannr": r["plannr"], "linien": len(r["pfade"]), "neu": neu, "massstab": round(s, 4), "drehung": WINKEL[k],
                        "treffer": treffer, "gewicht": gewicht, "dagegen": dagegen, "fenster": [round(v, 1) for v in fx],
                        "abbildung": [s, k, tx, ty]})        # Seite → Etage: Maßstab, Vierteldrehungen, Verschiebung

    einordnen(roh[0], 1.0, 0, 0.0, 0.0, 0)
    offen = roh[1:]
    while offen:
        ergebnisse = [(lage_finden(r["pfade"], bestand, r["fenster"], fenster_alle), r) for r in offen]
        ergebnisse = [(e, r) for e, r in ergebnisse if e is not None]
        if not ergebnisse:
            for r in offen:
                bericht.append({"seite": r["seite"], "plannr": r["plannr"], "linien": len(r["pfade"]), "fehler": "passt zu keiner anderen Seite"})
            break
        ergebnisse.sort(key=lambda er: -er[0][5])            # die Seiten mit der sichersten Lage zuerst
        for e, r in ergebnisse:
            if e[5] >= 0.5 * ergebnisse[0][0][5]:
                einordnen(r, *e)
                offen.remove(r)
    return bestand, fenster_alle, bericht


def _z(v):
    t = "%.2f" % v
    return t.rstrip("0").rstrip(".") if "." in t else t


def _nah(a, b, tol=0.01):
    return abs(a[0] - b[0]) <= tol and abs(a[1] - b[1]) <= tol


def teilwege(p, T):
    """Einen Pfad in zusammenhängende Züge zerlegen: [Start, [Stücke], geschlossen]. Endet ein Zug am Anfang, wird er geschlossen (saubere Ecke)."""
    wege = []
    for typ, pts in p.teile:
        q = [T(x) for x in pts]
        if typ == "q":
            wege.append([q[0], [("l", q[1]), ("l", q[2]), ("l", q[3])], True])
            continue
        if not wege or wege[-1][2] or not _nah(wege[-1][3], q[0]):
            wege.append([q[0], [], False, q[0]])
        w = wege[-1]
        w[1].append(("l", q[1]) if typ == "l" else ("c", q[1], q[2], q[3]))
        w[3] = q[-1]
    for w in wege:
        if not w[2] and len(w[1]) >= 2 and _nah(w[3], w[0]):
            w[2] = True
            if w[1][-1][0] == "l":
                w[1].pop()
    return wege


def _farbe_hex(c):
    return "#%02x%02x%02x" % tuple(max(0, min(255, round(v * 255))) for v in c)


def ausgabe_masse(fenster_alle, quer=True, rand=14, drehung=None):
    """Blattgröße und Abbildung Etagenmaß → Blatt.

    drehung: 0, 90, 180 oder 270 Grad im Uhrzeigersinn gegenüber den Seiten des Plans. Ohne Angabe wird die längere
    Seite waagerecht gelegt (quer=True). Liefert Abbildung, Breite, Höhe und die gewählte Drehung."""
    x0 = min(f[0] for f in fenster_alle); y0 = min(f[1] for f in fenster_alle)
    x1 = max(f[2] for f in fenster_alle); y1 = max(f[3] for f in fenster_alle)
    b, h = x1 - x0, y1 - y0
    if drehung is None:
        drehung = 90 if (quer and h > b) else 0
    if drehung == 90:
        return (lambda p: (rand + (y1 - p[1]), rand + (p[0] - x0))), h + 2 * rand, b + 2 * rand, 90
    if drehung == 180:
        return (lambda p: (rand + (x1 - p[0]), rand + (y1 - p[1]))), b + 2 * rand, h + 2 * rand, 180
    if drehung == 270:
        return (lambda p: (rand + (p[1] - y0), rand + (x1 - p[0]))), h + 2 * rand, b + 2 * rand, 270
    return (lambda p: (rand + (p[0] - x0), rand + (p[1] - y0))), b + 2 * rand, h + 2 * rand, 0


def als_pdf(bestand, T, breite, hoehe):
    """Etagenplan als PDF mit einer Seite (Vektor)."""
    z = ["q 1 0 0 -1 0 %s cm" % _z(hoehe)]      # y nach unten, wie auf dem Bildschirm
    for p in bestand.folge:
        z.append("q")
        if "s" in p.art:
            z.append("%s %s %s RG %s w %d J %d j" % (*(_z(v) for v in (p.farbe or (0, 0, 0))), _z(max(p.breite, 0.05)), p.kappe, p.ecke))
            if p.strich:
                z.append("[%s] 0 d" % " ".join(_z(v) for v in p.strich))
        if "f" in p.art:
            z.append("%s %s %s rg" % tuple(_z(v) for v in (p.fuellung or (0, 0, 0))))
        for start, stuecke, zu, *_ in teilwege(p, T):
            z.append("%s %s m" % (_z(start[0]), _z(start[1])))
            for st in stuecke:
                z.append(" ".join(_z(v) for pt in st[1:] for v in pt) + (" l" if st[0] == "l" else " c"))
            if zu:
                z.append("h")
        stern = "*" if p.gerade_ungerade else ""
        z.append({"s": "S", "f": "f" + stern, "fs": "B" + stern}[p.art])
        z.append("Q")
    z.append("Q")
    doc = pymupdf.open()
    seite = doc.new_page(width=breite, height=hoehe)
    xref = doc.get_new_xref()
    doc.update_object(xref, "<<>>")
    doc.update_stream(xref, "\n".join(z).encode())
    seite.set_contents(xref)
    return doc


def als_svg(bestand, T, breite, hoehe, titel=""):
    """Etagenplan als SVG: im Browser beliebig vergrößerbar und klein."""
    aus = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %s %s" width="%s" height="%s">' % (_z(breite), _z(hoehe), _z(breite), _z(hoehe))]
    if titel:
        aus.append("<title>%s</title>" % titel.replace("&", "&amp;").replace("<", "&lt;"))
    aus.append('<rect width="100%" height="100%" fill="#fff"/>')
    offen = None        # aufeinander folgende Linien gleicher Art in einem Element sammeln

    def schluss():
        nonlocal offen
        if offen:
            aus.append('<path %s d="%s"/>' % (offen[0], "".join(offen[1])))
        offen = None

    for p in bestand.folge:
        d = []
        for start, stuecke, zu, *_ in teilwege(p, T):
            d.append("M%s %s" % (_z(start[0]), _z(start[1])))
            for st in stuecke:
                d.append(("L" if st[0] == "l" else "C") + " ".join(_z(v) for pt in st[1:] for v in pt))
            if zu:
                d.append("Z")
        stil = []
        if "f" in p.art:
            stil.append('fill="%s"' % _farbe_hex(p.fuellung or (0, 0, 0)))
            if p.gerade_ungerade:
                stil.append('fill-rule="evenodd"')
        else:
            stil.append('fill="none"')
        if "s" in p.art:
            stil.append('stroke="%s" stroke-width="%s"' % (_farbe_hex(p.farbe or (0, 0, 0)), _z(max(p.breite, 0.05))))
            if p.kappe:
                stil.append('stroke-linecap="%s"' % ("round" if p.kappe == 1 else "square"))
            if p.ecke:
                stil.append('stroke-linejoin="%s"' % ("round" if p.ecke == 1 else "bevel"))
            if p.strich:
                stil.append('stroke-dasharray="%s"' % " ".join(_z(v) for v in p.strich))
        stil = " ".join(stil)
        if p.art == "s" and offen and offen[0] == stil:
            offen[1].extend(d)
            continue
        schluss()
        if p.art == "s":
            offen = [stil, d]
        else:
            aus.append('<path %s d="%s"/>' % (stil, "".join(d)))
    schluss()
    aus.append("</svg>")
    return "\n".join(aus)


def gegenprobe(pdf, bestand, bericht, T, breite, hoehe, zoom=3.0):
    """Jede Seite einzeln neu zeichnen und in ihrem Ausschnitt mit dem fertigen Etagenplan vergleichen.
    Trägt je Seite die Zahl der abweichenden Bildpunkte in den Bericht ein und gibt die Summe zurück (None ohne numpy)."""
    try:
        import numpy as np
    except ImportError:
        return None

    def bild(doc):
        pm = doc[0].get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False, colorspace=pymupdf.csGRAY)
        return np.frombuffer(pm.samples, dtype=np.uint8).reshape(pm.height, pm.width).astype(np.int16)

    ganz, summe = bild(als_pdf(bestand, T, breite, hoehe)), 0
    for b in bericht:
        if "abbildung" not in b:
            continue
        s, k, tx, ty = b["abbildung"]
        gruppe, _ = plan_pfade(pdf[b["seite"] - 1])
        allein = Bestand()
        for i, g in enumerate(gruppe):
            if g["items"] and brauchbar(g):
                p = Pfad(g, b["seite"], i)
                if p.teile:
                    p.abbilden(s, k, tx, ty)
                    allein.folge.append(p)
        e = [T((b["fenster"][0], b["fenster"][1])), T((b["fenster"][2], b["fenster"][3]))]
        x0, y0 = int((min(e[0][0], e[1][0]) + 2) * zoom), int((min(e[0][1], e[1][1]) + 2) * zoom)
        x1, y1 = int((max(e[0][0], e[1][0]) - 2) * zoom), int((max(e[0][1], e[1][1]) - 2) * zoom)
        b["abweichung"] = int((abs(bild(als_pdf(allein, T, breite, hoehe))[y0:y1, x0:x1] - ganz[y0:y1, x0:x1]) > 90).sum())
        summe += b["abweichung"]
    return summe


def plannummern(pdf):
    seiten = collections.defaultdict(list)
    for i, s in enumerate(pdf, 1):
        m = re.search(r"\b(\dUG|EG|\dOG)\s*/\s*(\d)([a-c]?)\b", s.get_text())
        if m:
            seiten[m.group(1)].append((i, m.group(0).replace(" ", "")))
    return seiten


def etagenname(c):
    return "EG" if c == "EG" else f"{c[0]}. {c[1:]}"


def main():
    import os
    wahl = [a for a in sys.argv[1:] if a.startswith("--")]
    rest = [a for a in sys.argv[1:] if not a.startswith("--")]
    drehung = next((int(a.split("=")[1]) for a in wahl if a.startswith("--drehung=")), None)
    pdf = pymupdf.open(rest[0]); ziel = rest[1]; nur = rest[2:]
    os.makedirs(ziel, exist_ok=True)
    alle = plannummern(pdf)
    meta = []
    for code, seiten in alle.items():
        if nur and code not in nur:
            continue
        bestand, fenster, bericht = etage_bauen(pdf, seiten)
        T, breite, hoehe, gedreht = ausgabe_masse(fenster, drehung=drehung)
        masse = {"breite_pt": round(breite, 1), "hoehe_pt": round(hoehe, 1), "drehung": gedreht}
        doc = als_pdf(bestand, T, breite, hoehe)
        doc.save(f"{ziel}/{code}.pdf", deflate=True, garbage=3)
        zoom = min(4.0, 9000 / max(breite, hoehe))
        doc[0].get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False).save(f"{ziel}/{code}.png")
        open(f"{ziel}/{code}.svg", "w", encoding="utf-8").write(als_svg(bestand, T, breite, hoehe, etagenname(code)))
        for b_ in bericht:              # Fenster der alten Teilpläne auch im Blattmaß, um Markierungen später umzurechnen
            if "fenster" in b_:
                e = [T((b_["fenster"][0], b_["fenster"][1])), T((b_["fenster"][2], b_["fenster"][3]))]
                b_["fenster_blatt"] = [round(min(e[0][0], e[1][0]), 1), round(min(e[0][1], e[1][1]), 1), round(max(e[0][0], e[1][0]), 1), round(max(e[0][1], e[1][1]), 1)]
        fehler = [b for b in bericht if b.get("fehler")]
        probe = gegenprobe(pdf, bestand, bericht, T, breite, hoehe)
        meta.append({"etage": etagenname(code), "datei": f"{code}.png", "pdf": f"{code}.pdf", "svg": f"{code}.svg", "seiten": len(seiten),
                     "linien": len(bestand.folge), "linien_vorher": sum(b["linien"] for b in bericht), **masse, "gegenprobe": probe, "bericht": bericht})
        print(f"{etagenname(code)}: {len(seiten)} Seiten → 1 Plan, {meta[-1]['linien_vorher']} → {len(bestand.folge)} Linien, {masse['breite_pt']} × {masse['hoehe_pt']} pt · Gegenprobe: "
              + ("ohne numpy nicht möglich" if probe is None else "stimmt" if probe == 0 else f"{probe} Bildpunkte weichen ab")
              + (f" · NICHT eingeordnet: {[b['plannr'] for b in fehler]}" if fehler else ""))
        for b in bericht:
            if b.get("fehler") or b.get("abweichung"):
                print("    ", b["plannr"], b.get("fehler") or f"{b['abweichung']} Bildpunkte weichen ab")
    json.dump(meta, open(f"{ziel}/etagen.json", "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
