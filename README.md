# Casa CAFM

Ein schlankes CAFM-Programm für das Facility Management von Casa Concept Consulting.
Es läuft im Browser und braucht nur Python, sonst nichts.

## Was drin ist

| Bereich | Was du damit machst |
| --- | --- |
| Übersicht | Offene Störmeldungen, überfällige und bald fällige Wartungen und Prüfungen, Kündigungsfristen auf einen Blick |
| Objekte | Liegenschaften mit Stammdaten. Je Objekt alle Anlagen, Termine, Meldungen, Verträge, Zähler und Dokumente |
| Anlagen | Technische Anlagen mit Gewerk, Standort, Hersteller, Baujahr und Zustand |
| Wartung & Prüfung | Intervalle und Fälligkeiten. „Als erledigt melden“ rechnet den nächsten Termin selbst aus. Bei offenen Mängeln entsteht auf Wunsch gleich eine Störmeldung |
| Störmeldungen | Nummer, Priorität, Status, Dienstleister mit Telefon und Notdienst, Verlauf mit Notizen, Fotos und Dokumente |
| Kalender | Monatsansicht mit Wartungen, Prüfungen, Folgeterminen, fälligen Meldungen und Kündigungsfristen |
| Verträge | Laufzeit, Kündigungsfrist, Jahresbetrag. Warnung 90 Tage vor Ablauf der Kündigungsfrist |
| Dienstleister | Firmen, Ansprechpartner, Telefon, Notdienst, E-Mail |
| Zähler | Zählerstände erfassen, Verbrauch je Monat als Diagramm |
| Dokumente | Dateien hochladen und Objekt, Anlage oder Störmeldung zuordnen |
| Einstellungen | Zugänge mit drei Rollen (Administrator, Bearbeiten, Nur lesen), Passwort ändern, Liste der letzten Änderungen |

Jede Liste lässt sich mit einem Klick als Excel-Liste (CSV) speichern. Die Suche oben findet alles.

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
