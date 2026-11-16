"""Zeichnungen für das Testobjekt: Grundrisse (SVG), Beispielbilder (PNG) und Beispieldokumente (PDF).

Alles entsteht hier im Programm, ohne Zusatzprogramme und ohne fremde Vorlagen. Die Grundrisse sind frei erfunden
und nicht maßstäblich. Jedes Bild trägt den Stempel „TESTBILD“, jedes Dokument den Hinweis „Testdokument“.
"""
from __future__ import annotations

import base64
import math
import struct
import zlib
from xml.sax.saxutils import escape

HINWEIS_KURZ = "Testdokument aus dem Testobjekt · alle Angaben frei erfunden"


# ---------------------------------------------------------------------------
# Bilder (PNG)
# ---------------------------------------------------------------------------
_PUNKTSCHRIFT = {
    "T": (0x1F, 4, 4, 4, 4, 4, 4), "E": (0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x1F), "S": (0x0F, 0x10, 0x10, 0x0E, 1, 1, 0x1E),
    "B": (0x1E, 0x11, 0x11, 0x1E, 0x11, 0x11, 0x1E), "I": (0x1F, 4, 4, 4, 4, 4, 0x1F), "L": (0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1F),
    "D": (0x1E, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1E),
}


class Bild:
    """Kleine Zeichenfläche für PNG-Bilder: Flächen, Verläufe, Kreise, Linien und ein Stempel."""

    def __init__(self, breite: int, hoehe: int, farbe=(255, 255, 255)):
        self.b, self.h = breite, hoehe
        self.zeilen = [bytearray(bytes(farbe) * breite) for _ in range(hoehe)]

    def rechteck(self, x0, y0, x1, y1, farbe) -> None:
        x0, x1 = max(0, int(x0)), min(self.b, int(x1))
        y0, y1 = max(0, int(y0)), min(self.h, int(y1))
        if x1 <= x0:
            return
        stueck = bytes(farbe) * (x1 - x0)
        for y in range(y0, y1):
            self.zeilen[y][x0 * 3:x1 * 3] = stueck

    def verlauf(self, y0: int, y1: int, oben, unten) -> None:
        for y in range(max(0, y0), min(self.h, y1)):
            t = (y - y0) / max(1, y1 - y0 - 1)
            self.zeilen[y][:] = bytes(int(a + (b - a) * t) for a, b in zip(oben, unten)) * self.b

    def kreis(self, cx, cy, r, farbe) -> None:
        for y in range(int(cy - r), int(cy + r) + 1):
            dx = (r * r - (y - cy) ** 2) ** 0.5 if abs(y - cy) <= r else 0
            if dx:
                self.rechteck(cx - dx, y, cx + dx, y + 1, farbe)

    def linie(self, x0, y0, x1, y1, farbe, dicke=3) -> None:
        n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
        for i in range(n + 1):
            x, y = x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n
            self.rechteck(x - dicke / 2, y - dicke / 2, x + dicke / 2, y + dicke / 2, farbe)

    def schrift(self, x, y, wort: str, farbe, punkt=4) -> None:
        for z in wort:
            muster = _PUNKTSCHRIFT.get(z)
            if muster:
                for reihe, bits in enumerate(muster):
                    for spalte in range(5):
                        if bits & (0x10 >> spalte):
                            self.rechteck(x + spalte * punkt, y + reihe * punkt, x + (spalte + 1) * punkt, y + (reihe + 1) * punkt, farbe)
            x += 6 * punkt

    def stempel(self, rand: int = 0) -> "Bild":
        """Dunkles Band unten rechts mit dem Wort TESTBILD, damit niemand das Bild für ein echtes Foto hält.
        rand: Abstand zum Bildrand, damit der Stempel auch in einem beschnittenen Bild ganz zu sehen ist."""
        p = max(2, self.b // 260)
        breite, hoehe = 8 * 6 * p + 4 * p, 7 * p + 6 * p
        x, y = self.b - breite - rand, self.h - hoehe - rand
        self.rechteck(x, y, x + breite, y + hoehe, (38, 43, 51))
        self.schrift(x + 3 * p, y + 3 * p, "TESTBILD", (255, 255, 255), p)
        return self

    def png(self) -> bytes:
        roh = b"".join(b"\x00" + bytes(z) for z in self.zeilen)

        def block(art: bytes, daten: bytes) -> bytes:
            return struct.pack(">I", len(daten)) + art + daten + struct.pack(">I", zlib.crc32(art + daten) & 0xFFFFFFFF)
        return (b"\x89PNG\r\n\x1a\n" + block(b"IHDR", struct.pack(">IIBBBBB", self.b, self.h, 8, 2, 0, 0, 0))
                + block(b"IDAT", zlib.compress(roh, 6)) + block(b"IEND", b""))


def bild_objekt() -> bytes:
    """Titelbild des Testobjekts: Bürohaus, Halle, Parkplatz und Bäume als einfache Zeichnung. Alles Wichtige liegt im
    mittleren Streifen, weil das Programm das Bild oben am Objekt als breites Band zeigt."""
    b = Bild(1200, 675)
    b.verlauf(0, 455, (150, 196, 235), (226, 240, 250))
    b.kreis(1060, 250, 34, (255, 236, 170))
    b.verlauf(455, 675, (120, 168, 104), (92, 138, 82))
    b.rechteck(0, 500, 1200, 675, (120, 124, 132))                      # Parkplatz
    for x in range(60, 1200, 110):
        b.rechteck(x, 520, x + 4, 675, (236, 238, 240))
    b.rechteck(170, 215, 560, 470, (74, 96, 122))                       # Haus A
    b.rechteck(170, 207, 560, 217, (52, 68, 90))
    for etage in range(5):
        for feld in range(9):
            x, y = 186 + feld * 41, 228 + etage * 46
            b.rechteck(x, y, x + 28, y + 30, (176, 214, 240) if (etage * 3 + feld) % 5 else (236, 220, 160))
    b.rechteck(330, 436, 400, 470, (40, 52, 68))                        # Haupteingang
    b.rechteck(316, 428, 414, 437, (230, 55, 19))
    b.rechteck(650, 345, 1060, 470, (206, 210, 216))                    # Haus B
    b.rechteck(650, 336, 1060, 347, (150, 156, 166))
    for x in (700, 850):
        b.rechteck(x, 384, x + 100, 470, (92, 100, 112))
        for y in range(394, 470, 14):
            b.rechteck(x, y, x + 100, y + 2, (130, 138, 150))
    b.rechteck(990, 412, 1024, 470, (60, 70, 84))
    for x, y in ((90, 420), (606, 432), (1130, 424)):
        b.rechteck(x - 4, y, x + 4, y + 50, (96, 70, 48))
        b.kreis(x, y - 12, 30, (58, 124, 64))
        b.kreis(x + 15, y + 4, 20, (70, 140, 74))
    return b.stempel(40).png()


def bild_schluessel(variante: int) -> bytes:
    """Schlüssel auf einem Tisch, wie ein Foto bei der Ausgabe oder Rückgabe."""
    b = Bild(800, 600)
    b.verlauf(0, 600, (176, 138, 96), (150, 112, 74))
    for y in range(40, 600, 86):
        b.rechteck(0, y, 800, y + 3, (140, 104, 68))
    farben = [(230, 55, 19), (40, 110, 180), (60, 150, 90), (236, 180, 40)]
    b.kreis(250, 250, 74, (200, 204, 210))                             # Schlüsselring
    b.kreis(250, 250, 60, (163, 125, 85))
    for i in range(2 + variante % 3):
        x, y = 330 + i * 26, 250 + i * 70
        b.kreis(x, y, 44, (188, 192, 198))
        b.kreis(x, y, 16, (163, 125, 85))
        b.rechteck(x + 36, y - 11, x + 300, y + 11, (188, 192, 198))
        for zahn in range(5):
            b.rechteck(x + 170 + zahn * 26, y + 11, x + 184 + zahn * 26, y + 22 + (zahn * 7 + variante * 3) % 16, (188, 192, 198))
    farbe = farben[variante % len(farben)]
    b.rechteck(120, 360, 250, 440, farbe)                                # Anhänger
    b.kreis(140, 380, 9, (255, 255, 255))
    b.rechteck(160, 392, 236, 400, (255, 255, 255))
    b.rechteck(160, 410, 216, 418, (255, 255, 255))
    if variante % 2:
        b.kreis(600, 140, 46, (40, 60, 150))                             # Transponder
        b.rechteck(568, 140, 632, 220, (40, 60, 150))
        b.kreis(600, 140, 16, (150, 170, 240))
    return b.stempel().png()


def bild_winter(nachher: bool) -> bytes:
    """Gehweg vor dem Haus: vorher verschneit, nachher geräumt und gestreut."""
    b = Bild(800, 600)
    b.verlauf(0, 250, (168, 178, 192), (206, 212, 222))
    b.rechteck(0, 120, 330, 330, (86, 104, 126))                         # Hauswand
    for x in (40, 140, 240):
        b.rechteck(x, 160, x + 56, 240, (168, 200, 226))
    b.verlauf(250, 600, (238, 242, 247), (250, 251, 253))                # Schnee
    if nachher:
        for y in range(300, 600):
            mitte, halb = 400 + (y - 300) * 0.25, 60 + (y - 300) * 0.55
            b.rechteck(mitte - halb, y, mitte + halb, y + 1, (86, 90, 98))
        for i in range(140):                                             # Streugut
            y = 310 + (i * 37) % 280
            x = 400 + (y - 300) * 0.25 + ((i * 53) % 100 - 50) / 50 * (50 + (y - 300) * 0.5)
            b.rechteck(x, y, x + 3, y + 3, (214, 204, 186))
        for y in range(330, 600, 6):                                     # Schneewall am Rand
            mitte, halb = 400 + (y - 300) * 0.25, 60 + (y - 300) * 0.55
            b.kreis(mitte - halb - 16, y, 14, (226, 232, 240))
            b.kreis(mitte + halb + 16, y, 14, (226, 232, 240))
    else:
        for i in range(9):                                               # Fußspuren im Schnee
            y = 330 + i * 30
            x = 390 + (y - 300) * 0.25 + (18 if i % 2 else -18)
            b.kreis(x, y, 9 + i // 3, (206, 214, 226))
        for i in range(60):                                              # Schneefall
            b.rechteck((i * 131) % 800, (i * 67) % 260, (i * 131) % 800 + 4, (i * 67) % 260 + 4, (255, 255, 255))
    return b.stempel().png()


def bild_mangel(variante: int) -> bytes:
    """Fotos zu Meldungen: Wasserfleck an der Decke, Feuerlöscher ohne Plombe, dunkle Leuchte im Flur."""
    b = Bild(800, 600)
    if variante % 3 == 0:
        b.rechteck(0, 0, 800, 600, (236, 236, 232))
        for x in range(0, 800, 160):
            b.rechteck(x, 0, x + 3, 600, (206, 206, 200))
        for y in range(0, 600, 160):
            b.rechteck(0, y, 800, y + 3, (206, 206, 200))
        for r, f in ((120, (214, 198, 160)), (92, (198, 176, 128)), (58, (176, 150, 100))):
            b.kreis(430, 290, r, f)
            b.kreis(520, 330, r * 0.7, f)
    elif variante % 3 == 1:
        b.verlauf(0, 600, (226, 228, 232), (204, 208, 214))
        b.rechteck(0, 520, 800, 600, (150, 150, 150))
        b.rechteck(330, 200, 470, 520, (214, 40, 30))                    # Feuerlöscher
        b.kreis(400, 200, 70, (214, 40, 30))
        b.rechteck(380, 96, 420, 150, (60, 60, 64))
        b.rechteck(420, 104, 520, 122, (60, 60, 64))
        b.rechteck(350, 300, 450, 400, (250, 250, 250))
        b.kreis(560, 150, 30, (236, 180, 40))                            # Markierung: Plombe fehlt
        b.kreis(560, 150, 22, (226, 228, 232))
    else:
        b.verlauf(0, 600, (44, 48, 58), (24, 26, 32))
        for i, x in enumerate((120, 400, 680)):
            an = i != 1
            b.rechteck(x - 70, 60, x + 70, 84, (255, 244, 200) if an else (70, 72, 78))
            if an:
                for y in range(84, 420, 4):
                    halb = 70 + (y - 84) * 0.5
                    b.rechteck(x - halb, y, x + halb, y + 2, (70 + (420 - y) // 6, 70 + (420 - y) // 7, 60))
        b.rechteck(0, 520, 800, 600, (60, 62, 70))
    return b.stempel().png()


def unterschrift(variante: int) -> str:
    """Ein Schriftzug als Bild, wie er beim Unterschreiben auf dem Handy entsteht (als data-URL)."""
    b = Bild(360, 120)
    k1, k2, hub = (7.0, 2.3, 30) if variante % 2 else (5.2, 3.1, 26)
    alt = None
    for i in range(240):
        t = i / 239
        x = 18 + t * 320 + 6 * math.sin(t * 31 + variante)
        y = 62 + hub * math.sin(t * k1 * math.pi) * math.cos(t * k2 * math.pi + variante * 0.7) - 10 * t
        if alt:
            b.linie(alt[0], alt[1], x, y, (24, 40, 110), 3)
        alt = (x, y)
    b.linie(30, 100, 330, 96, (24, 40, 110), 2)
    return "data:image/png;base64," + base64.b64encode(b.png()).decode("ascii")


# ---------------------------------------------------------------------------
# Dokumente (PDF)
# ---------------------------------------------------------------------------
def pdf(titel: str, zeilen: list[str]) -> bytes:
    """Schlichtes PDF im Format A4. Zeilen, die mit „# “ beginnen, stehen fett."""
    def t(s: str) -> bytes:
        return s.encode("cp1252", "replace").replace(b"\\", b"\\\\").replace(b"(", b"\\(").replace(b")", b"\\)")
    je_seite = 44
    seiten = [zeilen[i:i + je_seite] for i in range(0, max(len(zeilen), 1), je_seite)]
    teile: list[bytes] = [b"<< /Type /Catalog /Pages 2 0 R >>", b"",
                          b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
                          b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"]
    kinder = []
    for nr, seite in enumerate(seiten, 1):
        s = [b"0.55 g BT /F2 8.5 Tf 56 806 Td (" + t(HINWEIS_KURZ) + b") Tj ET",
             b"0 g BT /F2 17 Tf 56 772 Td (" + t(titel) + b") Tj ET",
             b"0.90 0.22 0.07 RG 1.6 w 56 760 m 539 760 l S",
             b"0.15 g BT 56 736 Td 15.5 TL"]
        for z in seite:
            fett = z.startswith("# ")
            s.append((b"/F2 11 Tf (" if fett else b"/F1 10.5 Tf (") + t(z[2:] if fett else z) + b") Tj T*")
        s += [b"ET", b"0.55 g BT /F1 8 Tf 56 40 Td (" + t(f"Seite {nr} von {len(seiten)}") + b") Tj ET"]
        inhalt = b"\n".join(s)
        teile.append(b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> "
                     b"/Contents %d 0 R >>" % (len(teile) + 2))
        kinder.append(len(teile))
        teile.append(b"<< /Length %d >>\nstream\n" % len(inhalt) + inhalt + b"\nendstream")
    teile[1] = b"<< /Type /Pages /Kids [" + b" ".join(b"%d 0 R" % k for k in kinder) + b"] /Count %d >>" % len(kinder)
    aus, stellen = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"), []
    for i, o in enumerate(teile, 1):
        stellen.append(len(aus))
        aus += b"%d 0 obj\n" % i + o + b"\nendobj\n"
    xref = len(aus)
    aus += b"xref\n0 %d\n0000000000 65535 f \n" % (len(teile) + 1)
    for st in stellen:
        aus += b"%010d 00000 n \n" % st
    aus += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(teile) + 1, xref)
    return bytes(aus)


# ---------------------------------------------------------------------------
# Grundrisse (SVG): nur Linien, Flächen und Schrift, so wie das Programm es bei Plänen verlangt
# ---------------------------------------------------------------------------
class Zeichnung:
    WAND, FLUR, RAUM, KERN, TECH, GRUEN, WEISS, GRAU = "#2f3640", "#eef0f3", "#f8f9fb", "#e3e7ee", "#f5efe4", "#dcecd5", "#ffffff", "#8a93a0"

    def __init__(self, gebaeude: str, etage: str, teil: str = ""):
        self.kopf = (gebaeude, etage, teil)
        self.t: list[str] = ['<rect x="0" y="0" width="2400" height="1500" fill="#ffffff"/>']

    def raum(self, x, y, w, h, name: str = "", fill: str | None = None, gr: int = 26, rand: int = 6) -> None:
        self.t.append(f'<rect x="{x:g}" y="{y:g}" width="{w:g}" height="{h:g}" fill="{fill or self.RAUM}" '
                      f'stroke="{self.WAND}" stroke-width="{rand}"/>')
        if name:
            self.schrift(x + w / 2, y + h / 2, name, gr)

    def schrift(self, x, y, text: str, gr: int = 26, farbe: str = "#5b6470", anker: str = "middle", fett: bool = False) -> None:
        zeilen = str(text).split("\n")
        y0 = y + gr * 0.35 - (len(zeilen) - 1) * gr * 0.6
        dick = ' font-weight="bold"' if fett else ""
        for i, z in enumerate(zeilen):
            self.t.append(f'<text x="{x:g}" y="{y0 + i * gr * 1.2:g}" font-family="Arial, Helvetica, sans-serif" font-size="{gr}" '
                          f'fill="{farbe}" text-anchor="{anker}"{dick}>{escape(z)}</text>')

    def linie(self, x1, y1, x2, y2, farbe: str | None = None, dicke: float = 4, strich: str = "") -> None:
        gestrichelt = f' stroke-dasharray="{strich}"' if strich else ""
        self.t.append(f'<line x1="{x1:g}" y1="{y1:g}" x2="{x2:g}" y2="{y2:g}" stroke="{farbe or self.WAND}" '
                      f'stroke-width="{dicke:g}"{gestrichelt}/>')

    def kreis(self, x, y, r, fill: str, rand: str = "none", dicke: float = 0) -> None:
        self.t.append(f'<circle cx="{x:g}" cy="{y:g}" r="{r:g}" fill="{fill}" stroke="{rand}" stroke-width="{dicke:g}"/>')

    def tuer(self, x, y, b: float = 70, waagrecht: bool = True, nach: int = 1) -> None:
        """Türöffnung in einer Wand mit Türblatt und Bogen. waagrecht: Die Wand läuft von links nach rechts.
        nach=1 öffnet nach unten bzw. rechts, nach=-1 nach oben bzw. links."""
        if waagrecht:
            self.linie(x - b / 2, y, x + b / 2, y, self.WEISS, 10)
            self.linie(x - b / 2, y, x - b / 2, y + nach * b, self.GRAU, 3)
            self.t.append(f'<path d="M {x - b / 2:g} {y + nach * b:g} A {b:g} {b:g} 0 0 {0 if nach > 0 else 1} {x + b / 2:g} {y:g}" '
                          f'fill="none" stroke="{self.GRAU}" stroke-width="2"/>')
        else:
            self.linie(x, y - b / 2, x, y + b / 2, self.WEISS, 10)
            self.linie(x, y - b / 2, x + nach * b, y - b / 2, self.GRAU, 3)
            self.t.append(f'<path d="M {x + nach * b:g} {y - b / 2:g} A {b:g} {b:g} 0 0 {1 if nach > 0 else 0} {x:g} {y + b / 2:g}" '
                          f'fill="none" stroke="{self.GRAU}" stroke-width="2"/>')

    def tor(self, x, y, b: float = 200, name: str = "") -> None:
        """Tor in einer waagrechten Außenwand: breite Öffnung mit gestrichelter Linie."""
        self.linie(x - b / 2, y, x + b / 2, y, self.WEISS, 12)
        self.linie(x - b / 2, y, x + b / 2, y, self.GRAU, 4, "18 10")
        if name:
            self.schrift(x, y + 44, name, 22)

    def treppe(self, x, y, w, h, name: str = "Treppenhaus") -> None:
        self.raum(x, y, w, h, "", self.KERN)
        for i in range(1, 10):
            yy = y + 70 + (h - 110) * i / 10
            self.linie(x + 22, yy, x + w - 22, yy, "#9aa3b0", 2)
        self.linie(x + w / 2, y + 70, x + w / 2, y + h - 40, "#9aa3b0", 2)
        self.schrift(x + w / 2, y + 36, name, 20)

    def aufzug(self, x, y, w, h, name: str = "Aufzug") -> None:
        self.raum(x, y, w, h, "", self.KERN)
        self.linie(x + 14, y + 14, x + w - 14, y + h - 14, "#9aa3b0", 2)
        self.linie(x + w - 14, y + 14, x + 14, y + h - 14, "#9aa3b0", 2)
        self.schrift(x + w / 2, y + 30, name, 18)

    def geraet(self, x, y, w, h, name: str, fill: str = "#dfe6ee") -> None:
        """Aufgestelltes Gerät oder Feld (z. B. auf dem Dach): dünner Rahmen mit Namen."""
        self.raum(x, y, w, h, name, fill, 22, 3)

    def svg(self) -> bytes:
        gebaeude, etage, teil = self.kopf
        self.t.append('<rect x="60" y="1320" width="2280" height="130" fill="#f8f9fb" stroke="#2f3640" stroke-width="3"/>')
        self.schrift(90, 1362, "TESTOBJEKT MUSTERPARK", 34, "#2f3640", "start", True)
        self.schrift(90, 1414, " · ".join(x for x in (gebaeude, etage, teil) if x), 30, "#2f3640", "start")
        self.schrift(2310, 1362, "Beispielgrundriss, frei erfunden", 26, "#5b6470", "end")
        self.schrift(2310, 1414, "nicht maßstäblich · nur zum Ausprobieren", 26, "#5b6470", "end")
        self.t.append('<path d="M 2290 96 L 2262 170 L 2290 152 L 2318 170 Z" fill="#2f3640"/>')
        self.schrift(2290, 62, "N", 28, "#2f3640", "middle", True)
        return ('<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1500" viewBox="0 0 2400 1500">'
                + "".join(self.t) + "</svg>").encode("utf-8")


# Haus A (Bürohaus): Räume an der Nordseite, Flur in der Mitte, Räume an der Südseite. Zwei Kerne mit Treppe und Aufzug.
_A_NORD = [(150, 300), (450, 300), (1050, 300), (1350, 300), (1950, 300)]            # x, Breite (dazwischen die Kerne)
_A_SUED = [(150, 350), (500, 350), (850, 250), (1100, 200), (1300, 200), (1500, 400), (1900, 350)]


def _a_kerne(z: Zeichnung, aufzug: bool = True) -> None:
    for x, name in ((750, "Treppenhaus\nNord"), (1650, "Treppenhaus\nSüd")):
        z.treppe(x, 200, 180, 440, name)
        z.raum(x + 180, 200, 120, 240, "Schacht", z.KERN, 18)
        if aufzug:
            z.aufzug(x + 180, 440, 120, 200)
            z.tuer(x + 240, 640, 60, True, 1)
        else:
            z.raum(x + 180, 440, 120, 200, "Aufzug\n(Überfahrt)", z.KERN, 16)
        z.tuer(x + 90, 640, 76, True, 1)


def haus_a(etage: str, nord: list[str], sued: list[str], foyer: bool = False) -> bytes:
    """Regelgeschoss von Haus A. nord: fünf Raumnamen, sued: sieben Raumnamen. foyer: Die beiden mittleren Räume im Norden
    werden zum Foyer mit Haupteingang."""
    z = Zeichnung("Haus A", etage)
    z.raum(150, 640, 2100, 120, "", z.FLUR)
    z.schrift(1215, 700, "Flur", 24)
    raeume = list(zip(_A_NORD, nord))
    if foyer:
        raeume = [raeume[0], raeume[1], ((1050, 600), nord[2]), raeume[4]]
    for (x, w), name in raeume:
        z.raum(x, 200, w, 440, name, z.RAUM if w == 300 else "#f3f6fa")
        z.tuer(x + w / 2, 640, 76, True, -1)
    for (x, w), name in zip(_A_SUED, sued):
        z.raum(x, 760, w, 440, name)
        z.tuer(x + w / 2, 760, 76, True, 1)
    _a_kerne(z)
    if foyer:
        z.tor(1350, 200, 220)
        z.schrift(1350, 160, "Haupteingang", 24, "#2f3640")
        z.raum(1230, 470, 240, 70, "Empfang", "#e7ebf1", 20, 3)
    return z.svg()


def haus_a_keller() -> bytes:
    z = Zeichnung("Haus A", "1. UG")
    z.raum(150, 640, 2100, 560, "", "#eceef1")
    z.schrift(1200, 880, "Tiefgarage (38 Stellplätze)", 30)
    for x in range(300, 2100, 150):                                   # Stellplätze an der Südwand
        z.linie(x, 990, x, 1200, "#9aa3b0", 3)
    for x in range(1200, 2100, 150):                                  # Stellplätze vor den Technikräumen
        z.linie(x, 640, x, 800, "#9aa3b0", 3)
    namen = ["Heizzentrale", "Sanitär und\nSprinklerzentrale", "Elektro\n(NSHV)", "Notstrom und\nBatterieraum", "Lüftung\nGarage"]
    for (x, w), name in zip(_A_NORD, namen):
        z.raum(x, 200, w, 440, name, z.TECH)
        z.tuer(x + w / 2, 640, 76, True, -1)
    _a_kerne(z)
    z.linie(2250, 900, 2250, 1100, z.WEISS, 12)
    z.linie(2250, 900, 2250, 1100, z.GRAU, 4, "18 10")
    z.schrift(2150, 870, "Ein- und\nAusfahrt", 20)
    return z.svg()


def haus_a_dach() -> bytes:
    z = Zeichnung("Haus A", "Dach")
    z.raum(150, 200, 2100, 1000, "", "#eef1f4")
    z.t.append('<rect x="185" y="235" width="2030" height="930" fill="none" stroke="#8a93a0" stroke-width="3" stroke-dasharray="14 10"/>')
    z.schrift(1200, 268, "Attika mit Fangleitung (Blitzschutz)", 20)
    z.geraet(440, 340, 320, 180, "RLT-Gerät Büro")
    z.geraet(1130, 350, 240, 160, "\nKaltwassersatz")
    z.geraet(1400, 350, 180, 160, "\nRückkühler")
    for x in (750, 1650):                                             # Treppenhausköpfe und Aufzugsüberfahrten
        z.geraet(x + 30, 370, 120, 100, "", "#d9ecf7")              # Lichtkuppel, das Symbol sitzt im Programm genau darauf
        z.geraet(x + 180, 440, 120, 200, "Aufzug\nÜberfahrt", z.KERN)
    z.geraet(880, 720, 300, 150, "Dachausstieg\nund Technik")
    for reihe in range(3):                                            # PV-Feld
        for feld in range(9):
            z.t.append(f'<rect x="{900 + feld * 104}" y="{900 + reihe * 86}" width="96" height="74" fill="#27407a" stroke="#c9d3e6" stroke-width="2"/>')
    z.schrift(1368, 880, "Photovoltaik-Feld", 22)
    for x, y in ((230, 280), (2170, 280), (230, 1120), (2170, 1120), (1200, 1150)):
        z.kreis(x, y, 12, "#ffffff", "#2f3640", 3)                    # Dachabläufe
    for x in range(400, 2100, 340):
        z.kreis(x, 620, 7, "#e63713")                                 # Anschlagpunkte
    z.schrift(400, 660, "Anschlagpunkte", 18)
    return z.svg()


def haus_b_halle() -> bytes:
    z = Zeichnung("Haus B", "EG", "Teil a: Halle")
    z.raum(200, 220, 2000, 960, "", "#f8f9fb")
    z.schrift(1000, 980, "Halle (Lager und Kommissionierung)", 30)
    for y in (400, 540, 680, 820):                                    # Regalreihen
        z.geraet(400, y, 1100, 50, "", "#e6dccb")
    z.schrift(950, 370, "Palettenregale", 20)
    z.raum(1850, 220, 350, 300, "Gefahrstoff-\nlager", z.TECH, 22)
    z.tuer(2025, 520, 76, True, 1)
    z.tor(700, 1180, 220, "Tor 1")
    z.tor(1300, 1180, 220, "Tor 2")
    z.tuer(200, 520, 76, False, 1)
    z.tuer(2200, 900, 76, False, -1)
    z.schrift(1000, 1262, "Ladezone", 24)
    z.linie(2200, 600, 2200, 760, z.WEISS, 10)
    z.schrift(2262, 680, "zu\nTeil b", 18)
    return z.svg()


def _haus_b_buero(z: Zeichnung, oben: list[str], unten: list[tuple[int, int, str]], technik: str) -> bytes:
    z.raum(500, 650, 1400, 120, "", z.FLUR)
    z.schrift(1200, 710, "Flur", 24)
    for (x, w), name in zip(((500, 350), (850, 350)), oben):
        z.raum(x, 250, w, 400, name)
        z.tuer(x + w / 2, 650, 76, True, -1)
    z.treppe(1200, 250, 250, 400)
    z.tuer(1325, 650, 76, True, 1)
    z.aufzug(1450, 250, 200, 400, "Lastenaufzug")
    z.tuer(1550, 650, 90, True, 1)
    z.raum(1650, 250, 250, 400, technik, z.TECH, 22)
    z.tuer(1775, 650, 76, True, -1)
    for x, w, name in unten:
        z.raum(x, 770, w, 380, name)
        z.tuer(x + w / 2, 770, 76, True, 1)
    return z.svg()


def haus_b_buero() -> bytes:
    z = Zeichnung("Haus B", "EG", "Teil b: Büro und Sozialräume")
    z.linie(500, 660, 500, 760, z.WEISS, 10)
    aus = _haus_b_buero(z, ["Meisterbüro", "Büro"], [(500, 300, "Umkleide\nDamen"), (800, 300, "Umkleide\nHerren"),
                                                      (1100, 250, "WC"), (1350, 550, "Pausenraum")], "Elektro\nHalle")
    return aus


def haus_b_og() -> bytes:
    z = Zeichnung("Haus B", "1. OG")
    return _haus_b_buero(z, ["Büro 1", "Büro 2"], [(500, 450, "Besprechung"), (950, 400, "Archiv"), (1350, 250, "Teeküche"),
                                                   (1600, 300, "Büro 3")], "Lüftungs-\nzentrale")


def lageplan() -> bytes:
    z = Zeichnung("Außenanlagen", "Lageplan")
    z.raum(100, 180, 2200, 1040, "", "#eef5ea", 26, 4)
    z.raum(300, 680, 1900, 100, "", "#dcdde2", 26, 2)
    z.schrift(1250, 730, "Umfahrt und Feuerwehrzufahrt", 22)
    z.raum(1500, 780, 150, 440, "", "#dcdde2", 26, 2)
    z.schrift(1575, 1265, "Zufahrt Musterallee", 24)
    z.raum(300, 280, 900, 340, "Haus A\nBüro", "#dfe3ea", 34)
    z.raum(1450, 300, 700, 330, "Haus B\nHalle", "#dfe3ea", 34)
    z.raum(300, 820, 1000, 340, "", "#e9eaee", 26, 3)
    for x in range(380, 1300, 80):
        z.linie(x, 820, x, 940, "#9aa3b0", 3)
        z.linie(x, 1040, x, 1160, "#9aa3b0", 3)
    z.schrift(800, 990, "Parkplatz (42 Stellplätze)", 26)
    z.raum(1750, 830, 480, 350, "", z.GRUEN, 26, 2)
    z.schrift(1990, 1130, "Grünfläche", 24)
    for x, y in ((1830, 900), (2100, 880), (2170, 1060), (1820, 1100), (200, 400), (200, 560), (1300, 240)):
        z.kreis(x, y, 34, "#9cc68d", "#5f9950", 3)
    z.raum(1340, 800, 120, 110, "Müll", "#d2d5db", 20, 3)
    z.t.append('<rect x="130" y="210" width="2140" height="980" fill="none" stroke="#8a93a0" stroke-width="3" stroke-dasharray="6 12"/>')
    z.schrift(2190, 250, "Zaun", 18)
    return z.svg()
