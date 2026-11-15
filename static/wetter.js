/* Casa CAFM – Datum und Wetter oben in der Kopfzeile */
"use strict";

const WETTER_TEXT = {
  0: "Klar", 1: "Überwiegend klar", 2: "Teilweise bewölkt", 3: "Bedeckt", 45: "Nebel", 48: "Nebel mit Reif",
  51: "Leichter Nieselregen", 53: "Nieselregen", 55: "Starker Nieselregen", 56: "Gefrierender Nieselregen", 57: "Gefrierender Nieselregen",
  61: "Leichter Regen", 63: "Regen", 65: "Starker Regen", 66: "Gefrierender Regen", 67: "Gefrierender Regen",
  71: "Leichter Schneefall", 73: "Schneefall", 75: "Starker Schneefall", 77: "Schneegriesel",
  80: "Regenschauer", 81: "Kräftige Regenschauer", 82: "Heftige Regenschauer", 85: "Schneeschauer", 86: "Starke Schneeschauer",
  95: "Gewitter", 96: "Gewitter mit Hagel", 99: "Gewitter mit Hagel",
};

function wetterArt(code) {
  if (code <= 1) return "klar";
  if (code === 2) return "teils";
  if (code === 3) return "wolke";
  if (code === 45 || code === 48) return "nebel";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "schnee";
  if (code >= 95) return "gewitter";
  return "regen";
}

function wetterIcon(code, tag = 1) {
  const art = wetterArt(code);
  const sonne = '<circle cx="12" cy="12" r="4.2" fill="#F5B335" stroke="none"/><g stroke="#F5B335">' +
    [0, 45, 90, 135, 180, 225, 270, 315].map((r) => `<line x1="12" y1="2.6" x2="12" y2="4.8" transform="rotate(${r} 12 12)"/>`).join("") + "</g>";
  const mond = '<path d="M15.5 4.5a7.5 7.5 0 1 0 4 12.2A6.2 6.2 0 0 1 15.5 4.5z" fill="#C9CFDB" stroke="none"/>';
  const wolke = (x = 0, y = 0, f = "#B7BDC7") => `<path transform="translate(${x} ${y})" d="M7 18h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.4A3.3 3.3 0 0 0 7 18z" fill="${f}" stroke="none"/>`;
  let innen;
  if (art === "klar") innen = tag ? sonne : mond;
  else if (art === "teils") innen = `<g transform="translate(-3 -3) scale(.8)">${tag ? sonne : mond}</g>${wolke(1, 1)}`;
  else if (art === "wolke") innen = wolke(0, -1, "#9EA4AE");
  else if (art === "nebel") innen = `${wolke(0, -3)}<g stroke="#9EA4AE"><line x1="4" y1="19" x2="20" y2="19"/><line x1="6" y1="22" x2="18" y2="22"/></g>`;
  else if (art === "regen") innen = `${wolke(0, -3, "#9EA4AE")}<g stroke="#2456A6"><line x1="8" y1="18" x2="7" y2="21"/><line x1="12" y1="18" x2="11" y2="21"/><line x1="16" y1="18" x2="15" y2="21"/></g>`;
  else if (art === "schnee") innen = `${wolke(0, -3)}<g fill="#6FA8DC" stroke="none"><circle cx="8" cy="19.5" r="1.2"/><circle cx="12" cy="21" r="1.2"/><circle cx="16" cy="19.5" r="1.2"/></g>`;
  else innen = `${wolke(0, -3, "#7E848E")}<path d="M12.5 15l-2.5 4h3l-2 4" stroke="#E0A500" fill="none"/>`;
  return `<svg class="wetter-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke-width="1.6" stroke-linecap="round">${innen}</svg>`;
}

const gradText = (v) => (v == null ? "–" : `${Math.round(v)} °C`);
let WETTER = null;

function kopfDatum() {
  const d = new Date();
  const lang = d.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const kurz = d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
  return `<span class="kd-lang">${lang}</span><span class="kd-kurz">${kurz}</span>`;
}

function kopfInfoZeichnen() {
  const box = document.getElementById("kopfInfo");
  if (!box) return;
  const w = WETTER;
  const wetter = !w || w.aus ? "" : w.fehler ? `<span class="kw-fehler" title="${esc(w.fehler)}">${wetterIcon(3)}<b>–</b></span>`
    : `<button class="kw" id="kwKnopf" aria-haspopup="dialog" title="Wetter in ${esc(w.ort)}: ${esc(WETTER_TEXT[w.jetzt.code] || "")}">
        ${wetterIcon(w.jetzt.code, w.jetzt.tag)}<b>${Math.round(w.jetzt.temp)}°</b><span class="kw-ort">${esc(w.ort)}</span></button>`;
  box.innerHTML = `<span class="kd" title="Heute">${kopfDatum()}</span>${wetter}`;
  const k = box.querySelector("#kwKnopf");
  if (k) k.onclick = (e) => { e.stopPropagation(); wetterFenster(k); };
}

function wetterFenster(anker) {
  const alt = document.getElementById("wetterPop");
  if (alt) { alt.remove(); return; }
  const w = WETTER, j = w.jetzt;
  const heute = w.tage[0];
  const frost = w.tage.slice(0, 2).some((t) => t.min != null && t.min <= 1);
  const pop = document.createElement("div");
  pop.id = "wetterPop"; pop.className = "wetter-pop"; pop.setAttribute("role", "dialog"); pop.setAttribute("aria-label", "Wetter");
  pop.innerHTML = `<div class="wp-kopf">${wetterIcon(j.code, j.tag)}<div><b>${gradText(j.temp)}</b><span>${esc(WETTER_TEXT[j.code] || "")}</span></div></div>
    <div class="wp-ort">${esc(w.ort)} · ${new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })}${w.alt ? " · letzter Stand" : ""}</div>
    <div class="wp-werte"><span>Gefühlt <b>${gradText(j.gefuehlt)}</b></span><span>Wind <b>${j.wind == null ? "–" : Math.round(j.wind) + " km/h"}</b></span>
      <span>Luftfeuchte <b>${j.feuchte == null ? "–" : Math.round(j.feuchte) + " %"}</b></span>${heute ? `<span>Heute <b>${gradText(heute.min)} bis ${gradText(heute.max)}</b></span>` : ""}</div>
    ${frost ? '<div class="wp-hinweis">Frost möglich. An Glätte und Winterdienst denken.</div>' : ""}
    <div class="wp-tage">${w.tage.map((t, i) => {
      const n = i === 0 ? "Heute" : i === 1 ? "Morgen" : new Date(t.datum + "T12:00:00").toLocaleDateString("de-DE", { weekday: "long" });
      return `<div class="wp-tag"><span>${n}</span>${wetterIcon(t.code)}<b>${Math.round(t.max)}°</b><small>${Math.round(t.min)}°</small>${t.regen != null ? `<em title="Regenwahrscheinlichkeit">${t.regen} %</em>` : ""}</div>`;
    }).join("")}</div>
    <div class="wp-quelle">Wetterdaten: Open-Meteo</div>`;
  document.body.appendChild(pop);
  const r = anker.getBoundingClientRect();
  pop.style.top = `${r.bottom + 8}px`;
  pop.style.left = `${Math.max(8, Math.min(window.innerWidth - pop.offsetWidth - 8, r.left + r.width / 2 - pop.offsetWidth / 2))}px`;
  const zu = (e) => { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener("click", zu); } };
  setTimeout(() => document.addEventListener("click", zu), 0);
  document.addEventListener("keydown", function esc_(e) { if (e.key === "Escape") { pop.remove(); document.removeEventListener("keydown", esc_); } });
}

async function wetterLaden() {
  try { WETTER = await api("GET", "wetter"); } catch (e) { WETTER = { fehler: "Wetter gerade nicht erreichbar.", ort: "" }; }
  kopfInfoZeichnen();
}

(() => {
  const altRahmen = rahmen;
  let uhr = null, wuhr = null;
  rahmen = function () {
    altRahmen.apply(this, arguments);
    const rechts = document.querySelector(".kopf .kopf-rechts");
    if (rechts && !document.getElementById("kopfInfo")) rechts.insertAdjacentHTML("beforebegin", '<div class="kopf-info" id="kopfInfo"></div>');
    kopfInfoZeichnen();
    wetterLaden();
    clearInterval(uhr); clearInterval(wuhr);
    uhr = setInterval(kopfInfoZeichnen, 60 * 1000);        // Datum nach Mitternacht
    wuhr = setInterval(wetterLaden, 20 * 60 * 1000);        // Wetter alle 20 Minuten
  };
})();

/* Einstellungen: Wetter an/aus und Ort (Administrator) */
(() => {
  const alt = SEITEN.einstellungen;
  SEITEN.einstellungen = async (el) => {
    await alt(el);
    if (!darf("einstellungen")) return;
    const ein = await einstellungenLaden(true);
    const box = document.createElement("div");
    box.innerHTML = `<div class="abstand"></div><div class="karte" id="wtEinst"><h3>Datum und Wetter oben</h3>
      <form class="formular" style="grid-template-columns:1fr" onsubmit="return false">
        <label class="wn-haken"><input type="checkbox" name="aktiv" ${ein.wetter_aktiv !== "0" ? "checked" : ""}> Wetter oben anzeigen</label>
        <label>Ort für das Wetter<input name="suche" value="${esc(ein.wetter_ort || "")}" placeholder="Ort eingeben, z. B. Frankfurt am Main" autocomplete="off"></label>
        <div id="wtTreffer" class="wt-treffer"></div>
        <p class="klein">Aktuell: <b id="wtAktuell">${esc(ein.wetter_ort || "")}</b>. Das Wetter kommt von Open-Meteo. Übertragen wird nur der Ort, keine Namen oder Daten aus dem Programm.</p>
        <div><button class="knopf haupt-k" id="wtSpeichern">Speichern</button></div>
      </form></div>`;
    el.appendChild(box);
    const f = box.querySelector("form");
    let gewaehlt = null, timer = null;
    f.suche.oninput = () => {
      clearTimeout(timer);
      const q = f.suche.value.trim();
      gewaehlt = null;
      if (q.length < 2) { box.querySelector("#wtTreffer").innerHTML = ""; return; }
      timer = setTimeout(async () => {
        try {
          const liste = await api("GET", `wetter/orte?q=${encodeURIComponent(q)}`);
          box.querySelector("#wtTreffer").innerHTML = liste.length ? liste.map((o, i) => `<button type="button" class="knopf klein" data-i="${i}">${esc(o.text)}</button>`).join("")
            : '<span class="klein">Kein Ort gefunden.</span>';
          box.querySelectorAll("#wtTreffer [data-i]").forEach((b) => b.onclick = () => {
            gewaehlt = liste[+b.dataset.i]; f.suche.value = gewaehlt.text;
            box.querySelectorAll("#wtTreffer [data-i]").forEach((x) => x.classList.toggle("haupt-k", x === b));
          });
        } catch (err) { box.querySelector("#wtTreffer").innerHTML = `<span class="klein">${esc(err.message)}</span>`; }
      }, 350);
    };
    box.querySelector("#wtSpeichern").onclick = async () => {
      const daten = { wetter_aktiv: f.aktiv.checked ? 1 : 0 };
      if (gewaehlt) Object.assign(daten, { wetter_ort: gewaehlt.name, wetter_lat: gewaehlt.lat, wetter_lon: gewaehlt.lon });
      else if (f.suche.value.trim() && f.suche.value.trim() !== (ein.wetter_ort || "")) { melde("Bitte den Ort aus der Liste unter dem Feld wählen.", true); return; }
      try {
        await api("PUT", "einstellungen", daten); const neu = await einstellungenLaden(true);
        box.querySelector("#wtAktuell").textContent = neu.wetter_ort || ""; melde("Gespeichert."); wetterLaden();
      } catch (err) { melde(err.message, true); }
    };
  };
})();
