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
    ${darf("plaene_bearbeiten") ? `<button class="knopf haupt-k" data-pneu>${icon("plus")} Grundriss hochladen</button>` : ""}</div><div data-pk></div>`;
  const s = ziel.querySelector("[data-pobj]");
  if (s) s.onchange = zeichnen;
  const n = ziel.querySelector("[data-pneu]");
  if (n) n.onclick = async () => { const e = await planHochladen({ ...filter }); if (e) location.hash = `#/plaene/${e.id}`; };
  await zeichnen();
}

SEITEN.plaene = async (el) => {
  el.innerHTML = seitenkopf("Pläne", "Grundrisse mit Anlagen") + '<div id="pl"></div>';
  await planListe(el.querySelector("#pl"));
};

/* ---------- Plan-Arbeitsfläche ---------- */
DETAIL.plaene = async (el, id, q) => {
  await Promise.all([...["objekte", "plaene", "symbole"].map((r) => lade(r)), katLaden()]);
  let daten = await api("GET", `plaene/${id}/anlagen`);
  const plan = daten.plan;
  const aendern = darf("plaene_bearbeiten");
  const ansicht = { s: 1, x: 0, y: 0, aus: new Set(), suche: "", modus: null, offen: null };

  el.innerHTML = seitenkopf(plan.titel, [refText("objekte", plan.objekt_id), plan.gebaeude, plan.etage].filter(Boolean).join(" · "),
    `${aendern ? '<button class="knopf" id="pbearb">Angaben</button><button class="knopf" id="pers">Grundriss ersetzen</button>' : ""}<button class="knopf" id="pqr">QR-Etiketten</button><button class="knopf" id="pdruck">Drucken</button>`,
    [`#/objekte/${plan.objekt_id}?reiter=1`, refText("objekte", plan.objekt_id)]) + `
  <div class="plan-layout">
    <aside class="palette" id="palette">
      <input type="search" id="psuche" placeholder="Gerät oder Anlage suchen">
      ${aendern ? `<div class="hinweis">Zieh ein Symbol auf den Grundriss. Oder tippe es an und dann auf die Stelle im Plan. Katalog: Kategorie, Hersteller, Bezeichnung.</div>` : ""}
      <div id="pfrei"></div>
      ${aendern ? `<h3>Neu einfügen</h3><div id="peigen"></div><div id="pkatalog"></div>` : ""}
    </aside>
    <section class="plan-bereich">
      <div class="plan-leiste">
        <div class="ebenen" id="ebenen"></div>
        <div class="zoom"><button class="knopf klein" data-z="-" aria-label="Verkleinern">−</button><button class="knopf klein" data-z="0">Einpassen</button><button class="knopf klein" data-z="+" aria-label="Vergrößern">+</button></div>
      </div>
      <div class="buehne" id="buehne" tabindex="0">
        <div class="welt" id="welt"><img id="pbild" src="/api/plaene/${id}/bild" alt="Grundriss ${esc(plan.titel)}" draggable="false"><div id="marker"></div></div>
        <div class="modus" id="modus" hidden></div>
        <div class="popup" id="popup" hidden></div>
      </div>
      <div class="legende plan-legende"><span style="--c:var(--ok)">in Ordnung</span><span style="--c:var(--bald)">bald fällig oder eingeschränkt</span><span style="--c:var(--ueber)">Störung, überfällig oder außer Betrieb</span></div>
    </section>
  </div>`;

  const buehne = el.querySelector("#buehne"), welt = el.querySelector("#welt"), bild = el.querySelector("#pbild");
  const markerEbene = el.querySelector("#marker"), popup = el.querySelector("#popup"), modusEl = el.querySelector("#modus");

  /* Ansicht */
  const anwenden = () => {
    welt.style.transform = `translate(${ansicht.x}px, ${ansicht.y}px) scale(${ansicht.s})`;
    welt.style.setProperty("--inv", 1 / ansicht.s);
    if (ansicht.offen) popupPosition();
  };
  const einpassen = () => {
    const b = buehne.clientWidth, h = buehne.clientHeight;
    const bw = bild.naturalWidth || plan.breite || 1000, bh = bild.naturalHeight || plan.hoehe || 700;
    welt.style.width = bw + "px"; welt.style.height = bh + "px";
    ansicht.s = Math.min(b / bw, h / bh) * 0.96;
    ansicht.x = (b - bw * ansicht.s) / 2; ansicht.y = (h - bh * ansicht.s) / 2;
    anwenden();
  };
  const zoomUm = (faktor, cx, cy) => {
    const neu = Math.min(Math.max(ansicht.s * faktor, 0.05), 8);
    const f = neu / ansicht.s;
    ansicht.x = cx - (cx - ansicht.x) * f; ansicht.y = cy - (cy - ansicht.y) * f; ansicht.s = neu;
    anwenden();
  };
  const relPos = (clientX, clientY) => {
    const r = welt.getBoundingClientRect();
    return { x: (clientX - r.left) / r.width, y: (clientY - r.top) / r.height };
  };
  const imPlan = (p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;

  /* Marker zeichnen */
  const sichtbar = (a) => !ansicht.aus.has(a.gewerk || "Sonstiges") &&
    (!ansicht.suche || (a.bezeichnung + " " + (a.standort || "") + " " + (a.gewerk || "")).toLowerCase().includes(ansicht.suche));
  const zeichnen = () => {
    markerEbene.innerHTML = daten.platziert.map((a) => {
      const [k, c] = stil(a.gewerk);
      const z = quadratSymbol(a, 32);
      return `<button class="mk ${z ? "zeichen" : ""} ampel-${a.ampel} ${sichtbar(a) ? "" : "aus"} ${Number(q.get("anlage")) === a.id ? "hervor" : ""}" data-id="${a.id}" style="left:${a.plan_x * 100}%;top:${a.plan_y * 100}%;--c:${c}" title="${esc(a.bezeichnung)}">${z || esc(k)}</button>`;
    }).join("");
    const gewerke = [...new Set(daten.platziert.map((a) => a.gewerk || "Sonstiges"))].sort();
    el.querySelector("#ebenen").innerHTML = gewerke.map((g) => `<button class="chip ${ansicht.aus.has(g) ? "aus" : ""}" data-ebene="${esc(g)}">${symbol(g)} ${esc(g)} <span class="klein">${daten.platziert.filter((a) => (a.gewerk || "Sonstiges") === g).length}</span></button>`).join("");
    const frei = daten.frei.filter((a) => !ansicht.suche || a.bezeichnung.toLowerCase().includes(ansicht.suche));
    el.querySelector("#pfrei").innerHTML = aendern ? `<h3>Noch nicht im Plan <span class="klein">${daten.frei.length}</span></h3>${frei.length ? frei.map((a) =>
      `<div class="p-item" data-anlage="${a.id}">${symbolVon(a)}<span>${esc(a.bezeichnung)}<br><span class="klein">${esc(a.standort || a.gewerk || "")}</span></span></div>`).join("") : '<p class="klein">Alle Anlagen dieses Objekts sind auf einem Plan.</p>'}` : "";
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
    anwenden();
  };
  const neuLaden = async () => { daten = await api("GET", `plaene/${id}/anlagen`); zeichnen(); };

  /* Popup */
  const popupPosition = () => {
    const a = daten.platziert.find((x) => x.id === ansicht.offen);
    if (!a) { popup.hidden = true; return; }
    const px = ansicht.x + a.plan_x * welt.offsetWidth * ansicht.s, py = ansicht.y + a.plan_y * welt.offsetHeight * ansicht.s;
    const w = popup.offsetWidth || 280, h = popup.offsetHeight || 200;
    popup.style.left = Math.min(Math.max(px + 22, 8), buehne.clientWidth - w - 8) + "px";
    popup.style.top = Math.min(Math.max(py - h / 2, 8), buehne.clientHeight - h - 8) + "px";
  };
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
        ${darf("tickets_anlegen") ? `<button class="knopf klein" data-p="stoer">Störung melden</button>` : ""}${aendern ? `<button class="knopf klein" data-p="weg">Vom Plan nehmen</button>` : ""}</div>
      ${aendern ? '<div class="klein" style="margin-top:6px">Zum Verschieben das Symbol ziehen.</div>' : ""}`;
    popup.hidden = false;
    popup.onclick = async (e) => {
      const k = e.target.closest("[data-p]");
      if (!k) return;
      if (k.dataset.p === "zu") { ansicht.offen = null; popup.hidden = true; }
      if (k.dataset.p === "stoer") {
        const t = await bearbeiten("tickets", null, { objekt_id: a.objekt_id, anlage_id: a.id, gewerk: a.gewerk });
        if (t) location.hash = `#/tickets/${t.id}`;
      }
      if (k.dataset.p === "weg") {
        await api("POST", `anlagen/${a.id}/position`, { plan_id: null });
        ansicht.offen = null; popup.hidden = true; melde(`${a.bezeichnung} vom Plan genommen.`); neuLaden();
      }
    };
    popupPosition();
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

  /* Eigene Symbole in der Seitenleiste */
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
  el.querySelector("#psuche").addEventListener("input", () => setTimeout(() => { eigeneZeichnen(); katalogZeichnen(); }, 220));

  /* Ziehen aus der Seitenleiste */
  el.querySelector("#palette").addEventListener("pointerdown", (e) => {
    const item = e.target.closest(".p-item");
    if (!item || !aendern || e.button > 0 || e.target.closest("button")) return;
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

  /* Bühne: verschieben, zoomen, Marker ziehen */
  const zeiger = new Map();
  let geste = null;
  buehne.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".popup, .modus")) return;
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
    geste.bewegt = true;
    if (geste.art === "pan") { ansicht.x = geste.x + dx; ansicht.y = geste.y + dy; anwenden(); buehne.classList.add("zieht"); }
    if (geste.art === "marker" && aendern) {
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
      if (!aendern) return;
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
      } else if (ansicht.offen) { ansicht.offen = null; popup.hidden = true; }
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
    if (e.key === "Escape") { modusSetzen(null); popup.hidden = true; ansicht.offen = null; }
  });
  el.querySelector(".zoom").onclick = (e) => {
    const z = e.target.closest("[data-z]");
    if (!z) return;
    if (z.dataset.z === "0") einpassen();
    else zoomUm(z.dataset.z === "+" ? 1.3 : 1 / 1.3, buehne.clientWidth / 2, buehne.clientHeight / 2);
  };
  el.querySelector("#ebenen").onclick = (e) => {
    const c = e.target.closest("[data-ebene]");
    if (!c) return;
    const g = c.dataset.ebene;
    ansicht.aus.has(g) ? ansicht.aus.delete(g) : ansicht.aus.add(g);
    zeichnen();
  };
  let st;
  el.querySelector("#psuche").addEventListener("input", (e) => { clearTimeout(st); st = setTimeout(() => { ansicht.suche = e.target.value.trim().toLowerCase(); zeichnen(); }, 200); });

  /* Kopf-Knöpfe */
  el.querySelector("#pdruck").onclick = () => { einpassen(); setTimeout(print, 100); };
  el.querySelector("#pqr").onclick = () => etikettenDrucken(daten.platziert.filter(sichtbar), `QR-Etiketten ${plan.titel}`);
  const pb = el.querySelector("#pbearb");
  if (pb) pb.onclick = async () => { const e = await bearbeiten("plaene", plan); if (e === "geloescht") location.hash = "#/plaene"; else if (e) route(); };
  const pe = el.querySelector("#pers");
  if (pe) pe.onclick = async () => { if (await planHochladen({}, id)) { bild.src = `/api/plaene/${id}/bild?t=${Date.now()}`; } };

  const fertig = () => {
    einpassen();
    zeichnen();
    const hervor = daten.platziert.find((a) => a.id === Number(q.get("anlage")));
    if (hervor) { zentrieren(hervor); popupZeigen(hervor); }
    const setz = daten.frei.find((a) => a.id === Number(q.get("platzieren")));
    if (setz && aendern) modusSetzen({ anlage: setz.id, name: setz.bezeichnung, gewerk: setz.gewerk, zeichen: setz.planzeichen, symbol_id: setz.symbol_id, el: el.querySelector(`[data-anlage="${setz.id}"]`) });
  };
  if (bild.complete && bild.naturalWidth) fertig(); else { bild.onload = () => { bild.onload = einpassen; fertig(); }; bild.onerror = () => melde("Der Grundriss konnte nicht geladen werden.", true); }
  const ro = new ResizeObserver(() => { if (document.body.contains(buehne)) einpassen(); else ro.disconnect(); });
  ro.observe(buehne);
};

/* Kleiner Planausschnitt für die Anlagen-Seite */
function planAusschnitt(a) {
  if (!a.plan_id) return "";
  return `<a class="mini-plan" href="#/plaene/${a.plan_id}?anlage=${a.id}" title="Im Plan zeigen">
    <img src="/api/plaene/${a.plan_id}/bild" alt="">
    <span class="mk ${quadratSymbol(a, 32) ? "zeichen" : ""} ampel-gruen" style="left:${a.plan_x * 100}%;top:${a.plan_y * 100}%;--c:${stil(a.gewerk)[1]}">${quadratSymbol(a, 32) || esc(stil(a.gewerk)[0])}</span></a>`;
}
