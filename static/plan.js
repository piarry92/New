/* Casa CAFM – Pläne: Grundriss hochladen, Anlagen per Ziehen platzieren */
"use strict";

const GEWERK_STIL = {
  "Aufzug": ["AZ", "#626366"], "Brandschutz": ["BS", "#C0392B"], "Elektro": ["EL", "#D19A00"],
  "Heizung": ["HZ", "#B8323F"], "Lüftung/Klima": ["LK", "#1E9BBB"], "Kälte": ["KÄ", "#2456A6"],
  "Sanitär": ["SA", "#3E9B3A"], "Sicherheitstechnik": ["ST", "#3C3C3B"], "Türen/Tore": ["TT", "#8D6E63"],
  "Dach/Fassade": ["DF", "#6D4C41"], "Außenanlagen": ["AA", "#558B2F"], "Reinigung": ["RE", "#939598"],
  "Gebäudeautomation": ["GA", "#6A4C93"], "Flucht und Rettung": ["FR", "#009A44"], "Sonstiges": ["SO", "#939598"],
};
const stil = (g) => GEWERK_STIL[g] || GEWERK_STIL.Sonstiges;

const VORLAGEN = [
  ["Brandschutz", [["Feuerlöscher", "F001 Feuerlöscher"], ["Wandhydrant", "F002 Löschschlauch (Wandhydrant)"], ["Handfeuermelder", "F005 Brandmelder (Handfeuermelder)"],
    ["Brandmeldetelefon", "F006 Brandmeldetelefon"], ["Feuerleiter", "F003 Feuerleiter"], ["Brandmeldezentrale", "BMZ Brandmeldezentrale"],
    ["Feuerwehr-Anzeigetableau", "FAT Feuerwehr-Anzeigetableau"], ["Feuerwehr-Bedienfeld", "FBF Feuerwehr-Bedienfeld"], ["Feuerwehr-Schlüsseldepot", "FSD Feuerwehr-Schlüsseldepot"],
    ["RWA-Anlage", "RWA Rauchabzug"], "Rauchmelder", "Brandschutztür", "Sprinklerzentrale"]],
  ["Flucht und Rettung", [["Notausgang links", "E001 Notausgang links"], ["Notausgang rechts", "E002 Notausgang rechts"], ["Erste-Hilfe-Kasten", "E003 Erste Hilfe"],
    ["Notruftelefon", "E004 Notruftelefon"], ["Defibrillator", "E010 Defibrillator (AED)"], ["Augenspüleinrichtung", "E011 Augenspüleinrichtung"], ["Sammelstelle", "E007 Sammelstelle"]]],
  ["Elektro", ["Hauptverteilung", "Unterverteilung", "Sicherheitsbeleuchtung", "Notstromaggregat", "Ladestation E-Auto"]],
  ["Heizung", ["Heizkessel", "Wärmepumpe", "Fernwärmeübergabe", "Heizkreisverteiler"]],
  ["Lüftung/Klima", ["Lüftungsgerät", "Split-Klimagerät", "Brandschutzklappe", "Abluftventilator"]],
  ["Kälte", ["Kältemaschine", "Rückkühler"]],
  ["Sanitär", ["Hebeanlage", "Warmwasserspeicher", "Enthärtungsanlage", "Fettabscheider", "Wasserzähler"]],
  ["Aufzug", ["Personenaufzug", "Lastenaufzug", "Fahrtreppe"]],
  ["Türen/Tore", ["Automatiktür", "Rolltor", "Schranke"]],
  ["Sicherheitstechnik", ["Zutrittskontrolle", "Videokamera", "Einbruchmeldezentrale"]],
  ["Gebäudeautomation", ["DDC-Schaltschrank", "Raumbediengerät"]],
  ["Sonstiges", ["Gerät"]],
];

/* Planzeichen, wenn vorhanden, sonst Kreis mit Gewerk-Kürzel */
function symbolFuer(gewerk, planzeichen, groesse = 26, symbolId = null, katId = null) {
  return quadratSymbol({ symbol_id: symbolId, planzeichen, kategorie_id: katId }, groesse) || symbol(gewerk);
}
/* Eckiges Zeichen (eigenes Symbol, Planzeichen oder Kategorie), sonst leer */
function quadratSymbol(a, groesse = 26) {
  return eigenesSymbol(a.symbol_id, groesse) || zeichenSvg(zeichenCode(a.planzeichen), groesse) || (typeof katSymbol === "function" ? katSymbol(katVon(a.kategorie_id), groesse) : "");
}
/* Eigenes Symbol (hochgeladenes Bild) */
function eigenesSymbol(id, groesse = 26) {
  if (!id) return "";
  const sym = (S.cache.symbole || []).find((x) => x.id === Number(id));
  const v = sym && sym.geaendert ? encodeURIComponent(sym.geaendert) : "";
  return `<img class="zeichen-svg eigen" src="/api/symbole/${Number(id)}/bild?v=${v}" width="${groesse}" height="${groesse}" alt="${esc(sym ? sym.name : "Symbol")}" draggable="false">`;
}
const symbolVon = (a, groesse = 26) => symbolFuer(a.gewerk, a.planzeichen, groesse, a.symbol_id, a.kategorie_id);

/* Bild in ein quadratisches PNG (256 px) umwandeln, SVG eingeschlossen */
async function symbolBildVorbereiten(datei) {
  if (!/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(datei.type)) throw new Error("Bitte ein Bild als PNG, JPG, WEBP oder SVG wählen.");
  if (datei.size > 10 * 1024 * 1024) throw new Error("Das Bild ist zu groß (höchstens 10 MB).");
  const url = URL.createObjectURL(datei);
  try {
    const img = await new Promise((ok, nein) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => nein(new Error("Das Bild lässt sich nicht öffnen.")); i.src = url; });
    const G = 256, c = document.createElement("canvas");
    c.width = c.height = G;
    const w = img.naturalWidth || G, h = img.naturalHeight || G, f = Math.min(G / w, G / h);
    c.getContext("2d").drawImage(img, (G - w * f) / 2, (G - h * f) / 2, w * f, h * f);
    return c.toDataURL("image/png");
  } finally { URL.revokeObjectURL(url); }
}

async function symbolDialog(sym = null, vorgabe = {}) {
  const felder = sym ? [] : S.schema.symbole.felder;
  const html = `<div class="dfehler"></div><form class="formular" onsubmit="return false">
    <label class="breit"><span class="pflicht">Bild (PNG, JPG, WEBP oder SVG)</span><input type="file" name="datei" accept="image/png,image/jpeg,image/webp,image/svg+xml" required></label>
    <div class="breit sym-vorschau"><div class="sv-bild" data-vorschau>${sym ? eigenesSymbol(sym.id, 96) : '<span class="klein">Vorschau</span>'}</div>
      <p class="klein">Das Bild wird quadratisch auf 256 Pixel gebracht. Am besten wirkt ein einfaches Bild mit wenig Rand, gern mit durchsichtigem Hintergrund.</p></div>
    ${felder.map((f) => `<label><span class="${f.pflicht ? "pflicht" : ""}">${esc(f.label)}</span>${eingabe(f, vorgabe[f.name])}</label>`).join("")}
  </form>`;
  let png = null;
  const p = dialog(sym ? `Bild für „${sym.name}“ ersetzen` : "Eigenes Symbol anlegen", html, [{ text: "Abbrechen" }, {
    text: "Speichern", klasse: "haupt-k", aktion: async (hg) => {
      if (!png) throw new Error("Bitte ein Bild auswählen.");
      const inhalt = png.split(",")[1];
      const erg = sym ? await api("PUT", `symbole/${sym.id}/bild`, { inhalt }) : await api("POST", "symbole", { ...formularDaten(hg, "symbole"), inhalt });
      melde(sym ? "Bild ersetzt." : "Symbol angelegt.");
      return erg;
    },
  }]);
  const hg = letzterDialog();
  hg.querySelector('[name="datei"]').addEventListener("change", async (e) => {
    const d = e.target.files[0];
    if (!d) return;
    try {
      png = await symbolBildVorbereiten(d);
      hg.querySelector("[data-vorschau]").innerHTML = `<img src="${png}" width="96" height="96" alt="">`;
      const n = hg.querySelector('[name="name"]');
      if (n && !n.value) n.value = d.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
      hg.querySelector(".dfehler").innerHTML = "";
    } catch (err) { png = null; hg.querySelector(".dfehler").innerHTML = `<div class="fehler">${esc(err.message)}</div>`; }
  });
  const erg = await p;
  if (erg) { delete S.cache.symbole; await lade("symbole"); }
  return erg;
}

function symbol(gewerk, extra = "") {
  const [k, c] = stil(gewerk);
  return `<span class="sym ${extra}" style="--c:${c}">${esc(k)}</span>`;
}

/* ---------- Bild vorbereiten (PNG/JPG direkt, PDF über pdf.js) ---------- */
let pdfjsLaden = null;
function pdfjs() {
  if (!pdfjsLaden) {
    pdfjsLaden = new Promise((ok, nein) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      s.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        ok(window.pdfjsLib);
      };
      s.onerror = () => { pdfjsLaden = null; nein(new Error("PDF kann gerade nicht gelesen werden. Bitte den Grundriss als PNG oder JPG speichern und hochladen.")); };
      document.head.appendChild(s);
    });
  }
  return pdfjsLaden;
}

async function grundrissVorbereiten(datei) {
  const istPdf = datei.type === "application/pdf" || /\.pdf$/i.test(datei.name);
  if (istPdf) {
    const lib = await pdfjs();
    const pdf = await lib.getDocument({ data: await datei.arrayBuffer() }).promise;
    const seite = await pdf.getPage(1);
    const v1 = seite.getViewport({ scale: 1 });
    const faktor = Math.min(4, 4000 / Math.max(v1.width, v1.height));
    const vp = seite.getViewport({ scale: faktor });
    const c = document.createElement("canvas");
    c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    await seite.render({ canvasContext: ctx, viewport: vp }).promise;
    let url = c.toDataURL("image/png");
    if (url.length > 30e6) url = c.toDataURL("image/jpeg", 0.88);
    return { inhalt: url.split(",")[1], breite: c.width, hoehe: c.height, dateiname: datei.name.replace(/\.pdf$/i, url.startsWith("data:image/png") ? ".png" : ".jpg"), seiten: pdf.numPages };
  }
  if (!/^image\/(png|jpeg|webp|gif)$/.test(datei.type)) throw new Error("Bitte den Grundriss als PNG, JPG oder PDF hochladen.");
  const url = await new Promise((ok, nein) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = nein; r.readAsDataURL(datei); });
  const groesse = await new Promise((ok, nein) => { const i = new Image(); i.onload = () => ok([i.naturalWidth, i.naturalHeight]); i.onerror = () => nein(new Error("Das Bild lässt sich nicht öffnen.")); i.src = url; });
  return { inhalt: url.split(",")[1], breite: groesse[0], hoehe: groesse[1], dateiname: datei.name };
}

async function planHochladen(vorgabe = {}, ersetzen = null) {
  await lade("objekte");
  const felder = ersetzen ? [] : S.schema.plaene.felder.filter((f) => !f.nurlesen);
  const html = `<div class="dfehler"></div><form class="formular" onsubmit="return false">
    <label class="breit"><span class="pflicht">Grundriss (PNG, JPG oder PDF)</span><input type="file" name="datei" accept="image/png,image/jpeg,image/webp,application/pdf" required></label>
    ${felder.map((f) => `<label class="${f.typ === "textarea" ? "breit" : ""}"><span class="${f.pflicht ? "pflicht" : ""}">${esc(f.label)}</span>${eingabe(f, vorgabe[f.name])}</label>`).join("")}
    <p class="klein breit">${ersetzen ? "Die gesetzten Anlagen bleiben an ihrer Stelle. Der neue Grundriss sollte denselben Ausschnitt zeigen." : "Bei einer PDF nimmt das Programm die erste Seite."}</p>
  </form>`;
  const p = dialog(ersetzen ? "Grundriss ersetzen" : "Grundriss hochladen", html, [{ text: "Abbrechen" }, {
    text: "Hochladen", klasse: "haupt-k", aktion: async (hg) => {
      const datei = hg.querySelector('[name="datei"]').files[0];
      if (!datei) throw new Error("Bitte eine Datei auswählen.");
      if (datei.size > 60 * 1024 * 1024) throw new Error("Die Datei ist zu groß.");
      const bild = await grundrissVorbereiten(datei);
      if (bild.inhalt.length > 25 * 1024 * 1024 * 1.37) throw new Error("Der Grundriss ist zu groß (höchstens 25 MB).");
      const erg = ersetzen
        ? await api("PUT", `plaene/${ersetzen}/bild`, bild)
        : await api("POST", "plaene", { ...formularDaten(hg, "plaene"), ...bild });
      melde(bild.seiten > 1 ? `Hochgeladen. Die PDF hat ${bild.seiten} Seiten, genommen wurde Seite 1.` : "Grundriss hochgeladen.");
      return erg;
    },
  }]);
  const hg = letzterDialog();
  formularVerdrahten(hg);
  hg.querySelector('[name="datei"]').addEventListener("change", (e) => {
    const t = hg.querySelector('[name="titel"]');
    if (t && !t.value && e.target.files[0]) t.value = e.target.files[0].name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
  });
  const erg = await p;
  if (erg) cacheLeeren();
  return erg;
}

/* ---------- Übersicht der Pläne ---------- */
function planKarten(plaene, mitObjekt = true) {
  if (!plaene.length) return '<div class="karte leer">Noch kein Grundriss. Lade oben den ersten hoch.</div>';
  return `<div class="plan-karten">${plaene.map((p) => `
    <a class="karte plan-karte" href="#/plaene/${p.id}">
      <div class="vorschau"><img src="/api/plaene/${p.id}/bild" alt="" loading="lazy"></div>
      <div class="pk-text"><b>${esc(p.titel)}</b><br><span class="klein">${esc([mitObjekt ? refText("objekte", p.objekt_id) : "", p.gebaeude, p.etage].filter(Boolean).join(" · "))}</span>
      <span class="pk-zahl">${p.anlagen_anzahl || 0} Anlagen</span></div>
    </a>`).join("")}</div>`;
}

async function planListe(ziel, filter = {}) {
  await lade("objekte");
  const zeichnen = async () => {
    const qs = new URLSearchParams(filter);
    const objektSel = ziel.querySelector("[data-pobj]");
    if (objektSel && objektSel.value) qs.set("objekt_id", objektSel.value);
    const plaene = await api("GET", "plaene?" + qs);
    ziel.querySelector("[data-pk]").innerHTML = planKarten(plaene, !filter.objekt_id);
  };
  ziel.innerHTML = `<div class="werkzeug">
    ${filter.objekt_id ? "" : `<select data-pobj><option value="">Alle Objekte</option>${(S.cache.objekte || []).map((o) => `<option value="${o.id}">${esc(anzeige("objekte", o))}</option>`).join("")}</select>`}
    ${darf("plaene_bearbeiten") ? `<button class="knopf haupt-k" data-pneu>${icon("plus")} Grundriss hochladen</button><button class="knopf" data-pimport>Mehrere importieren (ZIP)</button>` : ""}</div><div data-pk></div>`;
  const s = ziel.querySelector("[data-pobj]");
  if (s) s.onchange = zeichnen;
  const n = ziel.querySelector("[data-pneu]");
  if (n) n.onclick = async () => { const e = await planHochladen({ ...filter }); if (e) location.hash = `#/plaene/${e.id}`; };
  const im = ziel.querySelector("[data-pimport]");
  if (im) im.onclick = async () => { if (await plaeneImportieren(filter.objekt_id || (s && s.value) || "")) { cacheLeeren(); zeichnen(); } };
  await zeichnen();
}

async function plaeneImportieren(objektId) {
  await lade("objekte");
  const html = `<div class="dfehler"></div><form class="formular" onsubmit="return false">
    <label class="breit"><span class="pflicht">Objekt</span><select name="objekt_id"><option value="">Bitte wählen</option>${(S.cache.objekte || []).map((o) => `<option value="${o.id}" ${String(o.id) === String(objektId) ? "selected" : ""}>${esc(anzeige("objekte", o))}</option>`).join("")}</select></label>
    <label class="breit"><span class="pflicht">ZIP-Datei mit Grundrissen</span><input type="file" name="datei" accept=".zip,application/zip"></label>
    <label class="check breit"><input type="checkbox" name="ersetzen"> Alte Pläne ersetzen, wenn die ZIP-Datei das vorsieht (löscht Pläne)</label>
    <p class="klein breit">In der ZIP-Datei liegen die Grundrisse als PNG, JPG oder SVG. Gebäude und Etage kommen aus der Datei plaene.json oder aus dem Dateinamen, zum Beispiel „Finger 1__2. OG__Finger 1 2. OG.png“. Schon vorhandene Pläne werden übersprungen.</p>
    <p class="klein breit">Ersetzen: Manche ZIP-Dateien bringen neue Pläne mit, die alte ablösen. Nur mit dem Haken ziehen die gesetzten Anlagen auf den neuen Plan um und die alten Pläne werden gelöscht. Vorher zeigt das Programm, welche Pläne das sind, fragt nach und legt eine Sicherung der Daten an. Ohne Haken wird nichts gelöscht.</p></form>`;
  const erg = await dialog("Mehrere Grundrisse importieren", html, [{ text: "Abbrechen" }, {
    text: "Importieren", klasse: "haupt-k", aktion: async (hg) => {
      const fm = hg.querySelector("form"), datei = fm.datei.files[0];
      if (!fm.objekt_id.value) throw new Error("Bitte ein Objekt wählen.");
      if (!datei) throw new Error("Bitte die ZIP-Datei auswählen.");
      if (datei.size > 24 * 1024 * 1024) throw new Error("Die ZIP-Datei ist zu groß (höchstens 24 MB). Bitte in zwei Teilen importieren.");
      const inhalt = await new Promise((ok, nein) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1] || ""); r.onerror = nein; r.readAsDataURL(datei); });
      const auftrag = { objekt_id: Number(fm.objekt_id.value), inhalt, ersetzen: fm.ersetzen.checked };
      if (auftrag.ersetzen) {   // erst nachsehen, was gelöscht würde, und nachfragen
        const v = await api("POST", "plaene/import", { ...auftrag, pruefen: true });
        if (v.loeschen.length) {
          const namen = v.loeschen.slice(0, 8).join(", ") + (v.loeschen.length > 8 ? ` und ${v.loeschen.length - 8} weitere` : "");
          const frage = `Das löscht ${v.loeschen.length} ${v.loeschen.length === 1 ? "Plan" : "Pläne"} dieses Objekts:\n${namen}\n\n`
            + `${v.anlagen} gesetzte ${v.anlagen === 1 ? "Anlage zieht" : "Anlagen ziehen"} auf die neuen Pläne um. Die gelöschten Pläne lassen sich nicht zurückholen.\n\nWirklich ersetzen?`;
          if (!confirm(frage)) throw new Error("Nichts geändert. Ohne den Haken werden die neuen Pläne nur dazugelegt, es wird nichts gelöscht.");
        }
      }
      return api("POST", "plaene/import", auftrag);
    },
  }]);
  if (!erg || erg === true) return erg;
  const zeilen = [`${erg.angelegt} ${erg.angelegt === 1 ? "Grundriss" : "Grundrisse"} angelegt`];
  if (erg.uebersprungen.length) zeilen.push(`${erg.uebersprungen.length} schon vorhanden und übersprungen`);
  if (!erg.ersetzt) { melde(zeilen.join(", ") + "."); return erg; }
  zeilen.push(`${erg.ersetzt} alte ${erg.ersetzt === 1 ? "Plan" : "Pläne"} gelöscht`);
  zeilen.push(`${erg.umgezogen} ${erg.umgezogen === 1 ? "Anlage ist" : "Anlagen sind"} auf die neuen Pläne umgezogen`);
  if (erg.ohne_platz) zeilen.push(`${erg.ohne_platz} ${erg.ohne_platz === 1 ? "Anlage steht" : "Anlagen stehen"} jetzt unter „Noch nicht im Plan“`);
  await dialog("Pläne ersetzt", `<ul class="liste-einfach">${zeilen.map((z) => `<li>${esc(z)}</li>`).join("")}</ul>
    <p class="klein">Schau bei den umgezogenen Anlagen einmal nach, ob sie richtig sitzen. Die Sicherung von vorher liegt im Ordner daten › sicherung${erg.sicherung ? `: ${esc(erg.sicherung)}` : ""}.</p>`, [{ text: "Schließen", klasse: "haupt-k" }]);
  return erg;
}

SEITEN.plaene = async (el) => {
  el.innerHTML = seitenkopf("Pläne", "Grundrisse mit Anlagen") + '<div id="pl"></div>';
  await planListe(el.querySelector("#pl"));
};

/* ---------- Plan-Ansicht ---------- */
/* Was beim Wechsel von Plan zu Plan bleibt: Bearbeiten an, Vollbild an. Ob die Liste der Anlagen offen ist, merkt sich der Browser. */
const PLAN_MODUS = { bearbeiten: false, voll: false, liste: false };
try { PLAN_MODUS.liste = localStorage.getItem("cafm-plan-liste") === "1"; } catch (e) { /* egal */ }
let PLAN_AUFRAEUMEN = null;   // löst die Tasten und Ereignisse der vorigen Plan-Ansicht
/* Die Plan-Ansicht wird verlassen, ohne dass sich die Adresse ändert (etwa beim Wechsel des Objekts): Tasten lösen, Vollbild beenden */
function planVerlassen() {
  if (PLAN_AUFRAEUMEN) PLAN_AUFRAEUMEN();
  if (document.body.classList.contains("plan-vollbild")) {
    document.body.classList.remove("plan-vollbild");
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  }
  PLAN_MODUS.voll = false;
}

/* Plan-Ansicht: großer Plan, Etagenleiste am Plan (opt.navi), Werkzeuge auf dem Plan.
   Ansehen: Liste der Anlagen bei Bedarf. Bearbeiten: Symbolliste rechts, Symbole setzen, verschieben, vom Plan nehmen. */
async function planEditor(el, id, q, opt = {}) {
  await Promise.all([...["objekte", "plaene", "symbole"].map((r) => lade(r)), katLaden()]);
  let daten = await api("GET", `plaene/${id}/anlagen`);
  if (opt.aktuell && !opt.aktuell()) return;                  // inzwischen wurde ein anderer Plan gewählt
  if (PLAN_AUFRAEUMEN) PLAN_AUFRAEUMEN();
  const plan = daten.plan, navi = opt.navi || null, merk = opt.merk || null;
  const aendern = darf("plaene_bearbeiten");
  if (aendern && Number(q.get("platzieren"))) PLAN_MODUS.bearbeiten = true;   // aus „Einordnen“: gleich im Bearbeiten
  const bearb = () => aendern && PLAN_MODUS.bearbeiten;
  const ansicht = { s: 1, x: 0, y: 0, aus: new Set(), suche: "", modus: null, offen: null, passt: true };
  let bildNeu = false;                                         // nach „Grundriss ersetzen“ wird das neue Bild eingepasst
  const stift = '<svg class="icon" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
  const VOLL_AN = "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5", VOLL_AUS = "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5";

  el.innerHTML = seitenkopf(plan.titel, [refText("objekte", plan.objekt_id), plan.gebaeude, plan.etage].filter(Boolean).join(" · "), "", [`#/plaene?o=${plan.objekt_id}`, "Gebäude-Übersicht"]) + `
  <div class="plan-layout pv" id="playout">
    <section class="plan-bereich">
      <div class="plan-leiste">
        <div class="pv-geb" id="pgeb" hidden></div>
        <div class="ebenen" id="ebenen"></div>
        <label class="pv-such">${icon("suche")}<input type="search" id="psucheEtage" placeholder="Auf dieser Etage suchen" autocomplete="off" aria-label="Auf dieser Etage suchen"></label>
      </div>
      <div class="pv-band" id="pband" hidden></div>
      <div class="pv-plan">
        <nav class="pv-etagen" id="petagen" aria-label="Etage wählen" hidden></nav>
        <div class="buehne" id="buehne" tabindex="0">
          <div class="welt" id="welt"><img id="pbild" src="/api/plaene/${id}/bild" alt="Grundriss ${esc(plan.titel)}" draggable="false"><div id="marker"></div></div>
          <div class="modus" id="modus" hidden></div>
          <div class="popup" id="popup" hidden></div>
          <button class="pv-pille" id="plisteAuf" type="button" title="Liste der Anlagen auf dieser Etage zeigen">${icon("anlagen")} Anlagen <em id="pzahl"></em></button>
          <div class="pv-ecke">
            <button type="button" data-z="+" title="Vergrößern" aria-label="Vergrößern">+</button>
            <button type="button" data-z="-" title="Verkleinern" aria-label="Verkleinern">−</button>
            <button type="button" data-z="0" title="Ganzen Plan zeigen" aria-label="Ganzen Plan zeigen"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6"/><path d="M12 2.5v3.5M12 18v3.5M2.5 12H6M18 12h3.5"/></svg></button>
            <button type="button" id="pvoll" title="Vollbild (Taste F)" aria-label="Vollbild"><svg viewBox="0 0 24 24"><path d="${VOLL_AN}"/></svg></button>
          </div>
          <div class="pv-leg"><span style="--c:var(--ok)">in Ordnung</span><span style="--c:var(--bald)">bald fällig</span><span style="--c:var(--ueber)">überfällig oder Störung</span></div>
        </div>
      </div>
      <div class="legende plan-legende"><span style="--c:var(--ok)">in Ordnung</span><span style="--c:var(--bald)">bald fällig oder eingeschränkt</span><span style="--c:var(--ueber)">Störung, überfällig oder außer Betrieb</span></div>
    </section>
    <aside class="pv-dock" id="pdock">
      <div class="pv-liste" id="pliste">
        <div class="pv-lk"><h3>Auf dieser Etage</h3><small id="plzahl"></small><button class="x" id="plisteZu" type="button" title="Liste schließen" aria-label="Liste schließen">×</button></div>
        <label class="pv-such pv-such-l">${icon("suche")}<input type="search" id="psucheListe" placeholder="Auf dieser Etage suchen" autocomplete="off" aria-label="Auf dieser Etage suchen"></label>
        <div class="pv-ll" id="pll"></div><div id="plfuss"></div>
      </div>
      ${aendern ? `<div class="palette" id="palette">
        <input type="search" id="psuche" placeholder="Gerät oder Anlage suchen" autocomplete="off">
        <div class="hinweis">Zieh ein Symbol auf den Grundriss. Oder tippe es an und dann auf die Stelle im Plan. Katalog: Kategorie, Hersteller, Bezeichnung.</div>
        <div id="pfrei"></div>
        <h3>Neu einfügen</h3><div id="peigen"></div><div id="pkatalog"></div>
      </div>` : ""}
    </aside>
  </div>`;

  const buehne = el.querySelector("#buehne"), welt = el.querySelector("#welt"), bild = el.querySelector("#pbild");
  const markerEbene = el.querySelector("#marker"), popup = el.querySelector("#popup"), modusEl = el.querySelector("#modus");
  const layout = el.querySelector("#playout"), titelzeile = el.querySelector(".titelzeile"), akt = titelzeile.querySelector(".aktionen"), palette = el.querySelector("#palette");
  akt.insertAdjacentHTML("beforebegin", '<button class="knopf pv-mehr" id="pmehr" type="button" title="Weitere Knöpfe" aria-label="Weitere Knöpfe">⋯</button>');
  el.querySelector("#pmehr").onclick = () => titelzeile.classList.toggle("auf");

  /* Ansicht */
  /* Bei einem Plan der ganzen Etage (sehr breit) sind die Zeichen in der Übersicht kleiner, damit sie sich nicht
     verdecken. Ab vierfacher Vergrößerung haben sie die volle Größe. */
  let ganzeEtage = false, sEinpassen = 1;
  const zeichenMass = () => ganzeEtage ? Math.min(1, Math.max(0.42, Math.sqrt(ansicht.s / (4 * sEinpassen)))) : 1;
  const anwenden = () => {
    welt.style.transform = `translate(${ansicht.x}px, ${ansicht.y}px) scale(${ansicht.s})`;
    welt.style.setProperty("--inv", zeichenMass() / ansicht.s);
    if (ansicht.offen) popupPosition();
  };
  const einpassen = () => {
    const b = buehne.clientWidth, h = buehne.clientHeight;
    const bw = bild.naturalWidth || plan.breite || 1000, bh = bild.naturalHeight || plan.hoehe || 700;
    welt.style.width = bw + "px"; welt.style.height = bh + "px";
    ansicht.s = Math.min(b / bw, h / bh) * 0.96;
    ganzeEtage = bw / bh > 2.4; sEinpassen = ansicht.s;
    ansicht.x = (b - bw * ansicht.s) / 2; ansicht.y = (h - bh * ansicht.s) / 2;
    ansicht.passt = true;                                     // der ganze Plan ist zu sehen: Bei neuer Größe wird wieder eingepasst
    anwenden();
  };
  const zoomUm = (faktor, cx, cy) => {
    const neu = Math.min(Math.max(ansicht.s * faktor, 0.05), /\.svg$/i.test(plan.dateiname || "") ? 16 : 8);   // gezeichnete Pläne (SVG) bleiben auch groß scharf
    const f = neu / ansicht.s;
    ansicht.x = cx - (cx - ansicht.x) * f; ansicht.y = cy - (cy - ansicht.y) * f; ansicht.s = neu;
    ansicht.passt = false;
    anwenden();
  };
  const relPos = (clientX, clientY) => {
    const r = welt.getBoundingClientRect();
    return { x: (clientX - r.left) / r.width, y: (clientY - r.top) / r.height };
  };
  const imPlan = (p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;

  /* Marker, Ebenen und Listen zeichnen */
  const sichtbar = (a) => !ansicht.aus.has(a.gewerk || "Sonstiges") &&
    (!ansicht.suche || (a.bezeichnung + " " + (a.standort || "") + " " + (a.gewerk || "") + " " + (a.nummer || "")).toLowerCase().includes(ansicht.suche));
  const heuteIso = () => (navi && navi.heute()) || new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const AMPEL_RANG = { rot: 0, gelb: 1, gruen: 2 }, AMPEL_FARBE = { rot: "var(--ueber)", gelb: "var(--bald)", gruen: "var(--ok)" };
  const listeMarkieren = () => el.querySelectorAll("#pll .pv-li").forEach((x) => x.classList.toggle("an", Number(x.dataset.a) === ansicht.offen));
  /* Liste „Auf dieser Etage“: Auffälliges zuerst, ein Klick zeigt die Anlage im Plan */
  const listeZeichnen = () => {
    const n = daten.platziert.length;
    const sicht = daten.platziert.filter(sichtbar).sort((a, b) => AMPEL_RANG[a.ampel] - AMPEL_RANG[b.ampel] || a.bezeichnung.localeCompare(b.bezeichnung, "de", { numeric: true }));
    el.querySelector("#pzahl").textContent = n;
    el.querySelector("#plzahl").textContent = sicht.length === n ? `${n} ${n === 1 ? "Anlage" : "Anlagen"}` : `${sicht.length} von ${n}`;
    el.querySelector("#pll").innerHTML = sicht.length ? sicht.map((a) => {
      const grund = a.ampel !== "gruen" ? guGrund(a, heuteIso()) : "";
      return `<button type="button" class="pv-li ${ansicht.offen === a.id ? "an" : ""}" data-a="${a.id}" title="Im Plan zeigen">${symbolVon(a, 30)}<span><b>${esc(a.bezeichnung)}</b>
        <small class="${grund ? (a.ampel === "rot" ? "rot" : "gelb") : ""}">${esc(grund || a.nummer || a.gewerk || "")}</small></span><i style="--c:${AMPEL_FARBE[a.ampel]}"></i></button>`;
    }).join("") : `<p class="klein pv-nichts">${n ? "Keine Anlage passt zur Suche." : "Auf diesem Plan sitzt noch keine Anlage."}</p>`;
    el.querySelector("#plfuss").innerHTML = aendern && daten.frei.length ? `<button type="button" class="pv-frei" data-akt="bearbeiten" title="Bearbeiten öffnen und Anlagen auf den Plan setzen">+ Noch nicht im Plan <span>${daten.frei.length}</span></button>` : "";
  };
  const zeichnen = () => {
    markerEbene.innerHTML = daten.platziert.map((a) => {
      const [k, c] = stil(a.gewerk);
      const z = quadratSymbol(a, 32);
      return `<button class="mk ${z ? "zeichen" : ""} ampel-${a.ampel} ${sichtbar(a) ? "" : "aus"} ${Number(q.get("anlage")) === a.id ? "hervor" : ""}" data-id="${a.id}" style="left:${a.plan_x * 100}%;top:${a.plan_y * 100}%;--c:${c}" title="${esc(a.bezeichnung)}">${z || esc(k)}</button>`;
    }).join("");
    const gewerke = [...new Set(daten.platziert.map((a) => a.gewerk || "Sonstiges"))].sort();
    el.querySelector("#ebenen").innerHTML = gewerke.map((g) => `<button class="chip ${ansicht.aus.has(g) ? "aus" : ""}" data-ebene="${esc(g)}" title="${esc(g)} im Plan ein- oder ausblenden">${symbol(g)} ${esc(g)} <span class="klein">${daten.platziert.filter((a) => (a.gewerk || "Sonstiges") === g).length}</span></button>`).join("");
    if (palette) {
      const frei = daten.frei.filter((a) => !ansicht.suche || a.bezeichnung.toLowerCase().includes(ansicht.suche));
      el.querySelector("#pfrei").innerHTML = `<h3>Noch nicht im Plan <span class="klein">${daten.frei.length}</span></h3>${frei.length ? frei.map((a) =>
        `<div class="p-item" data-anlage="${a.id}">${symbolVon(a)}<span>${esc(a.bezeichnung)}<br><span class="klein">${esc(a.standort || a.gewerk || "")}</span></span></div>`).join("") : '<p class="klein">Alle Anlagen dieses Objekts sind auf einem Plan.</p>'}`;
    }
    listeZeichnen();
    if (ansicht.suche) {
      const treffer = daten.platziert.filter(sichtbar);
      if (treffer.length === 1) zentrieren(treffer[0]);
    }
  };
  const zentrieren = (a) => {
    const bw = welt.offsetWidth, bh = welt.offsetHeight;
    ansicht.s = Math.max(ansicht.s, Math.min(buehne.clientWidth / bw, buehne.clientHeight / bh) * 2.2);
    ansicht.x = buehne.clientWidth / 2 - a.plan_x * bw * ansicht.s;
    ansicht.y = buehne.clientHeight / 2 - a.plan_y * bh * ansicht.s;
    ansicht.passt = false;
    anwenden();
  };
  const naviZeichnen = (roll) => { if (navi) navi.zeichnen(el, roll); };
  const neuLaden = async () => {
    daten = await api("GET", `plaene/${id}/anlagen`);
    zeichnen();
    if (navi) { const roll = (el.querySelector("#pel") || {}).scrollTop || 0; await navi.laden(); naviZeichnen(roll); }   // Farbpunkte der Etagen stimmen wieder
  };

  /* Popup */
  const popupPosition = () => {
    const a = daten.platziert.find((x) => x.id === ansicht.offen);
    if (!a) { popup.hidden = true; return; }
    const px = ansicht.x + a.plan_x * welt.offsetWidth * ansicht.s, py = ansicht.y + a.plan_y * welt.offsetHeight * ansicht.s;
    const w = popup.offsetWidth || 280, h = popup.offsetHeight || 200;
    popup.style.left = Math.min(Math.max(px + 22, 8), buehne.clientWidth - w - 8) + "px";
    popup.style.top = Math.min(Math.max(py - h / 2, 8), buehne.clientHeight - h - 8) + "px";
  };
  const popupZu = () => { ansicht.offen = null; popup.hidden = true; listeMarkieren(); };
  const popupZeigen = (a) => {
    ansicht.offen = a.id;
    popup.innerHTML = `<button class="x" data-p="zu" aria-label="Schließen">×</button>
      ${a.foto_id ? `<img class="pp-foto" src="/api/dokumente/${a.foto_id}/datei" alt="">` : ""}
      <div class="pp-kopf">${symbolVon(a, 34)}<div><b>${esc(a.bezeichnung)}</b><br><span class="klein">${esc([a.gewerk, a.standort].filter(Boolean).join(" · "))}</span></div></div>
      <div class="pp-zeilen">
        ${a.status ? `<div>Zustand ${zustandMarke(a.status)}</div>` : ""}
        <div>Störmeldungen ${a.tickets_offen ? `<span class="marke m-ueber">${a.tickets_offen} offen</span>` : '<span class="marke m-ok">keine offen</span>'}</div>
        <div>Nächster Termin ${a.naechste ? `${datum(a.naechste)} ${faelligMarke(a.naechste)}` : '<span class="klein">keiner geplant</span>'}</div>
        ${a.hersteller || a.typ ? `<div class="klein">${esc([a.hersteller, a.typ].filter(Boolean).join(" "))}</div>` : ""}
      </div>
      <div class="pp-knoepfe"><a class="knopf klein haupt-k" href="#/anlagen/${a.id}">Anlage öffnen</a><a class="knopf klein" href="#/anlagen/${a.id}?reiter=1">Wartungsplan</a>
        ${darf("tickets_anlegen") ? `<button class="knopf klein" data-p="stoer">Störung melden</button>` : ""}${bearb() ? `<button class="knopf klein" data-p="weg">Vom Plan nehmen</button>` : ""}</div>
      ${bearb() ? '<div class="klein" style="margin-top:6px">Zum Verschieben das Symbol ziehen.</div>' : ""}`;
    popup.hidden = false;
    popup.onclick = async (e) => {
      const k = e.target.closest("[data-p]");
      if (!k) return;
      if (k.dataset.p === "zu") popupZu();
      if (k.dataset.p === "stoer") {
        const t = await bearbeiten("tickets", null, { objekt_id: a.objekt_id, anlage_id: a.id, gewerk: a.gewerk });
        if (t) location.hash = `#/tickets/${t.id}`;
      }
      if (k.dataset.p === "weg") {
        await api("POST", `anlagen/${a.id}/position`, { plan_id: null });
        popupZu(); melde(`${a.bezeichnung} vom Plan genommen.`); neuLaden();
      }
    };
    popupPosition();
    listeMarkieren();
  };

  /* Setzen: neue Anlage aus Vorlage oder vorhandene */
  const setzen = async (quelle, pos) => {
    if (!imPlan(pos)) { melde("Bitte auf den Grundriss ziehen.", true); return; }
    let aid = quelle.anlage;
    if (!aid) {
      const gleich = [...daten.platziert, ...daten.frei].filter((a) => a.bezeichnung.startsWith(quelle.vorlage)).length;
      const t = quelle.typ ? S.kat.tMap[quelle.typ] : null;
      const neu = await bearbeiten("anlagen", null, {
        objekt_id: plan.objekt_id, gewerk: quelle.gewerk, planzeichen: quelle.zeichen, symbol_id: quelle.symbol_id, bezeichnung: `${quelle.vorlage} ${gleich + 1}`,
        standort: [plan.gebaeude, plan.etage].filter(Boolean).join(", "), status: "In Betrieb",
        ...(t ? { kategorie_id: t.kategorie_id, gruppe_id: t.gruppe_id, typ_id: t.id } : {}),
      });
      if (!neu || neu === "geloescht") return;
      aid = neu.id;
      if (quelle.typ) { zuletztGenutzt(quelle.typ); katalogZeichnen(); }
    }
    await api("POST", `anlagen/${aid}/position`, { plan_id: id, x: pos.x, y: pos.y });
    cacheLeeren();
    await neuLaden();
    melde("Auf den Plan gesetzt.");
  };

  const modusSetzen = (quelle) => {
    ansicht.modus = quelle;
    el.querySelectorAll(".p-item.gewaehlt").forEach((x) => x.classList.remove("gewaehlt"));
    if (!quelle) { modusEl.hidden = true; buehne.classList.remove("setzmodus"); return; }
    quelle.el && quelle.el.classList.add("gewaehlt");
    modusEl.hidden = false;
    modusEl.innerHTML = `<span>Tippe auf die Stelle im Plan für <b>${esc(quelle.name)}</b>.</span><button class="knopf klein">Abbrechen</button>`;
    modusEl.querySelector("button").onclick = (e) => { e.stopPropagation(); modusSetzen(null); };
    buehne.classList.add("setzmodus");
  };

  /* Ansehen oder Bearbeiten: Knöpfe im Kopf, Symbolliste oder Liste der Anlagen rechts */
  const modusZeigen = () => {
    const b = bearb();
    layout.classList.toggle("bearbeiten", b);
    layout.classList.toggle("mit-liste", !b && PLAN_MODUS.liste);
    akt.innerHTML = b
      ? `<button class="knopf pv-an" type="button" data-akt="fertig" title="Bearbeiten beenden">${stift} Fertig</button><button class="knopf" type="button" data-akt="angaben">Angaben</button><button class="knopf" type="button" data-akt="ersetzen">Grundriss ersetzen</button>`
      : `${aendern ? `<button class="knopf" type="button" data-akt="bearbeiten" title="Symbole setzen, verschieben und vom Plan nehmen">${stift} Bearbeiten</button>` : ""}<button class="knopf" type="button" data-akt="qr">QR-Etiketten</button><button class="knopf" type="button" data-akt="druck">Drucken</button>`;
    if (!b) modusSetzen(null);
    const offen = ansicht.offen && daten.platziert.find((x) => x.id === ansicht.offen);
    if (offen) popupZeigen(offen);                            // die Knöpfe im Fenster passen zum Modus
  };
  const listeSetzen = (an) => { PLAN_MODUS.liste = an; try { localStorage.setItem("cafm-plan-liste", an ? "1" : "0"); } catch (e) { /* egal */ } modusZeigen(); };
  el.querySelector("#plisteAuf").onclick = () => listeSetzen(true);
  el.querySelector("#plisteZu").onclick = () => listeSetzen(false);
  el.querySelector("#pll").addEventListener("click", (e) => {
    const z = e.target.closest("[data-a]"), a = z && daten.platziert.find((x) => x.id === Number(z.dataset.a));
    if (!a) return;
    zentrieren(a); popupZeigen(a);
    if (matchMedia("(max-width: 900px)").matches) buehne.scrollIntoView({ behavior: "smooth", block: "center" });   // am Handy steht die Liste unter dem Plan
  });
  el.addEventListener("click", async (e) => {
    const k = e.target.closest("[data-akt]");
    if (!k) return;
    const was = k.dataset.akt;
    titelzeile.classList.remove("auf");
    if (was === "bearbeiten" || was === "fertig") { PLAN_MODUS.bearbeiten = was === "bearbeiten"; modusZeigen(); }
    if (was === "qr") etikettenDrucken(daten.platziert.filter(sichtbar), `QR-Etiketten ${plan.titel}`);
    if (was === "druck") { einpassen(); setTimeout(print, 100); }
    if (was === "angaben") { const erg = await bearbeiten("plaene", plan); if (erg === "geloescht") location.hash = `#/plaene?o=${plan.objekt_id}`; else if (erg) route(); }
    if (was === "ersetzen" && await planHochladen({}, id)) { bildNeu = true; bild.src = `/api/plaene/${id}/bild?t=${Date.now()}`; }
  });

  /* Eigene Symbole und Katalog in der Symbolliste */
  const eigeneZeichnen = () => {
    const ziel = el.querySelector("#peigen");
    if (!ziel) return;
    const liste = (S.cache.symbole || []).filter((x) => !ansicht.suche || x.name.toLowerCase().includes(ansicht.suche));
    ziel.innerHTML = `<details open><summary><span class="sym" style="--c:var(--orange)">★</span> Eigene Symbole</summary>
      ${liste.map((x) => `<div class="p-item" data-vorlage="${esc(x.name)}" data-gewerk="${esc(x.gewerk || "")}" data-symbol="${x.id}" data-zeichen="" title="${esc(x.beschreibung || x.name)}">${eigenesSymbol(x.id)}<span>${esc(x.name)}</span></div>`).join("")}
      <button class="knopf klein sym-neu" type="button" id="symneu">${icon("plus")} Eigenes Symbol aus Bild</button></details>`;
    ziel.querySelector("#symneu").onclick = async () => { if (await symbolDialog()) eigeneZeichnen(); };
  };
  eigeneZeichnen();
  const katalogZeichnen = () => { const z = el.querySelector("#pkatalog"); if (z) katalogPalette(z, ansicht.suche); };
  katalogZeichnen();

  /* Ziehen aus der Symbolliste */
  if (palette) palette.addEventListener("pointerdown", (e) => {
    const item = e.target.closest(".p-item");
    if (!item || !bearb() || e.button > 0 || e.target.closest("button")) return;
    e.preventDefault();
    const quelle = item.dataset.anlage
      ? (() => { const f = daten.frei.find((a) => a.id === Number(item.dataset.anlage)); return { anlage: f.id, name: f.bezeichnung, gewerk: f.gewerk, zeichen: f.planzeichen, symbol_id: f.symbol_id, el: item }; })()
      : item.dataset.typ
        ? (() => { const t = S.kat.tMap[item.dataset.typ]; return { typ: t.id, kategorie_id: t.kategorie_id, vorlage: item.dataset.vorlage, gewerk: item.dataset.gewerk || null, zeichen: null, symbol_id: null, name: t.name, el: item }; })()
        : { vorlage: item.dataset.vorlage, gewerk: item.dataset.gewerk || null, zeichen: item.dataset.zeichen || null, symbol_id: Number(item.dataset.symbol) || null, name: item.dataset.vorlage, el: item };
    const start = { x: e.clientX, y: e.clientY };
    let geist = null;
    const bewegen = (ev) => {
      if (!geist && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 6) {
        geist = document.createElement("div");
        geist.className = "geist";
        geist.innerHTML = `${symbolFuer(quelle.gewerk, quelle.zeichen, 30, quelle.symbol_id, quelle.kategorie_id)}<span>${esc(quelle.name)}</span>`;
        document.body.appendChild(geist);
      }
      if (geist) {
        geist.style.left = ev.clientX + "px"; geist.style.top = ev.clientY + "px";
        const r = buehne.getBoundingClientRect();
        buehne.classList.toggle("ziel", ev.clientX > r.left && ev.clientX < r.right && ev.clientY > r.top && ev.clientY < r.bottom);
      }
    };
    const ende = async (ev) => {
      document.removeEventListener("pointermove", bewegen);
      document.removeEventListener("pointerup", ende);
      document.removeEventListener("pointercancel", ende);
      buehne.classList.remove("ziel");
      if (!geist) { modusSetzen(ansicht.modus && ansicht.modus.el === item ? null : quelle); return; }
      geist.remove();
      const r = buehne.getBoundingClientRect();
      if (ev.type === "pointerup" && ev.clientX > r.left && ev.clientX < r.right && ev.clientY > r.top && ev.clientY < r.bottom) {
        modusSetzen(null);
        try { await setzen(quelle, relPos(ev.clientX, ev.clientY)); } catch (err) { melde(err.message, true); }
      }
    };
    document.addEventListener("pointermove", bewegen);
    document.addEventListener("pointerup", ende);
    document.addEventListener("pointercancel", ende);
  });

  /* Bühne: verschieben, zoomen, Symbole ziehen (nur im Bearbeiten) */
  const zeiger = new Map();
  let geste = null;
  const hinweisBearbeiten = () => {                            // einmal je Sitzung: Symbole lassen sich erst im Bearbeiten verschieben
    try { if (sessionStorage.getItem("cafm-plan-hinweis")) return; sessionStorage.setItem("cafm-plan-hinweis", "1"); } catch (e) { /* egal */ }
    melde("Zum Verschieben von Symbolen oben auf „Bearbeiten“ klicken.");
  };
  buehne.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".popup, .modus, .pv-ecke, .pv-pille")) return;
    buehne.setPointerCapture(e.pointerId);
    zeiger.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const mk = e.target.closest(".mk");
    if (zeiger.size === 2) {
      const [a, b] = [...zeiger.values()];
      geste = { art: "pinch", abstand: Math.hypot(a.x - b.x, a.y - b.y), s: ansicht.s };
      return;
    }
    if (mk) geste = { art: "marker", id: Number(mk.dataset.id), el: mk, sx: e.clientX, sy: e.clientY, bewegt: false };
    else geste = { art: "pan", sx: e.clientX, sy: e.clientY, x: ansicht.x, y: ansicht.y, bewegt: false };
  });
  buehne.addEventListener("pointermove", (e) => {
    if (!zeiger.has(e.pointerId) || !geste) return;
    zeiger.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (geste.art === "pinch" && zeiger.size === 2) {
      const [a, b] = [...zeiger.values()];
      const r = buehne.getBoundingClientRect();
      zoomUm((geste.s * Math.hypot(a.x - b.x, a.y - b.y) / geste.abstand) / ansicht.s, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      return;
    }
    const dx = e.clientX - geste.sx, dy = e.clientY - geste.sy;
    if (!geste.bewegt && Math.hypot(dx, dy) < 5) return;
    if (geste.art === "marker" && !bearb()) {                 // Ansehen: Ziehen auf einem Symbol verschiebt den Plan, nicht das Symbol
      if (aendern) hinweisBearbeiten();
      geste = { art: "pan", sx: geste.sx, sy: geste.sy, x: ansicht.x, y: ansicht.y, bewegt: false };
    }
    geste.bewegt = true;
    if (geste.art === "pan") { ansicht.x = geste.x + dx; ansicht.y = geste.y + dy; ansicht.passt = false; anwenden(); buehne.classList.add("zieht"); }
    if (geste.art === "marker") {
      const p = relPos(e.clientX, e.clientY);
      geste.el.style.left = Math.min(Math.max(p.x, 0), 1) * 100 + "%";
      geste.el.style.top = Math.min(Math.max(p.y, 0), 1) * 100 + "%";
      geste.el.classList.add("zieht");
      popup.hidden = true;
    }
  });
  const loslassen = async (e) => {
    zeiger.delete(e.pointerId);
    buehne.classList.remove("zieht");
    const g = geste;
    if (zeiger.size === 0) geste = null;
    if (!g || g.art === "pinch") return;
    if (e.type === "pointercancel") { if (g.art === "marker") zeichnen(); return; }
    if (g.art === "marker") {
      const a = daten.platziert.find((x) => x.id === g.id);
      if (!g.bewegt) { popupZeigen(a); return; }
      if (!bearb()) { zeichnen(); return; }
      const p = relPos(e.clientX, e.clientY);
      p.x = Math.min(Math.max(p.x, 0), 1); p.y = Math.min(Math.max(p.y, 0), 1);
      try {
        await api("POST", `anlagen/${a.id}/position`, { plan_id: id, x: p.x, y: p.y });
        a.plan_x = p.x; a.plan_y = p.y; melde("Position gespeichert.");
      } catch (err) { melde(err.message, true); }
      zeichnen();
      return;
    }
    if (g.art === "pan" && !g.bewegt) {
      if (ansicht.modus) {
        const quelle = ansicht.modus;
        modusSetzen(null);
        try { await setzen(quelle, relPos(e.clientX, e.clientY)); } catch (err) { melde(err.message, true); }
      } else if (ansicht.offen) popupZu();
    }
  };
  markerEbene.addEventListener("click", (e) => {
    const mk = e.target.closest(".mk");
    if (mk && e.detail === 0) popupZeigen(daten.platziert.find((x) => x.id === Number(mk.dataset.id)));
  });
  buehne.addEventListener("pointerup", loslassen);
  buehne.addEventListener("pointercancel", loslassen);
  buehne.addEventListener("wheel", (e) => {
    e.preventDefault();
    const r = buehne.getBoundingClientRect();
    zoomUm(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  buehne.addEventListener("keydown", (e) => {
    if (e.key === "+" || e.key === "=") zoomUm(1.2, buehne.clientWidth / 2, buehne.clientHeight / 2);
    if (e.key === "-") zoomUm(1 / 1.2, buehne.clientWidth / 2, buehne.clientHeight / 2);
    if (e.key === "Escape") { modusSetzen(null); popupZu(); }
  });
  el.querySelector(".pv-ecke").addEventListener("click", (e) => {
    const z = e.target.closest("[data-z]");
    if (!z) return;
    if (z.dataset.z === "0") einpassen();
    else zoomUm(z.dataset.z === "+" ? 1.3 : 1 / 1.3, buehne.clientWidth / 2, buehne.clientHeight / 2);
  });
  el.querySelector("#ebenen").onclick = (e) => {
    const c = e.target.closest("[data-ebene]");
    if (!c) return;
    const g = c.dataset.ebene;
    ansicht.aus.has(g) ? ansicht.aus.delete(g) : ansicht.aus.add(g);
    zeichnen();
  };
  /* Suche: ein Suchwort für den Plan, die Liste der Anlagen und die Symbolliste (mehrere Felder, ein Wert) */
  const suchFelder = [...el.querySelectorAll("#psucheEtage, #psucheListe, #psuche")];
  let st;
  suchFelder.forEach((f) => f.addEventListener("input", () => {
    suchFelder.forEach((x) => { if (x !== f) x.value = f.value; });
    clearTimeout(st);
    st = setTimeout(() => { ansicht.suche = f.value.trim().toLowerCase(); zeichnen(); eigeneZeichnen(); katalogZeichnen(); }, 200);
  }));

  /* Vollbild: der Plan mit Leiste und Liste füllt den ganzen Bildschirm, auch über den Wechsel der Etage hinweg */
  const vollKnopf = el.querySelector("#pvoll");
  const istVoll = () => layout.classList.contains("vollbild");
  const vollZeigen = (an) => {
    layout.classList.toggle("vollbild", an);
    document.body.classList.toggle("plan-vollbild", an);
    vollKnopf.title = an ? "Vollbild beenden (Taste F oder Esc)" : "Vollbild (Taste F)";
    vollKnopf.setAttribute("aria-label", an ? "Vollbild beenden" : "Vollbild");
    vollKnopf.querySelector("path").setAttribute("d", an ? VOLL_AUS : VOLL_AN);
  };
  const vollSetzen = (an) => {
    if (an === istVoll()) return;
    vollZeigen(an);
    PLAN_MODUS.voll = an;
    if (an && document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    if (!an && document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    buehne.focus();
  };
  if (PLAN_MODUS.voll && merk) vollZeigen(true); else { PLAN_MODUS.voll = false; document.body.classList.remove("plan-vollbild"); }
  vollKnopf.onclick = () => vollSetzen(!istVoll());
  const fsWechsel = () => { if (!document.fullscreenElement && istVoll()) vollSetzen(false); };
  const tasten = (e) => {
    if (e.target.closest("input, textarea, select, .dialog-hg") || document.querySelector(".dialog-hg")) return;
    const ohneZusatz = !e.ctrlKey && !e.metaKey && !e.altKey;
    if ((e.key === "f" || e.key === "F") && ohneZusatz) { e.preventDefault(); vollSetzen(!istVoll()); }
    if (e.key === "Escape" && istVoll() && popup.hidden && !ansicht.modus) vollSetzen(false);
    if (navi && (e.key === "PageUp" || e.key === "PageDown") && ohneZusatz && !e.shiftKey) {   // Bild auf, Bild ab: eine Etage höher oder tiefer
      e.preventDefault();
      const ziel = e.repeat ? null : e.key === "PageUp" ? navi.hoch() : navi.runter();
      if (ziel) location.hash = `#/plaene/${ziel}`;
    }
  };
  const aufraeumen = () => {
    document.removeEventListener("fullscreenchange", fsWechsel);
    document.removeEventListener("keydown", tasten);
    window.removeEventListener("hashchange", beiWechsel);
    if (PLAN_AUFRAEUMEN === aufraeumen) PLAN_AUFRAEUMEN = null;
  };
  const beiWechsel = () => {
    if (!/^#\/plaene\/\d+/.test(location.hash)) vollSetzen(false);   // zum nächsten Plan bleibt das Vollbild an
    aufraeumen();
  };
  document.addEventListener("fullscreenchange", fsWechsel);
  document.addEventListener("keydown", tasten);
  window.addEventListener("hashchange", beiWechsel);
  PLAN_AUFRAEUMEN = aufraeumen;

  /* Erster Aufbau: Leiste, Knöpfe und Listen stehen sofort, der Plan passt sich ein, sobald das Bild da ist */
  einpassen();
  zeichnen();
  modusZeigen();
  naviZeichnen(merk ? merk.etagen : 0);
  if (merk) {                                                  // Wechsel von Plan zu Plan: Die Listen stehen wieder an derselben Stelle
    if (palette) palette.scrollTop = merk.symbole;
    el.querySelector("#pll").scrollTop = merk.anlagen;
  }
  const fertig = () => {
    einpassen();
    const hervor = daten.platziert.find((a) => a.id === Number(q.get("anlage")));
    if (hervor) { zentrieren(hervor); popupZeigen(hervor); }
    const setz = daten.frei.find((a) => a.id === Number(q.get("platzieren")));
    if (setz && bearb()) modusSetzen({ anlage: setz.id, name: setz.bezeichnung, gewerk: setz.gewerk, zeichen: setz.planzeichen, symbol_id: setz.symbol_id, el: el.querySelector(`[data-anlage="${setz.id}"]`) });
  };
  /* Das Bild kann schon da sein (Zwischenspeicher), sein Lade-Ereignis kommt dann trotzdem noch: fertig() läuft genau einmal. */
  let bildDa = false;
  bild.addEventListener("load", () => {
    if (!bildDa) { bildDa = true; fertig(); }
    else if (bildNeu) { bildNeu = false; einpassen(); }       // Grundriss ersetzt: neu einpassen
  });
  bild.addEventListener("error", () => melde("Der Grundriss konnte nicht geladen werden.", true));
  if (bild.complete && bild.naturalWidth > 0) { bildDa = true; fertig(); }
  /* Neue Größe (Liste auf oder zu, Vollbild, Fenster): Der ganze Plan wird neu eingepasst, ein gewählter Ausschnitt bleibt in der Mitte. */
  let alt = { b: buehne.clientWidth, h: buehne.clientHeight };
  const ro = new ResizeObserver(() => {
    if (!document.body.contains(buehne)) { ro.disconnect(); return; }
    const b = buehne.clientWidth, h = buehne.clientHeight;
    if (ansicht.passt) einpassen();
    else { ansicht.x += (b - alt.b) / 2; ansicht.y += (h - alt.h) / 2; anwenden(); }
    alt = { b, h };
  });
  ro.observe(buehne);
}

/* Kleiner Planausschnitt für die Anlagen-Seite. Bei einem Plan der ganzen Etage (sehr breit) wird der Bereich um die Anlage gezeigt. */
function planAusschnitt(a) {
  if (!a.plan_id) return "";
  const p = (S.cache.plaene || []).find((x) => x.id === a.plan_id);
  const form = p && p.breite && p.hoehe ? p.breite / p.hoehe : 1;
  const marke = `<span class="mk ${quadratSymbol(a, 32) ? "zeichen" : ""} ampel-gruen" style="left:${a.plan_x * 100}%;top:${a.plan_y * 100}%;--c:${stil(a.gewerk)[1]}">${quadratSymbol(a, 32) || esc(stil(a.gewerk)[0])}</span>`;
  if (form <= 2.4) {
    return `<a class="mini-plan" href="#/plaene/${a.plan_id}?anlage=${a.id}" title="Im Plan zeigen"><img src="/api/plaene/${a.plan_id}/bild" alt="">${marke}</a>`;
  }
  const fenster = 16 / 9, hoch = 1.6, z = hoch * form / fenster;              // Plan 1,6-mal so hoch wie das Fenster
  const l = Math.min(0, Math.max(-(z - 1), 0.5 - a.plan_x * z)), t = Math.min(0, Math.max(-(hoch - 1), 0.5 - a.plan_y * hoch));
  return `<a class="mini-plan weit" href="#/plaene/${a.plan_id}?anlage=${a.id}" title="Im Plan zeigen">
    <span class="mp-welt" style="width:${z * 100}%;left:${l * 100}%;top:${t * 100}%"><img src="/api/plaene/${a.plan_id}/bild" alt="">${marke}</span></a>`;
}
