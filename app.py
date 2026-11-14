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
MAX_UPLOAD = 25 * 1024 * 1024
SITZUNG_TAGE = 7

GEWERKE = [
    "Aufzug", "Brandschutz", "Elektro", "Heizung", "Lüftung/Klima", "Kälte", "Sanitär",
    "Sicherheitstechnik", "Türen/Tore", "Dach/Fassade", "Außenanlagen", "Reinigung",
    "Gebäudeautomation", "Sonstiges",
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
            {"name": "objekt_id", "label": "Objekt", "typ": "ref", "ref": "objekte", "pflicht": True, "liste": True},
            {"name": "bezeichnung", "label": "Bezeichnung", "typ": "text", "pflicht": True, "liste": True},
            {"name": "gewerk", "label": "Gewerk", "typ": "select", "optionen": GEWERKE, "liste": True},
            {"name": "standort", "label": "Standort (Gebäude, Etage, Raum)", "typ": "text", "liste": True},
            {"name": "hersteller", "label": "Hersteller", "typ": "text", "liste": True},
            {"name": "typ", "label": "Typ / Modell", "typ": "text"},
            {"name": "seriennummer", "label": "Seriennummer", "typ": "text"},
            {"name": "baujahr", "label": "Baujahr", "typ": "number"},
            {"name": "status", "label": "Zustand", "typ": "select",
             "optionen": ["In Betrieb", "Eingeschränkt", "Außer Betrieb", "Stillgelegt"], "liste": True},
            {"name": "notiz", "label": "Notiz", "typ": "textarea"},
        ],
    },
    "wartungen": {
        "label": "Wartung & Prüfung", "einzahl": "Wartung oder Prüfung", "anzeige": ["titel"], "sort": "naechste",
        "felder": [
            {"name": "objekt_id", "label": "Objekt", "typ": "ref", "ref": "objekte", "pflicht": True, "liste": True},
            {"name": "anlage_id", "label": "Anlage", "typ": "ref", "ref": "anlagen", "filter": "objekt_id", "liste": True},
            {"name": "titel", "label": "Titel", "typ": "text", "pflicht": True, "liste": True},
            {"name": "art", "label": "Art", "typ": "select", "optionen": ["Wartung", "Prüfung", "Inspektion", "Begehung"],
             "pflicht": True, "liste": True},
            {"name": "rechtsgrundlage", "label": "Grundlage (z. B. BetrSichV, DGUV V3)", "typ": "text"},
            {"name": "intervall_monate", "label": "Intervall (Monate)", "typ": "number", "pflicht": True},
            {"name": "letzte", "label": "Zuletzt erledigt", "typ": "date"},
            {"name": "naechste", "label": "Nächste Fälligkeit", "typ": "date", "pflicht": True, "liste": True},
            {"name": "dienstleister_id", "label": "Dienstleister", "typ": "ref", "ref": "dienstleister", "liste": True},
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
    with db() as con:
        for name, res in RESSOURCEN.items():
            spalten = ["id INTEGER PRIMARY KEY AUTOINCREMENT"]
            for f in res["felder"]:
                spalten.append(f'"{f["name"]}" {SQL_TYP.get(f["typ"], "TEXT")}')
            if name == "dokumente":
                spalten.append('"pfad" TEXT')
            spalten += ['"erstellt" TEXT', '"geaendert" TEXT']
            con.execute(f'CREATE TABLE IF NOT EXISTS "{name}" ({", ".join(spalten)})')
            # neue Felder in bestehende Datenbank nachtragen
            vorhanden = {r["name"] for r in con.execute(f'PRAGMA table_info("{name}")')}
            for f in res["felder"]:
                if f["name"] not in vorhanden:
                    con.execute(f'ALTER TABLE "{name}" ADD COLUMN "{f["name"]}" {SQL_TYP.get(f["typ"], "TEXT")}')
        con.executescript(EXTRA_SQL)
        for idx in [
            "anlagen(objekt_id)", "wartungen(objekt_id)", "wartungen(naechste)", "tickets(objekt_id)",
            "tickets(status)", "vertraege(objekt_id)", "zaehler(objekt_id)", "ablesungen(zaehler_id)",
            "dokumente(objekt_id)", "wartung_historie(wartung_id)", "ticket_kommentare(ticket_id)",
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
    ticket_id = None
    if ergebnis == "Mängel offen" and daten.get("ticket_anlegen"):
        ticket_id = ticket_anlegen(con, benutzer, {
            "objekt_id": w["objekt_id"], "anlage_id": w["anlage_id"],
            "titel": f'Mangel aus {w["art"]}: {w["titel"]}', "beschreibung": bemerkung,
            "prioritaet": "Hoch", "status": "Neu", "gemeldet_von": benutzer["name"],
            "gemeldet_am": datum, "dienstleister_id": w["dienstleister_id"],
        })
    con.execute(
        "INSERT INTO wartung_historie (wartung_id, datum, ergebnis, bemerkung, erfasst_von, ticket_id) "
        "VALUES (?,?,?,?,?,?)", (wid, datum, ergebnis, bemerkung, benutzer["name"], ticket_id))
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


def einfuegen(con, tabelle: str, sauber: dict) -> int:
    sauber = dict(sauber)
    sauber["erstellt"] = sauber["geaendert"] = jetzt()
    spalten = ", ".join(f'"{k}"' for k in sauber)
    platz = ", ".join("?" for _ in sauber)
    cur = con.execute(f'INSERT INTO "{tabelle}" ({spalten}) VALUES ({platz})', list(sauber.values()))
    return cur.lastrowid


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
        ins("wartungen", objekt_id=o, anlage_id=a, titel=t, art=art, rechtsgrundlage=rg, intervall_monate=iv,
            letzte=letzte, naechste=naechste, dienstleister_id=dlid, aktiv=1)
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

        if erstes == "status" and m == "GET":
            b = self.angemeldet(con)
            erster_start = con.execute("SELECT COUNT(*) FROM benutzer").fetchone()[0] == 0
            return self.json({"benutzer": self.oeffentlich(b), "einrichten": erster_start})

        if erstes == "einrichten" and m == "POST":
            if con.execute("SELECT COUNT(*) FROM benutzer").fetchone()[0]:
                raise Fehler(403, "Ist schon eingerichtet.")
            d = self.body()
            bid = self.benutzer_anlegen(con, d, rolle="admin")
            return self.anmelden_antwort(con, bid)

        if erstes == "anmelden" and m == "POST":
            d = self.body()
            r = con.execute("SELECT * FROM benutzer WHERE email=? AND aktiv=1",
                            ((d.get("email") or "").strip(),)).fetchone()
            if not r or not passwort_pruefen(d.get("passwort") or "", r["passwort"]):
                raise Fehler(401, "E-Mail oder Passwort stimmt nicht.")
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

        if erstes == "schema":
            return self.json({"ressourcen": RESSOURCEN, "medien_einheit": {
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
            if b["rolle"] != "admin":
                raise Fehler(403, "Löschen dürfen nur Administratoren.")
            abh = self.abhaengige(con, name, rid)
            if abh:
                raise Fehler(409, f"Kann nicht gelöscht werden, es hängen noch Einträge daran: {abh}.")
            if name == "dokumente" and alt.get("pfad"):
                p = (DOK_PFAD / alt["pfad"]).resolve()
                if str(p).startswith(str(DOK_PFAD.resolve())) and p.is_file():
                    p.unlink()
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
                if f["typ"] == "ref" and f["ref"] == name:
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
        sql += f' ORDER BY "{sort}" IS NULL, "{sort}" {richtung}, id DESC LIMIT 5000'
        zeilen = [dict(r) for r in con.execute(sql, werte)]
        for z in zeilen:
            z.pop("pfad", None)
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
    def oeffentlich(self, b):
        return None if not b else {"id": b["id"], "name": b["name"], "email": b["email"], "rolle": b["rolle"]}

    def benutzer_anlegen(self, con, d: dict, rolle: str) -> int:
        name = (d.get("name") or "").strip()
        email = (d.get("email") or "").strip()
        pw = d.get("passwort") or ""
        if not name or "@" not in email:
            raise Fehler(400, "Bitte Name und E-Mail angeben.")
        if len(pw) < 8:
            raise Fehler(400, "Das Passwort braucht mindestens 8 Zeichen.")
        if rolle not in ("admin", "benutzer", "lesen"):
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
        return self.json({"benutzer": self.oeffentlich(b)}, extra={
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
        if b["rolle"] != "admin":
            raise Fehler(403, "Nur für Administratoren.")
        if len(teile) == 1 and m == "GET":
            return self.json([self.oeffentlich(dict(r)) | {"aktiv": r["aktiv"]}
                              for r in con.execute("SELECT * FROM benutzer ORDER BY name")])
        if len(teile) == 1 and m == "POST":
            d = self.body()
            bid = self.benutzer_anlegen(con, d, d.get("rolle") or "benutzer")
            protokollieren(con, b, "angelegt", "benutzer", bid, d.get("email"))
            return self.json({"id": bid}, 201)
        if len(teile) == 2 and m == "PUT":
            bid = self.id(teile[1])
            d = self.body()
            if bid == b["id"] and (d.get("rolle", "admin") != "admin" or d.get("aktiv", 1) in (0, False)):
                raise Fehler(400, "Du kannst dir die Administratorrechte nicht selbst nehmen.")
            if "rolle" in d:
                if d["rolle"] not in ("admin", "benutzer", "lesen"):
                    raise Fehler(400, "Rolle ist ungültig.")
                con.execute("UPDATE benutzer SET rolle=? WHERE id=?", (d["rolle"], bid))
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


class LeseSchutz(Handler):
    """Rolle 'lesen' darf nichts aendern."""

    def api(self, con, m, teile, q):
        if m != "GET" and teile and teile[0] not in ("anmelden", "abmelden", "einrichten", "status"):
            b = self.angemeldet(con)
            if b and b["rolle"] == "lesen" and not (teile[0] == "benutzer" and teile[-1] == "passwort"):
                raise Fehler(403, "Du hast nur Leserechte.")
        return super().api(con, m, teile, q)


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
    srv = ThreadingHTTPServer((a.host, a.port), LeseSchutz)
    print(f"Casa CAFM läuft: http://{'localhost' if a.host in ('127.0.0.1', '0.0.0.0') else a.host}:{a.port}")
    print("Beenden mit Strg+C.")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nBeendet.")


if __name__ == "__main__":
    main()
