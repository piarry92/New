# Casa CAFM

Ein schlankes CAFM-Programm für das Facility Management von Casa Concept Consulting.
Es läuft im Browser und braucht nur Python, sonst nichts.

## Was drin ist

| Bereich | Was du damit machst |
| --- | --- |
| Übersicht | Offene Störmeldungen, überfällige und bald fällige Wartungen und Prüfungen, Kündigungsfristen auf einen Blick |
| Standorte & Pläne | Links der Standortbaum wie bei Kevox: Objekt › Gebäude › Etage, darunter die Bauteil-Liste der gewählten Etage mit Suche und Kategoriefilter. Klick auf ein Bauteil zeigt es im Plan. Etagen werden von UG über EG bis DG sortiert. Grundriss hochladen (PNG, JPG oder PDF). Geräte und Anlagen aus der Seitenleiste auf den Plan ziehen, verschieben, anklicken. Farbiger Ring zeigt den Zustand: grün in Ordnung, gelb bald fällig, rot Störung oder überfällig |
| Objekte | Kacheln mit großem Bild, darunter Kürzel, Name, Adresse, Anzahl Anlagen, offene Meldungen. Umschaltbar auf Liste. Bild per Kamera-Knopf auf der Kachel oder auf der Objektseite. Liegenschaften mit Stammdaten. Je Objekt alle Anlagen, Termine, Meldungen, Verträge, Zähler und Dokumente |
| Anlagen | Eigene Akte je Anlage, auch hinter jedem Symbol im Plan: Fotos, Anlagennummer, Beschreibung, Gruppe, Gewerk, Hersteller, Modell, Daten, Manager, Beauftragter, Schalter für GPS-Pflicht und gesetzliche Prüf- und Wartungspflicht, Meldungen, Wartungsplan, Dokumente und Aktivität |
| Wartungsplan | Je Anlage Aufgaben mit Intervall, Grundlage und Checkliste. Vorschläge je Anlagentyp zum Übernehmen. Gesamtübersicht als Jahresplan (Monate als Spalten) oder Liste, Filter nach Objekt, Gewerk, Art und gesetzlicher Pflicht, Export nach Excel, Drucken quer. „Als erledigt melden“ mit Checkliste und Standort rechnet den nächsten Termin selbst aus |
| Katalog | Kategorie › Hersteller/Gruppe › Bezeichnung › Detailinfo, mit Symbol je Kategorie, Nummernkreis für die Inventar-Nr., Prüf-, Wartungs- und Kontrollintervall, Zusatzfeldern (z. B. Brandschutztür, Feuerwiderstand, Breite) und Mängelkatalog je Kategorie. Grundbestand: 30 Kategorien, 135 Hersteller, über 600 Bezeichnungen, über 100 Mängel. Erweiterbar |
| Mängel & Störungen | Eintragsmanagement mit Frist, Gefährdung (gering, mittel, hoch), Status, Kategorie, Gruppe, Bezeichnung, Inventar-Nr., Standort. Filter nach Kategorie, Gefährdung und Frist. „Mangel erfassen“ mit Auswahl aus dem Mängelkatalog, Frist und Gefährdung werden vorgeschlagen, bis zu 4 Fotos |
| Kalender | Monatsansicht mit Wartungen, Prüfungen, Folgeterminen, fälligen Meldungen und Kündigungsfristen |
| Verträge | Laufzeit, Kündigungsfrist, Jahresbetrag. Warnung 90 Tage vor Ablauf der Kündigungsfrist |
| Dienstleister | Firmen, Ansprechpartner, Telefon, Notdienst, E-Mail |
| Zähler | Zählerstände erfassen, Verbrauch je Monat als Diagramm |
| Dokumente | Dateien hochladen und Objekt, Anlage oder Störmeldung zuordnen |
| Zugänge & Rechte | Anmeldung für alle. Vier Rollen: Administrator (darf alles), Objektleiter (alles im Objekt inkl. Pläne, Anlagen, Wartungsplan, Verträge, aber keine Zugänge und Einstellungen), Benutzer (Störungen, Wartungen erledigen, Zähler, Dokumente, Schlüssel; Pläne und Anlagen nur ansehen), Zuschauer (sieht alles, ändert nichts). Benutzer aus Datei importieren (Excel/CSV, Spalten Name; E-Mail; Rolle). Rechte je Rolle per Häkchen an- und abwählen, zusätzlich je Zugang eigene Rechte. Sperren, Passwort setzen, Liste der letzten Änderungen |
| Einstellungen | Eigenes Passwort, eigene Rechte ansehen, eigene Symbole, Adresse für QR-Codes |

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

## Checklisten und Rundgänge

- **Checkliste je Anlage** (Anlagenseite › Reiter „Checklisten“): eigene Prüfpunkte anlegen, je Punkt
  „Abhaken“ (i. O. / Mangel / entfällt), „Wert eintragen“ mit Einheit und Sollbereich oder „Text“. Pflicht oder freiwillig,
  Reihenfolge per Pfeil. Eine Checkliste lässt sich von einer anderen Anlage übernehmen.
- **Rundgang je Objekt** (Objektseite › Reiter „Checklisten & Rundgänge“): Prüfpunkte nach Stationen
  (z. B. Technikzentrale, Treppenhaus, Tiefgarage), auf Wunsch mit Bezug zu einer Anlage.
- **Durchführen** am Handy oder Rechner: große Knöpfe, Werte mit Komma oder Punkt, Abweichungen vom Sollbereich
  werden rot markiert, Fortschrittsbalken. Für jede Abweichung entsteht auf Wunsch gleich ein Mangel.
- Rhythmus (täglich bis jährlich oder bei Bedarf) bestimmt die nächste Fälligkeit. Gesamtübersicht unter
  „Checklisten & Rundgänge“ mit Filter „fällig“. Verlauf mit allen Werten je Durchgang.
- Rechte: Listen anlegen und ändern mit „Wartungsplan ändern“, durchführen mit „Wartungen erledigen“.
- **Unterschrift:** Am Ende jedes Durchgangs mit Finger oder Maus unterschreiben, dazu der Name. Je Liste
  einstellbar, ob die Unterschrift Pflicht ist. „Protokoll drucken“ erstellt ein Prüfprotokoll im Casa-Design mit
  allen Werten, Checkpoints und Unterschrift.
- **Zuweisen und erinnern:** Jede Liste lässt sich einer Person zuweisen (z. B. dem Haustechniker). Dazu die
  Uhrzeit der Fälligkeit und wie viele Stunden oder Tage vorher erinnert wird. Die Person sieht oben die **Glocke**
  mit Zahl: „Dir wurde … zugewiesen“, „… steht an“ (ab Beginn der Vorwarnzeit) und „… fällig“ (danach). Ein Klick
  öffnet direkt das Durchführen. Auf der Übersicht erscheint „Meine Rundgänge & Checklisten“. Auf Wunsch zusätzlich
  als Hinweis am Rechner oder Handy, solange das Programm im Browser geöffnet ist.
- **Prüfung durch den Objektleiter:** Beim Objekt wird unter „Objektleiter (Zugang)“ eingetragen, wer prüft
  (je Liste auch abweichend). Nach dem Abschließen geht der Durchgang automatisch „zur Prüfung“: Der Objektleiter
  bekommt eine Benachrichtigung, sieht ihn unter „Zur Prüfung“ (mit Zahl im Menü) und kann **bestätigen** (gern mit
  Kommentar) oder eine **Rückfrage** stellen (Kommentar Pflicht). Der Haustechniker wird über beides benachrichtigt.
  Der Prüfvermerk steht im Verlauf und im Prüfprotokoll. Prüfen darf nur der eingetragene Objektleiter oder ein
  Administrator.
- **Checkpoints beim Rundgang:** Jede Station bekommt einen eigenen QR-Code (Rundgang öffnen › „QR-Etiketten
  drucken“). Der Haustechniker scannt den Code vor Ort mit der Handy-Kamera oder im Programm mit „Checkpoint
  scannen“. Zeit und Person werden festgehalten und im Protokoll gezeigt. Ist „Checkpoints müssen gescannt werden“
  eingestellt, lassen sich die Punkte einer Station erst nach dem Scan abhaken. Der Zwischenstand bleibt beim
  Wechsel zur Kamera erhalten.

## SV-Prüfplan

- Menü Betrieb › **SV-Prüfplan**: alle sicherheitsrelevanten Anlagen, die von Sachverständigen geprüft werden,
  mit Prüfgegenstand, Grundlage, Sachverständigen, letzter Prüfung mit Ergebnis, nächster Prüfung und offenen Mängeln.
- **Anlagen auswählen:** Jede Anlage per Schalter an- oder abwählen, Prüfgegenstand und Grundlage direkt in der Liste.
  Das Programm macht anhand der Bezeichnung Vorschläge (z. B. Brandmeldeanlage, RWA, Aufzug); welche Anlagen wirklich
  prüfpflichtig sind, steht in der Prüfverordnung des Landes, der Baugenehmigung und im Brandschutzkonzept.
- Der Schalter steht auch auf jeder Anlagenseite. Fehlt ein Prüftermin, weist die Anlage darauf hin.
- Prüftermine sind Aufgaben der Art „SV-Prüfung“ im Wartungsplan. „Prüfung eintragen“ speichert Datum und Ergebnis
  und rechnet den nächsten Termin aus. Bei offenen Mängeln entsteht auf Wunsch gleich eine Störmeldung.
- Filter (überfällig, 90 Tage, ohne Termin, offene Mängel), Excel-Liste und Druckansicht im Casa-Design (als PDF speichern).

### SV-Prüfplan im Aufbau der Excel-Übersicht

- Der Prüfplan ist wie die Übersicht der SV-Prüfungen aufgebaut: nach Bereichen gruppiert (Raumlufttechnik,
  Heiztechnik, Sanitär, Elektro, MSR, Brandschutz, Förderanlagen, Kälte, Gebäudehülle, Außenanlagen), je Anlage
  Nr., Prüfgrundlage, Intervall, Prüfer, letzte Prüfung, erhebliche Mängel ja/nein, **Jahresraster** mit
  A (Prüfung), NP (Nachprüfung), P (geplant), nächste Prüfung und Kommentar.
- **„Excel übernehmen“** liest eine solche Übersicht (.xlsx) ein: legt fehlende Anlagen an, übernimmt Nr., Prüfer,
  Prüfgrundlage, Intervall, letzte Prüfung, Jahresraster und Kommentar und berechnet die nächste Prüfung. Löst eine
  spätere Prüfung derselben Anlage eine ältere ab (anderer Sachverständiger), wird die ältere zur Vorgeschichte.
- Beim Eintragen einer SV-Prüfung wählt man **Prüfung** (neuer Zyklus) oder **Nachprüfung** (Zyklus bleibt).
  Zu jedem Prüftermin gibt es Prüfer, Prüf-/Bericht-Nr., Termin Nachprüfung und Frist Mängelbeseitigung.
- Der **SV-Mängelplan** folgt der Mängelübersicht: je Anlage gruppiert mit Prüfer, Bericht-Nr. und Nachprüfung,
  Spalten Lfd. Nr., Feststellung, Bewertung (Einstufung und Wortlaut laut Bericht, z. B. M(B)), Frist, Kosten netto,
  Firma, Angebot, Sachstand, Beauftragt, geplante Ausführung, Fertigstellung, Rechnung, Kommentar.
  Die Einstufung heißt jetzt geringfügig, erheblich, gefährlich (früher „wesentlich“, wird umgestellt).

## SV-Berichte mit KI auswerten, SV-Mängelplan

- Auf jeder Anlage im SV-Prüfplan gibt es die Karte **SV-Berichte**: Prüfbericht als PDF oder Foto hochladen.
- Ist die KI-Auswertung eingeschaltet, liest die KI (Claude von Anthropic) den Bericht und schlägt Prüfdatum,
  Sachverständige, Ergebnis und alle Mängel mit Nummer, Ort, Einstufung (geringfügig, wesentlich, gefährlich) und
  Frist vor. Du prüfst jede Zeile, änderst oder ergänzt sie und übernimmst sie in den **SV-Mängelplan**.
  Auf Wunsch wird die Prüfung gleich im SV-Prüfplan eingetragen und der nächste Termin berechnet.
- **Ohne API-Schlüssel, über den Claude-Chat:** Bericht hochladen, im Claude-Chat auswerten lassen („Werte den
  SV-Bericht für Casa CAFM aus“ oder die Anleitung per „Anleitung kopieren“ einfügen), die Antwort kopieren und auf
  der Anlage mit **„Auswertung von Claude einfügen“** einfügen (auch als .json-Datei). Danach prüfen und übernehmen
  wie oben.
- Text im Bericht, der wie eine Anweisung an eine KI aussieht, wird nicht befolgt; das Programm weist darauf hin.
- **SV-Mängelplan** als Reiter im Objekt (und in der Anlage sowie unter SV-Prüfplan › SV-Mängel): Kennzahlen,
  Filter, „Behoben“, Störmeldung aus einem Mangel anlegen, Excel und Druckansicht im Casa-Design.
- Einschalten: Einstellungen › „KI-Auswertung der SV-Berichte“, API-Schlüssel von console.anthropic.com eintragen.
  Der Bericht wird dafür an Anthropic übertragen. `start.bat` installiert das nötige Paket (`anthropic`) beim
  ersten Start; dafür braucht der Rechner Internet. Ohne KI lassen sich die Mängel von Hand eintragen.

## Schlüsselmanager

- Menü Verwaltung › **Schlüssel** (und Reiter „Schlüssel“ im Objekt): Schlüsselbestand je Objekt mit Nummer,
  Schließanlage, Anzahl Exemplare, Aufbewahrung; man sieht, wie viele da sind und wer welchen Schlüssel hat.
- **Transponder (Zutrittskontrolle)** werden wie Schlüssel angelegt (Art „Transponder“, mit Chip-Nummer und
  Berechtigung) und bei der Ausgabe getrennt ausgewählt. Im Protokoll stehen sie in einem eigenen Abschnitt
  „Zutrittskontrolle: Transponder“, auch in den E-Mails werden sie genannt.
- **Schlüssel ausgeben:** Objekt und Schlüssel wählen, ausgebende Person (Casa) und empfangende Person mit Name,
  Firma, **E-Mail-Adresse (Pflicht)** und Telefon, Zweck, Rückgabe (Standard: heute bis Feierabend), Foto der
  Schlüssel, Unterschrift beider Seiten. Danach öffnet sich das **Schlüsselübergabeprotokoll** im Casa-Design zum Drucken oder als PDF.
- **E-Mails an die empfangende Person** (Sie-Form, Antworten gehen an die ausgebende Person): auf Wunsch sofort das
  Protokoll und eine **Erinnerung vor der Rückgabe**, standardmäßig 60 Minuten vor Feierabend. Feierabend und
  Vorlauf stellt ein Administrator unter Einstellungen › „Schlüsselrückgabe“ ein; bei jeder Übergabe lassen sich
  Rückgabezeit und Erinnerung einzeln ändern. Voraussetzung ist der eingerichtete Mailserver.
- Ist ein Schlüssel nach der Rückgabezeit nicht zurück, bekommt die ausgebende Person eine Benachrichtigung
  (Glocke, E-Mail, Push).
- **Fotos sind Pflicht:** bei der Ausgabe und bei der Rückgabe mindestens ein Foto der Schlüssel (Handy-Kamera
  oder Datei, bis zu 6 Fotos, werden verkleinert gespeichert). Bei der Rückgabe sieht man zum Vergleich die Fotos
  der Ausgabe. Alle Fotos stehen im Übergabeprotokoll.
- **Rückgabe:** mit Foto, Unterschrift und Bemerkung; fehlende Schlüssel werden als verloren markiert.
- Neues Recht „Schlüssel anlegen, ausgeben und zurücknehmen“ unter Zugänge & Rechte.

## Mehrere Grundrisse auf einmal (ZIP-Import)

- Standorte & Pläne › Objekt wählen › **„Mehrere importieren (ZIP)“**. In der ZIP-Datei liegen die Grundrisse als
  PNG oder JPG. Gebäude, Etage und Titel kommen aus einer Datei `plaene.json`
  (`[{"datei": "...png", "gebaeude": "Finger 1", "etage": "2. OG", "titel": "Finger 1 2. OG"}]`) oder aus dem
  Dateinamen `Gebäude__Etage__Titel.png`. Vorhandene Pläne mit gleichem Gebäude, Etage und Titel werden übersprungen.
- Im Standortbaum erscheinen sie als Objekt › Gebäude (z. B. Finger 1) › Etage.
- Flucht- und Rettungspläne als PDF lassen sich mit `python3 werkzeuge/frp_grundrisse.py <pläne.pdf> <ordner>`
  in saubere Grundrisse samt `plaene.json` umwandeln (braucht `pip install pymupdf numpy pillow`).

## Grundriss im Vollbild

- Im Plan rechts über dem Grundriss auf **„Vollbild“** klicken (oder Taste **F**). Plan und Symbolliste füllen dann
  den ganzen Bildschirm, alles funktioniert wie gewohnt (Symbole ziehen, Anlagen öffnen, Mängel melden).
- **„Liste“** blendet die Symbolliste aus, damit der Grundriss noch größer wird. Am Handy ist sie im Vollbild aus.
- Beenden mit „Vollbild beenden“, Esc oder F. Beim Drehen des Handys passt sich der Plan an.

## Dienstleister übernehmen (Excel/CSV)

- Dienstleister › **„Liste übernehmen (Excel/CSV)“**: Spalten werden an der Kopfzeile erkannt (Firma, Gewerk,
  Ansprechpartner, Telefon, Notdienst, E-Mail, Straße, PLZ, Ort, Bemerkung). Vorhandene Firmen (gleicher Name oder
  gleiche E-Mail) werden nur ergänzt, nie überschrieben. Unbekannte Gewerke landen als Hinweis in der Notiz.

## Zugänge übernehmen und einladen

- Zugänge & Rechte › **„Liste übernehmen (Excel/CSV)“** mit den Spalten Name, E-Mail, Rolle. Es werden keine
  Passwörter vergeben. Jeder neue Zugang steht auf „Einladung offen“.
- **„Einladen“** je Zugang: Link kopieren oder (bei eingerichtetem Mailserver) per E-Mail senden. Über den Link
  legt die Person ihr Passwort selbst fest und ist danach angemeldet. Der Link gilt 14 Tage und nur einmal.
  Ein neuer Link macht den alten ungültig; so lässt sich auch ein vergessenes Passwort neu setzen.

## Profilbild

- Freiwillig: Unter Einstellungen › „Dein Zugang“ kann jeder ein Profilbild hinzufügen, ändern oder entfernen.
  Das Bild wird quadratisch zugeschnitten und verkleinert gespeichert.
- Es erscheint in der Seitenleiste, oben rechts, in Zugänge & Rechte und bei zugewiesenen Checklisten.
  Ohne Bild stehen dort wie bisher die Initialen.

## Berichtswesen je Objekt

- Im Objekt oben auf **„Bericht“** klicken. Zeitraum wählen (letzter Monat, Quartal, Jahr oder eigener Zeitraum),
  Titel und Anmerkung eintragen und die **Teilbereiche** an- oder abwählen: Überblick, Anlagenbestand, Wartungen
  und Prüfungen, SV-Prüfplan, SV-Mängel, Mängel und Störungen, Checklisten und Rundgänge, Zähler und Verbrauch,
  Verträge, Schlüssel und Transponder, Dokumente.
- „Beträge und Kosten zeigen“ ist standardmäßig aus, damit Berichte an Auftraggeber keine Kosten enthalten.
- Der Bericht öffnet sich im Casa-Design mit Deckblatt (Objektbild, Zeitraum, Inhalt), Kennzahlen, Diagrammen,
  Tabellen und Seitenzahlen. Im Druckfenster „Als PDF speichern“ wählen. Die Auswahl merkt sich das Programm.

## E-Mail, Push und App

- **E-Mail:** Ein Administrator trägt unter Einstellungen › „E-Mail-Versand (Mailserver)“ den Mailserver ein
  (Server, Port, Verschlüsselung, Absender, Benutzer, Passwort) und schickt sich eine Testnachricht. Danach geht jede
  Benachrichtigung zusätzlich per Mail raus: Zuweisung, „steht an“, „fällig“, „zur Prüfung“, „bestätigt“, „Rückfrage“.
  Jeder Zugang kann E-Mails für sich unter Einstellungen abschalten. Das Passwort wird nie angezeigt.
- **Hintergrunddienst:** Prüft alle paar Minuten fällige Erinnerungen, auch wenn niemand das Programm geöffnet hat,
  und verschickt neue Benachrichtigungen. Fehlgeschlagene Mails werden bis zu fünfmal erneut versucht.
- **App:** Das Programm lässt sich auf Handy und Rechner als App installieren (eigenes Symbol, ohne Browserleiste).
  Android/Chrome/Edge: „Installieren“ unter Einstellungen oder im Browsermenü. iPhone/iPad: in Safari Teilen ›
  „Zum Home-Bildschirm“.
- **Push:** Unter Einstellungen › „Push auf diesem Gerät“ einschalten. Hinweise kommen dann auch bei geschlossener App.
  Voraussetzung: Das Programm ist über **https** erreichbar (am eigenen Rechner reicht localhost). Auf dem iPhone geht
  Push nur in der installierten App (ab iOS 16.4).

## Mieter-QR-Code je Objekt

Jedes Objekt hat zusätzlich einen eigenen QR-Code für Mieter (Objektseite, Karte „QR-Code für Mieter“).
„Aushang drucken (A4)“ erstellt einen Aushang im Casa-Design. Mieter scannen den Code, wählen Thema und Ort,
beschreiben den Mangel, hängen bis zu 4 Fotos an und senden ohne Anmeldung. Die Meldung erscheint unter
Mängel & Störungen. Abschaltbar unter Einstellungen („Mieter-QR-Code der Objekte“, ab Werk an).

## Hell und dunkel

Oben rechts schaltet der Knopf mit Mond bzw. Sonne zwischen Hell- und Dunkelmodus um. Die Wahl wird gemerkt.
Ohne eigene Wahl richtet sich das Programm nach dem Gerät.

## QR-Code je Anlage

Jede Anlage hat einen eigenen QR-Code (Anlagenseite, Karte „QR-Code der Anlage“). Wer ihn scannt, kommt direkt zur
Anlage. Angemeldete Mitarbeitende landen auf der Anlagenseite mit geöffnetem Fenster „Mangel melden“. Ohne Anmeldung
erscheint eine einfache Seite zum Melden mit Beschreibung, Fotos, Name und Kontakt. Daraus wird eine Störmeldung mit Status
„Neu“. Das Melden ohne Anmeldung lässt sich in den Einstellungen abschalten.

Etiketten: einzeln auf der Anlagenseite oder als Bogen für ein ganzes Objekt oder einen Plan („QR-Etiketten“).
Wichtig: In den Einstellungen die Adresse eintragen, unter der das Programm vom Handy aus erreichbar ist, und erst
dann drucken. „Neuen Code erzeugen“ macht den alten Code ungültig.

## Katalog

Der Grundbestand steht in `katalog_daten.py` und wird beim ersten Start angelegt. Die Teckentrup-Bezeichnungen und
einige Beispiele (GLORIA, ZAPP-ZIMMERMANN, COLT, Mängel für Türen, Meldetechnik, Schottung, RWA) stammen aus den
Kevox-Bildschirmfotos. Die übrigen Hersteller sind bekannte Anbieter. Die Liste ist nicht vollständig. Wo kein
Herstellertyp hinterlegt ist, stehen allgemeine Bauarten oder Klassen (z. B. T30-1). Intervalle sind Vorschläge.
Pflegen dürfen nur Zugänge mit dem Recht „Katalog pflegen“.

## Zugänge und Rechte

Ohne Anmeldung sieht niemand etwas. Ausnahme: die Meldeseite hinter dem QR-Code, und auch die nur, wenn ein
Administrator „Melden ohne Anmeldung“ einschaltet (ab Werk aus).

Rechte, die sich an- und abwählen lassen: Objekte und Anlagen ändern, Pläne bearbeiten, Störmeldungen anlegen,
Störmeldungen bearbeiten, Wartungsplan ändern, Wartungen erledigen, Verträge und Dienstleister, Zähler, Dokumente
hochladen, Excel-Export, Löschen, Zugänge verwalten, Einstellungen. Der Server prüft jedes Recht bei jeder Änderung,
nicht nur die Oberfläche. Nach 5 falschen Passwörtern ist die Anmeldung 15 Minuten gesperrt. Es bleibt immer
mindestens ein Administrator.

## Starten

Windows: Doppelklick auf `start.bat`. Zum Ausprobieren mit Beispieldaten: Doppelklick auf `testen.bat`
(eigener Datenordner `daten-test`, die echten Daten bleiben unberührt). Mac oder Linux: `./start.sh`.

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

## Neue Version einspielen

Die neue ZIP-Datei am besten **über den alten Ordner entpacken** (Dateien ersetzen). Der Ordner `daten` mit euren
Einträgen bleibt dabei erhalten. Wer in einen neuen Ordner entpackt, kopiert den Ordner `daten` aus dem alten
Ordner hinein. Die Datenbank wird beim Start automatisch auf den neuen Stand gebracht.

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
