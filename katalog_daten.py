"""Grundbestand für den Katalog (Kategorie > Hersteller/Gruppe > Bezeichnung) und den Mängelkatalog.

Hinweise zur Herkunft:
- Die Teckentrup-Bezeichnungen sowie die Beispiele GLORIA, ZAPP-ZIMMERMANN, COLT und die Mängel für Türen,
  Meldetechnik, Schottung und RWA stammen aus den Bildschirmfotos, die Casa als Vorbild geschickt hat.
- Die übrigen Hersteller sind bekannte Anbieter der jeweiligen Gewerke. Die Liste ist nicht vollständig und
  lässt sich im Programm unter „Katalog“ erweitern.
- Bezeichnungen ohne Hersteller-Typ sind allgemeine Bauarten oder Klassen (z. B. T30-1), keine Produktnamen.
- Intervalle und Grundlagen sind Vorschläge. Bitte mit Vertrag, Herstellerangaben, Zulassung und
  Gefährdungsbeurteilung abgleichen.
"""

TUER_FELDER = """Brandschutztür; Ja/Nein
Rauchschutztür; Ja/Nein
Fluchtwegtür; Ja/Nein
Feuerwiderstand; Auswahl; T30, T60, T90, EI2 30, EI2 60, EI2 90, keiner
Flügel; Auswahl; 1-flügelig, 2-flügelig
Anschlag; Auswahl; DIN links, DIN rechts
Feststellanlage; Ja/Nein
Breite (mm); Zahl
Höhe (mm); Zahl"""

KATEGORIEN = [
    # name, gewerk, farbe, symbol, nummernkreis, prüfung, wartung, kontrolle, grundlage, zusatzfelder
    {"name": "Feuerlöscher", "gewerk": "Brandschutz", "farbe": "Rot", "symbol": "F001", "nr": "201",
     "pruefung": 24, "grundlage": "ASR A2.2, DIN 14406-4",
     "felder": "Löschmittel; Auswahl; ABC-Pulver, Schaum, CO₂, Wasser, Fettbrand\nFüllmenge; Text\nLöschmitteleinheiten (LE); Zahl",
     "hersteller": ["GLORIA", "Minimax", "Jockel", "Neuruppin", "Bavaria", "Total"],
     "typen": ["ABC-Pulver 6 kg", "ABC-Pulver 12 kg", "Schaum 6 l", "Schaum 9 l", "CO₂ 2 kg", "CO₂ 5 kg",
               "Fettbrand 6 l", "Wasser 6 l"],
     "maengel": [("Feuerlöscher fehlt", "Brandschutz", "hoch", 3), ("Prüfung überfällig", "Feuerlöscher", "mittel", 14),
                 ("Plombe fehlt oder beschädigt", "Feuerlöscher", "mittel", 14), ("Feuerlöscher beschädigt", "Feuerlöscher", "mittel", 14),
                 ("Nicht zugänglich (zugestellt)", "Brandschutz", "hoch", 3), ("Kennzeichnung fehlt", "Feuerlöscher", "gering", 30),
                 ("Halterung defekt", "Feuerlöscher", "gering", 30)]},
    {"name": "Meldetechnik", "gewerk": "Brandschutz", "farbe": "Rot", "symbol": "i:melder", "nr": "202",
     "wartung": 12, "grundlage": "DIN 14675, DIN VDE 0833 (BMA), DIN 14676 (Rauchwarnmelder)",
     "felder": "Meldertyp; Auswahl; Rauchmelder, Wärmemelder, Multisensor, Handfeuermelder, Rauchwarnmelder\nMeldergruppe / Nr.; Text\nBatterie bis; Datum",
     "hersteller": ["Hekatron", "Ei Electronics", "Kidde", "Bosch", "Siemens", "Esser"],
     "typen": ["Optischer Rauchmelder", "Wärmemelder", "Multisensormelder", "Handfeuermelder", "Rauchwarnmelder"],
     "maengel": [("Batterie defekt", "Meldetechnik", "mittel", 14), ("Melder fehlt", "Brandschutz", "hoch", 3),
                 ("Melder verschmutzt", "Meldetechnik", "gering", 30), ("Melder abgedeckt", "Brandschutz", "hoch", 3),
                 ("Störungsmeldung an der Zentrale", "Meldetechnik", "mittel", 7), ("Laufkarten fehlen", "Meldetechnik", "gering", 30)]},
    {"name": "Brandmeldezentrale", "gewerk": "Brandschutz", "farbe": "Rot", "symbol": "BMZ", "nr": "212",
     "wartung": 12, "kontrolle": 3, "grundlage": "DIN 14675, DIN VDE 0833-1",
     "felder": "Aufschaltung Feuerwehr; Ja/Nein\nFeuerwehr-Bedienfeld; Ja/Nein\nSchlüsseldepot; Ja/Nein",
     "hersteller": ["Hekatron", "Bosch", "Siemens", "Esser", "Schrack Seconet"],
     "typen": ["Brandmeldezentrale", "Feuerwehr-Anzeigetableau", "Feuerwehr-Bedienfeld", "Feuerwehr-Schlüsseldepot"],
     "maengel": [("Störung an der Zentrale", "Brandschutz", "hoch", 2), ("Laufkarten fehlen oder veraltet", "Brandschutz", "mittel", 14),
                 ("Betriebsbuch nicht geführt", "Brandschutz", "gering", 30)]},
    {"name": "Hydrant", "gewerk": "Brandschutz", "farbe": "Rot", "symbol": "F002", "nr": "203",
     "pruefung": 12, "grundlage": "DIN 14462",
     "felder": "Art; Auswahl; Wandhydrant nass, Wandhydrant trocken, Überflurhydrant, Unterflurhydrant\nSchlauchlänge (m); Zahl",
     "hersteller": ["Hawle", "Erhard", "VAG"],
     "typen": ["Wandhydrant Typ F", "Wandhydrant Typ S", "Trockene Steigleitung", "Überflurhydrant", "Unterflurhydrant"],
     "maengel": [("Schlauch beschädigt", "Hydrant", "mittel", 14), ("Schrank nicht zugänglich", "Brandschutz", "hoch", 3),
                 ("Prüfplakette fehlt", "Hydrant", "gering", 30), ("Undicht", "Hydrant", "mittel", 7)]},
    {"name": "Brandschutztür", "gewerk": "Türen/Tore", "farbe": "Rot", "symbol": "i:tuer", "nr": "204",
     "pruefung": 12, "grundlage": "Zulassung und Herstellerangaben, DIN 14677 bei Feststellanlagen",
     "felder": TUER_FELDER,
     "hersteller_typen": {
         "Teckentrup": ["T 30-1-FSA-42", "T 30-1-FSA-62", "T 30-1-FSA-62 GL", "T 30-1-FSA-62 ST", "T 30-1-FSA-DF",
                        "T 30-1-FSA-OS", "T 30-2-FSA-62", "T 30-2-FSA-62 GL", "T 30-2-FSA-62 ST", "T 30-2-FSA-DF",
                        "T 30-2-FSA-H", "T 60-1-FSA-62", "T 90-1-FSA 62", "dw 62-1", "dw 62-2", "dw 62-2 (RC2-RC4)",
                        "dw 67-1 HS", "dw 67-1 S", "dw 67-2/HS", "Haftraumtür", "MZD-HT 8", "Pendeltür", "RS-1", "RS-1 DF"],
     },
     "hersteller": ["Hörmann", "Novoferm", "Schörghuber", "JELD-WEN", "Schüco", "Jansen", "Forster", "Hueck"],
     "typen": ["T30-1", "T30-2", "T60-1", "T90-1", "T90-2", "RS-1", "RS-2", "T30-1-RS", "T30-2-RS", "Fluchttür"],
     "maengel": [("Errichterbescheinigung fehlt", "Tür", "gering", 30), ("Falsche Tür eingebaut", "Brandschutz", "hoch", 7),
                 ("Feststellanlage defekt", "Tür", "hoch", 3), ("Glaselement beschädigt", "Tür", "mittel", 14),
                 ("Glaselement nicht aus VSG", "Tür", "mittel", 30), ("Schließfolgeregler defekt", "Tür", "mittel", 14),
                 ("Schloss bzw. Drücker defekt", "Tür", "mittel", 14), ("Tür angebohrt", "Tür", "mittel", 30),
                 ("Tür fehlt", "Tür", "hoch", 7), ("Tür nicht ordnungsgemäß eingebaut", "Brandschutz", "hoch", 7),
                 ("Tür schließt nicht", "Brandschutz", "hoch", 3), ("Tür verzogen", "Tür", "mittel", 14),
                 ("Türblatt bzw. Zarge verformt oder undicht", "Tür", "mittel", 14),
                 ("Türprüfung/-wartung fällig", "Tür", "gering", 30), ("Unzulässige Offenhaltung (Keil)", "Brandschutz", "hoch", 1)]},
    {"name": "Schottung", "gewerk": "Brandschutz", "farbe": "Rot", "symbol": "i:schott", "nr": "205",
     "kontrolle": 12, "grundlage": "Zulassung (abZ/aBG), Herstellerangaben",
     "felder": "Art; Auswahl; Kabel, Rohr, Kombi\nFeuerwiderstand; Auswahl; S30, S60, S90, R30, R60, R90\nZulassungs-Nr.; Text\nBelegung; Text",
     "hersteller_typen": {"ZAPP-ZIMMERMANN": ["Kabelabschottung", "Rohrabschottung", "Kombiabschottung"]},
     "hersteller": ["Hilti", "Würth", "Rolf Kuhn", "OBO Bettermann", "Promat", "Doyma"],
     "typen": ["Kabelabschottung", "Rohrabschottung", "Kombiabschottung", "Brandschutzmanschette"],
     "maengel": [("Nachbelegung nicht verschlossen", "Schottung", "mittel", 14), ("Durchbruch nicht verschlossen", "Brandschutz", "hoch", 7),
                 ("Kennzeichnungsschild fehlt", "Schottung", "gering", 30), ("Schott beschädigt", "Schottung", "mittel", 14)]},
    {"name": "Feststellanlage", "gewerk": "Brandschutz", "farbe": "Rot", "symbol": "i:fsa", "nr": "206",
     "pruefung": 12, "grundlage": "DIN 14677 (zusätzlich regelmäßige Prüfung durch den Betreiber)",
     "felder": "Auslösung; Auswahl; Rauchschalter, Rauchmelder, Handtaster\nZulassungs-Nr.; Text",
     "hersteller": ["GEZE", "dormakaba", "ECO Schulte", "ASSA ABLOY", "Hekatron"],
     "typen": ["Feststellanlage mit Rauchschalter", "Freilauftürschließer", "Haftmagnet"],
     "maengel": [("Feststellanlage löst nicht aus", "Brandschutz", "hoch", 2), ("Rauchschalter verschmutzt", "Feststellanlage", "mittel", 14),
                 ("Prüfbuch fehlt", "Feststellanlage", "gering", 30)]},
    {"name": "RWA", "gewerk": "Brandschutz", "farbe": "Rot", "symbol": "RWA", "nr": "211",
     "wartung": 12, "grundlage": "DIN 18232-2, Herstellerangaben",
     "felder": "Art; Auswahl; Lichtkuppel, Fenster, Klappe, Ventilator\nAuslösung; Auswahl; Taster, Rauchmelder, BMA",
     "hersteller_typen": {"COLT": ["Colt Securex"]},
     "hersteller": ["Aumüller", "D+H", "SIMON RWA", "GEZE"],
     "typen": ["RWA-Zentrale", "RWA-Lichtkuppel", "RWA-Fenster", "Lüftertaster"],
     "maengel": [("Laufkarten fehlen", "RWA", "gering", 30), ("Auslösetaster defekt", "RWA", "hoch", 3),
                 ("Klappe öffnet nicht", "Brandschutz", "hoch", 3), ("Akku defekt", "RWA", "mittel", 14)]},
    {"name": "Flucht & Rettung", "gewerk": "Flucht und Rettung", "farbe": "Grün", "symbol": "E002", "nr": "207",
     "kontrolle": 12, "grundlage": "ASR A1.3, ASR A2.3, DIN ISO 23601",
     "felder": "Art; Auswahl; Rettungszeichen, Rettungszeichenleuchte, Flucht- und Rettungsplan, Sammelstelle",
     "hersteller": ["Allgemein"],
     "typen": ["Rettungszeichen nachleuchtend", "Rettungszeichenleuchte", "Flucht- und Rettungsplan", "Sammelstelle"],
     "maengel": [("Rettungszeichen fehlt", "Flucht & Rettung", "mittel", 14), ("Fluchtweg zugestellt", "Brandschutz", "hoch", 1),
                 ("Notausgang verschlossen", "Brandschutz", "hoch", 1), ("Rettungsplan veraltet", "Flucht & Rettung", "gering", 30)]},
    {"name": "Erste Hilfe", "gewerk": "Flucht und Rettung", "farbe": "Grün", "symbol": "E003", "nr": "208",
     "kontrolle": 12, "grundlage": "DGUV Vorschrift 1, Herstellerangaben",
     "felder": "Ablaufdatum; Datum",
     "hersteller": ["Söhngen", "Holthaus Medical", "Leina-Werke"],
     "typen": ["Verbandkasten DIN 13157", "Verbandkasten DIN 13169", "Erste-Hilfe-Schrank"],
     "maengel": [("Inhalt unvollständig", "Erste Hilfe", "mittel", 14), ("Ablaufdatum überschritten", "Erste Hilfe", "mittel", 14)]},
    {"name": "Defibrillator", "gewerk": "Flucht und Rettung", "farbe": "Grün", "symbol": "E010", "nr": "209",
     "pruefung": 24, "grundlage": "MPBetreibV, Herstellerangaben",
     "felder": "Elektroden bis; Datum\nAkku bis; Datum",
     "hersteller_typen": {"Philips": ["HeartStart FRx", "HeartStart HS1"], "ZOLL": ["AED Plus", "AED 3"],
                          "Stryker": ["LIFEPAK CR2"], "Schiller": ["FRED PA-1"]},
     "maengel": [("Selbsttest zeigt Fehler", "Defibrillator", "hoch", 2), ("Elektroden abgelaufen", "Defibrillator", "hoch", 7),
                 ("Akku leer oder abgelaufen", "Defibrillator", "hoch", 7)]},
    {"name": "Sicherheitsbeleuchtung", "gewerk": "Elektro", "farbe": "Grün", "symbol": "i:notlicht", "nr": "210",
     "pruefung": 12, "grundlage": "DIN EN 50172, DIN VDE 0100-560 (zusätzlich monatliche Funktionsprüfung)",
     "felder": "Art; Auswahl; Zentralbatterie, Einzelbatterie\nKreis / Nr.; Text",
     "hersteller": ["CEAG", "INOTEC", "RP-Technik"],
     "typen": ["Zentralbatterieanlage", "Rettungszeichenleuchte", "Sicherheitsleuchte", "Einzelbatterieleuchte"],
     "maengel": [("Leuchte defekt", "Sicherheitsbeleuchtung", "hoch", 3), ("Akku defekt", "Sicherheitsbeleuchtung", "mittel", 7),
                 ("Prüfbuch nicht geführt", "Sicherheitsbeleuchtung", "gering", 30)]},
    {"name": "Aufzug", "gewerk": "Aufzug", "farbe": "Blau", "symbol": "i:aufzug", "nr": "301",
     "pruefung": 24, "wartung": 3, "grundlage": "BetrSichV (Prüfung), Wartungsvertrag (Intervall prüfen)",
     "felder": "Tragfähigkeit (kg); Zahl\nHaltestellen; Zahl\nNotruf aufgeschaltet; Ja/Nein",
     "hersteller": ["Schindler", "Otis", "KONE", "TK Elevator", "Schmitt + Sohn"],
     "typen": ["Personenaufzug", "Lastenaufzug", "Fahrtreppe", "Fahrsteig"],
     "maengel": [("Aufzug außer Betrieb", "Aufzug", "hoch", 1), ("Notruf defekt", "Aufzug", "hoch", 1),
                 ("Türen schließen nicht richtig", "Aufzug", "mittel", 7)]},
    {"name": "Heizung", "gewerk": "Heizung", "farbe": "Blau", "symbol": "i:heizung", "nr": "302",
     "wartung": 12, "grundlage": "Herstellerangaben",
     "felder": "Leistung (kW); Zahl\nBrennstoff; Auswahl; Gas, Öl, Fernwärme, Strom, Pellets",
     "hersteller": ["Viessmann", "Buderus", "Vaillant", "Wolf GmbH", "Weishaupt", "Brötje"],
     "typen": ["Gas-Brennwertkessel", "Öl-Brennwertkessel", "Wärmepumpe", "Fernwärmestation", "Pelletkessel", "BHKW"],
     "maengel": [("Anlage auf Störung", "Heizung", "hoch", 1), ("Undicht", "Heizung", "mittel", 7), ("Raum zu kalt", "Heizung", "mittel", 3)]},
    {"name": "Klima", "gewerk": "Lüftung/Klima", "farbe": "Blau", "symbol": "i:klima", "nr": "303",
     "wartung": 12, "grundlage": "Herstellerangaben, F-Gase-Verordnung",
     "felder": "Kältemittel; Text\nFüllmenge (kg); Zahl",
     "hersteller": ["Daikin", "Mitsubishi Electric", "Panasonic", "Toshiba", "LG"],
     "typen": ["Split-Klimagerät", "Multisplit", "VRF-System"],
     "maengel": [("Kühlt nicht", "Klima", "mittel", 3), ("Kondensat tropft", "Klima", "mittel", 7)]},
    {"name": "Lüftung", "gewerk": "Lüftung/Klima", "farbe": "Blau", "symbol": "i:lueftung", "nr": "304",
     "wartung": 12, "grundlage": "VDMA 24186, VDI 6022 (Hygieneinspektion)",
     "felder": "Luftmenge (m³/h); Zahl\nFilterklasse; Text\nBefeuchtung; Ja/Nein",
     "hersteller": ["Wolf GmbH", "TROX", "Systemair", "Swegon", "Menerga"],
     "typen": ["Zentrales RLT-Gerät", "Abluftventilator", "Garagenabluft", "Brandschutzklappe"],
     "maengel": [("Filter verschmutzt", "Lüftung", "gering", 14), ("Laute Geräusche", "Lüftung", "mittel", 7),
                 ("Anlage läuft nicht", "Lüftung", "hoch", 2)]},
    {"name": "Kälte", "gewerk": "Kälte", "farbe": "Blau", "symbol": "i:kaelte", "nr": "305",
     "pruefung": 12, "grundlage": "F-Gase-Verordnung (Intervall je nach Füllmenge prüfen)",
     "felder": "Kältemittel; Text\nFüllmenge (kg); Zahl",
     "hersteller": ["Carrier", "Trane", "Daikin", "Johnson Controls"],
     "typen": ["Kaltwassersatz", "Rückkühler", "Kühlzelle"],
     "maengel": [("Kältemittelverlust", "Kälte", "hoch", 3), ("Temperatur zu hoch", "Kälte", "hoch", 1)]},
    {"name": "Sanitär", "gewerk": "Sanitär", "farbe": "Blau", "symbol": "i:sanitaer", "nr": "306",
     "wartung": 12, "grundlage": "Herstellerangaben, DIN EN 806-5",
     "felder": "Nennweite; Text",
     "hersteller": ["Grundfos", "Wilo", "KSB", "Kessel", "Jung Pumpen", "Grünbeck", "Judo", "Stiebel Eltron"],
     "typen": ["Hebeanlage", "Druckerhöhungsanlage", "Warmwasserspeicher", "Enthärtungsanlage", "Rückspülfilter",
               "Fettabscheider", "Durchlauferhitzer"],
     "maengel": [("Undicht", "Sanitär", "mittel", 3), ("Verstopft", "Sanitär", "mittel", 3), ("Kein warmes Wasser", "Sanitär", "mittel", 2)]},
    {"name": "Elektro", "gewerk": "Elektro", "farbe": "Gelb", "symbol": "i:elektro", "nr": "307",
     "pruefung": 48, "grundlage": "DGUV Vorschrift 3",
     "felder": "Spannung; Auswahl; 230 V, 400 V\nAbsicherung (A); Zahl",
     "hersteller": ["Hager", "ABB", "Siemens", "Schneider Electric", "Eaton"],
     "typen": ["Hauptverteilung", "Unterverteilung", "Zählerschrank", "Notstromaggregat", "USV"],
     "maengel": [("Abdeckung fehlt", "Elektro", "hoch", 3), ("Sicherung löst aus", "Elektro", "mittel", 3),
                 ("Beschriftung fehlt", "Elektro", "gering", 30)]},
    {"name": "Gebäudeautomation", "gewerk": "Gebäudeautomation", "farbe": "Blau", "symbol": "i:ga", "nr": "308",
     "wartung": 12, "grundlage": "Herstellerangaben, AMEV",
     "hersteller": ["Siemens", "Honeywell", "Kieback&Peter", "SAUTER", "Beckhoff", "WAGO"],
     "typen": ["DDC-Schaltschrank", "Raumbediengerät", "Leitstelle"],
     "maengel": [("Störmeldung", "Gebäudeautomation", "mittel", 3), ("Keine Verbindung", "Gebäudeautomation", "mittel", 3)]},
    {"name": "IT", "gewerk": "Sonstiges", "farbe": "Lila", "symbol": "i:it", "nr": "309",
     "hersteller": ["Rittal", "Cisco", "HPE Aruba", "Ubiquiti"],
     "typen": ["Serverschrank", "Netzwerkverteiler", "WLAN-Access-Point"],
     "maengel": [("Ausfall", "IT", "hoch", 1)]},
    {"name": "Fenster", "gewerk": "Dach/Fassade", "farbe": "Blau", "symbol": "i:fenster", "nr": "401",
     "wartung": 12, "grundlage": "Herstellerangaben",
     "hersteller": ["Schüco", "Reynaers", "Kömmerling", "VEKA", "Internorm", "VELUX"],
     "typen": ["Fenster", "Dachfenster", "Lichtkuppel", "Fassadenelement"],
     "maengel": [("Glas beschädigt", "Fenster", "mittel", 7), ("Lässt sich nicht schließen", "Fenster", "mittel", 3)]},
    {"name": "Tor", "gewerk": "Türen/Tore", "farbe": "Blau", "symbol": "i:tor", "nr": "402",
     "pruefung": 12, "grundlage": "ASR A1.7",
     "hersteller": ["Hörmann", "Novoferm", "Teckentrup", "Efaflex", "Butzbach"],
     "typen": ["Sektionaltor", "Rolltor", "Schnelllauftor", "Schranke", "Drehflügeltor"],
     "maengel": [("Tor schließt nicht", "Tor", "hoch", 2), ("Lichtschranke defekt", "Tor", "hoch", 2), ("Tor beschädigt", "Tor", "mittel", 7)]},
    {"name": "Sicherungstechnik", "gewerk": "Sicherheitstechnik", "farbe": "Grau", "symbol": "i:schloss", "nr": "403",
     "wartung": 12, "grundlage": "Herstellerangaben, DIN VDE 0833-3 (Einbruchmeldeanlagen)",
     "hersteller": ["dormakaba", "ABUS", "ASSA ABLOY", "Telenot", "Bosch"],
     "typen": ["Schließanlage", "Zutrittskontrolle", "Einbruchmeldezentrale", "Videokamera"],
     "maengel": [("Schloss defekt", "Sicherungstechnik", "mittel", 3), ("Kamera ohne Bild", "Sicherungstechnik", "mittel", 3)]},
    {"name": "Dach", "gewerk": "Dach/Fassade", "farbe": "Petrol", "symbol": "i:dach", "nr": "404",
     "kontrolle": 12, "grundlage": "Herstellerangaben, DIN EN 795 (Anschlagpunkte)",
     "hersteller": ["Allgemein"],
     "typen": ["Dachfläche", "Dachentwässerung", "Anschlagpunkt", "Lichtband"],
     "maengel": [("Undicht", "Dach", "hoch", 3), ("Entwässerung verstopft", "Dach", "mittel", 7)]},
    {"name": "Außenanlagen", "gewerk": "Außenanlagen", "farbe": "Grün", "symbol": "i:baum", "nr": "501",
     "hersteller": ["Allgemein"],
     "typen": ["Baum", "Grünfläche", "Zaun", "Außenbeleuchtung", "Parkplatz"],
     "maengel": [("Stolperstelle", "Außenanlagen", "mittel", 7), ("Beleuchtung defekt", "Außenanlagen", "mittel", 7)]},
    {"name": "Spielgeräte", "gewerk": "Außenanlagen", "farbe": "Grün", "symbol": "i:spiel", "nr": "502",
     "pruefung": 12, "grundlage": "DIN EN 1176-7 (Hauptinspektion jährlich, dazu laufende Sichtkontrollen)",
     "hersteller": ["Kompan", "HAGS", "Berliner Seilfabrik", "eibe"],
     "typen": ["Schaukel", "Rutsche", "Klettergerüst", "Sandkasten"],
     "maengel": [("Verletzungsgefahr", "Spielgeräte", "hoch", 1), ("Fallschutz mangelhaft", "Spielgeräte", "mittel", 7)]},
    {"name": "Regale", "gewerk": "Sonstiges", "farbe": "Grün", "symbol": "i:regal", "nr": "503",
     "pruefung": 12, "grundlage": "DIN EN 15635",
     "hersteller": ["SSI Schäfer", "Jungheinrich", "META"],
     "typen": ["Palettenregal", "Fachbodenregal", "Kragarmregal"],
     "maengel": [("Anfahrschaden", "Regale", "hoch", 3), ("Belastungsschild fehlt", "Regale", "gering", 30)]},
    {"name": "Solar", "gewerk": "Elektro", "farbe": "Blau", "symbol": "i:solar", "nr": "504",
     "pruefung": 48, "grundlage": "DGUV Vorschrift 3, Herstellerangaben",
     "hersteller": ["SMA", "Fronius", "Huawei"],
     "typen": ["PV-Anlage", "Wechselrichter", "Batteriespeicher"],
     "maengel": [("Wechselrichter auf Störung", "Solar", "mittel", 7)]},
    {"name": "Gefahrstoffe", "gewerk": "Sonstiges", "farbe": "Orange", "symbol": "i:gefahr", "nr": "505",
     "pruefung": 12, "grundlage": "DIN EN 14470-1, Herstellerangaben",
     "hersteller": ["asecos", "DÜPERTHAL"],
     "typen": ["Gefahrstoffschrank", "Gefahrstofflager", "Auffangwanne"],
     "maengel": [("Schrank schließt nicht selbsttätig", "Gefahrstoffe", "hoch", 3), ("Kennzeichnung fehlt", "Gefahrstoffe", "mittel", 14)]},
    # --- Reihen, die mit der Inventarnummer nach Objekt-Kürzel dazugekommen sind (Stand 2026-11) ---
    {"name": "Brandschutzklappe", "gewerk": "Brandschutz", "farbe": "Rot", "symbol": "i:lueftung", "nr": "213", "neu": True,
     "pruefung": 12, "grundlage": "Zulassung und Herstellerangaben (Intervall prüfen)",
     "felder": "Art; Auswahl; Brandschutzklappe, Entrauchungsklappe, Brandschutzventil\nNennweite; Text\nAuslösung; Auswahl; Schmelzlot, Motor, Federrücklauf",
     "hersteller": ["TROX", "Wildeboer", "SCHAKO", "Strulik", "Systemair"],
     "typen": ["Brandschutzklappe", "Entrauchungsklappe", "Brandschutzventil"],
     "maengel": [("Klappe schließt nicht", "Brandschutz", "hoch", 3), ("Klappe nicht zugänglich", "Brandschutzklappe", "mittel", 14),
                 ("Auslöseeinrichtung defekt", "Brandschutz", "hoch", 3), ("Kennzeichnung fehlt", "Brandschutzklappe", "gering", 30)]},
    {"name": "Löschanlage", "gewerk": "Brandschutz", "farbe": "Rot", "symbol": "i:sanitaer", "nr": "214", "neu": True,
     "wartung": 12, "grundlage": "Herstellerangaben, Prüfverordnung des Landes (Intervall prüfen)",
     "felder": "Art; Auswahl; Sprinkleranlage nass, Sprinkleranlage trocken, Gaslöschanlage, Druckerhöhung Löschwasser, Einspeisung\nSchutzbereich; Text",
     "hersteller": ["Minimax", "Total Walther", "Calanbau"],
     "typen": ["Sprinkleranlage", "Sprinklerzentrale", "Gaslöschanlage", "Druckerhöhungsanlage Löschwasser", "Einspeisung Feuerwehr"],
     "maengel": [("Anlagendruck außerhalb des Sollbereichs", "Brandschutz", "hoch", 1), ("Sprinkler abgedeckt oder zugestellt", "Brandschutz", "hoch", 3),
                 ("Störmeldung an der Zentrale", "Löschanlage", "hoch", 1), ("Betriebsbuch nicht geführt", "Löschanlage", "gering", 30)]},
    {"name": "Brandschutztor", "gewerk": "Türen/Tore", "farbe": "Rot", "symbol": "i:tor", "nr": "215", "neu": True,
     "pruefung": 12, "grundlage": "Zulassung und Herstellerangaben, ASR A1.7",
     "felder": "Feuerwiderstand; Auswahl; T30, T60, T90, EI2 30, EI2 60, EI2 90\nFeststellanlage; Ja/Nein\nBreite (mm); Zahl\nHöhe (mm); Zahl",
     "hersteller": ["Hörmann", "Novoferm", "Teckentrup", "Effertz"],
     "typen": ["Feuerschutz-Schiebetor", "Feuerschutz-Rolltor", "Feuerschutz-Sektionaltor", "Feuerschutzvorhang"],
     "maengel": [("Tor schließt nicht selbsttätig", "Brandschutz", "hoch", 3), ("Schließbereich zugestellt", "Brandschutz", "hoch", 1),
                 ("Feststellanlage defekt", "Brandschutztor", "hoch", 3), ("Torprüfung fällig", "Brandschutztor", "gering", 30)]},
    {"name": "Gaswarnanlage", "gewerk": "Brandschutz", "farbe": "Rot", "symbol": "i:melder", "nr": "216", "neu": True,
     "wartung": 12, "grundlage": "Herstellerangaben (Intervall prüfen)",
     "felder": "Art; Auswahl; CO-Warnanlage, Gaswarnanlage\nGas; Text\nAnzahl Sensoren; Zahl",
     "hersteller": ["Dräger", "MSR-Electronic", "Honeywell"],
     "typen": ["CO-Warnanlage", "Gaswarnanlage", "Gassensor"],
     "maengel": [("Sensor löst nicht aus", "Brandschutz", "hoch", 1), ("Störmeldung an der Zentrale", "Gaswarnanlage", "hoch", 1),
                 ("Kalibrierung fällig", "Gaswarnanlage", "mittel", 14)]},
    {"name": "Blitzschutz", "gewerk": "Elektro", "farbe": "Gelb", "symbol": "i:elektro", "nr": "310", "neu": True,
     "grundlage": "DIN EN 62305-3 (Prüfintervall je nach Schutzklasse)",
     "felder": "Schutzklasse; Auswahl; I, II, III, IV\nArt; Auswahl; Äußerer Blitzschutz, Innerer Blitzschutz",
     "hersteller": ["Allgemein", "DEHN", "OBO Bettermann"],
     "typen": ["Äußerer Blitzschutz", "Überspannungsschutz", "Potentialausgleich"],
     "maengel": [("Fangleitung beschädigt", "Blitzschutz", "mittel", 14), ("Erdungsanschluss korrodiert", "Blitzschutz", "mittel", 14),
                 ("Prüfung fällig", "Blitzschutz", "gering", 30)]},
    {"name": "Tür ohne Brandschutz", "gewerk": "Türen/Tore", "farbe": "Blau", "symbol": "i:tuer", "nr": "405", "neu": True,
     "pruefung": 12, "grundlage": "ASR A1.7 bei kraftbetätigten Türen, Herstellerangaben",
     "felder": "Art; Auswahl; Eingangstür, Innentür, Automatische Schiebetür, Drehflügeltür, Karusselltür\nAntrieb; Ja/Nein\nFluchtwegtür; Ja/Nein",
     "hersteller": ["GEZE", "dormakaba", "record"],
     "typen": ["Automatische Schiebetür", "Drehflügelantrieb", "Karusselltür", "Eingangstür", "Innentür"],
     "maengel": [("Tür schließt nicht", "Tür", "mittel", 7), ("Antrieb ohne Funktion", "Tür", "mittel", 3),
                 ("Sensor oder Lichtschranke defekt", "Tür", "hoch", 2), ("Türprüfung fällig", "Tür", "gering", 30)]},
]

ALLGEMEINE_MAENGEL = [
    ("Beschädigt", "Allgemein", "mittel", 14), ("Funktioniert nicht", "Allgemein", "hoch", 3),
    ("Verschmutzt", "Allgemein", "gering", 30), ("Fehlt", "Allgemein", "mittel", 14),
    ("Prüfung oder Wartung fällig", "Allgemein", "gering", 30), ("Kennzeichnung fehlt", "Allgemein", "gering", 30),
]


def _kategorie_anlegen(con, einfuegen, k: dict) -> int:
    kid = einfuegen(con, "kat_kategorien", {
        "name": k["name"], "gewerk": k["gewerk"], "farbe": k["farbe"], "symbol": k["symbol"],
        "nummernkreis": k["nr"], "pruefung_monate": k.get("pruefung"), "wartung_monate": k.get("wartung"),
        "kontrolle_monate": k.get("kontrolle"), "grundlage": k.get("grundlage"), "zusatzfelder": k.get("felder")})
    alle = dict(k.get("hersteller_typen", {}))
    for h in k.get("hersteller", []):
        alle.setdefault(h, list(k.get("typen", [])))
    for hersteller, typen in alle.items():
        gid = einfuegen(con, "kat_gruppen", {"kategorie_id": kid, "name": hersteller})
        for t in typen:
            einfuegen(con, "kat_typen", {"gruppe_id": gid, "kategorie_id": kid, "name": t})
    for text, bereich, gef, tage in k.get("maengel", []):
        einfuegen(con, "kat_maengel", {"kategorie_id": kid, "text": text, "bereich": bereich,
                                       "gefaehrdung": gef, "frist_tage": tage})
    return kid


def katalog_ergaenzen(con, einfuegen) -> list:
    """Bestehender Katalog: Die neuen Reihen einmal nachtragen. Was es dem Namen oder der Reihe nach schon gibt, bleibt
    unberührt. Die Kategorie „Tür“ (Reihe 204) heißt jetzt „Brandschutztür“, weil Türen ohne Brandschutz eine eigene
    Reihe bekommen. Liefert die Namen der neu angelegten Kategorien."""
    if not con.execute("SELECT COUNT(*) FROM kat_kategorien").fetchone()[0]:
        return []
    namen = {str(r[0] or "").strip().lower() for r in con.execute("SELECT name FROM kat_kategorien")}
    reihen = {str(r[0] or "").strip() for r in con.execute("SELECT nummernkreis FROM kat_kategorien")}
    if "brandschutztür" not in namen:
        con.execute("UPDATE kat_kategorien SET name='Brandschutztür' WHERE name='Tür' AND TRIM(COALESCE(nummernkreis,''))='204'")
    neu = []
    for k in KATEGORIEN:
        if k.get("neu") and k["name"].lower() not in namen and k["nr"] not in reihen:
            _kategorie_anlegen(con, einfuegen, k)
            neu.append(k["name"])
    return neu


def katalog_anlegen(con, einfuegen) -> None:
    """Legt den Grundbestand an, wenn der Katalog leer ist."""
    if con.execute("SELECT COUNT(*) FROM kat_kategorien").fetchone()[0]:
        return
    for k in KATEGORIEN:
        _kategorie_anlegen(con, einfuegen, k)
    for text, bereich, gef, tage in ALLGEMEINE_MAENGEL:
        einfuegen(con, "kat_maengel", {"kategorie_id": None, "text": text, "bereich": bereich,
                                       "gefaehrdung": gef, "frist_tage": tage})
