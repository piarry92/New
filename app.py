#!/usr/bin/env python3
"""Casa CAFM - schlankes CAFM-Programm fuer Facility Management.

Start:   python3 app.py            (danach im Browser http://localhost:8080 oeffnen)
Demo:    python3 app.py --demo     (legt Beispieldaten an, wenn die Datenbank leer ist)
Port:    python3 app.py --port 9000

Braucht nur Python 3.10 oder neuer, keine weiteren Pakete.
"""
from __future__ import annotations

import argparse
import base64
import calendar
import csv
import datetime as dt
import hashlib
import hmac
import io
import json
import mimetypes
import os
import re
import secrets
import sqlite3
import sys
import threading
from http import cookies
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, urlparse

BASIS = Path(__file__).resolve().parent
STATIC = BASIS / "static"
DATEN = Path(os.environ.get("CAFM_DATEN", BASIS / "daten"))
DB_PFAD = DATEN / "cafm.sqlite"
DOK_PFAD = DATEN / "dokumente"
PLAN_PFAD = DATEN / "plaene"
SYM_PFAD = DATEN / "symbole"
MAX_SYMBOL = 2 * 1024 * 1024
MAX_UPLOAD = 25 * 1024 * 1024
SITZUNG_TAGE = 7

GEWERKE = [
    "Aufzug", "Brandschutz", "Elektro", "Heizung", "Lüftung/Klima", "Kälte", "Sanitär",
    "Sicherheitstechnik", "Türen/Tore", "Dach/Fassade", "Außenanlagen", "Reinigung",
    "Gebäudeautomation", "Flucht und Rettung", "Sonstiges",
]
GRUPPEN = [
    "Klima, Kälte & Lüftung (RLT)", "Heizung & Sanitär", "Elektro & Beleuchtung", "Brandschutz",
    "Flucht & Rettung", "Fördertechnik", "Sicherheitstechnik", "Gebäudeautomation", "Gebäudehülle",
    "Außenanlagen", "Sonstiges",
]
PLANZEICHEN = [
    "F001 Feuerlöscher", "F002 Löschschlauch (Wandhydrant)", "F003 Feuerleiter", "F005 Brandmelder (Handfeuermelder)",
    "F006 Brandmeldetelefon", "E001 Notausgang links", "E002 Notausgang rechts", "E003 Erste Hilfe",
    "E004 Notruftelefon", "E007 Sammelstelle", "E010 Defibrillator (AED)", "E011 Augenspüleinrichtung",
    "BMZ Brandmeldezentrale", "FAT Feuerwehr-Anzeigetableau", "FBF Feuerwehr-Bedienfeld",
    "FSD Feuerwehr-Schlüsseldepot", "RWA Rauchabzug",
]
TICKET_STATUS = ["Neu", "In Arbeit", "Warten auf Dienstleister", "Erledigt", "Abgeschlossen"]
PRIORITAETEN = ["Notfall", "Hoch", "Normal", "Niedrig"]
MEDIEN = ["Strom", "Wasser", "Wärme", "Kälte", "Gas", "Weitere"]
DOK_KATEGORIEN = [
    "Vertrag", "Wartungsprotokoll", "Prüfbericht", "Angebot", "Rechnung", "Plan",
    "Foto", "Protokoll", "Schriftverkehr", "Sonstiges",
]

# ---------------------------------------------------------------------------
# Datenmodell: eine Beschreibung fuer Datenbank, Schnittstelle und Oberflaeche
# ---------------------------------------------------------------------------
# Feldtypen: text, textarea, number, money, date, select, ref, email, tel, bool
RESSOURCEN: dict[str, dict] = {
    "objekte": {
        "label": "Objekte", "einzahl": "Objekt", "anzeige": ["kuerzel", "name"], "sort": "kuerzel",
        "felder": [
            {"name": "kuerzel", "label": "Kürzel", "typ": "text", "pflicht": True, "liste": True},
            {"name": "name", "label": "Name", "typ": "text", "pflicht": True, "liste": True},
            {"name": "strasse", "label": "Straße", "typ": "text", "liste": True},
            {"name": "plz", "label": "PLZ", "typ": "text"},
            {"name": "ort", "label": "Ort", "typ": "text", "liste": True},
            {"name": "nutzung", "label": "Nutzung", "typ": "select",
             "optionen": ["Büro", "Gewerbe", "Hotel", "Wohnen", "Logistik", "Gemischt", "Sonstiges"], "liste": True},
            {"name": "flaeche_m2", "label": "Fläche (m²)", "typ": "number"},
            {"name": "baujahr", "label": "Baujahr", "typ": "number"},
            {"name": "eigentuemer", "label": "Eigentümer / Auftraggeber", "typ": "text"},
            {"name": "objektleiter", "label": "Objektleitung", "typ": "text", "liste": True},
            {"name": "notiz", "label": "Notiz", "typ": "textarea"},
        ],
    },
    "anlagen": {
        "label": "Anlagen", "einzahl": "Anlage", "anzeige": ["bezeichnung"], "sort": "bezeichnung",
        "felder": [
            {"name": "nummer", "label": "Anlagennummer", "typ": "text", "liste": True},
            {"name": "objekt_id", "label": "Objekt (Arbeitsbereich)", "typ": "ref", "ref": "objekte", "pflicht": True, "liste": True},
            {"name": "bezeichnung", "label": "Bezeichnung", "typ": "text", "pflicht": True, "liste": True},
            {"name": "beschreibung", "label": "Beschreibung", "typ": "textarea"},
            {"name": "gruppe", "label": "Gruppe", "typ": "select", "optionen": GRUPPEN},
            {"name": "gewerk", "label": "Gewerk", "typ": "select", "optionen": GEWERKE, "liste": True},
            {"name": "planzeichen", "label": "Planzeichen (DIN EN ISO 7010)", "typ": "select", "optionen": PLANZEICHEN},
            {"name": "symbol_id", "label": "Eigenes Symbol (statt Planzeichen)", "typ": "ref", "ref": "symbole"},
            {"name": "standort", "label": "Standort (Gebäude, Etage, Raum)", "typ": "text", "liste": True},
            {"name": "hersteller", "label": "Hersteller", "typ": "text", "liste": True},
            {"name": "typ", "label": "Typ / Modell", "typ": "text"},
            {"name": "seriennummer", "label": "Seriennummer", "typ": "text"},
            {"name": "baujahr", "label": "Baujahr", "typ": "number"},
            {"name": "herstellungsdatum", "label": "Herstellungsdatum", "typ": "date"},
            {"name": "inbetriebnahme", "label": "Inbetriebnahme", "typ": "date"},
            {"name": "garantie_bis", "label": "Gewährleistung bis", "typ": "date"},
            {"name": "status", "label": "Zustand", "typ": "select",
             "optionen": ["In Betrieb", "Eingeschränkt", "Außer Betrieb", "Stillgelegt"], "liste": True},
            {"name": "manager", "label": "Manager (Casa)", "typ": "text"},
            {"name": "beauftragter", "label": "Standard-Beauftragter", "typ": "text"},
            {"name": "dienstleister_id", "label": "Dienstleister", "typ": "ref", "ref": "dienstleister"},
            {"name": "gps_pflicht", "label": "GPS erforderlich für die Arbeit", "typ": "bool", "standard": 0},
            {"name": "pruefung_pflicht", "label": "Gesetzlich autorisierte Prüfung erforderlich", "typ": "bool", "standard": 0},
            {"name": "wartung_pflicht", "label": "Gesetzlich autorisierte Wartung erforderlich", "typ": "bool", "standard": 0},
            {"name": "notiz", "label": "Notiz", "typ": "textarea"},
            {"name": "plan_id", "label": "Plan", "typ": "ref", "ref": "plaene", "nurlesen": True, "lose": True},
            {"name": "qr_token", "label": "QR-Kennung", "typ": "text", "nurlesen": True, "intern": True},
            {"name": "plan_x", "label": "Plan x", "typ": "number", "nurlesen": True, "intern": True},
            {"name": "plan_y", "label": "Plan y", "typ": "number", "nurlesen": True, "intern": True},
        ],
    },
    "plaene": {
        "label": "Pläne", "einzahl": "Plan", "anzeige": ["titel"], "sort": "titel", "datei": True,
        "felder": [
            {"name": "objekt_id", "label": "Objekt", "typ": "ref", "ref": "objekte", "pflicht": True, "liste": True},
            {"name": "titel", "label": "Titel (z. B. Grundriss 2. OG)", "typ": "text", "pflicht": True, "liste": True},
            {"name": "gebaeude", "label": "Gebäude / Bauteil", "typ": "text", "liste": True},
            {"name": "etage", "label": "Etage", "typ": "text", "liste": True},
            {"name": "notiz", "label": "Notiz", "typ": "textarea"},
            {"name": "dateiname", "label": "Datei", "typ": "text", "nurlesen": True},
            {"name": "breite", "label": "Breite (px)", "typ": "number", "nurlesen": True, "intern": True},
            {"name": "hoehe", "label": "Höhe (px)", "typ": "number", "nurlesen": True, "intern": True},
        ],
    },
    "symbole": {
        "label": "Eigene Symbole", "einzahl": "Symbol", "anzeige": ["name"], "sort": "name", "datei": True,
        "versteckt": True,
        "felder": [
            {"name": "name", "label": "Name (z. B. Rauchmelder)", "typ": "text", "pflicht": True, "liste": True},
            {"name": "gewerk", "label": "Gewerk", "typ": "select", "optionen": GEWERKE, "liste": True},
            {"name": "beschreibung", "label": "Beschreibung", "typ": "text"},
        ],
    },
    "wartungen": {
        "label": "Wartungsplan", "einzahl": "Wartungsaufgabe", "anzeige": ["titel"], "sort": "naechste",
        "felder": [
            {"name": "objekt_id", "label": "Objekt", "typ": "ref", "ref": "objekte", "pflicht": True, "liste": True},
            {"name": "anlage_id", "label": "Anlage", "typ": "ref", "ref": "anlagen", "filter": "objekt_id", "liste": True},
            {"name": "titel", "label": "Titel", "typ": "text", "pflicht": True, "liste": True},
            {"name": "art", "label": "Art", "typ": "select", "optionen": ["Wartung", "Prüfung", "Inspektion", "Begehung"],
             "pflicht": True, "liste": True},
            {"name": "rechtsgrundlage", "label": "Grundlage (z. B. BetrSichV, DGUV V3)", "typ": "text"},
            {"name": "taetigkeiten", "label": "Tätigkeiten (eine je Zeile, wird zur Checkliste)", "typ": "textarea"},
            {"name": "intervall_monate", "label": "Intervall (Monate)", "typ": "number", "pflicht": True},
            {"name": "letzte", "label": "Zuletzt erledigt", "typ": "date"},
            {"name": "naechste", "label": "Nächste Fälligkeit", "typ": "date", "pflicht": True, "liste": True},
            {"name": "dienstleister_id", "label": "Dienstleister", "typ": "ref", "ref": "dienstleister", "liste": True},
            {"name": "zustaendig", "label": "Zuständig bei Casa", "typ": "text"},
            {"name": "aktiv", "label": "Aktiv", "typ": "bool", "standard": 1},
            {"name": "notiz", "label": "Notiz", "typ": "textarea"},
        ],
    },
    "tickets": {
        "label": "Störmeldungen", "einzahl": "Störmeldung", "anzeige": ["nummer", "titel"], "sort": "-id",
        "felder": [
            {"name": "nummer", "label": "Nr.", "typ": "text", "nurlesen": True, "liste": True},
            {"name": "objekt_id", "label": "Objekt", "typ": "ref", "ref": "objekte", "pflicht": True, "liste": True},
            {"name": "anlage_id", "label": "Anlage", "typ": "ref", "ref": "anlagen", "filter": "objekt_id"},
            {"name": "titel", "label": "Titel", "typ": "text", "pflicht": True, "liste": True},
            {"name": "beschreibung", "label": "Beschreibung", "typ": "textarea"},
            {"name": "gewerk", "label": "Gewerk", "typ": "select", "optionen": GEWERKE},
            {"name": "prioritaet", "label": "Priorität", "typ": "select", "optionen": PRIORITAETEN,
             "standard": "Normal", "liste": True},
            {"name": "status", "label": "Status", "typ": "select", "optionen": TICKET_STATUS, "standard": "Neu",
             "liste": True},
            {"name": "gemeldet_von", "label": "Gemeldet von", "typ": "text"},
            {"name": "gemeldet_am", "label": "Gemeldet am", "typ": "date", "liste": True},
            {"name": "faellig_am", "label": "Erledigen bis", "typ": "date", "liste": True},
            {"name": "zugewiesen", "label": "Zuständig bei Casa", "typ": "text"},
            {"name": "dienstleister_id", "label": "Dienstleister", "typ": "ref", "ref": "dienstleister"},
            {"name": "kosten", "label": "Kosten (€)", "typ": "money"},
            {"name": "erledigt_am", "label": "Erledigt am", "typ": "date"},
        ],
    },
    "dienstleister": {
        "label": "Dienstleister", "einzahl": "Dienstleister", "anzeige": ["firma"], "sort": "firma",
        "felder": [
            {"name": "firma", "label": "Firma", "typ": "text", "pflicht": True, "liste": True},
            {"name": "gewerk", "label": "Gewerk", "typ": "select", "optionen": GEWERKE, "liste": True},
            {"name": "ansprechpartner", "label": "Ansprechpartner", "typ": "text", "liste": True},
            {"name": "telefon", "label": "Telefon", "typ": "tel", "liste": True},
            {"name": "notdienst", "label": "Notdienst-Telefon", "typ": "tel"},
            {"name": "email", "label": "E-Mail", "typ": "email", "liste": True},
            {"name": "anschrift", "label": "Anschrift", "typ": "textarea"},
            {"name": "notiz", "label": "Notiz", "typ": "textarea"},
        ],
    },
    "vertraege": {
        "label": "Verträge", "einzahl": "Vertrag", "anzeige": ["titel"], "sort": "ende",
        "felder": [
            {"name": "objekt_id", "label": "Objekt", "typ": "ref", "ref": "objekte", "pflicht": True, "liste": True},
            {"name": "dienstleister_id", "label": "Dienstleister", "typ": "ref", "ref": "dienstleister", "liste": True},
            {"name": "titel", "label": "Titel", "typ": "text", "pflicht": True, "liste": True},
            {"name": "gewerk", "label": "Gewerk", "typ": "select", "optionen": GEWERKE},
            {"name": "vertragsnummer", "label": "Vertragsnummer", "typ": "text"},
            {"name": "beginn", "label": "Beginn", "typ": "date"},
            {"name": "ende", "label": "Ende", "typ": "date", "liste": True},
            {"name": "kuendigungsfrist_monate", "label": "Kündigungsfrist (Monate)", "typ": "number"},
            {"name": "verlaengerung_monate", "label": "Verlängert sich um (Monate)", "typ": "number"},
            {"name": "betrag_jahr", "label": "Betrag pro Jahr netto (€)", "typ": "money", "liste": True},
            {"name": "notiz", "label": "Notiz", "typ": "textarea"},
        ],
    },
    "zaehler": {
        "label": "Zähler", "einzahl": "Zähler", "anzeige": ["nummer", "medium"], "sort": "nummer",
        "felder": [
            {"name": "objekt_id", "label": "Objekt", "typ": "ref", "ref": "objekte", "pflicht": True, "liste": True},
            {"name": "nummer", "label": "Zählernummer", "typ": "text", "pflicht": True, "liste": True},
            {"name": "medium", "label": "Medium", "typ": "select", "optionen": MEDIEN, "pflicht": True, "liste": True},
            {"name": "einheit", "label": "Einheit", "typ": "text", "liste": True},
            {"name": "standort", "label": "Standort", "typ": "text", "liste": True},
            {"name": "bezeichnung", "label": "Bezeichnung (z. B. Hauptzähler)", "typ": "text"},
            {"name": "faktor", "label": "Wandlerfaktor", "typ": "number", "standard": 1},
            {"name": "notiz", "label": "Notiz", "typ": "textarea"},
        ],
    },
    "ablesungen": {
        "label": "Ablesungen", "einzahl": "Ablesung", "anzeige": ["datum"], "sort": "-datum", "versteckt": True,
        "felder": [
            {"name": "zaehler_id", "label": "Zähler", "typ": "ref", "ref": "zaehler", "pflicht": True, "liste": True},
            {"name": "datum", "label": "Datum", "typ": "date", "pflicht": True, "liste": True},
            {"name": "stand", "label": "Zählerstand", "typ": "number", "pflicht": True, "liste": True},
            {"name": "notiz", "label": "Notiz", "typ": "text", "liste": True},
        ],
    },
    "dokumente": {
        "label": "Dokumente", "einzahl": "Dokument", "anzeige": ["titel"], "sort": "-id",
        "felder": [
            {"name": "titel", "label": "Titel", "typ": "text", "pflicht": True, "liste": True},
            {"name": "kategorie", "label": "Kategorie", "typ": "select", "optionen": DOK_KATEGORIEN, "liste": True},
            {"name": "objekt_id", "label": "Objekt", "typ": "ref", "ref": "objekte", "liste": True},
            {"name": "anlage_id", "label": "Anlage", "typ": "ref", "ref": "anlagen", "filter": "objekt_id"},
            {"name": "ticket_id", "label": "Störmeldung", "typ": "ref", "ref": "tickets", "filter": "objekt_id"},
            {"name": "dateiname", "label": "Datei", "typ": "text", "nurlesen": True, "liste": True},
            {"name": "groesse", "label": "Größe", "typ": "number", "nurlesen": True},
            {"name": "hochgeladen_am", "label": "Hochgeladen", "typ": "date", "nurlesen": True, "liste": True},
            {"name": "hochgeladen_von", "label": "Von", "typ": "text", "nurlesen": True},
        ],
    },
}

SQL_TYP = {"number": "REAL", "money": "REAL", "bool": "INTEGER", "ref": "INTEGER"}

EXTRA_SQL = """
CREATE TABLE IF NOT EXISTS benutzer (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    passwort TEXT NOT NULL,
    rolle TEXT NOT NULL DEFAULT 'benutzer',
    rechte TEXT,
    aktiv INTEGER NOT NULL DEFAULT 1,
    erstellt TEXT
);
CREATE TABLE IF NOT EXISTS sitzungen (
    token TEXT PRIMARY KEY,
    benutzer_id INTEGER NOT NULL,
    ablauf TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS wartung_historie (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wartung_id INTEGER NOT NULL,
    datum TEXT NOT NULL,
    ergebnis TEXT,
    bemerkung TEXT,
    erfasst_von TEXT,
    ticket_id INTEGER
);
CREATE TABLE IF NOT EXISTS ticket_kommentare (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL,
    zeit TEXT NOT NULL,
    autor TEXT,
    text TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS einstellungen (
    schluessel TEXT PRIMARY KEY,
    wert TEXT
);
CREATE TABLE IF NOT EXISTS verlauf (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    zeit TEXT NOT NULL,
    benutzer TEXT,
    aktion TEXT NOT NULL,
    tabelle TEXT,
    datensatz INTEGER,
    info TEXT
);
"""

_db_lock = threading.Lock()


def heute() -> dt.date:
    return dt.date.today()


def jetzt() -> str:
    return dt.datetime.now().isoformat(timespec="seconds")


def plus_monate(d: dt.date, monate: int) -> dt.date:
    m = d.month - 1 + int(monate)
    jahr = d.year + m // 12
    monat = m % 12 + 1
    tag = min(d.day, calendar.monthrange(jahr, monat)[1])
    return dt.date(jahr, monat, tag)


def db() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PFAD, timeout=15)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    con.execute("PRAGMA journal_mode = WAL")
    return con


def db_anlegen() -> None:
    DATEN.mkdir(parents=True, exist_ok=True)
    DOK_PFAD.mkdir(parents=True, exist_ok=True)
    PLAN_PFAD.mkdir(parents=True, exist_ok=True)
    SYM_PFAD.mkdir(parents=True, exist_ok=True)
    with db() as con:
        for name, res in RESSOURCEN.items():
            spalten = ["id INTEGER PRIMARY KEY AUTOINCREMENT"]
            for f in res["felder"]:
                spalten.append(f'"{f["name"]}" {SQL_TYP.get(f["typ"], "TEXT")}')
            if name == "dokumente" or res.get("datei"):
                spalten.append('"pfad" TEXT')
            spalten += ['"erstellt" TEXT', '"geaendert" TEXT']
            con.execute(f'CREATE TABLE IF NOT EXISTS "{name}" ({", ".join(spalten)})')
            # neue Felder in bestehende Datenbank nachtragen
            vorhanden = {r["name"] for r in con.execute(f'PRAGMA table_info("{name}")')}
            for f in res["felder"]:
                if f["name"] not in vorhanden:
                    con.execute(f'ALTER TABLE "{name}" ADD COLUMN "{f["name"]}" {SQL_TYP.get(f["typ"], "TEXT")}')
        con.executescript(EXTRA_SQL)
        for r in con.execute("SELECT id FROM anlagen WHERE qr_token IS NULL OR qr_token=''").fetchall():
            con.execute("UPDATE anlagen SET qr_token=? WHERE id=?", (neuer_qr_token(), r["id"]))
        con.execute('CREATE UNIQUE INDEX IF NOT EXISTS "ux_anlagen_qr" ON anlagen(qr_token)')
        if "rechte" not in {r["name"] for r in con.execute("PRAGMA table_info(benutzer)")}:
            con.execute("ALTER TABLE benutzer ADD COLUMN rechte TEXT")
        con.execute("UPDATE benutzer SET rolle='zuschauer' WHERE rolle='lesen'")
        vorhanden = {r["name"] for r in con.execute("PRAGMA table_info(wartung_historie)")}
        for spalte, typ in (("lat", "REAL"), ("lon", "REAL"), ("checkliste", "TEXT")):
            if spalte not in vorhanden:
                con.execute(f"ALTER TABLE wartung_historie ADD COLUMN {spalte} {typ}")
        for idx in [
            "anlagen(objekt_id)", "wartungen(objekt_id)", "wartungen(naechste)", "tickets(objekt_id)",
            "tickets(status)", "vertraege(objekt_id)", "zaehler(objekt_id)", "ablesungen(zaehler_id)",
            "dokumente(objekt_id)", "anlagen(plan_id)", "plaene(objekt_id)", "wartung_historie(wartung_id)", "ticket_kommentare(ticket_id)",
        ]:
            tab, spalte = idx[:-1].split("(")
            con.execute(f'CREATE INDEX IF NOT EXISTS "ix_{tab}_{spalte}" ON {idx}')


# ---------------------------------------------------------------------------
# Passwoerter und Sitzungen
# ---------------------------------------------------------------------------
def passwort_hash(pw: str) -> str:
    salz = secrets.token_bytes(16)
    h = hashlib.pbkdf2_hmac("sha256", pw.encode(), salz, 240_000)
    return f"pbkdf2${salz.hex()}${h.hex()}"


def passwort_pruefen(pw: str, gespeichert: str) -> bool:
    try:
        _, salz, h = gespeichert.split("$")
    except ValueError:
        return False
    neu = hashlib.pbkdf2_hmac("sha256", pw.encode(), bytes.fromhex(salz), 240_000)
    return hmac.compare_digest(neu.hex(), h)


class Fehler(Exception):
    def __init__(self, status: int, text: str):
        super().__init__(text)
        self.status = status
        self.text = text


def protokollieren(con, benutzer, aktion, tabelle=None, datensatz=None, info=None):
    con.execute(
        "INSERT INTO verlauf (zeit, benutzer, aktion, tabelle, datensatz, info) VALUES (?,?,?,?,?,?)",
        (jetzt(), benutzer["name"] if benutzer else None, aktion, tabelle, datensatz, info),
    )


# ---------------------------------------------------------------------------
# Werte pruefen
# ---------------------------------------------------------------------------
DATUM_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def wert_pruefen(feld: dict, wert):
    if wert is None or (isinstance(wert, str) and wert.strip() == ""):
        if feld.get("pflicht"):
            raise Fehler(400, f'Bitte „{feld["label"]}“ ausfüllen.')
        return None
    t = feld["typ"]
    if t in ("number", "money"):
        try:
            return float(str(wert).replace(",", "."))
        except ValueError:
            raise Fehler(400, f'„{feld["label"]}“ muss eine Zahl sein.')
    if t in ("ref",):
        try:
            return int(wert)
        except (TypeError, ValueError):
            raise Fehler(400, f'„{feld["label"]}“ ist ungültig.')
    if t == "bool":
        return 1 if wert in (True, 1, "1", "true", "on", "ja") else 0
    if t == "date":
        wert = str(wert)[:10]
        if not DATUM_RE.match(wert):
            raise Fehler(400, f'„{feld["label"]}“ ist kein gültiges Datum.')
        return wert
    if t == "select":
        if wert not in feld["optionen"]:
            raise Fehler(400, f'„{feld["label"]}“: Wert nicht erlaubt.')
        return wert
    wert = str(wert).strip()
    if len(wert) > 20000:
        raise Fehler(400, f'„{feld["label"]}“ ist zu lang.')
    return wert


def daten_pruefen(res: dict, daten: dict, neu: bool) -> dict:
    sauber = {}
    for f in res["felder"]:
        if f.get("nurlesen"):
            continue
        if f["name"] in daten:
            sauber[f["name"]] = wert_pruefen(f, daten[f["name"]])
        elif neu:
            if "standard" in f:
                sauber[f["name"]] = f["standard"]
            elif f.get("pflicht"):
                raise Fehler(400, f'Bitte „{f["label"]}“ ausfüllen.')
    return sauber


def zeile(r: sqlite3.Row | None) -> dict | None:
    return dict(r) if r is not None else None


# ---------------------------------------------------------------------------
# Fachlogik
# ---------------------------------------------------------------------------
def dashboard(con) -> dict:
    h = heute()
    in30 = (h + dt.timedelta(days=30)).isoformat()
    hs = h.isoformat()
    offen = "status NOT IN ('Erledigt','Abgeschlossen')"
    k = lambda sql, *p: con.execute(sql, p).fetchone()[0]
    vertraege = [dict(r) for r in con.execute(
        "SELECT * FROM vertraege WHERE ende IS NOT NULL ORDER BY ende")]
    kuendigen = []
    for v in vertraege:
        try:
            ende = dt.date.fromisoformat(v["ende"])
        except (TypeError, ValueError):
            continue
        frist = plus_monate(ende, -int(v["kuendigungsfrist_monate"] or 0))
        v["kuendigen_bis"] = frist.isoformat()
        if h <= frist <= h + dt.timedelta(days=90):
            kuendigen.append(v)
    return {
        "kennzahlen": {
            "objekte": k("SELECT COUNT(*) FROM objekte"),
            "anlagen": k("SELECT COUNT(*) FROM anlagen"),
            "tickets_offen": k(f"SELECT COUNT(*) FROM tickets WHERE {offen}"),
            "tickets_notfall": k(f"SELECT COUNT(*) FROM tickets WHERE {offen} AND prioritaet='Notfall'"),
            "wartung_ueberfaellig": k("SELECT COUNT(*) FROM wartungen WHERE aktiv=1 AND naechste < ?", hs),
            "wartung_30": k("SELECT COUNT(*) FROM wartungen WHERE aktiv=1 AND naechste BETWEEN ? AND ?", hs, in30),
            "vertraege_kuendigen": len(kuendigen),
        },
        "faellig": [dict(r) for r in con.execute(
            "SELECT * FROM wartungen WHERE aktiv=1 AND naechste <= ? ORDER BY naechste LIMIT 12", (in30,))],
        "tickets": [dict(r) for r in con.execute(
            f"SELECT * FROM tickets WHERE {offen} ORDER BY CASE prioritaet WHEN 'Notfall' THEN 0 "
            "WHEN 'Hoch' THEN 1 WHEN 'Normal' THEN 2 ELSE 3 END, id DESC LIMIT 12")],
        "kuendigen": kuendigen[:8],
        "tickets_nach_status": {r[0]: r[1] for r in con.execute(
            "SELECT status, COUNT(*) FROM tickets GROUP BY status")},
    }


def wartung_erledigt(con, benutzer, wid: int, daten: dict) -> dict:
    w = zeile(con.execute("SELECT * FROM wartungen WHERE id=?", (wid,)).fetchone())
    if not w:
        raise Fehler(404, "Wartung nicht gefunden.")
    datum = wert_pruefen({"label": "Datum", "typ": "date", "pflicht": True}, daten.get("datum"))
    ergebnis = daten.get("ergebnis") or "Ohne Mängel"
    if ergebnis not in ("Ohne Mängel", "Mängel behoben", "Mängel offen", "Nicht durchgeführt"):
        raise Fehler(400, "Ergebnis ist ungültig.")
    bemerkung = (daten.get("bemerkung") or "").strip()[:5000]
    checkliste = daten.get("checkliste")
    if checkliste is not None:
        if not isinstance(checkliste, list) or len(checkliste) > 100:
            raise Fehler(400, "Checkliste ist ungültig.")
        checkliste = json.dumps([{"text": str(c.get("text", ""))[:300], "ok": bool(c.get("ok"))}
                                 for c in checkliste if isinstance(c, dict)], ensure_ascii=False)
    lat = lon = None
    if daten.get("lat") is not None and daten.get("lon") is not None:
        try:
            lat, lon = float(daten["lat"]), float(daten["lon"])
        except (TypeError, ValueError):
            lat = lon = None
    if w["anlage_id"]:
        a = con.execute("SELECT gps_pflicht FROM anlagen WHERE id=?", (w["anlage_id"],)).fetchone()
        if a and a["gps_pflicht"] and lat is None:
            raise Fehler(400, "Für diese Anlage ist der Standort (GPS) Pflicht. Bitte die Standortfreigabe im Browser erlauben.")
    ticket_id = None
    if ergebnis == "Mängel offen" and daten.get("ticket_anlegen"):
        ticket_id = ticket_anlegen(con, benutzer, {
            "objekt_id": w["objekt_id"], "anlage_id": w["anlage_id"],
            "titel": f'Mangel aus {w["art"]}: {w["titel"]}', "beschreibung": bemerkung,
            "prioritaet": "Hoch", "status": "Neu", "gemeldet_von": benutzer["name"],
            "gemeldet_am": datum, "dienstleister_id": w["dienstleister_id"],
        })
    con.execute(
        "INSERT INTO wartung_historie (wartung_id, datum, ergebnis, bemerkung, erfasst_von, ticket_id, lat, lon, checkliste) "
        "VALUES (?,?,?,?,?,?,?,?,?)", (wid, datum, ergebnis, bemerkung, benutzer["name"], ticket_id, lat, lon, checkliste))
    if ergebnis != "Nicht durchgeführt":
        naechste = plus_monate(dt.date.fromisoformat(datum), int(w["intervall_monate"] or 12)).isoformat()
        con.execute("UPDATE wartungen SET letzte=?, naechste=?, geaendert=? WHERE id=?",
                    (datum, naechste, jetzt(), wid))
    protokollieren(con, benutzer, "erledigt", "wartungen", wid, ergebnis)
    return {"ok": True, "ticket_id": ticket_id}


def ticket_anlegen(con, benutzer, daten: dict) -> int:
    sauber = daten_pruefen(RESSOURCEN["tickets"], daten, neu=True)
    sauber.setdefault("gemeldet_am", heute().isoformat())
    if not sauber.get("gemeldet_am"):
        sauber["gemeldet_am"] = heute().isoformat()
    neue_id = einfuegen(con, "tickets", sauber)
    nummer = f"S-{heute().year}-{neue_id:04d}"
    con.execute("UPDATE tickets SET nummer=? WHERE id=?", (nummer, neue_id))
    protokollieren(con, benutzer, "angelegt", "tickets", neue_id, sauber.get("titel"))
    return neue_id


def neuer_qr_token() -> str:
    return secrets.token_urlsafe(12)


EINSTELLUNGEN_STANDARD = {"basis_url": "", "oeffentlich_melden": "0"}


def einstellung(con, schluessel: str) -> str:
    r = con.execute("SELECT wert FROM einstellungen WHERE schluessel=?", (schluessel,)).fetchone()
    return r["wert"] if r and r["wert"] is not None else EINSTELLUNGEN_STANDARD.get(schluessel, "")


def einfuegen(con, tabelle: str, sauber: dict) -> int:
    sauber = dict(sauber)
    if tabelle == "anlagen" and not sauber.get("qr_token"):
        sauber["qr_token"] = neuer_qr_token()
    sauber["erstellt"] = sauber["geaendert"] = jetzt()
    spalten = ", ".join(f'"{k}"' for k in sauber)
    platz = ", ".join("?" for _ in sauber)
    cur = con.execute(f'INSERT INTO "{tabelle}" ({spalten}) VALUES ({platz})', list(sauber.values()))
    return cur.lastrowid


def bild_endung(inhalt: bytes) -> str | None:
    if inhalt.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if inhalt.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if inhalt[:4] == b"RIFF" and inhalt[8:12] == b"WEBP":
        return "webp"
    if inhalt[:6] in (b"GIF87a", b"GIF89a"):
        return "gif"
    return None


def plan_anlagen(con, pid: int) -> dict:
    plan = zeile(con.execute("SELECT * FROM plaene WHERE id=?", (pid,)).fetchone())
    if not plan:
        raise Fehler(404, "Plan nicht gefunden.")
    plan.pop("pfad", None)
    h = heute()
    hs, in30 = h.isoformat(), (h + dt.timedelta(days=30)).isoformat()
    tickets = {r[0]: r[1] for r in con.execute(
        "SELECT anlage_id, COUNT(*) FROM tickets WHERE anlage_id IS NOT NULL "
        "AND status NOT IN ('Erledigt','Abgeschlossen') GROUP BY anlage_id")}
    naechste = {r[0]: r[1] for r in con.execute(
        "SELECT anlage_id, MIN(naechste) FROM wartungen WHERE aktiv=1 AND anlage_id IS NOT NULL GROUP BY anlage_id")}
    fotos = {r[0]: r[1] for r in con.execute(
        "SELECT anlage_id, MIN(id) FROM dokumente WHERE kategorie='Foto' AND anlage_id IS NOT NULL GROUP BY anlage_id")}
    alle = []
    for r in con.execute("SELECT * FROM anlagen WHERE objekt_id=? ORDER BY bezeichnung", (plan["objekt_id"],)):
        a = dict(r)
        a["foto_id"] = fotos.get(a["id"])
        a["tickets_offen"] = tickets.get(a["id"], 0)
        a["naechste"] = naechste.get(a["id"])
        if a["tickets_offen"] or (a["naechste"] and a["naechste"] < hs) or a["status"] == "Außer Betrieb":
            a["ampel"] = "rot"
        elif (a["naechste"] and a["naechste"] <= in30) or a["status"] == "Eingeschränkt":
            a["ampel"] = "gelb"
        else:
            a["ampel"] = "gruen"
        alle.append(a)
    return {"plan": plan,
            "platziert": [a for a in alle if a["plan_id"] == pid],
            "frei": [a for a in alle if not a["plan_id"]]}


# ---------------------------------------------------------------------------
# Rollen und Rechte
# ---------------------------------------------------------------------------
ROLLEN = {"admin": "Administrator", "benutzer": "Benutzer", "zuschauer": "Zuschauer"}
RECHTE = [
    ("anlagen_bearbeiten", "Objekte und Anlagen anlegen und ändern", "Bestand"),
    ("plaene_bearbeiten", "Grundrisse hochladen, Symbole setzen und verschieben", "Bestand"),
    ("tickets_anlegen", "Störmeldungen und Mängel anlegen", "Störungen"),
    ("tickets_bearbeiten", "Störmeldungen bearbeiten, Status ändern, Notizen", "Störungen"),
    ("wartung_planen", "Wartungsplan: Aufgaben anlegen und ändern", "Wartung"),
    ("wartung_erledigen", "Wartungen und Prüfungen als erledigt melden", "Wartung"),
    ("vertraege_bearbeiten", "Verträge und Dienstleister bearbeiten", "Verwaltung"),
    ("zaehler_erfassen", "Zähler anlegen und Zählerstände erfassen", "Verwaltung"),
    ("dokumente_hochladen", "Dokumente und Fotos hochladen", "Verwaltung"),
    ("export", "Listen nach Excel exportieren", "Verwaltung"),
    ("loeschen", "Einträge löschen", "Verwaltung"),
    ("benutzer_verwalten", "Zugänge und Rechte verwalten, Änderungsverlauf sehen", "System"),
    ("einstellungen", "Einstellungen ändern (QR-Adresse, Melden ohne Anmeldung)", "System"),
]
RECHTE_KEYS = [r[0] for r in RECHTE]
RECHTE_STANDARD = {
    "benutzer": {k: k not in ("loeschen", "benutzer_verwalten", "einstellungen") for k in RECHTE_KEYS},
    "zuschauer": {k: k == "export" for k in RECHTE_KEYS},
}


def rollen_rechte(con) -> dict:
    r = con.execute("SELECT wert FROM einstellungen WHERE schluessel='rechte_rollen'").fetchone()
    gespeichert = {}
    if r and r["wert"]:
        try:
            gespeichert = json.loads(r["wert"])
        except ValueError:
            gespeichert = {}
    erg = {}
    for rolle, std in RECHTE_STANDARD.items():
        eigen = gespeichert.get(rolle, {}) if isinstance(gespeichert.get(rolle), dict) else {}
        erg[rolle] = {k: bool(eigen.get(k, v)) for k, v in std.items()}
    return erg


def benutzer_abweichungen(b) -> dict:
    try:
        d = json.loads(b["rechte"] or "{}") if "rechte" in b.keys() else {}
    except (ValueError, TypeError):
        d = {}
    return {k: bool(v) for k, v in d.items() if k in RECHTE_KEYS} if isinstance(d, dict) else {}


def effektive_rechte(con, b) -> dict:
    if not b:
        return {}
    if b["rolle"] == "admin":
        return {k: True for k in RECHTE_KEYS}
    basis = rollen_rechte(con).get(b["rolle"], RECHTE_STANDARD["zuschauer"])
    return {**basis, **benutzer_abweichungen(b)}


RESSOURCE_RECHT = {
    "objekte": "anlagen_bearbeiten", "anlagen": "anlagen_bearbeiten", "plaene": "plaene_bearbeiten",
    "symbole": "plaene_bearbeiten", "wartungen": "wartung_planen", "vertraege": "vertraege_bearbeiten",
    "dienstleister": "vertraege_bearbeiten", "zaehler": "zaehler_erfassen", "ablesungen": "zaehler_erfassen",
    "dokumente": "dokumente_hochladen",
}


def benoetigtes_recht(m: str, teile: list[str]) -> str | None:
    t0 = teile[0] if teile else ""
    if m == "GET":
        if t0 == "export":
            return "export"
        if t0 in ("verlauf", "benutzer", "rechte"):
            return "benutzer_verwalten"
        return None
    if t0 == "benutzer":
        return None if teile[-1] == "passwort" else "benutzer_verwalten"
    if t0 == "rechte":
        return "benutzer_verwalten"
    if t0 == "einstellungen":
        return "einstellungen"
    if m == "DELETE":
        return "loeschen"
    if t0 == "wartungen" and len(teile) == 3 and teile[2] == "erledigt":
        return "wartung_erledigen"
    if t0 == "tickets":
        return "tickets_anlegen" if len(teile) == 1 and m == "POST" else "tickets_bearbeiten"
    if t0 == "anlagen" and len(teile) == 3 and teile[2] == "position":
        return "plaene_bearbeiten"
    return RESSOURCE_RECHT.get(t0)


_fehlversuche: dict[str, list[float]] = {}


def anmelde_bremse(schluessel: str, fehlgeschlagen: bool | None = None) -> None:
    """Nach 5 falschen Versuchen in 15 Minuten wird die Anmeldung kurz gesperrt."""
    import time
    jetzt_s = time.time()
    liste = [t for t in _fehlversuche.get(schluessel, []) if jetzt_s - t < 900]
    if fehlgeschlagen is None:
        if len(liste) >= 5:
            raise Fehler(429, "Zu viele falsche Versuche. Bitte in 15 Minuten noch einmal versuchen.")
    elif fehlgeschlagen:
        liste.append(jetzt_s)
    else:
        liste = []
    _fehlversuche[schluessel] = liste


_qr_zeiten: dict[str, list[float]] = {}


def qr_bremse(ip: str) -> None:
    """Höchstens 10 Meldungen je Stunde und Adresse ohne Anmeldung."""
    import time
    jetzt_s = time.time()
    liste = [t for t in _qr_zeiten.get(ip, []) if jetzt_s - t < 3600]
    if len(liste) >= 10:
        raise Fehler(429, "Zu viele Meldungen in kurzer Zeit. Bitte später noch einmal versuchen.")
    liste.append(jetzt_s)
    _qr_zeiten[ip] = liste


def anlage_aktivitaet(con, aid: int) -> list[dict]:
    if not con.execute("SELECT 1 FROM anlagen WHERE id=?", (aid,)).fetchone():
        raise Fehler(404, "Anlage nicht gefunden.")
    ein = []
    for v in con.execute("SELECT * FROM verlauf WHERE tabelle='anlagen' AND datensatz=?", (aid,)):
        ein.append({"zeit": v["zeit"], "wer": v["benutzer"], "art": v["aktion"], "info": v["info"], "typ": "anlage"})
    for d in con.execute("SELECT * FROM dokumente WHERE anlage_id=?", (aid,)):
        ein.append({"zeit": d["erstellt"], "wer": d["hochgeladen_von"], "art": "foto" if d["kategorie"] == "Foto" else "dokument",
                    "info": d["titel"], "id": d["id"], "typ": "dokument"})
    for t in con.execute("SELECT * FROM tickets WHERE anlage_id=?", (aid,)):
        ein.append({"zeit": t["erstellt"], "wer": t["gemeldet_von"], "art": "meldung", "info": f'{t["nummer"]} {t["titel"]}',
                    "id": t["id"], "typ": "ticket", "status": t["status"]})
    wids = {w["id"]: w for w in con.execute("SELECT * FROM wartungen WHERE anlage_id=?", (aid,))}
    if wids:
        platz = ",".join("?" * len(wids))
        for v in con.execute(f"SELECT * FROM verlauf WHERE tabelle='wartungen' AND aktion='angelegt' AND datensatz IN ({platz})",
                             list(wids)):
            ein.append({"zeit": v["zeit"], "wer": v["benutzer"], "art": "aufgabe", "info": wids[v["datensatz"]]["titel"],
                        "id": v["datensatz"], "typ": "wartung"})
        for h in con.execute(f"SELECT * FROM wartung_historie WHERE wartung_id IN ({platz})", list(wids)):
            ein.append({"zeit": h["datum"] + "T12:00:00", "wer": h["erfasst_von"], "art": "erledigt",
                        "info": wids[h["wartung_id"]]["titel"], "ergebnis": h["ergebnis"], "id": h["wartung_id"],
                        "typ": "wartung", "gps": h["lat"] is not None})
    ein.sort(key=lambda e: e["zeit"] or "", reverse=True)
    return ein


def wartungsplan(con, jahr: int, q: dict) -> dict:
    von, bis = dt.date(jahr, 1, 1), dt.date(jahr, 12, 31)
    bed, werte = ["w.aktiv=1"], []
    for feld, spalte in (("objekt_id", "w.objekt_id"), ("gewerk", "a.gewerk"), ("art", "w.art"), ("anlage_id", "w.anlage_id")):
        if q.get(feld) and q[feld][0]:
            bed.append(f"{spalte}=?")
            werte.append(q[feld][0])
    if q.get("pflicht") and q["pflicht"][0] == "1":
        bed.append("(a.pruefung_pflicht=1 OR a.wartung_pflicht=1)")
    zeilen = []
    for r in con.execute(
            "SELECT w.*, a.bezeichnung AS a_bez, a.nummer AS a_nr, a.gewerk AS a_gewerk, a.planzeichen AS a_zeichen, "
            "a.symbol_id AS a_symbol, a.pruefung_pflicht AS a_pp, a.wartung_pflicht AS a_wp, "
            "o.kuerzel AS o_kuerzel, o.name AS o_name FROM wartungen w "
            "LEFT JOIN anlagen a ON a.id=w.anlage_id LEFT JOIN objekte o ON o.id=w.objekt_id "
            f"WHERE {' AND '.join(bed)} ORDER BY o.kuerzel COLLATE NOCASE, a.nummer COLLATE NOCASE, "
            "a.bezeichnung COLLATE NOCASE, w.titel COLLATE NOCASE", werte):
        z = dict(r)
        termine = []
        try:
            d = dt.date.fromisoformat(z["naechste"])
        except (TypeError, ValueError):
            d = None
        iv = max(int(z["intervall_monate"] or 12), 1)
        schritte = 0
        while d and d <= bis and schritte < 500:
            if d >= von:
                termine.append(d.isoformat())
            d = plus_monate(d, iv)
            schritte += 1
        z["termine"] = termine
        z["erledigt"] = [dict(h) for h in con.execute(
            "SELECT datum, ergebnis FROM wartung_historie WHERE wartung_id=? AND datum BETWEEN ? AND ? ORDER BY datum",
            (z["id"], von.isoformat(), bis.isoformat()))]
        zeilen.append(z)
    ohne = []
    obed, owerte = ["NOT EXISTS (SELECT 1 FROM wartungen w WHERE w.anlage_id=a.id AND w.aktiv=1)"], []
    if q.get("objekt_id") and q["objekt_id"][0]:
        obed.append("a.objekt_id=?")
        owerte.append(q["objekt_id"][0])
    if q.get("gewerk") and q["gewerk"][0]:
        obed.append("a.gewerk=?")
        owerte.append(q["gewerk"][0])
    for r in con.execute(f"SELECT a.* FROM anlagen a WHERE {' AND '.join(obed)} ORDER BY a.bezeichnung COLLATE NOCASE", owerte):
        ohne.append(dict(r))
    return {"jahr": jahr, "aufgaben": zeilen, "ohne_plan": ohne}


def anlage_position(con, benutzer, aid: int, d: dict) -> dict:
    a = zeile(con.execute("SELECT * FROM anlagen WHERE id=?", (aid,)).fetchone())
    if not a:
        raise Fehler(404, "Anlage nicht gefunden.")
    if d.get("plan_id") in (None, "", 0):
        con.execute("UPDATE anlagen SET plan_id=NULL, plan_x=NULL, plan_y=NULL, geaendert=? WHERE id=?",
                    (jetzt(), aid))
        protokollieren(con, benutzer, "vom Plan genommen", "anlagen", aid)
        return {"ok": True}
    try:
        pid, x, y = int(d["plan_id"]), float(d["x"]), float(d["y"])
    except (KeyError, TypeError, ValueError):
        raise Fehler(400, "Position ist ungültig.")
    if not (0 <= x <= 1 and 0 <= y <= 1):
        raise Fehler(400, "Die Position liegt außerhalb des Plans.")
    plan = con.execute("SELECT objekt_id FROM plaene WHERE id=?", (pid,)).fetchone()
    if not plan:
        raise Fehler(404, "Plan nicht gefunden.")
    if plan["objekt_id"] != a["objekt_id"]:
        raise Fehler(400, "Die Anlage gehört zu einem anderen Objekt als der Plan.")
    con.execute("UPDATE anlagen SET plan_id=?, plan_x=?, plan_y=?, geaendert=? WHERE id=?",
                (pid, round(x, 5), round(y, 5), jetzt(), aid))
    if a["plan_id"] != pid:
        protokollieren(con, benutzer, "auf Plan gesetzt", "anlagen", aid, f"Plan {pid}")
    return {"ok": True}


def verbrauch(con, zaehler_id: int) -> dict:
    z = zeile(con.execute("SELECT * FROM zaehler WHERE id=?", (zaehler_id,)).fetchone())
    if not z:
        raise Fehler(404, "Zähler nicht gefunden.")
    faktor = z["faktor"] or 1
    rows = [dict(r) for r in con.execute(
        "SELECT * FROM ablesungen WHERE zaehler_id=? ORDER BY datum, id", (zaehler_id,))]
    vorher = None
    for r in rows:
        r["verbrauch"] = None if vorher is None else round((r["stand"] - vorher["stand"]) * faktor, 3)
        vorher = r
    # Verbrauch je Monat (anteilig auf Tage verteilt waere genauer, hier: dem Ablesemonat zugeordnet)
    monate: dict[str, float] = {}
    for r in rows:
        if r["verbrauch"] is not None:
            monate[r["datum"][:7]] = monate.get(r["datum"][:7], 0) + r["verbrauch"]
    return {"zaehler": z, "ablesungen": rows[::-1], "monate": monate}


def kalender(con, von: str, bis: str) -> list[dict]:
    eintraege = []
    for w in con.execute("SELECT * FROM wartungen WHERE aktiv=1 AND naechste BETWEEN ? AND ?", (von, bis)):
        eintrag = {"datum": w["naechste"], "art": w["art"], "titel": w["titel"], "id": w["id"],
                   "objekt_id": w["objekt_id"], "typ": "wartungen"}
        if w["naechste"] < heute().isoformat():
            eintrag["ueberfaellig"] = w["naechste"]
        eintraege.append(eintrag)
        # Folgetermine im Zeitraum
        d = dt.date.fromisoformat(w["naechste"])
        for _ in range(60):
            d = plus_monate(d, int(w["intervall_monate"] or 12))
            if d.isoformat() > bis:
                break
            eintraege.append({"datum": d.isoformat(), "art": w["art"], "titel": w["titel"], "id": w["id"],
                              "objekt_id": w["objekt_id"], "typ": "wartungen", "geplant": True})
    for w in con.execute("SELECT * FROM wartungen WHERE aktiv=1 AND naechste < ?", (von,)):
        if von <= heute().isoformat() <= bis:
            eintraege.append({"datum": heute().isoformat(), "art": w["art"], "titel": w["titel"], "id": w["id"],
                              "objekt_id": w["objekt_id"], "typ": "wartungen", "ueberfaellig": w["naechste"]})
    for t in con.execute(
            "SELECT * FROM tickets WHERE faellig_am BETWEEN ? AND ? AND status NOT IN ('Erledigt','Abgeschlossen')",
            (von, bis)):
        eintraege.append({"datum": t["faellig_am"], "art": "Störmeldung", "titel": t["titel"], "id": t["id"],
                          "objekt_id": t["objekt_id"], "typ": "tickets"})
    for v in con.execute("SELECT * FROM vertraege WHERE ende IS NOT NULL"):
        try:
            frist = plus_monate(dt.date.fromisoformat(v["ende"]), -int(v["kuendigungsfrist_monate"] or 0))
        except ValueError:
            continue
        if von <= frist.isoformat() <= bis:
            eintraege.append({"datum": frist.isoformat(), "art": "Kündigungsfrist", "titel": v["titel"],
                              "id": v["id"], "objekt_id": v["objekt_id"], "typ": "vertraege"})
    eintraege.sort(key=lambda e: e["datum"])
    return eintraege


def suche(con, q: str) -> list[dict]:
    q = q.strip()
    if len(q) < 2:
        return []
    like = f"%{q}%"
    treffer = []
    for name, res in RESSOURCEN.items():
        if res.get("versteckt"):
            continue
        textfelder = [f["name"] for f in res["felder"] if f["typ"] in ("text", "textarea", "email", "tel")]
        if not textfelder:
            continue
        bed = " OR ".join(f'"{f}" LIKE ?' for f in textfelder)
        for r in con.execute(f'SELECT * FROM "{name}" WHERE {bed} LIMIT 8', [like] * len(textfelder)):
            treffer.append({"typ": name, "id": r["id"], "titel": " · ".join(
                str(r[a]) for a in res["anzeige"] if r[a]), "bereich": res["einzahl"]})
    return treffer[:40]


# ---------------------------------------------------------------------------
# Beispieldaten (frei erfunden, nur zum Ausprobieren)
# ---------------------------------------------------------------------------
def beispieldaten(con) -> None:
    if con.execute("SELECT COUNT(*) FROM objekte").fetchone()[0]:
        return
    h = heute()
    d = lambda tage: (h + dt.timedelta(days=tage)).isoformat()
    ins = lambda tab, **kw: einfuegen(con, tab, kw)
    o1 = ins("objekte", kuerzel="MUS 1", name="Bürohaus Musterallee", strasse="Musterallee 1", plz="60311",
             ort="Frankfurt am Main", nutzung="Büro", flaeche_m2=12400, baujahr=2004,
             eigentuemer="Beispiel Immobilien GmbH", objektleiter="Beispiel Objektleitung",
             notiz="Beispieldaten zum Ausprobieren.")
    o2 = ins("objekte", kuerzel="BSP 7", name="Gewerbepark Beispielweg", strasse="Beispielweg 7", plz="63303",
             ort="Dreieich", nutzung="Gewerbe", flaeche_m2=8600, baujahr=1998,
             eigentuemer="Muster Asset Management", objektleiter="Beispiel Objektleitung")
    dl = {
        "auf": ins("dienstleister", firma="Beispiel Aufzüge GmbH", gewerk="Aufzug", ansprechpartner="Herr Muster",
                   telefon="069 000000-1", notdienst="069 000000-99", email="service@beispiel-aufzuege.example"),
        "bs": ins("dienstleister", firma="Muster Brandschutz KG", gewerk="Brandschutz", ansprechpartner="Frau Beispiel",
                  telefon="069 000000-2", email="info@muster-brandschutz.example"),
        "hz": ins("dienstleister", firma="Beispiel Haustechnik", gewerk="Heizung", ansprechpartner="Herr Probe",
                  telefon="069 000000-3", email="kontakt@beispiel-haustechnik.example"),
        "el": ins("dienstleister", firma="Muster Elektro GmbH", gewerk="Elektro", ansprechpartner="Frau Test",
                  telefon="069 000000-4", email="buero@muster-elektro.example"),
    }
    anl = {
        "a1": ins("anlagen", objekt_id=o1, bezeichnung="Personenaufzug A", gewerk="Aufzug", standort="Kern Nord",
                  hersteller="Beispielhersteller", typ="PA 1000", baujahr=2004, status="In Betrieb"),
        "a2": ins("anlagen", objekt_id=o1, bezeichnung="Personenaufzug B", gewerk="Aufzug", standort="Kern Süd",
                  hersteller="Beispielhersteller", typ="PA 1000", baujahr=2004, status="Eingeschränkt"),
        "bma": ins("anlagen", objekt_id=o1, bezeichnung="Brandmeldeanlage", gewerk="Brandschutz",
                   standort="UG, Raum 0.12", hersteller="Musterwerk", status="In Betrieb"),
        "hz": ins("anlagen", objekt_id=o1, bezeichnung="Gas-Brennwertkessel 1", gewerk="Heizung",
                  standort="UG, Heizzentrale", hersteller="Musterwerk", baujahr=2016, status="In Betrieb"),
        "rlt": ins("anlagen", objekt_id=o1, bezeichnung="RLT-Anlage Büro", gewerk="Lüftung/Klima",
                   standort="Dach", baujahr=2004, status="In Betrieb"),
        "tor": ins("anlagen", objekt_id=o2, bezeichnung="Rolltor Halle 2", gewerk="Türen/Tore", standort="Halle 2",
                   status="In Betrieb"),
        "nsv": ins("anlagen", objekt_id=o2, bezeichnung="Niederspannungshauptverteilung", gewerk="Elektro",
                   standort="Technikraum", status="In Betrieb"),
    }
    for key, nr, gruppe, extra in [
        ("a1", "1.2.01.0010", "Fördertechnik", {"pruefung_pflicht": 1, "wartung_pflicht": 1}),
        ("a2", "1.2.01.0020", "Fördertechnik", {"pruefung_pflicht": 1, "wartung_pflicht": 1}),
        ("bma", "1.4.01.0010", "Brandschutz", {"pruefung_pflicht": 1, "wartung_pflicht": 1}),
        ("hz", "1.1.01.0010", "Heizung & Sanitär", {}),
        ("rlt", "1.3.01.0010", "Klima, Kälte & Lüftung (RLT)", {}),
        ("tor", "2.6.01.0010", "Sonstiges", {"pruefung_pflicht": 1}),
        ("nsv", "2.5.01.0010", "Elektro & Beleuchtung", {"pruefung_pflicht": 1}),
    ]:
        felder = {"nummer": nr, "gruppe": gruppe, "manager": "Beispiel Objektleitung", **extra}
        setz = ", ".join(f'"{k}"=?' for k in felder)
        con.execute(f"UPDATE anlagen SET {setz} WHERE id=?", [*felder.values(), anl[key]])
    con.execute("UPDATE anlagen SET dienstleister_id=?, beauftragter=? WHERE id IN (?,?)",
                (dl["auf"], "Herr Muster", anl["a1"], anl["a2"]))
    con.execute("UPDATE anlagen SET beschreibung=? WHERE id=?",
                ("Zu- und Abluftanlage für die Büroflächen, Aufstellung auf dem Dach.", anl["rlt"]))
    W = [
        (o1, anl["a1"], "Wartung Personenaufzug A", "Wartung", "Herstellervorgabe", 3, d(-80), d(10), dl["auf"]),
        (o1, anl["a1"], "Hauptprüfung Aufzug A (ZÜS)", "Prüfung", "BetrSichV", 24, d(-700), d(30), dl["auf"]),
        (o1, anl["a2"], "Wartung Personenaufzug B", "Wartung", "Herstellervorgabe", 3, d(-100), d(-8), dl["auf"]),
        (o1, anl["bma"], "Prüfung Brandmeldeanlage", "Prüfung", "DIN 14675 / Prüfverordnung", 12, d(-340), d(25), dl["bs"]),
        (o1, anl["hz"], "Wartung Heizkessel", "Wartung", "Herstellervorgabe", 12, d(-300), d(65), dl["hz"]),
        (o1, anl["rlt"], "Hygieneinspektion RLT", "Inspektion", "VDI 6022", 24, d(-500), d(230), None),
        (o2, anl["tor"], "Prüfung Rolltor", "Prüfung", "ASR A1.7", 12, d(-380), d(-15), None),
        (o2, anl["nsv"], "E-Prüfung ortsfeste Anlagen", "Prüfung", "DGUV V3", 48, d(-1000), d(460), dl["el"]),
    ]
    for o, a, t, art, rg, iv, letzte, naechste, dlid in W:
        wid = ins("wartungen", objekt_id=o, anlage_id=a, titel=t, art=art, rechtsgrundlage=rg, intervall_monate=iv,
                  letzte=letzte, naechste=naechste, dienstleister_id=dlid, aktiv=1,
                  taetigkeiten="Sichtprüfung\nFunktionsprüfung\nProtokoll ablegen")
        if letzte:
            con.execute("INSERT INTO wartung_historie (wartung_id, datum, ergebnis, erfasst_von) VALUES (?,?,?,?)",
                        (wid, letzte, "Ohne Mängel", "Beispieldaten"))
    sys_user = {"name": "Beispieldaten"}
    for o, a, t, p, s, tage, dlid in [
        (o1, anl["a2"], "Aufzug B bleibt zwischen Etagen stehen", "Hoch", "Warten auf Dienstleister", -3, dl["auf"]),
        (o1, None, "Leuchtmittel Tiefgarage Ebene -1 defekt", "Normal", "Neu", -1, dl["el"]),
        (o2, anl["tor"], "Rolltor Halle 2 schließt nicht", "Notfall", "In Arbeit", 0, None),
        (o1, anl["hz"], "Heizung 3. OG zu kalt", "Normal", "Erledigt", -20, dl["hz"]),
    ]:
        tid = ticket_anlegen(con, sys_user, {"objekt_id": o, "anlage_id": a, "titel": t, "prioritaet": p,
                                             "status": s, "gemeldet_am": d(tage), "faellig_am": d(tage + 7),
                                             "dienstleister_id": dlid, "gemeldet_von": "Empfang"})
        con.execute("INSERT INTO ticket_kommentare (ticket_id, zeit, autor, text) VALUES (?,?,?,?)",
                    (tid, jetzt(), "Beispieldaten", "Meldung aufgenommen."))
    for o, dlid, t, g, beginn, ende, frist, betrag in [
        (o1, dl["auf"], "Wartungsvertrag Aufzüge", "Aufzug", "2022-01-01", d(120), 3, 7800),
        (o1, dl["bs"], "Wartung Brandmeldeanlage", "Brandschutz", "2023-04-01", d(400), 3, 2400),
        (o2, dl["el"], "Elektro-Rahmenvertrag", "Elektro", "2021-07-01", d(75), 1, 3600),
    ]:
        ins("vertraege", objekt_id=o, dienstleister_id=dlid, titel=t, gewerk=g, beginn=beginn, ende=ende,
            kuendigungsfrist_monate=frist, verlaengerung_monate=12, betrag_jahr=betrag)
    z1 = ins("zaehler", objekt_id=o1, nummer="1ESY0000000001", medium="Strom", einheit="kWh",
             standort="UG, Zählerraum", bezeichnung="Hauptzähler Allgemeinstrom", faktor=1)
    z2 = ins("zaehler", objekt_id=o1, nummer="W-000123", medium="Wasser", einheit="m³",
             standort="UG, Hausanschluss", bezeichnung="Hauptwasserzähler", faktor=1)
    stand1, stand2 = 152000.0, 8400.0
    for i in range(12, -1, -1):
        datum = plus_monate(h.replace(day=1), -i).isoformat()
        ins("ablesungen", zaehler_id=z1, datum=datum, stand=round(stand1))
        ins("ablesungen", zaehler_id=z2, datum=datum, stand=round(stand2, 1))
        stand1 += 9000 + (i % 4) * 900
        stand2 += 160 + (i % 3) * 25
    # Beispiel-Grundriss mit gesetzten Anlagen
    quelle = STATIC / "demo" / "grundriss-beispiel.png"
    if quelle.is_file():
        pid = ins("plaene", objekt_id=o1, titel="Grundriss 2. OG", gebaeude="Haupthaus", etage="2. OG",
                  dateiname=quelle.name, breite=2400, hoehe=1500)
        pfad = f"{pid:06d}_{secrets.token_hex(6)}.png"
        (PLAN_PFAD / pfad).write_bytes(quelle.read_bytes())
        con.execute("UPDATE plaene SET pfad=? WHERE id=?", (pfad, pid))
        for aid, x, y in [(anl["a1"], 0.475, 0.66), (anl["a2"], 0.51, 0.66), (anl["bma"], 0.69, 0.70),
                          (anl["hz"], 0.74, 0.80), (anl["rlt"], 0.49, 0.25)]:
            con.execute("UPDATE anlagen SET plan_id=?, plan_x=?, plan_y=? WHERE id=?", (pid, x, y, aid))
        for nr, (x, y) in enumerate([(0.15, 0.49), (0.62, 0.49), (0.93, 0.49), (0.36, 0.86)], 1):
            fid = ins("anlagen", objekt_id=o1, bezeichnung=f"Feuerlöscher {nr}", gewerk="Brandschutz",
                      planzeichen="F001 Feuerlöscher",
                      standort="Haupthaus, 2. OG", typ="ABC-Pulver 6 kg", status="In Betrieb")
            con.execute("UPDATE anlagen SET plan_id=?, plan_x=?, plan_y=? WHERE id=?", (pid, x, y, fid))
        con.execute("UPDATE anlagen SET planzeichen='BMZ Brandmeldezentrale' WHERE id=?", (anl["bma"],))
        for name, gewerk, zeichen, x, y in [
            ("Wandhydrant 1", "Brandschutz", "F002 Löschschlauch (Wandhydrant)", 0.40, 0.49),
            ("Handfeuermelder 1", "Brandschutz", "F005 Brandmelder (Handfeuermelder)", 0.565, 0.60),
            ("Notausgang Treppenhaus", "Flucht und Rettung", "E002 Notausgang rechts", 0.585, 0.53),
            ("Erste-Hilfe-Kasten", "Flucht und Rettung", "E003 Erste Hilfe", 0.20, 0.72),
            ("Defibrillator", "Flucht und Rettung", "E010 Defibrillator (AED)", 0.24, 0.53),
        ]:
            nid = ins("anlagen", objekt_id=o1, bezeichnung=name, gewerk=gewerk, planzeichen=zeichen,
                      standort="Haupthaus, 2. OG", status="In Betrieb")
            con.execute("UPDATE anlagen SET plan_id=?, plan_x=?, plan_y=? WHERE id=?", (pid, x, y, nid))


# ---------------------------------------------------------------------------
# Webserver
# ---------------------------------------------------------------------------
class Handler(BaseHTTPRequestHandler):
    server_version = "CasaCAFM/1.0"
    benutzer: dict | None = None

    def log_message(self, fmt, *args):  # ruhigere Ausgabe
        if "--leise" not in sys.argv:
            sys.stderr.write("%s - %s\n" % (self.log_date_time_string(), fmt % args))

    # --- Hilfen ----------------------------------------------------------
    def senden(self, status: int, body: bytes, typ: str, extra: dict | None = None):
        self.send_response(status)
        self.send_header("Content-Type", typ)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("X-Frame-Options", "DENY")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def json(self, daten, status=200, extra=None):
        self.senden(status, json.dumps(daten, ensure_ascii=False).encode(), "application/json; charset=utf-8", extra)

    def body(self) -> dict:
        laenge = int(self.headers.get("Content-Length") or 0)
        if laenge > MAX_UPLOAD * 1.4:
            raise Fehler(413, "Die Datei ist zu groß (höchstens 25 MB).")
        if not laenge:
            return {}
        try:
            return json.loads(self.rfile.read(laenge).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            raise Fehler(400, "Ungültige Anfrage.")

    def token(self) -> str | None:
        c = cookies.SimpleCookie(self.headers.get("Cookie") or "")
        return c["cafm"].value if "cafm" in c else None

    def angemeldet(self, con) -> dict | None:
        t = self.token()
        if not t:
            return None
        r = con.execute(
            "SELECT b.* FROM sitzungen s JOIN benutzer b ON b.id=s.benutzer_id "
            "WHERE s.token=? AND s.ablauf > ? AND b.aktiv=1", (hashlib.sha256(t.encode()).hexdigest(), jetzt())
        ).fetchone()
        return zeile(r)

    # --- Verteiler -------------------------------------------------------
    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        self.verteilen("GET")

    def do_POST(self):
        self.verteilen("POST")

    def do_PUT(self):
        self.verteilen("PUT")

    def do_DELETE(self):
        self.verteilen("DELETE")

    def verteilen(self, methode: str):
        url = urlparse(self.path)
        try:
            if not url.path.startswith("/api/"):
                if methode not in ("GET",):
                    raise Fehler(405, "Nicht erlaubt.")
                return self.statisch(url.path)
            if methode != "GET":
                # Schutz gegen fremde Seiten: Anfrage muss von hier kommen
                herkunft = self.headers.get("Origin")
                host = self.headers.get("Host")
                if herkunft and urlparse(herkunft).netloc != host:
                    raise Fehler(403, "Anfrage abgelehnt.")
                if self.headers.get("X-CAFM") != "1":
                    raise Fehler(403, "Anfrage abgelehnt.")
            with _db_lock:
                con = db()
                try:
                    with con:
                        self.api(con, methode, url.path[5:].strip("/").split("/"), parse_qs(url.query))
                finally:
                    con.close()
        except Fehler as e:
            self.json({"fehler": e.text}, e.status)
        except BrokenPipeError:
            pass
        except Exception as e:  # noqa: BLE001
            import traceback
            traceback.print_exc()
            self.json({"fehler": "Da ist etwas schiefgegangen. Bitte noch einmal versuchen."}, 500)

    def statisch(self, pfad: str):
        if pfad in ("", "/"):
            pfad = "/index.html"
        ziel = (STATIC / pfad.lstrip("/")).resolve()
        if not str(ziel).startswith(str(STATIC)) or not ziel.is_file():
            ziel = STATIC / "index.html"
        typ = mimetypes.guess_type(ziel.name)[0] or "application/octet-stream"
        if typ.startswith("text/") or typ in ("application/javascript",):
            typ += "; charset=utf-8"
        self.senden(200, ziel.read_bytes(), typ, {"Cache-Control": "no-cache"})

    # --- Schnittstelle ---------------------------------------------------
    def api(self, con, m: str, teile: list[str], q: dict):
        erstes = teile[0] if teile else ""

        if erstes == "qr" and len(teile) >= 2:
            return self.qr_api(con, m, teile)

        if erstes == "status" and m == "GET":
            b = self.angemeldet(con)
            erster_start = con.execute("SELECT COUNT(*) FROM benutzer").fetchone()[0] == 0
            return self.json({"benutzer": self.oeffentlich(b, con), "einrichten": erster_start})

        if erstes == "einrichten" and m == "POST":
            if con.execute("SELECT COUNT(*) FROM benutzer").fetchone()[0]:
                raise Fehler(403, "Ist schon eingerichtet.")
            d = self.body()
            bid = self.benutzer_anlegen(con, d, rolle="admin")
            return self.anmelden_antwort(con, bid)

        if erstes == "anmelden" and m == "POST":
            d = self.body()
            email = (d.get("email") or "").strip()
            schluessel = email.lower() + "|" + self.client_address[0]
            anmelde_bremse(schluessel)
            r = con.execute("SELECT * FROM benutzer WHERE email=? AND aktiv=1", (email,)).fetchone()
            if not r or not passwort_pruefen(d.get("passwort") or "", r["passwort"]):
                anmelde_bremse(schluessel, True)
                raise Fehler(401, "E-Mail oder Passwort stimmt nicht.")
            anmelde_bremse(schluessel, False)
            return self.anmelden_antwort(con, r["id"])

        if erstes == "abmelden" and m == "POST":
            t = self.token()
            if t:
                con.execute("DELETE FROM sitzungen WHERE token=?", (hashlib.sha256(t.encode()).hexdigest(),))
            return self.json({"ok": True}, extra={"Set-Cookie": "cafm=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict"})

        b = self.angemeldet(con)
        if not b:
            raise Fehler(401, "Bitte anmelden.")
        self.benutzer = b
        self.rechte = effektive_rechte(con, b)
        recht = benoetigtes_recht(m, teile)
        if recht and not self.rechte.get(recht):
            text = dict((k, t) for k, t, _ in RECHTE)[recht]
            raise Fehler(403, f"Dafür fehlt dir das Recht: {text}.")

        if erstes == "rechte":
            if m == "GET":
                return self.json({"liste": [{"key": k, "text": t, "gruppe": g} for k, t, g in RECHTE],
                                  "rollen": rollen_rechte(con), "rollennamen": ROLLEN})
            if m == "PUT":
                d = self.body()
                rolle = d.get("rolle")
                if rolle not in RECHTE_STANDARD:
                    raise Fehler(400, "Diese Rolle lässt sich nicht ändern. Administratoren haben immer alle Rechte.")
                neu = d.get("rechte") or {}
                if not isinstance(neu, dict):
                    raise Fehler(400, "Rechte sind ungültig.")
                alle = rollen_rechte(con)
                alle[rolle].update({k: bool(v) for k, v in neu.items() if k in RECHTE_KEYS})
                con.execute("INSERT OR REPLACE INTO einstellungen VALUES ('rechte_rollen', ?)", (json.dumps(alle),))
                protokollieren(con, b, "Rechte geändert", "rollen", None, ROLLEN[rolle])
                return self.json(rollen_rechte(con))

        if erstes == "schema":
            return self.json({"ressourcen": RESSOURCEN, "rechte": [{"key": k, "text": x, "gruppe": g} for k, x, g in RECHTE],
                              "medien_einheit": {
                "Strom": "kWh", "Wasser": "m³", "Wärme": "MWh", "Kälte": "MWh", "Gas": "m³", "Weitere": ""}})
        if erstes == "dashboard":
            return self.json(dashboard(con))
        if erstes == "suche":
            return self.json(suche(con, (q.get("q") or [""])[0]))
        if erstes == "kalender":
            von = (q.get("von") or [heute().replace(day=1).isoformat()])[0]
            bis = (q.get("bis") or [plus_monate(heute().replace(day=1), 1).isoformat()])[0]
            if not (DATUM_RE.match(von) and DATUM_RE.match(bis)):
                raise Fehler(400, "Ungültiger Zeitraum.")
            return self.json(kalender(con, von, bis))
        if erstes == "verlauf":
            return self.json([dict(r) for r in con.execute("SELECT * FROM verlauf ORDER BY id DESC LIMIT 200")])
        if erstes == "benutzer":
            return self.benutzer_api(con, m, teile)
        if erstes == "export" and len(teile) == 2 and teile[1] in RESSOURCEN:
            return self.export(con, teile[1])

        if erstes == "wartungen" and len(teile) == 3:
            wid = self.id(teile[1])
            if teile[2] == "erledigt" and m == "POST":
                return self.json(wartung_erledigt(con, b, wid, self.body()))
            if teile[2] == "historie" and m == "GET":
                return self.json([dict(r) for r in con.execute(
                    "SELECT * FROM wartung_historie WHERE wartung_id=? ORDER BY datum DESC, id DESC", (wid,))])
        if erstes == "tickets" and len(teile) == 3 and teile[2] == "kommentare":
            tid = self.id(teile[1])
            if m == "GET":
                return self.json([dict(r) for r in con.execute(
                    "SELECT * FROM ticket_kommentare WHERE ticket_id=? ORDER BY id", (tid,))])
            if m == "POST":
                text = (self.body().get("text") or "").strip()
                if not text:
                    raise Fehler(400, "Bitte einen Text eingeben.")
                con.execute("INSERT INTO ticket_kommentare (ticket_id, zeit, autor, text) VALUES (?,?,?,?)",
                            (tid, jetzt(), b["name"], text[:5000]))
                return self.json({"ok": True}, 201)
        if erstes == "zaehler" and len(teile) == 3 and teile[2] == "verbrauch":
            return self.json(verbrauch(con, self.id(teile[1])))
        if erstes == "dokumente" and len(teile) == 3 and teile[2] == "datei":
            return self.datei(con, self.id(teile[1]))
        if erstes == "dokumente" and len(teile) == 1 and m == "POST":
            return self.hochladen(con, b)
        if erstes == "symbole" and len(teile) == 1 and m == "POST":
            return self.symbol_hochladen(con, b, None)
        if erstes == "symbole" and len(teile) == 3 and teile[2] == "bild":
            sid = self.id(teile[1])
            if m == "GET":
                return self.symbol_bild(con, sid)
            if m == "PUT":
                return self.symbol_hochladen(con, b, sid)
        if erstes == "plaene" and len(teile) == 1 and m == "POST":
            return self.plan_hochladen(con, b, None)
        if erstes == "plaene" and len(teile) == 3:
            pid = self.id(teile[1])
            if teile[2] == "bild" and m == "GET":
                return self.plan_bild(con, pid)
            if teile[2] == "bild" and m == "PUT":
                return self.plan_hochladen(con, b, pid)
            if teile[2] == "anlagen" and m == "GET":
                return self.json(plan_anlagen(con, pid))
        if erstes == "einstellungen":
            if m == "GET":
                return self.json({k: einstellung(con, k) for k in EINSTELLUNGEN_STANDARD})
            if m == "PUT":
                d = self.body()
                if "basis_url" in d:
                    url = str(d["basis_url"] or "").strip().rstrip("/")
                    if url and not re.match(r"^https?://[^\s/]+(/[^\s]*)?$", url):
                        raise Fehler(400, "Die Adresse muss mit http:// oder https:// beginnen.")
                    con.execute("INSERT OR REPLACE INTO einstellungen VALUES ('basis_url', ?)", (url,))
                if "oeffentlich_melden" in d:
                    con.execute("INSERT OR REPLACE INTO einstellungen VALUES ('oeffentlich_melden', ?)",
                                ("1" if d["oeffentlich_melden"] in (1, True, "1") else "0",))
                protokollieren(con, b, "geändert", "einstellungen", None, ", ".join(d))
                return self.json({k: einstellung(con, k) for k in EINSTELLUNGEN_STANDARD})
        if erstes == "anlagen" and len(teile) == 3 and teile[2] == "qr-neu" and m == "POST":
            aid = self.id(teile[1])
            if not con.execute("SELECT 1 FROM anlagen WHERE id=?", (aid,)).fetchone():
                raise Fehler(404, "Anlage nicht gefunden.")
            con.execute("UPDATE anlagen SET qr_token=? WHERE id=?", (neuer_qr_token(), aid))
            protokollieren(con, b, "neuen QR-Code erzeugt", "anlagen", aid)
            return self.json({"qr_token": con.execute("SELECT qr_token FROM anlagen WHERE id=?", (aid,)).fetchone()[0]})
        if erstes == "anlagen" and len(teile) == 3 and teile[2] == "aktivitaet" and m == "GET":
            return self.json(anlage_aktivitaet(con, self.id(teile[1])))
        if erstes == "wartungsplan" and m == "GET":
            try:
                jahr = int((q.get("jahr") or [heute().year])[0])
            except ValueError:
                raise Fehler(400, "Jahr ist ungültig.")
            if not 1990 <= jahr <= 2200:
                raise Fehler(400, "Jahr ist ungültig.")
            return self.json(wartungsplan(con, jahr, q))
        if erstes == "anlagen" and len(teile) == 3 and teile[2] == "position" and m == "POST":
            return self.json(anlage_position(con, b, self.id(teile[1]), self.body()))

        if erstes in RESSOURCEN:
            return self.crud(con, m, erstes, teile[1:], q)
        raise Fehler(404, "Nicht gefunden.")

    def id(self, s: str) -> int:
        if not s.isdigit():
            raise Fehler(404, "Nicht gefunden.")
        return int(s)

    def crud(self, con, m: str, name: str, rest: list[str], q: dict):
        res = RESSOURCEN[name]
        b = self.benutzer
        if not rest:
            if m == "GET":
                return self.json(self.liste(con, name, q))
            if m == "POST":
                if name == "tickets":
                    neue_id = ticket_anlegen(con, b, self.body())
                else:
                    daten = self.body()
                    sauber = daten_pruefen(res, daten, neu=True)
                    if name == "zaehler" and not sauber.get("einheit"):
                        sauber["einheit"] = {"Strom": "kWh", "Wasser": "m³", "Wärme": "MWh", "Kälte": "MWh",
                                             "Gas": "m³"}.get(sauber.get("medium"), "")
                    neue_id = einfuegen(con, name, sauber)
                    protokollieren(con, b, "angelegt", name, neue_id)
                return self.json(zeile(con.execute(f'SELECT * FROM "{name}" WHERE id=?', (neue_id,)).fetchone()), 201)
            raise Fehler(405, "Nicht erlaubt.")
        rid = self.id(rest[0])
        alt = zeile(con.execute(f'SELECT * FROM "{name}" WHERE id=?', (rid,)).fetchone())
        if not alt:
            raise Fehler(404, f'{res["einzahl"]} nicht gefunden.')
        if m == "GET":
            alt.pop("pfad", None)
            return self.json(alt)
        if m == "PUT":
            sauber = daten_pruefen(res, self.body(), neu=False)
            if name == "tickets" and sauber.get("status") in ("Erledigt", "Abgeschlossen") and not (
                    sauber.get("erledigt_am") or alt.get("erledigt_am")):
                sauber["erledigt_am"] = heute().isoformat()
            if name == "tickets" and sauber.get("status") and sauber["status"] != alt["status"]:
                con.execute("INSERT INTO ticket_kommentare (ticket_id, zeit, autor, text) VALUES (?,?,?,?)",
                            (rid, jetzt(), b["name"], f'Status: {alt["status"]} → {sauber["status"]}'))
            if sauber:
                sauber["geaendert"] = jetzt()
                setz = ", ".join(f'"{k}"=?' for k in sauber)
                con.execute(f'UPDATE "{name}" SET {setz} WHERE id=?', [*sauber.values(), rid])
                protokollieren(con, b, "geändert", name, rid, ", ".join(k for k in sauber if k != "geaendert"))
            neu = zeile(con.execute(f'SELECT * FROM "{name}" WHERE id=?', (rid,)).fetchone())
            neu.pop("pfad", None)
            return self.json(neu)
        if m == "DELETE":
            abh = self.abhaengige(con, name, rid)
            if abh:
                raise Fehler(409, f"Kann nicht gelöscht werden, es hängen noch Einträge daran: {abh}.")
            if name in ("dokumente", "plaene", "symbole") and alt.get("pfad"):
                ordner = {"dokumente": DOK_PFAD, "plaene": PLAN_PFAD, "symbole": SYM_PFAD}[name]
                p = (ordner / alt["pfad"]).resolve()
                if str(p).startswith(str(ordner.resolve())) and p.is_file():
                    p.unlink()
            if name == "plaene":
                con.execute("UPDATE anlagen SET plan_id=NULL, plan_x=NULL, plan_y=NULL WHERE plan_id=?", (rid,))
            con.execute(f'DELETE FROM "{name}" WHERE id=?', (rid,))
            if name == "wartungen":
                con.execute("DELETE FROM wartung_historie WHERE wartung_id=?", (rid,))
            if name == "tickets":
                con.execute("DELETE FROM ticket_kommentare WHERE ticket_id=?", (rid,))
            protokollieren(con, b, "gelöscht", name, rid)
            return self.json({"ok": True})
        raise Fehler(405, "Nicht erlaubt.")

    def abhaengige(self, con, name: str, rid: int) -> str:
        teile = []
        for anderer, res in RESSOURCEN.items():
            for f in res["felder"]:
                if f["typ"] == "ref" and f["ref"] == name and not f.get("lose"):
                    n = con.execute(f'SELECT COUNT(*) FROM "{anderer}" WHERE "{f["name"]}"=?', (rid,)).fetchone()[0]
                    if n:
                        teile.append(f'{n} × {res["label"]}')
        return ", ".join(teile)

    def liste(self, con, name: str, q: dict) -> list[dict]:
        res = RESSOURCEN[name]
        namen = {f["name"] for f in res["felder"]} | {"id"}
        bed, werte = [], []
        for k, v in q.items():
            if k in namen and v:
                bed.append(f'"{k}"=?')
                werte.append(v[0])
        if q.get("q") and q["q"][0].strip():
            textfelder = [f["name"] for f in res["felder"] if f["typ"] in ("text", "textarea", "email", "tel")]
            if textfelder:
                bed.append("(" + " OR ".join(f'"{f}" LIKE ?' for f in textfelder) + ")")
                werte += [f'%{q["q"][0].strip()}%'] * len(textfelder)
        if name == "tickets" and q.get("offen"):
            bed.append("status NOT IN ('Erledigt','Abgeschlossen')")
        sort = res.get("sort", "id")
        richtung = "DESC" if sort.startswith("-") else "ASC"
        sort = sort.lstrip("-")
        sql = f'SELECT * FROM "{name}"' + (" WHERE " + " AND ".join(bed) if bed else "")
        sql += f' ORDER BY "{sort}" IS NULL, "{sort}" COLLATE NOCASE {richtung}, id DESC LIMIT 5000'
        zeilen = [dict(r) for r in con.execute(sql, werte)]
        for z in zeilen:
            z.pop("pfad", None)
        if name == "plaene":
            anzahl = {r[0]: r[1] for r in con.execute(
                "SELECT plan_id, COUNT(*) FROM anlagen WHERE plan_id IS NOT NULL GROUP BY plan_id")}
            for z in zeilen:
                z["anlagen_anzahl"] = anzahl.get(z["id"], 0)
        return zeilen

    def export(self, con, name: str):
        res = RESSOURCEN[name]
        refs = {}
        for f in res["felder"]:
            if f["typ"] == "ref":
                rr = RESSOURCEN[f["ref"]]
                refs[f["name"]] = {r["id"]: " · ".join(str(r[a]) for a in rr["anzeige"] if r[a])
                                   for r in con.execute(f'SELECT * FROM "{f["ref"]}"')}
        puffer = io.StringIO()
        w = csv.writer(puffer, delimiter=";")
        w.writerow([f["label"] for f in res["felder"]])
        for z in self.liste(con, name, {}):
            reihe = []
            for f in res["felder"]:
                v = z.get(f["name"])
                if f["typ"] == "ref":
                    v = refs[f["name"]].get(v, "")
                elif f["typ"] == "date" and v:
                    v = dt.date.fromisoformat(v).strftime("%d.%m.%Y")
                elif f["typ"] in ("number", "money") and v is not None:
                    v = (f"{v:.2f}" if f["typ"] == "money" else f"{v:g}").replace(".", ",")
                elif f["typ"] == "bool":
                    v = "ja" if v else "nein"
                reihe.append("" if v is None else v)
            w.writerow(reihe)
        dateiname = f"{heute():%Y%m%d}_{name}.csv"
        self.senden(200, ("﻿" + puffer.getvalue()).encode("utf-8"), "text/csv; charset=utf-8",
                    {"Content-Disposition": f'attachment; filename="{dateiname}"'})

    def hochladen(self, con, b):
        d = self.body()
        res = RESSOURCEN["dokumente"]
        sauber = daten_pruefen(res, d, neu=True)
        name = os.path.basename(str(d.get("dateiname") or "datei"))[:150]
        name = re.sub(r"[^\w.\- äöüÄÖÜß]", "_", name) or "datei"
        try:
            inhalt = base64.b64decode(d.get("inhalt") or "", validate=True)
        except ValueError:
            raise Fehler(400, "Die Datei konnte nicht gelesen werden.")
        if not inhalt:
            raise Fehler(400, "Bitte eine Datei auswählen.")
        if len(inhalt) > MAX_UPLOAD:
            raise Fehler(413, "Die Datei ist zu groß (höchstens 25 MB).")
        sauber.update({"dateiname": name, "groesse": len(inhalt), "hochgeladen_am": heute().isoformat(),
                       "hochgeladen_von": b["name"]})
        neue_id = einfuegen(con, "dokumente", sauber)
        pfad = f"{neue_id:06d}_{secrets.token_hex(4)}_{name}"
        (DOK_PFAD / pfad).write_bytes(inhalt)
        con.execute("UPDATE dokumente SET pfad=? WHERE id=?", (pfad, neue_id))
        protokollieren(con, b, "hochgeladen", "dokumente", neue_id, name)
        return self.json({"id": neue_id}, 201)

    def plan_hochladen(self, con, b, pid: int | None):
        d = self.body()
        try:
            inhalt = base64.b64decode(d.get("inhalt") or "", validate=True)
        except ValueError:
            raise Fehler(400, "Das Bild konnte nicht gelesen werden.")
        if not inhalt:
            raise Fehler(400, "Bitte einen Grundriss auswählen.")
        if len(inhalt) > MAX_UPLOAD:
            raise Fehler(413, "Der Grundriss ist zu groß (höchstens 25 MB).")
        endung = bild_endung(inhalt)
        if not endung:
            raise Fehler(400, "Bitte den Grundriss als PNG, JPG oder PDF hochladen.")
        try:
            breite, hoehe = int(d.get("breite") or 0), int(d.get("hoehe") or 0)
        except (TypeError, ValueError):
            breite = hoehe = 0
        name = re.sub(r"[^\w.\- äöüÄÖÜß]", "_", os.path.basename(str(d.get("dateiname") or "grundriss")))[:150]
        if pid is None:
            sauber = daten_pruefen(RESSOURCEN["plaene"], d, neu=True)
            sauber.update({"dateiname": name, "breite": breite, "hoehe": hoehe})
            pid = einfuegen(con, "plaene", sauber)
            alt_pfad = None
            protokollieren(con, b, "hochgeladen", "plaene", pid, sauber.get("titel"))
        else:
            alt = con.execute("SELECT * FROM plaene WHERE id=?", (pid,)).fetchone()
            if not alt:
                raise Fehler(404, "Plan nicht gefunden.")
            alt_pfad = alt["pfad"]
            con.execute("UPDATE plaene SET dateiname=?, breite=?, hoehe=?, geaendert=? WHERE id=?",
                        (name, breite, hoehe, jetzt(), pid))
            protokollieren(con, b, "Grundriss ersetzt", "plaene", pid, name)
        pfad = f"{pid:06d}_{secrets.token_hex(6)}.{endung}"
        (PLAN_PFAD / pfad).write_bytes(inhalt)
        con.execute("UPDATE plaene SET pfad=? WHERE id=?", (pfad, pid))
        if alt_pfad:
            altp = (PLAN_PFAD / alt_pfad).resolve()
            if str(altp).startswith(str(PLAN_PFAD.resolve())) and altp.is_file():
                altp.unlink()
        return self.json({"id": pid}, 201)

    def qr_api(self, con, m: str, teile: list[str]):
        token = teile[1]
        if not re.match(r"^[A-Za-z0-9_-]{8,40}$", token):
            raise Fehler(404, "Dieser QR-Code ist nicht gültig.")
        a = con.execute(
            "SELECT a.*, o.name AS o_name, o.kuerzel AS o_kuerzel, o.strasse AS o_strasse, o.ort AS o_ort "
            "FROM anlagen a LEFT JOIN objekte o ON o.id=a.objekt_id WHERE a.qr_token=?", (token,)).fetchone()
        if not a:
            raise Fehler(404, "Dieser QR-Code ist nicht mehr gültig. Bitte bei Casa Concept Consulting melden.")
        b = self.angemeldet(con)
        offen = einstellung(con, "oeffentlich_melden") == "1"
        if len(teile) == 2 and m == "GET":
            info = {"bezeichnung": a["bezeichnung"], "nummer": a["nummer"], "standort": a["standort"],
                    "objekt": " · ".join(x for x in (a["o_kuerzel"], a["o_name"]) if x),
                    "anschrift": ", ".join(x for x in (a["o_strasse"], a["o_ort"]) if x),
                    "gewerk": a["gewerk"], "planzeichen": a["planzeichen"]}
            return self.json({"anlage": info, "oeffentlich": offen, "angemeldet": bool(b),
                              "anlage_id": a["id"] if b else None})
        if len(teile) == 3 and teile[2] == "meldung" and m == "POST":
            if not b and not offen:
                raise Fehler(403, "Meldungen ohne Anmeldung sind abgeschaltet. Bitte anmelden.")
            if b and not effektive_rechte(con, b).get("tickets_anlegen"):
                raise Fehler(403, "Dafür fehlt dir das Recht: Störmeldungen und Mängel anlegen.")
            if not b:
                qr_bremse(self.client_address[0])
            d = self.body()
            text = str(d.get("beschreibung") or "").strip()
            if len(text) < 3:
                raise Fehler(400, "Bitte kurz beschreiben, was nicht stimmt.")
            name = str(d.get("name") or "").strip()[:120]
            kontakt = str(d.get("kontakt") or "").strip()[:160]
            if not b and not name:
                raise Fehler(400, "Bitte Ihren Namen angeben, damit wir nachfragen können.")
            melder = b["name"] if b else name + (f" ({kontakt})" if kontakt else "")
            titel = str(d.get("titel") or "").strip()[:150] or ("Mangel: " + text.split("\n")[0][:80])
            prio = d.get("prioritaet") if d.get("prioritaet") in PRIORITAETEN else ("Hoch" if d.get("dringend") else "Normal")
            if not b and prio == "Notfall":
                prio = "Hoch"
            tid = ticket_anlegen(con, b or {"name": "QR-Code"}, {
                "objekt_id": a["objekt_id"], "anlage_id": a["id"], "titel": titel, "beschreibung": text[:5000],
                "gewerk": a["gewerk"], "prioritaet": prio, "status": "Neu", "gemeldet_von": melder[:200],
                "gemeldet_am": heute().isoformat(), "dienstleister_id": a["dienstleister_id"]})
            con.execute("INSERT INTO ticket_kommentare (ticket_id, zeit, autor, text) VALUES (?,?,?,?)",
                        (tid, jetzt(), melder[:200], "Über den QR-Code der Anlage gemeldet."
                         + ("" if b else " Ohne Anmeldung, bitte Angaben prüfen.")))
            fotos = d.get("fotos") or []
            if not isinstance(fotos, list):
                fotos = []
            for nr, f in enumerate(fotos[:3], 1):
                try:
                    inhalt = base64.b64decode(str(f), validate=True)
                except ValueError:
                    continue
                if not inhalt or len(inhalt) > 8 * 1024 * 1024 or bild_endung(inhalt) not in ("jpg", "png", "webp"):
                    continue
                endung = bild_endung(inhalt)
                did = einfuegen(con, "dokumente", {
                    "titel": f"Foto zur Meldung {nr}", "kategorie": "Foto", "objekt_id": a["objekt_id"],
                    "anlage_id": a["id"], "ticket_id": tid, "dateiname": f"meldung_{tid}_{nr}.{endung}",
                    "groesse": len(inhalt), "hochgeladen_am": heute().isoformat(), "hochgeladen_von": melder[:200]})
                pfad = f"{did:06d}_{secrets.token_hex(4)}_meldung_{tid}_{nr}.{endung}"
                (DOK_PFAD / pfad).write_bytes(inhalt)
                con.execute("UPDATE dokumente SET pfad=? WHERE id=?", (pfad, did))
            nummer = con.execute("SELECT nummer FROM tickets WHERE id=?", (tid,)).fetchone()[0]
            return self.json({"ok": True, "nummer": nummer, "ticket_id": tid if b else None}, 201)
        raise Fehler(404, "Nicht gefunden.")

    def symbol_hochladen(self, con, b, sid: int | None):
        d = self.body()
        try:
            inhalt = base64.b64decode(d.get("inhalt") or "", validate=True)
        except ValueError:
            raise Fehler(400, "Das Bild konnte nicht gelesen werden.")
        if not inhalt:
            raise Fehler(400, "Bitte ein Bild auswählen.")
        if len(inhalt) > MAX_SYMBOL:
            raise Fehler(413, "Das Bild ist zu groß (höchstens 2 MB).")
        endung = bild_endung(inhalt)
        if not endung:
            raise Fehler(400, "Bitte ein Bild als PNG, JPG, WEBP oder SVG wählen.")
        if sid is None:
            sauber = daten_pruefen(RESSOURCEN["symbole"], d, neu=True)
            sid = einfuegen(con, "symbole", sauber)
            alt_pfad = None
            protokollieren(con, b, "angelegt", "symbole", sid, sauber.get("name"))
        else:
            alt = con.execute("SELECT * FROM symbole WHERE id=?", (sid,)).fetchone()
            if not alt:
                raise Fehler(404, "Symbol nicht gefunden.")
            alt_pfad = alt["pfad"]
            con.execute("UPDATE symbole SET geaendert=? WHERE id=?", (jetzt(), sid))
            protokollieren(con, b, "Bild ersetzt", "symbole", sid)
        pfad = f"{sid:05d}_{secrets.token_hex(6)}.{endung}"
        (SYM_PFAD / pfad).write_bytes(inhalt)
        con.execute("UPDATE symbole SET pfad=? WHERE id=?", (pfad, sid))
        if alt_pfad:
            altp = (SYM_PFAD / alt_pfad).resolve()
            if str(altp).startswith(str(SYM_PFAD.resolve())) and altp.is_file():
                altp.unlink()
        return self.json(zeile(con.execute("SELECT id, name, gewerk, beschreibung, geaendert FROM symbole WHERE id=?",
                                           (sid,)).fetchone()), 201)

    def symbol_bild(self, con, sid: int):
        r = con.execute("SELECT pfad FROM symbole WHERE id=?", (sid,)).fetchone()
        if not r or not r["pfad"]:
            raise Fehler(404, "Symbol nicht gefunden.")
        p = (SYM_PFAD / r["pfad"]).resolve()
        if not str(p).startswith(str(SYM_PFAD.resolve())) or not p.is_file():
            raise Fehler(404, "Symbol nicht gefunden.")
        typ = mimetypes.guess_type(p.name)[0] or "application/octet-stream"
        self.senden(200, p.read_bytes(), typ, {"Cache-Control": "private, max-age=86400",
                                                "Content-Security-Policy": "sandbox"})

    def plan_bild(self, con, pid: int):
        r = con.execute("SELECT pfad FROM plaene WHERE id=?", (pid,)).fetchone()
        if not r or not r["pfad"]:
            raise Fehler(404, "Grundriss nicht gefunden.")
        p = (PLAN_PFAD / r["pfad"]).resolve()
        if not str(p).startswith(str(PLAN_PFAD.resolve())) or not p.is_file():
            raise Fehler(404, "Grundriss nicht gefunden.")
        typ = mimetypes.guess_type(p.name)[0] or "application/octet-stream"
        self.senden(200, p.read_bytes(), typ, {"Cache-Control": "private, max-age=3600",
                                                "Content-Security-Policy": "sandbox"})

    def datei(self, con, did: int):
        r = con.execute("SELECT * FROM dokumente WHERE id=?", (did,)).fetchone()
        if not r or not r["pfad"]:
            raise Fehler(404, "Datei nicht gefunden.")
        p = (DOK_PFAD / r["pfad"]).resolve()
        if not str(p).startswith(str(DOK_PFAD.resolve())) or not p.is_file():
            raise Fehler(404, "Datei nicht gefunden.")
        typ = mimetypes.guess_type(r["dateiname"])[0] or "application/octet-stream"
        sicher_anzeigen = typ in ("application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp", "text/plain")
        art = "inline" if sicher_anzeigen else "attachment"
        self.senden(200, p.read_bytes(), typ, {
            "Content-Disposition": f"{art}; filename*=UTF-8''{quote(r['dateiname'])}",
            "Content-Security-Policy": "sandbox", "Cache-Control": "private, no-store"})

    # --- Benutzer --------------------------------------------------------
    def oeffentlich(self, b, con=None):
        if not b:
            return None
        aus = {"id": b["id"], "name": b["name"], "email": b["email"], "rolle": b["rolle"]}
        if con is not None:
            aus["rechte"] = effektive_rechte(con, b)
        return aus

    def benutzer_anlegen(self, con, d: dict, rolle: str) -> int:
        name = (d.get("name") or "").strip()
        email = (d.get("email") or "").strip()
        pw = d.get("passwort") or ""
        if not name or "@" not in email:
            raise Fehler(400, "Bitte Name und E-Mail angeben.")
        if len(pw) < 8:
            raise Fehler(400, "Das Passwort braucht mindestens 8 Zeichen.")
        if rolle not in ROLLEN:
            raise Fehler(400, "Rolle ist ungültig.")
        try:
            cur = con.execute("INSERT INTO benutzer (name, email, passwort, rolle, erstellt) VALUES (?,?,?,?,?)",
                              (name, email, passwort_hash(pw), rolle, jetzt()))
        except sqlite3.IntegrityError:
            raise Fehler(409, "Diese E-Mail gibt es schon.")
        return cur.lastrowid

    def anmelden_antwort(self, con, bid: int):
        t = secrets.token_urlsafe(32)
        ablauf = (dt.datetime.now() + dt.timedelta(days=SITZUNG_TAGE)).isoformat(timespec="seconds")
        con.execute("DELETE FROM sitzungen WHERE ablauf < ?", (jetzt(),))
        con.execute("INSERT INTO sitzungen (token, benutzer_id, ablauf) VALUES (?,?,?)",
                    (hashlib.sha256(t.encode()).hexdigest(), bid, ablauf))
        b = zeile(con.execute("SELECT * FROM benutzer WHERE id=?", (bid,)).fetchone())
        return self.json({"benutzer": self.oeffentlich(b, con)}, extra={
            "Set-Cookie": f"cafm={t}; Path=/; Max-Age={SITZUNG_TAGE * 86400}; HttpOnly; SameSite=Strict"})

    def benutzer_api(self, con, m: str, teile: list[str]):
        b = self.benutzer
        if len(teile) == 2 and teile[1] == "passwort" and m == "POST":
            d = self.body()
            if not passwort_pruefen(d.get("alt") or "", b["passwort"]):
                raise Fehler(400, "Das bisherige Passwort stimmt nicht.")
            if len(d.get("neu") or "") < 8:
                raise Fehler(400, "Das neue Passwort braucht mindestens 8 Zeichen.")
            con.execute("UPDATE benutzer SET passwort=? WHERE id=?", (passwort_hash(d["neu"]), b["id"]))
            return self.json({"ok": True})
        if len(teile) == 1 and m == "GET":
            return self.json([self.oeffentlich(r, con) | {"aktiv": r["aktiv"], "abweichungen": benutzer_abweichungen(r)}
                              for r in con.execute("SELECT * FROM benutzer ORDER BY name COLLATE NOCASE")])
        if len(teile) == 1 and m == "POST":
            d = self.body()
            if d.get("rolle") == "admin" and b["rolle"] != "admin":
                raise Fehler(403, "Nur ein Administrator kann Administratoren anlegen.")
            bid = self.benutzer_anlegen(con, d, d.get("rolle") or "benutzer")
            protokollieren(con, b, "angelegt", "benutzer", bid, d.get("email"))
            return self.json({"id": bid}, 201)
        if len(teile) == 2 and m == "PUT":
            bid = self.id(teile[1])
            d = self.body()
            ziel = con.execute("SELECT * FROM benutzer WHERE id=?", (bid,)).fetchone()
            if not ziel:
                raise Fehler(404, "Zugang nicht gefunden.")
            if bid == b["id"] and ((b["rolle"] == "admin" and d.get("rolle", "admin") != "admin")
                                   or d.get("aktiv", 1) in (0, False)):
                raise Fehler(400, "Du kannst dir die Administratorrechte nicht selbst nehmen oder dich selbst sperren.")
            if ziel["rolle"] == "admin" and b["rolle"] != "admin":
                raise Fehler(403, "Einen Administrator kann nur ein Administrator ändern.")
            if d.get("rolle") == "admin" and b["rolle"] != "admin":
                raise Fehler(403, "Nur ein Administrator kann andere zu Administratoren machen.")
            if "rolle" in d:
                if d["rolle"] not in ROLLEN:
                    raise Fehler(400, "Rolle ist ungültig.")
                if ziel["rolle"] == "admin" and d["rolle"] != "admin":
                    andere = con.execute("SELECT COUNT(*) FROM benutzer WHERE rolle='admin' AND aktiv=1 AND id<>?",
                                         (bid,)).fetchone()[0]
                    if not andere:
                        raise Fehler(400, "Es muss mindestens ein aktiver Administrator bleiben.")
                con.execute("UPDATE benutzer SET rolle=? WHERE id=?", (d["rolle"], bid))
            if "rechte" in d:
                neu = d["rechte"]
                if neu is None:
                    con.execute("UPDATE benutzer SET rechte=NULL WHERE id=?", (bid,))
                elif isinstance(neu, dict):
                    sauber = {k: bool(v) for k, v in neu.items() if k in RECHTE_KEYS}
                    con.execute("UPDATE benutzer SET rechte=? WHERE id=?", (json.dumps(sauber) if sauber else None, bid))
                else:
                    raise Fehler(400, "Rechte sind ungültig.")
            if "aktiv" in d:
                con.execute("UPDATE benutzer SET aktiv=? WHERE id=?", (1 if d["aktiv"] else 0, bid))
                if not d["aktiv"]:
                    con.execute("DELETE FROM sitzungen WHERE benutzer_id=?", (bid,))
            if d.get("passwort"):
                if len(d["passwort"]) < 8:
                    raise Fehler(400, "Das Passwort braucht mindestens 8 Zeichen.")
                con.execute("UPDATE benutzer SET passwort=? WHERE id=?", (passwort_hash(d["passwort"]), bid))
            protokollieren(con, b, "geändert", "benutzer", bid)
            return self.json({"ok": True})
        raise Fehler(404, "Nicht gefunden.")


def main():
    p = argparse.ArgumentParser(description="Casa CAFM")
    p.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8080)))
    p.add_argument("--host", default=os.environ.get("HOST", "127.0.0.1"),
                   help="0.0.0.0 macht das Programm im ganzen Netzwerk erreichbar")
    p.add_argument("--demo", action="store_true", help="Beispieldaten anlegen, wenn die Datenbank leer ist")
    p.add_argument("--leise", action="store_true")
    a = p.parse_args()
    db_anlegen()
    if a.demo:
        with db() as con:
            beispieldaten(con)
    srv = ThreadingHTTPServer((a.host, a.port), Handler)
    print(f"Casa CAFM läuft: http://{'localhost' if a.host in ('127.0.0.1', '0.0.0.0') else a.host}:{a.port}")
    print("Beenden mit Strg+C.")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nBeendet.")


if __name__ == "__main__":
    main()
