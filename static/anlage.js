/* Casa CAFM – Anlagenseite (Akte hinter jedem Symbol) und Wartungsplan */
"use strict";

const MONATE = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

/* ---------- Vorschläge für den Wartungsplan ----------
   Nur Vorschläge zum Prüfen. Intervalle und Grundlagen bitte mit Vertrag, Herstellerangaben
   und Gefährdungsbeurteilung abgleichen. */
const VORSCHLAEGE = [
  { wenn: (a, c, n) => c === "F001" || /feuerlösch/.test(n), aufgaben: [
    { titel: "Prüfung Feuerlöscher", art: "Prüfung", iv: 24, grund: "ASR A2.2, DIN 14406-4", t: ["Zugänglichkeit und Kennzeichnung prüfen", "Sichtprüfung Behälter, Schlauch und Plombe", "Prüfung durch Sachkundigen", "Prüfplakette erneuern"] }] },
  { wenn: (a, c, n) => c === "F002" || /wandhydrant/.test(n), aufgaben: [
    { titel: "Instandhaltung Wandhydrant", art: "Prüfung", iv: 12, grund: "DIN 14462", t: ["Schrank, Schlauch und Strahlrohr prüfen", "Druck- und Durchflussprüfung", "Prüfnachweis anbringen"] }] },
  { wenn: (a, c, n) => c === "BMZ" || c === "F005" || /brandmelde|handfeuermelder/.test(n), aufgaben: [
    { titel: "Inspektion Brandmeldeanlage", art: "Inspektion", iv: 3, grund: "DIN 14675, DIN VDE 0833-1", t: ["Zentrale und Störungsanzeigen prüfen", "Teilprüfung Melder laut Plan", "Betriebsbuch führen"] },
    { titel: "Wartung Brandmeldeanlage", art: "Wartung", iv: 12, grund: "DIN 14675, DIN VDE 0833-1", t: ["Alle Melder prüfen", "Akkus und Notstrom prüfen", "Übertragung zur Feuerwehr testen"] }] },
  { wenn: (a, c, n) => c === "RWA" || /rwa|rauchabzug/.test(n), aufgaben: [
    { titel: "Wartung RWA-Anlage", art: "Wartung", iv: 12, grund: "DIN 18232-2, Herstellervorgabe", t: ["Auslösung testen", "Antriebe und Klappen prüfen", "Notstromversorgung prüfen"] }] },
  { wenn: (a, c, n) => /brandschutztür|feststell/.test(n), aufgaben: [
    { titel: "Prüfung Brandschutztür", art: "Prüfung", iv: 12, grund: "DIN 14677 (Feststellanlagen), Herstellervorgabe", t: ["Selbstschließung prüfen", "Feststellanlage auslösen", "Dichtungen und Beschläge prüfen"] }] },
  { wenn: (a, c, n) => a.gewerk === "Aufzug" || /aufzug/.test(n), aufgaben: [
    { titel: "Hauptprüfung Aufzug (ZÜS)", art: "Prüfung", iv: 24, grund: "BetrSichV", t: ["Termin mit Prüfstelle abstimmen", "Prüfbericht ablegen", "Mängel beheben lassen"] },
    { titel: "Zwischenprüfung Aufzug (ZÜS)", art: "Prüfung", iv: 24, versatz: 12, grund: "BetrSichV", t: ["Termin mit Prüfstelle abstimmen", "Prüfbericht ablegen"] },
    { titel: "Wartung Aufzug", art: "Wartung", iv: 3, grund: "Herstellervorgabe, Wartungsvertrag (Intervall prüfen)", t: ["Wartung laut Vertrag", "Notruf testen"] }] },
  { wenn: (a, c, n) => c === "E010" || /defibrillator|aed/.test(n), aufgaben: [
    { titel: "Sicherheitstechnische Kontrolle Defibrillator", art: "Prüfung", iv: 24, grund: "MPBetreibV, Herstellervorgabe", t: ["Selbsttest-Anzeige prüfen", "Elektroden und Akku Ablaufdatum prüfen", "Kontrolle durch Hersteller oder Fachfirma"] }] },
  { wenn: (a, c, n) => c === "E003" || /erste.hilfe|verbandkasten/.test(n), aufgaben: [
    { titel: "Kontrolle Erste-Hilfe-Material", art: "Inspektion", iv: 12, grund: "DGUV Vorschrift 1, Herstellerangaben", t: ["Vollständigkeit prüfen", "Ablaufdaten prüfen", "Verbrauchtes ersetzen"] }] },
  { wenn: (a, c, n) => /sicherheitsbeleuchtung|notleuchte/.test(n), aufgaben: [
    { titel: "Prüfung Sicherheitsbeleuchtung", art: "Prüfung", iv: 12, grund: "DIN EN 50172 (zusätzlich monatliche Funktionsprüfung)", t: ["Betriebsdauertest", "Leuchten und Piktogramme prüfen", "Prüfbuch führen"] }] },
  { wenn: (a) => a.gewerk === "Elektro", aufgaben: [
    { titel: "Prüfung elektrische Anlage (ortsfest)", art: "Prüfung", iv: 48, grund: "DGUV Vorschrift 3", t: ["Sichtprüfung", "Messungen", "Prüfprotokoll ablegen"] }] },
  { wenn: (a) => a.gewerk === "Lüftung/Klima", aufgaben: [
    { titel: "Wartung RLT-Anlage", art: "Wartung", iv: 12, grund: "VDMA 24186, Herstellervorgabe", t: ["Filter prüfen und wechseln", "Riemen, Lager und Klappen prüfen", "Regelung prüfen"] },
    { titel: "Hygieneinspektion RLT", art: "Inspektion", iv: 36, grund: "VDI 6022 (mit Befeuchtung 24 Monate)", t: ["Hygieneinspektion durch geschultes Personal", "Bericht ablegen"] }] },
  { wenn: (a) => a.gewerk === "Kälte", aufgaben: [
    { titel: "Dichtheitskontrolle Kälteanlage", art: "Prüfung", iv: 12, grund: "F-Gase-Verordnung (Intervall je nach Füllmenge prüfen)", t: ["Dichtheit prüfen", "Logbuch führen"] }] },
  { wenn: (a) => a.gewerk === "Heizung", aufgaben: [
    { titel: "Wartung Heizungsanlage", art: "Wartung", iv: 12, grund: "Herstellervorgabe", t: ["Brenner und Kessel warten", "Abgaswerte messen", "Sicherheitseinrichtungen prüfen"] }] },
  { wenn: (a, c, n) => /hebeanlage/.test(n), aufgaben: [
    { titel: "Wartung Hebeanlage", art: "Wartung", iv: 6, grund: "DIN EN 12056-4 (gewerblich vierteljährlich)", t: ["Pumpe und Schaltung prüfen", "Rückstauklappe prüfen"] }] },
  { wenn: () => true, aufgaben: [
    { titel: "Wartung", art: "Wartung", iv: 12, grund: "Herstellervorgabe (Intervall prüfen)", t: ["Wartung laut Herstellerangaben"] }] },
];
const vorschlagFuer = (a) => {
  const kat = typeof katVon === "function" ? katVon(a.kategorie_id) : null;
  if (kat && (kat.pruefung_monate || kat.wartung_monate || kat.kontrolle_monate)) {
    const aufg = [];
    if (kat.pruefung_monate) aufg.push({ titel: `Prüfung ${kat.name}`, art: "Prüfung", iv: kat.pruefung_monate, grund: kat.grundlage || "bitte eintragen", t: ["Prüfung durchführen", "Prüfnachweis anbringen", "Prüfbericht ablegen"] });
    if (kat.wartung_monate) aufg.push({ titel: `Wartung ${kat.name}`, art: "Wartung", iv: kat.wartung_monate, grund: kat.grundlage || "Herstellerangaben", t: ["Wartung laut Herstellerangaben", "Verschleißteile prüfen", "Protokoll ablegen"] });
    if (kat.kontrolle_monate) aufg.push({ titel: `Kontrolle ${kat.name}`, art: "Inspektion", iv: kat.kontrolle_monate, grund: kat.grundlage || "Herstellerangaben", t: ["Sichtkontrolle", "Funktionskontrolle"] });
    return aufg;
  }
  return VORSCHLAEGE.find((v) => v.wenn(a, zeichenCode(a.planzeichen), (a.bezeichnung || "").toLowerCase())).aufgaben;
};

/* ---------- kleine Bausteine ---------- */
const plusMonate = (iso, m) => {
  const [j, mo, t] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(j, mo - 1 + m, 1));
  const letzter = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(t, letzter));
  return d.toISOString().slice(0, 10);
};
const terminStatus = (iso) => { const t = tageBis(iso); return t < 0 ? "ueber" : t <= 30 ? "bald" : "geplant"; };

function monatsZellen(aufgabe) {
  return MONATE.map((_, i) => {
    const mm = String(i + 1).padStart(2, "0");
    const erl = (aufgabe.erledigt || []).filter((h) => h.datum.slice(5, 7) === mm);
    const ter = (aufgabe.termine || []).filter((d) => d.slice(5, 7) === mm);
    const teile = erl.map((h) => `<span class="mz m-erl ${h.ergebnis === "Mängel offen" ? "mangel" : ""}" title="Erledigt am ${datum(h.datum)}: ${esc(h.ergebnis)}">✓</span>`)
      .concat(ter.map((d) => `<span class="mz m-${terminStatus(d)}" title="Fällig am ${datum(d)}">${terminStatus(d) === "ueber" ? "!" : "●"}</span>`));
    return `<td class="mzelle">${teile.join("")}</td>`;
  }).join("");
}

async function feldBearbeiten(ressource, z, name) {
  const f = S.schema[ressource].felder.find((x) => x.name === name);
  await refsLaden(ressource);
  const innen = `<div class="dfehler"></div><form class="formular" style="grid-template-columns:1fr" onsubmit="return false">
    ${f.typ === "bool" ? `<label class="check">${eingabe(f, z[name])} ${esc(f.label)}</label>` : `<label><span class="${f.pflicht ? "pflicht" : ""}">${esc(f.label)}</span>${eingabe(f, z[name])}</label>`}</form>`;
  const erg = await dialog(f.label, innen, [{ text: "Abbrechen" }, {
    text: "Speichern", klasse: "haupt-k", aktion: async (hg) => {
      const el = hg.querySelector(`[name="${name}"]`);
      const wert = f.typ === "bool" ? (el.checked ? 1 : 0) : (el.value === "" ? null : el.value);
      return api("PUT", `${ressource}/${z.id}`, { [name]: wert });
    },
  }]);
  if (erg) { cacheLeeren(); melde("Gespeichert."); }
  return erg;
}

async function fotosHochladen(a) {
  const input = document.createElement("input");
  input.type = "file"; input.accept = "image/*"; input.multiple = true; input.setAttribute("capture", "environment");
  const dateien = await new Promise((ok) => { input.onchange = () => ok([...input.files]); input.click(); });
  if (!dateien.length) return false;
  let n = 0;
  for (const d of dateien) {
    try {
      const url = URL.createObjectURL(d);
      const img = await new Promise((ok, nein) => { const i = new Image(); i.onload = () => ok(i); i.onerror = nein; i.src = url; });
      const f = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * f); c.height = Math.round(img.naturalHeight * f);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      const daten = c.toDataURL("image/jpeg", 0.85).split(",")[1];
      await api("POST", "dokumente", { titel: d.name.replace(/\.[^.]+$/, ""), kategorie: "Foto", objekt_id: a.objekt_id, anlage_id: a.id, dateiname: d.name.replace(/\.[^.]+$/, "") + ".jpg", inhalt: daten });
      n++;
    } catch (e) { melde(`${d.name} ließ sich nicht hochladen.`, true); }
  }
  if (n) melde(n === 1 ? "Foto hinzugefügt." : `${n} Fotos hinzugefügt.`);
  return n > 0;
}

function standortHolen() {
  return new Promise((ok, nein) => {
    if (!navigator.geolocation) return nein(new Error("Dieses Gerät gibt keinen Standort heraus."));
    navigator.geolocation.getCurrentPosition((p) => ok({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => nein(new Error("Der Standort ist nicht freigegeben. Bitte im Browser erlauben.")), { enableHighAccuracy: true, timeout: 15000 });
  });
}

async function erledigtMelden(w, anlage) {
  const liste = (w.taetigkeiten || "").split("\n").map((x) => x.trim()).filter(Boolean);
  const gps = anlage && anlage.gps_pflicht;
  const p = dialog(`Erledigt: ${w.titel}`, `<div class="dfehler"></div><form class="formular" onsubmit="return false">
    <label><span class="pflicht">Erledigt am</span><input type="date" name="datum" value="${heute()}" required></label>
    <label><span>Ergebnis</span><select name="ergebnis"><option>Ohne Mängel</option><option>Mängel behoben</option><option>Mängel offen</option><option>Nicht durchgeführt</option></select></label>
    ${liste.length ? `<div class="breit checkliste"><div class="klein">Checkliste</div>${liste.map((t, i) => `<label class="check"><input type="checkbox" data-c="${i}" checked> ${esc(t)}</label>`).join("")}</div>` : ""}
    <label class="breit"><span>Bemerkung</span><textarea name="bemerkung"></textarea></label>
    <label class="check breit"><input type="checkbox" name="ticket_anlegen" checked> Bei offenen Mängeln gleich eine Störmeldung anlegen</label>
    <label class="check breit"><input type="checkbox" name="gps" ${gps ? "checked disabled" : ""}> Standort (GPS) mitspeichern${gps ? " <b>(Pflicht für diese Anlage)</b>" : ""}</label>
    <p class="klein breit">Die nächste Fälligkeit rechnet das Programm aus dem Intervall (${zahl(w.intervall_monate)} Monate) neu aus.</p></form>`,
    [{ text: "Abbrechen" }, {
      text: "Speichern", klasse: "haupt-k", aktion: async (hg) => {
        const fm = hg.querySelector("form");
        const d = { datum: fm.datum.value, ergebnis: fm.ergebnis.value, bemerkung: fm.bemerkung.value, ticket_anlegen: fm.ticket_anlegen.checked };
        if (liste.length) d.checkliste = liste.map((t, i) => ({ text: t, ok: fm.querySelector(`[data-c="${i}"]`).checked }));
        if (fm.gps.checked) Object.assign(d, await standortHolen());
        const r = await api("POST", `wartungen/${w.id}/erledigt`, d);
        melde(r.ticket_id ? "Erledigt gemeldet und Störmeldung angelegt." : "Erledigt gemeldet.");
        return r;
      },
    }]);
  const erg = await p;
  if (erg) cacheLeeren();
  return erg;
}

async function vorschlagUebernehmen(a, vorhandene) {
  const liste = vorschlagFuer(a);
  const schon = new Set(vorhandene.map((w) => w.titel));
  const html = `<div class="dfehler"></div><p>Vorschlag für <b>${esc(a.bezeichnung)}</b>. Haken setzen, Intervall und Datum bei Bedarf anpassen.</p>
    <div class="vorschlaege">${liste.map((v, i) => `<div class="vs ${schon.has(v.titel) ? "da" : ""}">
      <label class="check"><input type="checkbox" data-v="${i}" ${schon.has(v.titel) ? "" : "checked"}> <b>${esc(v.titel)}</b> <span class="marke m-geplant">${esc(v.art)}</span>${schon.has(v.titel) ? ' <span class="klein">schon im Plan</span>' : ""}</label>
      <div class="vs-felder"><label>Intervall (Monate)<input type="number" min="1" data-iv="${i}" value="${v.iv}"></label>
      <label>Erste Fälligkeit<input type="date" data-d="${i}" value="${plusMonate(heute(), v.versatz || 1)}"></label></div>
      <div class="klein">Grundlage: ${esc(v.grund)} · ${v.t.length} Tätigkeiten</div></div>`).join("")}</div>
    <p class="klein">Das sind Vorschläge. Bitte Intervalle mit Wartungsvertrag, Herstellerangaben und Gefährdungsbeurteilung abgleichen.</p>`;
  const erg = await dialog("Wartungsplan vorschlagen", html, [{ text: "Abbrechen" }, {
    text: "Übernehmen", klasse: "haupt-k", aktion: async (hg) => {
      let n = 0;
      for (const [i, v] of liste.entries()) {
        if (!hg.querySelector(`[data-v="${i}"]`).checked) continue;
        await api("POST", "wartungen", {
          objekt_id: a.objekt_id, anlage_id: a.id, titel: v.titel, art: v.art, rechtsgrundlage: v.grund,
          intervall_monate: hg.querySelector(`[data-iv="${i}"]`).value, naechste: hg.querySelector(`[data-d="${i}"]`).value,
          taetigkeiten: v.t.join("\n"), dienstleister_id: a.dienstleister_id || null, aktiv: 1,
        });
        n++;
      }
      if (!n) throw new Error("Bitte mindestens eine Aufgabe ankreuzen.");
      melde(n === 1 ? "Aufgabe übernommen." : `${n} Aufgaben übernommen.`);
      return n;
    },
  }]);
  if (erg) cacheLeeren();
  return erg;
}

/* ---------- Anlagenseite ---------- */
const AKT_TEXT = {
  angelegt: () => "hat die Anlage erstellt", "geändert": (e) => `hat ${feldNamen(e.info)} geändert`, "auf Plan gesetzt": () => "hat die Anlage auf den Plan gesetzt",
  "vom Plan genommen": () => "hat die Anlage vom Plan genommen", foto: (e) => `hat ein Foto hinzugefügt (${esc(e.info)})`,
  dokument: (e) => `hat das Dokument <a href="#/dokumente/${e.id}">${esc(e.info)}</a> hinzugefügt`,
  meldung: (e) => `hat die Störmeldung <a href="#/tickets/${e.id}">${esc(e.info)}</a> angelegt`,
  aufgabe: (e) => `hat die Wartungsaufgabe <a href="#/wartungen/${e.id}">${esc(e.info)}</a> angelegt`,
  erledigt: (e) => `hat <a href="#/wartungen/${e.id}">${esc(e.info)}</a> erledigt: ${esc(e.ergebnis)}${e.gps ? " (mit Standort)" : ""}`,
};
function feldNamen(info) {
  const felder = Object.fromEntries(S.schema.anlagen.felder.map((f) => [f.name, f.label]));
  return (info || "").split(", ").filter(Boolean).map((n) => `<b>${esc(felder[n] || n)}</b>`).join(", ") || "Angaben";
}
const zeitText = (iso) => iso ? `${datum(iso)} ${iso.slice(11, 16) === "12:00" && iso.endsWith("12:00:00") ? "" : iso.slice(11, 16)}` : "";

const KATALOG_FELDER = ["kategorie_id", "gruppe_id", "typ_id"];
const ZEILEN = ["kategorie_id", "gruppe_id", "typ_id", "nummer", "zulassung", "status", "objekt_id", "gruppe", "gewerk", "standort", "hersteller", "typ", "seriennummer", "herstellungsdatum",
  "inbetriebnahme", "baujahr", "garantie_bis", "planzeichen", "symbol_id"];
const PERSONEN = ["manager", "beauftragter", "dienstleister_id"];
const SCHALTER = ["gps_pflicht", "pruefung_pflicht", "wartung_pflicht"];

DETAIL.anlagen = async (el, id, q) => {
  await Promise.all([refsLaden("anlagen"), lade("symbole"), katLaden()]);
  const [a, fotos, akt, tickets, plan] = await Promise.all([
    api("GET", `anlagen/${id}`), api("GET", `dokumente?anlage_id=${id}&kategorie=Foto`), api("GET", `anlagen/${id}/aktivitaet`),
    api("GET", `tickets?anlage_id=${id}&offen=1`), api("GET", `wartungsplan?jahr=${new Date().getFullYear()}&anlage_id=${id}`)]);
  const wart = await api("GET", `wartungen?anlage_id=${id}`);
  const aendern = darf("anlagen_bearbeiten");
  const plusErlaubt = ["tickets_anlegen", "dokumente_hochladen", "wartung_planen"].some(darf);
  const felder = Object.fromEntries(S.schema.anlagen.felder.map((f) => [f.name, f]));
  const naechste = wart.filter((w) => w.aktiv && w.naechste).map((w) => w.naechste).sort()[0];
  const hatPruefung = wart.some((w) => w.aktiv && w.art === "Prüfung"), hatWartung = wart.some((w) => w.aktiv && w.art === "Wartung");
  const zeile = (n) => {
    const f = felder[n];
    let wert = a[n];
    let anzeigeWert = wert == null || wert === "" ? "" : n === "status" ? zustandMarke(wert) : n === "planzeichen" ? `${zeichenSvg(zeichenCode(wert), 22)} ${esc(wert)}` :
      n === "symbol_id" ? `${eigenesSymbol(wert, 22)} ${esc(refText("symbole", wert))}` : zelle("anlagen", f, a);
    return `<button class="fz" data-feld="${n}" ${aendern ? "" : "disabled"}><span class="fz-l">${esc(f.label.replace(" (statt Planzeichen)", "").replace(" (Arbeitsbereich)", ""))}</span>
      <span class="fz-w">${anzeigeWert || (aendern ? '<span class="fz-neu">+ Hinzufügen</span>' : '<span class="klein">–</span>')}</span>${aendern ? '<span class="fz-p">›</span>' : ""}</button>`;
  };
  const titelbild = fotos.length ? "" : `<div class="galerie-leer">${symbolVon(a, 72)}<span>${darf("dokumente_hochladen") ? "Noch kein Foto. Tippe auf +, um eins hinzuzufügen." : "Noch kein Foto."}</span></div>`;

  el.innerHTML = `<a class="zurueck" href="#/objekte/${a.objekt_id}">← ${esc(refText("objekte", a.objekt_id))}</a>
  <div class="akte">
    <div class="akte-kopf karte">
      <div class="galerie-rahmen">
        ${fotos.length ? `<div class="galerie" id="gal">${fotos.map((f) => `<a href="/api/dokumente/${f.id}/datei" target="_blank" rel="noopener" class="gal-bild"><img src="/api/dokumente/${f.id}/datei" alt="${esc(f.titel)}" loading="lazy"></a>`).join("")}</div>
          ${fotos.length > 1 ? `<div class="gal-punkte" id="galp">${fotos.map((_, i) => `<span class="${i ? "" : "an"}"></span>`).join("")}</div>` : ""}` : titelbild}
        <div class="gal-symbol">${symbolVon(a, 40)}</div>
        ${plusErlaubt ? `<button class="rund-plus" id="aplus" aria-label="Hinzufügen">${icon("plus")}</button>
          <div class="plus-menue" id="pmenue" hidden>
            ${darf("tickets_anlegen") ? '<button data-m="mangel">Mangel melden</button>' : ""}${darf("dokumente_hochladen") ? '<button data-m="foto">Foto hinzufügen</button>' : ""}
            ${darf("tickets_anlegen") ? '<button data-m="meldung">Störmeldung (ausführlich)</button>' : ""}
            ${darf("wartung_planen") ? '<button data-m="aufgabe">Wartungsaufgabe anlegen</button><button data-m="vorschlag">Wartungsplan vorschlagen</button>' : ""}
            ${darf("dokumente_hochladen") ? '<button data-m="dok">Dokument hochladen</button>' : ""}
          </div>` : ""}
      </div>
      <div class="akte-titel">
        ${a.nummer || a.kategorie_id ? `<div class="kicker">${esc([a.nummer, refText("kat_kategorien", a.kategorie_id), refText("kat_gruppen", a.gruppe_id), refText("kat_typen", a.typ_id)].filter((x) => x && !x.startsWith("#")).join(" · "))}</div>` : ""}
        <h1 ${aendern ? 'data-feld="bezeichnung" class="editierbar"' : ""}>${esc(a.bezeichnung)}</h1>
        <p class="beschreibung ${a.beschreibung ? "" : "leer-text"} ${aendern ? "editierbar" : ""}" data-feld="beschreibung">${a.beschreibung ? esc(a.beschreibung) : aendern ? "Beschreibung eingeben …" : ""}</p>
        <div class="marken">${zustandMarke(a.status)} ${a.pruefung_pflicht ? '<span class="marke m-neu">Prüfpflichtig</span>' : ""} ${a.wartung_pflicht ? '<span class="marke m-neu">Wartungspflichtig</span>' : ""}
          ${tickets.length ? `<span class="marke m-ueber">${tickets.length} Störmeldung${tickets.length > 1 ? "en" : ""} offen</span>` : ""}
          ${naechste ? `<span class="marke m-geplant">Nächster Termin ${datum(naechste)}</span> ${faelligMarke(naechste)}` : '<span class="marke m-bald">kein Wartungsplan</span>'}</div>
        ${aendern && !a.nummer ? '<button class="knopf klein" data-feld="nummer">+ Anlagennummer</button>' : ""}
      </div>
    </div>
    ${(a.pruefung_pflicht && !hatPruefung) || (a.wartung_pflicht && !hatWartung) ? `<div class="warnung">Für diese Anlage ist eine gesetzlich autorisierte ${a.pruefung_pflicht && !hatPruefung ? "Prüfung" : "Wartung"} vorgeschrieben, im Wartungsplan steht aber keine. ${darf("wartung_planen") ? '<button class="knopf klein" id="wvor">Wartungsplan vorschlagen</button>' : ""}</div>` : ""}
    <div class="akte-raster">
      <div>
        <div class="feldliste karte">${ZEILEN.map(zeile).join("")}</div>
        ${zusatzfelder(katVon(a.kategorie_id)).length ? `<div class="feldliste karte"><div class="fl-kopf">Detailinfo ${esc(katVon(a.kategorie_id).name)}</div>${zusatzfelder(katVon(a.kategorie_id)).map((f) => {
          const v = detailsVon(a)[f.name];
          return `<button class="fz" data-details ${aendern ? "" : "disabled"}><span class="fz-l">${esc(f.name)}</span><span class="fz-w">${detailWert(f, v) || (aendern ? '<span class="fz-neu">+ Hinzufügen</span>' : '<span class="klein">–</span>')}</span>${aendern ? '<span class="fz-p">›</span>' : ""}</button>`;
        }).join("")}</div>` : ""}
        <div class="feldliste karte">${PERSONEN.map(zeile).join("")}</div>
        <div class="feldliste karte">${SCHALTER.map((n) => `<label class="schalter-zeile"><span>${esc(felder[n].label)}</span>
          <input type="checkbox" class="schalter" data-schalter="${n}" ${a[n] ? "checked" : ""} ${aendern ? "" : "disabled"}></label>`).join("")}</div>
      </div>
      <div>
        <div class="karte" id="qrk"></div>
        <div class="abstand"></div>
        <div class="karte"><h3>${a.plan_id ? "Im Plan: " + esc(refText("plaene", a.plan_id)) : "Plan"}</h3>${a.plan_id ? planAusschnitt(a) : '<div id="aufplan"><p class="klein">Noch nicht auf einem Plan.</p></div>'}</div>
        <div class="abstand"></div>
        <div class="karte"><div class="akt-kopf"><h3>Aktivität</h3><span class="klein">${akt.length} Aktivitäten</span><button class="knopf klein" id="aktsort">↑ Älteste zuerst</button></div>
          <div class="timeline" id="tl"></div></div>
      </div>
    </div>
    <div id="r"></div>
  </div>`;

  qrKarte(el.querySelector("#qrk"), a);
  if (q.get("mangel") === "1" && darf("tickets_anlegen")) {
    history.replaceState(null, "", `#/anlagen/${a.id}`);
    setTimeout(() => mangelDialog(a), 50);
  }

  /* Aktivität */
  let neuesteZuerst = true;
  const tl = () => {
    const liste = neuesteZuerst ? akt : [...akt].reverse();
    el.querySelector("#tl").innerHTML = liste.length ? liste.map((e) => `<div class="tl-e"><div class="tl-p"></div><div class="tl-k"><b>${zeitText(e.zeit)}</b><span class="klein">${e.typ === "anlage" ? "Anlage" : e.typ === "ticket" ? "Meldung" : e.typ === "wartung" ? "Wartung" : "Dokument"}</span></div>
      <div class="tl-t"><b>${esc(e.wer || "Jemand")}</b> ${(AKT_TEXT[e.art] || (() => esc(e.art)))(e)}</div></div>`).join("") : '<p class="klein">Noch keine Aktivität.</p>';
    el.querySelector("#aktsort").textContent = neuesteZuerst ? "↑ Älteste zuerst" : "↓ Neueste zuerst";
  };
  tl();
  el.querySelector("#aktsort").onclick = () => { neuesteZuerst = !neuesteZuerst; tl(); };

  /* Galerie-Punkte */
  const gal = el.querySelector("#gal"), galp = el.querySelector("#galp");
  if (gal && galp) gal.addEventListener("scroll", () => {
    const i = Math.round(gal.scrollLeft / gal.clientWidth);
    galp.querySelectorAll("span").forEach((s, k) => s.classList.toggle("an", k === i));
  });

  /* Bearbeiten */
  el.querySelectorAll("[data-feld]").forEach((b) => b.addEventListener("click", async (e) => {
    if (!aendern) return;
    e.preventDefault();
    if (KATALOG_FELDER.includes(b.dataset.feld)) { if (await katalogZuordnen(a)) route(); return; }
    if (await feldBearbeiten("anlagen", a, b.dataset.feld)) route();
  }));
  el.querySelectorAll("[data-details]").forEach((b) => b.addEventListener("click", async () => { if (aendern && await detailsBearbeiten(a)) route(); }));
  el.querySelectorAll("[data-schalter]").forEach((c) => c.addEventListener("change", async () => {
    try { await api("PUT", `anlagen/${id}`, { [c.dataset.schalter]: c.checked ? 1 : 0 }); melde("Gespeichert."); cacheLeeren(); route(); }
    catch (err) { melde(err.message, true); c.checked = !c.checked; }
  }));

  /* Plus-Menü */
  const plus = el.querySelector("#aplus"), menue = el.querySelector("#pmenue");
  const neueAufgabe = () => bearbeiten("wartungen", null, { objekt_id: a.objekt_id, anlage_id: a.id, dienstleister_id: a.dienstleister_id, naechste: plusMonate(heute(), 1), intervall_monate: 12, art: "Wartung" });
  const aktion = async (m) => {
    if (m === "mangel") await mangelDialog(a);
    if (m === "foto" && await fotosHochladen(a)) route();
    if (m === "meldung") { const t = await bearbeiten("tickets", null, { objekt_id: a.objekt_id, anlage_id: a.id, gewerk: a.gewerk, dienstleister_id: a.dienstleister_id }); if (t) location.hash = `#/tickets/${t.id}`; }
    if (m === "aufgabe" && await neueAufgabe()) route();
    if (m === "vorschlag" && await vorschlagUebernehmen(a, wart)) route();
    if (m === "dok" && await hochladen({ objekt_id: a.objekt_id, anlage_id: a.id })) route();
  };
  if (plus) {
    plus.onclick = (e) => { e.stopPropagation(); menue.hidden = !menue.hidden; };
    menue.onclick = (e) => { const b = e.target.closest("[data-m]"); if (b) { menue.hidden = true; aktion(b.dataset.m); } };
    document.addEventListener("click", () => { if (menue) menue.hidden = true; }, { once: true });
  }
  const wv = el.querySelector("#wvor");
  if (wv) wv.onclick = () => aktion("vorschlag");

  /* Auf Plan setzen */
  const ap = el.querySelector("#aufplan");
  if (ap && darf("plaene_bearbeiten")) {
    const pl = await api("GET", `plaene?objekt_id=${a.objekt_id}`);
    ap.innerHTML += pl.length ? `<div class="werkzeug" style="margin:0"><select id="apsel">${pl.map((p) => `<option value="${p.id}">${esc([p.titel, p.etage].filter(Boolean).join(" · "))}</option>`).join("")}</select><button class="knopf haupt-k" id="apgo">Auf Plan setzen</button></div>`
      : '<button class="knopf" id="apneu">Grundriss hochladen</button>';
    const go = el.querySelector("#apgo");
    if (go) go.onclick = () => { location.hash = `#/plaene/${el.querySelector("#apsel").value}?platzieren=${a.id}`; };
    const nu = el.querySelector("#apneu");
    if (nu) nu.onclick = async () => { const e = await planHochladen({ objekt_id: a.objekt_id }); if (e) location.hash = `#/plaene/${e.id}?platzieren=${a.id}`; };
  }

  /* Reiter */
  const f = { anlage_id: String(id) };
  reiterLeiste(el.querySelector("#r"), [
    { titel: "Meldungen", zahl: tickets.length, zeigen: (x) => tabelle(x, "tickets", { filter: f, extraFilter: ticketFilter, extraStart: "", neuAktion: () => bearbeiten("tickets", null, { objekt_id: a.objekt_id, anlage_id: a.id, gewerk: a.gewerk, dienstleister_id: a.dienstleister_id }) }) },
    { titel: "Wartungsplan", zahl: wart.length, zeigen: (x) => anlagenWartungsplan(x, a, wart, plan) },
    { titel: "Dokumente", zeigen: dokumenteReiter(f) },
  ], Number(q.get("reiter") || 0));
};

function anlagenWartungsplan(ziel, a, wart, plan) {
  const aendern = darf("wartung_planen");
  const proId = Object.fromEntries(plan.aufgaben.map((p) => [p.id, p]));
  ziel.innerHTML = `<div class="werkzeug">${aendern ? `<button class="knopf haupt-k" data-wneu>${icon("plus")} Wartungsaufgabe</button><button class="knopf" data-wvor>Wartungsplan vorschlagen</button>` : ""}
    <a class="knopf" href="#/wartungen?anlage=${a.id}">In der Gesamtübersicht zeigen</a><span class="anzahl">${wart.length} Aufgaben</span></div>
    ${wart.length ? `<div class="tabelle-wrap"><table class="jplan"><thead><tr><th>Aufgabe</th><th>Art</th><th class="zahl">Intervall</th><th>Grundlage</th>${MONATE.map((m) => `<th class="mzelle">${m}</th>`).join("")}<th>Nächste</th><th></th></tr></thead>
    <tbody>${wart.map((w) => `<tr class="klickbar" data-w="${w.id}"><td><b>${esc(w.titel)}</b>${w.taetigkeiten ? `<br><span class="klein">${w.taetigkeiten.split("\n").filter(Boolean).length} Tätigkeiten</span>` : ""}</td>
      <td>${esc(w.art)}</td><td class="zahl">${zahl(w.intervall_monate)} M.</td><td class="klein">${esc(w.rechtsgrundlage || "")}</td>
      ${proId[w.id] ? monatsZellen(proId[w.id]) : MONATE.map(() => '<td class="mzelle"></td>').join("")}
      <td>${datum(w.naechste)} ${faelligMarke(w.naechste, w.aktiv)}</td>
      <td>${darf("wartung_erledigen") && w.aktiv ? `<button class="knopf klein" data-erl="${w.id}">Erledigt</button>` : ""}</td></tr>`).join("")}</tbody></table></div>
      <div class="legende plan-legende"><span style="--c:var(--ok)">✓ erledigt</span><span style="--c:var(--hellgrau)">● geplant</span><span style="--c:var(--bald)">bald fällig</span><span style="--c:var(--ueber)">überfällig</span></div>`
    : `<div class="karte leer">Für diese Anlage gibt es noch keinen Wartungsplan.${aendern ? " Lass dir einen Vorschlag machen oder leg eine Aufgabe an." : ""}</div>`}`;
  ziel.onclick = async (e) => {
    const erl = e.target.closest("[data-erl]");
    if (erl) { e.stopPropagation(); if (await erledigtMelden(wart.find((w) => w.id === Number(erl.dataset.erl)), a)) route(); return; }
    if (e.target.closest("[data-wneu]")) { if (await bearbeiten("wartungen", null, { objekt_id: a.objekt_id, anlage_id: a.id, dienstleister_id: a.dienstleister_id, naechste: plusMonate(heute(), 1), intervall_monate: 12, art: "Wartung" })) route(); return; }
    if (e.target.closest("[data-wvor]")) { if (await vorschlagUebernehmen(a, wart)) route(); return; }
    const tr = e.target.closest("tr[data-w]");
    if (tr) location.hash = `#/wartungen/${tr.dataset.w}`;
  };
}

/* ---------- Wartungsaufgabe ---------- */
DETAIL.wartungen = async (el, id) => {
  await Promise.all([refsLaden("wartungen"), lade("symbole")]);
  const [w, hist] = await Promise.all([api("GET", `wartungen/${id}`), api("GET", `wartungen/${id}/historie`)]);
  const a = w.anlage_id ? await api("GET", `anlagen/${w.anlage_id}`) : null;
  const plan = await api("GET", `wartungsplan?jahr=${new Date().getFullYear()}&anlage_id=${w.anlage_id || ""}`);
  const p = plan.aufgaben.find((x) => x.id === w.id);
  const liste = (w.taetigkeiten || "").split("\n").map((x) => x.trim()).filter(Boolean);
  el.innerHTML = seitenkopf(w.titel, `${w.art} · ${refText("objekte", w.objekt_id)}`,
    `${darf("wartung_erledigen") ? '<button class="knopf haupt-k" id="erl">Als erledigt melden</button>' : ""}${darf("wartung_planen") ? '<button class="knopf" id="bearb">Bearbeiten</button>' : ""}`,
    a ? [`#/anlagen/${a.id}?reiter=1`, a.bezeichnung] : ["#/wartungen", "Wartungsplan"]) + `
    <div class="raster k4">
      <div class="karte kennzahl ${tageBis(w.naechste) < 0 ? "rot" : tageBis(w.naechste) <= 30 ? "gelb" : ""}"><div class="wert">${datum(w.naechste)}</div><div class="text">nächste Fälligkeit ${faelligMarke(w.naechste, w.aktiv)}</div></div>
      <div class="karte kennzahl"><div class="wert">${w.intervall_monate ? zahl(w.intervall_monate) : "–"}</div><div class="text">Monate Intervall</div></div>
      <div class="karte kennzahl"><div class="wert">${datum(w.letzte) || "–"}</div><div class="text">zuletzt erledigt</div></div>
      ${a ? `<a class="karte kennzahl anlage-kachel" href="#/anlagen/${a.id}">${symbolVon(a, 40)}<div class="text"><b>${esc(a.bezeichnung)}</b><br>${esc(a.nummer || a.standort || "")}</div></a>` : ""}
    </div><div class="abstand"></div>
    ${p ? `<div class="tabelle-wrap"><table class="jplan"><thead><tr><th>${new Date().getFullYear()}</th>${MONATE.map((m) => `<th class="mzelle">${m}</th>`).join("")}</tr></thead><tbody><tr><td>Termine</td>${monatsZellen(p)}</tr></tbody></table></div><div class="abstand"></div>` : ""}
    <div class="raster k2">
      <div class="karte">${stammdaten("wartungen", w, ["titel", "naechste", "letzte", "intervall_monate", "taetigkeiten"])}</div>
      <div class="karte"><h3>Tätigkeiten</h3>${liste.length ? `<ul class="checkliste-anz">${liste.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : '<p class="klein">Keine Tätigkeiten hinterlegt. Unter „Bearbeiten“ lässt sich eine Checkliste eintragen, eine Tätigkeit je Zeile.</p>'}</div>
    </div><div class="abstand"></div>
    <div class="karte"><h3>Verlauf</h3>${hist.length ? `<div class="tabelle-wrap" style="box-shadow:none"><table><thead><tr><th>Datum</th><th>Ergebnis</th><th>Checkliste</th><th>Bemerkung</th><th>Erfasst von</th></tr></thead><tbody>${hist.map((h) => {
      let cl = [];
      try { cl = h.checkliste ? JSON.parse(h.checkliste) : []; } catch (e) { cl = []; }
      return `<tr><td>${datum(h.datum)}</td><td><span class="marke ${h.ergebnis === "Ohne Mängel" || h.ergebnis === "Mängel behoben" ? "m-ok" : h.ergebnis === "Mängel offen" ? "m-ueber" : "m-arbeit"}">${esc(h.ergebnis)}</span>${h.ticket_id ? ` <a href="#/tickets/${h.ticket_id}">Störmeldung</a>` : ""}</td>
        <td class="klein">${cl.length ? `${cl.filter((c) => c.ok).length} von ${cl.length} erledigt${cl.some((c) => !c.ok) ? `<br>Offen: ${cl.filter((c) => !c.ok).map((c) => esc(c.text)).join(", ")}` : ""}` : ""}</td>
        <td>${esc(h.bemerkung)}</td><td>${esc(h.erfasst_von)}${h.lat != null ? `<br><a class="klein" href="https://www.openstreetmap.org/?mlat=${Number(h.lat)}&mlon=${Number(h.lon)}#map=19/${Number(h.lat)}/${Number(h.lon)}" target="_blank" rel="noopener">Standort ansehen</a>` : ""}</td></tr>`;
    }).join("")}</tbody></table></div>` : '<p class="klein">Noch nichts erfasst.</p>'}</div>
    <div id="r"></div>`;
  const b = el.querySelector("#bearb");
  if (b) b.onclick = async () => { const e = await bearbeiten("wartungen", w); if (e === "geloescht") location.hash = a ? `#/anlagen/${a.id}?reiter=1` : "#/wartungen"; else if (e) route(); };
  const e = el.querySelector("#erl");
  if (e) e.onclick = async () => { if (await erledigtMelden(w, a)) route(); };
  reiterLeiste(el.querySelector("#r"), [{ titel: "Dokumente (Protokolle, Prüfberichte)", zeigen: dokumenteReiter({ objekt_id: String(w.objekt_id), ...(w.anlage_id ? { anlage_id: String(w.anlage_id) } : {}) }) }], 0);
};

/* ---------- Gesamtübersicht Wartungsplan ---------- */
SEITEN.wartungen = async (el, _, q) => {
  await Promise.all([lade("objekte"), lade("symbole"), lade("anlagen")]);
  const z = { jahr: Number(q.get("jahr")) || new Date().getFullYear(), objekt: q.get("objekt") || "", gewerk: "", art: "", pflicht: false, suche: "",
    ansicht: q.get("ansicht") || "jahr", anlage: q.get("anlage") || "", f: q.get("f") || "" };
  const gewerke = S.schema.anlagen.felder.find((f) => f.name === "gewerk").optionen;
  el.innerHTML = seitenkopf("Wartungsplan", "Alle Wartungen und Prüfungen", `
    <div class="umschalter"><button data-ans="jahr">Jahresplan</button><button data-ans="liste">Liste</button></div>`) + `
    <div class="werkzeug" id="wf">
      <span class="jahrwahl"><button class="knopf klein" data-j="-1" aria-label="Vorjahr">←</button><b id="jahr"></b><button class="knopf klein" data-j="1" aria-label="Nächstes Jahr">→</button></span>
      <select data-f="objekt"><option value="">Alle Objekte</option>${S.cache.objekte.map((o) => `<option value="${o.id}" ${String(o.id) === z.objekt ? "selected" : ""}>${esc(anzeige("objekte", o))}</option>`).join("")}</select>
      <select data-f="gewerk"><option value="">Alle Gewerke</option>${gewerke.map((g) => `<option>${esc(g)}</option>`).join("")}</select>
      <select data-f="art"><option value="">Alle Arten</option><option>Wartung</option><option>Prüfung</option><option>Inspektion</option><option>Begehung</option></select>
      <label class="check-k"><input type="checkbox" data-f="pflicht"> nur gesetzlich vorgeschrieben</label>
      <input type="search" data-f="suche" placeholder="Anlage oder Aufgabe suchen">
      ${darf("export") ? `<button class="knopf" id="wcsv">${icon("export")} Excel</button>` : ""}<button class="knopf" onclick="print()">Drucken</button>
    </div><div id="wk"></div><div id="wi"></div>`;
  const inhalt = el.querySelector("#wi"), kz = el.querySelector("#wk");
  let daten = null;
  const sichtbar = () => daten.aufgaben.filter((w) => {
    if (z.anlage && String(w.anlage_id) !== z.anlage) return false;
    if (z.f === "ueber" && !(tageBis(w.naechste) < 0)) return false;
    if (z.f === "30" && !(tageBis(w.naechste) <= 30)) return false;
    if (!z.suche) return true;
    return [w.titel, w.a_bez, w.a_nr, w.o_kuerzel, w.rechtsgrundlage].join(" ").toLowerCase().includes(z.suche);
  });
  const laden = async () => {
    const qs = new URLSearchParams({ jahr: z.jahr });
    if (z.objekt) qs.set("objekt_id", z.objekt);
    if (z.gewerk) qs.set("gewerk", z.gewerk);
    if (z.art) qs.set("art", z.art);
    if (z.pflicht) qs.set("pflicht", "1");
    daten = await api("GET", "wartungsplan?" + qs);
    zeichnen();
  };
  const zeichnen = () => {
    el.querySelector("#jahr").textContent = z.jahr;
    el.querySelectorAll("[data-ans]").forEach((b) => b.classList.toggle("an", b.dataset.ans === z.ansicht));
    el.querySelector(".jahrwahl").style.display = z.ansicht === "jahr" ? "" : "none";
    const liste = sichtbar();
    const termine = liste.reduce((s, w) => s + w.termine.length, 0), erl = liste.reduce((s, w) => s + w.erledigt.length, 0);
    const ueber = liste.filter((w) => tageBis(w.naechste) < 0).length;
    kz.innerHTML = `<div class="raster k4">
      <div class="karte kennzahl"><div class="wert">${liste.length}</div><div class="text">Aufgaben im Plan</div></div>
      <div class="karte kennzahl orange"><div class="wert">${termine}</div><div class="text">offene Termine ${z.jahr}</div></div>
      <div class="karte kennzahl ${erl ? "" : ""}" style="border-top-color:var(--ok)"><div class="wert">${erl}</div><div class="text">erledigt ${z.jahr}</div></div>
      <div class="karte kennzahl ${ueber ? "rot" : ""}"><div class="wert">${ueber}</div><div class="text">überfällig</div></div>
      <div class="karte kennzahl ${daten.ohne_plan.length ? "gelb" : ""}"><div class="wert">${daten.ohne_plan.length}</div><div class="text">Anlagen ohne Wartungsplan</div></div>
    </div><div class="abstand"></div>`;
    if (z.anlage) kz.innerHTML += `<div class="warnung">Gefiltert auf eine Anlage. <a href="#/wartungen">Alle zeigen</a></div>`;
    if (z.f) kz.innerHTML += `<div class="warnung">Gefiltert: ${z.f === "ueber" ? "überfällig" : "fällig in 30 Tagen"}. <a href="#/wartungen">Alle zeigen</a></div>`;
    if (z.ansicht === "liste") { inhalt.innerHTML = '<div id="wl"></div>'; tabelle(inhalt.querySelector("#wl"), "wartungen", { extraFilter: wartungFilter, extraStart: z.f, filter: z.anlage ? { anlage_id: z.anlage } : {} }); return; }
    let objekt = null;
    const reihen = liste.map((w) => {
      const kopf = w.objekt_id !== objekt ? `<tr class="gruppe"><td colspan="16">${esc(w.o_kuerzel || "")} · ${esc(w.o_name || "")}</td></tr>` : "";
      objekt = w.objekt_id;
      const a = { gewerk: w.a_gewerk, planzeichen: w.a_zeichen, symbol_id: w.a_symbol, kategorie_id: w.a_kat };
      return kopf + `<tr class="klickbar" data-w="${w.id}">
        <td class="anl">${w.anlage_id ? `<a href="#/anlagen/${w.anlage_id}" onclick="event.stopPropagation()">${symbolVon(a, 22)}<span>${w.a_nr ? `<span class="klein">${esc(w.a_nr)}</span><br>` : ""}${esc(w.a_bez || "")}</span></a>` : '<span class="klein">ohne Anlage</span>'}</td>
        <td><b>${esc(w.titel)}</b>${w.a_pp || w.a_wp ? ' <span class="marke m-neu" title="gesetzlich vorgeschrieben">§</span>' : ""}${w.rechtsgrundlage ? `<br><span class="klein">${esc(w.rechtsgrundlage)}</span>` : ""}</td>
        <td class="nowrap">${esc(w.art)}<br><span class="klein">alle ${zahl(w.intervall_monate)} Mon.</span></td>
        ${monatsZellen(w)}<td>${datum(w.naechste)}<br>${faelligMarke(w.naechste)}</td></tr>`;
    }).join("");
    inhalt.innerHTML = `${liste.length ? `<div class="tabelle-wrap"><table class="jplan gross"><thead><tr><th>Anlage</th><th>Aufgabe</th><th>Art</th>${MONATE.map((m) => `<th class="mzelle">${m}</th>`).join("")}<th>Nächste</th></tr></thead><tbody>${reihen}</tbody></table></div>
      <div class="legende plan-legende"><span style="--c:var(--ok)">✓ erledigt</span><span style="--c:var(--hellgrau)">● geplant</span><span style="--c:var(--bald)">● fällig in 30 Tagen</span><span style="--c:var(--ueber)">! überfällig</span><span style="--c:var(--orange)">§ gesetzlich vorgeschrieben</span></div>`
      : '<div class="karte leer">Keine Aufgaben für diese Auswahl.</div>'}
      ${daten.ohne_plan.length && !z.anlage ? `<div class="abstand"></div><div class="karte"><h3>Anlagen ohne Wartungsplan</h3><ul class="liste-einfach">${daten.ohne_plan.map((a) =>
        `<li>${symbolVon(a, 24)}<a href="#/anlagen/${a.id}?reiter=1"><b>${esc(a.bezeichnung)}</b><br><span class="klein">${esc([refText("objekte", a.objekt_id), a.gewerk, a.standort].filter(Boolean).join(" · "))}</span></a>
        ${darf("wartung_planen") ? `<span class="rechts"><button class="knopf klein" data-vor="${a.id}">Wartungsplan vorschlagen</button></span>` : ""}</li>`).join("")}</ul></div>` : ""}`;
  };
  inhalt.addEventListener("click", async (e) => {
    const v = e.target.closest("[data-vor]");
    if (v) { const a = daten.ohne_plan.find((x) => x.id === Number(v.dataset.vor)); if (await vorschlagUebernehmen(a, [])) laden(); return; }
    const tr = e.target.closest("tr[data-w]");
    if (tr && z.ansicht === "jahr") location.hash = `#/wartungen/${tr.dataset.w}`;
  });
  el.querySelector("#wf").addEventListener("change", (e) => {
    const k = e.target.dataset.f;
    if (!k || k === "suche") return;
    z[k] = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    laden();
  });
  let st;
  el.querySelector('[data-f="suche"]').addEventListener("input", (e) => { clearTimeout(st); st = setTimeout(() => { z.suche = e.target.value.trim().toLowerCase(); zeichnen(); }, 200); });
  el.querySelectorAll("[data-j]").forEach((b) => b.onclick = () => { z.jahr += Number(b.dataset.j); laden(); });
  el.querySelectorAll("[data-ans]").forEach((b) => b.onclick = () => { z.ansicht = b.dataset.ans; zeichnen(); });
  if (el.querySelector("#wcsv")) el.querySelector("#wcsv").onclick = () => {
    const kopf = ["Objekt", "Anlagennummer", "Anlage", "Aufgabe", "Art", "Intervall (Monate)", "Grundlage", ...MONATE.map((m) => `${m} ${z.jahr}`), "Nächste Fälligkeit", "Gesetzlich"];
    const zellen = (w) => MONATE.map((_, i) => {
      const mm = String(i + 1).padStart(2, "0");
      return [...w.erledigt.filter((h) => h.datum.slice(5, 7) === mm).map((h) => `erledigt ${datum(h.datum)}`), ...w.termine.filter((d) => d.slice(5, 7) === mm).map((d) => `fällig ${datum(d)}`)].join(", ");
    });
    const zeilen = sichtbar().map((w) => [`${w.o_kuerzel || ""} ${w.o_name || ""}`.trim(), w.a_nr || "", w.a_bez || "", w.titel, w.art, String(w.intervall_monate || "").replace(".", ","), w.rechtsgrundlage || "", ...zellen(w), datum(w.naechste), w.a_pp || w.a_wp ? "ja" : "nein"]);
    const csv = "﻿" + [kopf, ...zeilen].map((r) => r.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_Wartungsplan_${z.jahr}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  await laden();
};
