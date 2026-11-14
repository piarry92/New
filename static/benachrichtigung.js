/* Casa CAFM – Benachrichtigungen (Glocke) und „Meine Aufgaben“ */
"use strict";

const GLOCKE = '<svg class="icon" viewBox="0 0 24 24"><path d="M18 16v-5a6 6 0 0 0-12 0v5l-2 2h16z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>';
const B_ICON = { zuweisung: "👤", bald: "⏰", ueber: "⚠️", info: "ℹ️" };
let bBekannt = null, bTakt = null;

function glockeEinbauen() {
  const rechts = document.querySelector(".kopf-rechts");
  if (!rechts || document.getElementById("glocke")) return;
  rechts.insertAdjacentHTML("afterbegin", `<div class="glocke-wrap"><button class="kopf-knopf glocke" id="glocke" title="Benachrichtigungen" aria-label="Benachrichtigungen">${GLOCKE}<span class="glocke-zahl" id="glockeZahl" hidden></span></button>
    <div class="glocke-panel" id="glockePanel" hidden></div></div>`);
  const knopf = document.getElementById("glocke"), panel = document.getElementById("glockePanel");
  knopf.onclick = (e) => { e.stopPropagation(); panel.hidden = !panel.hidden; if (!panel.hidden) benachrichtigungenLaden(); };
  document.addEventListener("click", (e) => { if (!e.target.closest(".glocke-wrap")) panel.hidden = true; });
  panel.addEventListener("click", async (e) => {
    const alle = e.target.closest("[data-b-alle]"), erlauben = e.target.closest("[data-b-erlauben]"), item = e.target.closest("[data-b]");
    if (alle) { await api("POST", "benachrichtigungen/gelesen", { alle: true }); benachrichtigungenLaden(); return; }
    if (erlauben) { try { await Notification.requestPermission(); } catch (err) { /* egal */ } benachrichtigungenLaden(); return; }
    if (item) {
      await api("POST", "benachrichtigungen/gelesen", { ids: [Number(item.dataset.b)] });
      panel.hidden = true;
      if (item.dataset.link) location.hash = item.dataset.link;
      benachrichtigungenLaden();
    }
  });
  clearInterval(bTakt);
  bTakt = setInterval(() => { if (!document.hidden && S.ich) benachrichtigungenLaden(); }, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && S.ich) benachrichtigungenLaden(); });
  benachrichtigungenLaden();
}

const vorZeit = (iso) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} Min.`;
  if (min < 1440) return `vor ${Math.round(min / 60)} Std.`;
  return datum(iso);
};

async function benachrichtigungenLaden() {
  let d;
  try { d = await api("GET", "benachrichtigungen"); } catch (e) { return; }
  const zahl_ = document.getElementById("glockeZahl"), panel = document.getElementById("glockePanel");
  if (!zahl_ || !panel) return;
  zahl_.textContent = d.ungelesen > 9 ? "9+" : d.ungelesen;
  zahl_.hidden = !d.ungelesen;
  const kannGeraet = "Notification" in window && Notification.permission === "default";
  panel.innerHTML = `<div class="gp-kopf"><b>Benachrichtigungen</b>${d.ungelesen ? '<button class="knopf klein" data-b-alle>Alle gelesen</button>' : ""}</div>
    <div class="gp-liste">${d.liste.length ? d.liste.map((b) => `<button class="gp-item ${b.gelesen ? "" : "neu"} gp-${esc(b.art || "info")}" data-b="${b.id}" data-link="${esc(b.link || "")}">
      <span class="gp-icon">${B_ICON[b.art] || B_ICON.info}</span><span class="gp-text"><b>${esc(b.titel)}</b><span>${esc(b.text || "")}</span><span class="gp-zeit">${vorZeit(b.zeit)}</span></span></button>`).join("")
      : '<p class="klein gp-leer">Keine Benachrichtigungen. Sobald dir ein Rundgang oder eine Checkliste zugewiesen wird oder etwas ansteht, erscheint es hier.</p>'}</div>
    ${kannGeraet ? '<button class="gp-fuss" data-b-erlauben>🔔 Auch als Hinweis am Rechner oder Handy anzeigen</button>' : ""}`;
  // Neue ungelesene Einträge melden
  const ungelesen = d.liste.filter((b) => !b.gelesen);
  if (bBekannt) {
    const neu = ungelesen.filter((b) => !bBekannt.has(b.id));
    neu.slice(0, 3).forEach((b) => {
      melde(b.titel);
      if ("Notification" in window && Notification.permission === "granted") {
        try {
          const n = new Notification(b.titel, { body: b.text || "", icon: "/favicon.png", tag: `cafm-${b.id}` });
          n.onclick = () => { window.focus(); if (b.link) location.hash = b.link; n.close(); };
        } catch (e) { /* manche Geräte erlauben das nur im Hintergrunddienst */ }
      }
    });
  }
  bBekannt = new Set(ungelesen.map((b) => b.id));
}

/* Übersicht: eigene Rundgänge und Checklisten oben anzeigen */
const startAlt = SEITEN.start;
SEITEN.start = async (el, ...rest) => {
  await startAlt(el, ...rest);
  let meine = [];
  try { meine = (await api("GET", `checklisten?zustaendig_id=${S.ich.id}`)).filter((c) => c.aktiv); } catch (e) { return; }
  if (!meine.length) return;
  meine.sort((a, b) => String(a.naechste_zeit || "9999").localeCompare(String(b.naechste_zeit || "9999")));
  const karte = document.createElement("div");
  karte.className = "karte meine-aufgaben";
  karte.innerHTML = `<div class="ma-kopf"><h3>Meine Rundgänge &amp; Checklisten</h3><a class="klein" href="#/checklisten?meine=1">Alle anzeigen</a></div>
    <div class="ma-liste">${meine.slice(0, 6).map((c) => {
      const t = c.naechste_zeit ? Math.round((new Date(c.naechste_zeit) - Date.now()) / 3600000) : null;
      const wann = !c.naechste_zeit ? "bei Bedarf" : t < 0 ? `überfällig seit ${datum(c.naechste_zeit)}` : t < 24 ? `heute um ${c.naechste_zeit.slice(11, 16)} Uhr` : `fällig ${datum(c.naechste_zeit)} um ${c.naechste_zeit.slice(11, 16)}`;
      const klasse = !c.naechste_zeit ? "m-geplant" : t < 0 ? "m-ueber" : c.erinnerung_ab && new Date(c.erinnerung_ab) <= new Date() ? "m-bald" : "m-geplant";
      return `<div class="ma-item"><span class="cl-art ${c.art === "Rundgang" ? "rg" : ""}">${c.art === "Rundgang" ? "Rundgang" : "Checkliste"}</span>
        <a href="#/checklisten/${c.id}"><b>${esc(c.titel)}</b><br><span class="klein">${esc(refText("objekte", c.objekt_id))}</span></a>
        <span class="marke ${klasse}">${wann}</span>${darf("wartung_erledigen") ? `<a class="knopf haupt-k klein" href="#/checklisten/${c.id}?durchfuehren=1">Durchführen</a>` : ""}</div>`;
    }).join("")}</div>`;
  const titel = el.querySelector(".titelzeile");
  if (titel) titel.after(karte);
};
