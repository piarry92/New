#!/usr/bin/env python3
"""Casa CAFM - schlankes CAFM-Programm fuer Facility Management.

Start:   python3 app.py            (danach im Browser http://localhost:8080 oeffnen)
Demo:    python3 app.py --demo     (legt Beispieldaten an, wenn die Datenbank leer ist)
Port:    python3 app.py --port 9000

Braucht nur Python 3.10 oder neuer, keine weiteren Pakete.
"""
from __future__ import annotations

import argparse
import katalog_daten
import ki
import versand
import base64
import binascii
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
OBJ_PFAD = DATEN / "objektbilder"
SCHL_PFAD = DATEN / "schluesselfotos"
PROFIL_PFAD = DATEN / "profilbilder"
MAX_SYMBOL = 2 * 1024 * 1024
MAX_UPLOAD = 25 * 1024 * 1024
VERSION = "2026.11.15-22"  # muss zu VERSION in static/app.js passen
SITZUNG_TAGE = 7

GEWERKE = [
    "Aufzug", "Brandschutz", "Elektro", "Heizung", "Lüftung/Klima", "Kälte", "Sanitär",
    "Sicherheitstechnik", "Türen/Tore", "Dach/Fassade", "Außenanlagen", "Reinigung",
    "Gebäudeautomation", "Flucht und Rettung", "Sonstiges",
]
RHYTHMUS = {"täglich": 1, "wöchentlich": 7, "14-tägig": 14, "monatlich": 30, "vierteljährlich": 91,
            "halbjährlich": 182, "jährlich": 365, "bei Bedarf": None}
KAT_FARBEN = ["Rot", "Blau", "Grün", "Gelb", "Orange", "Grau", "Lila", "Petrol", "Schwarz"]
GEFAEHRDUNG = ["gering", "mittel", "hoch"]
SV_GEGENSTAENDE = [
    "Raumlufttechnische Anlage (RLT)", "Brandschutzklappen (BSK)", "Lüftungsanlage", "Abgasanlage / Feuerstätte",
    "Starkstromanlage", "Elektrische Anlage", "Sicherheitsbeleuchtung", "Sicherheitsstromversorgung / Notstrom",
    "Blitzschutzanlage", "Brandmelde- und Alarmierungsanlage", "Maschinelle Rauchabzugsanlage (MRA)",
    "Natürliche Rauchabzugsanlage (NRA)", "Rauchabzugsanlage (RWA)", "Druckbelüftungsanlage (RDA)",
    "Wandhydranten / Steigleitungen", "Sprinkleranlage", "Gaslöschanlage", "Feuerlöschanlage (Sprinkler, Gaslöschanlage)",
    "CO-Warnanlage", "Aufzug", "Fassadenbefahranlage", "Verdunstungskühlanlage", "Feststellanlage (Brandschutztür)",
    "Druckbehälter", "Sonstiges",
]
SV_BEREICHE = [
    "Raumlufttechnik", "Heiztechnik", "Sanitärtechnik", "Elektrotechnik", "MSR-Technik und Gebäudeautomation",
    "Brandschutztechnische Geräte und Anlagen", "Förderanlagen", "Kältetechnik", "Dach und Fach (Gebäudehülle)",
    "Außenanlagen",
]
SV_EINSTUFUNGEN = ["geringfügig", "erheblich", "gefährlich", "unklar"]
SV_STATUS = ["offen", "in Arbeit", "behoben", "nachgeprüft"]
SV_GRUNDLAGEN = [
    "Prüfverordnung des Landes (z. B. TPrüfVO Hessen)", "BetrSichV (zugelassene Überwachungsstelle)",
    "BetrSichV §15 (Prüfung vor Inbetriebnahme / wiederkehrend)", "BetrSichV §16 (wiederkehrende Prüfung, Aufzüge)",
    "1. BImSchV (Feuerstätten, Schornsteinfeger)", "42. BImSchV (Verdunstungskühlanlagen)",
    "DGUV Vorschrift 3", "Baugenehmigung / Brandschutzkonzept", "Versicherer (z. B. VdS)", "Sonstige",
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
            {"name": "objektleiter_id", "label": "Objektleiter (Zugang, prüft Rundgänge und Checklisten)", "typ": "person"},
            {"name": "notiz", "label": "Notiz", "typ": "textarea"},
            {"name": "bild", "label": "Bild", "typ": "text", "nurlesen": True, "intern": True},
            {"name": "qr_token", "label": "QR-Kennung", "typ": "text", "nurlesen": True, "intern": True},
        ],
    },
    "anlagen": {
        "label": "Anlagen", "einzahl": "Anlage", "anzeige": ["bezeichnung"], "sort": "bezeichnung",
        "felder": [
            {"name": "nummer", "label": "Inventar-Nr.", "typ": "text", "liste": True},
            {"name": "objekt_id", "label": "Objekt (Arbeitsbereich)", "typ": "ref", "ref": "objekte", "pflicht": True, "liste": True},
            {"name": "bezeichnung", "label": "Bezeichnung", "typ": "text", "pflicht": True, "liste": True},
            {"name": "beschreibung", "label": "Beschreibung", "typ": "textarea"},
            {"name": "kategorie_id", "label": "Kategorie", "typ": "ref", "ref": "kat_kategorien", "liste": True},
            {"name": "gruppe_id", "label": "Hersteller / Gruppe", "typ": "ref", "ref": "kat_gruppen", "filter": "kategorie_id"},
            {"name": "typ_id", "label": "Bezeichnung (Typ)", "typ": "ref", "ref": "kat_typen", "filter": "gruppe_id", "liste": True},
            {"name": "zulassung", "label": "Zulassungs-Nr.", "typ": "text"},
            {"name": "gruppe", "label": "Bereich", "typ": "select", "optionen": GRUPPEN},
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
            {"name": "sv_relevant", "label": "Sicherheitsrelevant: Prüfung durch Sachverständige (SV-Prüfplan)", "typ": "bool", "standard": 0},
            {"name": "sv_gegenstand", "label": "SV-Prüfgegenstand", "typ": "select", "optionen": SV_GEGENSTAENDE},
            {"name": "sv_bereich", "label": "SV-Bereich (Gruppe im Prüfplan)", "typ": "select", "optionen": SV_BEREICHE},
            {"name": "sv_grundlage", "label": "SV-Prüfgrundlage", "typ": "select", "optionen": SV_GRUNDLAGEN},
            {"name": "notiz", "label": "Notiz", "typ": "textarea"},
            {"name": "plan_id", "label": "Plan", "typ": "ref", "ref": "plaene", "nurlesen": True, "lose": True},
            {"name": "details", "label": "Detailinfo", "typ": "json", "intern": True},
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
    "kat_kategorien": {
        "label": "Katalog: Kategorien", "einzahl": "Kategorie", "anzeige": ["name"], "sort": "name", "versteckt": True,
        "felder": [
            {"name": "name", "label": "Name", "typ": "text", "pflicht": True, "liste": True},
            {"name": "gewerk", "label": "Gewerk", "typ": "select", "optionen": GEWERKE, "liste": True},
            {"name": "farbe", "label": "Rahmenfarbe", "typ": "select", "optionen": KAT_FARBEN, "standard": "Blau"},
            {"name": "symbol", "label": "Symbol (Planzeichen wie F001, Bild wie i:tuer oder eigenes Symbol)", "typ": "text"},
            {"name": "symbol_id", "label": "Eigenes Symbol", "typ": "ref", "ref": "symbole"},
            {"name": "nummernkreis", "label": "Nummernkreis für Inventar-Nr. (z. B. 204)", "typ": "text"},
            {"name": "pruefung_monate", "label": "Prüfung alle (Monate)", "typ": "number"},
            {"name": "wartung_monate", "label": "Wartung alle (Monate)", "typ": "number"},
            {"name": "kontrolle_monate", "label": "Kontrolle alle (Monate)", "typ": "number"},
            {"name": "grundlage", "label": "Grundlage (Vorschlag, bitte prüfen)", "typ": "text"},
            {"name": "zusatzfelder", "label": "Zusatzfelder (eine Zeile je Feld: Name; Art; Auswahl1, Auswahl2)", "typ": "textarea"},
        ],
    },
    "kat_gruppen": {
        "label": "Katalog: Hersteller", "einzahl": "Hersteller / Gruppe", "anzeige": ["name"], "sort": "name", "versteckt": True,
        "felder": [
            {"name": "kategorie_id", "label": "Kategorie", "typ": "ref", "ref": "kat_kategorien", "pflicht": True, "liste": True},
            {"name": "name", "label": "Hersteller / Gruppe", "typ": "text", "pflicht": True, "liste": True},
            {"name": "web", "label": "Internetseite", "typ": "text"},
            {"name": "notiz", "label": "Notiz", "typ": "textarea"},
        ],
    },
    "kat_typen": {
        "label": "Katalog: Bezeichnungen", "einzahl": "Bezeichnung", "anzeige": ["name"], "sort": "name", "versteckt": True,
        "felder": [
            {"name": "gruppe_id", "label": "Hersteller / Gruppe", "typ": "ref", "ref": "kat_gruppen", "pflicht": True, "liste": True},
            {"name": "kategorie_id", "label": "Kategorie", "typ": "ref", "ref": "kat_kategorien", "pflicht": True, "liste": True},
            {"name": "name", "label": "Bezeichnung / Typ", "typ": "text", "pflicht": True, "liste": True},
            {"name": "beschreibung", "label": "Beschreibung", "typ": "textarea"},
        ],
    },
    "kat_maengel": {
        "label": "Katalog: Mängel", "einzahl": "Mangel", "anzeige": ["text"], "sort": "text", "versteckt": True,
        "felder": [
            {"name": "kategorie_id", "label": "Kategorie (leer = für alle)", "typ": "ref", "ref": "kat_kategorien", "liste": True},
            {"name": "text", "label": "Mangel", "typ": "text", "pflicht": True, "liste": True},
            {"name": "bereich", "label": "Bereich (z. B. Brandschutz)", "typ": "text", "liste": True},
            {"name": "gefaehrdung", "label": "Gefährdung", "typ": "select", "optionen": GEFAEHRDUNG, "standard": "mittel", "liste": True},
            {"name": "frist_tage", "label": "Frist (Tage)", "typ": "number", "liste": True},
        ],
    },
    "checklisten": {
        "label": "Checklisten & Rundgänge", "einzahl": "Checkliste", "anzeige": ["titel"], "sort": "titel", "versteckt": True,
        "felder": [
            {"name": "titel", "label": "Titel", "typ": "text", "pflicht": True, "liste": True},
            {"name": "art", "label": "Art", "typ": "select", "optionen": ["Anlage", "Rundgang"], "pflicht": True, "liste": True},
            {"name": "objekt_id", "label": "Objekt", "typ": "ref", "ref": "objekte", "pflicht": True, "liste": True},
            {"name": "anlage_id", "label": "Anlage", "typ": "ref", "ref": "anlagen", "filter": "objekt_id", "liste": True},
            {"name": "rhythmus", "label": "Rhythmus", "typ": "select", "optionen": list(RHYTHMUS), "standard": "bei Bedarf", "liste": True},
            {"name": "zustaendig", "label": "Zuständig", "typ": "text"},
            {"name": "zustaendig_id", "label": "Zugewiesen an", "typ": "number", "intern": True},
            {"name": "pruefer_id", "label": "Prüfung durch", "typ": "person", "intern": True},
            {"name": "faellig_uhrzeit", "label": "Fällig um (Uhrzeit)", "typ": "text", "standard": "08:00"},
            {"name": "erinnern_vorher", "label": "Erinnern vorher", "typ": "number", "standard": 1},
            {"name": "erinnern_einheit", "label": "Einheit", "typ": "select", "optionen": ["Stunden", "Tage"], "standard": "Tage"},
            {"name": "punkte", "label": "Prüfpunkte", "typ": "jsonliste", "intern": True},
            {"name": "unterschrift_pflicht", "label": "Unterschrift erforderlich", "typ": "bool", "standard": 1},
            {"name": "checkpoints_pflicht", "label": "Checkpoints müssen gescannt werden", "typ": "bool", "standard": 0},
            {"name": "aktiv", "label": "Aktiv", "typ": "bool", "standard": 1},
            {"name": "notiz", "label": "Notiz", "typ": "textarea"},
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
            {"name": "art", "label": "Art", "typ": "select", "optionen": ["Wartung", "Prüfung", "SV-Prüfung", "Inspektion", "Begehung"],
             "pflicht": True, "liste": True},
            {"name": "rechtsgrundlage", "label": "Grundlage (z. B. BetrSichV, DGUV V3)", "typ": "text"},
            {"name": "taetigkeiten", "label": "Tätigkeiten (eine je Zeile, wird zur Checkliste)", "typ": "textarea"},
            {"name": "intervall_monate", "label": "Intervall (Monate)", "typ": "number", "pflicht": True},
            {"name": "letzte", "label": "Zuletzt erledigt", "typ": "date"},
            {"name": "naechste", "label": "Nächste Fälligkeit", "typ": "date", "pflicht": True, "liste": True},
            {"name": "dienstleister_id", "label": "Dienstleister", "typ": "ref", "ref": "dienstleister", "liste": True},
            {"name": "zustaendig", "label": "Zuständig bei Casa", "typ": "text"},
            {"name": "pruefer", "label": "Prüfer / Sachverständige (z. B. TÜV Hessen)", "typ": "text"},
            {"name": "pruefnummer", "label": "Prüf- / Bericht-Nr.", "typ": "text"},
            {"name": "nachpruefung", "label": "Termin Nachprüfung", "typ": "date"},
            {"name": "maengelfrist", "label": "Frist Mängelbeseitigung", "typ": "date"},
            {"name": "raster", "label": "Jahresraster (aus Excel)", "typ": "json", "intern": True},
            {"name": "aktiv", "label": "Aktiv", "typ": "bool", "standard": 1},
            {"name": "notiz", "label": "Notiz", "typ": "textarea"},
        ],
    },
    "tickets": {
        "label": "Mängel & Störungen", "einzahl": "Eintrag", "anzeige": ["nummer", "titel"], "sort": "-id",
        "felder": [
            {"name": "nummer", "label": "Nr.", "typ": "text", "nurlesen": True, "liste": True},
            {"name": "titel", "label": "Eintrag", "typ": "text", "pflicht": True, "liste": True},
            {"name": "faellig_am", "label": "Frist bis", "typ": "date", "liste": True},
            {"name": "gefaehrdung", "label": "Gefährdung", "typ": "select", "optionen": GEFAEHRDUNG, "liste": True},
            {"name": "status", "label": "Status", "typ": "select", "optionen": TICKET_STATUS, "standard": "Neu",
             "liste": True},
            {"name": "a_kategorie", "label": "Kategorie", "typ": "text", "nurlesen": True, "virtuell": True, "liste": True},
            {"name": "a_gruppe", "label": "Gruppe", "typ": "text", "nurlesen": True, "virtuell": True, "liste": True},
            {"name": "a_typ", "label": "Bezeichnung", "typ": "text", "nurlesen": True, "virtuell": True, "liste": True},
            {"name": "a_nummer", "label": "Inv.-Nr.", "typ": "text", "nurlesen": True, "virtuell": True, "liste": True},
            {"name": "objekt_id", "label": "Objekt", "typ": "ref", "ref": "objekte", "pflicht": True, "liste": True},
            {"name": "a_standort", "label": "Standort", "typ": "text", "nurlesen": True, "virtuell": True, "liste": True},
            {"name": "anlage_id", "label": "Anlage", "typ": "ref", "ref": "anlagen", "filter": "objekt_id"},
            {"name": "art", "label": "Typ", "typ": "select", "optionen": ["Mangel", "Störung", "Hinweis"], "standard": "Mangel"},
            {"name": "mangel", "label": "Mangel aus Katalog", "typ": "text"},
            {"name": "beschreibung", "label": "Beschreibung", "typ": "textarea"},
            {"name": "gewerk", "label": "Gewerk", "typ": "select", "optionen": GEWERKE},
            {"name": "prioritaet", "label": "Priorität", "typ": "select", "optionen": PRIORITAETEN, "standard": "Normal"},
            {"name": "gemeldet_von", "label": "Gemeldet von", "typ": "text"},
            {"name": "gemeldet_am", "label": "Erfasst am", "typ": "date"},
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
    "schluessel": {
        "label": "Schlüssel und Transponder", "einzahl": "Schlüssel oder Transponder", "anzeige": ["nummer", "bezeichnung"],
        "sort": "nummer",
        "felder": [
            {"name": "objekt_id", "label": "Objekt", "typ": "ref", "ref": "objekte", "pflicht": True, "liste": True},
            {"name": "art", "label": "Art", "typ": "select", "optionen": ["Schlüssel", "Transponder"], "standard": "Schlüssel", "liste": True},
            {"name": "nummer", "label": "Nummer", "typ": "text", "pflicht": True, "liste": True},
            {"name": "bezeichnung", "label": "Bezeichnung", "typ": "text", "pflicht": True, "liste": True},
            {"name": "schliessanlage", "label": "Schließanlage / Zutrittssystem", "typ": "text", "liste": True},
            {"name": "chip_nr", "label": "Transponder- / Chip-Nummer", "typ": "text"},
            {"name": "schliessbereich", "label": "Schließt / berechtigt für (Türen, Räume, Zeiten)", "typ": "textarea"},
            {"name": "anzahl", "label": "Anzahl Exemplare", "typ": "number", "standard": 1, "liste": True},
            {"name": "aufbewahrung", "label": "Aufbewahrung (Schrank, Haken)", "typ": "text", "liste": True},
            {"name": "status", "label": "Zustand", "typ": "select", "optionen": ["aktiv", "verloren", "gesperrt", "außer Betrieb"],
             "standard": "aktiv", "liste": True},
            {"name": "notiz", "label": "Notiz", "typ": "textarea"},
        ],
    },
    "sv_maengel": {
        "label": "SV-Mängel", "einzahl": "SV-Mangel", "anzeige": ["beschreibung"], "sort": "frist",
        "felder": [
            {"name": "objekt_id", "label": "Objekt", "typ": "ref", "ref": "objekte", "pflicht": True, "liste": True},
            {"name": "anlage_id", "label": "Anlage", "typ": "ref", "ref": "anlagen", "filter": "objekt_id", "liste": True},
            {"name": "nummer", "label": "Nr. im Bericht", "typ": "text", "liste": True},
            {"name": "beschreibung", "label": "Mangel", "typ": "textarea", "pflicht": True, "liste": True},
            {"name": "ort", "label": "Ort", "typ": "text"},
            {"name": "einstufung", "label": "Einstufung", "typ": "select", "optionen": SV_EINSTUFUNGEN, "liste": True},
            {"name": "bewertung_bericht", "label": "Bewertung laut Bericht (z. B. M(B), 2)", "typ": "text"},
            {"name": "frist", "label": "Frist", "typ": "date", "liste": True},
            {"name": "frist_text", "label": "Frist laut Bericht", "typ": "text"},
            {"name": "status", "label": "Status", "typ": "select", "optionen": SV_STATUS, "standard": "offen", "liste": True},
            {"name": "sachstand", "label": "Sachstand", "typ": "textarea"},
            {"name": "firma", "label": "Firma (ausführend)", "typ": "text"},
            {"name": "dienstleister_id", "label": "Dienstleister aus der Liste", "typ": "ref", "ref": "dienstleister"},
            {"name": "angebot", "label": "Angebot-Nr.", "typ": "text"},
            {"name": "kosten", "label": "Kosten netto", "typ": "money"},
            {"name": "beauftragt_am", "label": "Beauftragt am", "typ": "date"},
            {"name": "geplant", "label": "Geplante Ausführung", "typ": "text"},
            {"name": "behoben_am", "label": "Fertigstellung", "typ": "date"},
            {"name": "rechnung_nr", "label": "Rechnung-Nr.", "typ": "text"},
            {"name": "rechnung_summe", "label": "RG-Summe", "typ": "money"},
            {"name": "massnahme", "label": "Bemerkung / Maßnahme / Nachweis", "typ": "textarea"},
            {"name": "kommentar", "label": "Kommentar", "typ": "textarea"},
            {"name": "bericht_id", "label": "SV-Bericht", "typ": "ref", "ref": "dokumente", "filter": "objekt_id"},
            {"name": "pruefdatum", "label": "Prüfdatum", "typ": "date"},
            {"name": "seite", "label": "Seite im Bericht", "typ": "number"},
            {"name": "ticket_id", "label": "Störmeldung", "typ": "ref", "ref": "tickets", "intern": True, "lose": True},
            {"name": "quelle", "label": "Erfasst durch", "typ": "text", "nurlesen": True},
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

SQL_TYP = {"number": "REAL", "money": "REAL", "bool": "INTEGER", "ref": "INTEGER", "person": "INTEGER"}

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
CREATE TABLE IF NOT EXISTS schluessel_uebergaben (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nummer TEXT,
    objekt_id INTEGER NOT NULL,
    schluessel TEXT NOT NULL,
    ausgeber_id INTEGER,
    ausgeber_name TEXT NOT NULL,
    ausgeber_email TEXT,
    empfaenger_name TEXT NOT NULL,
    empfaenger_firma TEXT,
    empfaenger_email TEXT NOT NULL,
    empfaenger_tel TEXT,
    zweck TEXT,
    ausgabe_zeit TEXT NOT NULL,
    rueckgabe_bis TEXT NOT NULL,
    erinnerung_um TEXT,
    quittung_senden INTEGER DEFAULT 1,
    sig_ausgeber TEXT,
    sig_empfaenger TEXT,
    bemerkung TEXT,
    status TEXT NOT NULL DEFAULT 'ausgegeben',
    rueckgabe_zeit TEXT,
    rueckgabe_von TEXT,
    rueckgabe_bemerkung TEXT,
    sig_rueckgabe TEXT,
    quittung_gesendet TEXT,
    erinnert TEXT,
    ueberfaellig_gemeldet TEXT,
    mail_versuche INTEGER DEFAULT 0,
    mail_fehler TEXT,
    erstellt TEXT
);
CREATE TABLE IF NOT EXISTS schluessel_fotos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uebergabe_id INTEGER NOT NULL,
    art TEXT NOT NULL,
    pfad TEXT NOT NULL,
    zeit TEXT NOT NULL,
    von TEXT
);
CREATE TABLE IF NOT EXISTS sv_auswertungen (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dokument_id INTEGER NOT NULL,
    zeit TEXT NOT NULL,
    von TEXT,
    ergebnis TEXT NOT NULL,
    uebernommen TEXT
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
CREATE TABLE IF NOT EXISTS checklisten_durchgaenge (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    checkliste_id INTEGER NOT NULL,
    objekt_id INTEGER,
    anlage_id INTEGER,
    zeit TEXT NOT NULL,
    wer TEXT,
    ergebnisse TEXT,
    bemerkung TEXT,
    abweichungen INTEGER DEFAULT 0,
    lat REAL,
    lon REAL
);
CREATE TABLE IF NOT EXISTS checkpoints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    checkliste_id INTEGER NOT NULL,
    bereich TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    erstellt TEXT
);
CREATE TABLE IF NOT EXISTS checkpoint_scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    checkpoint_id INTEGER NOT NULL,
    benutzer_id INTEGER,
    wer TEXT,
    zeit TEXT NOT NULL,
    lat REAL,
    lon REAL
);
CREATE TABLE IF NOT EXISTS benachrichtigungen (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    benutzer_id INTEGER NOT NULL,
    schluessel TEXT NOT NULL,
    zeit TEXT NOT NULL,
    titel TEXT NOT NULL,
    text TEXT,
    link TEXT,
    art TEXT,
    gelesen INTEGER DEFAULT 0,
    UNIQUE (benutzer_id, schluessel)
);
CREATE TABLE IF NOT EXISTS push_abos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    benutzer_id INTEGER NOT NULL,
    endpoint TEXT NOT NULL UNIQUE,
    geraet TEXT,
    erstellt TEXT
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
    OBJ_PFAD.mkdir(parents=True, exist_ok=True)
    SCHL_PFAD.mkdir(parents=True, exist_ok=True)
    PROFIL_PFAD.mkdir(parents=True, exist_ok=True)
    with db() as con:
        for name, res in RESSOURCEN.items():
            spalten = ["id INTEGER PRIMARY KEY AUTOINCREMENT"]
            for f in res["felder"]:
                if f.get("virtuell"):
                    continue
                spalten.append(f'"{f["name"]}" {SQL_TYP.get(f["typ"], "TEXT")}')
            if name == "dokumente" or res.get("datei"):
                spalten.append('"pfad" TEXT')
            spalten += ['"erstellt" TEXT', '"geaendert" TEXT']
            con.execute(f'CREATE TABLE IF NOT EXISTS "{name}" ({", ".join(spalten)})')
            # neue Felder in bestehende Datenbank nachtragen
            vorhanden = {r["name"] for r in con.execute(f'PRAGMA table_info("{name}")')}
            for f in res["felder"]:
                if f.get("virtuell"):
                    continue
                if f["name"] not in vorhanden:
                    con.execute(f'ALTER TABLE "{name}" ADD COLUMN "{f["name"]}" {SQL_TYP.get(f["typ"], "TEXT")}')
        con.executescript(EXTRA_SQL)
        for r in con.execute("SELECT id FROM anlagen WHERE qr_token IS NULL OR qr_token=''").fetchall():
            con.execute("UPDATE anlagen SET qr_token=? WHERE id=?", (neuer_qr_token(), r["id"]))
        con.execute('CREATE UNIQUE INDEX IF NOT EXISTS "ux_anlagen_qr" ON anlagen(qr_token)')
        con.execute("UPDATE sv_maengel SET einstufung='erheblich' WHERE einstufung='wesentlich'")
        for r in con.execute("SELECT id FROM objekte WHERE qr_token IS NULL OR qr_token=''").fetchall():
            con.execute("UPDATE objekte SET qr_token=? WHERE id=?", (neuer_qr_token(), r["id"]))
        con.execute('CREATE UNIQUE INDEX IF NOT EXISTS "ux_objekte_qr" ON objekte(qr_token)')
        if "bild" not in {r["name"] for r in con.execute("PRAGMA table_info(benutzer)")}:
            con.execute("ALTER TABLE benutzer ADD COLUMN bild TEXT")
        if "mail_an" not in {r["name"] for r in con.execute("PRAGMA table_info(benutzer)")}:
            con.execute("ALTER TABLE benutzer ADD COLUMN mail_an INTEGER DEFAULT 1")
        vorhanden_bn = {r["name"] for r in con.execute("PRAGMA table_info(benachrichtigungen)")}
        for spalte in ("gemailt", "gepusht", "mailfehler"):
            if spalte not in vorhanden_bn:
                con.execute(f"ALTER TABLE benachrichtigungen ADD COLUMN {spalte} INTEGER DEFAULT 0")
                if spalte != "mailfehler":
                    con.execute(f"UPDATE benachrichtigungen SET {spalte}=2")
        if "rechte" not in {r["name"] for r in con.execute("PRAGMA table_info(benutzer)")}:
            con.execute("ALTER TABLE benutzer ADD COLUMN rechte TEXT")
        con.execute("UPDATE benutzer SET rolle='zuschauer' WHERE rolle='lesen'")
        vorhanden_dg = {r["name"] for r in con.execute("PRAGMA table_info(checklisten_durchgaenge)")}
        for spalte in ("unterschrift", "unterschrift_name", "checkpoints", "start", "pruef_status", "geprueft_von", "geprueft_am", "pruef_kommentar"):
            if spalte not in vorhanden_dg:
                con.execute(f"ALTER TABLE checklisten_durchgaenge ADD COLUMN {spalte} TEXT")
        for spalte in ("benutzer_id", "pruefer_id"):
            if spalte not in vorhanden_dg:
                con.execute(f"ALTER TABLE checklisten_durchgaenge ADD COLUMN {spalte} INTEGER")
        vorhanden = {r["name"] for r in con.execute("PRAGMA table_info(wartung_historie)")}
        for spalte, typ in (("lat", "REAL"), ("lon", "REAL"), ("checkliste", "TEXT"), ("pruefart", "TEXT")):
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
    if t == "jsonliste":
        if isinstance(wert, str):
            try:
                wert = json.loads(wert)
            except ValueError:
                raise Fehler(400, f'„{feld["label"]}“ ist ungültig.')
        if not isinstance(wert, list) or len(wert) > 300:
            raise Fehler(400, f'„{feld["label"]}“ ist ungültig.')
        punkte = []
        for p in wert:
            if not isinstance(p, dict) or not str(p.get("text") or "").strip():
                continue
            typ = p.get("typ") if p.get("typ") in ("haken", "zahl", "text") else "haken"
            def zahl_oder_nichts(v):
                if v in (None, ""):
                    return None
                try:
                    return float(str(v).replace(",", "."))
                except ValueError:
                    raise Fehler(400, f'Prüfpunkt „{str(p.get("text"))[:40]}“: Sollwert ist keine Zahl.')
            try:
                anlage = int(p["anlage_id"]) if p.get("anlage_id") not in (None, "") else None
            except (TypeError, ValueError):
                anlage = None
            punkte.append({"text": str(p["text"]).strip()[:300], "typ": typ, "einheit": str(p.get("einheit") or "")[:20],
                           "min": zahl_oder_nichts(p.get("min")), "max": zahl_oder_nichts(p.get("max")),
                           "pflicht": bool(p.get("pflicht", True)), "bereich": str(p.get("bereich") or "").strip()[:120],
                           "anlage_id": anlage, "hinweis": str(p.get("hinweis") or "").strip()[:300]})
        return json.dumps(punkte, ensure_ascii=False)
    if t == "json":
        if isinstance(wert, str):
            try:
                wert = json.loads(wert)
            except ValueError:
                raise Fehler(400, f'„{feld["label"]}“ ist ungültig.')
        if not isinstance(wert, dict) or len(wert) > 60:
            raise Fehler(400, f'„{feld["label"]}“ ist ungültig.')
        sauber = {}
        for k, v in wert.items():
            if not isinstance(k, str) or len(k) > 80:
                raise Fehler(400, f'„{feld["label"]}“ ist ungültig.')
            if isinstance(v, (bool, int, float)) or v is None:
                sauber[k] = v
            else:
                sauber[k] = str(v)[:500]
        return json.dumps(sauber, ensure_ascii=False)
    if t in ("number", "money"):
        try:
            return float(str(wert).replace(",", "."))
        except ValueError:
            raise Fehler(400, f'„{feld["label"]}“ muss eine Zahl sein.')
    if t in ("ref", "person"):
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
    pruefart = daten.get("pruefart") or None
    if pruefart not in (None, "Prüfung", "Nachprüfung"):
        raise Fehler(400, "Prüfart ist ungültig.")
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
            "titel": f'Mangel aus {w["titel"]}' if w["titel"].startswith(w["art"]) else f'Mangel aus {w["art"]}: {w["titel"]}', "beschreibung": bemerkung,
            "prioritaet": "Hoch", "status": "Neu", "gemeldet_von": benutzer["name"],
            "gemeldet_am": datum, "dienstleister_id": w["dienstleister_id"],
        })
    con.execute(
        "INSERT INTO wartung_historie (wartung_id, datum, ergebnis, bemerkung, erfasst_von, ticket_id, lat, lon, checkliste, pruefart) "
        "VALUES (?,?,?,?,?,?,?,?,?,?)", (wid, datum, ergebnis, bemerkung, benutzer["name"], ticket_id, lat, lon, checkliste, pruefart))
    if pruefart == "Nachprüfung":
        # Eine Nachprüfung schließt Mängel ab, verschiebt aber nicht den Prüfzyklus
        con.execute("UPDATE wartungen SET nachpruefung=NULL, geaendert=? WHERE id=?", (jetzt(), wid))
    elif ergebnis != "Nicht durchgeführt":
        naechste = plus_monate(dt.date.fromisoformat(datum), int(w["intervall_monate"] or 12)).isoformat()
        con.execute("UPDATE wartungen SET letzte=?, naechste=?, geaendert=? WHERE id=?",
                    (datum, naechste, jetzt(), wid))
    protokollieren(con, benutzer, "erledigt", "wartungen", wid, ergebnis)
    return {"ok": True, "ticket_id": ticket_id}


FRIST_TAGE = {"hoch": 3, "mittel": 14, "gering": 30}


def ticket_anlegen(con, benutzer, daten: dict) -> int:
    sauber = daten_pruefen(RESSOURCEN["tickets"], daten, neu=True)
    if sauber.get("gefaehrdung") and not sauber.get("faellig_am"):
        sauber["faellig_am"] = (heute() + dt.timedelta(days=FRIST_TAGE[sauber["gefaehrdung"]])).isoformat()
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


EINSTELLUNGEN_STANDARD = {"basis_url": "", "oeffentlich_melden": "0", "oeffentlich_objekt": "1", "mail_aktiv": "0",
                          "smtp_host": "", "smtp_port": "587", "smtp_tls": "starttls", "smtp_user": "", "smtp_pass": "",
                          "smtp_absender": "", "vapid_privat": "", "vapid_public": "",
                          "ki_aktiv": "0", "ki_schluessel": "", "feierabend": "17:00", "schluessel_vorlauf": "60"}
EINSTELLUNGEN_OEFFENTLICH = ("basis_url", "oeffentlich_melden", "oeffentlich_objekt", "mail_aktiv", "ki_aktiv", "feierabend",
                             "schluessel_vorlauf")
EINSTELLUNGEN_SMTP = ("smtp_host", "smtp_port", "smtp_tls", "smtp_user", "smtp_absender")
VERSAND: "versand.Versand | None" = None
MIETER_THEMEN = {
    "Heizung / zu kalt oder zu warm": "Heizung", "Wasser / Sanitär / WC": "Sanitär", "Strom / Licht": "Elektro",
    "Aufzug": "Aufzug", "Türen / Tore / Schlösser": "Türen/Tore", "Lüftung / Klima": "Lüftung/Klima",
    "Brandschutz / Fluchtweg": "Brandschutz", "Reinigung / Müll": "Reinigung", "Außenanlagen / Parkplatz": "Außenanlagen",
    "Sonstiges": "Sonstiges",
}


def einstellung(con, schluessel: str) -> str:
    r = con.execute("SELECT wert FROM einstellungen WHERE schluessel=?", (schluessel,)).fetchone()
    return r["wert"] if r and r["wert"] is not None else EINSTELLUNGEN_STANDARD.get(schluessel, "")


def naechste_inventarnr(con, kategorie_id) -> str | None:
    k = con.execute("SELECT nummernkreis FROM kat_kategorien WHERE id=?", (kategorie_id,)).fetchone()
    praefix = (k["nummernkreis"] or "").strip() if k else ""
    if not praefix.isdigit():
        return None
    hoechste = 0
    for (nr,) in con.execute("SELECT nummer FROM anlagen WHERE nummer LIKE ?", (praefix + "%",)):
        rest = (nr or "")[len(praefix):]
        if len(rest) == 5 and rest.isdigit():
            hoechste = max(hoechste, int(rest))
    return f"{praefix}{hoechste + 1:05d}"


def einfuegen(con, tabelle: str, sauber: dict) -> int:
    sauber = dict(sauber)
    if tabelle in ("anlagen", "objekte") and not sauber.get("qr_token"):
        sauber["qr_token"] = neuer_qr_token()
    if tabelle == "anlagen" and not sauber.get("nummer") and sauber.get("kategorie_id"):
        nr = naechste_inventarnr(con, sauber["kategorie_id"])
        if nr:
            sauber["nummer"] = nr
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
    ("schluessel_verwalten", "Schlüssel anlegen, ausgeben und zurücknehmen", "Verwaltung"),
    ("export", "Listen nach Excel exportieren", "Verwaltung"),
    ("loeschen", "Einträge löschen", "Verwaltung"),
    ("katalog_bearbeiten", "Katalog pflegen: Kategorien, Hersteller, Bezeichnungen, Mängel", "System"),
    ("benutzer_verwalten", "Zugänge und Rechte verwalten, Änderungsverlauf sehen", "System"),
    ("einstellungen", "Einstellungen ändern (QR-Adresse, Melden ohne Anmeldung)", "System"),
]
RECHTE_KEYS = [r[0] for r in RECHTE]
RECHTE_STANDARD = {
    "benutzer": {k: k not in ("loeschen", "benutzer_verwalten", "einstellungen", "katalog_bearbeiten") for k in RECHTE_KEYS},
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
    "symbole": "plaene_bearbeiten", "wartungen": "wartung_planen", "sv_maengel": "tickets_bearbeiten",
    "schluessel": "schluessel_verwalten", "schluesseluebergaben": "schluessel_verwalten", "vertraege": "vertraege_bearbeiten",
    "dienstleister": "vertraege_bearbeiten", "zaehler": "zaehler_erfassen", "ablesungen": "zaehler_erfassen",
    "dokumente": "dokumente_hochladen", "kat_kategorien": "katalog_bearbeiten", "kat_gruppen": "katalog_bearbeiten",
    "kat_typen": "katalog_bearbeiten", "kat_maengel": "katalog_bearbeiten", "checklisten": "wartung_planen",
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
    if t0 == "ich":
        return None
    if m == "DELETE":
        return "loeschen"
    if t0 == "checklisten" and len(teile) == 3 and teile[2] == "durchgang":
        return "wartung_erledigen"
    if t0 == "dokumente" and len(teile) == 3 and teile[2] == "sv-auswertung":
        return "tickets_bearbeiten"
    if t0 == "svberichte":
        return "tickets_bearbeiten"
    if t0 in ("schluesseluebergaben", "schluesselbestand"):
        return None if m == "GET" else "schluessel_verwalten"
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


def checkliste_termin(c: dict, letzte: str | None) -> dict:
    """Nächste Fälligkeit (Datum und Uhrzeit) und ab wann erinnert wird."""
    tage = RHYTHMUS.get(c.get("rhythmus"))
    if not tage or not c.get("aktiv"):
        return {"naechste": None, "naechste_zeit": None, "erinnerung_ab": None}
    datum_ = (dt.date.fromisoformat(letzte[:10]) + dt.timedelta(days=tage)) if letzte else heute()
    uhr = c.get("faellig_uhrzeit") or "08:00"
    if not re.match(r"^\d{1,2}:\d{2}$", uhr):
        uhr = "08:00"
    h, mi = (int(x) for x in uhr.split(":"))
    faellig = dt.datetime.combine(datum_, dt.time(min(h, 23), min(mi, 59)))
    try:
        vorher = float(c.get("erinnern_vorher") if c.get("erinnern_vorher") is not None else 1)
    except (TypeError, ValueError):
        vorher = 1
    delta = dt.timedelta(hours=vorher) if c.get("erinnern_einheit") == "Stunden" else dt.timedelta(days=vorher)
    return {"naechste": datum_.isoformat(), "naechste_zeit": faellig.isoformat(timespec="minutes"),
            "erinnerung_ab": (faellig - delta).isoformat(timespec="minutes")}


def benachrichtigen(con, benutzer_id: int, schluessel: str, titel: str, text: str = "", link: str = "", art: str = "info") -> None:
    con.execute("INSERT OR IGNORE INTO benachrichtigungen (benutzer_id, schluessel, zeit, titel, text, link, art) VALUES (?,?,?,?,?,?,?)",
                (benutzer_id, schluessel, jetzt(), titel[:200], text[:500], link[:200], art))


def faellige_erinnerungen(con, benutzer_id: int) -> None:
    """Erzeugt Erinnerungen für zugewiesene Checklisten und Rundgänge, sobald die Vorwarnzeit erreicht ist."""
    jetzt_ = dt.datetime.now().isoformat(timespec="minutes")
    for c in con.execute("SELECT c.*, o.kuerzel AS o_kuerzel FROM checklisten c LEFT JOIN objekte o ON o.id=c.objekt_id "
                         "WHERE c.zustaendig_id=? AND c.aktiv=1", (benutzer_id,)).fetchall():
        c = dict(c)
        letzte = con.execute("SELECT MAX(zeit) FROM checklisten_durchgaenge WHERE checkliste_id=?", (c["id"],)).fetchone()[0]
        t = checkliste_termin(c, letzte)
        if not t["naechste_zeit"]:
            continue
        art = "Rundgang" if c["art"] == "Rundgang" else "Checkliste"
        wann = f'{dt.date.fromisoformat(t["naechste"]).strftime("%d.%m.%Y")} um {t["naechste_zeit"][11:16]} Uhr'
        link = f'#/checklisten/{c["id"]}?durchfuehren=1'
        if jetzt_ >= t["naechste_zeit"]:
            benachrichtigen(con, benutzer_id, f'ueber:{c["id"]}:{t["naechste_zeit"]}', f'{art} fällig: {c["titel"]}',
                            f'{c["o_kuerzel"] or ""} · war fällig am {wann}', link, "ueber")
        elif jetzt_ >= t["erinnerung_ab"]:
            benachrichtigen(con, benutzer_id, f'bald:{c["id"]}:{t["naechste_zeit"]}', f'{art} steht an: {c["titel"]}',
                            f'{c["o_kuerzel"] or ""} · fällig am {wann}', link, "bald")


def checkpoint_stand(con, cid: int, benutzer_id: int, start: str) -> list[dict]:
    """Je Checkpoint der erste Scan dieses Zugangs seit Beginn des Durchgangs."""
    if not re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$", start or ""):
        start = (dt.datetime.now() - dt.timedelta(hours=12)).isoformat(timespec="seconds")
    grenze = (dt.datetime.now() - dt.timedelta(hours=24)).isoformat(timespec="seconds")
    start = max(start, grenze)
    aus = []
    for cp in con.execute("SELECT * FROM checkpoints WHERE checkliste_id=? ORDER BY id", (cid,)):
        r = con.execute("SELECT MIN(zeit) FROM checkpoint_scans WHERE checkpoint_id=? AND benutzer_id=? AND zeit>=?",
                        (cp["id"], benutzer_id, start)).fetchone()
        aus.append({"id": cp["id"], "bereich": cp["bereich"], "zeit": r[0]})
    return aus


def checkpoints_abgleichen(con, cid: int) -> list[dict]:
    """Legt für jede Station eines Rundgangs einen Checkpoint an. Bestehende Codes bleiben erhalten."""
    c = con.execute("SELECT punkte FROM checklisten WHERE id=?", (cid,)).fetchone()
    if not c:
        raise Fehler(404, "Checkliste nicht gefunden.")
    stationen = []
    for p in json.loads(c["punkte"] or "[]"):
        b = (p.get("bereich") or "").strip()
        if b and b not in stationen:
            stationen.append(b)
    vorhanden = {r["bereich"]: r for r in con.execute("SELECT * FROM checkpoints WHERE checkliste_id=?", (cid,))}
    for b in stationen:
        if b not in vorhanden:
            con.execute("INSERT INTO checkpoints (checkliste_id, bereich, token, erstellt) VALUES (?,?,?,?)",
                        (cid, b, neuer_qr_token(), jetzt()))
    for b, r in vorhanden.items():
        if b not in stationen and not con.execute("SELECT 1 FROM checkpoint_scans WHERE checkpoint_id=?", (r["id"],)).fetchone():
            con.execute("DELETE FROM checkpoints WHERE id=?", (r["id"],))
    reihenfolge = {b: i for i, b in enumerate(stationen)}
    liste = [dict(r) for r in con.execute("SELECT * FROM checkpoints WHERE checkliste_id=?", (cid,)) if r["bereich"] in reihenfolge]
    liste.sort(key=lambda r: reihenfolge[r["bereich"]])
    return liste


def checkliste_durchfuehren(con, benutzer, cid: int, d: dict) -> dict:
    c = zeile(con.execute("SELECT * FROM checklisten WHERE id=?", (cid,)).fetchone())
    if not c:
        raise Fehler(404, "Checkliste nicht gefunden.")
    punkte = json.loads(c["punkte"] or "[]")
    eingaben = {}
    for e in d.get("ergebnisse") or []:
        if isinstance(e, dict) and isinstance(e.get("idx"), int):
            eingaben[e["idx"]] = e
    ergebnisse, abw, fehlt = [], [], []
    for i, p in enumerate(punkte):
        e = eingaben.get(i, {})
        status = e.get("status") if e.get("status") in ("ok", "mangel", "na") else None
        notiz = str(e.get("notiz") or "").strip()[:500]
        wert = None
        abweichung = False
        if p["typ"] == "haken":
            if status is None and p.get("pflicht"):
                fehlt.append(p["text"])
            abweichung = status == "mangel"
        elif p["typ"] == "zahl":
            roh = e.get("wert")
            if roh not in (None, ""):
                try:
                    wert = float(str(roh).replace(",", "."))
                except ValueError:
                    raise Fehler(400, f'„{p["text"]}“: bitte eine Zahl eintragen.')
            if wert is None and status != "na" and p.get("pflicht"):
                fehlt.append(p["text"])
            if wert is not None and ((p.get("min") is not None and wert < p["min"]) or (p.get("max") is not None and wert > p["max"])):
                abweichung = True
            if status == "mangel":
                abweichung = True
        else:
            wert = str(e.get("wert") or "").strip()[:1000] or None
            if not wert and status != "na" and p.get("pflicht"):
                fehlt.append(p["text"])
            abweichung = status == "mangel"
        ergebnisse.append({**p, "status": status, "wert": wert, "notiz": notiz, "abweichung": abweichung})
        if abweichung:
            abw.append(ergebnisse[-1])
    if fehlt:
        raise Fehler(400, "Bitte noch ausfüllen: " + ", ".join(fehlt[:5]) + (" …" if len(fehlt) > 5 else ""))
    # Unterschrift
    unterschrift = str(d.get("unterschrift") or "")
    if unterschrift and not re.match(r"^data:image/png;base64,[A-Za-z0-9+/=]+$", unterschrift):
        raise Fehler(400, "Die Unterschrift ist ungültig.")
    if len(unterschrift) > 400_000:
        raise Fehler(400, "Die Unterschrift ist zu groß.")
    unterschrift_name = str(d.get("unterschrift_name") or "").strip()[:120]
    if c.get("unterschrift_pflicht") and not unterschrift:
        raise Fehler(400, "Bitte unten unterschreiben.")
    # Checkpoints
    start = str(d.get("start") or "")[:19]
    scans = checkpoint_stand(con, cid, benutzer["id"], start)
    if c.get("checkpoints_pflicht"):
        fehlend = [s_["bereich"] for s_ in scans if not s_["zeit"]]
        if fehlend:
            raise Fehler(400, "Diese Checkpoints wurden noch nicht gescannt: " + ", ".join(fehlend))
    lat = lon = None
    try:
        if d.get("lat") is not None:
            lat, lon = float(d["lat"]), float(d["lon"])
    except (TypeError, ValueError, KeyError):
        lat = lon = None
    cur = con.execute(
        "INSERT INTO checklisten_durchgaenge (checkliste_id, objekt_id, anlage_id, zeit, wer, ergebnisse, bemerkung, abweichungen, lat, lon, "
        "unterschrift, unterschrift_name, checkpoints, start) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (cid, c["objekt_id"], c["anlage_id"], jetzt(), benutzer["name"], json.dumps(ergebnisse, ensure_ascii=False),
         str(d.get("bemerkung") or "").strip()[:3000] or None, len(abw), lat, lon, unterschrift or None,
         unterschrift_name or (benutzer["name"] if unterschrift else None),
         json.dumps(scans, ensure_ascii=False) if scans else None, start or None))
    did = cur.lastrowid
    tickets = []
    if d.get("maengel_anlegen") and abw:
        for e in abw:
            wert_text = ""
            if e["typ"] == "zahl" and e["wert"] is not None:
                soll = " bis ".join(x for x in (f'{e["min"]:g}' if e.get("min") is not None else "", f'{e["max"]:g}' if e.get("max") is not None else "") if x)
                wert_text = f'Messwert {e["wert"]:g} {e.get("einheit") or ""}'.strip() + (f" (Soll {soll} {e.get('einheit') or ''})".rstrip() if soll else "")
            beschreibung = "\n".join(x for x in (f'Aus {c["art"].lower() == "rundgang" and "Rundgang" or "Checkliste"} „{c["titel"]}“',
                                                  f'Station: {e["bereich"]}' if e.get("bereich") else "", wert_text, e.get("notiz")) if x)
            tid = ticket_anlegen(con, benutzer, {
                "objekt_id": c["objekt_id"], "anlage_id": e.get("anlage_id") or c["anlage_id"],
                "titel": e["text"][:150], "beschreibung": beschreibung, "art": "Mangel", "gefaehrdung": "mittel",
                "status": "Neu", "gemeldet_von": benutzer["name"], "mangel": f"Durchgang {did}"})
            tickets.append(tid)
    # Zur Prüfung an den Objektleiter
    pruefer = c.get("pruefer_id")
    if not pruefer:
        o = con.execute("SELECT objektleiter_id FROM objekte WHERE id=?", (c["objekt_id"],)).fetchone()
        pruefer = o["objektleiter_id"] if o else None
    if pruefer and not con.execute("SELECT 1 FROM benutzer WHERE id=? AND aktiv=1", (pruefer,)).fetchone():
        pruefer = None
    con.execute("UPDATE checklisten_durchgaenge SET benutzer_id=?, pruefer_id=?, pruef_status=? WHERE id=?",
                (benutzer["id"], pruefer, "offen" if pruefer else None, did))
    if pruefer:
        art = "Rundgang" if c["art"] == "Rundgang" else "Checkliste"
        benachrichtigen(con, pruefer, f"pruefen:{did}", f"{art} zur Prüfung: {c['titel']}",
                        f"von {benutzer['name']} · {len(abw)} Abweichung{'en' if len(abw) != 1 else ''}" if abw else f"von {benutzer['name']} · alles i. O.",
                        f"#/checklisten/{cid}?durchgang={did}", "pruefung")
    protokollieren(con, benutzer, "durchgeführt", "checklisten", cid, f"{len(abw)} Abweichungen")
    return {"ok": True, "id": did, "abweichungen": len(abw), "tickets": len(tickets), "pruefer": pruefer}


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
    for dg in con.execute(
            "SELECT d.*, c.titel FROM checklisten_durchgaenge d JOIN checklisten c ON c.id=d.checkliste_id WHERE d.anlage_id=?", (aid,)):
        ein.append({"zeit": dg["zeit"], "wer": dg["wer"], "art": "checkliste", "info": dg["titel"], "id": dg["id"],
                    "typ": "checkliste", "abweichungen": dg["abweichungen"]})
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
            "a.symbol_id AS a_symbol, a.kategorie_id AS a_kat, a.pruefung_pflicht AS a_pp, a.wartung_pflicht AS a_wp, "
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


# ---------------------------------------------------------------------------
# Schlüsselmanager
# ---------------------------------------------------------------------------
EMAIL_MUSTER = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _zeitpunkt(wert, label: str) -> str:
    try:
        return dt.datetime.fromisoformat(str(wert)).isoformat(timespec="minutes")
    except (TypeError, ValueError):
        raise Fehler(400, f"{label} ist ungültig.")


def schluessel_standardzeiten(con, tag: dt.date | None = None) -> dict:
    tag = tag or heute()
    hh, mm = (einstellung(con, "feierabend") or "17:00").split(":")
    bis = dt.datetime.combine(tag, dt.time(int(hh), int(mm)))
    vorlauf = int(einstellung(con, "schluessel_vorlauf") or 60)
    return {"rueckgabe_bis": bis.isoformat(timespec="minutes"),
            "erinnerung_um": (bis - dt.timedelta(minutes=vorlauf)).isoformat(timespec="minutes"),
            "feierabend": f"{hh}:{mm}", "vorlauf": vorlauf}


def schluessel_offen(con, ohne_uebergabe: int | None = None) -> dict:
    """Wie viele Exemplare je Schlüssel gerade ausgegeben sind."""
    offen: dict[int, int] = {}
    for r in con.execute("SELECT id, schluessel FROM schluessel_uebergaben WHERE status='ausgegeben'"):
        if r["id"] == ohne_uebergabe:
            continue
        for s in json.loads(r["schluessel"] or "[]"):
            offen[s["id"]] = offen.get(s["id"], 0) + int(s.get("anzahl") or 1)
    return offen


def schluessel_bestand(con, objekt_id=None) -> list:
    offen = schluessel_offen(con)
    inhaber: dict[int, list] = {}
    for r in con.execute("SELECT id, nummer, empfaenger_name, empfaenger_firma, rueckgabe_bis, schluessel FROM schluessel_uebergaben "
                         "WHERE status='ausgegeben'"):
        for s in json.loads(r["schluessel"] or "[]"):
            inhaber.setdefault(s["id"], []).append({"uebergabe_id": r["id"], "nummer": r["nummer"], "name": r["empfaenger_name"],
                                                     "firma": r["empfaenger_firma"], "bis": r["rueckgabe_bis"], "anzahl": s.get("anzahl", 1)})
    sql, werte = "SELECT * FROM schluessel", []
    if objekt_id:
        sql += " WHERE objekt_id=?"
        werte.append(objekt_id)
    aus = []
    for r in con.execute(sql + " ORDER BY nummer COLLATE NOCASE", werte):
        z = dict(r)
        z["ausgegeben"] = offen.get(z["id"], 0)
        z["verfuegbar"] = max(int(z["anzahl"] or 1) - z["ausgegeben"], 0) if z["status"] in (None, "", "aktiv") else 0
        z["inhaber"] = inhaber.get(z["id"], [])
        aus.append(z)
    return aus


def schluessel_fotos_pruefen(fotos, art_text: str) -> list:
    """Fotos als data-URL prüfen, bevor etwas gespeichert wird. Mindestens eins ist Pflicht."""
    if not isinstance(fotos, list) or not fotos:
        raise Fehler(400, f"Bitte ein Foto der Schlüssel bei der {art_text} machen.")
    if len(fotos) > 6:
        raise Fehler(400, "Höchstens 6 Fotos je Übergabe.")
    aus = []
    for f in fotos:
        if not isinstance(f, str) or "," not in f or not f.startswith("data:image/"):
            raise Fehler(400, "Ein Foto ist ungültig.")
        try:
            inhalt = base64.b64decode(f.split(",", 1)[1], validate=True)
        except (ValueError, binascii.Error):
            raise Fehler(400, "Ein Foto ist ungültig.")
        endung = bild_endung(inhalt)
        if endung not in ("jpg", "png", "webp"):
            raise Fehler(400, "Fotos bitte als JPG, PNG oder WEBP.")
        if len(inhalt) > 6 * 1024 * 1024:
            raise Fehler(400, "Ein Foto ist zu groß (höchstens 6 MB).")
        aus.append((inhalt, endung))
    return aus


def schluessel_fotos_speichern(con, uid: int, art: str, fotos: list, wer: str) -> None:
    for inhalt, endung in fotos:
        name = f"{uid}_{art}_{secrets.token_hex(6)}.{endung}"
        (SCHL_PFAD / name).write_bytes(inhalt)
        con.execute("INSERT INTO schluessel_fotos (uebergabe_id, art, pfad, zeit, von) VALUES (?,?,?,?,?)",
                    (uid, art, name, jetzt(), wer))


def uebergabe_laden(con, uid: int) -> dict:
    r = con.execute("SELECT u.*, o.kuerzel AS o_kuerzel, o.name AS o_name, o.strasse AS o_strasse, o.plz AS o_plz, o.ort AS o_ort "
                    "FROM schluessel_uebergaben u LEFT JOIN objekte o ON o.id=u.objekt_id WHERE u.id=?", (uid,)).fetchone()
    if not r:
        raise Fehler(404, "Übergabe nicht gefunden.")
    z = dict(r)
    z["schluessel"] = json.loads(z["schluessel"] or "[]")
    z["fotos"] = [{"id": f["id"], "art": f["art"], "zeit": f["zeit"]} for f in con.execute(
        "SELECT id, art, zeit FROM schluessel_fotos WHERE uebergabe_id=? ORDER BY id", (uid,))]
    return z


def uebergaben_liste(con, q: dict) -> list:
    bed, werte = [], []
    for feld in ("objekt_id", "status"):
        if q.get(feld) and q[feld][0]:
            bed.append(f"u.{feld}=?")
            werte.append(q[feld][0])
    sql = ("SELECT u.id, u.nummer, u.objekt_id, u.schluessel, u.ausgeber_name, u.empfaenger_name, u.empfaenger_firma, u.empfaenger_email, "
           "u.empfaenger_tel, u.zweck, u.ausgabe_zeit, u.rueckgabe_bis, u.erinnerung_um, u.status, u.rueckgabe_zeit, u.rueckgabe_von, "
           "u.erinnert, u.quittung_gesendet, u.mail_fehler, o.kuerzel AS o_kuerzel, o.name AS o_name "
           "FROM schluessel_uebergaben u LEFT JOIN objekte o ON o.id=u.objekt_id")
    if bed:
        sql += " WHERE " + " AND ".join(bed)
    aus = []
    for r in con.execute(sql + " ORDER BY CASE u.status WHEN 'ausgegeben' THEN 0 ELSE 1 END, u.rueckgabe_bis, u.id DESC LIMIT 500", werte):
        z = dict(r)
        z["schluessel"] = json.loads(z["schluessel"] or "[]")
        aus.append(z)
    return aus


def _unterschrift(wert) -> str | None:
    if not wert:
        return None
    wert = str(wert)
    if not wert.startswith("data:image/png;base64,") or len(wert) > 600_000:
        raise Fehler(400, "Die Unterschrift ist ungültig.")
    return wert


def uebergabe_anlegen(con, benutzer, d: dict) -> dict:
    try:
        objekt_id = int(d.get("objekt_id"))
    except (TypeError, ValueError):
        raise Fehler(400, "Bitte ein Objekt wählen.")
    if not con.execute("SELECT 1 FROM objekte WHERE id=?", (objekt_id,)).fetchone():
        raise Fehler(400, "Objekt nicht gefunden.")
    name = str(d.get("empfaenger_name") or "").strip()[:200]
    email = str(d.get("empfaenger_email") or "").strip()[:200]
    ausgeber = str(d.get("ausgeber_name") or benutzer["name"]).strip()[:200]
    if not name:
        raise Fehler(400, "Bitte den Namen der Person eintragen, die den Schlüssel erhält.")
    if not EMAIL_MUSTER.match(email):
        raise Fehler(400, "Bitte eine gültige E-Mail-Adresse der Person eintragen, die den Schlüssel erhält.")
    gewaehlt = d.get("schluessel") or []
    if not isinstance(gewaehlt, list) or not gewaehlt or len(gewaehlt) > 50:
        raise Fehler(400, "Bitte mindestens einen Schlüssel oder Transponder auswählen.")
    offen = schluessel_offen(con)
    liste = []
    for g in gewaehlt:
        try:
            sid, anz = int(g.get("id")), max(int(g.get("anzahl") or 1), 1)
        except (TypeError, ValueError, AttributeError):
            raise Fehler(400, "Schlüsselauswahl ist ungültig.")
        s = con.execute("SELECT * FROM schluessel WHERE id=? AND objekt_id=?", (sid, objekt_id)).fetchone()
        if not s:
            raise Fehler(400, "Ein gewählter Schlüssel oder Transponder gehört nicht zu diesem Objekt.")
        if s["status"] not in (None, "", "aktiv"):
            raise Fehler(400, f'{s["art"] or "Schlüssel"} {s["nummer"]} ist {s["status"]} und kann nicht ausgegeben werden.')
        frei = int(s["anzahl"] or 1) - offen.get(sid, 0)
        if anz > frei:
            raise Fehler(400, f'Von {s["art"] or "Schlüssel"} {s["nummer"]} sind nur noch {max(frei, 0)} Exemplare da.')
        liste.append({"id": sid, "nummer": s["nummer"], "bezeichnung": s["bezeichnung"], "anzahl": anz,
                      "art": s["art"] or "Schlüssel", "chip_nr": s["chip_nr"]})
    std = schluessel_standardzeiten(con)
    bis = _zeitpunkt(d.get("rueckgabe_bis") or std["rueckgabe_bis"], "Rückgabe bis")
    erinnerung = None
    if d.get("erinnern", True):
        erinnerung = _zeitpunkt(d.get("erinnerung_um") or std["erinnerung_um"], "Erinnerung")
    jetzt_ = jetzt()
    if bis <= jetzt_[:16]:
        raise Fehler(400, "Der Rückgabezeitpunkt liegt in der Vergangenheit.")
    sig_e = _unterschrift(d.get("sig_empfaenger"))
    if not sig_e:
        raise Fehler(400, "Bitte die Person, die den Schlüssel erhält, unterschreiben lassen.")
    fotos = schluessel_fotos_pruefen(d.get("fotos"), "Ausgabe")
    cur = con.execute(
        "INSERT INTO schluessel_uebergaben (objekt_id, schluessel, ausgeber_id, ausgeber_name, ausgeber_email, empfaenger_name, "
        "empfaenger_firma, empfaenger_email, empfaenger_tel, zweck, ausgabe_zeit, rueckgabe_bis, erinnerung_um, quittung_senden, "
        "sig_ausgeber, sig_empfaenger, bemerkung, erstellt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (objekt_id, json.dumps(liste, ensure_ascii=False), benutzer["id"], ausgeber, benutzer["email"], name,
         str(d.get("empfaenger_firma") or "").strip()[:200] or None, email, str(d.get("empfaenger_tel") or "").strip()[:60] or None,
         str(d.get("zweck") or "").strip()[:500] or None, jetzt_, bis, erinnerung, 1 if d.get("quittung", True) else 0,
         _unterschrift(d.get("sig_ausgeber")), sig_e, str(d.get("bemerkung") or "").strip()[:2000] or None, jetzt_))
    uid = cur.lastrowid
    nummer = f"SÜ-{heute().year}-{uid:04d}"
    con.execute("UPDATE schluessel_uebergaben SET nummer=? WHERE id=?", (nummer, uid))
    schluessel_fotos_speichern(con, uid, "ausgabe", fotos, benutzer["name"])
    protokollieren(con, benutzer, "Schlüssel ausgegeben", "schluessel_uebergaben", uid,
                   f'{nummer} an {name}: ' + ", ".join(s["nummer"] for s in liste))
    return uebergabe_laden(con, uid)


def uebergabe_aendern(con, benutzer, uid: int, d: dict) -> dict:
    u = uebergabe_laden(con, uid)
    if u["status"] != "ausgegeben":
        raise Fehler(400, "Diese Übergabe ist schon abgeschlossen.")
    if "rueckgabe_bis" in d:
        bis = _zeitpunkt(d["rueckgabe_bis"], "Rückgabe bis")
        con.execute("UPDATE schluessel_uebergaben SET rueckgabe_bis=?, ueberfaellig_gemeldet=NULL WHERE id=?", (bis, uid))
    if "erinnerung_um" in d:
        er = _zeitpunkt(d["erinnerung_um"], "Erinnerung") if d["erinnerung_um"] else None
        con.execute("UPDATE schluessel_uebergaben SET erinnerung_um=?, erinnert=NULL, mail_versuche=0 WHERE id=?", (er, uid))
    protokollieren(con, benutzer, "Rückgabezeit geändert", "schluessel_uebergaben", uid, u["nummer"])
    return uebergabe_laden(con, uid)


def uebergabe_rueckgabe(con, benutzer, uid: int, d: dict) -> dict:
    u = uebergabe_laden(con, uid)
    if u["status"] != "ausgegeben":
        raise Fehler(400, "Diese Schlüssel sind schon zurückgegeben.")
    fotos = schluessel_fotos_pruefen(d.get("fotos"), "Rückgabe")
    schluessel_fotos_speichern(con, uid, "rueckgabe", fotos, benutzer["name"])
    con.execute("UPDATE schluessel_uebergaben SET status='zurueck', rueckgabe_zeit=?, rueckgabe_von=?, rueckgabe_bemerkung=?, "
                "sig_rueckgabe=? WHERE id=?", (jetzt(), benutzer["name"], str(d.get("bemerkung") or "").strip()[:2000] or None,
                                              _unterschrift(d.get("unterschrift")), uid))
    if d.get("fehlend"):
        for sid in d["fehlend"]:
            con.execute("UPDATE schluessel SET status='verloren', geaendert=? WHERE id=?", (jetzt(), int(sid)))
    protokollieren(con, benutzer, "Schlüssel zurückgenommen", "schluessel_uebergaben", uid, u["nummer"])
    return uebergabe_laden(con, uid)


def _zeit_text(iso: str) -> str:
    t = dt.datetime.fromisoformat(iso)
    return f'{t.strftime("%d.%m.%Y")} um {t.strftime("%H:%M")} Uhr'


def _schluessel_text(u: dict) -> str:
    liste = json.loads(u["schluessel"]) if isinstance(u["schluessel"], str) else u["schluessel"]
    return "\n".join(f'– {x.get("art") or "Schlüssel"} {x["nummer"]} {x["bezeichnung"]}'
                     + (f' ({x["anzahl"]} Stück)' if int(x.get("anzahl") or 1) > 1 else "") for x in liste)


def _art_wort(u: dict) -> str:
    liste = json.loads(u["schluessel"]) if isinstance(u["schluessel"], str) else u["schluessel"]
    arten = {x.get("art") or "Schlüssel" for x in liste}
    return "Schlüssel und Transponder" if len(arten) > 1 else arten.pop() if arten else "Schlüssel"


def schluessel_mails_holen(con, mail_moeglich: bool) -> list:
    """Vom Versanddienst aufgerufen: Quittungen und Erinnerungen an Empfänger, Überfällig-Hinweise intern."""
    jetzt_ = dt.datetime.now().isoformat(timespec="minutes")
    # überfällig: intern Bescheid geben (unabhängig vom Mailversand)
    for u in con.execute("SELECT u.*, o.kuerzel AS o_kuerzel FROM schluessel_uebergaben u LEFT JOIN objekte o ON o.id=u.objekt_id "
                         "WHERE u.status='ausgegeben' AND u.rueckgabe_bis<? AND u.ueberfaellig_gemeldet IS NULL", (jetzt_,)).fetchall():
        if u["ausgeber_id"]:
            benachrichtigen(con, u["ausgeber_id"], f'sl-ueber:{u["id"]}:{u["rueckgabe_bis"]}', f'Schlüssel nicht zurück: {u["empfaenger_name"]}',
                            f'{u["nummer"]} ({u["o_kuerzel"] or ""}) sollte bis {_zeit_text(u["rueckgabe_bis"])} zurück sein.',
                            "#/schluessel", "warnung")
        con.execute("UPDATE schluessel_uebergaben SET ueberfaellig_gemeldet=? WHERE id=?", (jetzt_, u["id"]))
    if not mail_moeglich:
        return []
    aus = []
    for u in con.execute("SELECT u.*, o.kuerzel AS o_kuerzel, o.name AS o_name, o.strasse AS o_strasse, o.ort AS o_ort "
                         "FROM schluessel_uebergaben u LEFT JOIN objekte o ON o.id=u.objekt_id "
                         "WHERE u.mail_versuche<5 AND ((u.quittung_senden=1 AND u.quittung_gesendet IS NULL AND u.ausgabe_zeit>=?) "
                         "OR (u.status='ausgegeben' AND u.erinnerung_um IS NOT NULL AND u.erinnerung_um<=? AND u.erinnert IS NULL "
                         "AND u.rueckgabe_bis>?)) LIMIT 20",
                         ((dt.datetime.now() - dt.timedelta(days=2)).isoformat(timespec="seconds"), jetzt_, jetzt_)).fetchall():
        u = dict(u)
        objekt = " ".join(x for x in (u["o_name"], f'({u["o_strasse"]}, {u["o_ort"]})' if u["o_strasse"] else "") if x)
        liste = _schluessel_text(u)
        gruss = f'\n\nMit freundlichen Grüßen\n{u["ausgeber_name"]}\nCasa Concept Consulting GmbH & Co. KG'
        extern = {"antwort_an": u["ausgeber_email"] or "",
                  "fuss": "Casa Concept Consulting GmbH & Co. KG · Diese E-Mail wurde automatisch zu Ihrer Schlüsselübergabe versendet."}
        heute_ = u["rueckgabe_bis"][:10] == jetzt_[:10]
        wort = _art_wort(u)
        if u["quittung_senden"] == 1 and not u["quittung_gesendet"]:
            aus.append({"id": f'q:{u["id"]}', "an": u["empfaenger_email"],
                        "betreff": f'Schlüsselübergabe {u["nummer"]}: {u["o_name"] or ""}'.strip(),
                        "text": f'Guten Tag {u["empfaenger_name"]},\n\nSie haben am {_zeit_text(u["ausgabe_zeit"])} für das Objekt {objekt} '
                                f'folgende {wort} erhalten:\n{liste}\n\nBitte geben Sie die {wort} '
                                f'{"heute" if heute_ else "bis zum " + dt.date.fromisoformat(u["rueckgabe_bis"][:10]).strftime("%d.%m.%Y")} '
                                f'bis spätestens {u["rueckgabe_bis"][11:16]} Uhr bei {u["ausgeber_name"]} zurück.' + gruss,
                        "extern": extern})
        elif u["erinnerung_um"] and not u["erinnert"]:
            aus.append({"id": f'e:{u["id"]}', "an": u["empfaenger_email"],
                        "betreff": f'Erinnerung: Rückgabe {wort} {"heute " if heute_ else ""}bis {u["rueckgabe_bis"][11:16]} Uhr',
                        "text": f'Guten Tag {u["empfaenger_name"]},\n\nwir möchten Sie daran erinnern, die {wort} für das Objekt {objekt} '
                                f'{"heute" if heute_ else "am " + dt.date.fromisoformat(u["rueckgabe_bis"][:10]).strftime("%d.%m.%Y")} '
                                f'bis spätestens {u["rueckgabe_bis"][11:16]} Uhr bei {u["ausgeber_name"]} zurückzugeben:\n{liste}\n\n'
                                f'Übergabeprotokoll {u["nummer"]} vom {_zeit_text(u["ausgabe_zeit"])}.' + gruss,
                        "extern": extern})
    return aus


def schluessel_mail_gemeldet(con, kennung: str, ok: bool, fehler: str) -> None:
    art, uid = kennung.split(":")
    if ok:
        spalte = "quittung_gesendet" if art == "q" else "erinnert"
        con.execute(f"UPDATE schluessel_uebergaben SET {spalte}=?, mail_versuche=0, mail_fehler=NULL WHERE id=?", (jetzt(), int(uid)))
    else:
        con.execute("UPDATE schluessel_uebergaben SET mail_versuche=COALESCE(mail_versuche,0)+1, mail_fehler=? WHERE id=?",
                    (fehler[:300], int(uid)))


# ---------------------------------------------------------------------------
# Berichtswesen je Objekt
# ---------------------------------------------------------------------------
BERICHT_TEILE = ["ueberblick", "anlagen", "wartung", "sv", "svmaengel", "tickets", "checklisten", "zaehler",
                 "vertraege", "schluessel", "dokumente"]


def objekt_bericht(con, oid: int, von: str, bis: str, teile: list, kosten: bool) -> dict:
    o = zeile(con.execute("SELECT * FROM objekte WHERE id=?", (oid,)).fetchone())
    if not o:
        raise Fehler(404, "Objekt nicht gefunden.")
    o.pop("qr_token", None)
    hs = heute().isoformat()
    bis_ende = bis + "T23:59:59"
    aus = {"objekt": o, "von": von, "bis": bis, "erstellt": jetzt(), "teile": teile, "kosten": kosten}
    anl = [dict(r) for r in con.execute("SELECT id, nummer, bezeichnung, gewerk, status, standort, hersteller, baujahr, sv_relevant, "
                                        "pruefung_pflicht, wartung_pflicht FROM anlagen WHERE objekt_id=? "
                                        "ORDER BY gewerk COLLATE NOCASE, nummer COLLATE NOCASE, bezeichnung COLLATE NOCASE", (oid,))]
    namen = {a["id"]: a["bezeichnung"] for a in anl}
    zaehle = lambda liste, feld: sorted(  # noqa: E731
        ({k: sum(1 for x in liste if (x.get(feld) or "ohne Angabe") == k) for k in {x.get(feld) or "ohne Angabe" for x in liste}}).items(),
        key=lambda kv: -kv[1])
    tick_alle = [dict(r) for r in con.execute(
        "SELECT id, nummer, titel, status, prioritaet, gewerk, art, anlage_id, gemeldet_am, erledigt_am, faellig_am, kosten "
        "FROM tickets WHERE objekt_id=? ORDER BY gemeldet_am DESC", (oid,))]
    offen_t = [t for t in tick_alle if t["status"] not in ("Erledigt", "Abgeschlossen")]
    wart = [dict(r) for r in con.execute("SELECT * FROM wartungen WHERE objekt_id=? AND aktiv=1", (oid,))]
    if "ueberblick" in teile:
        aus["ueberblick"] = {
            "anlagen": len(anl), "tickets_offen": len(offen_t),
            "tickets_zeitraum": sum(1 for t in tick_alle if von <= (t["gemeldet_am"] or "") <= bis),
            "wartung_ueberfaellig": sum(1 for w in wart if (w["naechste"] or "9") < hs),
            "wartung_erledigt": con.execute("SELECT COUNT(*) FROM wartung_historie h JOIN wartungen w ON w.id=h.wartung_id "
                                            "WHERE w.objekt_id=? AND h.datum BETWEEN ? AND ?", (oid, von, bis)).fetchone()[0],
            "sv_maengel_offen": con.execute("SELECT COUNT(*) FROM sv_maengel WHERE objekt_id=? AND status IN ('offen','in Arbeit')",
                                            (oid,)).fetchone()[0],
            "rundgaenge": con.execute("SELECT COUNT(*) FROM checklisten_durchgaenge WHERE objekt_id=? AND zeit BETWEEN ? AND ?",
                                      (oid, von, bis_ende)).fetchone()[0],
        }
    if "anlagen" in teile:
        aus["anlagen"] = {"liste": anl[:400], "nach_gewerk": zaehle(anl, "gewerk"), "nach_status": zaehle(anl, "status"),
                          "pflichtig": sum(1 for a in anl if a["pruefung_pflicht"] or a["wartung_pflicht"] or a["sv_relevant"])}
    if "wartung" in teile:
        erledigt = [dict(r) for r in con.execute(
            "SELECT h.datum, h.ergebnis, h.bemerkung, h.erfasst_von, w.titel, w.art, w.anlage_id FROM wartung_historie h "
            "JOIN wartungen w ON w.id=h.wartung_id WHERE w.objekt_id=? AND h.datum BETWEEN ? AND ? ORDER BY h.datum", (oid, von, bis))]
        for e in erledigt:
            e["anlage"] = namen.get(e["anlage_id"])
        bis90 = (dt.date.fromisoformat(bis) + dt.timedelta(days=90)).isoformat()
        aus["wartung"] = {
            "erledigt": erledigt, "nach_ergebnis": zaehle(erledigt, "ergebnis"),
            "ueberfaellig": [{"titel": w["titel"], "art": w["art"], "naechste": w["naechste"], "anlage": namen.get(w["anlage_id"])}
                             for w in sorted(wart, key=lambda w: w["naechste"] or "") if (w["naechste"] or "9") < hs],
            "anstehend": [{"titel": w["titel"], "art": w["art"], "naechste": w["naechste"], "anlage": namen.get(w["anlage_id"])}
                          for w in sorted(wart, key=lambda w: w["naechste"] or "") if hs <= (w["naechste"] or "") <= bis90],
            "aufgaben": len(wart),
        }
    if "sv" in teile:
        aus["sv"] = sv_pruefplan(con, {"objekt_id": [str(oid)]})["anlagen"]
    if "svmaengel" in teile:
        sm = [dict(r) for r in con.execute("SELECT * FROM sv_maengel WHERE objekt_id=? ORDER BY CASE einstufung WHEN 'gefährlich' THEN 0 "
                                           "WHEN 'erheblich' THEN 1 ELSE 2 END, frist", (oid,))]
        for m in sm:
            m["anlage"] = namen.get(m["anlage_id"])
        aus["svmaengel"] = {"offen": [m for m in sm if m["status"] in ("offen", "in Arbeit")],
                            "behoben_zeitraum": [m for m in sm if m["status"] in ("behoben", "nachgeprüft") and von <= (m["behoben_am"] or "") <= bis],
                            "neu_zeitraum": sum(1 for m in sm if von <= (m["erstellt"] or "")[:10] <= bis)}
    if "tickets" in teile:
        zr = [t for t in tick_alle if von <= (t["gemeldet_am"] or "") <= bis]
        dauer = [(dt.date.fromisoformat(t["erledigt_am"]) - dt.date.fromisoformat(t["gemeldet_am"])).days for t in zr
                 if t["erledigt_am"] and t["gemeldet_am"]]
        for t in zr + offen_t:
            t["anlage"] = namen.get(t["anlage_id"])
            if not kosten:
                t.pop("kosten", None)
        aus["tickets"] = {"zeitraum": zr[:300], "offen": offen_t[:300], "nach_status": zaehle(zr, "status"),
                          "nach_gewerk": zaehle(zr, "gewerk"), "nach_prioritaet": zaehle(zr, "prioritaet"),
                          "dauer_tage": round(sum(dauer) / len(dauer), 1) if dauer else None,
                          "monate": [[m, sum(1 for t in zr if (t["gemeldet_am"] or "")[:7] == m)] for m in _monate(von, bis)]}
        if kosten:
            aus["tickets"]["kosten"] = round(sum(t.get("kosten") or 0 for t in zr), 2)
    if "checklisten" in teile:
        dg = [dict(r) for r in con.execute(
            "SELECT d.zeit, d.wer, d.abweichungen, d.pruef_status, d.anlage_id, c.titel, c.art FROM checklisten_durchgaenge d "
            "JOIN checklisten c ON c.id=d.checkliste_id WHERE d.objekt_id=? AND d.zeit BETWEEN ? AND ? ORDER BY d.zeit", (oid, von, bis_ende))]
        aus["checklisten"] = {"liste": dg, "abweichungen": sum(d["abweichungen"] or 0 for d in dg),
                              "geprueft": sum(1 for d in dg if d["pruef_status"] == "bestaetigt"),
                              "listen": con.execute("SELECT COUNT(*) FROM checklisten WHERE objekt_id=? AND aktiv=1", (oid,)).fetchone()[0]}
    if "zaehler" in teile:
        zl = []
        for z in con.execute("SELECT * FROM zaehler WHERE objekt_id=? ORDER BY medium, nummer", (oid,)):
            z = dict(z)
            ab = [dict(r) for r in con.execute("SELECT datum, stand FROM ablesungen WHERE zaehler_id=? AND datum BETWEEN ? AND ? ORDER BY datum",
                                               (z["id"], von, bis))]
            vor = con.execute("SELECT datum, stand FROM ablesungen WHERE zaehler_id=? AND datum<? ORDER BY datum DESC LIMIT 1",
                              (z["id"], von)).fetchone()
            reihe = ([dict(vor)] if vor else []) + ab
            faktor = z["faktor"] or 1
            z["verbrauch"] = round((reihe[-1]["stand"] - reihe[0]["stand"]) * faktor, 3) if len(reihe) >= 2 else None
            z["ablesungen"] = len(ab)
            z["letzte"] = ab[-1] if ab else None
            monate = {}
            for a, b in zip(reihe, reihe[1:]):
                monate[b["datum"][:7]] = round(monate.get(b["datum"][:7], 0) + (b["stand"] - a["stand"]) * faktor, 3)
            z["monate"] = [[m, monate.get(m)] for m in _monate(von, bis)]
            zl.append(z)
        aus["zaehler"] = zl
    if "vertraege" in teile:
        vt = []
        for v in con.execute("SELECT v.*, d.firma FROM vertraege v LEFT JOIN dienstleister d ON d.id=v.dienstleister_id "
                             "WHERE v.objekt_id=? ORDER BY v.ende", (oid,)):
            v = dict(v)
            if v["ende"] and v["ende"] < von:
                continue
            if v["ende"] and v["kuendigungsfrist_monate"]:
                v["kuendigen_bis"] = plus_monate(dt.date.fromisoformat(v["ende"]), -int(v["kuendigungsfrist_monate"])).isoformat()
            if not kosten:
                v.pop("betrag_jahr", None)
            vt.append(v)
        aus["vertraege"] = vt
    if "schluessel" in teile:
        ug = uebergaben_liste(con, {"objekt_id": [str(oid)]})
        aus["schluessel"] = {
            "zeitraum": [u for u in ug if von <= u["ausgabe_zeit"][:10] <= bis],
            "offen": [u for u in ug if u["status"] == "ausgegeben"],
            "verloren": [dict(r) for r in con.execute("SELECT nummer, bezeichnung, art FROM schluessel WHERE objekt_id=? AND status='verloren'", (oid,))],
            "bestand": con.execute("SELECT COUNT(*) FROM schluessel WHERE objekt_id=?", (oid,)).fetchone()[0],
        }
        jz = jetzt()[:16]
        aus["schluessel"]["zu_spaet"] = sum(1 for u in aus["schluessel"]["zeitraum"]
                                            if (u["rueckgabe_zeit"] or jz)[:16] > u["rueckgabe_bis"])
    if "dokumente" in teile:
        aus["dokumente"] = [dict(r) for r in con.execute(
            "SELECT titel, kategorie, dateiname, hochgeladen_am FROM dokumente WHERE objekt_id=? AND hochgeladen_am BETWEEN ? AND ? "
            "ORDER BY hochgeladen_am", (oid, von, bis_ende))]
    return aus


def _monate(von: str, bis: str) -> list:
    a, b = dt.date.fromisoformat(von[:7] + "-01"), dt.date.fromisoformat(bis[:7] + "-01")
    aus = []
    while a <= b and len(aus) < 36:
        aus.append(a.isoformat()[:7])
        a = plus_monate(a, 1)
    return aus


def bild_masse(inhalt: bytes) -> tuple[int, int]:
    """Breite und Höhe aus PNG- oder JPG-Kopf lesen, ohne Zusatzpakete."""
    if inhalt.startswith(b"\x89PNG") and len(inhalt) > 24:
        return int.from_bytes(inhalt[16:20], "big"), int.from_bytes(inhalt[20:24], "big")
    if inhalt.startswith(b"\xff\xd8"):
        i = 2
        while i + 9 < len(inhalt):
            if inhalt[i] != 0xFF:
                i += 1
                continue
            marke, laenge = inhalt[i + 1], int.from_bytes(inhalt[i + 2:i + 4], "big")
            if marke in (0xC0, 0xC1, 0xC2):
                return int.from_bytes(inhalt[i + 7:i + 9], "big"), int.from_bytes(inhalt[i + 5:i + 7], "big")
            i += 2 + laenge
    return 0, 0


def plaene_importieren(con, benutzer, d: dict) -> dict:
    """Mehrere Grundrisse aus einer ZIP-Datei anlegen. Angaben aus plaene.json oder aus dem Dateinamen
    „Gebäude__Etage__Titel.png“. Gibt es einen Plan mit gleichem Gebäude, gleicher Etage und gleichem Titel, wird er übersprungen."""
    import zipfile
    try:
        oid = int(d.get("objekt_id"))
    except (TypeError, ValueError):
        raise Fehler(400, "Bitte ein Objekt wählen.")
    if not con.execute("SELECT 1 FROM objekte WHERE id=?", (oid,)).fetchone():
        raise Fehler(400, "Objekt nicht gefunden.")
    try:
        roh = base64.b64decode(d.get("inhalt") or "", validate=True)
        zf = zipfile.ZipFile(io.BytesIO(roh))
    except (ValueError, binascii.Error, zipfile.BadZipFile):
        raise Fehler(400, "Das ist keine gültige ZIP-Datei.")
    namen = [n for n in zf.namelist() if not n.endswith("/") and "__MACOSX" not in n]
    angaben = {}
    jn = next((n for n in namen if os.path.basename(n).lower() == "plaene.json"), None)
    if jn:
        try:
            for e in json.loads(zf.read(jn).decode("utf-8")):
                angaben[os.path.basename(str(e.get("datei") or ""))] = e
        except (ValueError, UnicodeDecodeError, AttributeError, TypeError):
            raise Fehler(400, "Die Datei plaene.json ist ungültig.")
    bilder = [n for n in namen if n.lower().endswith((".png", ".jpg", ".jpeg"))]
    if not bilder:
        raise Fehler(400, "In der ZIP-Datei sind keine Grundrisse (PNG oder JPG).")
    if len(bilder) > 300:
        raise Fehler(400, "Höchstens 300 Grundrisse auf einmal.")
    angelegt, uebersprungen = [], []
    gesamt = 0
    for n in sorted(bilder):
        info = zf.getinfo(n)
        gesamt += info.file_size
        if info.file_size > MAX_UPLOAD or gesamt > 500 * 1024 * 1024:
            raise Fehler(400, "Die Grundrisse sind zu groß.")
        datei = os.path.basename(n)
        e = angaben.get(datei)
        if not e:
            teile_ = os.path.splitext(datei)[0].split("__")
            e = {"gebaeude": teile_[0] if len(teile_) >= 3 else "", "etage": teile_[-2] if len(teile_) >= 2 else "",
                 "titel": teile_[-1]}
        titel = str(e.get("titel") or os.path.splitext(datei)[0]).strip()[:200]
        geb = str(e.get("gebaeude") or "").strip()[:100]
        etage = str(e.get("etage") or "").strip()[:100]
        if con.execute("SELECT 1 FROM plaene WHERE objekt_id=? AND COALESCE(gebaeude,'')=? AND COALESCE(etage,'')=? AND titel=?",
                       (oid, geb, etage, titel)).fetchone():
            uebersprungen.append(titel)
            continue
        inhalt = zf.read(n)
        endung = bild_endung(inhalt)
        if endung not in ("png", "jpg"):
            uebersprungen.append(titel)
            continue
        breite, hoehe = bild_masse(inhalt)
        sauber = daten_pruefen(RESSOURCEN["plaene"], {"objekt_id": oid, "titel": titel, "gebaeude": geb or None,
                                                       "etage": etage or None, "notiz": str(e.get("notiz") or "")[:2000] or None}, neu=True)
        sauber.update({"dateiname": re.sub(r"[^\w.\- äöüÄÖÜß]", "_", datei)[:150], "breite": breite, "hoehe": hoehe})
        pid = einfuegen(con, "plaene", sauber)
        pfad = f"{pid:06d}_{secrets.token_hex(6)}.{endung}"
        (PLAN_PFAD / pfad).write_bytes(inhalt)
        con.execute("UPDATE plaene SET pfad=? WHERE id=?", (pfad, pid))
        angelegt.append(titel)
    protokollieren(con, benutzer, "Grundrisse importiert", "plaene", None, f"{len(angelegt)} angelegt, {len(uebersprungen)} übersprungen")
    return {"angelegt": len(angelegt), "uebersprungen": uebersprungen}


def sv_uebernehmen(con, benutzer, rechte, did: int, d: dict) -> dict:
    """Geprüfte Mängel aus einem SV-Bericht in den SV-Mängelplan übernehmen."""
    dok = con.execute("SELECT * FROM dokumente WHERE id=?", (did,)).fetchone()
    if not dok:
        raise Fehler(404, "Bericht nicht gefunden.")
    if not dok["objekt_id"]:
        raise Fehler(400, "Der Bericht gehört zu keinem Objekt. Bitte zuerst ein Objekt zuordnen.")
    maengel = d.get("maengel") or []
    if not isinstance(maengel, list) or len(maengel) > 300:
        raise Fehler(400, "Mängelliste ist ungültig.")
    pruefdatum = d.get("pruefdatum") or None
    if pruefdatum:
        pruefdatum = wert_pruefen({"label": "Prüfdatum", "typ": "date"}, pruefdatum)
    neu = []
    for m in maengel:
        if not isinstance(m, dict):
            continue
        sauber = daten_pruefen(RESSOURCEN["sv_maengel"], {
            "objekt_id": dok["objekt_id"], "anlage_id": dok["anlage_id"], "bericht_id": did,
            "nummer": m.get("nummer"), "beschreibung": m.get("beschreibung"), "ort": m.get("ort"),
            "einstufung": m.get("einstufung") if m.get("einstufung") in SV_EINSTUFUNGEN else "unklar",
            "frist": m.get("frist") or None, "frist_text": m.get("frist_text"), "status": "offen",
            "bewertung_bericht": (str(m.get("bewertung"))[:60] if m.get("bewertung") else None),
            "pruefdatum": pruefdatum, "seite": m.get("seite"),
        }, neu=True)
        sauber["quelle"] = "KI-Auswertung, geprüft von " + benutzer["name"] if d.get("ki") else benutzer["name"]
        neu.append(einfuegen(con, "sv_maengel", sauber))
    pr = d.get("pruefung")
    eingetragen = False
    if pr and pr.get("wartung_id"):
        if not rechte.get("wartung_erledigen"):
            raise Fehler(403, "Dafür fehlt dir das Recht: Wartungen und Prüfungen als erledigt melden.")
        wartung_erledigt(con, benutzer, int(pr["wartung_id"]), {
            "datum": pr.get("datum") or pruefdatum, "ergebnis": "Mängel offen" if neu else "Ohne Mängel",
            "bemerkung": f'SV-Bericht „{dok["titel"]}“' + (f", {len(neu)} Mängel im SV-Mängelplan" if neu else ""),
        })
        eingetragen = True
    if d.get("auswertung_id"):
        con.execute("UPDATE sv_auswertungen SET uebernommen=? WHERE id=? AND dokument_id=?",
                    (jetzt(), int(d["auswertung_id"]), did))
    protokollieren(con, benutzer, "übernommen", "dokumente", did, f"{len(neu)} SV-Mängel")
    return {"ok": True, "angelegt": len(neu), "pruefung_eingetragen": eingetragen}


# ---------- Excel lesen (ohne Zusatzpakete) und SV-Prüfplan importieren ----------
def xlsx_zeilen(inhalt: bytes) -> list:
    """Erstes sichtbares Arbeitsblatt einer .xlsx als Liste von Zeilen (Liste von Zellwerten als Text)."""
    import zipfile
    import xml.etree.ElementTree as ET
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
          "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}
    try:
        z = zipfile.ZipFile(io.BytesIO(inhalt))
    except zipfile.BadZipFile:
        raise Fehler(400, "Das ist keine Excel-Datei (.xlsx).")
    texte = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", ns):
            texte.append("".join(t.text or "" for t in si.iter("{%s}t" % ns["m"])))
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    ziele = {r.get("Id"): r.get("Target") for r in rels}
    blatt = None
    for sh in wb.find("m:sheets", ns):
        if sh.get("state") in ("hidden", "veryHidden"):
            continue
        blatt = ziele.get(sh.get("{%s}id" % ns["r"]))
        break
    if not blatt:
        raise Fehler(400, "In der Excel-Datei ist kein sichtbares Blatt.")
    blatt = blatt.lstrip("/")
    if not blatt.startswith("xl/"):
        blatt = "xl/" + blatt
    stile_datum = set()
    if "xl/styles.xml" in z.namelist():
        st = ET.fromstring(z.read("xl/styles.xml"))
        eigene = {int(n.get("numFmtId")): (n.get("formatCode") or "").lower() for n in st.iter("{%s}numFmt" % ns["m"])}
        xfs = st.find("m:cellXfs", ns)
        for i, xf in enumerate(xfs if xfs is not None else []):
            fid = int(xf.get("numFmtId") or 0)
            if 14 <= fid <= 22 or (fid in eigene and any(c in eigene[fid] for c in ("yy", "dd", "mm/", "m.d"))):
                stile_datum.add(i)
    zeilen = []
    for row in ET.fromstring(z.read(blatt)).iter("{%s}row" % ns["m"]):
        werte = {}
        for c in row.findall("m:c", ns):
            ref = c.get("r") or ""
            spalte = 0
            for ch in re.match(r"[A-Z]+", ref).group(0) if re.match(r"[A-Z]+", ref) else "":
                spalte = spalte * 26 + ord(ch) - 64
            v = c.find("m:v", ns)
            t = c.get("t")
            if t == "s" and v is not None:
                wert = texte[int(v.text)]
            elif t == "inlineStr":
                wert = "".join(x.text or "" for x in c.iter("{%s}t" % ns["m"]))
            elif v is not None:
                wert = v.text or ""
                if int(c.get("s") or 0) in stile_datum and re.match(r"^\d+(\.\d+)?$", wert):
                    wert = (dt.date(1899, 12, 30) + dt.timedelta(days=int(float(wert)))).isoformat()
            else:
                wert = ""
            werte[spalte - 1] = str(wert).strip()
        if werte:
            zeilen.append([werte.get(i, "") for i in range(max(werte) + 1)])
    return zeilen


def _datum_frei(text: str):
    text = (text or "").strip()
    if re.match(r"^\d{4}-\d{2}-\d{2}$", text):
        return text
    m = re.match(r"^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$", text)
    if m:
        j = int(m.group(3))
        j = j + 2000 if j < 100 else j
        try:
            return dt.date(j, int(m.group(2)), int(m.group(1))).isoformat()
        except ValueError:
            return None
    return None


def _intervall_monate(text: str):
    m = re.search(r"(\d+(?:[.,]\d+)?)\s*(j|m)", (text or "").lower())
    if not m:
        return None
    n = float(m.group(1).replace(",", "."))
    return int(n * 12) if m.group(2) == "j" else int(n)


SV_GRUNDLAGE_ERKENNEN = [
    (r"tpr", "Prüfverordnung des Landes (z. B. TPrüfVO Hessen)"), (r"§\s*16", "BetrSichV §16 (wiederkehrende Prüfung, Aufzüge)"),
    (r"§\s*15", "BetrSichV §15 (Prüfung vor Inbetriebnahme / wiederkehrend)"), (r"42", "42. BImSchV (Verdunstungskühlanlagen)"),
    (r"1\.\s*bimsch", "1. BImSchV (Feuerstätten, Schornsteinfeger)"), (r"dguv", "DGUV Vorschrift 3"),
    (r"vds", "Versicherer (z. B. VdS)"),
]
SV_GEGENSTAND_ERKENNEN = [
    (r"\brlt\b|raumluft|büro- und gewerbe", "Raumlufttechnische Anlage (RLT)"), (r"brandschutzklappe|\bbsk\b", "Brandschutzklappen (BSK)"),
    (r"abgas|schornstein", "Abgasanlage / Feuerstätte"), (r"starkstrom", "Starkstromanlage"),
    (r"sicherheitsbeleucht", "Sicherheitsbeleuchtung"), (r"sicherheitsstrom|notstrom|\bssv\b", "Sicherheitsstromversorgung / Notstrom"),
    (r"blitz", "Blitzschutzanlage"), (r"brandmelde|\bbma\b", "Brandmelde- und Alarmierungsanlage"),
    (r"\bmra\b|maschinelle", "Maschinelle Rauchabzugsanlage (MRA)"), (r"\bnra\b|natürliche", "Natürliche Rauchabzugsanlage (NRA)"),
    (r"\brwa\b|rauchabzug", "Rauchabzugsanlage (RWA)"), (r"\brda\b|druckbelüft", "Druckbelüftungsanlage (RDA)"),
    (r"wandhydrant|steigleitung", "Wandhydranten / Steigleitungen"), (r"sprinkler", "Sprinkleranlage"),
    (r"gaslösch", "Gaslöschanlage"), (r"co-warn|co warn", "CO-Warnanlage"), (r"aufzug|aufzüge", "Aufzug"),
    (r"fassadenbefahr|befahranlage", "Fassadenbefahranlage"), (r"verdunstung|kühlturm", "Verdunstungskühlanlage"),
    (r"feststell", "Feststellanlage (Brandschutztür)"), (r"druckbehälter", "Druckbehälter"),
]
SV_BEREICH_GEWERK = {"Raumlufttechnik": "Lüftung/Klima", "Heiztechnik": "Heizung", "Sanitärtechnik": "Sanitär",
                     "Elektrotechnik": "Elektro", "MSR-Technik und Gebäudeautomation": "Gebäudeautomation",
                     "Brandschutztechnische Geräte und Anlagen": "Brandschutz", "Förderanlagen": "Aufzug",
                     "Kältetechnik": "Kälte", "Dach und Fach (Gebäudehülle)": "Dach/Fassade", "Außenanlagen": "Außenanlagen"}


def _bereich_erkennen(text: str):
    t = text.lower().replace("aussen", "außen")
    return next((b for b in SV_BEREICHE if t[:6] == b.lower()[:6]), None)


def sv_pruefplan_importieren(con, benutzer, d: dict) -> dict:
    try:
        oid = int(d.get("objekt_id"))
    except (TypeError, ValueError):
        raise Fehler(400, "Bitte ein Objekt wählen.")
    if not con.execute("SELECT 1 FROM objekte WHERE id=?", (oid,)).fetchone():
        raise Fehler(400, "Objekt nicht gefunden.")
    try:
        inhalt = base64.b64decode(d.get("inhalt") or "", validate=True)
    except (ValueError, binascii.Error):
        raise Fehler(400, "Die Datei konnte nicht gelesen werden.")
    zeilen = xlsx_zeilen(inhalt)
    kopf_i = next((i for i, z in enumerate(zeilen) if any("prüfgrundlage" in c.lower() for c in z)
                   and any("intervall" in c.lower() for c in z)), None)
    if kopf_i is None:
        raise Fehler(400, "In der Excel-Datei wurde keine Kopfzeile mit „Prüfgrundlage“ und „Intervall“ gefunden.")
    kopf = [c.lower() for c in zeilen[kopf_i]]
    def spalte(*worte):
        return next((i for i, c in enumerate(kopf) if any(w in c for w in worte)), None)
    s_nr, s_grund, s_int = spalte("nr"), spalte("prüfgrundlage"), spalte("intervall")
    s_pruefer, s_letzte, s_mangel, s_komm = spalte("prüfer"), spalte("letzte"), spalte("mängel"), spalte("kommentar")
    jahre = {i: int(c) for i, c in enumerate(kopf) if re.match(r"^(19|20)\d\d$", c.strip())}
    s_name = 0
    wert = lambda z, i: (z[i] if i is not None and i < len(z) else "").strip()  # noqa: E731
    bereich = None
    eintraege = []
    for z in zeilen[kopf_i + 1:]:
        name = wert(z, s_name)
        rest = [wert(z, i) for i in (s_nr, s_grund, s_int, s_pruefer, s_letzte) if i is not None]
        if name and not any(rest) and not any(wert(z, i) for i in jahre):
            bereich = _bereich_erkennen(name) or bereich
            continue
        if not name:
            continue
        raster = {str(j): wert(z, i).upper() for i, j in jahre.items() if wert(z, i)}
        eintraege.append({"name": name, "nr": wert(z, s_nr), "grundlage": wert(z, s_grund), "intervall": wert(z, s_int),
                          "pruefer": wert(z, s_pruefer), "letzte": _datum_frei(wert(z, s_letzte)),
                          "mangel": wert(z, s_mangel).lower(), "kommentar": wert(z, s_komm), "raster": raster, "bereich": bereich})
    if not eintraege:
        raise Fehler(400, "In der Excel-Datei wurden keine Anlagen gefunden.")
    anlagen_neu = pruefungen_neu = uebersprungen = 0
    for e in eintraege:
        grund = next((g for muster, g in SV_GRUNDLAGE_ERKENNEN if re.search(muster, e["grundlage"].lower())), None)
        gegenstand = next((g for muster, g in SV_GEGENSTAND_ERKENNEN if re.search(muster, e["name"].lower())), "Sonstiges")
        a = con.execute("SELECT * FROM anlagen WHERE objekt_id=? AND bezeichnung=? COLLATE NOCASE", (oid, e["name"])).fetchone()
        if not a:
            aid = einfuegen(con, "anlagen", daten_pruefen(RESSOURCEN["anlagen"], {
                "objekt_id": oid, "bezeichnung": e["name"], "gewerk": SV_BEREICH_GEWERK.get(e["bereich"]),
                "status": "In Betrieb", "sv_relevant": 1, "pruefung_pflicht": 1, "sv_gegenstand": gegenstand,
                "sv_grundlage": grund, "sv_bereich": e["bereich"],
                "notiz": "Aus dem SV-Prüfplan (Excel) übernommen" + (": " + ", ".join(x for x in (e["grundlage"], e["intervall"], e["pruefer"], e["kommentar"]) if x) if not e["letzte"] else ".")}, neu=True))
            anlagen_neu += 1
        else:
            aid = a["id"]
            con.execute("UPDATE anlagen SET sv_relevant=1, sv_gegenstand=COALESCE(sv_gegenstand, ?), sv_grundlage=COALESCE(sv_grundlage, ?), "
                        "sv_bereich=COALESCE(sv_bereich, ?), geaendert=? WHERE id=?", (gegenstand, grund, e["bereich"], jetzt(), aid))
        if not e["letzte"]:
            continue  # ohne letzte Prüfung kein Termin, die Anlage steht dann mit „kein Termin“ im Plan
        if con.execute("SELECT 1 FROM wartungen WHERE anlage_id=? AND art='SV-Prüfung' AND COALESCE(pruefnummer,'')=? AND letzte=?",
                       (aid, e["nr"], e["letzte"])).fetchone():
            uebersprungen += 1
            continue
        iv = _intervall_monate(e["intervall"]) or 36
        naechste = plus_monate(dt.date.fromisoformat(e["letzte"]), iv).isoformat()
        wid = einfuegen(con, "wartungen", {
            "objekt_id": oid, "anlage_id": aid, "titel": f'SV-Prüfung {e["name"]}' + (f' ({e["pruefer"]})' if e["pruefer"] else ""),
            "art": "SV-Prüfung", "rechtsgrundlage": e["grundlage"] or None, "intervall_monate": iv, "letzte": e["letzte"],
            "naechste": naechste, "aktiv": 1, "pruefer": e["pruefer"] or None, "pruefnummer": e["nr"] or None,
            "notiz": e["kommentar"] or None, "raster": json.dumps(e["raster"], ensure_ascii=False) if e["raster"] else None,
            "taetigkeiten": "Prüfung durch Sachverständige\nPrüfbericht erhalten und abgelegt\nMängel aus dem Bericht erfasst"})
        ergebnis = "Mängel offen" if e["mangel"].startswith("j") else "Ohne Mängel" if e["mangel"].startswith("n") else "Ohne Mängel"
        con.execute("INSERT INTO wartung_historie (wartung_id, datum, ergebnis, bemerkung, erfasst_von, pruefart) VALUES (?,?,?,?,?,?)",
                    (wid, e["letzte"], ergebnis, "Aus dem SV-Prüfplan (Excel) übernommen" +
                     ("" if e["mangel"] else ", Angabe zu erheblichen Mängeln fehlt"), benutzer["name"], "Prüfung"))
        pruefungen_neu += 1
    # Mehrere Zeilen derselben Anlage mit unterschiedlichem Prüfdatum (etwa TÜV 2023, danach anderer SV 2024):
    # die jüngste bleibt der aktive Prüftermin, ältere werden zu ihrer Vorgeschichte.
    for (aid,) in con.execute("SELECT anlage_id FROM wartungen WHERE objekt_id=? AND art='SV-Prüfung' AND aktiv=1 "
                              "GROUP BY anlage_id HAVING COUNT(DISTINCT letzte) > 1", (oid,)).fetchall():
        reihe = [dict(r) for r in con.execute("SELECT * FROM wartungen WHERE anlage_id=? AND art='SV-Prüfung' AND aktiv=1 "
                                              "ORDER BY letzte DESC, id DESC", (aid,))]
        haupt = reihe[0]
        raster = json.loads(haupt["raster"]) if haupt.get("raster") else {}
        for alt in reihe[1:]:
            if alt["letzte"] == haupt["letzte"]:
                continue  # gleiche Prüfung mit eigener Prüfnummer (z. B. mehrere Befahranlagen): bleibt eigener Termin
            for jahr, code in (json.loads(alt["raster"]) if alt.get("raster") else {}).items():
                vorhanden = set(str(raster.get(jahr, "")).split("/")) - {""}
                raster[jahr] = "/".join(sorted(vorhanden | set(str(code).split("/")), key=lambda t: {"A": 0, "NP": 1, "P": 2}.get(t, 3)))
            hinweis = " · damals " + " ".join(x for x in (alt["pruefer"], alt["pruefnummer"]) if x)
            con.execute("UPDATE wartung_historie SET wartung_id=?, bemerkung=COALESCE(bemerkung, '') || ? WHERE wartung_id=?",
                        (haupt["id"], hinweis, alt["id"]))
            con.execute("UPDATE wartungen SET aktiv=0, notiz=COALESCE(notiz || ' · ', '') || ? WHERE id=?",
                        ("Abgelöst durch die spätere Prüfung, Vorgeschichte steht beim aktuellen Prüftermin.", alt["id"]))
        con.execute("UPDATE wartungen SET raster=? WHERE id=?", (json.dumps(raster, ensure_ascii=False) if raster else None, haupt["id"]))
    protokollieren(con, benutzer, "SV-Prüfplan importiert", "anlagen", None,
                   f"{len(eintraege)} Zeilen, {anlagen_neu} Anlagen neu, {pruefungen_neu} Prüfungen neu")
    return {"zeilen": len(eintraege), "anlagen_neu": anlagen_neu, "pruefungen_neu": pruefungen_neu, "uebersprungen": uebersprungen,
            "ohne_termin": sum(1 for e in eintraege if not e["letzte"])}


def dienstleister_importieren(con, benutzer, d: dict) -> dict:
    """Dienstleister aus Excel (.xlsx) oder CSV übernehmen. Spalten werden an der Kopfzeile erkannt.
    Vorhandene Firmen (gleicher Name oder gleiche E-Mail) werden nur ergänzt, nie überschrieben."""
    try:
        inhalt = base64.b64decode(d.get("inhalt") or "", validate=True)
    except (ValueError, binascii.Error):
        raise Fehler(400, "Die Datei konnte nicht gelesen werden.")
    name = str(d.get("dateiname") or "").lower()
    if name.endswith(".xlsx") or inhalt[:2] == b"PK":
        zeilen = xlsx_zeilen(inhalt)
    else:
        try:
            text = inhalt.decode("utf-8-sig")
        except UnicodeDecodeError:
            text = inhalt.decode("cp1252", errors="replace")
        trenner = ";" if text.count(";") >= text.count(",") else ","
        zeilen = [[c.strip() for c in z] for z in csv.reader(io.StringIO(text), delimiter=trenner)]
    erkennen = {
        "firma": ("firma", "unternehmen", "dienstleister", "company", "name"), "gewerk": ("gewerk", "branche", "kategorie", "leistung"),
        "ansprechpartner": ("ansprech", "kontakt", "person"), "notdienst": ("notdienst", "störung", "24"),
        "telefon": ("telefon", "tel", "phone", "mobil"), "email": ("e-mail", "email", "mail"),
        "strasse": ("straße", "strasse", "anschrift", "adresse"), "plz": ("plz", "postleitzahl"), "ort": ("ort", "stadt"),
        "notiz": ("notiz", "bemerkung", "kommentar", "objekte"),
    }
    kopf_i, spalten = None, {}
    for i, z in enumerate(zeilen[:15]):
        treffer = {}
        for j, c in enumerate(z):
            c = c.lower()
            for feld, worte in erkennen.items():
                if feld not in treffer and any(w in c for w in worte):
                    if feld == "firma" and "ansprech" in c:
                        continue
                    treffer[feld] = j
                    break
        if "firma" in treffer and len(treffer) >= 2:
            kopf_i, spalten = i, treffer
            break
    if kopf_i is None:
        raise Fehler(400, "Keine Kopfzeile gefunden. Es braucht mindestens eine Spalte „Firma“ und eine weitere (z. B. E-Mail, Telefon).")
    wert = lambda z, f: (z[spalten[f]].strip() if f in spalten and spalten[f] < len(z) else "")  # noqa: E731
    gewerke = {g.lower(): g for g in GEWERKE}
    neu = ergaenzt = uebersprungen = 0
    for z in zeilen[kopf_i + 1:]:
        firma = wert(z, "firma")[:200]
        if not firma:
            continue
        email = wert(z, "email")[:200]
        if email and not EMAIL_MUSTER.match(email):
            email = ""
        anschrift = ", ".join(x for x in (wert(z, "strasse"), " ".join(x for x in (wert(z, "plz"), wert(z, "ort")) if x)) if x)[:300]
        g_roh = wert(z, "gewerk")
        gewerk = gewerke.get(g_roh.lower())
        notiz = "; ".join(x for x in (wert(z, "notiz"), (f"Gewerk laut Liste: {g_roh}" if g_roh and not gewerk else "")) if x)[:2000]
        daten = {"firma": firma, "gewerk": gewerk, "ansprechpartner": wert(z, "ansprechpartner")[:200] or None,
                 "telefon": wert(z, "telefon")[:60] or None, "notdienst": wert(z, "notdienst")[:60] or None,
                 "email": email or None, "anschrift": anschrift or None, "notiz": notiz or None}
        alt = con.execute("SELECT * FROM dienstleister WHERE lower(firma)=lower(?) OR (? <> '' AND lower(COALESCE(email,''))=lower(?))",
                          (firma, email, email)).fetchone()
        if alt:
            fehlt = {k: v for k, v in daten.items() if v and not alt[k]}
            if fehlt:
                setz = ", ".join(f'"{k}"=?' for k in fehlt)
                con.execute(f"UPDATE dienstleister SET {setz}, geaendert=? WHERE id=?", [*fehlt.values(), jetzt(), alt["id"]])
                ergaenzt += 1
            else:
                uebersprungen += 1
            continue
        einfuegen(con, "dienstleister", daten_pruefen(RESSOURCEN["dienstleister"], daten, neu=True))
        neu += 1
    protokollieren(con, benutzer, "Dienstleister importiert", "dienstleister", None, f"{neu} neu, {ergaenzt} ergänzt")
    return {"neu": neu, "ergaenzt": ergaenzt, "uebersprungen": uebersprungen}


def sv_pruefplan(con, q: dict) -> dict:
    """Alle sicherheitsrelevanten Anlagen mit ihren SV-Prüfungen."""
    bed, werte = ["a.sv_relevant=1"], []
    if q.get("objekt_id") and q["objekt_id"][0]:
        bed.append("a.objekt_id=?")
        werte.append(q["objekt_id"][0])
    tickets = {r[0]: r[1] for r in con.execute(
        "SELECT anlage_id, COUNT(*) FROM tickets WHERE anlage_id IS NOT NULL "
        "AND status NOT IN ('Erledigt','Abgeschlossen') GROUP BY anlage_id")}
    sv_erheblich = {r[0]: r[1] for r in con.execute(
        "SELECT anlage_id, COUNT(*) FROM sv_maengel WHERE anlage_id IS NOT NULL AND status IN ('offen','in Arbeit') "
        "AND einstufung IN ('erheblich','gefährlich') GROUP BY anlage_id")}
    sv_offen = {r[0]: r[1] for r in con.execute(
        "SELECT anlage_id, COUNT(*) FROM sv_maengel WHERE anlage_id IS NOT NULL "
        "AND status IN ('offen','in Arbeit') GROUP BY anlage_id")}
    zeilen = []
    for r in con.execute(
            "SELECT a.id, a.nummer, a.bezeichnung, a.objekt_id, a.standort, a.gewerk, a.planzeichen, a.symbol_id, "
            "a.sv_gegenstand, a.sv_grundlage, a.sv_bereich, a.status, a.gps_pflicht, a.notiz, o.kuerzel AS o_kuerzel, o.name AS o_name "
            "FROM anlagen a LEFT JOIN objekte o ON o.id=a.objekt_id "
            f"WHERE {' AND '.join(bed)} ORDER BY o.kuerzel COLLATE NOCASE, a.nummer COLLATE NOCASE, a.bezeichnung COLLATE NOCASE",
            werte):
        z = dict(r)
        z["tickets_offen"] = tickets.get(z["id"], 0)
        z["sv_maengel_offen"] = sv_offen.get(z["id"], 0)
        z["sv_erheblich_offen"] = sv_erheblich.get(z["id"], 0)
        z["pruefungen"] = []
        for w in con.execute("SELECT * FROM wartungen WHERE anlage_id=? AND aktiv=1 AND art='SV-Prüfung' "
                             "ORDER BY naechste", (z["id"],)):
            w = dict(w)
            hist = [dict(h) for h in con.execute(
                "SELECT datum, ergebnis, bemerkung, erfasst_von, ticket_id, pruefart FROM wartung_historie "
                "WHERE wartung_id=? ORDER BY datum DESC, id DESC", (w["id"],))]
            w["historie"] = [{"datum": h["datum"], "pruefart": h["pruefart"], "ergebnis": h["ergebnis"],
                              "importiert": (h["bemerkung"] or "").startswith("Aus dem SV-Prüfplan")} for h in hist[:40]]
            haupt = [h for h in hist if h["pruefart"] != "Nachprüfung"]
            w["letztes"] = haupt[0] if haupt else (hist[0] if hist else None)
            try:
                w["raster"] = json.loads(w["raster"]) if w.get("raster") else {}
            except ValueError:
                w["raster"] = {}
            w["dl_name"] = None
            if w["dienstleister_id"]:
                d = con.execute("SELECT firma FROM dienstleister WHERE id=?", (w["dienstleister_id"],)).fetchone()
                w["dl_name"] = d[0] if d else None
            z["pruefungen"].append(w)
        zeilen.append(z)
    return {"anlagen": zeilen}


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
        textfelder = [f["name"] for f in res["felder"]
                      if f["typ"] in ("text", "textarea", "email", "tel") and not f.get("virtuell")]
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
        ("bma", "1.4.01.0010", "Brandschutz", {"pruefung_pflicht": 1, "wartung_pflicht": 1, "sv_relevant": 1,
                                                "sv_gegenstand": "Brandmelde- und Alarmierungsanlage",
                                                "sv_grundlage": SV_GRUNDLAGEN[0]}),
        ("hz", "1.1.01.0010", "Heizung & Sanitär", {}),
        ("rlt", "1.3.01.0010", "Klima, Kälte & Lüftung (RLT)", {"sv_relevant": 1, "sv_gegenstand": "Lüftungsanlage",
                                                                 "sv_grundlage": SV_GRUNDLAGEN[0]}),
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
        (o1, anl["bma"], "SV-Prüfung Brandmeldeanlage", "SV-Prüfung", "Prüfverordnung", 36, d(-1050), d(45), None),
    ]
    for o, a, t, art, rg, iv, letzte, naechste, dlid in W:
        wid = ins("wartungen", objekt_id=o, anlage_id=a, titel=t, art=art, rechtsgrundlage=rg, intervall_monate=iv,
                  letzte=letzte, naechste=naechste, dienstleister_id=dlid, aktiv=1,
                  taetigkeiten="Sichtprüfung\nFunktionsprüfung\nProtokoll ablegen")
        if letzte:
            con.execute("INSERT INTO wartung_historie (wartung_id, datum, ergebnis, erfasst_von) VALUES (?,?,?,?)",
                        (wid, letzte, "Ohne Mängel", "Beispieldaten"))
    for o, nr, bez, anlage, anz, ort in [
        (o1, "S-01", "Haupteingang und Treppenhaus", "Beispiel-Schließanlage HS 1", 3, "Schlüsselschrank Empfang, Haken 1"),
        (o1, "S-02", "Technikräume UG", "Beispiel-Schließanlage HS 1", 2, "Schlüsselschrank Empfang, Haken 2"),
        (o1, "S-03", "Dachzugang", "Beispiel-Schließanlage HS 1", 1, "Schlüsselschrank Empfang, Haken 3"),
        (o1, "S-04", "Feuerwehrschlüssel (Generalhauptschlüssel)", "Beispiel-Schließanlage HS 1", 1, "Schlüsseldepot Feuerwehr"),
        (o2, "S-01", "Halle 2 und Technikraum", "Beispiel-Schließanlage BW 7", 2, "Schlüsselkasten Büro"),
    ]:
        ins("schluessel", objekt_id=o, art="Schlüssel", nummer=nr, bezeichnung=bez, schliessanlage=anlage, anzahl=anz,
            aufbewahrung=ort, status="aktiv")
    for o, nr, bez, chip, bereich in [
        (o1, "T-01", "Besuchertransponder Technik", "04A1B2C3", "Haupteingang, Technikräume UG, Mo–Fr 7–18 Uhr"),
        (o1, "T-02", "Besuchertransponder Dach", "04A1B2C4", "Haupteingang, Dachzugang, Mo–Fr 7–18 Uhr"),
        (o2, "T-01", "Transponder Halle 2", "0B77E201", "Tor Halle 2, Technikraum"),
    ]:
        ins("schluessel", objekt_id=o, art="Transponder", nummer=nr, bezeichnung=bez, schliessanlage="Beispiel-Zutrittskontrolle",
            chip_nr=chip, schliessbereich=bereich, anzahl=1, aufbewahrung="Schlüsselschrank Empfang", status="aktiv")
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
        for titel, gebaeude, etage in (("Grundriss EG", "Haupthaus", "EG"), ("Hallenplan", "Halle", "EG")):
            ziel_objekt = o1 if gebaeude == "Haupthaus" else o2
            p2 = ins("plaene", objekt_id=ziel_objekt, titel=titel, gebaeude=gebaeude, etage=etage,
                     dateiname=quelle.name, breite=2400, hoehe=1500, notiz="Beispiel, gleicher Grundriss wie 2. OG")
            pf2 = f"{p2:06d}_{secrets.token_hex(6)}.png"
            (PLAN_PFAD / pf2).write_bytes(quelle.read_bytes())
            con.execute("UPDATE plaene SET pfad=? WHERE id=?", (pf2, p2))
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
        # Brandschutztüren aus dem Katalog
        for nr, (x, y) in enumerate([(0.36, 0.66), (0.555, 0.43), (0.705, 0.43)], 1):
            tid = einfuegen(con, "anlagen", {"objekt_id": o1, "bezeichnung": f"Tür {nr}", "gewerk": "Türen/Tore",
                                            "standort": "Haupthaus, 2. OG", "status": "In Betrieb"})
            con.execute("UPDATE anlagen SET plan_id=?, plan_x=?, plan_y=? WHERE id=?", (pid, x, y, tid))
    # Katalog zuordnen
    def kat(name):
        r = con.execute("SELECT id FROM kat_kategorien WHERE name=?", (name,)).fetchone()
        return r["id"] if r else None

    def typ(kname, gname, tname):
        r = con.execute("SELECT t.id, t.gruppe_id FROM kat_typen t JOIN kat_gruppen g ON g.id=t.gruppe_id "
                        "JOIN kat_kategorien k ON k.id=t.kategorie_id WHERE k.name=? AND g.name=? AND t.name=?",
                        (kname, gname, tname)).fetchone()
        return (r["gruppe_id"], r["id"]) if r else (None, None)

    def zuordnen(muster, kname, gname=None, tname=None, details=None):
        kid = kat(kname)
        gid, tid = typ(kname, gname, tname) if gname else (None, None)
        for r in con.execute("SELECT id, nummer FROM anlagen WHERE bezeichnung LIKE ? AND objekt_id IN (?, ?)", (muster, o1, o2)).fetchall():
            nummer = r["nummer"] or naechste_inventarnr(con, kid)
            con.execute("UPDATE anlagen SET kategorie_id=?, gruppe_id=?, typ_id=?, nummer=?, details=? WHERE id=?",
                        (kid, gid, tid, nummer, json.dumps(details, ensure_ascii=False) if details else None, r["id"]))

    # Beispiel-Checkliste je Anlage und Rundgang je Objekt
    def punkt(text, typ="haken", einheit="", mini=None, maxi=None, bereich="", anlage=None, pflicht=True):
        return {"text": text, "typ": typ, "einheit": einheit, "min": mini, "max": maxi, "bereich": bereich,
                "anlage_id": anlage, "pflicht": pflicht}
    cl1 = einfuegen(con, "checklisten", {
        "titel": "Monatliche Sichtkontrolle RLT", "art": "Anlage", "objekt_id": o1, "anlage_id": anl["rlt"],
        "rhythmus": "monatlich", "aktiv": 1, "punkte": json.dumps([
            punkt("Filter-Differenzdruck Zuluft", "zahl", "Pa", 50, 250), punkt("Filter-Differenzdruck Abluft", "zahl", "Pa", 50, 250),
            punkt("Keilriemen ohne Risse, Spannung in Ordnung"), punkt("Klappen öffnen und schließen"),
            punkt("Kondensatablauf frei"), punkt("Ungewöhnliche Geräusche", "text", pflicht=False)], ensure_ascii=False)})
    rg = einfuegen(con, "checklisten", {
        "titel": "Wöchentlicher Objektrundgang", "art": "Rundgang", "objekt_id": o1, "rhythmus": "wöchentlich", "aktiv": 1,
        "checkpoints_pflicht": 1, "unterschrift_pflicht": 1,
        "zustaendig": "Haustechnik", "punkte": json.dumps([
            punkt("Vorlauftemperatur Heizung", "zahl", "°C", 50, 80, "Technikzentrale UG", anl["hz"]),
            punkt("Anlagendruck Heizung", "zahl", "bar", 1.0, 2.5, "Technikzentrale UG", anl["hz"]),
            punkt("Brandmeldezentrale ohne Störung", bereich="Technikzentrale UG", anlage=anl["bma"]),
            punkt("Fluchtwege frei, Türen nicht verkeilt", bereich="Treppenhaus"),
            punkt("Sicherheitsbeleuchtung in Ordnung", bereich="Treppenhaus"),
            punkt("Aufzüge fahren, Notruf getestet", bereich="Kern", anlage=anl["a1"]),
            punkt("Beleuchtung Tiefgarage in Ordnung", bereich="Tiefgarage"),
            punkt("Dachabläufe frei", bereich="Dach"),
            punkt("Zählerstand Allgemeinstrom", "zahl", "kWh", bereich="Technikzentrale UG", pflicht=False)], ensure_ascii=False)})
    checkpoints_abgleichen(con, rg)
    vorher = (dt.datetime.now() - dt.timedelta(days=8)).isoformat(timespec="seconds")
    erg = [{**p, "status": "ok", "wert": w, "notiz": "", "abweichung": False}
           for p, w in zip(json.loads(con.execute("SELECT punkte FROM checklisten WHERE id=?", (rg,)).fetchone()[0]),
                           [62, 1.8, None, None, None, None, None, None, 152300])]
    con.execute("INSERT INTO checklisten_durchgaenge (checkliste_id, objekt_id, zeit, wer, ergebnisse, abweichungen) VALUES (?,?,?,?,?,0)",
                (rg, o1, vorher, "Haustechnik", json.dumps(erg, ensure_ascii=False)))
    zuordnen("Feuerlöscher %", "Feuerlöscher", "GLORIA", "ABC-Pulver 6 kg", {"Löschmittel": "ABC-Pulver", "Löschmitteleinheiten (LE)": 10})
    zuordnen("Tür %", "Tür", "Teckentrup", "T 30-1-FSA-42", {"Brandschutztür": True, "Feuerwiderstand": "T30", "Flügel": "1-flügelig", "Feststellanlage": True})
    zuordnen("Wandhydrant%", "Hydrant", "Hawle", "Wandhydrant Typ F")
    zuordnen("Handfeuermelder%", "Meldetechnik", "Hekatron", "Handfeuermelder", {"Meldertyp": "Handfeuermelder"})
    zuordnen("Brandmeldeanlage", "Brandmeldezentrale")
    zuordnen("Notausgang%", "Flucht & Rettung", "Allgemein", "Rettungszeichen nachleuchtend")
    zuordnen("Erste-Hilfe%", "Erste Hilfe", "Söhngen", "Verbandkasten DIN 13157")
    zuordnen("Defibrillator", "Defibrillator", "Philips", "HeartStart FRx")
    zuordnen("Personenaufzug%", "Aufzug")
    zuordnen("Gas-Brennwertkessel%", "Heizung", "Viessmann", "Gas-Brennwertkessel")
    zuordnen("RLT-Anlage%", "Lüftung", "Wolf GmbH", "Zentrales RLT-Gerät")
    zuordnen("Rolltor%", "Tor")
    zuordnen("Niederspannungs%", "Elektro")
    for titel, gef in (("Aufzug B%", "mittel"), ("Leuchtmittel%", "gering"), ("Rolltor%", "hoch"), ("Heizung%", "gering")):
        con.execute("UPDATE tickets SET gefaehrdung=?, art='Störung' WHERE titel LIKE ?", (gef, titel))
    tuer = con.execute("SELECT id FROM anlagen WHERE bezeichnung='Tür 2'").fetchone()
    if tuer:
        for mangel, gef, tage in (("Tür schließt nicht", "hoch", 3), ("Glaselement beschädigt", "mittel", 14)):
            ticket_anlegen(con, {"name": "Beispieldaten"}, {"objekt_id": o1, "anlage_id": tuer["id"], "titel": mangel,
                                                          "mangel": mangel, "gefaehrdung": gef, "art": "Mangel", "status": "Neu",
                                                          "faellig_am": (h + dt.timedelta(days=tage - 5)).isoformat(),
                                                          "gemeldet_von": "Begehung"})


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
            self._spaeter = None
            with _db_lock:
                con = db()
                try:
                    with con:
                        self.api(con, methode, url.path[5:].strip("/").split("/"), parse_qs(url.query))
                finally:
                    con.close()
            if self._spaeter:
                self.sv_auswerten(*self._spaeter)
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
        if ziel.suffix == ".webmanifest":
            typ = "application/manifest+json"
        if ziel.suffix == ".js":
            typ = "text/javascript"
        if typ.startswith("text/") or typ in ("application/javascript", "application/manifest+json"):
            typ += "; charset=utf-8"
        extra = {"Cache-Control": "no-cache"}
        if ziel.name == "sw.js":
            extra["Service-Worker-Allowed"] = "/"
        self.senden(200, ziel.read_bytes(), typ, extra)

    # --- Schnittstelle ---------------------------------------------------
    def api(self, con, m: str, teile: list[str], q: dict):
        erstes = teile[0] if teile else ""

        if erstes == "qr" and len(teile) >= 2:
            return self.qr_api(con, m, teile)

        if erstes == "status" and m == "GET":
            b = self.angemeldet(con)
            erster_start = con.execute("SELECT COUNT(*) FROM benutzer").fetchone()[0] == 0
            return self.json({"benutzer": self.oeffentlich(b, con), "einrichten": erster_start, "version": VERSION})

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

        if erstes == "personen" and m == "GET":
            return self.json([{"id": r["id"], "name": r["name"], "rolle": r["rolle"], "bild": r["bild"]}
                              for r in con.execute("SELECT id, name, rolle, bild FROM benutzer WHERE aktiv=1 ORDER BY name COLLATE NOCASE")])
        if erstes == "profilbild" and len(teile) == 2 and m == "GET":
            r = con.execute("SELECT bild FROM benutzer WHERE id=?", (self.id(teile[1]),)).fetchone()
            pf = (PROFIL_PFAD / r["bild"]).resolve() if r and r["bild"] else None
            if not pf or not str(pf).startswith(str(PROFIL_PFAD.resolve())) or not pf.is_file():
                raise Fehler(404, "Kein Profilbild.")
            return self.senden(200, pf.read_bytes(), mimetypes.guess_type(pf.name)[0] or "image/jpeg",
                               {"Cache-Control": "private, max-age=604800", "Content-Security-Policy": "sandbox"})
        if erstes == "ich" and len(teile) == 2 and teile[1] == "bild" and m in ("PUT", "DELETE"):
            alt = con.execute("SELECT bild FROM benutzer WHERE id=?", (b["id"],)).fetchone()["bild"]
            neu = None
            if m == "PUT":
                daten = str(self.body().get("bild") or "")
                if not daten.startswith("data:image/") or "," not in daten:
                    raise Fehler(400, "Bitte ein Bild auswählen.")
                try:
                    inhalt = base64.b64decode(daten.split(",", 1)[1], validate=True)
                except (ValueError, binascii.Error):
                    raise Fehler(400, "Das Bild ist ungültig.")
                endung = bild_endung(inhalt)
                if endung not in ("jpg", "png", "webp"):
                    raise Fehler(400, "Bitte ein Foto als JPG, PNG oder WEBP.")
                if len(inhalt) > 2 * 1024 * 1024:
                    raise Fehler(400, "Das Bild ist zu groß (höchstens 2 MB).")
                neu = f"{b['id']}_{secrets.token_hex(6)}.{endung}"
                (PROFIL_PFAD / neu).write_bytes(inhalt)
            con.execute("UPDATE benutzer SET bild=? WHERE id=?", (neu, b["id"]))
            if alt:
                ap = (PROFIL_PFAD / alt).resolve()
                if str(ap).startswith(str(PROFIL_PFAD.resolve())) and ap.is_file():
                    ap.unlink()
            return self.json({"ok": True, "bild": neu})
        if erstes == "ich" and m == "PUT":
            d = self.body()
            if "mail_an" in d:
                con.execute("UPDATE benutzer SET mail_an=? WHERE id=?", (1 if d["mail_an"] in (1, True, "1") else 0, b["id"]))
            return self.json({"ok": True})
        if erstes == "push":
            if len(teile) == 2 and teile[1] == "schluessel" and m == "GET":
                return self.json({"schluessel": VERSAND.vapid(con)[1]})
            if len(teile) == 2 and teile[1] == "abo":
                d = self.body()
                endpunkt = str(d.get("endpoint") or "")
                if not re.match(r"^https://[^\s]+$", endpunkt) or len(endpunkt) > 1000:
                    raise Fehler(400, "Das Gerät hat keine gültige Push-Adresse geliefert.")
                if m == "POST":
                    con.execute("INSERT OR REPLACE INTO push_abos (benutzer_id, endpoint, geraet, erstellt) VALUES (?,?,?,?)",
                                (b["id"], endpunkt, str(d.get("geraet") or "")[:120], jetzt()))
                    return self.json({"ok": True})
                if m == "DELETE":
                    con.execute("DELETE FROM push_abos WHERE endpoint=? AND benutzer_id=?", (endpunkt, b["id"]))
                    return self.json({"ok": True})
            if len(teile) == 2 and teile[1] == "test" and m == "POST":
                benachrichtigen(con, b["id"], f"test:{jetzt()}", "Testbenachrichtigung", "So sehen Hinweise aus Casa CAFM aus.", "#/", "info")
                return self.json({"ok": True})
        if erstes == "benachrichtigungen" and len(teile) == 2 and teile[1] == "neueste" and m == "GET":
            r = con.execute("SELECT * FROM benachrichtigungen WHERE benutzer_id=? AND gelesen=0 ORDER BY id DESC LIMIT 1", (b["id"],)).fetchone()
            n = con.execute("SELECT COUNT(*) FROM benachrichtigungen WHERE benutzer_id=? AND gelesen=0", (b["id"],)).fetchone()[0]
            return self.json({"neueste": zeile(r), "ungelesen": n})
        if erstes == "benachrichtigungen":
            if m == "GET":
                faellige_erinnerungen(con, b["id"])
                liste = [dict(r) for r in con.execute(
                    "SELECT * FROM benachrichtigungen WHERE benutzer_id=? ORDER BY gelesen, zeit DESC LIMIT 60", (b["id"],))]
                return self.json({"liste": liste, "ungelesen": sum(1 for x in liste if not x["gelesen"])})
            if m == "POST" and len(teile) == 2 and teile[1] == "gelesen":
                d = self.body()
                if d.get("alle"):
                    con.execute("UPDATE benachrichtigungen SET gelesen=1 WHERE benutzer_id=?", (b["id"],))
                else:
                    for i in (d.get("ids") or [])[:200]:
                        con.execute("UPDATE benachrichtigungen SET gelesen=1 WHERE benutzer_id=? AND id=?", (b["id"], int(i)))
                return self.json({"ok": True})
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
        if erstes == "objekte" and len(teile) == 3 and teile[2] == "bild":
            oid = self.id(teile[1])
            if m == "GET":
                return self.objektbild(con, oid)
            if m == "PUT":
                return self.objektbild_hochladen(con, b, oid)
        if erstes == "symbole" and len(teile) == 1 and m == "POST":
            return self.symbol_hochladen(con, b, None)
        if erstes == "symbole" and len(teile) == 3 and teile[2] == "bild":
            sid = self.id(teile[1])
            if m == "GET":
                return self.symbol_bild(con, sid)
            if m == "PUT":
                return self.symbol_hochladen(con, b, sid)
        if erstes == "plaene" and len(teile) == 2 and teile[1] == "import" and m == "POST":
            if not self.rechte.get("plaene_bearbeiten"):
                raise Fehler(403, "Dafür fehlt dir das Recht: Grundrisse hochladen, Symbole setzen und verschieben.")
            return self.json(plaene_importieren(con, b, self.body()))
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
        if erstes == "einstellungen" and len(teile) == 2 and teile[1] == "testmail" and m == "POST":
            an = str(self.body().get("an") or b["email"]).strip()
            if "@" not in an:
                raise Fehler(400, "Bitte eine gültige E-Mail-Adresse angeben.")
            try:
                VERSAND.mail_senden(VERSAND.smtp(con), an, "Testnachricht", "Wenn du diese Nachricht liest, klappt der Versand aus Casa CAFM.", "#/einstellungen")
            except Exception as e:  # noqa: BLE001
                raise Fehler(400, f"Die Testnachricht ging nicht raus: {e}")
            return self.json({"ok": True, "an": an})
        if erstes == "einstellungen":
            if m == "GET":
                aus = {k: einstellung(con, k) for k in EINSTELLUNGEN_OEFFENTLICH}
                if self.rechte.get("einstellungen"):
                    aus.update({k: einstellung(con, k) for k in EINSTELLUNGEN_SMTP})
                    aus["smtp_pass_gesetzt"] = bool(einstellung(con, "smtp_pass"))
                    aus["ki_schluessel_gesetzt"] = bool(einstellung(con, "ki_schluessel") or os.environ.get("ANTHROPIC_API_KEY"))
                    aus["versand_fehler"] = VERSAND.letzter_fehler if VERSAND else ""
                return self.json(aus)
            if m == "PUT":
                d = self.body()
                for k in EINSTELLUNGEN_SMTP:
                    if k in d:
                        wert = str(d[k] or "").strip()[:200]
                        if k == "smtp_port" and wert and not wert.isdigit():
                            raise Fehler(400, "Der Port muss eine Zahl sein, meist 587 oder 465.")
                        if k == "smtp_tls" and wert not in ("starttls", "ssl", "keine"):
                            raise Fehler(400, "Verschlüsselung ist ungültig.")
                        con.execute("INSERT OR REPLACE INTO einstellungen VALUES (?, ?)", (k, wert))
                if d.get("smtp_pass"):
                    con.execute("INSERT OR REPLACE INTO einstellungen VALUES ('smtp_pass', ?)", (str(d["smtp_pass"])[:300],))
                if d.get("ki_schluessel"):
                    con.execute("INSERT OR REPLACE INTO einstellungen VALUES ('ki_schluessel', ?)", (str(d["ki_schluessel"]).strip()[:300],))
                if "feierabend" in d:
                    wert = str(d["feierabend"] or "").strip()
                    if not re.match(r"^([01]\d|2[0-3]):[0-5]\d$", wert):
                        raise Fehler(400, "Feierabend bitte als Uhrzeit angeben, z. B. 17:00.")
                    con.execute("INSERT OR REPLACE INTO einstellungen VALUES ('feierabend', ?)", (wert,))
                if "schluessel_vorlauf" in d:
                    try:
                        wert = int(d["schluessel_vorlauf"])
                    except (TypeError, ValueError):
                        raise Fehler(400, "Die Vorlaufzeit muss eine Zahl in Minuten sein.")
                    if not 0 <= wert <= 720:
                        raise Fehler(400, "Die Vorlaufzeit muss zwischen 0 und 720 Minuten liegen.")
                    con.execute("INSERT OR REPLACE INTO einstellungen VALUES ('schluessel_vorlauf', ?)", (str(wert),))
                if "ki_aktiv" in d:
                    con.execute("INSERT OR REPLACE INTO einstellungen VALUES ('ki_aktiv', ?)",
                                ("1" if d["ki_aktiv"] in (1, True, "1") else "0",))
                if "mail_aktiv" in d:
                    con.execute("INSERT OR REPLACE INTO einstellungen VALUES ('mail_aktiv', ?)",
                                ("1" if d["mail_aktiv"] in (1, True, "1") else "0",))
                    if d["mail_aktiv"] in (1, True, "1"):
                        con.execute("UPDATE benachrichtigungen SET gemailt=2 WHERE gemailt=0")
                if "basis_url" in d:
                    url = str(d["basis_url"] or "").strip().rstrip("/")
                    if url and not re.match(r"^https?://[^\s/]+(/[^\s]*)?$", url):
                        raise Fehler(400, "Die Adresse muss mit http:// oder https:// beginnen.")
                    con.execute("INSERT OR REPLACE INTO einstellungen VALUES ('basis_url', ?)", (url,))
                if "oeffentlich_objekt" in d:
                    con.execute("INSERT OR REPLACE INTO einstellungen VALUES ('oeffentlich_objekt', ?)",
                                ("1" if d["oeffentlich_objekt"] in (1, True, "1") else "0",))
                if "oeffentlich_melden" in d:
                    con.execute("INSERT OR REPLACE INTO einstellungen VALUES ('oeffentlich_melden', ?)",
                                ("1" if d["oeffentlich_melden"] in (1, True, "1") else "0",))
                protokollieren(con, b, "geändert", "einstellungen", None, ", ".join(k for k in d if k not in ("smtp_pass", "ki_schluessel")))
                aus = {k: einstellung(con, k) for k in EINSTELLUNGEN_OEFFENTLICH + EINSTELLUNGEN_SMTP}
                aus["smtp_pass_gesetzt"] = bool(einstellung(con, "smtp_pass"))
                aus["ki_schluessel_gesetzt"] = bool(einstellung(con, "ki_schluessel") or os.environ.get("ANTHROPIC_API_KEY"))
                return self.json(aus)
        if erstes == "checklisten" and len(teile) == 3 and teile[2] == "checkpoints":
            cid = self.id(teile[1])
            if m == "POST" and not self.rechte.get("wartung_planen"):
                raise Fehler(403, "Dafür fehlt dir das Recht: Wartungsplan: Aufgaben anlegen und ändern.")
            liste = checkpoints_abgleichen(con, cid)
            return self.json(liste)
        if erstes == "checklisten" and len(teile) == 3 and teile[2] == "scans" and m == "GET":
            seit = (q.get("seit") or [""])[0][:19] or jetzt()
            return self.json({"jetzt": jetzt(), "seit": seit, "stand": checkpoint_stand(con, self.id(teile[1]), b["id"], seit)})
        if erstes == "checklisten" and len(teile) == 3 and teile[2] == "durchgaenge" and m == "GET":
            cid = self.id(teile[1])
            return self.json([dict(r) for r in con.execute(
                "SELECT id, zeit, wer, abweichungen, bemerkung, pruef_status, geprueft_von FROM checklisten_durchgaenge WHERE checkliste_id=? ORDER BY zeit DESC LIMIT 300", (cid,))])
        if erstes == "checklisten" and len(teile) == 3 and teile[2] == "durchgang" and m == "POST":
            return self.json(checkliste_durchfuehren(con, b, self.id(teile[1]), self.body()), 201)
        if erstes == "durchgaenge" and len(teile) == 3 and teile[2] == "pruefen" and m == "POST":
            return self.json(self.durchgang_pruefen(con, b, self.id(teile[1]), self.body()))
        if erstes == "pruefungen" and m == "GET":
            alle = self.rechte.get("benutzer_verwalten") and (q.get("alle") or [""])[0] == "1"
            status = (q.get("status") or ["offen"])[0]
            bed = ["d.pruef_status IS NOT NULL"]
            werte = []
            if status == "offen":
                bed.append("d.pruef_status='offen'")
            elif status == "erledigt":
                bed.append("d.pruef_status IN ('bestaetigt','rueckfrage')")
            if not alle:
                bed.append("(d.pruefer_id=? OR d.benutzer_id=?)")
                werte += [b["id"], b["id"]]
            liste = [dict(r) for r in con.execute(
                "SELECT d.id, d.checkliste_id, d.zeit, d.wer, d.abweichungen, d.pruef_status, d.pruefer_id, d.benutzer_id, d.geprueft_von, "
                "d.geprueft_am, d.pruef_kommentar, c.titel, c.art, c.objekt_id, c.anlage_id FROM checklisten_durchgaenge d "
                f"JOIN checklisten c ON c.id=d.checkliste_id WHERE {' AND '.join(bed)} ORDER BY d.zeit DESC LIMIT 300", werte)]
            offen_fuer_mich = con.execute("SELECT COUNT(*) FROM checklisten_durchgaenge WHERE pruef_status='offen' AND pruefer_id=?",
                                          (b["id"],)).fetchone()[0]
            return self.json({"liste": liste, "offen_fuer_mich": offen_fuer_mich})
        if erstes == "durchgaenge" and len(teile) == 2 and m == "GET":
            r = con.execute("SELECT d.*, c.titel, c.art FROM checklisten_durchgaenge d JOIN checklisten c ON c.id=d.checkliste_id WHERE d.id=?",
                            (self.id(teile[1]),)).fetchone()
            if not r:
                raise Fehler(404, "Durchgang nicht gefunden.")
            aus = dict(r)
            aus["ergebnisse"] = json.loads(r["ergebnisse"] or "[]")
            aus["checkpoints"] = json.loads(r["checkpoints"] or "[]")
            aus["tickets"] = [dict(t) for t in con.execute(
                "SELECT id, nummer, titel FROM tickets WHERE mangel=? ORDER BY id", (f"Durchgang {r['id']}",))]
            return self.json(aus)
        if erstes == "objekte" and len(teile) == 3 and teile[2] == "qr-neu" and m == "POST":
            oid = self.id(teile[1])
            if not con.execute("SELECT 1 FROM objekte WHERE id=?", (oid,)).fetchone():
                raise Fehler(404, "Objekt nicht gefunden.")
            con.execute("UPDATE objekte SET qr_token=? WHERE id=?", (neuer_qr_token(), oid))
            protokollieren(con, b, "neuen Mieter-QR-Code erzeugt", "objekte", oid)
            return self.json({"qr_token": con.execute("SELECT qr_token FROM objekte WHERE id=?", (oid,)).fetchone()[0]})
        if erstes == "anlagen" and len(teile) == 3 and teile[2] == "qr-neu" and m == "POST":
            aid = self.id(teile[1])
            if not con.execute("SELECT 1 FROM anlagen WHERE id=?", (aid,)).fetchone():
                raise Fehler(404, "Anlage nicht gefunden.")
            con.execute("UPDATE anlagen SET qr_token=? WHERE id=?", (neuer_qr_token(), aid))
            protokollieren(con, b, "neuen QR-Code erzeugt", "anlagen", aid)
            return self.json({"qr_token": con.execute("SELECT qr_token FROM anlagen WHERE id=?", (aid,)).fetchone()[0]})
        if erstes == "anlagen" and len(teile) == 3 and teile[2] == "aktivitaet" and m == "GET":
            return self.json(anlage_aktivitaet(con, self.id(teile[1])))
        if erstes == "dokumente" and len(teile) == 3 and teile[2] == "sv-auswertung":
            did = self.id(teile[1])
            dok = con.execute("SELECT * FROM dokumente WHERE id=?", (did,)).fetchone()
            if not dok or not dok["pfad"]:
                raise Fehler(404, "Bericht nicht gefunden.")
            if m == "GET":
                r = con.execute("SELECT * FROM sv_auswertungen WHERE dokument_id=? ORDER BY id DESC LIMIT 1", (did,)).fetchone()
                return self.json({"auswertung": {**json.loads(r["ergebnis"]), "zeit": r["zeit"], "von": r["von"],
                                                 "uebernommen": r["uebernommen"], "id": r["id"]} if r else None})
            if m == "PUT":
                try:
                    ergebnis = ki.ergebnis_saeubern(self.body().get("ergebnis"))
                except ki.KiFehler as e:
                    raise Fehler(400, str(e))
                ergebnis["modell"] = "Claude-Chat (eingefügt)"
                cur = con.execute("INSERT INTO sv_auswertungen (dokument_id, zeit, von, ergebnis) VALUES (?,?,?,?)",
                                  (did, jetzt(), self.benutzer["name"], json.dumps(ergebnis, ensure_ascii=False)))
                protokollieren(con, self.benutzer, "Auswertung eingefügt", "dokumente", did, f'{len(ergebnis["maengel"])} Mängel')
                return self.json({"auswertung": {**ergebnis, "zeit": jetzt(), "von": self.benutzer["name"], "uebernommen": None,
                                                 "id": cur.lastrowid}})
            if m == "POST":
                if einstellung(con, "ki_aktiv") != "1":
                    raise Fehler(400, "Die KI-Auswertung ist ausgeschaltet. Ein Administrator schaltet sie unter Einstellungen ein.")
                schluessel = einstellung(con, "ki_schluessel") or os.environ.get("ANTHROPIC_API_KEY", "")
                if not schluessel:
                    raise Fehler(400, "Für die KI-Auswertung fehlt der Schlüssel. Ein Administrator trägt ihn unter Einstellungen ein.")
                endung = (dok["dateiname"] or "").rsplit(".", 1)[-1].lower()
                if endung not in ki.MEDIEN:
                    raise Fehler(400, "Auswerten geht nur mit PDF oder Foto (JPG, PNG, WEBP).")
                pfad = (DOK_PFAD / dok["pfad"]).resolve()
                if not str(pfad).startswith(str(DOK_PFAD.resolve())) or not pfad.is_file():
                    raise Fehler(404, "Datei nicht gefunden.")
                inhalt = pfad.read_bytes()
                if len(inhalt) > 30 * 1024 * 1024:
                    raise Fehler(400, "Der Bericht ist zu groß für die Auswertung (höchstens 30 MB).")
                anlage_text = ""
                if dok["anlage_id"]:
                    a = con.execute("SELECT bezeichnung, sv_gegenstand, hersteller, typ FROM anlagen WHERE id=?", (dok["anlage_id"],)).fetchone()
                    if a:
                        anlage_text = ", ".join(x for x in (a["bezeichnung"], a["sv_gegenstand"], a["hersteller"], a["typ"]) if x)
                self._spaeter = (did, inhalt, endung, schluessel, anlage_text, self.benutzer["name"])
                return None
        if erstes == "objekte" and len(teile) == 3 and teile[2] == "bericht" and m == "GET":
            von = (q.get("von") or [""])[0]
            bis = (q.get("bis") or [""])[0]
            try:
                dv, db_ = dt.date.fromisoformat(von), dt.date.fromisoformat(bis)
            except ValueError:
                raise Fehler(400, "Bitte einen gültigen Zeitraum wählen.")
            if db_ < dv or (db_ - dv).days > 3 * 366:
                raise Fehler(400, "Der Zeitraum ist ungültig (höchstens drei Jahre).")
            teile_ = [t for t in (q.get("teile") or [""])[0].split(",") if t in BERICHT_TEILE]
            if not teile_:
                raise Fehler(400, "Bitte mindestens einen Teilbereich auswählen.")
            return self.json(objekt_bericht(con, self.id(teile[1]), von, bis, teile_, (q.get("kosten") or ["0"])[0] == "1"))
        if erstes == "schluesselbestand" and m == "GET":
            oid = (q.get("objekt_id") or [""])[0]
            return self.json({"schluessel": schluessel_bestand(con, int(oid) if oid.isdigit() else None),
                              "zeiten": schluessel_standardzeiten(con)})
        if erstes == "schluesselfotos" and len(teile) == 2 and m == "GET":
            r = con.execute("SELECT pfad FROM schluessel_fotos WHERE id=?", (self.id(teile[1]),)).fetchone()
            pf = (SCHL_PFAD / r["pfad"]).resolve() if r else None
            if not pf or not str(pf).startswith(str(SCHL_PFAD.resolve())) or not pf.is_file():
                raise Fehler(404, "Foto nicht gefunden.")
            typ = mimetypes.guess_type(pf.name)[0] or "image/jpeg"
            return self.senden(200, pf.read_bytes(), typ, {"Cache-Control": "private, max-age=86400",
                                                            "Content-Security-Policy": "sandbox"})
        if erstes == "schluesseluebergaben":
            if len(teile) == 1 and m == "GET":
                return self.json(uebergaben_liste(con, q))
            if len(teile) == 1 and m == "POST":
                return self.json(uebergabe_anlegen(con, self.benutzer, self.body()), 201)
            if len(teile) == 2 and m == "GET":
                return self.json(uebergabe_laden(con, self.id(teile[1])))
            if len(teile) == 2 and m == "PUT":
                return self.json(uebergabe_aendern(con, self.benutzer, self.id(teile[1]), self.body()))
            if len(teile) == 3 and teile[2] == "rueckgabe" and m == "POST":
                return self.json(uebergabe_rueckgabe(con, self.benutzer, self.id(teile[1]), self.body()))
            if len(teile) == 3 and teile[2] == "mail" and m == "POST":
                con.execute("UPDATE schluessel_uebergaben SET quittung_senden=1, quittung_gesendet=NULL, mail_versuche=0, "
                            "ausgabe_zeit=ausgabe_zeit WHERE id=?", (self.id(teile[1]),))
                return self.json({"ok": True})
            raise Fehler(404, "Nicht gefunden.")
        if erstes == "sv-vorlage" and m == "GET":
            return self.json({"text": ki.vorlage()})
        if erstes == "svberichte" and len(teile) == 3 and teile[2] == "uebernehmen" and m == "POST":
            return self.json(sv_uebernehmen(con, self.benutzer, self.rechte, self.id(teile[1]), self.body()))
        if erstes == "dienstleister" and len(teile) == 2 and teile[1] == "import" and m == "POST":
            if not self.rechte.get("vertraege_bearbeiten"):
                raise Fehler(403, "Dafür fehlt dir das Recht: Verträge und Dienstleister bearbeiten.")
            return self.json(dienstleister_importieren(con, b, self.body()))
        if erstes == "svpruefplan" and len(teile) == 2 and teile[1] == "import" and m == "POST":
            if not (self.rechte.get("anlagen_bearbeiten") and self.rechte.get("wartung_planen")):
                raise Fehler(403, "Dafür braucht es die Rechte für Anlagen und Wartungsplan.")
            return self.json(sv_pruefplan_importieren(con, b, self.body()))
        if erstes == "svpruefplan" and m == "GET":
            return self.json(sv_pruefplan(con, q))
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
                    self.personen_pruefen(con, res, sauber)
                    if name == "checklisten":
                        self.checkliste_pruefen(con, sauber)
                    neue_id = einfuegen(con, name, sauber)
                    protokollieren(con, b, "angelegt", name, neue_id)
                    if name == "checklisten" and sauber.get("zustaendig_id"):
                        self.zuweisung_melden(con, b, neue_id, sauber)
                return self.json(zeile(con.execute(f'SELECT * FROM "{name}" WHERE id=?', (neue_id,)).fetchone()), 201)
            raise Fehler(405, "Nicht erlaubt.")
        if len(rest) > 1:
            raise Fehler(404, "Nicht gefunden.")
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
            self.personen_pruefen(con, res, sauber)
            if name == "checklisten":
                self.checkliste_pruefen(con, sauber)
                if sauber.get("zustaendig_id") and sauber["zustaendig_id"] != alt.get("zustaendig_id"):
                    self.zuweisung_melden(con, b, rid, {**alt, **sauber})
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
            if name == "objekte" and alt.get("bild"):
                bp = (OBJ_PFAD / alt["bild"]).resolve()
                if str(bp).startswith(str(OBJ_PFAD.resolve())) and bp.is_file():
                    bp.unlink()
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
        namen = {f["name"] for f in res["felder"] if not f.get("virtuell")} | {"id"}
        bed, werte = [], []
        for k, v in q.items():
            if k in namen and v:
                bed.append(f'"{k}"=?')
                werte.append(v[0])
        if q.get("q") and q["q"][0].strip():
            textfelder = [f["name"] for f in res["felder"]
                          if f["typ"] in ("text", "textarea", "email", "tel") and not f.get("virtuell")]
            if textfelder:
                bed.append("(" + " OR ".join(f'"{f}" LIKE ?' for f in textfelder) + ")")
                werte += [f'%{q["q"][0].strip()}%'] * len(textfelder)
        if name == "tickets" and q.get("offen"):
            bed.append("status NOT IN ('Erledigt','Abgeschlossen')")
        if name == "tickets" and q.get("kategorie_id") and q["kategorie_id"][0]:
            bed.append("anlage_id IN (SELECT id FROM anlagen WHERE kategorie_id=?)")
            werte.append(q["kategorie_id"][0])
        if name == "tickets" and q.get("frist") and q["frist"][0] in ("ueber", "7"):
            grenze = heute().isoformat() if q["frist"][0] == "ueber" else (heute() + dt.timedelta(days=7)).isoformat()
            bed.append("faellig_am IS NOT NULL AND faellig_am " + ("<" if q["frist"][0] == "ueber" else "<=") + " ?"
                       " AND status NOT IN ('Erledigt','Abgeschlossen')")
            werte.append(grenze)
        sort = res.get("sort", "id")
        richtung = "DESC" if sort.startswith("-") else "ASC"
        sort = sort.lstrip("-")
        sql = f'SELECT * FROM "{name}"' + (" WHERE " + " AND ".join(bed) if bed else "")
        sql += f' ORDER BY "{sort}" IS NULL, "{sort}" COLLATE NOCASE {richtung}, id DESC LIMIT 5000'
        zeilen = [dict(r) for r in con.execute(sql, werte)]
        for z in zeilen:
            z.pop("pfad", None)
        if name == "checklisten" and zeilen:
            letzte = {r[0]: (r[1], r[2]) for r in con.execute(
                "SELECT checkliste_id, MAX(zeit), COUNT(*) FROM checklisten_durchgaenge GROUP BY checkliste_id")}
            for z in zeilen:
                l, n = letzte.get(z["id"], (None, 0))
                z["letzte"] = l
                z["durchgaenge"] = n
                try:
                    z["anzahl_punkte"] = len(json.loads(z.get("punkte") or "[]"))
                except ValueError:
                    z["anzahl_punkte"] = 0
                z.update(checkliste_termin(z, l))
        if name == "objekte" and zeilen:
            anl = {r[0]: r[1] for r in con.execute("SELECT objekt_id, COUNT(*) FROM anlagen GROUP BY objekt_id")}
            tik = {r[0]: r[1] for r in con.execute(
                "SELECT objekt_id, COUNT(*) FROM tickets WHERE status NOT IN ('Erledigt','Abgeschlossen') GROUP BY objekt_id")}
            ueb = {r[0]: r[1] for r in con.execute(
                "SELECT objekt_id, COUNT(*) FROM wartungen WHERE aktiv=1 AND naechste < ? GROUP BY objekt_id", (heute().isoformat(),))}
            for z in zeilen:
                z.update({"anlagen_anzahl": anl.get(z["id"], 0), "tickets_offen": tik.get(z["id"], 0),
                          "wartung_ueberfaellig": ueb.get(z["id"], 0)})
        if name == "tickets" and zeilen:
            info = {r["id"]: r for r in con.execute(
                "SELECT a.id, a.nummer, a.standort, k.name AS kat, g.name AS grp, t.name AS typ FROM anlagen a "
                "LEFT JOIN kat_kategorien k ON k.id=a.kategorie_id LEFT JOIN kat_gruppen g ON g.id=a.gruppe_id "
                "LEFT JOIN kat_typen t ON t.id=a.typ_id")}
            for z in zeilen:
                r = info.get(z.get("anlage_id"))
                z.update({"a_kategorie": r["kat"] if r else None, "a_gruppe": r["grp"] if r else None,
                          "a_typ": r["typ"] if r else None, "a_nummer": r["nummer"] if r else None,
                          "a_standort": r["standort"] if r else None})
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

    def personen_pruefen(self, con, res: dict, sauber: dict):
        for f in res["felder"]:
            if f["typ"] == "person" and sauber.get(f["name"]) is not None:
                if not con.execute("SELECT 1 FROM benutzer WHERE id=? AND aktiv=1", (sauber[f["name"]],)).fetchone():
                    raise Fehler(400, f'„{f["label"]}“: Diese Person gibt es nicht oder sie ist gesperrt.')

    def durchgang_pruefen(self, con, b, did: int, d: dict):
        r = con.execute("SELECT d.*, c.titel, c.art FROM checklisten_durchgaenge d JOIN checklisten c ON c.id=d.checkliste_id WHERE d.id=?",
                        (did,)).fetchone()
        if not r:
            raise Fehler(404, "Durchgang nicht gefunden.")
        if r["pruefer_id"] != b["id"] and not self.rechte.get("benutzer_verwalten"):
            raise Fehler(403, "Prüfen darf nur der eingetragene Objektleiter oder ein Administrator.")
        entscheidung = d.get("entscheidung")
        if entscheidung not in ("bestaetigt", "rueckfrage"):
            raise Fehler(400, "Bitte bestätigen oder eine Rückfrage stellen.")
        kommentar = str(d.get("kommentar") or "").strip()[:2000]
        if entscheidung == "rueckfrage" and len(kommentar) < 3:
            raise Fehler(400, "Bitte kurz schreiben, was geklärt werden soll.")
        con.execute("UPDATE checklisten_durchgaenge SET pruef_status=?, geprueft_von=?, geprueft_am=?, pruef_kommentar=? WHERE id=?",
                    (entscheidung, b["name"], jetzt(), kommentar or None, did))
        con.execute("UPDATE benachrichtigungen SET gelesen=1 WHERE schluessel=?", (f"pruefen:{did}",))
        art = "Rundgang" if r["art"] == "Rundgang" else "Checkliste"
        if r["benutzer_id"] and r["benutzer_id"] != b["id"]:
            if entscheidung == "bestaetigt":
                benachrichtigen(con, r["benutzer_id"], f"bestaetigt:{did}", f"{art} bestätigt: {r['titel']}",
                                f"von {b['name']}" + (f" · {kommentar}" if kommentar else ""), f"#/checklisten/{r['checkliste_id']}?durchgang={did}", "bestaetigt")
            else:
                benachrichtigen(con, r["benutzer_id"], f"rueckfrage:{did}:{jetzt()}", f"Rückfrage zu {art}: {r['titel']}",
                                f"{b['name']}: {kommentar}", f"#/checklisten/{r['checkliste_id']}?durchgang={did}", "rueckfrage")
        protokollieren(con, b, "bestätigt" if entscheidung == "bestaetigt" else "Rückfrage gestellt", "checklisten", r["checkliste_id"], r["titel"])
        return {"ok": True}

    def checkliste_pruefen(self, con, sauber: dict):
        if sauber.get("zustaendig_id") is not None:
            sauber["zustaendig_id"] = int(sauber["zustaendig_id"])
            if not con.execute("SELECT 1 FROM benutzer WHERE id=? AND aktiv=1", (sauber["zustaendig_id"],)).fetchone():
                raise Fehler(400, "Diese Person gibt es nicht oder sie ist gesperrt.")
        if sauber.get("faellig_uhrzeit") and not re.match(r"^\d{1,2}:\d{2}$", sauber["faellig_uhrzeit"]):
            raise Fehler(400, "Bitte die Uhrzeit als HH:MM eintragen, zum Beispiel 08:00.")
        if sauber.get("erinnern_vorher") is not None and not 0 <= sauber["erinnern_vorher"] <= 365:
            raise Fehler(400, "Die Vorwarnzeit muss zwischen 0 und 365 liegen.")

    def zuweisung_melden(self, con, b, cid: int, c: dict):
        art = "Rundgang" if c.get("art") == "Rundgang" else "Checkliste"
        benachrichtigen(con, c["zustaendig_id"], f"zuweisung:{cid}:{jetzt()}", f"Dir wurde {'ein Rundgang' if art == 'Rundgang' else 'eine Checkliste'} zugewiesen: {c.get('titel')}",
                        f"von {b['name']} · Rhythmus {c.get('rhythmus') or 'bei Bedarf'}", f"#/checklisten/{cid}", "zuweisung")

    def checkpoint_api(self, con, m: str, teile: list[str]):
        token = teile[2]
        if not re.match(r"^[A-Za-z0-9_-]{8,40}$", token):
            raise Fehler(404, "Dieser Checkpoint ist nicht gültig.")
        cp = con.execute("SELECT cp.*, c.titel, c.objekt_id, o.name AS o_name FROM checkpoints cp JOIN checklisten c ON c.id=cp.checkliste_id "
                         "LEFT JOIN objekte o ON o.id=c.objekt_id WHERE cp.token=?", (token,)).fetchone()
        if not cp:
            raise Fehler(404, "Dieser Checkpoint ist nicht mehr gültig.")
        b = self.angemeldet(con)
        info = {"bereich": cp["bereich"], "rundgang": cp["titel"], "objekt": cp["o_name"], "checkliste_id": cp["checkliste_id"],
                "angemeldet": bool(b)}
        if len(teile) == 3 and m == "GET":
            return self.json(info)
        if len(teile) == 4 and teile[3] == "scan" and m == "POST":
            if not b:
                raise Fehler(401, "Bitte anmelden, damit der Checkpoint erfasst wird.")
            if not effektive_rechte(con, b).get("wartung_erledigen"):
                raise Fehler(403, "Dafür fehlt dir das Recht: Wartungen und Prüfungen als erledigt melden.")
            d = self.body()
            lat = lon = None
            try:
                if d.get("lat") is not None:
                    lat, lon = float(d["lat"]), float(d["lon"])
            except (TypeError, ValueError, KeyError):
                lat = lon = None
            zeit = jetzt()
            con.execute("INSERT INTO checkpoint_scans (checkpoint_id, benutzer_id, wer, zeit, lat, lon) VALUES (?,?,?,?,?,?)",
                        (cp["id"], b["id"], b["name"], zeit, lat, lon))
            return self.json({**info, "zeit": zeit}, 201)
        raise Fehler(404, "Nicht gefunden.")

    def objekt_qr_api(self, con, m: str, teile: list[str]):
        token = teile[2] if len(teile) > 2 else ""
        if not re.match(r"^[A-Za-z0-9_-]{8,40}$", token):
            raise Fehler(404, "Dieser QR-Code ist nicht gültig.")
        o = con.execute("SELECT * FROM objekte WHERE qr_token=?", (token,)).fetchone()
        if not o:
            raise Fehler(404, "Dieser QR-Code ist nicht mehr gültig. Bitte bei Casa Concept Consulting melden.")
        b = self.angemeldet(con)
        offen = einstellung(con, "oeffentlich_objekt") == "1"
        if len(teile) == 3 and m == "GET":
            bereiche = []
            for p in con.execute("SELECT gebaeude, etage, titel FROM plaene WHERE objekt_id=?", (o["id"],)):
                text = " · ".join(x for x in (p["gebaeude"], p["etage"] or p["titel"]) if x)
                if text and text not in bereiche:
                    bereiche.append(text)
            return self.json({"objekt": {"name": o["name"], "kuerzel": o["kuerzel"],
                                         "anschrift": ", ".join(x for x in (o["strasse"], " ".join(y for y in (o["plz"], o["ort"]) if y)) if x),
                                         "bild": bool(o["bild"])},
                              "bereiche": bereiche, "themen": list(MIETER_THEMEN), "oeffentlich": offen,
                              "angemeldet": bool(b), "objekt_id": o["id"] if b else None})
        if len(teile) == 4 and teile[3] == "bild" and m == "GET":
            return self.objektbild(con, o["id"])
        if len(teile) == 4 and teile[3] == "meldung" and m == "POST":
            if not b and not offen:
                raise Fehler(403, "Meldungen über diesen Code sind gerade abgeschaltet. Bitte wenden Sie sich an die Hausverwaltung.")
            if b and not effektive_rechte(con, b).get("tickets_anlegen"):
                raise Fehler(403, "Dafür fehlt dir das Recht: Störmeldungen und Mängel anlegen.")
            if not b:
                qr_bremse(self.client_address[0])
            d = self.body()
            text = str(d.get("beschreibung") or "").strip()[:4000]
            if len(text) < 3:
                raise Fehler(400, "Bitte kurz beschreiben, was nicht stimmt.")
            name = str(d.get("name") or "").strip()[:120]
            kontakt = str(d.get("kontakt") or "").strip()[:160]
            if not b and not name:
                raise Fehler(400, "Bitte Ihren Namen angeben, damit wir nachfragen können.")
            thema = d.get("thema") if d.get("thema") in MIETER_THEMEN else "Sonstiges"
            bereich = str(d.get("bereich") or "").strip()[:150]
            melder = (b["name"] if b else name + (f" ({kontakt})" if kontakt else ""))[:200]
            dringend = bool(d.get("dringend"))
            tid = ticket_anlegen(con, b or {"name": "QR-Code Objekt"}, {
                "objekt_id": o["id"], "titel": f"{thema.split(' /')[0]}: {text.splitlines()[0][:90]}",
                "beschreibung": (f"Ort: {bereich}\n\n" if bereich else "") + text, "gewerk": MIETER_THEMEN[thema],
                "prioritaet": "Hoch" if dringend else "Normal", "gefaehrdung": "hoch" if dringend else "mittel",
                "status": "Neu", "art": "Mangel", "gemeldet_von": melder, "gemeldet_am": heute().isoformat()})
            con.execute("INSERT INTO ticket_kommentare (ticket_id, zeit, autor, text) VALUES (?,?,?,?)",
                        (tid, jetzt(), melder, "Über den Mieter-QR-Code des Objekts gemeldet."
                         + ("" if b else " Ohne Anmeldung, bitte Angaben prüfen.")))
            fotos = d.get("fotos") if isinstance(d.get("fotos"), list) else []
            for nr, f in enumerate(fotos[:4], 1):
                try:
                    inhalt = base64.b64decode(str(f), validate=True)
                except ValueError:
                    continue
                endung = bild_endung(inhalt) if inhalt else None
                if not inhalt or len(inhalt) > 8 * 1024 * 1024 or endung not in ("jpg", "png", "webp"):
                    continue
                did = einfuegen(con, "dokumente", {
                    "titel": f"Foto zur Meldung {nr}", "kategorie": "Foto", "objekt_id": o["id"], "ticket_id": tid,
                    "dateiname": f"meldung_{tid}_{nr}.{endung}", "groesse": len(inhalt),
                    "hochgeladen_am": heute().isoformat(), "hochgeladen_von": melder})
                pfad = f"{did:06d}_{secrets.token_hex(4)}_meldung_{tid}_{nr}.{endung}"
                (DOK_PFAD / pfad).write_bytes(inhalt)
                con.execute("UPDATE dokumente SET pfad=? WHERE id=?", (pfad, did))
            nummer = con.execute("SELECT nummer FROM tickets WHERE id=?", (tid,)).fetchone()[0]
            return self.json({"ok": True, "nummer": nummer, "ticket_id": tid if b else None}, 201)
        raise Fehler(404, "Nicht gefunden.")

    def qr_api(self, con, m: str, teile: list[str]):
        if len(teile) >= 3 and teile[1] == "c":
            return self.checkpoint_api(con, m, teile)
        if len(teile) >= 3 and teile[1] == "o":
            return self.objekt_qr_api(con, m, teile)
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
                    "gewerk": a["gewerk"], "planzeichen": a["planzeichen"], "kategorie_id": a["kategorie_id"]}
            kat = con.execute("SELECT name, symbol, farbe FROM kat_kategorien WHERE id=?", (a["kategorie_id"],)).fetchone()
            if kat:
                info.update({"kategorie": kat["name"], "kat_symbol": kat["symbol"], "kat_farbe": kat["farbe"]})
            maengel = [r["text"] for r in con.execute(
                "SELECT text FROM kat_maengel WHERE kategorie_id=? ORDER BY text COLLATE NOCASE", (a["kategorie_id"],))] \
                if a["kategorie_id"] else []
            maengel += [r["text"] for r in con.execute(
                "SELECT text FROM kat_maengel WHERE kategorie_id IS NULL ORDER BY text COLLATE NOCASE") if r["text"] not in maengel]
            return self.json({"anlage": info, "oeffentlich": offen, "angemeldet": bool(b), "maengel": maengel,
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
            mangel = str(d.get("mangel") or "").strip()[:200]
            kat_mangel = None
            if mangel:
                kat_mangel = con.execute("SELECT * FROM kat_maengel WHERE text=? AND (kategorie_id=? OR kategorie_id IS NULL) "
                                         "ORDER BY kategorie_id IS NULL LIMIT 1", (mangel, a["kategorie_id"])).fetchone()
                if not kat_mangel and not b:
                    mangel = ""
            if len(text) < 3 and not mangel:
                raise Fehler(400, "Bitte einen Mangel auswählen oder kurz beschreiben, was nicht stimmt.")
            name = str(d.get("name") or "").strip()[:120]
            kontakt = str(d.get("kontakt") or "").strip()[:160]
            if not b and not name:
                raise Fehler(400, "Bitte Ihren Namen angeben, damit wir nachfragen können.")
            melder = b["name"] if b else name + (f" ({kontakt})" if kontakt else "")
            titel = str(d.get("titel") or "").strip()[:150] or mangel or ("Mangel: " + text.split("\n")[0][:80])
            gef = d.get("gefaehrdung") if b and d.get("gefaehrdung") in GEFAEHRDUNG else (
                kat_mangel["gefaehrdung"] if kat_mangel and kat_mangel["gefaehrdung"] in GEFAEHRDUNG else ("hoch" if d.get("dringend") else "mittel"))
            frist = None
            if b and d.get("faellig_am"):
                frist = wert_pruefen({"label": "Frist", "typ": "date"}, d.get("faellig_am"))
            elif kat_mangel and kat_mangel["frist_tage"]:
                frist = (heute() + dt.timedelta(days=int(kat_mangel["frist_tage"]))).isoformat()
            art = d.get("art") if b and d.get("art") in ("Mangel", "Störung", "Hinweis") else "Mangel"
            dlid = a["dienstleister_id"]
            if b and d.get("dienstleister_id"):
                try:
                    dlid = int(d["dienstleister_id"])
                except (TypeError, ValueError):
                    raise Fehler(400, "Dienstleister ist ungültig.")
            prio = d.get("prioritaet") if d.get("prioritaet") in PRIORITAETEN else ("Hoch" if d.get("dringend") else "Normal")
            if not b and prio == "Notfall":
                prio = "Hoch"
            tid = ticket_anlegen(con, b or {"name": "QR-Code"}, {
                "objekt_id": a["objekt_id"], "anlage_id": a["id"], "titel": titel, "beschreibung": text[:5000] or None,
                "gewerk": a["gewerk"], "prioritaet": "Hoch" if gef == "hoch" and prio == "Normal" else prio, "status": "Neu",
                "gemeldet_von": melder[:200], "gemeldet_am": heute().isoformat(), "dienstleister_id": dlid,
                "gefaehrdung": gef, "faellig_am": frist, "art": art, "mangel": mangel or None})
            con.execute("INSERT INTO ticket_kommentare (ticket_id, zeit, autor, text) VALUES (?,?,?,?)",
                        (tid, jetzt(), melder[:200], "Über den QR-Code der Anlage gemeldet."
                         + ("" if b else " Ohne Anmeldung, bitte Angaben prüfen.")))
            fotos = d.get("fotos") or []
            if not isinstance(fotos, list):
                fotos = []
            for nr, f in enumerate(fotos[:4], 1):
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

    def objektbild_hochladen(self, con, b, oid: int):
        r = con.execute("SELECT bild FROM objekte WHERE id=?", (oid,)).fetchone()
        if not r:
            raise Fehler(404, "Objekt nicht gefunden.")
        d = self.body()
        if d.get("entfernen"):
            neu = None
        else:
            try:
                inhalt = base64.b64decode(d.get("inhalt") or "", validate=True)
            except ValueError:
                raise Fehler(400, "Das Bild konnte nicht gelesen werden.")
            if not inhalt:
                raise Fehler(400, "Bitte ein Bild auswählen.")
            if len(inhalt) > 10 * 1024 * 1024:
                raise Fehler(413, "Das Bild ist zu groß (höchstens 10 MB).")
            endung = bild_endung(inhalt)
            if endung not in ("jpg", "png", "webp"):
                raise Fehler(400, "Bitte ein Foto als JPG, PNG oder WEBP wählen.")
            neu = f"{oid:05d}_{secrets.token_hex(6)}.{endung}"
            (OBJ_PFAD / neu).write_bytes(inhalt)
        if r["bild"]:
            alt = (OBJ_PFAD / r["bild"]).resolve()
            if str(alt).startswith(str(OBJ_PFAD.resolve())) and alt.is_file():
                alt.unlink()
        con.execute("UPDATE objekte SET bild=?, geaendert=? WHERE id=?", (neu, jetzt(), oid))
        protokollieren(con, b, "Bild entfernt" if neu is None else "Bild geändert", "objekte", oid)
        return self.json({"ok": True, "bild": neu})

    def objektbild(self, con, oid: int):
        r = con.execute("SELECT bild FROM objekte WHERE id=?", (oid,)).fetchone()
        if not r or not r["bild"]:
            raise Fehler(404, "Kein Bild vorhanden.")
        p = (OBJ_PFAD / r["bild"]).resolve()
        if not str(p).startswith(str(OBJ_PFAD.resolve())) or not p.is_file():
            raise Fehler(404, "Kein Bild vorhanden.")
        self.senden(200, p.read_bytes(), mimetypes.guess_type(p.name)[0] or "image/jpeg",
                    {"Cache-Control": "private, max-age=86400", "Content-Security-Policy": "sandbox"})

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

    def sv_auswerten(self, did, inhalt, endung, schluessel, anlage_text, wer):
        """Läuft ohne Datenbank-Sperre, weil die KI bis zu einigen Minuten braucht."""
        try:
            ergebnis = ki.bericht_auswerten(schluessel, inhalt, endung, anlage_text)
        except ki.KiFehler as e:
            raise Fehler(400, str(e))
        with _db_lock:
            con = db()
            try:
                with con:
                    cur = con.execute("INSERT INTO sv_auswertungen (dokument_id, zeit, von, ergebnis) VALUES (?,?,?,?)",
                                      (did, jetzt(), wer, json.dumps(ergebnis, ensure_ascii=False)))
                    protokollieren(con, {"name": wer}, "ausgewertet", "dokumente", did,
                                   f'{len(ergebnis.get("maengel") or [])} Mängel erkannt')
            finally:
                con.close()
        self.json({"auswertung": {**ergebnis, "zeit": jetzt(), "von": wer, "uebernommen": None, "id": cur.lastrowid}})

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
        aus = {"id": b["id"], "name": b["name"], "email": b["email"], "rolle": b["rolle"],
               "mail_an": 0 if "mail_an" in b.keys() and b["mail_an"] == 0 else 1,
               "bild": b["bild"] if "bild" in b.keys() else None}
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
    p.add_argument("--browser", action="store_true", help="Browser nach dem Start öffnen")
    a = p.parse_args()
    db_anlegen()
    with db() as con:
        katalog_daten.katalog_anlegen(con, einfuegen)
    if a.demo:
        with db() as con:
            beispieldaten(con)
    global VERSAND
    VERSAND = versand.Versand(db, _db_lock, einstellung, faellige_erinnerungen, jetzt)
    VERSAND.extern_holen = schluessel_mails_holen
    VERSAND.extern_melden = schluessel_mail_gemeldet
    VERSAND.starten()
    srv = ThreadingHTTPServer((a.host, a.port), Handler)
    print(f"Casa CAFM läuft: http://{'localhost' if a.host in ('127.0.0.1', '0.0.0.0') else a.host}:{a.port}")
    print("Beenden mit Strg+C.")
    if a.browser:
        import webbrowser
        threading.Timer(1.0, webbrowser.open, [f"http://localhost:{a.port}"]).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nBeendet.")


if __name__ == "__main__":
    main()
