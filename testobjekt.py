"""Testobjekt: ein zusätzliches, vollständig gefülltes Objekt zum Ausprobieren aller Bereiche des Programms.

- Alles ist frei erfunden: Anschrift, Firmen, Namen, Beträge und Termine. Firmen tragen den Zusatz „(Test)“,
  Nummern den Baustein „TEST“. E-Mail-Adressen enden auf „.example“ und sind nicht zustellbar.
  Die Inventarnummern der Anlagen vergibt das Programm selbst, wie bei jedem Objekt: TEST-201-00001 und so weiter.
- Das Testobjekt steht neben den echten Objekten. An bestehenden Einträgen wird nichts geändert.
- Die Daten hängen am heutigen Tag: Es gibt Überfälliges, bald Fälliges und Erledigtes aus den letzten zwei Jahren,
  damit jeder Berichtszeitraum gefüllt ist.
- Es gehen keine Mails raus: Schlüsselübergaben sind ohne Quittung und ohne Erinnerung angelegt, die Hinweise in der
  Glocke gelten als schon verschickt.
- Entfernen löscht nur, was zum Testobjekt gehört. Hängen Einträge anderer Objekte daran, wird nichts gelöscht.
- Die laufenden Nummern für Meldungen, Schlüsselprotokolle und Winterdienst gehen nach dem Entfernen dort weiter, wo sie
  vorher standen, solange in der Zwischenzeit keine echten Einträge dazugekommen sind.

Aufruf aus app.py: status(con), anlegen(app, con, benutzer), entfernen(app, con, benutzer). „app“ ist das Hauptprogramm.
"""
from __future__ import annotations

import datetime as dt
import json
import random
import re
import secrets

import katalog_daten
import testobjekt_zeichnen as zeichnen

MERKER = "testobjekt"                      # Schlüssel in der Tabelle einstellungen
NUMMERN = ("tickets", "schluessel_uebergaben", "winterdienst")   # aus deren laufender Zählung bildet das Programm Nummern (S-…, SÜ-…, WD-…)
NAME = "Testobjekt Musterpark"
ZUSATZ = " (Test)"                         # steht hinter jedem Firmennamen, den das Testobjekt anlegt
HINWEIS = "Testobjekt: Alle Angaben sind frei erfunden und dienen nur zum Ausprobieren."
KAT = {k["name"]: k for k in katalog_daten.KATEGORIEN}
BEREICH = {"Brandschutz": "Brandschutz", "Flucht und Rettung": "Flucht & Rettung", "Aufzug": "Fördertechnik",
           "Heizung": "Heizung & Sanitär", "Sanitär": "Heizung & Sanitär", "Lüftung/Klima": "Klima, Kälte & Lüftung (RLT)",
           "Kälte": "Klima, Kälte & Lüftung (RLT)", "Elektro": "Elektro & Beleuchtung", "Sicherheitstechnik": "Sicherheitstechnik",
           "Gebäudeautomation": "Gebäudeautomation", "Dach/Fassade": "Gebäudehülle", "Außenanlagen": "Außenanlagen"}
PFLICHT = {"Aufzug": (1, 1), "Feuerlöscher": (1, 0), "Hydrant": (1, 0), "Brandschutztür": (1, 0), "Brandmeldezentrale": (1, 1), "RWA": (1, 1),
           "Sicherheitsbeleuchtung": (1, 1), "Elektro": (1, 0), "Tor": (1, 0), "Regale": (1, 0), "Lüftung": (0, 1), "Heizung": (0, 1),
           "Kälte": (1, 1), "Feststellanlage": (1, 0), "Gefahrstoffe": (1, 0), "Brandschutzklappe": (1, 1), "Löschanlage": (1, 1),
           "Gaswarnanlage": (1, 1), "Blitzschutz": (1, 0), "Tür ohne Brandschutz": (1, 1), "Brandschutztor": (1, 0)}
KAT_FRUEHER = {"Brandschutztür": "Tür"}      # so hieß die Kategorie, bevor Türen ohne Brandschutz eine eigene Reihe bekamen
FIRMA_FUER = {"Aufzug": "auf", "Brandschutz": "bs", "Flucht und Rettung": "bs", "Heizung": "ht", "Sanitär": "ht", "Elektro": "el",
              "Lüftung/Klima": "kl", "Kälte": "kl", "Türen/Tore": "tor", "Außenanlagen": "wd"}
TAETIGKEITEN = {
    "Wartung": "Sichtprüfung\nFunktionsprüfung\nVerschleißteile geprüft\nProtokoll abgelegt",
    "Prüfung": "Prüfung nach Vorgabe\nPrüfplakette angebracht\nPrüfbericht abgelegt",
    "SV-Prüfung": "Prüfung durch Sachverständige\nPrüfbericht erhalten und abgelegt\nMängel aus dem Bericht erfasst",
    "Inspektion": "Zustand aufgenommen\nMesswerte dokumentiert\nBericht abgelegt",
    "Begehung": "Begehung durchgeführt\nAuffälligkeiten fotografiert\nProtokoll abgelegt",
}
PERSONEN = [("Max Mustermann", "auf"), ("Erika Musterfrau", "bs"), ("Hans Beispiel", "ht"), ("Petra Probe", "rein"),
            ("Karl Vorlage", "el"), ("Sabine Platzhalter", "sv"), ("Jonas Entwurf", None), ("Lena Muster", "kl"), ("Tom Beispiel", "wd")]
WINTER = [1.9, 1.7, 1.4, 0.9, 0.5, 0.25, 0.2, 0.2, 0.45, 0.9, 1.4, 1.8]
SOMMER = [0.15, 0.3, 0.7, 1.1, 1.5, 1.8, 1.9, 1.7, 1.2, 0.6, 0.25, 0.12]
WASSER = [0.9, 0.9, 0.95, 1.0, 1.1, 1.2, 1.25, 1.2, 1.05, 0.95, 0.9, 0.9]


def _geld(betrag: float) -> str:
    return f"{betrag:,.2f} €".replace(",", "X").replace(".", ",").replace("X", ".")


def _de(iso: str) -> str:
    return dt.date.fromisoformat(iso[:10]).strftime("%d.%m.%Y")


def _dateiname(text: str) -> str:
    return re.sub(r"[^\w.\- äöüÄÖÜß]", "_", text)[:150]


# ---------------------------------------------------------------------------
# Stand und Zahlen
# ---------------------------------------------------------------------------
ZAEHLEN = [("anlagen", "Anlagen"), ("plaene", "Pläne"), ("wartungen", "Wartungen und Prüfungen"), ("tickets", "Mängel und Störungen"),
           ("checklisten", "Rundgänge und Checklisten"), ("checklisten_durchgaenge", "Durchgänge"), ("sv_maengel", "SV-Mängel"),
           ("zaehler", "Zähler"), ("vertraege", "Verträge"), ("schluessel", "Schlüssel und Transponder"),
           ("schluessel_uebergaben", "Schlüsselübergaben"), ("winterdienst", "Winterdienst-Einsätze"), ("vorgaenge", "Vorgänge"),
           ("dokumente", "Dokumente")]


def _merker(con) -> dict:
    r = con.execute("SELECT wert FROM main.einstellungen WHERE schluessel=?", (MERKER,)).fetchone()
    try:
        d = json.loads(r[0]) if r and r[0] else {}
    except ValueError:
        d = {}
    return d if isinstance(d, dict) else {}


def status(con) -> dict:
    """Gibt es das Testobjekt, und was steckt drin? Liest immer die echten Tabellen, nie eine gefilterte Sicht."""
    m = _merker(con)
    o = con.execute("SELECT id, kuerzel, name FROM main.objekte WHERE id=?", (m.get("objekt_id"),)).fetchone() if m.get("objekt_id") else None
    if not o:
        return {"vorhanden": False}
    zahlen = [{"name": text, "anzahl": con.execute(f'SELECT COUNT(*) FROM main."{tab}" WHERE objekt_id=?', (o["id"],)).fetchone()[0]}
              for tab, text in ZAEHLEN]
    return {"vorhanden": True, "objekt_id": o["id"], "kuerzel": o["kuerzel"], "name": o["name"], "angelegt": m.get("angelegt"),
            "von": m.get("von"), "zahlen": zahlen}


# ---------------------------------------------------------------------------
# Anlegen
# ---------------------------------------------------------------------------
def anlegen(app, con, benutzer) -> dict:
    if status(con)["vorhanden"]:
        raise app.Fehler(409, "Das Testobjekt gibt es schon. Wähle es oben links bei „Objekt“ aus.")
    dateien: list = []                      # geschriebene Dateien; geht etwas schief, werden sie wieder gelöscht
    try:
        _Bau(app, con, benutzer, dateien).alles()
    except Exception:
        for p in dateien:
            try:
                p.unlink()
            except OSError:
                pass
        raise
    return status(con)


class _Bau:
    def __init__(self, app, con, benutzer, dateien: list):
        self.app, self.con, self.b, self.dateien = app, con, benutzer, dateien
        self.h = app.heute()
        self.rnd = random.Random(20261116)   # fester Startwert: Das Testobjekt sieht bei jedem Anlegen gleich aus
        self.oid = 0
        self.kuerzel = "TEST"
        self.dl: dict[str, int] = {}
        self.firma: dict[str, str] = {}
        self.mensch: dict[str, str] = {}
        self.plan: dict[str, tuple] = {}     # Schlüssel -> (id, Gebäude, Etage)
        self.anl: dict[str, int] = {}
        self.bez: dict[str, str] = {}
        self.fl: list[str] = []              # Schlüssel aller Feuerlöscher, Wandhydranten, Brandschutztüren
        self.wh: list[str] = []
        self.bst: list[str] = []
        self.sv_anlagen: list[str] = []
        self.wart: dict[tuple, int] = {}     # (Anlage, Art) -> id der Wartungsaufgabe
        self.tick: dict[str, int] = {}
        self.vg: dict[str, int] = {}
        self.dok: dict[str, int] = {}
        self.offen_pruefen: list[tuple] = [] # (Checkliste, Durchgang, Titel, Art)
        self.sig = [zeichnen.unterschrift(0), zeichnen.unterschrift(1)]
        self.foto_schluessel = [zeichnen.bild_schluessel(i) for i in range(4)]
        self.foto_winter = [zeichnen.bild_winter(False), zeichnen.bild_winter(True)]
        self.ticket_nr = 0

    # --- Hilfen ----------------------------------------------------------
    def tag(self, n: float) -> str:
        return (self.h + dt.timedelta(days=int(n))).isoformat()

    def zeit(self, n: float, uhr: str = "08:00") -> str:
        return f"{self.tag(n)}T{uhr}:00"

    def ein(self, tabelle: str, _zeit: str | None = None, **felder) -> int:
        rid = self.app.einfuegen(self.con, tabelle, felder)
        if _zeit:
            self.con.execute(f'UPDATE "{tabelle}" SET erstellt=?, geaendert=? WHERE id=?', (_zeit, _zeit, rid))
        return rid

    def datei(self, ordner, name: str, inhalt: bytes) -> None:
        pfad = ordner / name
        pfad.write_bytes(inhalt)
        self.dateien.append(pfad)

    def alles(self) -> None:
        zaehlung = {t: (self.con.execute("SELECT seq FROM sqlite_sequence WHERE name=?", (t,)).fetchone() or [0])[0] for t in NUMMERN}
        for schritt in (self.stamm, self.plaene, self.anlagen, self.wartungen, self.tickets, self.sv, self.rundgaenge,
                        self.zaehler, self.vertraege, self.schluessel, self.winterdienst, self.vorgaenge, self.dokumente, self.hinweise):
            schritt()
        merk = {"objekt_id": self.oid, "kuerzel": self.kuerzel, "dienstleister": sorted(self.dl.values()),
                "angelegt": self.app.jetzt(), "von": self.b["name"], "zaehlung": zaehlung}
        self.con.execute("INSERT OR REPLACE INTO einstellungen VALUES (?, ?)", (MERKER, json.dumps(merk, ensure_ascii=False)))
        self.app.protokollieren(self.con, self.b, "Testobjekt angelegt", "objekte", self.oid, f"{self.kuerzel} {NAME}")

    # --- Objekt und Firmen -----------------------------------------------
    def stamm(self) -> None:
        con = self.con
        da = {str(r[0] or "").strip().upper() for r in con.execute("SELECT kuerzel FROM objekte")}
        self.kuerzel = next(k for k in ["TEST"] + [f"TEST {i}" for i in range(2, 500)] if k not in da)
        self.oid = self.ein("objekte", kuerzel=self.kuerzel, name=NAME, strasse="Musterallee 1–3", plz="00000", ort="Musterstadt",
                            nutzung="Gemischt", flaeche_m2=9850, baujahr=2012, eigentuemer="Muster Immobilien GmbH" + ZUSATZ,
                            objektleiter="Objektleitung Test", objektleiter_id=self.b["id"],
                            notiz=HINWEIS + " Entfernen unter Einstellungen › Testobjekt.")
        bild = f"{self.oid:05d}_{secrets.token_hex(6)}.png"
        self.datei(self.app.OBJ_PFAD, bild, zeichnen.bild_objekt())
        con.execute("UPDATE objekte SET bild=? WHERE id=?", (bild, self.oid))
        for schl, firma, gewerk, person, nr, adresse, notdienst in [
            ("auf", "Muster Aufzugsdienst GmbH", "Aufzug", "Herr Muster", "11", "muster-aufzugsdienst", True),
            ("bs", "Beispiel Brandschutz KG", "Brandschutz", "Frau Beispiel", "12", "beispiel-brandschutz", False),
            ("ht", "Probe Haustechnik GmbH", "Heizung", "Herr Probe", "13", "probe-haustechnik", True),
            ("el", "Muster Elektrotechnik GmbH", "Elektro", "Frau Vorlage", "14", "muster-elektrotechnik", True),
            ("kl", "Beispiel Klima und Kälte GmbH", "Lüftung/Klima", "Herr Platzhalter", "15", "beispiel-klima", False),
            ("tor", "Muster Tor- und Türtechnik", "Türen/Tore", "Frau Probe", "16", "muster-tortechnik", False),
            ("wd", "Beispiel Grünpflege und Winterdienst", "Außenanlagen", "Herr Entwurf", "17", "beispiel-gruenpflege", False),
            ("rein", "Muster Gebäudereinigung", "Reinigung", "Frau Muster", "18", "muster-reinigung", False),
            ("sv", "Prüfstelle Muster", "Sonstiges", "Herr Beispiel", "19", "pruefstelle-muster", False),
        ]:
            self.firma[schl], self.mensch[schl] = firma + ZUSATZ, person
            self.dl[schl] = self.ein("dienstleister", firma=firma + ZUSATZ, gewerk=gewerk, ansprechpartner=person,
                                     telefon=f"0000 000000-{nr}", notdienst="0000 000000-99" if notdienst else None,
                                     email=f"service@{adresse}.example", anschrift="Musterweg 1\n00000 Musterstadt", notiz=HINWEIS)

    # --- Grundrisse ------------------------------------------------------
    def plaene(self) -> None:
        z = zeichnen
        buero = lambda nr: ([f"Büro {nr}.01", f"Büro {nr}.02", f"Büro {nr}.03", "Besprechung", f"Büro {nr}.04"],  # noqa: E731
                            [f"Büro {nr}.05", f"Büro {nr}.06", "WC", "Teeküche", "Technik", "Großraumbüro", f"Büro {nr}.07"])
        o1 = buero(1)
        o1[1][4] = "Serverraum"
        o3 = buero(3)
        o3[0][3], o3[1][5] = "Konferenz", "Geschäftsleitung"
        for schl, titel, gebaeude, etage, notiz, bild in [
            ("a_ug", "Haus A 1. UG", "Haus A", "1. UG", "Tiefgarage und Technikzentralen", z.haus_a_keller()),
            ("a_eg", "Haus A EG", "Haus A", "EG", "Foyer, Konferenz und Kantine",
             z.haus_a("EG", ["Konferenz 1", "Konferenz 2", "Foyer", "", "Sicherheits-\nzentrale"],
                      ["Kantine", "Küche", "WC", "Poststelle", "Technik", "Schulungsraum", "Lager"], foyer=True)),
            ("a_o1", "Haus A 1. OG", "Haus A", "1. OG", "Büros und Serverraum", z.haus_a("1. OG", *o1)),
            ("a_o2", "Haus A 2. OG", "Haus A", "2. OG", "Büros", z.haus_a("2. OG", *buero(2))),
            ("a_o3", "Haus A 3. OG", "Haus A", "3. OG", "Büros und Geschäftsleitung", z.haus_a("3. OG", *o3)),
            ("a_da", "Haus A Dach", "Haus A", "Dach", "Technik auf dem Dach", z.haus_a_dach()),
            ("b_ha", "Haus B EG Teil a", "Haus B", "EG", "Halle", z.haus_b_halle()),
            ("b_bu", "Haus B EG Teil b", "Haus B", "EG", "Büro und Sozialräume", z.haus_b_buero()),
            ("b_og", "Haus B 1. OG", "Haus B", "1. OG", "Büros und Lüftungszentrale", z.haus_b_og()),
            ("au", "Lageplan Außenanlagen", "Außenanlagen", "EG", "Parkplatz, Zufahrt und Grünflächen", z.lageplan()),
        ]:
            breite, hoehe = self.app.svg_pruefen(bild)
            pid = self.ein("plaene", objekt_id=self.oid, titel=titel, gebaeude=gebaeude, etage=etage,
                           notiz=f"{notiz}. Beispielgrundriss, frei erfunden.", dateiname=_dateiname(titel) + ".svg",
                           breite=breite, hoehe=hoehe)
            pfad = f"{pid:06d}_{secrets.token_hex(6)}.svg"
            self.datei(self.app.PLAN_PFAD, pfad, bild)
            self.con.execute("UPDATE plaene SET pfad=? WHERE id=?", (pfad, pid))
            self.plan[schl] = (pid, gebaeude, "" if schl == "au" else etage)

    # --- Anlagen ---------------------------------------------------------
    def anlagen(self) -> None:
        con, A = self.con, []

        def a(schl, name, kat=None, plan=None, x=0, y=0, raum="", gruppe=None, typ=None, **extra):
            A.append(dict(schl=schl, name=name, kat=kat, plan=plan, x=x, y=y, raum=raum, gruppe=gruppe, typ=typ, **extra))
        pulver = {"Löschmittel": "ABC-Pulver", "Füllmenge": "6 kg", "Löschmitteleinheiten (LE)": 10}
        schaum = {"Löschmittel": "Schaum", "Füllmenge": "6 l", "Löschmitteleinheiten (LE)": 9}
        t30 = {"Brandschutztür": True, "Rauchschutztür": True, "Fluchtwegtür": True, "Feuerwiderstand": "T30", "Flügel": "1-flügelig",
               "Feststellanlage": False}
        melder = {"Meldertyp": "Handfeuermelder"}
        brand = ("Brandschutztechnische Geräte und Anlagen", 0)

        def loescher(schl, name, plan, x, y, raum, inhalt=pulver, **extra):
            self.fl.append(schl)
            a(schl, name, "Feuerlöscher", plan, x, y, raum, "GLORIA", "Schaum 6 l" if inhalt is schaum else "ABC-Pulver 6 kg",
              zeichen="F001 Feuerlöscher", details=inhalt, **extra)

        # Haus A: je Etage dieselbe Grundausstattung im Flur und in den Treppenhäusern
        for gruppe, (plan, etage) in enumerate((("a_ug", "1. UG"), ("a_eg", "EG"), ("a_o1", "1. OG"), ("a_o2", "2. OG"), ("a_o3", "3. OG")), 1):
            k, flur = plan[2:], "Tiefgarage" if plan == "a_ug" else "Flur"
            loescher(f"fl_{k}_n", f"Feuerlöscher {etage} Nord", plan, 690, 700, f"{flur} bei Treppenhaus Nord", schaum if plan == "a_ug" else pulver)
            loescher(f"fl_{k}_s", f"Feuerlöscher {etage} Süd", plan, 1590, 700, f"{flur} bei Treppenhaus Süd", schaum if plan == "a_ug" else pulver)
            self.wh.append(f"wh_{k}")
            a(f"wh_{k}", f"Wandhydrant {etage}", "Hydrant", plan, 1110, 672, flur, "Hawle", "Wandhydrant Typ F",
              zeichen="F002 Löschschlauch (Wandhydrant)", details={"Schlauchlänge (m)": 30})
            a(f"hfm_{k}", f"Handfeuermelder {etage}", "Meldetechnik", plan, 1290, 672, flur, "Hekatron", "Handfeuermelder",
              zeichen="F005 Brandmelder (Handfeuermelder)", details={**melder, "Meldergruppe / Nr.": f"{gruppe}/1"})
            for seite, x, richtung in (("Nord", 840, "E001 Notausgang links"), ("Süd", 1740, "E002 Notausgang rechts")):
                self.bst.append(f"bst_{k}_{seite[0].lower()}")
                a(f"bst_{k}_{seite[0].lower()}", f"Brandschutztür {etage} Treppenhaus {seite}", "Brandschutztür", plan, x, 642, f"Treppenhaus {seite}",
                  "Teckentrup", "T 30-1-FSA-62", details=t30)
                a(f"rz_{k}_{seite[0].lower()}", f"Rettungszeichenleuchte {etage} Treppenhaus {seite}", "Flucht & Rettung", plan, x, 560,
                  f"Treppenhaus {seite}", "Allgemein", "Rettungszeichenleuchte", zeichen=richtung)

        # Haus A, 1. UG: Technikzentralen und Tiefgarage
        a("kessel1", "Gas-Brennwertkessel 1", "Heizung", "a_ug", 230, 340, "Heizzentrale", "Viessmann", "Gas-Brennwertkessel",
          details={"Leistung (kW)": 285}, sn=True, text="Grundlast für Haus A und Haus B, Baujahr des Brenners 2019.")
        a("kessel2", "Gas-Brennwertkessel 2", "Heizung", "a_ug", 370, 340, "Heizzentrale", "Viessmann", "Gas-Brennwertkessel",
          details={"Leistung (kW)": 285}, sn=True, baujahr=2019)
        a("wws", "Warmwasserspeicher 1000 l", "Sanitär", "a_ug", 300, 520, "Heizzentrale", sn=True)
        a("dea", "Druckerhöhungsanlage", "Sanitär", "a_ug", 530, 340, "Sanitärzentrale", "Wilo", "Druckerhöhungsanlage",
          details={"Nennweite": "DN 50"}, sn=True)
        a("sprinkler", "Sprinklerzentrale Tiefgarage", "Löschanlage", "a_ug", 670, 340, "Sprinklerzentrale", "Minimax", "Sprinklerzentrale",
          details={"Art": "Sprinkleranlage nass", "Schutzbereich": "Tiefgarage"}, sv=("Sprinkleranlage", *brand), sn=True,
          text="Nassanlage für die Tiefgarage mit 86 Sprinklern.")
        a("hebe", "Hebeanlage Schmutzwasser", "Sanitär", "a_ug", 600, 520, "Sanitärzentrale", "Kessel", "Hebeanlage",
          details={"Nennweite": "DN 100"}, sn=True)
        a("nshv", "Niederspannungshauptverteilung", "Elektro", "a_ug", 1130, 340, "Elektro (NSHV)", "Hager", "Hauptverteilung",
          details={"Absicherung (A)": 1000}, sv=("Elektrische Anlage", "Elektrotechnik", 0), sn=True)
        a("ddc", "DDC-Schaltschrank Heizung und Lüftung", "Gebäudeautomation", "a_ug", 1270, 340, "Elektro (NSHV)", "Siemens", "DDC-Schaltschrank")
        a("nea", "Notstromaggregat", "Elektro", "a_ug", 1500, 340, "Notstrom und Batterieraum", "ABB", "Notstromaggregat",
          sv=("Sicherheitsstromversorgung / Notstrom", "Elektrotechnik", 0), sn=True, pflicht=(1, 1))
        a("zb", "Zentralbatterieanlage Sicherheitsbeleuchtung", "Sicherheitsbeleuchtung", "a_ug", 1500, 520, "Notstrom und Batterieraum",
          "CEAG", "Zentralbatterieanlage", sv=("Sicherheitsbeleuchtung", "Elektrotechnik", 0), sn=True)
        a("gab", "Garagenabluft", "Lüftung", "a_ug", 2100, 340, "Lüftung Garage", "Systemair", "Garagenabluft",
          details={"Luftmenge (m³/h)": 24000}, sv=("Lüftungsanlage", "Raumlufttechnik", 0), sn=True)
        a("co", "CO-Warnanlage Tiefgarage", "Gaswarnanlage", "a_ug", 2100, 520, "Lüftung Garage", "MSR-Electronic", "CO-Warnanlage",
          details={"Art": "CO-Warnanlage", "Gas": "Kohlenmonoxid", "Anzahl Sensoren": 8}, sv=("CO-Warnanlage", "Raumlufttechnik", 0), sn=True)
        a("rolltor", "Rolltor Tiefgarage", "Tor", "a_ug", 2250, 1000, "Ein- und Ausfahrt", "Hörmann", "Rolltor", sn=True)

        # Haus A, EG: Foyer mit Brandmeldezentrale, Aufzüge, Sicherheit
        a("bmz", "Brandmeldezentrale", "Brandmeldezentrale", "a_eg", 1110, 330, "Foyer", "Hekatron", "Brandmeldezentrale",
          zeichen="BMZ Brandmeldezentrale", details={"Aufschaltung Feuerwehr": True, "Feuerwehr-Bedienfeld": True, "Schlüsseldepot": True},
          sv=("Brandmelde- und Alarmierungsanlage", *brand), sn=True, text="Aufgeschaltet auf die Leitstelle, 14 Meldergruppen.")
        a("fbf", "Feuerwehr-Bedienfeld", "Brandmeldezentrale", "a_eg", 1110, 430, "Foyer", "Hekatron", "Feuerwehr-Bedienfeld",
          zeichen="FBF Feuerwehr-Bedienfeld")
        a("fat", "Feuerwehr-Anzeigetableau", "Brandmeldezentrale", "a_eg", 1250, 250, "Foyer, Haupteingang", "Hekatron",
          "Feuerwehr-Anzeigetableau", zeichen="FAT Feuerwehr-Anzeigetableau")
        a("fsd", "Feuerwehr-Schlüsseldepot", "Brandmeldezentrale", "a_eg", 1560, 150, "außen am Haupteingang", "Hekatron",
          "Feuerwehr-Schlüsseldepot", zeichen="FSD Feuerwehr-Schlüsseldepot")
        a("autotuer", "Automatische Schiebetür Haupteingang", "Tür ohne Brandschutz", "a_eg", 1350, 222, "Haupteingang", "GEZE",
          "Automatische Schiebetür", sn=True, details={"Art": "Automatische Schiebetür", "Antrieb": True, "Fluchtwegtür": True})
        a("zk", "Zutrittskontrolle Haupteingang", "Sicherungstechnik", "a_eg", 1470, 250, "Haupteingang", "dormakaba", "Zutrittskontrolle")
        a("defi", "Defibrillator Foyer", "Defibrillator", "a_eg", 1590, 330, "Foyer", "Philips", "HeartStart FRx",
          zeichen="E010 Defibrillator (AED)", details={"Elektroden bis": self.tag(410), "Akku bis": self.tag(900)})
        a("eh_eg", "Erste-Hilfe-Kasten Empfang", "Erste Hilfe", "a_eg", 1590, 450, "Foyer, Empfang", "Söhngen", "Verbandkasten DIN 13157",
          zeichen="E003 Erste Hilfe", details={"Ablaufdatum": self.tag(300)})
        aufzug = {"Tragfähigkeit (kg)": 1000, "Haltestellen": 5, "Notruf aufgeschaltet": True}
        a("a1", "Personenaufzug A1 (Kern Nord)", "Aufzug", "a_eg", 990, 540, "Kern Nord", "Schindler", "Personenaufzug", details=aufzug,
          sv=("Aufzug", "Förderanlagen", 3), sn=True)
        a("a2", "Personenaufzug A2 (Kern Süd)", "Aufzug", "a_eg", 1890, 540, "Kern Süd", "Schindler", "Personenaufzug", details=aufzug,
          sv=("Aufzug", "Förderanlagen", 3), sn=True, status="Eingeschränkt")
        a("emz", "Einbruchmeldezentrale", "Sicherungstechnik", "a_eg", 2040, 300, "Sicherheitszentrale", "Telenot", "Einbruchmeldezentrale")
        a("leit", "Gebäudeleittechnik (Leitstelle)", "Gebäudeautomation", "a_eg", 2160, 300, "Sicherheitszentrale", "Siemens", "Leitstelle")
        for plan, etage, x, y in (("a_eg", "EG", 1400, 880), ("a_o1", "1. OG", 1450, 1090), ("a_o2", "2. OG", 1400, 880), ("a_o3", "3. OG", 1400, 880)):
            a(f"uv_{plan[2:]}", f"Unterverteilung {etage}", "Elektro", plan, x, y, "Serverraum" if plan == "a_o1" else "Technik", "Hager", "Unterverteilung",
              details={"Absicherung (A)": 125})

        # Haus A, Obergeschosse
        a("server", "Serverschrank", "IT", "a_o1", 1350, 880, "Serverraum", "Rittal", "Serverschrank")
        a("usv", "USV Serverraum", "Elektro", "a_o1", 1450, 880, "Serverraum", "ABB", "USV", sn=True, baujahr=2020)
        a("split", "Split-Klimagerät Serverraum", "Klima", "a_o1", 1350, 1090, "Serverraum", "Daikin", "Split-Klimagerät",
          details={"Kältemittel": "R32", "Füllmenge (kg)": 2.4}, sn=True, baujahr=2021)
        a("eh_o1", "Erste-Hilfe-Kasten Teeküche 1. OG", "Erste Hilfe", "a_o1", 1200, 900, "Teeküche", "Söhngen", "Verbandkasten DIN 13157",
          zeichen="E003 Erste Hilfe", details={"Ablaufdatum": self.tag(120)})
        for seite, x in (("Nord", 990), ("Süd", 1890)):
            a(f"bsk_{seite[0].lower()}", f"Brandschutzklappe 2. OG Schacht {seite}", "Brandschutzklappe", "a_o2", x, 320, f"Schacht {seite}",
              "TROX", "Brandschutzklappe", details={"Art": "Brandschutzklappe", "Auslösung": "Schmelzlot"},
              sv=("Brandschutzklappen (BSK)", "Raumlufttechnik", 0) if seite == "Nord" else None)
        a("rm_o2", "Rauchmelder Flur 2. OG", "Meldetechnik", "a_o2", 1440, 700, "Flur", "Hekatron", "Optischer Rauchmelder",
          details={"Meldertyp": "Rauchmelder", "Meldergruppe / Nr.": "4/7"})
        a("rwaz", "RWA-Zentrale Treppenhaus Nord", "RWA", "a_o3", 840, 330, "Treppenhaus Nord", "D+H", "RWA-Zentrale",
          zeichen="RWA Rauchabzug", sv=("Rauchabzugsanlage (RWA)", *brand), sn=True)
        a("fsa", "Feststellanlage Flurtür 3. OG", "Feststellanlage", "a_o3", 1440, 700, "Flur", "GEZE", "Feststellanlage mit Rauchschalter")

        # Haus A, Dach
        a("rlt", "RLT-Anlage Büro", "Lüftung", "a_da", 480, 385, "Dach", "Wolf GmbH", "Zentrales RLT-Gerät",
          details={"Luftmenge (m³/h)": 18000, "Filterklasse": "ePM1 55 %", "Befeuchtung": False},
          sv=("Raumlufttechnische Anlage (RLT)", "Raumlufttechnik", 0), sn=True,
          text="Zu- und Abluftanlage mit Wärmerückgewinnung für die Büroflächen in Haus A.")
        a("lk_n", "RWA-Lichtkuppel Treppenhaus Nord", "RWA", "a_da", 840, 420, "Dach", "D+H", "RWA-Lichtkuppel", zeichen="RWA Rauchabzug")
        a("lk_s", "RWA-Lichtkuppel Treppenhaus Süd", "RWA", "a_da", 1740, 420, "Dach", "D+H", "RWA-Lichtkuppel", zeichen="RWA Rauchabzug")
        a("kws", "Kaltwassersatz", "Kälte", "a_da", 1166, 384, "Dach", "Carrier", "Kaltwassersatz",
          details={"Kältemittel": "R513A", "Füllmenge (kg)": 38}, sn=True)
        a("rk", "Rückkühler (Verdunstungskühlanlage)", "Kälte", "a_da", 1436, 384, "Dach", "Carrier", "Rückkühler",
          sv=("Verdunstungskühlanlage", "Kältetechnik", 5), sn=True)
        a("blitz", "Blitzschutzanlage", "Blitzschutz", "a_da", 2120, 300, "Dach, Attika", "DEHN", "Äußerer Blitzschutz",
          details={"Schutzklasse": "III", "Art": "Äußerer Blitzschutz"}, sv=("Blitzschutzanlage", "Elektrotechnik", 0))
        a("anschlag", "Anschlagpunkte Dach (Absturzsicherung)", "Dach", "a_da", 570, 620, "Dach", "Allgemein", "Anschlagpunkt", pflicht=(1, 0))
        a("dachfl", "Dachfläche Haus A", "Dach", "a_da", 400, 1000, "Dach", "Allgemein", "Dachfläche")
        a("pv", "PV-Anlage Dach (62 kWp)", "Solar", "a_da", 1368, 1020, "Dach", "SMA", "PV-Anlage", sn=True, baujahr=2024, neu=True)
        a("wr", "Wechselrichter PV", "Solar", "a_da", 2060, 1000, "Dach", "SMA", "Wechselrichter", sn=True, baujahr=2024, neu=True)
        a("dachentw", "Dachentwässerung", "Dach", "a_da", 2170, 1120, "Dach", "Allgemein", "Dachentwässerung")

        # Haus B
        a("tor1", "Sektionaltor 1", "Tor", "b_ha", 700, 1180, "Halle, Ladezone", "Hörmann", "Sektionaltor", sn=True)
        a("tor2", "Sektionaltor 2", "Tor", "b_ha", 1300, 1180, "Halle, Ladezone", "Hörmann", "Sektionaltor", sn=True, status="Außer Betrieb")
        a("reg1", "Palettenregal Reihe 1", "Regale", "b_ha", 650, 425, "Halle", "SSI Schäfer", "Palettenregal")
        a("reg2", "Palettenregal Reihe 2", "Regale", "b_ha", 650, 565, "Halle", "SSI Schäfer", "Palettenregal")
        a("strahler", "Hallenheizung (Dunkelstrahler)", "Heizung", "b_ha", 1000, 300, "Halle", sn=True)
        a("gss", "Gefahrstoffschrank", "Gefahrstoffe", "b_ha", 2025, 462, "Gefahrstofflager", "asecos", "Gefahrstoffschrank")
        loescher("fl_b1", "Feuerlöscher Halle West", "b_ha", 260, 700, "Halle")
        loescher("fl_b2", "Feuerlöscher Halle Tore", "b_ha", 1650, 1120, "Halle, Ladezone")
        loescher("fl_b3", "Feuerlöscher Halle Ost", "b_ha", 2140, 700, "Halle")
        a("hfm_b1", "Handfeuermelder Halle West", "Meldetechnik", "b_ha", 260, 1100, "Halle", "Hekatron", "Handfeuermelder",
          zeichen="F005 Brandmelder (Handfeuermelder)", details={**melder, "Meldergruppe / Nr.": "9/1"})
        a("hfm_b2", "Handfeuermelder Halle Ost", "Meldetechnik", "b_ha", 2140, 1050, "Halle", "Hekatron", "Handfeuermelder",
          zeichen="F005 Brandmelder (Handfeuermelder)", details={**melder, "Meldergruppe / Nr.": "9/2"})
        a("rz_b1", "Rettungszeichenleuchte Halle West", "Flucht & Rettung", "b_ha", 236, 440, "Halle, Notausgang West", "Allgemein",
          "Rettungszeichenleuchte", zeichen="E001 Notausgang links")
        a("rz_b2", "Rettungszeichenleuchte Halle Ost", "Flucht & Rettung", "b_ha", 2164, 980, "Halle, Notausgang Ost", "Allgemein",
          "Rettungszeichenleuchte", zeichen="E002 Notausgang rechts")
        a("eh_b", "Erste-Hilfe-Kasten Halle", "Erste Hilfe", "b_ha", 1900, 1100, "Halle", "Söhngen", "Verbandkasten DIN 13169",
          zeichen="E003 Erste Hilfe", details={"Ablaufdatum": self.tag(560)})
        a("la", "Lastenaufzug Halle", "Aufzug", "b_bu", 1550, 450, "Kern", "Schindler", "Lastenaufzug",
          details={"Tragfähigkeit (kg)": 2500, "Haltestellen": 2, "Notruf aufgeschaltet": True}, sv=("Aufzug", "Förderanlagen", 3), sn=True)
        a("uv_b", "Unterverteilung Halle", "Elektro", "b_bu", 1775, 350, "Elektro Halle", "Hager", "Unterverteilung",
          details={"Absicherung (A)": 250})
        loescher("fl_b4", "Feuerlöscher Haus B Flur EG", "b_bu", 700, 710, "Flur")
        self.bst.append("bst_b")
        a("bst_b", "Brandschutztür Haus B Treppenhaus EG", "Brandschutztür", "b_bu", 1325, 652, "Treppenhaus", "Teckentrup", "T 30-1-FSA-62", details=t30)
        a("augen", "Augenspüleinrichtung", None, "b_bu", 1000, 710, "Flur zur Halle", gewerk="Flucht und Rettung",
          zeichen="E011 Augenspüleinrichtung")
        a("rlt_b", "RLT-Anlage Halle", "Lüftung", "b_og", 1775, 350, "Lüftungszentrale", "Wolf GmbH", "Zentrales RLT-Gerät",
          details={"Luftmenge (m³/h)": 9000, "Filterklasse": "ePM10 50 %", "Befeuchtung": False}, sn=True)
        loescher("fl_b5", "Feuerlöscher Haus B Flur 1. OG", "b_og", 700, 710, "Flur")
        a("rm_b", "Rauchmelder Flur Haus B 1. OG", "Meldetechnik", "b_og", 1000, 710, "Flur", "Hekatron", "Multisensormelder",
          details={"Meldertyp": "Multisensor", "Meldergruppe / Nr.": "10/3"})

        # Außenanlagen
        a("schranke", "Schranke Zufahrt", "Tor", "au", 1575, 1130, "Zufahrt Musterallee", "Hörmann", "Schranke", sn=True)
        a("sammel", "Sammelstelle", "Flucht & Rettung", "au", 1990, 990, "Grünfläche", "Allgemein", "Sammelstelle", zeichen="E007 Sammelstelle")
        a("leuchten", "Außenbeleuchtung Parkplatz", "Außenanlagen", "au", 700, 800, "Parkplatz", "Allgemein", "Außenbeleuchtung")
        a("parkplatz", "Parkplatz (42 Stellplätze)", "Außenanlagen", "au", 1100, 990, "Parkplatz", "Allgemein", "Parkplatz")
        a("baum", "Baumbestand (7 Bäume)", "Außenanlagen", "au", 2100, 880, "Grünfläche", "Allgemein", "Baum")
        a("zaun", "Zaunanlage", "Außenanlagen", "au", 2250, 560, "Grundstücksgrenze", "Allgemein", "Zaun")
        a("cam1", "Videokamera Zufahrt", "Sicherungstechnik", "au", 1690, 1150, "Zufahrt", "ABUS", "Videokamera")
        a("cam2", "Videokamera Haupteingang", "Sicherungstechnik", "au", 760, 262, "Haus A, Haupteingang", "ABUS", "Videokamera")
        a("lade", "E-Ladesäulen (4 Ladepunkte)", None, "au", 360, 800, "Parkplatz", gewerk="Elektro", pflicht=(1, 0), sn=True,
          baujahr=2025, neu=True)
        a("ueberflur", "Überflurhydrant", "Hydrant", "au", 1400, 660, "Umfahrt", "Hawle", "Überflurhydrant",
          details={"Art": "Überflurhydrant"})

        # Noch nicht im Plan: Diese Anlagen stehen in der Plan-Ansicht unter „Noch nicht im Plan“
        loescher("fl_lager", "Feuerlöscher Lager (neu, noch nicht im Plan)", None, 0, 0, "Haus A, EG, Lager", baujahr=2026, neu=True)
        a("enth", "Enthärtungsanlage", "Sanitär", None, 0, 0, "Haus A, 1. UG, Sanitärzentrale", "Grundfos", "Enthärtungsanlage")
        a("fassade", "Fassadenelemente Haus A", "Fenster", None, 0, 0, "Haus A, Fassade", "Schüco", "Fassadenelement")
        a("schliess", "Schließanlage Musterpark", "Sicherungstechnik", None, 0, 0, "Haus A und Haus B", "dormakaba", "Schließanlage")
        a("oeltank", "Öltank (stillgelegt)", None, None, 0, 0, "Haus A, 1. UG", gewerk="Heizung", status="Stillgelegt",
          text="Seit dem Umbau auf Gas im Jahr 2019 außer Betrieb, gereinigt und stillgelegt.")

        kat_id = {r["name"]: r["id"] for r in con.execute("SELECT id, name FROM kat_kategorien")}
        for nr, e in enumerate(A, 1):
            kat = e["kat"]
            kid = (kat_id.get(kat) or kat_id.get(KAT_FRUEHER.get(kat, ""))) if kat else None
            gid = tid = None
            if kid and e["gruppe"]:
                r = con.execute("SELECT id FROM kat_gruppen WHERE kategorie_id=? AND name=?", (kid, e["gruppe"])).fetchone()
                gid = r["id"] if r else None
                if gid and e["typ"]:
                    r = con.execute("SELECT id FROM kat_typen WHERE gruppe_id=? AND name=?", (gid, e["typ"])).fetchone()
                    tid = r["id"] if r else None
            gewerk = e.get("gewerk") or (KAT[kat]["gewerk"] if kat in KAT else "Sonstiges")
            pid, gebaeude, etage = self.plan[e["plan"]] if e["plan"] else (None, "", "")
            standort = ", ".join(x for x in (gebaeude, etage, e["raum"]) if x)
            pruefung, wartung = e.get("pflicht") or PFLICHT.get(kat, (0, 0))
            sv = e.get("sv")
            baujahr = e.get("baujahr") or 2012
            aid = self.ein(
                "anlagen", objekt_id=self.oid, bezeichnung=e["name"], beschreibung=e.get("text"),     # die Inventarnummer vergibt das Programm
                kategorie_id=kid, gruppe_id=gid, typ_id=tid, gruppe=BEREICH.get(gewerk, "Sonstiges"), gewerk=gewerk,
                planzeichen=e.get("zeichen"), standort=standort, hersteller=e["gruppe"] if e["gruppe"] not in (None, "Allgemein") else None,
                typ=e["typ"], seriennummer=f"TST-{baujahr}-{nr:04d}" if e.get("sn") else None, baujahr=baujahr,
                inbetriebnahme=f"{baujahr}-{3 + nr % 9:02d}-{1 + nr % 27:02d}" if e.get("sn") else None,
                garantie_bis=self.tag(240 + nr * 3) if e.get("neu") else None, status=e.get("status") or "In Betrieb",
                manager="Objektleitung Test", dienstleister_id=self.dl.get(FIRMA_FUER.get(gewerk, "")), gps_pflicht=0,
                pruefung_pflicht=pruefung, wartung_pflicht=wartung, sv_relevant=1 if sv else 0, sv_gegenstand=sv[0] if sv else None,
                sv_bereich=sv[1] if sv else None, sv_grundlage=self.app.SV_GRUNDLAGEN[sv[2]] if sv else None,
                details=json.dumps(e["details"], ensure_ascii=False) if e.get("details") else None)
            if pid:
                con.execute("UPDATE anlagen SET plan_id=?, plan_x=?, plan_y=? WHERE id=?", (pid, e["x"] / 2400, e["y"] / 1500, aid))
            self.anl[e["schl"]], self.bez[e["schl"]] = aid, e["name"]
            if sv:
                self.sv_anlagen.append(e["schl"])

    # --- Wartungsplan mit Verlauf ---------------------------------------
    def wartungen(self) -> None:
        W = []      # Anlage, Titel, Art, Grundlage, Intervall in Monaten, Tage bis zur nächsten Fälligkeit, Firma

        def w(anlage, titel, art, grundlage, intervall, bis, firma=None):
            W.append((anlage, titel, art, grundlage, intervall, bis, firma))
        fristen = [220, 310, 15, 400, 265, 180, 350, 290, 120, 240, 330, 150, 380, 205, 275, 95, 60]
        for i, schl in enumerate(self.fl):
            bis = {"fl_o2_s": 12, "fl_b2": -20, "fl_lager": 690}.get(schl, fristen[i % len(fristen)])
            w(schl, f"Prüfung {self.bez[schl]}", "Prüfung", "ASR A2.2, DIN 14406-4", 24, bis, "bs")
        for schl in self.wh:
            w(schl, f"Prüfung {self.bez[schl]}", "Prüfung", "DIN 14462", 12, 355, "bs")
        for schl in self.bst:
            w(schl, f"Prüfung {self.bez[schl]}", "Prüfung", "Zulassung und Herstellerangaben", 12, 9 if schl == "bst_o1_n" else 130, "tor")
        zues, pvo = "BetrSichV §16", "Prüfverordnung des Landes"
        w("a1", "Wartung Personenaufzug A1", "Wartung", "Herstellervorgabe", 3, 24, "auf")
        w("a1", "Wiederkehrende Prüfung Aufzug A1 (ZÜS)", "SV-Prüfung", zues, 12, 200, "sv")
        w("a2", "Wartung Personenaufzug A2", "Wartung", "Herstellervorgabe", 3, -12, "auf")
        w("a2", "Wiederkehrende Prüfung Aufzug A2 (ZÜS)", "SV-Prüfung", zues, 12, 320, "sv")
        w("la", "Wartung Lastenaufzug Halle", "Wartung", "Herstellervorgabe", 3, 60, "auf")
        w("la", "Wiederkehrende Prüfung Lastenaufzug (ZÜS)", "SV-Prüfung", zues, 12, 150, "sv")
        w("bmz", "Wartung Brandmeldeanlage (Quartal)", "Wartung", "DIN 14675, DIN VDE 0833-1", 3, 10, "bs")
        w("bmz", "SV-Prüfung Brandmeldeanlage", "SV-Prüfung", pvo, 36, 990, "sv")
        w("sprinkler", "Wartung Sprinkleranlage", "Wartung", "VdS CEA 4001", 12, 100, "bs")
        w("sprinkler", "SV-Prüfung Sprinkleranlage", "SV-Prüfung", pvo, 12, 80, "sv")
        w("rwaz", "Wartung RWA-Anlage Treppenhäuser", "Wartung", "DIN 18232-2", 12, 200, "bs")
        w("rwaz", "SV-Prüfung RWA-Anlage", "SV-Prüfung", pvo, 36, 330, "sv")
        w("zb", "Wartung Sicherheitsbeleuchtung", "Wartung", "DIN EN 50172", 12, 340, "el")
        w("zb", "SV-Prüfung Sicherheitsbeleuchtung", "SV-Prüfung", pvo, 36, 1035, "sv")
        w("nshv", "E-Prüfung ortsfeste Anlagen", "Prüfung", "DGUV Vorschrift 3", 48, 400, "el")
        w("nshv", "SV-Prüfung elektrische Anlage", "SV-Prüfung", pvo, 36, 250, "sv")
        w("nea", "Wartung Notstromaggregat", "Wartung", "Herstellervorgabe", 12, 28, "el")
        w("nea", "SV-Prüfung Sicherheitsstromversorgung", "SV-Prüfung", pvo, 36, 500, "sv")
        w("blitz", "SV-Prüfung Blitzschutzanlage", "SV-Prüfung", pvo, 48, -30, "sv")
        w("bsk_n", "Funktionsprüfung Brandschutzklappen", "Prüfung", "Zulassung, DIN EN 15650", 12, 170, "kl")
        w("bsk_n", "SV-Prüfung Brandschutzklappen", "SV-Prüfung", pvo, 36, 300, "sv")
        w("gab", "Wartung Garagenabluft", "Wartung", "Herstellervorgabe", 12, 130, "kl")
        w("gab", "SV-Prüfung Garagenlüftung", "SV-Prüfung", pvo, 36, 330, "sv")
        w("co", "Wartung und Kalibrierung CO-Warnanlage", "Wartung", "VDI 2053", 12, -40, "kl")
        w("co", "SV-Prüfung CO-Warnanlage", "SV-Prüfung", pvo, 12, 20, "sv")
        w("rlt", "Wartung RLT-Anlage Büro mit Filterwechsel", "Wartung", "VDMA 24186", 6, 50, "kl")
        w("rlt", "Hygieneinspektion RLT-Anlage Büro", "Inspektion", "VDI 6022", 36, 260, "kl")
        w("rlt", "SV-Prüfung RLT-Anlage Büro", "SV-Prüfung", pvo, 36, 120, "sv")
        w("rlt_b", "Wartung RLT-Anlage Halle", "Wartung", "VDMA 24186", 6, 160, "kl")
        w("kws", "Wartung Kaltwassersatz", "Wartung", "Herstellervorgabe", 12, 95, "kl")
        w("kws", "Dichtheitsprüfung Kältemittelkreis", "Prüfung", "F-Gase-Verordnung", 12, 18, "kl")
        w("rk", "Wartung Rückkühler", "Wartung", "VDI 2047-2", 6, 35, "kl")
        w("rk", "Laboruntersuchung Legionellen Rückkühler", "Prüfung", "42. BImSchV", 3, 70, "kl")
        w("rk", "SV-Prüfung Verdunstungskühlanlage", "SV-Prüfung", "42. BImSchV", 60, 700, "sv")
        w("split", "Wartung Split-Klimagerät Serverraum", "Wartung", "Herstellervorgabe", 12, 160, "kl")
        w("kessel1", "Wartung Gas-Brennwertkessel 1", "Wartung", "Herstellervorgabe", 12, 70, "ht")
        w("kessel1", "Abgasmessung und Feuerstättenschau", "Prüfung", "1. BImSchV", 24, 120)
        w("kessel2", "Wartung Gas-Brennwertkessel 2", "Wartung", "Herstellervorgabe", 12, 70, "ht")
        w("wws", "Legionellenprüfung Trinkwasser", "Prüfung", "Trinkwasserverordnung", 12, 5, "ht")
        w("dea", "Wartung Druckerhöhungsanlage", "Wartung", "DIN 1988", 12, 150, "ht")
        w("hebe", "Wartung Hebeanlage", "Wartung", "DIN EN 12056-4", 6, -5, "ht")
        w("strahler", "Wartung Hallenheizung", "Wartung", "Herstellervorgabe", 12, 45, "ht")
        w("usv", "Wartung USV Serverraum", "Wartung", "Herstellervorgabe", 12, 350, "el")
        w("ddc", "Wartung Gebäudeautomation", "Wartung", "Herstellervorgabe", 12, 180)
        w("pv", "Sichtprüfung und Wartung PV-Anlage", "Wartung", "Herstellervorgabe", 12, 110, "el")
        w("lade", "E-Prüfung Ladesäulen", "Prüfung", "DGUV Vorschrift 3", 12, 105, "el")
        w("tor1", "Prüfung Sektionaltor 1", "Prüfung", "ASR A1.7", 12, 65, "tor")
        w("tor2", "Prüfung Sektionaltor 2", "Prüfung", "ASR A1.7", 12, -25, "tor")
        w("rolltor", "Prüfung Rolltor Tiefgarage", "Prüfung", "ASR A1.7", 12, 345, "tor")
        w("schranke", "Wartung Schranke Zufahrt", "Wartung", "Herstellervorgabe", 12, 200, "tor")
        w("autotuer", "Prüfung automatische Schiebetür", "Prüfung", "ASR A1.7, DIN 18650", 12, 8, "tor")
        w("fsa", "Prüfung Feststellanlage", "Prüfung", "DIN 14677", 12, 85, "tor")
        w("reg1", "Regalprüfung Reihe 1", "Prüfung", "DIN EN 15635", 12, 85)
        w("reg2", "Regalprüfung Reihe 2", "Prüfung", "DIN EN 15635", 12, 85)
        w("gss", "Prüfung Gefahrstoffschrank", "Prüfung", "DIN EN 14470-1", 12, 190)
        w("defi", "Kontrolle Defibrillator", "Inspektion", "Herstellervorgabe", 12, 240)
        w("emz", "Wartung Einbruchmeldeanlage", "Wartung", "DIN VDE 0833-3", 12, 170)
        w("zk", "Wartung Zutrittskontrolle", "Wartung", "Herstellervorgabe", 12, 335)
        w("dachfl", "Dachbegehung Haus A", "Begehung", "Flachdachrichtlinie", 6, 25)
        w("anschlag", "Prüfung Anschlagpunkte Dach", "Prüfung", "DIN EN 795, DGUV Regel 112-198", 12, 300)
        w("dachentw", "Reinigung Dachabläufe", "Wartung", "DIN 1986-3", 6, -3)
        w("baum", "Baumkontrolle", "Begehung", "FLL-Baumkontrollrichtlinie", 12, 55, "wd")
        w("ueberflur", "Prüfung Überflurhydrant", "Prüfung", "DVGW W 331", 12, 210, "bs")
        w(None, "Sicherheitsbegehung Objekt", "Begehung", "Arbeitsschutzgesetz, Gefährdungsbeurteilung", 12, 75)
        w(None, "Prüfung ortsveränderliche Geräte", "Prüfung", "DGUV Vorschrift 3", 24, 310, "el")

        # Einzelne Ergebnisse von Hand: (Anlage, Art, wievielte Erledigung von hinten) -> Ergebnis, Bemerkung
        besonders = {
            ("a2", "Wartung", 0): ("Mängel offen", "Türantrieb im 2. OG schwergängig, Kabine hält nicht bündig. Angebot folgt."),
            ("a2", "SV-Prüfung", 0): ("Mängel offen", "2 Mängel laut SV-Bericht, siehe SV-Mängelplan."),
            ("bmz", "SV-Prüfung", 0): ("Mängel offen", "3 Mängel laut SV-Bericht, siehe SV-Mängelplan."),
            ("zb", "SV-Prüfung", 0): ("Mängel offen", "2 Mängel laut SV-Bericht, siehe SV-Mängelplan."),
            ("la", "SV-Prüfung", 0): ("Mängel offen", "1 Mangel laut SV-Bericht. Die Auswertung ist noch nicht übernommen."),
            ("co", "SV-Prüfung", 0): ("Mängel behoben", "Sensor 3 getauscht und nachgeprüft."),
            ("sprinkler", "SV-Prüfung", 0): ("Mängel behoben", "Beschilderung ergänzt, Nachprüfung ohne Befund."),
            ("nea", "SV-Prüfung", 0): ("Mängel behoben", "Anlaufzeit nachgemessen, im Soll."),
            ("a1", "SV-Prüfung", 0): ("Mängel behoben", "Notlicht im Fahrkorb ersetzt."),
            ("tor2", "Prüfung", 0): ("Mängel offen", "Antrieb defekt, Tor außer Betrieb genommen."),
            ("dachentw", "Wartung", 0): ("Nicht durchgeführt", "Termin wegen Sturmwarnung abgesagt."),
            ("rlt", "Wartung", 1): ("Mängel behoben", "Keilriemen ersetzt."),
            ("kessel1", "Wartung", 0): ("Mängel behoben", "Zündelektrode getauscht."),
        }
        saetze = ["Verschleißteil ersetzt.", "Nachgestellt und geprüft.", "Dichtung erneuert.", "Kleinteile getauscht, Funktion in Ordnung."]
        grenze = self.h - dt.timedelta(days=760)
        for anlage, titel, art, grundlage, intervall, bis, firma in W:
            naechste = self.h + dt.timedelta(days=bis)
            letzte = self.app.plus_monate(naechste, -intervall)
            sv = art == "SV-Prüfung"
            wid = self.ein("wartungen", objekt_id=self.oid, anlage_id=self.anl.get(anlage) if anlage else None, titel=titel, art=art,
                           rechtsgrundlage=grundlage, taetigkeiten=TAETIGKEITEN[art], intervall_monate=intervall,
                           letzte=letzte.isoformat(), naechste=naechste.isoformat(), dienstleister_id=None if sv else self.dl.get(firma or ""),
                           zustaendig="Haustechnik Test", pruefer=self.firma["sv"] if sv else None,
                           pruefnummer=f"PB-TEST-{letzte.year}-{len(self.wart) + 101}" if sv else None, aktiv=1)
            if anlage:
                self.wart[(anlage, art)] = wid
            wer = (f"{self.mensch[firma]}, {self.firma[firma]}" if firma else "Haustechnik Test")
            k, d = 0, letzte
            while k == 0 or (d >= grenze and k < 12):
                ergebnis, bemerkung = besonders.get((anlage, art, k), (None, None))
                if not ergebnis:
                    ergebnis = "Mängel behoben" if self.rnd.random() < 0.1 else "Ohne Mängel"
                    bemerkung = self.rnd.choice(saetze) if ergebnis == "Mängel behoben" else None
                liste = json.dumps([{"text": t, "ok": True} for t in TAETIGKEITEN[art].split("\n")], ensure_ascii=False) if k == 0 else None
                self.con.execute(
                    "INSERT INTO wartung_historie (wartung_id, datum, ergebnis, bemerkung, erfasst_von, checkliste, pruefart) VALUES (?,?,?,?,?,?,?)",
                    (wid, d.isoformat(), ergebnis, bemerkung, wer, liste, "Prüfung" if art in ("Prüfung", "SV-Prüfung") else None))
                k += 1
                d = self.app.plus_monate(letzte, -intervall * k)
        # Termin der Nachprüfung und Frist für die Mängel bei der Sicherheitsbeleuchtung
        self.con.execute("UPDATE wartungen SET nachpruefung=?, maengelfrist=? WHERE id=?", (self.tag(30), self.tag(21), self.wart[("zb", "SV-Prüfung")]))

    # --- Mängel und Störungen -------------------------------------------
    def ticket(self, titel: str, tage: int, *, status: str = "Erledigt", dauer: int | None = 3, anlage: str | None = None,
               anlage_id: int | None = None, art: str = "Störung", prio: str = "Normal", gef: str | None = None, gewerk: str | None = None,
               firma: str | None = None, kosten: float | None = None, von: str = "Empfang", text: str = "", mangel: str | None = None,
               notizen: list | None = None) -> int:
        self.ticket_nr += 1
        fertig = status in ("Erledigt", "Abgeschlossen") and dauer is not None
        frist = {"Notfall": 1, "Hoch": 3, "Normal": 14, "Niedrig": 30}[prio]
        uhr = "%02d:%02d" % (7 + self.ticket_nr % 9, self.ticket_nr * 7 % 60)
        tid = self.ein("tickets", _zeit=self.zeit(tage, uhr), nummer=f"S-TEST-{self.ticket_nr:03d}", titel=titel,
                       faellig_am=self.tag(tage + frist), gefaehrdung=gef, status=status, objekt_id=self.oid,
                       anlage_id=anlage_id or (self.anl.get(anlage) if anlage else None), art=art, mangel=mangel, beschreibung=text or None,
                       gewerk=gewerk, prioritaet=prio, gemeldet_von=von, gemeldet_am=self.tag(tage), zugewiesen="Haustechnik Test",
                       dienstleister_id=self.dl.get(firma or ""), kosten=kosten, erledigt_am=self.tag(tage + dauer) if fertig else None)
        zeilen = [(tage, uhr, von, "Meldung aufgenommen.")]
        if firma:
            zeilen.append((tage if not fertig or dauer == 0 else tage + min(1, dauer), "11:20", "Haustechnik Test", f"Beauftragt: {self.firma[firma]}."))
        zeilen += [(tage + t, "14:05", wer, satz) for t, wer, satz in (notizen or [])]
        if fertig:
            zeilen.append((tage + dauer, "16:40", "Haustechnik Test", f"Status: In Arbeit → {status}"))
        for t, u, wer, satz in zeilen:
            self.con.execute("INSERT INTO ticket_kommentare (ticket_id, zeit, autor, text) VALUES (?,?,?,?)", (tid, self.zeit(min(t, 0), u), wer, satz))
        return tid

    def tickets(self) -> None:
        t = self.ticket
        mieter, technik, leitung = "Mieter (QR-Code)", "Haustechnik Test", "Objektleitung Test"
        # Offen: Diese Einträge färben Pläne und Übersicht
        self.tick["a2"] = t("Aufzug A2 hält im 2. OG nicht bündig", -6, status="Warten auf Dienstleister", anlage="a2", prio="Hoch", gef="mittel",
                            gewerk="Aufzug", firma="auf", von=mieter, text="Die Kabine bleibt etwa 3 cm unter der Schwelle stehen. Stolpergefahr.",
                            notizen=[(1, technik, "Aufzug auf eingeschränkten Betrieb gestellt, Warnschild angebracht."),
                                     (3, "Herr Muster", "Türantrieb muss getauscht werden. Ersatzteil ist bestellt.")])
        self.tick["tor2"] = t("Sektionaltor 2 fährt nicht mehr hoch", -9, status="In Arbeit", anlage="tor2", prio="Hoch", gef="mittel",
                              gewerk="Türen/Tore", firma="tor", von="Lagerleitung Mieter", text="Der Antrieb brummt, das Tor bewegt sich nicht.",
                              notizen=[(1, technik, "Tor außer Betrieb genommen und gesichert."), (4, "Frau Probe", "Angebot für neuen Antrieb verschickt.")])
        self.tick["leuchte"] = t("Leuchten Tiefgarage Reihe 3 dunkel", -2, status="Neu", prio="Normal", gewerk="Elektro", von=mieter,
                                 text="Drei Leuchten über den Stellplätzen 21 bis 26 sind aus.")
        self.tick["wasser"] = t("Wasserfleck an der Decke im 3. OG, Büro 3.02", -15, status="In Arbeit", prio="Normal", gewerk="Dach/Fassade",
                                von=mieter, text="Brauner Fleck an der Decke, etwa 40 cm groß. Nach Regen größer geworden.",
                                notizen=[(1, technik, "Dachablauf über dem Büro gereinigt, Fleck wird beobachtet."),
                                         (6, leitung, "Dachdecker für eine Leckortung angefragt.")])
        self.tick["zugluft"] = t("Zugluft im Großraumbüro 2. OG", -4, status="Neu", art="Hinweis", prio="Niedrig", gewerk="Lüftung/Klima", von=mieter)
        self.tick["wartung_a2"] = t("Mangel aus Wartung Personenaufzug A2", self.app.plus_monate(self.h + dt.timedelta(days=-12), -3).toordinal() - self.h.toordinal(),
                                    status="In Arbeit", anlage="a2", art="Mangel", prio="Normal", gef="mittel", gewerk="Aufzug", firma="auf",
                                    von="Herr Muster", text="Türantrieb im 2. OG schwergängig, Kabine hält nicht bündig. Angebot folgt.")
        self.con.execute("UPDATE wartung_historie SET ticket_id=? WHERE wartung_id=? AND ergebnis='Mängel offen'",
                         (self.tick["wartung_a2"], self.wart[("a2", "Wartung")]))
        # Erledigt: zwei Jahre Verlauf über alle Gewerke
        for zeile in [
            ("Brandschutztür 2. OG Treppenhaus Süd schließt nicht selbsttätig", -19, 9, "bst_o2_s", "Mangel", "Hoch", "hoch", "Türen/Tore", "tor", 310.0, technik),
            ("Handfeuermelder EG: Scheibe eingeschlagen (Fehlalarm)", -38, 2, "hfm_eg", "Störung", "Hoch", None, "Brandschutz", "bs", 185.0, "Empfang"),
            ("Serverraum zu warm, Split-Klimagerät auf Störung", -52, 1, "split", "Störung", "Hoch", None, "Lüftung/Klima", "kl", 420.0, mieter),
            ("WC Herren 1. OG: Spülkasten läuft nach", -61, 4, None, "Störung", "Niedrig", None, "Sanitär", "ht", 95.0, mieter),
            ("Automatiktür Haupteingang bleibt offen stehen", -77, 2, "autotuer", "Störung", "Normal", None, "Türen/Tore", "tor", 240.0, "Empfang"),
            ("Außenbeleuchtung Parkplatz: zwei Masten dunkel", -88, 12, "leuchten", "Störung", "Normal", None, "Elektro", "el", 380.0, technik),
            ("Aufzug A1 steckengeblieben, Person befreit", -104, 0, "a1", "Störung", "Notfall", "hoch", "Aufzug", "auf", 290.0, "Notruf Aufzug"),
            ("Heizung im 3. OG bleibt kalt", -121, 3, None, "Störung", "Normal", None, "Heizung", "ht", 160.0, mieter),
            ("Schranke Zufahrt: Arm verbogen", -139, 6, "schranke", "Störung", "Normal", None, "Türen/Tore", "tor", 1180.0, technik),
            ("Dachablauf Nordwest verstopft, Wasser steht", -156, 2, "dachentw", "Mangel", "Hoch", "mittel", "Dach/Fassade", None, None, technik),
            ("Abfluss Teeküche 2. OG verstopft", -170, 1, None, "Störung", "Normal", None, "Sanitär", "ht", 130.0, mieter),
            ("Steckdosen Konferenz 1 ohne Spannung", -188, 1, "uv_eg", "Störung", "Normal", None, "Elektro", "el", 110.0, "Empfang"),
            ("Graffiti an der Hallenwand", -203, 15, None, "Hinweis", "Niedrig", None, "Reinigung", "rein", 460.0, leitung),
            ("Rohrbruch in der Tiefgarage, Wasser läuft aus", -231, 1, None, "Störung", "Notfall", "hoch", "Sanitär", "ht", 1940.0, "Wachdienst"),
            ("BMZ: Störung Meldergruppe 12", -246, 3, "bmz", "Störung", "Hoch", "mittel", "Brandschutz", "bs", 275.0, technik),
            ("Rolltor Tiefgarage öffnet nicht per Funk", -262, 2, "rolltor", "Störung", "Normal", None, "Türen/Tore", "tor", 150.0, mieter),
            ("Fensterdichtung im 3. OG undicht", -281, 20, "fassade", "Mangel", "Niedrig", "gering", "Dach/Fassade", None, 540.0, mieter),
            ("USV meldet Batteriefehler", -300, 5, "usv", "Störung", "Hoch", None, "Elektro", "el", 1260.0, technik),
            ("Schlagloch in der Zufahrt", -322, 18, "parkplatz", "Mangel", "Normal", "mittel", "Außenanlagen", "wd", 690.0, leitung),
            ("Lastenaufzug: Tür schließt verzögert", -345, 4, "la", "Störung", "Normal", None, "Aufzug", "auf", 210.0, "Lagerleitung Mieter"),
            ("Kessel 1: Störabschaltung des Brenners", -371, 1, "kessel1", "Störung", "Hoch", None, "Heizung", "ht", 330.0, technik),
            ("Feuerlöscher EG Nord fehlt", -392, 3, "fl_eg_n", "Mangel", "Hoch", "hoch", "Brandschutz", "bs", 120.0, technik),
            ("Ast auf dem Parkplatz abgebrochen", -415, 2, "baum", "Hinweis", "Normal", None, "Außenanlagen", "wd", 180.0, "Empfang"),
            ("Zutrittskontrolle: Leser am Haupteingang reagiert nicht", -440, 3, "zk", "Störung", "Normal", None, "Sicherheitstechnik", None, 260.0, "Empfang"),
            ("Glasbruch im Foyer (Türfüllung)", -468, 7, None, "Störung", "Hoch", "mittel", "Dach/Fassade", None, 870.0, "Empfang"),
            ("Sicherung der Unterverteilung 2. OG löst aus", -497, 2, "uv_o2", "Störung", "Normal", None, "Elektro", "el", 140.0, mieter),
            ("Heizkörper in der Besprechung 2. OG entlüften", -530, 1, None, "Störung", "Niedrig", None, "Heizung", None, None, mieter),
            ("Leitstelle: Kommunikationsfehler DDC Heizung", -561, 6, "ddc", "Störung", "Normal", None, "Gebäudeautomation", None, 380.0, technik),
            ("Fluchtweg im 1. UG mit Paletten verstellt", -590, 0, None, "Hinweis", "Hoch", "hoch", "Brandschutz", None, None, technik),
            ("Wasserhahn in der Küche EG tropft", -622, 5, None, "Störung", "Niedrig", None, "Sanitär", "ht", 75.0, mieter),
            ("Aufzug A1: Notruf ohne Sprechverbindung", -655, 2, "a1", "Störung", "Hoch", "hoch", "Aufzug", "auf", 195.0, technik),
            ("Hebeanlage meldet Hochwasseralarm", -690, 1, "hebe", "Störung", "Hoch", "mittel", "Sanitär", "ht", 520.0, technik),
        ]:
            titel, tage, dauer, anlage, art, prio, gef, gewerk, firma, kosten, von = zeile
            t(titel, tage, status="Abgeschlossen" if tage < -90 else "Erledigt", dauer=dauer, anlage=anlage, art=art, prio=prio, gef=gef,
              gewerk=gewerk, firma=firma, kosten=kosten, von=von)

    # --- Sachverständigen-Prüfungen: Berichte und Mängel ----------------
    def sv(self) -> None:
        pruefer = f"{self.mensch['sv']}, {self.firma['sv']}"
        berichte = {      # Anlage -> Mängel: Nr., Beschreibung, Ort, Einstufung, Bewertung, Frist in Tagen nach der Prüfung, Status, Rest
            "bmz": [("1", "Laufkarten der Meldergruppen 9 und 10 fehlen", "Foyer, Brandmeldezentrale", "geringfügig", "M(A)", 90, "behoben",
                     dict(behoben=-60, kosten=180.0, firma="bs", massnahme="Laufkarten neu erstellt und im Laufkartendepot abgelegt.")),
                    ("2", "Zwei Handfeuermelder in Haus B ohne Hinweisschild", "Haus B, Halle", "geringfügig", "M(A)", 90, "nachgeprüft",
                     dict(behoben=-70, kosten=95.0, firma="bs", massnahme="Schilder montiert, bei der Nachprüfung abgenommen.")),
                    ("3", "Akkus der Energieversorgung älter als vier Jahre", "Foyer, Brandmeldezentrale", "erheblich", "M(B)", 180, "in Arbeit",
                     dict(kosten=640.0, firma="bs", beauftragt=-40, geplant="Kalenderwoche nach der nächsten Wartung", angebot="AN-TEST-2231",
                          sachstand="Akkus bestellt, Einbau mit der Quartalswartung."))],
            "a1": [("1", "Notlicht im Fahrkorb ohne Funktion", "Aufzug A1, Fahrkorb", "geringfügig", "geringer Mangel", 30, "behoben",
                    dict(behoben=-150, kosten=85.0, firma="auf", massnahme="Notlichtgerät getauscht."))],
            "a2": [("1", "Fahrkorb hält im 2. OG nicht bündig (Abweichung über 10 mm)", "Aufzug A2, Haltestelle 2. OG", "erheblich",
                    "erheblicher Mangel", 60, "offen", dict(kosten=3280.0, firma="auf", angebot="AN-TEST-2307", ticket="a2",
                                                           sachstand="Türantrieb und Steuerung werden instand gesetzt, Auftrag ist erteilt.")),
                   ("2", "Prüfbuch nicht vollständig geführt", "Aufzug A2, Triebwerksraum", "geringfügig", "geringer Mangel", 30, "behoben",
                    dict(behoben=-30, massnahme="Wartungen der letzten zwei Jahre nachgetragen."))],
            "zb": [("1", "Drei Rettungszeichenleuchten in der Tiefgarage ohne Funktion", "Haus A, 1. UG, Tiefgarage", "erheblich", "M(B)", 90,
                    "in Arbeit", dict(kosten=540.0, firma="el", beauftragt=-48, geplant="in 10 Tagen", angebot="AN-TEST-2318",
                                      sachstand="Leuchten bestellt, Liefertermin bestätigt.")),
                   ("2", "Prüfbuch der Sicherheitsbeleuchtung fehlt", "Haus A, 1. UG, Batterieraum", "geringfügig", "M(A)", 60, "offen",
                    dict(sachstand="Prüfbuch wird von der Haustechnik angelegt."))],
            "sprinkler": [("1", "Beschilderung der Alarmventilstation unvollständig", "Haus A, 1. UG, Sprinklerzentrale", "geringfügig", "M(A)",
                           60, "nachgeprüft", dict(behoben=-250, kosten=140.0, firma="bs", massnahme="Schilder ergänzt, Nachprüfung ohne Befund."))],
            "co": [("1", "CO-Sensor 3 löst bei Prüfgas nicht aus", "Haus A, 1. UG, Tiefgarage Achse 7", "gefährlich", "gefährlicher Mangel", 14,
                    "nachgeprüft", dict(behoben=-338, kosten=410.0, firma="kl", massnahme="Sensor getauscht, Funktionsprobe mit Prüfgas bestanden."))],
            "nea": [("1", "Anlaufzeit des Aggregats nicht dokumentiert", "Haus A, 1. UG, Notstrom", "geringfügig", "M(A)", 90, "behoben",
                     dict(behoben=-520, massnahme="Messung nachgeholt: 11 Sekunden, im Soll."))],
            "la": [],
        }
        gesamt = {"gefährlich": "gefährliche Mängel", "erheblich": "erhebliche Mängel", "geringfügig": "geringfügige Mängel"}
        for anlage, maengel in berichte.items():
            wid = self.wart[(anlage, "SV-Prüfung")]
            w = self.con.execute("SELECT * FROM wartungen WHERE id=?", (wid,)).fetchone()
            pruefdatum = w["letzte"]
            tage = (dt.date.fromisoformat(pruefdatum) - self.h).days
            la = anlage == "la"
            liste = [("1", "Notrufweiterleitung beim Test erst im zweiten Versuch erfolgreich", "Lastenaufzug, Fahrkorb", "geringfügig",
                      "geringer Mangel", 30)] if la else [m[:6] for m in maengel]
            zeilen = ["# Prüfgegenstand", f"{self.bez[anlage]}, {NAME}", f"Prüfgrundlage: {w['rechtsgrundlage']}",
                      f"Prüfdatum: {_de(pruefdatum)}   Bericht-Nr.: {w['pruefnummer']}", f"Sachverständiger: {pruefer}", "",
                      "# Ergebnis", ("Die Anlage weist Mängel auf." if liste else "Die Anlage ist ohne Mängel."), ""]
            for nr, text, ort, stufe, bewertung, frist in liste:
                zeilen += [f"# Mangel {nr} ({bewertung})", text, f"Ort: {ort}", f"Einstufung: {stufe}",
                           f"Frist: {_de(self.tag(tage + frist))}", ""]
            zeilen += ["# Nächste Prüfung", _de(w["naechste"])]
            did = self.dokument(f"SV-Bericht {self.bez[anlage]} {pruefdatum[:4]}", "Prüfbericht", tage + 6, zeichnen.pdf(
                f"Prüfbericht {self.bez[anlage]}", zeilen), anlage=anlage, schl=f"sv_{anlage}")
            if la or anlage == "zb":      # Auswertung wie von der KI: einmal schon übernommen, einmal noch offen zum Ausprobieren
                stufen = [m[3] for m in liste]
                ergebnis = {"ist_pruefbericht": True, "pruefdatum": pruefdatum, "sachverstaendiger": self.mensch["sv"], "pruefstelle": self.firma["sv"],
                            "pruefart": "Wiederkehrende Prüfung", "pruefgegenstand": self.bez[anlage],
                            "gesamtergebnis": next((gesamt[s] for s in ("gefährlich", "erheblich", "geringfügig") if s in stufen), "ohne Mängel"),
                            "naechste_pruefung": w["naechste"], "hinweis_anweisung": False,
                            "zusammenfassung": f"Wiederkehrende Prüfung mit {len(liste)} Mängeln. Die Anlage darf weiter betrieben werden.",
                            "maengel": [{"nummer": nr, "beschreibung": text, "ort": ort, "einstufung": stufe, "bewertung": bewertung,
                                         "frist": self.tag(tage + frist), "frist_text": f"innerhalb von {frist} Tagen", "seite": 1}
                                        for nr, text, ort, stufe, bewertung, frist in liste],
                            "modell": "Testobjekt (erfundene Auswertung)"}
                self.con.execute("INSERT INTO sv_auswertungen (dokument_id, zeit, von, ergebnis, uebernommen) VALUES (?,?,?,?,?)",
                                 (did, self.zeit(tage + 6, "10:30"), "Objektleitung Test", json.dumps(ergebnis, ensure_ascii=False),
                                  None if la else self.zeit(tage + 6, "10:45")))
            for nr, text, ort, stufe, bewertung, frist, zustand, rest in maengel:
                firma = rest.get("firma")
                behoben = self.tag(rest["behoben"]) if rest.get("behoben") is not None else None
                self.ein("sv_maengel", _zeit=self.zeit(tage + 6, "10:45"), objekt_id=self.oid, anlage_id=self.anl[anlage], nummer=nr,
                         beschreibung=text, ort=ort, einstufung=stufe, bewertung_bericht=bewertung, frist=self.tag(tage + frist),
                         frist_text=f"innerhalb von {frist} Tagen", status=zustand, sachstand=rest.get("sachstand"),
                         firma=self.firma[firma] if firma else None, dienstleister_id=self.dl.get(firma or ""), angebot=rest.get("angebot"),
                         kosten=rest.get("kosten"), beauftragt_am=self.tag(rest["beauftragt"]) if rest.get("beauftragt") is not None else None,
                         geplant=rest.get("geplant"), behoben_am=behoben, rechnung_nr=f"RE-TEST-{abs(rest['behoben'])}" if behoben and rest.get("kosten") else None,
                         rechnung_summe=rest.get("kosten") if behoben else None, massnahme=rest.get("massnahme"), bericht_id=did,
                         pruefdatum=pruefdatum, seite=1, ticket_id=self.tick.get(rest.get("ticket", "")),
                         quelle="KI-Auswertung, geprüft von Objektleitung Test" if anlage == "zb" else "Testobjekt")

    # --- Rundgänge und Checklisten --------------------------------------
    @staticmethod
    def punkt(text, typ="haken", einheit="", mini=None, maxi=None, bereich="", anlage=None, pflicht=True) -> dict:
        return {"text": text, "typ": typ, "einheit": einheit, "min": mini, "max": maxi, "bereich": bereich, "anlage_id": anlage, "pflicht": pflicht}

    def liste(self, titel: str, art: str, rhythmus: str, punkte: list, *, anlage: str | None = None, checkpoints: bool = False,
              unterschrift: bool = False, notiz: str | None = None) -> tuple[int, list, list]:
        cid = self.ein("checklisten", titel=titel, art=art, objekt_id=self.oid, anlage_id=self.anl.get(anlage) if anlage else None,
                       rhythmus=rhythmus, zustaendig="Haustechnik Test", faellig_uhrzeit="08:00", erinnern_vorher=1, erinnern_einheit="Tage",
                       punkte=json.dumps(punkte, ensure_ascii=False), unterschrift_pflicht=1 if unterschrift else 0,
                       checkpoints_pflicht=1 if checkpoints else 0, aktiv=1, notiz=notiz)
        stationen = self.app.checkpoints_abgleichen(self.con, cid) if art == "Rundgang" else []
        return cid, punkte, stationen

    def durchgang(self, liste: tuple, titel: str, tage: int, uhr: str, wer: int, abw: dict | None = None, *, fehlt: tuple = (),
                  pruef: str = "bestaetigt", kommentar: str | None = None, bemerkung: str | None = None, mangel: bool = True,
                  ticket_offen: bool = False, ticket_dauer: int = 3, schluessel: str | None = None) -> int:
        """Ein abgeschlossener Durchgang. abw: Nummer des Prüfpunkts -> (Status, Messwert oder None, Notiz).
        fehlt: Stationen, deren Checkpoint nicht gescannt wurde."""
        cid, punkte, stationen = liste
        abw = abw or {}
        name = PERSONEN[wer][0]
        beginn = dt.datetime.fromisoformat(self.zeit(tage, uhr))
        uhrzeit, scans = beginn, []
        for s in stationen:
            uhrzeit += dt.timedelta(minutes=self.rnd.randint(3, 8), seconds=self.rnd.randint(0, 50))
            gescannt = s["bereich"] not in fehlt
            scans.append({"id": s["id"], "bereich": s["bereich"], "zeit": uhrzeit.isoformat(timespec="seconds") if gescannt else None})
            if gescannt:
                self.con.execute("INSERT INTO checkpoint_scans (checkpoint_id, benutzer_id, wer, zeit) VALUES (?,?,?,?)",
                                 (s["id"], None, name, uhrzeit.isoformat(timespec="seconds")))
        ende = uhrzeit + dt.timedelta(minutes=self.rnd.randint(2, 5) if stationen else 6 + len(punkte), seconds=self.rnd.randint(0, 50))
        ergebnisse, abweichungen = [], []
        for i, p in enumerate(punkte):
            zustand, wert, notiz = abw.get(i, ("ok" if p["typ"] != "text" else None, None, ""))
            if p["typ"] == "zahl" and wert is None:
                lo, hi = p["min"], p["max"]
                if lo is not None and hi is not None:
                    wert = round(lo + (hi - lo) * self.rnd.uniform(0.3, 0.7), 0 if hi - lo > 20 else 1)
                else:
                    wert = round((lo if lo is not None else 60) + self.rnd.uniform(8, 25), 0)
            weicht_ab = zustand == "mangel" or (p["typ"] == "zahl" and wert is not None and (
                (p["min"] is not None and wert < p["min"]) or (p["max"] is not None and wert > p["max"])))
            ergebnisse.append({**p, "status": zustand, "wert": wert, "notiz": notiz, "abweichung": weicht_ab})
            if weicht_ab:
                abweichungen.append(ergebnisse[-1])
        offen = pruef == "offen"
        zeile = self.con.execute("SELECT anlage_id FROM checklisten WHERE id=?", (cid,)).fetchone()
        cur = self.con.execute(
            "INSERT INTO checklisten_durchgaenge (checkliste_id, objekt_id, anlage_id, zeit, wer, ergebnisse, bemerkung, abweichungen, "
            "unterschrift, unterschrift_name, checkpoints, start, pruef_status, geprueft_von, geprueft_am, pruef_kommentar, benutzer_id, pruefer_id) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (cid, self.oid, zeile["anlage_id"], ende.isoformat(timespec="seconds"), name, json.dumps(ergebnisse, ensure_ascii=False), bemerkung,
             len(abweichungen), self.sig[wer % 2], name, json.dumps(scans, ensure_ascii=False) if scans else None,
             beginn.isoformat(timespec="seconds"), pruef, None if offen else "Objektleitung Test",
             None if offen else self.zeit(min(tage + 1, 0), "15:30"), kommentar, None, self.b["id"]))
        did = cur.lastrowid
        if offen:
            self.offen_pruefen.append((cid, did, titel, "Rundgang" if stationen else "Checkliste", name, len(abweichungen)))
        if mangel:
            for e in abweichungen:
                messwert = ""
                if e["typ"] == "zahl" and e["wert"] is not None:
                    soll = " bis ".join(f"{x:g}" for x in (e["min"], e["max"]) if x is not None)
                    messwert = f'Messwert {e["wert"]:g} {e["einheit"]}'.strip() + (f' (Soll {soll} {e["einheit"]})' if soll else "")
                text = "\n".join(x for x in (f'Aus {"Rundgang" if stationen else "Checkliste"} „{titel}“',
                                            f'Station: {e["bereich"]}' if e["bereich"] else "", messwert, e["notiz"]) if x)
                tid = self.ticket(e["text"][:150], tage, status="Neu" if ticket_offen else "Erledigt", dauer=ticket_dauer,
                                  anlage_id=e["anlage_id"] or zeile["anlage_id"], art="Mangel", gef="mittel", von=name, text=text,
                                  mangel=f"Durchgang {did}")
                if schluessel:
                    self.tick[schluessel] = tid
        return did

    def rundgaenge(self) -> None:
        p, A = self.punkt, self.anl
        technik, garage, foyer, nord, sued, dach = ("Technikzentrale 1. UG", "Tiefgarage", "Foyer EG", "Treppenhaus Nord",
                                                    "Treppenhaus Süd", "Dach")
        woche = self.liste("Wöchentlicher Objektrundgang Haus A", "Rundgang", "wöchentlich", [
            p("Vorlauftemperatur Heizung", "zahl", "°C", 55, 80, technik, A["kessel1"]),                       # 0
            p("Anlagendruck Heizung", "zahl", "bar", 1.2, 2.5, technik, A["kessel1"]),                         # 1
            p("Hebeanlage ohne Störmeldung", bereich=technik, anlage=A["hebe"]),                               # 2
            p("Sprinklerzentrale: Druck im Sollbereich", "zahl", "bar", 8, 10.5, technik, A["sprinkler"]),     # 3
            p("Beleuchtung vollständig in Ordnung", bereich=garage),                                           # 4
            p("Fluchtwege frei, Brandschutztüren nicht verkeilt", bereich=garage),                             # 5
            p("Rolltor öffnet und schließt", bereich=garage, anlage=A["rolltor"]),                             # 6
            p("Brandmeldezentrale ohne Störung", bereich=foyer, anlage=A["bmz"]),                              # 7
            p("Automatiktür läuft einwandfrei", bereich=foyer, anlage=A["autotuer"]),                          # 8
            p("Aufzüge fahren, Notruf getestet", bereich=foyer, anlage=A["a1"]),                               # 9
            p("Sicherheitsbeleuchtung in Ordnung", bereich=nord),                                              # 10
            p("Feuerlöscher an ihrem Platz, Plombe unversehrt", bereich=nord),                                 # 11
            p("Sicherheitsbeleuchtung in Ordnung", bereich=sued),                                              # 12
            p("Feuerlöscher an ihrem Platz, Plombe unversehrt", bereich=sued, anlage=A["fl_o1_s"]),            # 13
            p("Dachabläufe frei", bereich=dach, anlage=A["dachentw"]),                                         # 14
            p("RLT-Anlage ohne ungewöhnliche Geräusche", bereich=dach, anlage=A["rlt"]),                       # 15
            p("Auffälligkeiten", "text", bereich=dach, pflicht=False),                                         # 16
        ], checkpoints=True, unterschrift=True, notiz="Jede Station hat einen Checkpoint zum Scannen. " + HINWEIS)
        titel = "Wöchentlicher Objektrundgang Haus A"
        vorfaelle = {      # Woche (0 = letzte) -> Abweichungen
            0: {13: ("mangel", None, "Plombe am Feuerlöscher 1. OG Süd fehlt.")},
            3: {0: ("ok", 48.0, "Kessel 1 auf Störung, Kessel 2 übernimmt.")},
            5: {4: ("mangel", None, "Drei Leuchten in Reihe 3 dunkel.")},
            8: {14: ("mangel", None, "Ablauf Nordwest mit Laub zugesetzt.")},
            12: {3: ("ok", 7.4, "Druck fällt langsam ab, Nachspeisung geprüft.")},
            17: {8: ("mangel", None, "Tür schließt verzögert.")},
            26: {5: ("mangel", None, "Paletten vor der Brandschutztür abgestellt, sofort entfernt.")},
            33: {9: ("mangel", None, "Notruf A2 ohne Rückmeldung der Leitstelle.")},
            41: {1: ("ok", 1.0, "Druck zu niedrig, Wasser nachgefüllt.")},
            47: {10: ("mangel", None, "Eine Rettungszeichenleuchte im 2. OG flackert.")},
            58: {6: ("mangel", None, "Tor blieb auf halber Höhe stehen, nach Neustart in Ordnung.")},
            66: {15: ("mangel", None, "Lagergeräusch am Zuluftventilator.")},
            73: {2: ("mangel", None, "Hochwasseralarm stand an, Schwimmer gereinigt.")},
            85: {12: ("mangel", None, "Leuchte im Erdgeschoss ohne Funktion.")},
            92: {7: ("mangel", None, "Störung Meldergruppe 12 stand an.")},
        }
        for k in range(100):
            if k in (9, 23, 24, 51, 52, 77):                       # ausgefallene Wochen, etwa wegen Urlaub
                continue
            abw = dict(vorfaelle.get(k, {}))
            if k % 11 == 4 and 16 not in abw:
                abw[16] = (None, "Laub auf dem Dach, sonst alles in Ordnung.", "")
            self.durchgang(woche, titel, -(6 + 7 * k), "%02d:%02d" % (7 + k % 2, 5 + k * 13 % 50), 0 if k % 3 else 1, abw,
                           pruef="offen" if k < 2 else "rueckfrage" if k == 8 else "bestaetigt",
                           kommentar="Bitte ein Foto vom Dachablauf nachreichen." if k == 8 else "Mangel ist gemeldet, danke." if k in vorfaelle and k > 1 else None,
                           bemerkung="Rundgang zusammen mit dem neuen Kollegen." if k == 30 else None, mangel=k not in (26, 58),
                           ticket_offen=k == 0, ticket_dauer=1 + k % 5, schluessel="plombe" if k == 0 else None)

        monat = self.liste("Monatlicher Brandschutzrundgang", "Rundgang", "monatlich", [
            p("Treppenhäuser frei von Brandlasten", bereich="Haus A Treppenhäuser"),                           # 0
            p("Brandschutztüren schließen selbsttätig", bereich="Haus A Treppenhäuser"),                       # 1
            p("Flure frei, Rettungswegkennzeichnung vollständig", bereich="Haus A Flure"),                     # 2
            p("Feuerlöscher und Wandhydranten zugänglich", bereich="Haus A Flure"),                            # 3
            p("Tiefgarage: keine Lagerung auf den Stellplätzen", bereich="Tiefgarage"),                        # 4
            p("Halle: Fluchtwege und Notausgänge frei", bereich="Haus B Halle"),                               # 5
            p("Halle: Gefahrstoffschrank geschlossen", bereich="Haus B Halle", anlage=A["gss"]),               # 6
            p("Büro Haus B: Feuerlöscher an ihrem Platz", bereich="Haus B Büro"),                              # 7
            p("Feuerwehrzufahrt und Aufstellflächen frei", bereich="Außenbereich Feuerwehrzufahrt"),           # 8
            p("Bemerkungen", "text", bereich="Außenbereich Feuerwehrzufahrt", pflicht=False),                  # 9
        ], unterschrift=True, notiz="Checkpoints sind hier freiwillig. So sieht man im Bericht auch ausgelassene Stationen. " + HINWEIS)
        titel = "Monatlicher Brandschutzrundgang"
        vorfaelle = {1: {8: ("mangel", None, "Lieferwagen parkt in der Feuerwehrzufahrt, Fahrer angesprochen.")},
                     4: {1: ("mangel", None, "Tür im 2. OG Süd schließt nicht selbsttätig.")},
                     10: {4: ("mangel", None, "Reifenstapel auf Stellplatz 14.")},
                     16: {5: ("mangel", None, "Notausgang Ost durch Gitterbox verstellt.")}}
        for m in range(24):
            self.durchgang(monat, titel, -int(11 + 30.4 * m), "%02d:%02d" % (9 + m % 2, 10 + m * 7 % 45), 1 if m % 2 else 0, vorfaelle.get(m),
                           fehlt=("Außenbereich Feuerwehrzufahrt",) if m == 2 else ("Haus B Büro", "Tiefgarage") if m == 9 else (),
                           pruef="offen" if m == 0 else "bestaetigt", ticket_dauer=0 if m == 1 else 6,
                           kommentar="Gesehen, danke." if m in vorfaelle else None)

        self.liste("Jährliche Dachbegehung", "Rundgang", "jährlich", [
            p("Dachhaut ohne Blasen, Risse oder Pfützen", bereich="Dach Haus A", anlage=A["dachfl"]),
            p("Anschlagpunkte fest und unbeschädigt", bereich="Dach Haus A", anlage=A["anschlag"]),
            p("Lichtkuppeln dicht und unbeschädigt", bereich="Dach Haus A"),
            p("Dach Haus B: Abläufe frei", bereich="Dach Haus B"),
        ], unterschrift=True, notiz="Noch nie durchgeführt: So sieht ein fälliger Rundgang ohne Durchgang aus. " + HINWEIS)

        rlt = self.liste("Monatliche Sichtkontrolle RLT-Anlage Büro", "Anlage", "monatlich", [
            p("Filter-Differenzdruck Zuluft", "zahl", "Pa", 50, 250), p("Filter-Differenzdruck Abluft", "zahl", "Pa", 50, 250),
            p("Keilriemen ohne Risse, Spannung in Ordnung"), p("Klappen öffnen und schließen"), p("Kondensatablauf frei"),
            p("Ungewöhnliche Geräusche", "text", pflicht=False)], anlage="rlt")
        for m in range(24):
            self.durchgang(rlt, "Monatliche Sichtkontrolle RLT-Anlage Büro", -int(4 + 30.4 * m), "10:%02d" % (5 + m * 3 % 50), 7,
                           {0: ("ok", 290.0 + m, "Filter stark beladen, Filterwechsel vorziehen.")} if m in (3, 14) else None,
                           pruef="offen" if m == 0 else "bestaetigt", ticket_dauer=5)
        nea = self.liste("Monatlicher Probelauf Notstromaggregat", "Anlage", "monatlich", [
            p("Probelauf 30 Minuten ohne Störung"), p("Tankfüllstand", "zahl", "%", 60, 100), p("Batteriespannung", "zahl", "V", 24, 28),
            p("Öl- und Kühlmittelstand in Ordnung"), p("Betriebsstunden", "zahl", "h", pflicht=False)], anlage="nea")
        for m in range(24):
            self.durchgang(nea, "Monatlicher Probelauf Notstromaggregat", -int(9 + 30.4 * m), "13:%02d" % (10 + m * 5 % 45), 4,
                           {1: ("ok", 52.0, "Tank unter 60 %, Diesel bestellt."), 4: ("ok", 412.0 - m * 0.6, "")} if m == 7
                           else {4: ("ok", round(412.0 - m * 0.6, 1), "")}, ticket_dauer=4)
        spr = self.liste("Wöchentliche Kontrolle Sprinklerzentrale", "Anlage", "wöchentlich", [
            p("Anlagendruck", "zahl", "bar", 8, 10.5), p("Wasservorrat im Behälter", "zahl", "%", 90, 100),
            p("Alarmventilstation ohne Leckage"), p("Raumtemperatur über 5 °C")], anlage="sprinkler")
        for k in range(12):
            self.durchgang(spr, "Wöchentliche Kontrolle Sprinklerzentrale", -(2 + 7 * k), "07:%02d" % (30 + k * 2), 0)

    # --- Zähler ----------------------------------------------------------
    def zaehler(self) -> None:
        erster = self.h.replace(day=1)
        for nummer, medium, einheit, standort, name, faktor, stand, monat, verlauf in [
            ("1TST0000000001", "Strom", "kWh", "Haus A, 1. UG, Elektro (NSHV)", "Hauptzähler Allgemeinstrom Haus A", 1, 482000.0, 21000.0, None),
            ("1TST0000000002", "Strom", "kWh", "Haus B, EG, Elektro Halle", "Wandlerzähler Halle (Faktor 20)", 20, 15800.0, 620.0, None),
            ("W-TEST-0001", "Wasser", "m³", "Haus A, 1. UG, Sanitärzentrale", "Hauptwasserzähler", 1, 9120.0, 210.0, WASSER),
            ("G-TEST-0001", "Gas", "m³", "Haus A, 1. UG, Heizzentrale", "Gaszähler Heizzentrale", 1, 268400.0, 5200.0, WINTER),
            ("WM-TEST-0001", "Wärme", "MWh", "Haus A, 1. UG, Heizzentrale", "Wärmemengenzähler Heizkreis Büro", 1, 1840.0, 42.0, WINTER),
            ("KM-TEST-0001", "Kälte", "MWh", "Haus A, Dach", "Kältemengenzähler Kaltwassersatz", 1, 612.0, 18.0, SOMMER),
            ("PV-TEST-0001", "Weitere", "kWh", "Haus A, Dach", "Ertragszähler PV-Anlage", 1, 31200.0, 7400.0, SOMMER),
        ]:
            zid = self.ein("zaehler", objekt_id=self.oid, nummer=nummer, medium=medium, einheit=einheit, standort=standort, bezeichnung=name,
                           faktor=faktor, notiz=HINWEIS)
            for i in range(24, -1, -1):
                datum = self.app.plus_monate(erster, -i)
                self.ein("ablesungen", zaehler_id=zid, datum=datum.isoformat(), stand=round(stand, 1 if einheit == "MWh" else 0),
                         notiz="Ablesung beim Rundgang" if i % 6 == 0 else None)
                stand += monat * (verlauf[datum.month - 1] if verlauf else 1) * self.rnd.uniform(0.93, 1.07)

    # --- Verträge --------------------------------------------------------
    def vertraege(self) -> None:
        for nr, (titel, firma, gewerk, beginn, ende, frist, betrag, notiz) in enumerate([
            ("Vollwartung Aufzüge", "auf", "Aufzug", "2022-01-01", 150, 3, 9600.0, "Drei Aufzüge, Notruf und Störungsdienst inklusive."),
            ("Wartung Brandmeldeanlage, RWA und Feuerlöscher", "bs", "Brandschutz", "2023-04-01", 400, 3, 6850.0, None),
            ("Wartung Heizung und Sanitär", "ht", "Heizung", "2021-10-01", 230, 3, 5400.0, None),
            ("Wartung Lüftung und Kälte", "kl", "Lüftung/Klima", "2022-07-01", 95, 3, 11200.0, "Kündigungsfrist endet in wenigen Tagen."),
            ("Rahmenvertrag Elektro", "el", "Elektro", "2021-07-01", 520, 6, 4200.0, "Abrechnung von Störungen nach Aufwand."),
            ("Winterdienst und Grünpflege", "wd", "Außenanlagen", "2024-10-01", 320, 3, 14800.0, "Winterdienst vom 1. November bis 31. März."),
            ("Wartung Tore, Türen und Schranke", "tor", "Türen/Tore", "2023-01-01", 45, 3, 3150.0, "Kündigungsfrist ist abgelaufen, der Vertrag verlängert sich."),
            ("Unterhaltsreinigung Haus A und Haus B", "rein", "Reinigung", "2024-01-01", 410, 6, 38400.0, None),
            ("Rahmenvereinbarung Sachverständigenprüfungen", "sv", "Sonstiges", "2022-03-01", None, None, None, "Unbefristet, Abrechnung je Prüfung."),
            ("Wartung Schrankenanlage (alter Vertrag)", "tor", "Türen/Tore", "2019-01-01", -200, 3, 890.0, "Beendet, ersetzt durch den Vertrag für Tore und Türen."),
        ], 1):
            self.ein("vertraege", objekt_id=self.oid, dienstleister_id=self.dl[firma], titel=titel, gewerk=gewerk,
                     vertragsnummer=f"V-TEST-{1000 + nr * 37}", beginn=beginn, ende=self.tag(ende) if ende is not None else None,
                     kuendigungsfrist_monate=frist, verlaengerung_monate=12 if frist else None, betrag_jahr=betrag,
                     notiz=" ".join(x for x in (notiz, HINWEIS) if x))

    # --- Schlüssel und Übergaben ----------------------------------------
    def schluessel(self) -> None:
        anlage, zutritt = "Muster-Schließanlage MP 1", "Muster-Zutrittskontrolle"
        bestand = {}
        for nr, art, name, system, anzahl, ort, zustand, chip, bereich in [
            ("S-01", "Schlüssel", "Generalhauptschlüssel", anlage, 2, "Schlüsselschrank Objektleitung, Haken 1", "aktiv", None, "alle Türen in Haus A und Haus B"),
            ("S-02", "Schlüssel", "Technikräume Haus A", anlage, 3, "Schlüsselschrank Objektleitung, Haken 2", "aktiv", None, "Technikzentralen 1. UG, Technikräume je Etage"),
            ("S-03", "Schlüssel", "Dachzugang Haus A", anlage, 2, "Schlüsselschrank Objektleitung, Haken 3", "aktiv", None, "Dachausstieg, Aufzugsmaschinenräume"),
            ("S-04", "Schlüssel", "Tiefgarage und Müllraum", anlage, 4, "Schlüsselschrank Objektleitung, Haken 4", "aktiv", None, None),
            ("S-05", "Schlüssel", "Halle Haus B", anlage, 3, "Schlüsselschrank Objektleitung, Haken 5", "aktiv", None, None),
            ("S-06", "Schlüssel", "Feuerwehrschlüssel", anlage, 1, "Feuerwehr-Schlüsseldepot am Haupteingang", "aktiv", None, "Generalschlüssel für die Feuerwehr"),
            ("S-07", "Schlüssel", "Aufzug Notbefreiung (Dreikant)", "ohne Schließanlage", 2, "Schlüsselschrank Objektleitung, Haken 7", "aktiv", None, None),
            ("S-08", "Schlüssel", "Briefkastenanlage", anlage, 1, "Schlüsselschrank Objektleitung, Haken 8", "verloren", None, None),
            ("T-01", "Transponder", "Besuchertransponder Technik", zutritt, 1, "Schlüsselschrank Objektleitung, Fach A", "aktiv", "TST-0001", "Haupteingang und Technikräume, Mo bis Fr 7 bis 18 Uhr"),
            ("T-02", "Transponder", "Besuchertransponder Reinigung", zutritt, 1, "Schlüsselschrank Objektleitung, Fach A", "aktiv", "TST-0002", "Haupteingang und Tiefgarage, täglich 5 bis 22 Uhr"),
            ("T-03", "Transponder", "Transponder Aufzugsdienst", zutritt, 1, "Schlüsselschrank Objektleitung, Fach A", "aktiv", "TST-0003", "Haupteingang, Dach und Maschinenräume"),
            ("T-04", "Transponder", "Transponder (gesperrt)", zutritt, 1, "Schlüsselschrank Objektleitung, Fach B", "gesperrt", "TST-0004", "gesperrt nach Verlustmeldung, wiedergefunden"),
        ]:
            sid = self.ein("schluessel", objekt_id=self.oid, art=art, nummer=nr, bezeichnung=name, schliessanlage=system, chip_nr=chip,
                           schliessbereich=bereich, anzahl=anzahl, aufbewahrung=ort, status=zustand, notiz=HINWEIS)
            bestand[nr] = {"id": sid, "nummer": nr, "bezeichnung": name, "art": art, "chip_nr": chip}
        # Tag, Uhrzeit, Schlüssel, Person, Zweck, Rückgabe bis (Tag ab Ausgabe, Uhrzeit), zurück (Tag ab Ausgabe, Uhrzeit) oder None
        for nr, (tage, uhr, wahl, person, zweck, bis, zurueck, bemerkung) in enumerate([
            (-700, "07:45", [("S-02", 1)], 2, "Wartung Heizkessel", (0, "17:00"), (0, "15:20"), None),
            (-655, "08:10", [("S-07", 1), ("T-03", 1)], 0, "Wartung Aufzüge", (0, "17:00"), (0, "12:40"), None),
            (-610, "07:30", [("S-03", 1)], 7, "Wartung RLT-Anlage auf dem Dach", (0, "17:00"), (0, "16:05"), None),
            (-560, "09:00", [("S-02", 1)], 4, "E-Prüfung der Unterverteilungen", (1, "17:00"), (1, "14:30"), None),
            (-505, "07:50", [("S-01", 1)], 5, "Sachverständigenprüfung Brandmeldeanlage", (0, "17:00"), (0, "17:45"), "Prüfung hat länger gedauert."),
            (-450, "08:00", [("S-04", 1), ("T-02", 1)], 3, "Grundreinigung Tiefgarage", (2, "17:00"), (2, "16:30"), None),
            (-398, "08:20", [("S-07", 1), ("T-03", 1)], 0, "Wartung Aufzüge", (0, "17:00"), (0, "11:55"), None),
            (-352, "07:40", [("S-05", 1)], 8, "Winterdienst Halle und Hof (Saison)", (90, "12:00"), (88, "10:00"), "Schlüssel für die ganze Wintersaison."),
            (-300, "08:05", [("S-02", 1)], 2, "Störung Hebeanlage", (0, "17:00"), (0, "13:10"), None),
            (-262, "10:15", [("S-08", 1)], 6, "Zugang Briefkastenanlage für den Mieter", (7, "17:00"), (9, "09:30"), "verloren"),
            (-215, "08:00", [("S-07", 1)], 5, "Sachverständigenprüfung Lastenaufzug", (0, "17:00"), (0, "15:00"), None),
            (-171, "07:55", [("S-03", 2)], 7, "Wartung Kaltwassersatz und Rückkühler", (0, "17:00"), (0, "16:40"), None),
            (-133, "08:30", [("S-02", 1), ("S-04", 1)], 1, "Wartung Sprinkleranlage", (0, "17:00"), (0, "14:05"), None),
            (-96, "09:10", [("T-01", 1)], 4, "Austausch Leuchten in der Tiefgarage", (2, "17:00"), (2, "15:15"), None),
            (-74, "07:45", [("S-07", 1), ("T-03", 1)], 0, "Wartung Aufzüge", (0, "17:00"), (0, "12:20"), None),
            (-60, "08:00", [("S-01", 1)], 5, "Sachverständigenprüfung Sicherheitsbeleuchtung", (0, "17:00"), (0, "16:10"), None),
            (-47, "08:15", [("S-03", 1)], 7, "Filterwechsel RLT-Anlage", (0, "17:00"), (1, "08:05"), "Schlüssel erst am nächsten Morgen zurück."),
            (-33, "07:35", [("S-02", 1)], 2, "Wartung Druckerhöhungsanlage", (0, "17:00"), (0, "11:30"), None),
            (-21, "13:00", [("S-05", 2)], 8, "Laub beseitigen und Winterdienst vorbereiten", (1, "17:00"), (1, "16:00"), None),
            (-12, "08:00", [("S-07", 1), ("T-03", 1)], 0, "Störung Aufzug A2", (0, "17:00"), (0, "18:20"), "Fehlersuche bis in den Abend."),
            (-6, "08:10", [("S-04", 1)], 3, "Sonderreinigung Müllraum", (0, "17:00"), (0, "15:45"), None),
            (-3, "07:50", [("S-02", 1), ("T-01", 1)], 2, "Instandsetzung Hebeanlage", (1, "17:00"), None, None),
            (-1, "15:30", [("S-03", 1)], 7, "Wartung RLT-Anlage Büro", (2, "17:00"), None, None),
        ], 1):
            name, firma = PERSONEN[person]
            vor, nach = (name.lower().replace("ü", "ue").split(" ") + [""])[:2]
            firmenname = self.firma[firma] if firma else "Mieter Musterfirma AG" + ZUSATZ
            liste = [{**bestand[s], "anzahl": anzahl} for s, anzahl in wahl]
            ausgabe = self.zeit(tage, uhr)
            verloren = bemerkung == "verloren"
            cur = self.con.execute(
                "INSERT INTO schluessel_uebergaben (nummer, objekt_id, schluessel, ausgeber_id, ausgeber_name, ausgeber_email, empfaenger_name, "
                "empfaenger_firma, empfaenger_email, empfaenger_tel, zweck, ausgabe_zeit, rueckgabe_bis, erinnerung_um, quittung_senden, sig_ausgeber, "
                "sig_empfaenger, bemerkung, status, rueckgabe_zeit, rueckgabe_von, rueckgabe_bemerkung, sig_rueckgabe, ueberfaellig_gemeldet, "
                "mail_versuche, erstellt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (f"SÜ-TEST-{nr:03d}", self.oid, json.dumps(liste, ensure_ascii=False), None, "Objektleitung Test", None, name, firmenname,
                 f"{vor}.{nach}@testobjekt.example", "0000 000000", zweck, ausgabe, self.zeit(tage + bis[0], bis[1])[:16], None, 0,
                 self.sig[0], self.sig[1 if person % 2 else 0], HINWEIS, "zurueck" if zurueck else "ausgegeben",
                 self.zeit(tage + zurueck[0], zurueck[1]) if zurueck else None, "Objektleitung Test" if zurueck else None,
                 ("Briefkastenschlüssel nicht auffindbar und als verloren gemeldet. Der Zylinder wird getauscht." if verloren else bemerkung)
                 if zurueck else None, self.sig[0] if zurueck else None, ausgabe, 5, ausgabe))
            uid = cur.lastrowid
            for art, wann in (("ausgabe", ausgabe), ("rueckgabe", self.zeit(tage + zurueck[0], zurueck[1]) if zurueck else None)):
                if wann:
                    datei = f"{uid}_{art}_{secrets.token_hex(6)}.png"
                    self.datei(self.app.SCHL_PFAD, datei, self.foto_schluessel[(nr + (art == "rueckgabe")) % 4])
                    self.con.execute("INSERT INTO schluessel_fotos (uebergabe_id, art, pfad, zeit, von) VALUES (?,?,?,?,?)",
                                     (uid, art, datei, wann, "Objektleitung Test"))

    # --- Winterdienst ----------------------------------------------------
    def winterdienst(self) -> None:
        anlaesse = ["Neuschnee", "Glätte / Eisregen", "Neuschnee", "Reifglätte", "Neuschnee", "Kontrollgang"]
        mittel = ["Streusalz", "Splitt", "Sole", "Streusalz"]
        winter = (11, 12, 1, 2, 3)
        tage = [t for t in (self.h - dt.timedelta(days=n) for n in range(730, 0, -1)) if t.month in winter and t.toordinal() % 11 == 0]
        if self.h.month in winter and (not tage or (self.h - tage[-1]).days > 6):
            tage.append(self.h - dt.timedelta(days=2))            # im Winter steht auch in der laufenden Saison ein frischer Einsatz
        for nr, tag in enumerate(tage, 1):
            anlass = "Reifglätte" if tag.month in (11, 3) and nr % 2 else anlaesse[nr % len(anlaesse)]
            schnee, kontrolle = anlass == "Neuschnee", anlass == "Kontrollgang"
            beginn = dt.datetime.combine(tag, dt.time(5, 20 + nr * 7 % 35))
            ende = beginn + dt.timedelta(minutes=45 if kontrolle else 80 + nr * 11 % 70)
            eid = self.ein("winterdienst", _zeit=beginn.isoformat(timespec="seconds"), objekt_id=self.oid, nummer=f"WD-TEST-{nr:03d}",
                           anlass=anlass, status="erledigt", beginn=beginn.isoformat(timespec="seconds"), ende=ende.isoformat(timespec="seconds"),
                           ausgefuehrt_von="Tom Beispiel", firma=self.firma["wd"], dienstleister_id=self.dl["wd"],
                           neuschnee_cm=3 + nr * 5 % 11 if schnee else None, temperatur=-6 + nr * 3 % 8, geraeumt=1 if schnee else 0,
                           gestreut=0 if kontrolle else 1, streumittel=None if kontrolle else mittel[nr % len(mittel)],
                           streumenge=None if kontrolle else f"ca. {25 + nr * 5 % 40} kg",
                           flaechen="Gehweg Musterallee, Zufahrt, Parkplatz, Eingänge Haus A und Haus B, Ladezone",
                           bemerkung="Keine Glätte festgestellt, nichts zu tun." if kontrolle else "Zweiter Durchgang am Nachmittag nötig." if nr % 5 == 0 else None,
                           quelle="Winterdienst-Link" if nr % 3 else "Programm")
            for art, bild, wann in (("vorher", self.foto_winter[0], beginn), ("nachher", self.foto_winter[1], ende)):
                datei = f"{eid}_{art}_{secrets.token_hex(6)}.png"
                self.datei(self.app.WD_PFAD, datei, bild)
                self.con.execute("INSERT INTO winterdienst_fotos (einsatz_id, art, pfad, zeit, von) VALUES (?,?,?,?,?)",
                                 (eid, art, datei, wann.isoformat(timespec="seconds"), "Tom Beispiel"))

    # --- Vorgangsliste: Angebote und Aufträge ---------------------------
    def vorgaenge(self) -> None:
        # Schlüssel, Beschreibung, Firma, Summe, Status, Angebot vor Tagen, beauftragt, fertig, Rechnung (jeweils Tage oder None), Bemerkung
        for nr, (schl, text, firma, summe, zustand, angebot, auftrag, fertig, rechnung, bemerkung) in enumerate([
            ("tor2", "Erneuerung Antrieb Sektionaltor 2", "tor", 4860.0, "offen", -6, None, None, None, "Angebot liegt beim Auftraggeber zur Freigabe."),
            ("zb", "Austausch Zentralbatterie Sicherheitsbeleuchtung", "el", 12400.0, "offen", -20, None, None, None, None),
            ("a2", "Instandsetzung Aufzug A2 (Türantrieb und Steuerung)", "auf", 3280.0, "beauftragt", -30, -22, None, None, "Ersatzteil ist bestellt."),
            ("dach", "Leckortung und Abdichtung Teilfläche Dach Haus A", None, 6950.0, "beauftragt", -12, -8, None, None, "Zum Wasserfleck im 3. OG."),
            ("pumpe", "Austausch Umwälzpumpe Heizkreis Büro", "ht", 2140.0, "fertiggestellt", -75, -68, -41, None, "Rechnung steht noch aus."),
            ("melder", "Nachrüstung Rauchmelder in der Halle", "bs", 5320.0, "fertiggestellt", -110, -100, -64, None, None),
            ("led", "Erneuerung LED-Beleuchtung Tiefgarage", "el", 18900.0, "abgerechnet", -200, -190, -150, -140, None),
            ("schranke", "Reparatur Schranke Zufahrt", "tor", 1180.0, "abgerechnet", -150, -146, -133, -125, None),
            ("hebe", "Sanierung Hebeanlage (Pumpentausch)", "ht", 3960.0, "abgerechnet", -420, -410, -385, -370, None),
            ("fassade", "Fassadenreinigung Haus A", "rein", 7600.0, "abgelehnt", -160, None, None, None, "Vom Auftraggeber abgelehnt, neue Anfrage im Frühjahr."),
            ("kamera", "Zusätzliche Videokamera am Parkplatz", "el", 2450.0, "storniert", -90, None, None, None, "Storniert, Datenschutz noch nicht geklärt."),
        ], 1):
            self.vg[schl] = self.ein(
                "vorgaenge", _zeit=self.zeit(angebot, "11:00"), objekt_id=self.oid, angebot_nr=f"A-TEST-{nr:03d}", bearbeiter="TE",
                datum=self.tag(angebot), summe_netto=summe, fee="ja" if nr % 3 else "nein", fee_wert="10 %" if nr % 3 else None, beschreibung=text,
                firma=self.firma[firma] if firma else "Muster Dachtechnik" + ZUSATZ, dienstleister_id=self.dl.get(firma or ""),
                sub_angebot_nr=f"NU-TEST-{4100 + nr * 13}", auftrag_nr=f"AU-TEST-{7000 + nr * 17}" if auftrag is not None else None,
                beauftragt_am=self.tag(auftrag) if auftrag is not None else None, fertiggestellt_am=self.tag(fertig) if fertig is not None else None,
                versendet_am=self.tag(angebot + 1), bemerkung=" ".join(x for x in (bemerkung, HINWEIS) if x),
                rg_nr=f"RE-TEST-{2600 + nr * 19}" if rechnung is not None else None, rg_datum=self.tag(rechnung) if rechnung is not None else None,
                rg_betrag=summe if rechnung is not None else None, status=zustand, ab_nr=f"AB-TEST-{5200 + nr * 11}" if auftrag is not None else None,
                ab_am=self.tag(auftrag + 2) if auftrag is not None else None, casa_auftrag_nr=f"CA-TEST-{300 + nr}" if auftrag is not None else None,
                nu_beauftragt=self.tag(auftrag + 1) if auftrag is not None else None, quelle="Testobjekt")

    # --- Dokumente und Fotos --------------------------------------------
    def dokument(self, titel: str, kategorie: str, tage: int, inhalt: bytes, *, endung: str = "pdf", anlage: str | None = None,
                 ticket: int | None = None, vorgang: int | None = None, schl: str | None = None) -> int:
        name = _dateiname(f"{titel}.{endung}")
        did = self.ein("dokumente", _zeit=self.zeit(min(tage, 0), "10:00"), titel=titel, kategorie=kategorie, objekt_id=self.oid,
                       anlage_id=self.anl.get(anlage) if anlage else None, ticket_id=ticket, vorgang_id=vorgang, dateiname=name,
                       groesse=len(inhalt), hochgeladen_am=self.tag(min(tage, 0)), hochgeladen_von="Testobjekt")
        pfad = f"{did:06d}_{secrets.token_hex(4)}_{name}"
        self.datei(self.app.DOK_PFAD, pfad, inhalt)
        self.con.execute("UPDATE dokumente SET pfad=? WHERE id=?", (pfad, did))
        if schl:
            self.dok[schl] = did
        return did

    def dokumente(self) -> None:
        d, pdf = self.dokument, zeichnen.pdf
        kopf = [f"Objekt: {NAME}, Musterallee 1–3, 00000 Musterstadt", "Auftraggeber: Muster Immobilien GmbH (Test)", ""]

        def protokoll(titel, anlage, art, tage, firma, punkte):
            w = self.con.execute("SELECT letzte FROM wartungen WHERE id=?", (self.wart[(anlage, art)],)).fetchone()
            tage = (dt.date.fromisoformat(w["letzte"]) - self.h).days if tage is None else tage
            d(titel, "Wartungsprotokoll", tage + 2, pdf(titel, kopf + [
                "# Anlage", self.bez[anlage], f"Datum: {_de(self.tag(tage))}", f"Ausgeführt von: {self.mensch[firma]}, {self.firma[firma]}", "",
                "# Durchgeführte Arbeiten", *[f"– {x}" for x in punkte], "", "# Ergebnis", "Anlage betriebsbereit übergeben."]), anlage=anlage)
        protokoll("Wartungsprotokoll Personenaufzug A1", "a1", "Wartung", None, "auf",
                  ["Fahrkorb, Türen und Schachtgrube gereinigt", "Tragmittel und Treibscheibe geprüft", "Notruf getestet", "Öl nachgefüllt"])
        protokoll("Wartungsprotokoll RLT-Anlage Büro", "rlt", "Wartung", None, "kl",
                  ["Filter Zuluft und Abluft gewechselt", "Keilriemen geprüft und nachgespannt", "Klappen geprüft", "Kondensatwanne gereinigt"])
        protokoll("Wartungsprotokoll Gas-Brennwertkessel 1", "kessel1", "Wartung", None, "ht",
                  ["Brenner gereinigt", "Zündelektrode getauscht", "Abgaswerte gemessen", "Sicherheitsventil geprüft"])
        protokoll("Wartungsprotokoll Brandmeldeanlage (Quartal)", "bmz", "Wartung", None, "bs",
                  ["Zentrale und Energieversorgung geprüft", "Stichprobe: 25 % der Melder ausgelöst", "Übertragung zur Leitstelle getestet"])
        d("Wartungsvertrag Aufzüge", "Vertrag", -640, pdf("Wartungsvertrag Aufzüge", kopf + [
            "# Vertragspartner", self.firma["auf"], "", "# Leistung", "Vollwartung für drei Aufzüge einschließlich Notruf und Störungsdienst.",
            "", "# Laufzeit", "Beginn 01.01.2022, Verlängerung um jeweils 12 Monate, Kündigungsfrist 3 Monate.", "",
            "# Vergütung", f"{_geld(9600)} netto im Jahr"]), anlage="a1")
        d("Prüfbericht Regalprüfung Halle", "Prüfbericht", -278, pdf("Prüfbericht Regalprüfung", kopf + [
            "# Prüfgegenstand", "Palettenregale Reihe 1 und Reihe 2", "Prüfgrundlage: DIN EN 15635", "",
            "# Ergebnis", "Keine Schäden der Gefahrenstufe Rot. Zwei Stützen mit Gefahrenstufe Grün werden beobachtet."]), anlage="reg1")
        d("Protokoll Sicherheitsbegehung", "Protokoll", -288, pdf("Protokoll Sicherheitsbegehung", kopf + [
            "# Teilnehmer", "Objektleitung Test, Haustechnik Test, Fachkraft für Arbeitssicherheit (Test)", "",
            "# Feststellungen", "1. Fluchtwege frei und gekennzeichnet.", "2. Gefahrstoffschrank geschlossen und beschriftet.",
            "3. Leitern im Lager ohne Prüfplakette: Prüfung beauftragt.", "", "# Nächste Begehung", "in zwölf Monaten"]))
        d("Schreiben an die Mieter: Sperrung Parkplatz", "Schriftverkehr", -45, pdf("Sperrung Parkplatz für Markierungsarbeiten", kopf + [
            "Sehr geehrte Damen und Herren,", "", "am kommenden Samstag werden die Stellplätze neu markiert.",
            "Bitte stellen Sie Ihre Fahrzeuge an diesem Tag in der Tiefgarage ab.", "", "Mit freundlichen Grüßen", "Objektleitung Test"]))
        d("Flucht- und Rettungsplan Haus A EG", "Plan", -520, pdf("Flucht- und Rettungsplan Haus A EG", kopf + [
            "Dieses Blatt steht für einen Flucht- und Rettungsplan.", "Den Grundriss mit allen Symbolen zeigt das Programm unter Standorte & Pläne."]))
        for schl, titel, tage in (("tor2", "Angebot Erneuerung Antrieb Sektionaltor 2", -6), ("a2", "Angebot Instandsetzung Aufzug A2", -30),
                                  ("led", "Angebot LED-Beleuchtung Tiefgarage", -200)):
            v = self.con.execute("SELECT * FROM vorgaenge WHERE id=?", (self.vg[schl],)).fetchone()
            d(titel, "Angebot", tage, pdf(titel, kopf + [f"Angebot Nr. {v['angebot_nr']} vom {_de(v['datum'])}", f"Firma: {v['firma']}", "",
                                                         "# Leistung", v["beschreibung"], "", "# Angebotssumme", f"{_geld(v['summe_netto'])} netto"]),
              vorgang=self.vg[schl])
        v = self.con.execute("SELECT * FROM vorgaenge WHERE id=?", (self.vg["a2"],)).fetchone()
        d("Auftrag Instandsetzung Aufzug A2", "Auftrag", -22, pdf("Auftrag", kopf + [
            f"Auftrag Nr. {v['auftrag_nr']} vom {_de(v['beauftragt_am'])}", f"zum Angebot {v['angebot_nr']}", "", "# Leistung", v["beschreibung"],
            "", "# Auftragssumme", f"{_geld(v['summe_netto'])} netto"]), vorgang=self.vg["a2"])
        d("Auftragsbestätigung Aufzug A2", "Auftragsbestätigung", -20, pdf("Auftragsbestätigung", kopf + [
            f"Auftragsbestätigung Nr. {v['ab_nr']} vom {_de(v['ab_am'])}", f"Firma: {v['firma']}", "", "Wir bestätigen den Auftrag wie angeboten.",
            "Voraussichtliche Ausführung: sobald das Ersatzteil geliefert ist."]), vorgang=self.vg["a2"])
        v = self.con.execute("SELECT * FROM vorgaenge WHERE id=?", (self.vg["led"],)).fetchone()
        d("Rechnung LED-Beleuchtung Tiefgarage", "Rechnung", -140, pdf("Rechnung", kopf + [
            f"Rechnung Nr. {v['rg_nr']} vom {_de(v['rg_datum'])}", f"Firma: {v['firma']}", "", "# Leistung", v["beschreibung"], "",
            "# Rechnungsbetrag", f"{_geld(v['rg_betrag'])} netto", f"zuzüglich 19 % Umsatzsteuer: {_geld(v['rg_betrag'] * 0.19)}",
            f"Gesamt: {_geld(v['rg_betrag'] * 1.19)}"]), vorgang=self.vg["led"])
        d("Foto Wasserfleck Decke 3. OG", "Foto", -15, zeichnen.bild_mangel(0), endung="png", ticket=self.tick["wasser"])
        if self.tick.get("plombe"):
            d("Foto Feuerlöscher ohne Plombe", "Foto", -6, zeichnen.bild_mangel(1), endung="png", anlage="fl_o1_s", ticket=self.tick["plombe"])
        d("Foto Leuchten Tiefgarage", "Foto", -2, zeichnen.bild_mangel(2), endung="png", ticket=self.tick["leuchte"])

    # --- Hinweise in der Glocke -----------------------------------------
    def hinweise(self) -> None:
        """Ein Hinweis zum Start und je einer für die Durchgänge, die auf die Prüfung warten. Sie gelten als schon per
        Mail und Push verschickt, damit das Anlegen des Testobjekts nichts versendet."""
        zeilen = [(f"testobjekt:{self.oid}", "Testobjekt angelegt", f"{self.kuerzel} {NAME}: zum Ausprobieren, alle Angaben sind erfunden.",
                   f"#/objekte/{self.oid}", "info")]
        for cid, did, titel, art, wer, abw in self.offen_pruefen:
            zeilen.append((f"pruefen:{did}", f"{art} zur Prüfung: {titel}",
                           f"von {wer} · " + (f"{abw} Abweichung{'en' if abw != 1 else ''}" if abw else "alles i. O."),
                           f"#/checklisten/{cid}?durchgang={did}", "pruefung"))
        for schluessel, titel, text, link, art in zeilen:
            self.con.execute("INSERT OR IGNORE INTO benachrichtigungen (benutzer_id, schluessel, zeit, titel, text, link, art, gemailt, gepusht) "
                             "VALUES (?,?,?,?,?,?,?,2,2)", (self.b["id"], schluessel, self.app.jetzt(), titel, text, link, art))


# ---------------------------------------------------------------------------
# Entfernen
# ---------------------------------------------------------------------------
def _ids(con, sql: str, werte: tuple = ()) -> list[int]:
    return [r[0] for r in con.execute(sql, werte)]


def _in(con, sql: str, ids: list) -> list:
    """Führt sql je Teilmenge der ids aus. In sql steht {} an der Stelle der Platzhalter. Liefert alle Zeilen."""
    aus = []
    for i in range(0, len(ids), 400):
        teil = ids[i:i + 400]
        aus += con.execute(sql.format(",".join("?" * len(teil))), teil).fetchall()
    return aus


def entfernen(app, con, benutzer) -> tuple[dict, list]:
    """Löscht das Testobjekt mit allem, was dazugehört. Liefert die Zahlen und die Dateien, die nach dem Speichern
    zu löschen sind. Hängen Einträge anderer Objekte am Testobjekt, wird nichts gelöscht."""
    m = _merker(con)
    oid = m.get("objekt_id")
    o = con.execute("SELECT * FROM objekte WHERE id=?", (oid,)).fetchone() if oid else None
    if not o:
        raise app.Fehler(404, "Es gibt kein Testobjekt.")
    R = app.RESSOURCEN
    weg: dict[str, list[int]] = {"objekte": [oid]}
    for name, res in R.items():
        if any(f["name"] == "objekt_id" for f in res["felder"]):
            weg[name] = _ids(con, f'SELECT id FROM "{name}" WHERE objekt_id=?', (oid,))
    # Dokumente ohne Objekt, die an einer Anlage, einer Meldung oder einem Vorgang des Testobjekts hängen
    lose = set()
    for feld, tab in (("anlage_id", "anlagen"), ("ticket_id", "tickets"), ("vorgang_id", "vorgaenge")):
        lose |= {r[0] for r in _in(con, f"SELECT id FROM dokumente WHERE objekt_id IS NULL AND {feld} IN ({{}})", weg[tab])}
    weg["dokumente"] = sorted(set(weg["dokumente"]) | lose)
    weg["ablesungen"] = [r[0] for r in _in(con, "SELECT id FROM ablesungen WHERE zaehler_id IN ({})", weg["zaehler"])]

    # Hängt etwas aus anderen Objekten daran? Dann lieber nichts löschen und sagen, was es ist.
    fremd = []
    for name, res in R.items():
        for f in res["felder"]:
            if f["typ"] != "ref" or f.get("virtuell") or f["ref"] not in weg or f["ref"] == "objekte" or not weg[f["ref"]]:
                continue
            eigene = set(weg.get(name, []))
            treffer = [r[0] for r in _in(con, f'SELECT id FROM "{name}" WHERE "{f["name"]}" IN ({{}})', weg[f["ref"]]) if r[0] not in eigene]
            if treffer and f.get("lose"):
                setz = '"plan_id"=NULL, "plan_x"=NULL, "plan_y"=NULL' if (name, f["name"]) == ("anlagen", "plan_id") else f'"{f["name"]}"=NULL'
                _in(con, f'UPDATE "{name}" SET {setz} WHERE id IN ({{}})', treffer)
            elif treffer:
                fremd.append(f'{len(treffer)} × {res["label"]}')
    if fremd:
        raise app.Fehler(409, "Das Testobjekt lässt sich nicht entfernen, weil Einträge aus anderen Objekten daran hängen: "
                         + ", ".join(fremd) + ". Bitte diese Einträge zuerst umhängen.")

    dateien = []

    def merken(ordner, name):
        if name:
            p = (ordner / name).resolve()
            if str(p).startswith(str(ordner.resolve())):
                dateien.append(p)
    for r in _in(con, "SELECT pfad FROM plaene WHERE id IN ({})", weg["plaene"]):
        merken(app.PLAN_PFAD, r[0])
    for r in _in(con, "SELECT pfad FROM dokumente WHERE id IN ({})", weg["dokumente"]):
        merken(app.DOK_PFAD, r[0])
    merken(app.OBJ_PFAD, o["bild"])
    listen = weg["checklisten"]
    durchgaenge = sorted({r[0] for r in _in(con, "SELECT id FROM checklisten_durchgaenge WHERE checkliste_id IN ({})", listen)}
                         | set(_ids(con, "SELECT id FROM checklisten_durchgaenge WHERE objekt_id=?", (oid,))))
    punkte = [r[0] for r in _in(con, "SELECT id FROM checkpoints WHERE checkliste_id IN ({})", listen)]
    uebergaben = _ids(con, "SELECT id FROM schluessel_uebergaben WHERE objekt_id=?", (oid,))
    for r in _in(con, "SELECT pfad FROM schluessel_fotos WHERE uebergabe_id IN ({})", uebergaben):
        merken(app.SCHL_PFAD, r[0])
    for r in _in(con, "SELECT pfad FROM winterdienst_fotos WHERE einsatz_id IN ({})", weg["winterdienst"]):
        merken(app.WD_PFAD, r[0])

    vorher = con.total_changes
    for tab, feld, ids in (("checkpoint_scans", "checkpoint_id", punkte), ("checkpoints", "id", punkte),
                           ("checklisten_durchgaenge", "id", durchgaenge), ("wartung_historie", "wartung_id", weg["wartungen"]),
                           ("ticket_kommentare", "ticket_id", weg["tickets"]), ("sv_auswertungen", "dokument_id", weg["dokumente"]),
                           ("schluessel_fotos", "uebergabe_id", uebergaben), ("schluessel_uebergaben", "id", uebergaben),
                           ("winterdienst_fotos", "einsatz_id", weg["winterdienst"])):
        _in(con, f'DELETE FROM "{tab}" WHERE "{feld}" IN ({{}})', ids)
    for name in ("ablesungen", "sv_maengel", "dokumente", "vorgaenge", "tickets", "wartungen", "checklisten", "zaehler", "vertraege",
                 "schluessel", "winterdienst", "anlagen", "plaene", "objekte"):
        _in(con, f'DELETE FROM "{name}" WHERE id IN ({{}})', weg[name])
    gesamt = con.total_changes - vorher
    # Laufende Nummern für Meldungen, Schlüsselprotokolle und Winterdienst: dort weitermachen, wo sie vor dem Testobjekt
    # standen. Sind inzwischen echte Einträge dazugekommen, bleibt die Zählung, wie sie ist (dann mit einer Lücke).
    for tab, stand in (m.get("zaehlung") or {}).items():
        if tab in NUMMERN:
            neu = max(int(stand or 0), con.execute(f'SELECT COALESCE(MAX(id), 0) FROM "{tab}"').fetchone()[0])
            con.execute("UPDATE sqlite_sequence SET seq=? WHERE name=? AND seq>?", (neu, tab, neu))

    # Hinweise in der Glocke, die auf das Testobjekt zeigen
    con.execute("DELETE FROM benachrichtigungen WHERE schluessel=?", (f"testobjekt:{oid}",))
    for muster, ids in ((("pruefen:{}", "bestaetigt:{}"), durchgaenge), (("wdfertig:{}",), weg["winterdienst"])):
        for form in muster:
            _in(con, "DELETE FROM benachrichtigungen WHERE schluessel IN ({})", [form.format(i) for i in ids])
    for vorn, ids in (("rueckfrage", durchgaenge), ("sl-ueber", uebergaben), ("ueber", listen), ("bald", listen), ("zuweisung", listen)):
        for i in ids:
            con.execute("DELETE FROM benachrichtigungen WHERE schluessel LIKE ?", (f"{vorn}:{i}:%",))
    # Zugänge, denen das Testobjekt zugewiesen wurde: nur diese eine Nummer aus der Liste nehmen
    for r in con.execute("SELECT id, objekte FROM benutzer WHERE objekte IS NOT NULL AND objekte<>''").fetchall():
        try:
            liste = json.loads(r["objekte"])
        except ValueError:
            continue
        if isinstance(liste, list) and oid in liste:
            con.execute("UPDATE benutzer SET objekte=? WHERE id=?", (json.dumps([i for i in liste if i != oid]), r["id"]))

    # Testfirmen: nur löschen, wenn sie in keinem echten Eintrag mehr vorkommen
    bleiben = []
    for did in m.get("dienstleister") or []:
        d = con.execute("SELECT firma FROM dienstleister WHERE id=?", (did,)).fetchone()
        if not d or not str(d["firma"] or "").endswith(ZUSATZ):
            continue
        benutzt = any(con.execute(f'SELECT 1 FROM "{name}" WHERE "{f["name"]}"=? LIMIT 1', (did,)).fetchone()
                      for name, res in R.items() for f in res["felder"] if f["typ"] == "ref" and f["ref"] == "dienstleister")
        if benutzt:
            bleiben.append(d["firma"])
        else:
            con.execute("DELETE FROM dienstleister WHERE id=?", (did,))
    con.execute("DELETE FROM inventar_zaehler WHERE objekt_id=?", (oid,))          # Zähler der Inventarnummern dieses Objekts
    con.execute("DELETE FROM einstellungen WHERE schluessel=?", (MERKER,))
    app.protokollieren(con, benutzer, "Testobjekt entfernt", "objekte", oid, f'{o["kuerzel"]} {o["name"]}: {gesamt} Einträge, {len(dateien)} Dateien')
    return {"ok": True, "eintraege": gesamt, "dateien": len(dateien), "firmen_bleiben": bleiben}, dateien
