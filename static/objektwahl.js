/* Casa CAFM – Objekt oben in der Seitenleiste wählen: danach zeigen alle Bereiche nur dieses Objekt */
"use strict";

S.objekt = null;
S.alleObjekte = [];
const OW_KEY = "cafm-objekt";
const owAlleErlaubt = () => S.ich && S.ich.rolle !== "eigentuemer";
const owObjekt = () => S.alleObjekte.find((o) => o.id === Number(S.objekt)) || null;

async function owLaden() {
  try { S.alleObjekte = await api("GET", "objekte", undefined, { alle: true }); } catch (e) { S.alleObjekte = []; }
  let gespeichert = null;
  try { gespeichert = localStorage.getItem(OW_KEY); } catch (e) { /* ohne Speicher */ }
  S.owGewaehlt = gespeichert === "alle" && owAlleErlaubt();
  if (gespeichert && S.alleObjekte.some((o) => String(o.id) === gespeichert)) { S.objekt = Number(gespeichert); S.owGewaehlt = true; }
  else S.objekt = null;
  if (S.alleObjekte.length === 1) S.objekt = S.alleObjekte[0].id;
}

function owSetzen(id, neuZeichnen = true) {
  S.objekt = id ? Number(id) : null;
  S.owGewaehlt = true;
  try { localStorage.setItem(OW_KEY, S.objekt ? String(S.objekt) : "alle"); } catch (e) { /* egal */ }
  cacheLeeren();
  if (!neuZeichnen) return;
  rahmen();
  const m = location.hash.match(/^#\/(objekte|vorgaenge)\/(\d+)/);
  if (m && S.objekt && Number(m[2]) !== S.objekt) location.hash = `#/${m[1]}/${S.objekt}`;
  else route();
}

/* Liste der Objekte neu holen, ohne die Wahl zu ändern (neue Objekte erscheinen so sofort) */
async function owListeNeu() {
  try { S.alleObjekte = await api("GET", "objekte", undefined, { alle: true }); } catch (e) { /* alte Liste behalten */ }
}

async function owWaehlen(erzwungen = false) {
  await owListeNeu();
  const liste = S.alleObjekte;
  const html = `<p class="klein">${erzwungen ? "Bitte zuerst das Objekt wählen. Danach zeigen alle Bereiche nur dieses Objekt." : "Danach zeigen alle Bereiche nur dieses Objekt."}</p>
    <input type="search" id="owSuche" placeholder="Objekt suchen: Kürzel, Name, Ort …" style="width:100%;margin:6px 0 12px" autocomplete="off">
    <div class="ow-liste">${liste.map((o) => `<button type="button" class="ow-eintrag ${o.id === S.objekt ? "aktiv" : ""}" data-ow="${o.id}" data-text="${esc(`${o.kuerzel || ""} ${o.name || ""} ${o.ort || ""} ${o.strasse || ""}`.toLowerCase())}">
      ${o.bild ? `<img src="${objektBildUrl(o)}" alt="">` : `<span class="ow-haus">${icon("objekte")}</span>`}<span><b>${esc(o.kuerzel || "")}</b> ${esc(o.name || "")}<br><span class="klein">${esc([o.strasse, o.ort].filter(Boolean).join(", "))}</span></span></button>`).join("")}
    ${owAlleErlaubt() && liste.length > 1 ? `<button type="button" class="ow-eintrag ow-alle ${!S.objekt ? "aktiv" : ""}" data-ow=""><span class="ow-haus">${icon("start")}</span><span><b>Alle Objekte</b><br><span class="klein">Gesamtübersicht über alle Objekte</span></span></button>` : ""}</div>`;
  const wahl = dialog("Objekt wählen", html, erzwungen ? [] : [{ text: "Abbrechen" }]);
  const hg = [...document.querySelectorAll(".dialog-hg")].pop();
  const suche = hg.querySelector("#owSuche");
  suche.oninput = () => { const t = suche.value.trim().toLowerCase(); hg.querySelectorAll("[data-ow]").forEach((b) => { b.hidden = !!t && !(b.dataset.text || "alle objekte").includes(t); }); };
  hg.querySelectorAll("[data-ow]").forEach((b) => b.onclick = () => { hg.remove(); owSetzen(b.dataset.ow); });
  if (erzwungen) { const x = hg.querySelector(".x"); if (x) x.remove(); }
  setTimeout(() => suche.focus(), 30);
  return wahl;
}

/* Start: Objekte laden, gespeicherte Wahl übernehmen, sonst zuerst wählen lassen */
(() => {
  const altStart = start;
  start = async function () {
    await owLaden();
    await altStart.apply(this, arguments);
    if (!S.owGewaehlt && S.alleObjekte.length > 1 && !location.hash.match(/^#\/objekte\/\d+/)) owWaehlen(true);
  };
})();

/* Seitenleiste: Auswahlfeld unter dem Logo, „Objekte“ führt direkt zum gewählten Objekt */
(() => {
  const altRahmen = rahmen;
  rahmen = function () {
    altRahmen.apply(this, arguments);
    const logo = document.querySelector(".seite .logo");
    if (!logo || !S.ich) return;
    const o = owObjekt();
    const nurEins = S.alleObjekte.length <= 1;
    logo.insertAdjacentHTML("afterend", `<div class="objektwahl">
      <div class="ow-titel">Objekt</div>
      <button type="button" id="owKnopf" class="ow-knopf" ${nurEins ? "disabled" : ""} title="${nurEins ? "" : "Anderes Objekt wählen"}">
        ${o && o.bild ? `<img class="ow-bild" src="${objektBildUrl(o)}" alt="">` : `<span class="ow-bild">${icon("objekte")}</span>`}
        <span class="ow-name"><small>Objekt</small>${o ? `<b>${esc(o.kuerzel || o.name || "")}</b><em>${esc(o.name || "")}</em>` : "<b>Alle Objekte</b><em>Gesamtübersicht</em>"}</span>${nurEins ? "" : '<span class="ow-pfeil">▾</span>'}</button></div>`);
    const k = document.getElementById("owKnopf");
    if (k && !nurEins) k.onclick = () => owWaehlen(false);
    const a = document.querySelector('#nav a[data-nav="objekte"]');
    if (a && o) { a.href = `#/objekte/${o.id}`; const t = a.querySelector("span"); if (t) t.textContent = "Objekt"; }
  };
})();

/* Wer ein anderes Objekt direkt öffnet (Link, Benachrichtigung), wechselt automatisch dorthin */
(() => {
  const altRoute = route;
  route = async function () {
    const m = location.hash.match(/^#\/(?:objekte|vorgaenge)\/(\d+)/);
    if (m && S.objekt && Number(m[1]) !== S.objekt && !S.alleObjekte.some((o) => o.id === Number(m[1]))) await owListeNeu();   // gerade erst angelegt?
    if (m && S.objekt && Number(m[1]) !== S.objekt && S.alleObjekte.some((o) => o.id === Number(m[1]))) {
      owSetzen(m[1], false);
      rahmen();
    }
    return altRoute.apply(this, arguments);
  };
})();
