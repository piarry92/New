# Casa CAFM

Ein schlankes CAFM-Programm für das Facility Management von Casa Concept Consulting.
Es läuft im Browser und braucht nur Python, sonst nichts.

## Was drin ist

| Bereich | Was du damit machst |
| --- | --- |
| Übersicht | Offene Störmeldungen, überfällige und bald fällige Wartungen und Prüfungen, Kündigungsfristen auf einen Blick |
| Pläne | Grundriss hochladen (PNG, JPG oder PDF). Geräte und Anlagen aus der Seitenleiste auf den Plan ziehen, verschieben, anklicken. Farbiger Ring zeigt den Zustand: grün in Ordnung, gelb bald fällig, rot Störung oder überfällig |
| Objekte | Liegenschaften mit Stammdaten. Je Objekt alle Anlagen, Termine, Meldungen, Verträge, Zähler und Dokumente |
| Anlagen | Eigene Akte je Anlage, auch hinter jedem Symbol im Plan: Fotos, Anlagennummer, Beschreibung, Gruppe, Gewerk, Hersteller, Modell, Daten, Manager, Beauftragter, Schalter für GPS-Pflicht und gesetzliche Prüf- und Wartungspflicht, Meldungen, Wartungsplan, Dokumente und Aktivität |
| Wartungsplan | Je Anlage Aufgaben mit Intervall, Grundlage und Checkliste. Vorschläge je Anlagentyp zum Übernehmen. Gesamtübersicht als Jahresplan (Monate als Spalten) oder Liste, Filter nach Objekt, Gewerk, Art und gesetzlicher Pflicht, Export nach Excel, Drucken quer. „Als erledigt melden“ mit Checkliste und Standort rechnet den nächsten Termin selbst aus |
| Störmeldungen | Nummer, Priorität, Status, Dienstleister mit Telefon und Notdienst, Verlauf mit Notizen, Fotos und Dokumente |
| Kalender | Monatsansicht mit Wartungen, Prüfungen, Folgeterminen, fälligen Meldungen und Kündigungsfristen |
| Verträge | Laufzeit, Kündigungsfrist, Jahresbetrag. Warnung 90 Tage vor Ablauf der Kündigungsfrist |
| Dienstleister | Firmen, Ansprechpartner, Telefon, Notdienst, E-Mail |
| Zähler | Zählerstände erfassen, Verbrauch je Monat als Diagramm |
| Dokumente | Dateien hochladen und Objekt, Anlage oder Störmeldung zuordnen |
| Einstellungen | Zugänge mit drei Rollen (Administrator, Bearbeiten, Nur lesen), Passwort ändern, Liste der letzten Änderungen |

Jede Liste lässt sich mit einem Klick als Excel-Liste (CSV) speichern. Die Suche oben findet alles.

## So arbeitest du mit Plänen

1. Unter **Pläne** auf „Grundriss hochladen“ klicken, Objekt, Titel und Etage eintragen.
2. Links ein Symbol (etwa „Feuerlöscher“) auf die richtige Stelle im Plan ziehen. Am Handy: Symbol antippen, dann die Stelle im Plan antippen.
3. Das Programm legt die Anlage an und setzt sie auf den Plan. Anklicken zeigt Zustand, offene Störmeldungen und nächsten Termin.

Für Brandschutz sowie Flucht und Rettung gibt es die Sicherheitszeichen nach DIN EN ISO 7010 (etwa F001 Feuerlöscher,
F002 Wandhydrant, F005 Handfeuermelder, E001/E002 Notausgang, E003 Erste Hilfe, E010 Defibrillator) und Kürzel wie im
Feuerwehrplan (BMZ, FAT, FBF, FSD, RWA). Das Zeichen lässt sich bei jeder Anlage unter „Planzeichen“ ändern. Die Zeichen
sind nachgezeichnet. Für amtliche Flucht- und Rettungspläne nach DIN ISO 23601 bitte die geprüften Originalzeichen verwenden.

**Eigene Symbole:** Im Plan links unter „Eigene Symbole“ oder in den Einstellungen auf „Eigenes Symbol aus Bild“
klicken und ein Bild wählen (PNG, JPG, WEBP oder SVG). Das Programm macht daraus ein quadratisches Symbol. Danach steht
es links zum Ziehen bereit, genau wie die offiziellen Zeichen. Bei jeder Anlage lässt es sich unter „Eigenes Symbol“
auswählen. Ein Symbol, das noch auf Anlagen benutzt wird, lässt sich nicht löschen.

Vorhandene Anlagen ohne Platz stehen links unter „Noch nicht im Plan“. Verschieben geht durch Ziehen. Mausrad oder zwei
Finger zoomen. Oben lassen sich einzelne Gewerke aus- und einblenden. Für PDF-Grundrisse lädt der Browser einmalig
einen Leser aus dem Internet.

## QR-Code je Anlage

Jede Anlage hat einen eigenen QR-Code (Anlagenseite, Karte „QR-Code der Anlage“). Wer ihn scannt, kommt direkt zur
Anlage. Angemeldete Mitarbeitende landen auf der Anlagenseite mit geöffnetem Fenster „Mangel melden“. Ohne Anmeldung
erscheint eine einfache Seite zum Melden mit Beschreibung, Fotos, Name und Kontakt. Daraus wird eine Störmeldung mit Status
„Neu“. Das Melden ohne Anmeldung lässt sich in den Einstellungen abschalten.

Etiketten: einzeln auf der Anlagenseite oder als Bogen für ein ganzes Objekt oder einen Plan („QR-Etiketten“).
Wichtig: In den Einstellungen die Adresse eintragen, unter der das Programm vom Handy aus erreichbar ist, und erst
dann drucken. „Neuen Code erzeugen“ macht den alten Code ungültig.

## Starten

Windows: Doppelklick auf `start.bat`. Mac oder Linux: `./start.sh`.

Oder von Hand:

```sh
python3 app.py
```

Dann im Browser **http://localhost:8080** öffnen. Beim ersten Start legst du dort den ersten Zugang an.

Zum Ausprobieren mit Beispieldaten (nur wenn noch keine Objekte da sind):

```sh
python3 app.py --demo
```

Für mehrere Arbeitsplätze im Büronetz: `python3 app.py --host 0.0.0.0`. Dann ist es unter der Adresse
des Rechners erreichbar, etwa `http://192.168.1.20:8080`. Für den Zugriff von außen gehört ein Server
mit HTTPS davor.

## Wo die Daten liegen

Alles liegt im Ordner `daten/`: die Datenbank `cafm.sqlite` und die hochgeladenen Dateien unter
`dokumente/`. Zum Sichern diesen Ordner kopieren. Mit der Umgebungsvariable `CAFM_DATEN` lässt sich
ein anderer Ort wählen.

## Technik in Kürze

- `app.py`: Webserver, Datenbank (SQLite) und Schnittstelle, nur Python-Standardbibliothek, ab Python 3.10.
- `static/`: Oberfläche in HTML, CSS und JavaScript ohne Fremdbibliotheken, im Casa-Design.
- Datenmodell an einer Stelle (`RESSOURCEN` in `app.py`). Ein neues Feld dort eintragen, dann erscheint es
  in Datenbank, Formular, Liste und Export.
- Passwörter mit PBKDF2 gespeichert, Anmeldung per Sitzungs-Cookie (HttpOnly, SameSite=Strict).

## Ideen für die nächsten Schritte

- Raumbuch und Flächen je Etage
- Anbindung an SharePoint und Outlook
- Mobile Erfassung vor Ort mit Foto
- Berichte als PDF im Casa-Design
- Übernahme bestehender Objektlisten aus Excel
