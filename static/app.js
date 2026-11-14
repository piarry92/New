/* Casa CAFM – Oberfläche (ohne Fremdbibliotheken) */
"use strict";

const S = { ich: null, schema: null, cache: {}, einheiten: {} };
const $app = document.getElementById("app");

/* ---------- Hilfen ---------- */
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const heute = () => new Date().toISOString().slice(0, 10);
const tageBis = (iso) => Math.round((new Date(iso + "T00:00:00") - new Date(heute() + "T00:00:00")) / 86400000);
const datum = (iso) => (iso ? iso.slice(0, 10).split("-").reverse().join(".") : "");
const zahl = (v, st = 0) => (v == null || v === "" ? "" : Number(v).toLocaleString("de-DE", { minimumFractionDigits: st, maximumFractionDigits: st || 3 }));
const geld = (v) => (v == null || v === "" ? "" : Number(v).toLocaleString("de-DE", { style: "currency", currency: "EUR" }));
const groesse = (b) => (b > 1048576 ? zahl(b / 1048576, 1) + " MB" : zahl(Math.ceil(b / 1024)) + " KB");
const darfAendern = () => S.ich && S.ich.rolle !== "lesen";
const istAdmin = () => S.ich && S.ich.rolle === "admin";

async function api(methode, pfad, daten) {
  const r = await fetch("/api/" + pfad, {
    method: methode,
    headers: { "Content-Type": "application/json", "X-CAFM": "1" },
    body: daten === undefined ? undefined : JSON.stringify(daten),
    credentials: "same-origin",
  });
  let j = null;
  try { j = await r.json(); } catch (e) { /* leer */ }
  if (r.status === 401 && pfad !== "anmelden" && pfad !== "status") { S.ich = null; zeigeAnmeldung(); throw new Error("Bitte anmelden."); }
  if (!r.ok) throw new Error((j && j.fehler) || "Fehler " + r.status);
  return j;
}

function melde(text, fehler = false) {
  const d = document.createElement("div");
  d.textContent = text;
  if (fehler) d.className = "f";
  document.getElementById("meldung").appendChild(d);
  setTimeout(() => d.remove(), fehler ? 6000 : 3000);
}

const ICONS = {
  start: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  objekte: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3"/>',
  anlagen: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  wartungen: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-.5-.5-2.5z"/>',
  tickets: '<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
  kalender: '<rect x="3" y="5" width="18" height="16" rx="1"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  vertraege: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>',
  dienstleister: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
  zaehler: '<circle cx="12" cy="13" r="8"/><path d="M12 13l4-4M8 5l-1-2M16 5l1-2"/>',
  dokumente: '<path d="M3 6h7l2 2h9v12H3z"/>',
  einstellungen: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  suche: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  menue: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  export: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
};
const icon = (n) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ""}</svg>`;

/* ---------- Nachschlagen ---------- */
async function lade(ressource, neu = false) {
  if (!S.cache[ressource] || neu) S.cache[ressource] = await api("GET", ressource);
  return S.cache[ressource];
}
function cacheLeeren() { S.cache = {}; }
function anzeige(ressource, zeile) {
  if (!zeile) return "";
  const r = S.schema[ressource];
  return r.anzeige.map((a) => zeile[a]).filter((x) => x != null && x !== "").join(" · ");
}
function refText(ressource, id) {
  if (id == null) return "";
  const z = (S.cache[ressource] || []).find((x) => x.id === id);
  return z ? anzeige(ressource, z) : "#" + id;
}
async function refsLaden(ressource) {
  const refs = [...new Set(S.schema[ressource].felder.filter((f) => f.typ === "ref").map((f) => f.ref))];
  await Promise.all(refs.map((r) => lade(r)));
}

/* ---------- Status ---------- */
function faelligMarke(iso, aktiv = 1) {
  if (!aktiv) return '<span class="marke m-arbeit">inaktiv</span>';
  if (!iso) return "";
  const t = tageBis(iso);
  if (t < 0) return `<span class="marke m-ueber">überfällig seit ${-t} T.</span>`;
  if (t <= 30) return `<span class="marke m-bald">fällig in ${t} T.</span>`;
  return '<span class="marke m-geplant">geplant</span>';
}
function ticketMarke(s) {
  const k = { "Neu": "m-neu", "In Arbeit": "m-arbeit", "Warten auf Dienstleister": "m-bald", "Erledigt": "m-ok", "Abgeschlossen": "m-ok" }[s] || "m-geplant";
  return `<span class="marke ${k}">${esc(s)}</span>`;
}
function prioMarke(p) {
  const k = { "Notfall": "m-notfall", "Hoch": "m-hoch", "Normal": "m-geplant", "Niedrig": "m-geplant" }[p] || "m-geplant";
  return `<span class="marke ${k}">${esc(p)}</span>`;
}
function zustandMarke(z) {
  const k = { "In Betrieb": "m-ok", "Eingeschränkt": "m-bald", "Außer Betrieb": "m-ueber", "Stillgelegt": "m-arbeit" }[z] || "m-geplant";
  return z ? `<span class="marke ${k}">${esc(z)}</span>` : "";
}
function kuendigenBis(v) {
  if (!v.ende) return null;
  const d = new Date(v.ende + "T00:00:00");
  d.setMonth(d.getMonth() - (v.kuendigungsfrist_monate || 0));
  return d.toISOString().slice(0, 10);
}

/* ---------- Zellen ---------- */
function zelle(ressource, f, z) {
  const v = z[f.name];
  if (ressource === "wartungen" && f.name === "naechste") return `${datum(v)} ${faelligMarke(v, z.aktiv)}`;
  if (ressource === "tickets" && f.name === "status") return ticketMarke(v);
  if (f.name === "prioritaet") return prioMarke(v);
  if (ressource === "anlagen" && f.name === "status") return zustandMarke(v);
  if (f.name === "medium") return `<span class="medium ${esc(v)}">${esc(v)}</span>`;
  if (ressource === "vertraege" && f.name === "ende" && v) {
    const k = kuendigenBis(z); const t = tageBis(k);
    const m = t < 0 ? "" : t <= 90 ? ` <span class="marke m-bald">kündigen bis ${datum(k)}</span>` : "";
    return datum(v) + m;
  }
  switch (f.typ) {
    case "ref": return esc(refText(f.ref, v));
    case "date": return datum(v);
    case "money": return geld(v);
    case "number": return f.name === "groesse" && v ? groesse(v) : f.name === "baujahr" ? (v == null ? "" : String(Math.round(v))) : zahl(v);
    case "bool": return v ? "ja" : "nein";
    case "email": return v ? `<a href="mailto:${esc(v)}" onclick="event.stopPropagation()">${esc(v)}</a>` : "";
    case "tel": return v ? `<a href="tel:${esc(v.replace(/\s/g, ""))}" onclick="event.stopPropagation()">${esc(v)}</a>` : "";
    default: return esc(v);
  }
}

/* ---------- Rahmen ---------- */
const NAV = [
  ["start", "Übersicht", "#/"],
  ["objekte", "Objekte", "#/objekte"],
  ["anlagen", "Anlagen", "#/anlagen"],
  ["wartungen", "Wartung & Prüfung", "#/wartungen"],
  ["tickets", "Störmeldungen", "#/tickets"],
  ["kalender", "Kalender", "#/kalender"],
  "-",
  ["vertraege", "Verträge", "#/vertraege"],
  ["dienstleister", "Dienstleister", "#/dienstleister"],
  ["zaehler", "Zähler", "#/zaehler"],
  ["dokumente", "Dokumente", "#/dokumente"],
  "-",
  ["einstellungen", "Einstellungen", "#/einstellungen"],
];

function rahmen() {
  $app.innerHTML = `
  <div class="rahmen">
    <aside class="seite" id="seite">
      <div class="logo"><img src="/logo-negativ.png" alt="Casa Concept Consulting"><span>CAFM</span></div>
      <nav id="nav">${NAV.map((n) => n === "-" ? '<div class="trenner"></div>' :
        `<a href="${n[2]}" data-nav="${n[0]}">${icon(n[0])}<span>${n[1]}</span><span class="zahl" data-zahl="${n[0]}" hidden></span></a>`).join("")}</nav>
      <div class="ich">${esc(S.ich.name)}<br><span class="klein">${esc({ admin: "Administrator", benutzer: "Bearbeiten", lesen: "Nur lesen" }[S.ich.rolle])}</span> · <button id="abmelden">Abmelden</button></div>
    </aside>
    <div class="haupt">
      <header class="kopf">
        <button class="menue" id="menue" aria-label="Menü">${icon("menue")}</button>
        <form class="suche" id="suchform">${icon("suche")}<input type="search" id="suchfeld" placeholder="Suchen: Objekt, Anlage, Störmeldung, Firma …" autocomplete="off"></form>
      </header>
      <main class="inhalt" id="inhalt"></main>
    </div>
  </div>`;
  document.getElementById("abmelden").onclick = async () => { await api("POST", "abmelden"); S.ich = null; zeigeAnmeldung(); };
  document.getElementById("menue").onclick = () => document.getElementById("seite").classList.toggle("offen");
  document.getElementById("suchform").onsubmit = (e) => { e.preventDefault(); location.hash = "#/suche/" + encodeURIComponent(document.getElementById("suchfeld").value); };
}

async function zaehlerNav() {
  try {
    const d = await api("GET", "dashboard");
    const setz = (k, n) => { const el = document.querySelector(`[data-zahl="${k}"]`); if (el) { el.textContent = n; el.hidden = !n; } };
    setz("tickets", d.kennzahlen.tickets_offen);
    setz("wartungen", d.kennzahlen.wartung_ueberfaellig);
    return d;
  } catch (e) { return null; }
}

/* ---------- Anmeldung ---------- */
function zeigeAnmeldung(einrichten = false) {
  $app.innerHTML = `
  <div class="anmeldung">
    <div class="bild">
      <img src="/logo-negativ.png" alt="Casa Concept Consulting">
      <h1>Gebäude, Anlagen und Fristen <em>im Griff.</em></h1>
      <div class="klein" style="color:#CFCFD0">Casa CAFM · Facility Management</div>
    </div>
    <div class="form">
      <form id="af">
        <h2>${einrichten ? "Ersten Zugang anlegen" : "Anmelden"}</h2>
        ${einrichten ? '<p class="klein">Das Programm ist neu. Lege jetzt den ersten Zugang an. Er bekommt Administratorrechte.</p><label>Name<input name="name" required autocomplete="name"></label>' : ""}
        <div id="afehler"></div>
        <label>E-Mail<input name="email" type="email" required autocomplete="username"></label>
        <label>Passwort<input name="passwort" type="password" required minlength="${einrichten ? 8 : 1}" autocomplete="${einrichten ? "new-password" : "current-password"}"></label>
        <button class="knopf haupt-k" type="submit">${einrichten ? "Anlegen und anmelden" : "Anmelden"}</button>
      </form>
    </div>
  </div>`;
  document.getElementById("af").onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    try {
      const r = await api("POST", einrichten ? "einrichten" : "anmelden", d);
      S.ich = r.benutzer;
      await start();
    } catch (err) {
      document.getElementById("afehler").innerHTML = `<div class="fehler">${esc(err.message)}</div>`;
    }
  };
}

/* ---------- Formular-Dialog ---------- */
const letzterDialog = () => { const a = document.querySelectorAll(".dialog-hg"); return a[a.length - 1]; };
function dialog(titel, innen, knoepfe) {
  return new Promise((fertig) => {
    const hg = document.createElement("div");
    hg.className = "dialog-hg";
    hg.innerHTML = `<div class="dialog" role="dialog" aria-modal="true"><div class="dk"><h2>${esc(titel)}</h2><button class="x" aria-label="Schließen">×</button></div>
      <div class="di">${innen}</div><div class="df"></div></div>`;
    const zu = (wert) => { hg.remove(); document.removeEventListener("keydown", esc_); fertig(wert); };
    const esc_ = (e) => { if (e.key === "Escape") zu(null); };
    document.addEventListener("keydown", esc_);
    hg.querySelector(".x").onclick = () => zu(null);
    hg.addEventListener("mousedown", (e) => { if (e.target === hg) zu(null); });
    const df = hg.querySelector(".df");
    for (const k of knoepfe) {
      const b = document.createElement("button");
      b.className = "knopf " + (k.klasse || "");
      b.textContent = k.text;
      b.type = "button";
      b.onclick = async () => {
        if (!k.aktion) return zu(null);
        b.disabled = true;
        try { const w = await k.aktion(hg); if (w !== false) zu(w ?? true); }
        catch (err) { const f = hg.querySelector(".dfehler"); if (f) f.innerHTML = `<div class="fehler">${esc(err.message)}</div>`; else melde(err.message, true); }
        finally { b.disabled = false; }
      };
      df.appendChild(b);
    }
    document.body.appendChild(hg);
    const erstes = hg.querySelector("input:not([type=hidden]):not([readonly]), select, textarea");
    if (erstes) erstes.focus();
  });
}

function eingabe(f, wert, ressource) {
  const p = f.pflicht ? "required" : "";
  const n = `name="${f.name}" ${p}`;
  const v = wert ?? "";
  switch (f.typ) {
    case "textarea": return `<textarea ${n}>${esc(v)}</textarea>`;
    case "select": return `<select ${n}><option value="">–</option>${f.optionen.map((o) => `<option ${o === v ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
    case "ref": {
      const liste = S.cache[f.ref] || [];
      return `<select ${n} data-ref="${f.ref}" ${f.filter ? `data-filter="${f.filter}"` : ""}><option value="">–</option>${liste.map((z) =>
        `<option value="${z.id}" data-${f.filter || "x"}="${esc(z[f.filter] ?? "")}" ${z.id === v ? "selected" : ""}>${esc(anzeige(f.ref, z))}</option>`).join("")}</select>`;
    }
    case "date": return `<input type="date" ${n} value="${esc(v)}">`;
    case "number": case "money": return `<input type="number" step="any" ${n} value="${esc(v)}">`;
    case "email": return `<input type="email" ${n} value="${esc(v)}">`;
    case "tel": return `<input type="tel" ${n} value="${esc(v)}">`;
    case "bool": return `<input type="checkbox" name="${f.name}" ${v ? "checked" : ""}>`;
    default: return `<input type="text" ${n} value="${esc(v)}">`;
  }
}

function formularHtml(ressource, z, vorgabe = {}) {
  const felder = S.schema[ressource].felder.filter((f) => !f.nurlesen);
  return `<div class="dfehler"></div><form class="formular" onsubmit="return false">${felder.map((f) => {
    const wert = z ? z[f.name] : (vorgabe[f.name] ?? f.standard ?? (f.name === "gemeldet_am" ? heute() : null));
    const breit = f.typ === "textarea" ? "breit" : "";
    if (f.typ === "bool") return `<label class="check ${breit}">${eingabe(f, wert, ressource)} ${esc(f.label)}</label>`;
    return `<label class="${breit}"><span class="${f.pflicht ? "pflicht" : ""}">${esc(f.label)}</span>${eingabe(f, wert, ressource)}</label>`;
  }).join("")}</form>`;
}

function formularVerdrahten(hg) {
  const form = hg.querySelector("form");
  const filtern = () => {
    form.querySelectorAll("select[data-filter]").forEach((sel) => {
      const quelle = form.querySelector(`[name="${sel.dataset.filter}"]`);
      if (!quelle) return;
      const w = quelle.value;
      sel.querySelectorAll("option[value]").forEach((o) => {
        if (!o.value) return;
        const passt = !w || o.getAttribute("data-" + sel.dataset.filter) === w;
        o.hidden = !passt;
        if (!passt && o.selected) sel.value = "";
      });
    });
  };
  form.addEventListener("change", (e) => {
    filtern();
    if (e.target.name === "medium") {
      const ein = form.querySelector('[name="einheit"]');
      if (ein && !ein.value) ein.value = S.einheiten[e.target.value] || "";
    }
  });
  filtern();
}

function formularDaten(hg, ressource) {
  const form = hg.querySelector("form");
  const d = {};
  for (const f of S.schema[ressource].felder) {
    if (f.nurlesen) continue;
    const el = form.querySelector(`[name="${f.name}"]`);
    if (!el) continue;
    d[f.name] = f.typ === "bool" ? (el.checked ? 1 : 0) : (el.value === "" ? null : el.value);
  }
  return d;
}

async function bearbeiten(ressource, z = null, vorgabe = {}) {
  await refsLaden(ressource);
  const r = S.schema[ressource];
  const knoepfe = [{ text: "Abbrechen" }];
  if (z && istAdmin()) knoepfe.unshift({
    text: "Löschen", klasse: "gefahr", aktion: async () => {
      if (!confirm(`${r.einzahl} wirklich löschen? Das lässt sich nicht rückgängig machen.`)) return false;
      await api("DELETE", `${ressource}/${z.id}`);
      melde(`${r.einzahl} gelöscht.`);
      return "geloescht";
    },
  });
  knoepfe.push({
    text: "Speichern", klasse: "haupt-k", aktion: async (hg) => {
      const d = formularDaten(hg, ressource);
      const erg = z ? await api("PUT", `${ressource}/${z.id}`, d) : await api("POST", ressource, d);
      melde(z ? "Gespeichert." : `${r.einzahl} angelegt.`);
      return erg;
    },
  });
  const p = dialog(z ? `${r.einzahl} bearbeiten` : `${r.einzahl} anlegen`, formularHtml(ressource, z, vorgabe), knoepfe);
  formularVerdrahten(letzterDialog());
  const erg = await p;
  if (erg) cacheLeeren();
  return erg;
}

/* ---------- Generische Liste ---------- */
async function tabelle(ziel, ressource, opt = {}) {
  const r = S.schema[ressource];
  await refsLaden(ressource);
  const filter = opt.filter || {};
  const spalten = r.felder.filter((f) => f.liste && !(f.name in filter));
  const zustand = { q: "", objekt: "", extra: opt.extraStart || "" };
  const hatObjekt = r.felder.some((f) => f.name === "objekt_id") && !("objekt_id" in filter);
  const extraFilter = opt.extraFilter;

  ziel.innerHTML = `
    <div class="werkzeug">
      <input type="search" placeholder="In ${esc(r.label)} suchen" data-q>
      ${hatObjekt ? `<select data-objekt><option value="">Alle Objekte</option>${(S.cache.objekte || []).map((o) => `<option value="${o.id}">${esc(anzeige("objekte", o))}</option>`).join("")}</select>` : ""}
      ${extraFilter ? `<select data-extra>${extraFilter.optionen.map(([w, t]) => `<option value="${w}" ${w === zustand.extra ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>` : ""}
      ${darfAendern() && opt.neu !== false ? `<button class="knopf haupt-k" data-neu>${icon("plus")} ${esc(r.einzahl)}</button>` : ""}
      ${opt.export !== false ? `<a class="knopf" href="/api/export/${ressource}" title="Als Excel-Liste (CSV) speichern">${icon("export")} Excel</a>` : ""}
      <span class="anzahl" data-anzahl></span>
    </div>
    <div class="tabelle-wrap"><table><thead><tr>${spalten.map((f) => `<th class="${["money", "number"].includes(f.typ) && f.name !== "baujahr" ? "zahl" : ""}">${esc(f.label)}</th>`).join("")}</tr></thead><tbody data-body><tr><td class="leer" colspan="${spalten.length}">Wird geladen …</td></tr></tbody></table></div>`;

  let daten = [];
  const laden = async () => {
    const qs = new URLSearchParams(filter);
    if (zustand.q) qs.set("q", zustand.q);
    if (zustand.objekt) qs.set("objekt_id", zustand.objekt);
    if (ressource === "tickets" && zustand.extra === "offen") qs.set("offen", "1");
    daten = await api("GET", `${ressource}?${qs}`);
    if (extraFilter && extraFilter.lokal) daten = daten.filter((z) => extraFilter.lokal(z, zustand.extra));
    zeichnen();
  };
  const zeichnen = () => {
    const body = ziel.querySelector("[data-body]");
    ziel.querySelector("[data-anzahl]").textContent = `${daten.length} Einträge`;
    if (!daten.length) { body.innerHTML = `<tr><td class="leer" colspan="${spalten.length}">${opt.leer || "Noch keine Einträge."}</td></tr>`; return; }
    body.innerHTML = daten.map((z) => `<tr class="klickbar" data-id="${z.id}">${spalten.map((f) =>
      `<td class="${["money", "number"].includes(f.typ) && f.name !== "baujahr" ? "zahl" : ""}">${zelle(ressource, f, z)}</td>`).join("")}</tr>`).join("");
  };
  ziel.querySelector("[data-body]").addEventListener("click", async (e) => {
    const tr = e.target.closest("tr[data-id]");
    if (!tr) return;
    const z = daten.find((x) => x.id === Number(tr.dataset.id));
    if (DETAIL[ressource]) { location.hash = `#/${ressource}/${z.id}`; return; }
    if (!darfAendern()) return;
    if (await bearbeiten(ressource, z)) { await laden(); opt.nachAenderung && opt.nachAenderung(); }
  });
  let t;
  ziel.querySelector("[data-q]").addEventListener("input", (e) => { clearTimeout(t); t = setTimeout(() => { zustand.q = e.target.value; laden(); }, 250); });
  const os = ziel.querySelector("[data-objekt]");
  if (os) os.onchange = (e) => { zustand.objekt = e.target.value; laden(); };
  const ex = ziel.querySelector("[data-extra]");
  if (ex) ex.onchange = (e) => { zustand.extra = e.target.value; laden(); };
  const nb = ziel.querySelector("[data-neu]");
  if (nb) nb.onclick = async () => {
    const neu = opt.neuAktion ? await opt.neuAktion() : await bearbeiten(ressource, null, { ...filter });
    if (neu) { await laden(); opt.nachAenderung && opt.nachAenderung(); }
  };
  await laden();
}

function seitenkopf(titel, kicker = "", aktionen = "", zurueck = "") {
  return `${zurueck ? `<a class="zurueck" href="${zurueck[0]}">← ${esc(zurueck[1])}</a>` : ""}
  <div class="titelzeile"><div>${kicker ? `<div class="kicker">${esc(kicker)}</div>` : ""}<h1>${esc(titel)}</h1></div><div class="aktionen">${aktionen}</div></div>`;
}

function stammdaten(ressource, z, ohne = []) {
  return `<div class="felder">${S.schema[ressource].felder.filter((f) => !ohne.includes(f.name) && z[f.name] != null && z[f.name] !== "").map((f) =>
    `<div class="feld ${f.typ === "textarea" ? "breit" : ""}"><div class="lbl">${esc(f.label)}</div><div class="val">${f.typ === "ref"
      ? `<a href="#/${f.ref}/${z[f.name]}">${zelle(ressource, f, z)}</a>` : zelle(ressource, f, z)}</div></div>`).join("") || '<span class="klein">Keine Angaben.</span>'}</div>`;
}

function reiterLeiste(ziel, reiter, start) {
  const leiste = document.createElement("div");
  leiste.className = "reiter";
  const flaeche = document.createElement("div");
  leiste.innerHTML = reiter.map((r, i) => `<button data-i="${i}">${esc(r.titel)}${r.zahl != null ? `<span class="zahl">${r.zahl}</span>` : ""}</button>`).join("");
  ziel.append(leiste, flaeche);
  const zeig = (i) => {
    leiste.querySelectorAll("button").forEach((b) => b.classList.toggle("aktiv", Number(b.dataset.i) === i));
    flaeche.innerHTML = "";
    reiter[i].zeigen(flaeche);
    history.replaceState(null, "", location.hash.split("?")[0] + "?reiter=" + i);
  };
  leiste.onclick = (e) => { const b = e.target.closest("button"); if (b) zeig(Number(b.dataset.i)); };
  zeig(Math.min(start || 0, reiter.length - 1));
}

/* ---------- Seiten ---------- */
const SEITEN = {};
const DETAIL = {};

SEITEN.start = async (el) => {
  const d = await zaehlerNav();
  await Promise.all(["objekte", "anlagen", "dienstleister"].map((r) => lade(r)));
  const k = d.kennzahlen;
  const st = d.tickets_nach_status;
  const farben = { "Neu": "var(--orange)", "In Arbeit": "var(--arbeit)", "Warten auf Dienstleister": "var(--bald)", "Erledigt": "var(--ok)", "Abgeschlossen": "#9CC9A5" };
  const summe = Object.values(st).reduce((a, b) => a + b, 0) || 1;
  el.innerHTML = seitenkopf(`Guten ${new Date().getHours() < 11 ? "Morgen" : new Date().getHours() < 18 ? "Tag" : "Abend"}, ${S.ich.name.split(" ")[0]}`,
    new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    darfAendern() ? `<button class="knopf haupt-k" id="neuTicket">${icon("plus")} Störmeldung</button>` : "") + `
  <div class="raster k4">
    <a class="karte kennzahl ${k.tickets_offen ? "orange" : ""}" href="#/tickets"><div class="wert">${k.tickets_offen}</div><div class="text">offene Störmeldungen${k.tickets_notfall ? `, davon <b>${k.tickets_notfall} Notfall</b>` : ""}</div></a>
    <a class="karte kennzahl ${k.wartung_ueberfaellig ? "rot" : ""}" href="#/wartungen?f=ueber"><div class="wert">${k.wartung_ueberfaellig}</div><div class="text">Wartungen und Prüfungen überfällig</div></a>
    <a class="karte kennzahl ${k.wartung_30 ? "gelb" : ""}" href="#/wartungen?f=30"><div class="wert">${k.wartung_30}</div><div class="text">fällig in den nächsten 30 Tagen</div></a>
    <a class="karte kennzahl ${k.vertraege_kuendigen ? "gelb" : ""}" href="#/vertraege"><div class="wert">${k.vertraege_kuendigen}</div><div class="text">Verträge: Kündigungsfrist in 90 Tagen</div></a>
    <a class="karte kennzahl" href="#/objekte"><div class="wert">${k.objekte}</div><div class="text">Objekte</div></a>
    <a class="karte kennzahl" href="#/anlagen"><div class="wert">${k.anlagen}</div><div class="text">Anlagen</div></a>
  </div>
  <div class="abstand"></div>
  <div class="raster k2">
    <div class="karte"><h3>Fällig bis in 30 Tagen</h3>${d.faellig.length ? `<ul class="liste-einfach">${d.faellig.map((w) =>
      `<li><a href="#/wartungen/${w.id}"><b>${esc(w.titel)}</b><br><span class="klein">${esc(refText("objekte", w.objekt_id))} · ${esc(w.art)}</span></a><span class="rechts">${datum(w.naechste)}<br>${faelligMarke(w.naechste)}</span></li>`).join("")}</ul>` : '<p class="klein">Nichts fällig. Gut so.</p>'}</div>
    <div class="karte"><h3>Offene Störmeldungen</h3>
      <div class="balkenreihe">${Object.entries(st).map(([s, n]) => `<div style="width:${(n / summe) * 100}%;background:${farben[s] || "var(--grau)"}" title="${esc(s)}: ${n}"></div>`).join("")}</div>
      <div class="legende">${Object.entries(st).map(([s, n]) => `<span style="--c:${farben[s] || "var(--grau)"}">${esc(s)} ${n}</span>`).join("")}</div>
      ${d.tickets.length ? `<ul class="liste-einfach" style="margin-top:8px">${d.tickets.map((t) =>
      `<li>${prioMarke(t.prioritaet)}<a href="#/tickets/${t.id}"><b>${esc(t.titel)}</b><br><span class="klein">${esc(t.nummer)} · ${esc(refText("objekte", t.objekt_id))}</span></a><span class="rechts">${ticketMarke(t.status)}</span></li>`).join("")}</ul>` : '<p class="klein">Keine offenen Störmeldungen.</p>'}</div>
    ${d.kuendigen.length ? `<div class="karte"><h3>Kündigungsfristen</h3><ul class="liste-einfach">${d.kuendigen.map((v) =>
      `<li><a href="#/vertraege"><b>${esc(v.titel)}</b><br><span class="klein">${esc(refText("objekte", v.objekt_id))} · ${esc(refText("dienstleister", v.dienstleister_id))}</span></a><span class="rechts">kündigen bis<br><b>${datum(v.kuendigen_bis)}</b></span></li>`).join("")}</ul></div>` : ""}
  </div>`;
  const nt = document.getElementById("neuTicket");
  if (nt) nt.onclick = async () => { const t = await bearbeiten("tickets"); if (t) location.hash = `#/tickets/${t.id}`; };
};

SEITEN.objekte = async (el) => {
  el.innerHTML = seitenkopf("Objekte", "Liegenschaften") + '<div id="t"></div>';
  await tabelle(el.querySelector("#t"), "objekte", { leer: "Noch keine Objekte. Leg oben das erste an." });
};

SEITEN.anlagen = async (el) => {
  el.innerHTML = seitenkopf("Anlagen", "Technische Ausstattung") + '<div id="t"></div>';
  await tabelle(el.querySelector("#t"), "anlagen");
};

const wartungFilter = {
  optionen: [["", "Alle Fälligkeiten"], ["ueber", "Überfällig"], ["30", "Fällig in 30 Tagen"], ["90", "Fällig in 90 Tagen"], ["Prüfung", "Nur Prüfungen"], ["Wartung", "Nur Wartungen"]],
  lokal: (z, f) => {
    if (!f) return true;
    if (f === "ueber") return z.aktiv && tageBis(z.naechste) < 0;
    if (f === "30") return z.aktiv && tageBis(z.naechste) <= 30;
    if (f === "90") return z.aktiv && tageBis(z.naechste) <= 90;
    return z.art === f;
  },
};

SEITEN.wartungen = async (el, _, q) => {
  el.innerHTML = seitenkopf("Wartung & Prüfung", "Fristen und Intervalle") + '<div id="t"></div>';
  await tabelle(el.querySelector("#t"), "wartungen", { extraFilter: wartungFilter, extraStart: q.get("f") || "" });
};

const ticketFilter = { optionen: [["offen", "Nur offene"], ["", "Alle"]] };
SEITEN.tickets = async (el) => {
  el.innerHTML = seitenkopf("Störmeldungen", "Meldungen und Aufträge") + '<div id="t"></div>';
  await tabelle(el.querySelector("#t"), "tickets", { extraFilter: ticketFilter, extraStart: "offen" });
};
SEITEN.vertraege = async (el) => {
  el.innerHTML = seitenkopf("Verträge", "Laufzeiten und Kündigungsfristen") + '<div id="t"></div>';
  await tabelle(el.querySelector("#t"), "vertraege");
};
SEITEN.dienstleister = async (el) => {
  el.innerHTML = seitenkopf("Dienstleister", "Firmen und Kontakte") + '<div id="t"></div>';
  await tabelle(el.querySelector("#t"), "dienstleister");
};
SEITEN.zaehler = async (el) => {
  el.innerHTML = seitenkopf("Zähler", "Verbrauch und Ablesung") + '<div id="t"></div>';
  await tabelle(el.querySelector("#t"), "zaehler");
};
SEITEN.dokumente = async (el) => {
  el.innerHTML = seitenkopf("Dokumente", "Verträge, Protokolle, Berichte") + '<div id="t"></div>';
  await tabelle(el.querySelector("#t"), "dokumente", { neuAktion: () => hochladen({}), export: false });
};

/* Dokumente hochladen */
async function hochladen(vorgabe) {
  await refsLaden("dokumente");
  const html = `<div class="dfehler"></div><form class="formular" onsubmit="return false">
    <label class="breit"><span class="pflicht">Datei (höchstens 25 MB)</span><input type="file" name="datei" required></label>
    ${S.schema.dokumente.felder.filter((f) => !f.nurlesen).map((f) => `<label><span class="${f.pflicht ? "pflicht" : ""}">${esc(f.label)}</span>${eingabe(f, vorgabe[f.name])}</label>`).join("")}
  </form>`;
  const p = dialog("Dokument hochladen", html, [{ text: "Abbrechen" }, {
    text: "Hochladen", klasse: "haupt-k", aktion: async (hg) => {
      const datei = hg.querySelector('[name="datei"]').files[0];
      if (!datei) throw new Error("Bitte eine Datei auswählen.");
      if (datei.size > 25 * 1024 * 1024) throw new Error("Die Datei ist zu groß (höchstens 25 MB).");
      const inhalt = await new Promise((ok, nein) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1] || ""); r.onerror = nein; r.readAsDataURL(datei); });
      const d = formularDaten(hg, "dokumente");
      if (!d.titel) d.titel = datei.name.replace(/\.[^.]+$/, "");
      const erg = await api("POST", "dokumente", { ...d, dateiname: datei.name, inhalt });
      melde("Dokument hochgeladen.");
      return erg;
    },
  }]);
  const hg = letzterDialog();
  formularVerdrahten(hg);
  hg.querySelector('[name="datei"]').addEventListener("change", (e) => {
    const t = hg.querySelector('[name="titel"]');
    if (t && !t.value && e.target.files[0]) t.value = e.target.files[0].name.replace(/\.[^.]+$/, "");
  });
  const erg = await p;
  if (erg) cacheLeeren();
  return erg;
}

function dokumenteReiter(filter) {
  return async (f) => {
    f.innerHTML = '<div id="dt"></div>';
    await tabelle(f.querySelector("#dt"), "dokumente", { filter, neuAktion: () => hochladen(filter), export: false });
  };
}

DETAIL.dokumente = async (el, id) => {
  await refsLaden("dokumente");
  const z = await api("GET", `dokumente/${id}`);
  el.innerHTML = seitenkopf(z.titel, z.kategorie || "Dokument",
    `<a class="knopf haupt-k" href="/api/dokumente/${z.id}/datei" target="_blank" rel="noopener">Öffnen</a>
     <a class="knopf" href="/api/dokumente/${z.id}/datei" download>Herunterladen</a>
     ${darfAendern() ? '<button class="knopf" id="bearb">Bearbeiten</button>' : ""}`, ["#/dokumente", "Dokumente"]) +
    `<div class="karte">${stammdaten("dokumente", z)}</div>`;
  const b = document.getElementById("bearb");
  if (b) b.onclick = async () => { const e = await bearbeiten("dokumente", z); if (e === "geloescht") location.hash = "#/dokumente"; else if (e) route(); };
};

/* Objekt */
DETAIL.objekte = async (el, id, q) => {
  await Promise.all(["objekte", "dienstleister", "anlagen"].map((r) => lade(r)));
  const [o, anl, wart, tick, vert, zae, dok] = await Promise.all([
    api("GET", `objekte/${id}`), api("GET", `anlagen?objekt_id=${id}`), api("GET", `wartungen?objekt_id=${id}`),
    api("GET", `tickets?objekt_id=${id}&offen=1`), api("GET", `vertraege?objekt_id=${id}`), api("GET", `zaehler?objekt_id=${id}`), api("GET", `dokumente?objekt_id=${id}`)]);
  const ueber = wart.filter((w) => w.aktiv && tageBis(w.naechste) < 0).length;
  el.innerHTML = seitenkopf(o.name, o.kuerzel + (o.ort ? " · " + o.ort : ""),
    `${darfAendern() ? '<button class="knopf" id="bearb">Stammdaten bearbeiten</button>' : ""}<button class="knopf" onclick="print()">Drucken</button>`, ["#/objekte", "Objekte"]) + `
    <div class="raster k4">
      <div class="karte kennzahl orange"><div class="wert">${tick.length}</div><div class="text">offene Störmeldungen</div></div>
      <div class="karte kennzahl ${ueber ? "rot" : ""}"><div class="wert">${ueber}</div><div class="text">überfällige Termine</div></div>
      <div class="karte kennzahl"><div class="wert">${anl.length}</div><div class="text">Anlagen</div></div>
      <div class="karte kennzahl"><div class="wert">${o.flaeche_m2 ? zahl(o.flaeche_m2) : "–"}</div><div class="text">m² Fläche</div></div>
    </div><div class="abstand"></div>
    <div class="karte">${stammdaten("objekte", o, ["kuerzel", "name"])}</div><div id="r"></div>`;
  const b = document.getElementById("bearb");
  if (b) b.onclick = async () => { const e = await bearbeiten("objekte", o); if (e === "geloescht") location.hash = "#/objekte"; else if (e) route(); };
  const f = { objekt_id: String(id) };
  reiterLeiste(el.querySelector("#r"), [
    { titel: "Anlagen", zahl: anl.length, zeigen: (x) => tabelle(x, "anlagen", { filter: f }) },
    { titel: "Wartung & Prüfung", zahl: wart.length, zeigen: (x) => tabelle(x, "wartungen", { filter: f, extraFilter: wartungFilter }) },
    { titel: "Störmeldungen", zahl: tick.length, zeigen: (x) => tabelle(x, "tickets", { filter: f, extraFilter: ticketFilter, extraStart: "offen" }) },
    { titel: "Verträge", zahl: vert.length, zeigen: (x) => tabelle(x, "vertraege", { filter: f }) },
    { titel: "Zähler", zahl: zae.length, zeigen: (x) => tabelle(x, "zaehler", { filter: f }) },
    { titel: "Dokumente", zahl: dok.length, zeigen: dokumenteReiter(f) },
  ], Number(q.get("reiter") || 0));
};

/* Anlage */
DETAIL.anlagen = async (el, id, q) => {
  await refsLaden("anlagen");
  const a = await api("GET", `anlagen/${id}`);
  el.innerHTML = seitenkopf(a.bezeichnung, [refText("objekte", a.objekt_id), a.gewerk].filter(Boolean).join(" · "),
    `${darfAendern() ? `<button class="knopf" id="stoer">${icon("plus")} Störung melden</button><button class="knopf" id="bearb">Bearbeiten</button>` : ""}`, [`#/objekte/${a.objekt_id}`, refText("objekte", a.objekt_id)]) +
    `<div class="karte">${stammdaten("anlagen", a, ["bezeichnung"])}</div><div id="r"></div>`;
  const b = document.getElementById("bearb");
  if (b) b.onclick = async () => { const e = await bearbeiten("anlagen", a); if (e === "geloescht") location.hash = "#/anlagen"; else if (e) route(); };
  const s = document.getElementById("stoer");
  if (s) s.onclick = async () => { const t = await bearbeiten("tickets", null, { objekt_id: a.objekt_id, anlage_id: a.id, gewerk: a.gewerk }); if (t) location.hash = `#/tickets/${t.id}`; };
  const f = { anlage_id: String(id) };
  const v = { objekt_id: a.objekt_id, anlage_id: a.id };
  reiterLeiste(el.querySelector("#r"), [
    { titel: "Wartung & Prüfung", zeigen: (x) => tabelle(x, "wartungen", { filter: f, neuAktion: () => bearbeiten("wartungen", null, v) }) },
    { titel: "Störmeldungen", zeigen: (x) => tabelle(x, "tickets", { filter: f, neuAktion: () => bearbeiten("tickets", null, v) }) },
    { titel: "Dokumente", zeigen: dokumenteReiter(f) },
  ], Number(q.get("reiter") || 0));
};

/* Wartung */
DETAIL.wartungen = async (el, id) => {
  await refsLaden("wartungen");
  const [w, hist] = await Promise.all([api("GET", `wartungen/${id}`), api("GET", `wartungen/${id}/historie`)]);
  el.innerHTML = seitenkopf(w.titel, `${w.art} · ${refText("objekte", w.objekt_id)}`,
    `${darfAendern() ? '<button class="knopf haupt-k" id="erl">Als erledigt melden</button><button class="knopf" id="bearb">Bearbeiten</button>' : ""}`, ["#/wartungen", "Wartung & Prüfung"]) + `
    <div class="raster k4">
      <div class="karte kennzahl ${tageBis(w.naechste) < 0 ? "rot" : tageBis(w.naechste) <= 30 ? "gelb" : ""}"><div class="wert">${datum(w.naechste)}</div><div class="text">nächste Fälligkeit ${faelligMarke(w.naechste, w.aktiv)}</div></div>
      <div class="karte kennzahl"><div class="wert">${w.intervall_monate ? zahl(w.intervall_monate) : "–"}</div><div class="text">Monate Intervall</div></div>
      <div class="karte kennzahl"><div class="wert">${datum(w.letzte) || "–"}</div><div class="text">zuletzt erledigt</div></div>
    </div><div class="abstand"></div>
    <div class="karte">${stammdaten("wartungen", w, ["titel", "naechste", "letzte", "intervall_monate"])}</div><div class="abstand"></div>
    <div class="karte"><h3>Verlauf</h3>${hist.length ? `<table><thead><tr><th>Datum</th><th>Ergebnis</th><th>Bemerkung</th><th>Erfasst von</th></tr></thead><tbody>${hist.map((h) =>
      `<tr><td>${datum(h.datum)}</td><td><span class="marke ${h.ergebnis === "Ohne Mängel" || h.ergebnis === "Mängel behoben" ? "m-ok" : h.ergebnis === "Mängel offen" ? "m-ueber" : "m-arbeit"}">${esc(h.ergebnis)}</span>${h.ticket_id ? ` <a href="#/tickets/${h.ticket_id}">Störmeldung</a>` : ""}</td><td>${esc(h.bemerkung)}</td><td>${esc(h.erfasst_von)}</td></tr>`).join("")}</tbody></table>` : '<p class="klein">Noch nichts erfasst.</p>'}</div>
    <div id="r"></div>`;
  const b = document.getElementById("bearb");
  if (b) b.onclick = async () => { const e = await bearbeiten("wartungen", w); if (e === "geloescht") location.hash = "#/wartungen"; else if (e) route(); };
  const e = document.getElementById("erl");
  if (e) e.onclick = async () => {
    const p = dialog("Als erledigt melden", `<div class="dfehler"></div><form class="formular" onsubmit="return false">
      <label><span class="pflicht">Erledigt am</span><input type="date" name="datum" value="${heute()}" required></label>
      <label><span>Ergebnis</span><select name="ergebnis"><option>Ohne Mängel</option><option>Mängel behoben</option><option>Mängel offen</option><option>Nicht durchgeführt</option></select></label>
      <label class="breit"><span>Bemerkung</span><textarea name="bemerkung"></textarea></label>
      <label class="check breit"><input type="checkbox" name="ticket_anlegen" checked> Bei offenen Mängeln gleich eine Störmeldung anlegen</label>
      <p class="klein breit">Die nächste Fälligkeit rechnet das Programm aus dem Intervall (${zahl(w.intervall_monate)} Monate) neu aus.</p></form>`,
      [{ text: "Abbrechen" }, {
        text: "Speichern", klasse: "haupt-k", aktion: async (hg) => {
          const fm = hg.querySelector("form");
          const r = await api("POST", `wartungen/${id}/erledigt`, { datum: fm.datum.value, ergebnis: fm.ergebnis.value, bemerkung: fm.bemerkung.value, ticket_anlegen: fm.ticket_anlegen.checked });
          melde(r.ticket_id ? "Erledigt gemeldet und Störmeldung angelegt." : "Erledigt gemeldet.");
          return r;
        },
      }]);
    if (await p) { cacheLeeren(); route(); }
  };
  reiterLeiste(el.querySelector("#r"), [{ titel: "Dokumente (Protokolle, Prüfberichte)", zeigen: dokumenteReiter({ objekt_id: String(w.objekt_id), ...(w.anlage_id ? { anlage_id: String(w.anlage_id) } : {}) }) }], 0);
};

/* Störmeldung */
DETAIL.tickets = async (el, id) => {
  await refsLaden("tickets");
  const [t, kom] = await Promise.all([api("GET", `tickets/${id}`), api("GET", `tickets/${id}/kommentare`)]);
  const naechster = { "Neu": "In Arbeit", "In Arbeit": "Erledigt", "Warten auf Dienstleister": "Erledigt", "Erledigt": "Abgeschlossen" }[t.status];
  const dl = (S.cache.dienstleister || []).find((d) => d.id === t.dienstleister_id);
  el.innerHTML = seitenkopf(t.titel, `${t.nummer} · ${refText("objekte", t.objekt_id)}`,
    `${darfAendern() && naechster ? `<button class="knopf haupt-k" id="weiter">Status: ${esc(naechster)}</button>` : ""}
     ${darfAendern() ? '<button class="knopf" id="bearb">Bearbeiten</button>' : ""}`, ["#/tickets", "Störmeldungen"]) + `
    <div class="raster k2">
      <div class="karte"><div style="display:flex;gap:8px;margin-bottom:14px">${prioMarke(t.prioritaet)} ${ticketMarke(t.status)}</div>${stammdaten("tickets", t, ["titel", "nummer", "status", "prioritaet", ...(dl ? ["dienstleister_id"] : [])])}
        ${dl ? `<div class="abstand"></div><h3>Dienstleister</h3><b>${esc(dl.firma)}</b><br>${dl.ansprechpartner ? esc(dl.ansprechpartner) + "<br>" : ""}${dl.telefon ? `<a href="tel:${esc(dl.telefon.replace(/\s/g, ""))}">${esc(dl.telefon)}</a><br>` : ""}${dl.notdienst ? `Notdienst: <a href="tel:${esc(dl.notdienst.replace(/\s/g, ""))}">${esc(dl.notdienst)}</a><br>` : ""}${dl.email ? `<a href="mailto:${esc(dl.email)}?subject=${encodeURIComponent(t.nummer + " " + t.titel)}">${esc(dl.email)}</a>` : ""}` : ""}
      </div>
      <div class="karte"><h3>Verlauf</h3><div class="kommentare">${kom.map((k) => {
        const sys = k.text.startsWith("Status: ");
        return `<div class="kommentar ${sys ? "system" : ""}"><div class="wer">${esc(k.autor)} · ${datum(k.zeit)} ${k.zeit.slice(11, 16)}</div>${esc(k.text)}</div>`;
      }).join("") || '<p class="klein">Noch kein Eintrag.</p>'}</div>
      ${darfAendern() ? '<form id="kf" class="formular" style="margin-top:14px;grid-template-columns:1fr"><label>Notiz hinzufügen<textarea name="text" required placeholder="z. B. Firma beauftragt, Termin am …"></textarea></label><div><button class="knopf haupt-k">Hinzufügen</button></div></form>' : ""}
      </div>
    </div><div id="r"></div>`;
  const b = document.getElementById("bearb");
  if (b) b.onclick = async () => { const e = await bearbeiten("tickets", t); if (e === "geloescht") location.hash = "#/tickets"; else if (e) route(); };
  const w = document.getElementById("weiter");
  if (w) w.onclick = async () => { await api("PUT", `tickets/${id}`, { status: naechster }); melde(`Status: ${naechster}`); route(); };
  const kf = document.getElementById("kf");
  if (kf) kf.onsubmit = async (e) => { e.preventDefault(); try { await api("POST", `tickets/${id}/kommentare`, { text: kf.text.value }); route(); } catch (err) { melde(err.message, true); } };
  reiterLeiste(el.querySelector("#r"), [{ titel: "Dokumente und Fotos", zeigen: dokumenteReiter({ objekt_id: String(t.objekt_id), ticket_id: String(t.id) }) }], 0);
};

/* Zähler */
function balkenDiagramm(monate, einheit) {
  const eintraege = Object.entries(monate).sort().slice(-24);
  if (!eintraege.length) return '<p class="klein">Für ein Diagramm braucht es mindestens zwei Ablesungen.</p>';
  const max = Math.max(...eintraege.map((e) => e[1]), 1);
  const B = 760, H = 240, l = 56, u = 30, o = 14, bw = (B - l - 10) / eintraege.length;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => max * f);
  return `<div class="diagramm"><svg viewBox="0 0 ${B} ${H}" role="img" aria-label="Verbrauch je Monat">
    ${ticks.map((v) => { const y = H - u - (v / max) * (H - u - o); return `<line class="achse" x1="${l}" x2="${B - 6}" y1="${y}" y2="${y}"/><text x="${l - 6}" y="${y + 4}" text-anchor="end">${zahl(v, 0)}</text>`; }).join("")}
    ${eintraege.map(([m, v], i) => { const h = Math.max(0, (v / max) * (H - u - o)); const x = l + 4 + i * bw; return `<rect class="balken" x="${x}" y="${H - u - h}" width="${Math.max(bw - 6, 2)}" height="${h}" rx="2"><title>${m.split("-").reverse().join(".")}: ${zahl(v)} ${esc(einheit)}</title></rect><text x="${x + (bw - 6) / 2}" y="${H - 12}" text-anchor="middle">${m.slice(5)}/${m.slice(2, 4)}</text>`; }).join("")}
  </svg></div>`;
}

DETAIL.zaehler = async (el, id) => {
  await refsLaden("zaehler");
  const v = await api("GET", `zaehler/${id}/verbrauch`);
  const z = v.zaehler;
  const letzte = v.ablesungen[0];
  const jahr = Object.entries(v.monate).filter(([m]) => m.startsWith(String(new Date().getFullYear()))).reduce((a, [, x]) => a + x, 0);
  el.innerHTML = seitenkopf(z.bezeichnung || z.nummer, `${z.medium} · ${refText("objekte", z.objekt_id)}`,
    `${darfAendern() ? '<button class="knopf haupt-k" id="abl">Zählerstand erfassen</button><button class="knopf" id="bearb">Bearbeiten</button>' : ""}`, ["#/zaehler", "Zähler"]) + `
    <div class="raster k4">
      <div class="karte kennzahl orange"><div class="wert">${letzte ? zahl(letzte.stand) : "–"}</div><div class="text">letzter Stand ${esc(z.einheit || "")}${letzte ? ` am ${datum(letzte.datum)}` : ""}</div></div>
      <div class="karte kennzahl"><div class="wert">${zahl(jahr, 0)}</div><div class="text">${esc(z.einheit || "")} Verbrauch ${new Date().getFullYear()}</div></div>
      <div class="karte kennzahl"><div class="wert">${v.ablesungen.length}</div><div class="text">Ablesungen</div></div>
    </div><div class="abstand"></div>
    <div class="karte"><h3>Verbrauch je Monat (${esc(z.einheit || "")})</h3>${balkenDiagramm(v.monate, z.einheit || "")}</div><div class="abstand"></div>
    <div class="raster k2"><div class="karte">${stammdaten("zaehler", z, ["bezeichnung"])}</div>
    <div class="tabelle-wrap"><table><thead><tr><th>Datum</th><th class="zahl">Stand</th><th class="zahl">Verbrauch</th><th>Notiz</th></tr></thead><tbody>${v.ablesungen.map((a) =>
      `<tr class="${darfAendern() ? "klickbar" : ""}" data-id="${a.id}"><td>${datum(a.datum)}</td><td class="zahl">${zahl(a.stand)}</td><td class="zahl">${a.verbrauch == null ? "" : zahl(a.verbrauch)}</td><td>${esc(a.notiz)}</td></tr>`).join("") || '<tr><td colspan="4" class="leer">Noch keine Ablesung.</td></tr>'}</tbody></table></div></div>`;
  const b = document.getElementById("bearb");
  if (b) b.onclick = async () => { const e = await bearbeiten("zaehler", z); if (e === "geloescht") location.hash = "#/zaehler"; else if (e) route(); };
  const ab = document.getElementById("abl");
  if (ab) ab.onclick = async () => { if (await bearbeiten("ablesungen", null, { zaehler_id: z.id, datum: heute() })) route(); };
  el.querySelectorAll("tr[data-id]").forEach((tr) => tr.onclick = async () => {
    if (!darfAendern()) return;
    const a = v.ablesungen.find((x) => x.id === Number(tr.dataset.id));
    if (await bearbeiten("ablesungen", a)) route();
  });
};

/* Kalender */
SEITEN.kalender = async (el, _, q) => {
  const basis = q.get("m") ? new Date(q.get("m") + "-01T00:00:00") : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const jahr = basis.getFullYear(), mon = basis.getMonth();
  const erster = new Date(jahr, mon, 1);
  const start = new Date(erster); start.setDate(1 - ((erster.getDay() + 6) % 7));
  const ende = new Date(start); ende.setDate(start.getDate() + 41);
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const mstr = (d) => iso(d).slice(0, 7);
  await lade("objekte");
  const ein = await api("GET", `kalender?von=${iso(start)}&bis=${iso(ende)}`);
  const vor = new Date(jahr, mon - 1, 1), nach = new Date(jahr, mon + 1, 1);
  el.innerHTML = seitenkopf(basis.toLocaleDateString("de-DE", { month: "long", year: "numeric" }), "Kalender",
    `<a class="knopf" href="#/kalender?m=${mstr(vor)}">← Vormonat</a><a class="knopf" href="#/kalender">Heute</a><a class="knopf" href="#/kalender?m=${mstr(nach)}">Nächster Monat →</a>`) +
    `<div class="legende" style="margin-bottom:10px"><span style="--c:var(--orange)">Prüfung</span><span style="--c:var(--anthrazit)">Wartung</span><span style="--c:var(--ueber)">Störmeldung fällig</span><span style="--c:var(--bald)">Kündigungsfrist</span><span style="--c:var(--hellgrau)">blass = Folgetermin</span></div>
    <div class="kal">${["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((t) => `<div class="wt">${t}</div>`).join("")}
    ${Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const k = iso(d);
      const heute_ = k === heute();
      const liste = ein.filter((e) => e.datum === k);
      return `<div class="tag ${d.getMonth() !== mon ? "fremd" : ""} ${heute_ ? "heute" : ""}"><div class="nr">${d.getDate()}</div>${liste.slice(0, 5).map((e) =>
        `<a class="ein ${esc(e.art === "Inspektion" || e.art === "Begehung" ? "Wartung" : e.art)} ${e.geplant ? "geplant" : ""} ${e.ueberfaellig ? "ueber" : ""}" href="#/${e.typ === "vertraege" ? "vertraege" : e.typ + "/" + e.id}" title="${esc(e.art)}: ${esc(e.titel)} (${esc(refText("objekte", e.objekt_id))})${e.ueberfaellig ? " · überfällig seit " + datum(e.ueberfaellig) : ""}">${e.ueberfaellig ? "⚠ " : ""}${esc(e.titel)}</a>`).join("")}${liste.length > 5 ? `<span class="klein">+ ${liste.length - 5} weitere</span>` : ""}</div>`;
    }).join("")}</div>`;
};

/* Suche */
SEITEN.suche = async (el, wort) => {
  const q = decodeURIComponent(wort || "");
  document.getElementById("suchfeld").value = q;
  const t = await api("GET", "suche?q=" + encodeURIComponent(q));
  el.innerHTML = seitenkopf(`Suche: ${q}`, `${t.length} Treffer`) + `<div class="karte">${t.length ? `<ul class="liste-einfach">${t.map((x) =>
    `<li><span class="marke m-geplant">${esc(x.bereich)}</span><a href="#/${x.typ}${DETAIL[x.typ] ? "/" + x.id : ""}">${esc(x.titel)}</a></li>`).join("")}</ul>` : '<p class="klein">Nichts gefunden. Mindestens zwei Buchstaben eingeben.</p>'}</div>`;
};

/* Einstellungen */
SEITEN.einstellungen = async (el) => {
  el.innerHTML = seitenkopf("Einstellungen", S.ich.email) + `
  <div class="raster k2">
    <div class="karte"><h3>Passwort ändern</h3><form id="pw" class="formular" style="grid-template-columns:1fr">
      <label>Bisheriges Passwort<input type="password" name="alt" required autocomplete="current-password"></label>
      <label>Neues Passwort (mindestens 8 Zeichen)<input type="password" name="neu" required minlength="8" autocomplete="new-password"></label>
      <div><button class="knopf haupt-k">Ändern</button></div></form></div>
    ${istAdmin() ? '<div class="karte"><h3>Zugänge</h3><div id="bl"></div><div class="abstand"></div><button class="knopf haupt-k" id="neuB">' + icon("plus") + ' Zugang anlegen</button></div>' : ""}
  </div>
  ${istAdmin() ? '<div class="abstand"></div><div class="karte"><h3>Letzte Änderungen</h3><div id="vl" class="tabelle-wrap" style="box-shadow:none"></div></div>' : ""}`;
  el.querySelector("#pw").onsubmit = async (e) => {
    e.preventDefault();
    try { await api("POST", "benutzer/passwort", Object.fromEntries(new FormData(e.target))); melde("Passwort geändert."); e.target.reset(); }
    catch (err) { melde(err.message, true); }
  };
  if (!istAdmin()) return;
  const rollen = { admin: "Administrator", benutzer: "Bearbeiten", lesen: "Nur lesen" };
  const ladeB = async () => {
    const bl = await api("GET", "benutzer");
    el.querySelector("#bl").innerHTML = `<ul class="liste-einfach">${bl.map((b) => `<li><div><b>${esc(b.name)}</b>${b.aktiv ? "" : ' <span class="marke m-arbeit">gesperrt</span>'}<br><span class="klein">${esc(b.email)}</span></div>
      <span class="rechts"><select data-rolle="${b.id}">${Object.entries(rollen).map(([k, t]) => `<option value="${k}" ${k === b.rolle ? "selected" : ""}>${t}</option>`).join("")}</select>
      <button class="knopf klein" data-sperr="${b.id}" data-aktiv="${b.aktiv}">${b.aktiv ? "Sperren" : "Freigeben"}</button>
      <button class="knopf klein" data-pw="${b.id}">Passwort</button></span></li>`).join("")}</ul>`;
  };
  await ladeB();
  el.querySelector("#bl").addEventListener("change", async (e) => {
    const s = e.target.closest("[data-rolle]");
    if (!s) return;
    try { await api("PUT", `benutzer/${s.dataset.rolle}`, { rolle: s.value }); melde("Rolle geändert."); } catch (err) { melde(err.message, true); }
    ladeB();
  });
  el.querySelector("#bl").addEventListener("click", async (e) => {
    const s = e.target.closest("[data-sperr]"), p = e.target.closest("[data-pw]");
    try {
      if (s) { await api("PUT", `benutzer/${s.dataset.sperr}`, { aktiv: s.dataset.aktiv === "1" ? 0 : 1 }); ladeB(); }
      if (p) { const n = prompt("Neues Passwort (mindestens 8 Zeichen):"); if (n) { await api("PUT", `benutzer/${p.dataset.pw}`, { passwort: n }); melde("Passwort gesetzt."); } }
    } catch (err) { melde(err.message, true); }
  });
  el.querySelector("#neuB").onclick = async () => {
    const ok = await dialog("Zugang anlegen", `<div class="dfehler"></div><form class="formular" onsubmit="return false">
      <label><span class="pflicht">Name</span><input name="name" required></label><label><span class="pflicht">E-Mail</span><input name="email" type="email" required></label>
      <label><span class="pflicht">Erstes Passwort</span><input name="passwort" type="text" minlength="8" required></label>
      <label>Rolle<select name="rolle">${Object.entries(rollen).map(([k, t]) => `<option value="${k}" ${k === "benutzer" ? "selected" : ""}>${t}</option>`).join("")}</select></label></form>`,
      [{ text: "Abbrechen" }, { text: "Anlegen", klasse: "haupt-k", aktion: async (hg) => api("POST", "benutzer", Object.fromEntries(new FormData(hg.querySelector("form")))) }]);
    if (ok) { melde("Zugang angelegt."); ladeB(); }
  };
  const vl = await api("GET", "verlauf");
  const namen = Object.fromEntries(Object.entries(S.schema).map(([k, r]) => [k, r.einzahl]));
  el.querySelector("#vl").innerHTML = `<table><thead><tr><th>Zeit</th><th>Wer</th><th>Was</th><th>Bereich</th><th>Info</th></tr></thead><tbody>${vl.slice(0, 60).map((v) =>
    `<tr><td>${datum(v.zeit)} ${v.zeit.slice(11, 16)}</td><td>${esc(v.benutzer)}</td><td>${esc(v.aktion)}</td><td>${esc(namen[v.tabelle] || v.tabelle || "")}${v.datensatz && DETAIL[v.tabelle] && v.aktion !== "gelöscht" ? ` <a href="#/${v.tabelle}/${v.datensatz}">öffnen</a>` : ""}</td><td>${esc(v.info)}</td></tr>`).join("")}</tbody></table>`;
};

/* ---------- Router ---------- */
async function route() {
  if (!S.ich) return;
  const [pfad, query] = (location.hash.slice(1) || "/").split("?");
  const teile = pfad.split("/").filter(Boolean);
  const q = new URLSearchParams(query || "");
  const name = teile[0] || "start";
  document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("aktiv", a.dataset.nav === name));
  document.getElementById("seite").classList.remove("offen");
  const el = document.getElementById("inhalt");
  try {
    if (teile[1] && DETAIL[name] && /^\d+$/.test(teile[1])) await DETAIL[name](el, Number(teile[1]), q);
    else if (SEITEN[name]) await SEITEN[name](el, teile[1], q);
    else el.innerHTML = seitenkopf("Seite nicht gefunden") + '<a href="#/">Zur Übersicht</a>';
    if (name !== "start") zaehlerNav();
  } catch (e) {
    if (S.ich) el.innerHTML = seitenkopf("Das hat nicht geklappt") + `<div class="fehler">${esc(e.message)}</div>`;
  }
  window.scrollTo(0, 0);
}

async function start() {
  const s = await api("GET", "schema");
  S.schema = s.ressourcen;
  S.einheiten = s.medien_einheit;
  rahmen();
  window.onhashchange = route;
  await route();
}

(async () => {
  try {
    const st = await api("GET", "status");
    if (st.benutzer) { S.ich = st.benutzer; await start(); }
    else zeigeAnmeldung(st.einrichten);
  } catch (e) {
    $app.innerHTML = `<div class="laden">Das Programm ist gerade nicht erreichbar. ${esc(e.message)}</div>`;
  }
})();
