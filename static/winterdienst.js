/* Casa CAFM – Winterdienst: Warnung bei Neuschnee und Glätte, Einsätze mit Vorher-/Nachher-Fotos, Protokoll */
"use strict";

const wdZeit = (iso) => iso ? `${datum(iso)} ${iso.slice(11, 16)}` : "";
const wdUhr = (iso) => iso ? iso.slice(11, 16) : "";
const wdCm = (v) => v == null || v === "" ? "–" : `${Number(v).toLocaleString("de-DE", { maximumFractionDigits: 1 })} cm`;
const wdGrad = (v) => v == null || v === "" ? "–" : `${Math.round(v)} °C`;
const wdTag = (iso) => {
  const d = new Date(iso + "T12:00:00"), h = new Date(); h.setHours(12, 0, 0, 0);
  const diff = Math.round((d - h) / 86400000);
  return diff === 0 ? "Heute" : diff === 1 ? "Morgen" : diff === -1 ? "Gestern" : d.toLocaleDateString("de-DE", { weekday: "long" });
};
function wdDauer(a, b) {
  if (!a || !b) return "";
  const min = Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000));
  return min < 60 ? `${min} Min.` : `${Math.floor(min / 60)} Std. ${String(min % 60).padStart(2, "0")} Min.`;
}
const wdTaten = (e) => [e.geraeumt ? "geräumt" : "", e.gestreut ? `gestreut${e.streumittel ? ` (${e.streumittel})` : ""}` : ""].filter(Boolean).join(", ")
  || (e.status === "erledigt" ? (e.anlass === "Kontrollgang" ? "kontrolliert" : "–") : "");
const wdStatus = (e) => e.status === "erledigt" ? '<span class="marke m-ok">erledigt</span>' : '<span class="marke m-bald">läuft</span>';
const wdFotoUrl = (id) => `${location.origin}/api/winterdienstfotos/${id}`;

/* Fotofeld: Pflicht, bis 8 Fotos, auf dem Handy direkt mit der Kamera */
function wdFotoFeld(box, titel, hinweis) {
  const bilder = [];
  box.innerHTML = `<div class="sl-foto-kopf"><b>${esc(titel)}</b> <span class="pflicht-stern">Pflicht</span></div>
    <div class="sl-fotos"></div>
    <label class="knopf sl-foto-knopf">${icon("plus")} Foto aufnehmen<input type="file" accept="image/*" capture="environment" multiple hidden></label>
    <span class="klein">${esc(hinweis)}</span>`;
  const zeigen = () => {
    box.querySelector(".sl-fotos").innerHTML = bilder.map((b, i) => `<div class="sl-foto"><img src="${b}" alt="Foto ${i + 1}"><button type="button" data-weg="${i}" aria-label="Foto entfernen">×</button></div>`).join("");
    box.classList.toggle("hat-foto", bilder.length > 0);
  };
  box.querySelector("input").onchange = async (e) => {
    for (const d of [...e.target.files]) {
      if (bilder.length >= 8) { melde("Höchstens 8 Fotos.", true); break; }
      try { bilder.push(await slBildVerkleinern(d)); } catch (err) { melde(err.message, true); }
    }
    e.target.value = "";
    zeigen();
  };
  box.addEventListener("click", (e) => { const w = e.target.closest("[data-weg]"); if (w) { bilder.splice(Number(w.dataset.weg), 1); zeigen(); } });
  return { daten: () => [...bilder] };
}

/* Vorhersage-Kacheln (heute, morgen, übermorgen) */
function wdLageHtml(lage) {
  if (!lage.aktiv) return '<p class="klein">Die Winterdienst-Warnung ist unter Einstellungen ausgeschaltet.</p>';
  if (!lage.tage.length) return `<p class="klein">${lage.fehler ? esc(lage.fehler) : "Die Vorhersage wird gleich geholt. Das Programm prüft jede Stunde."}</p>`;
  return `<div class="wd-tage">${lage.tage.map((t) => {
    const schnee = t.neuschnee_cm >= lage.schwelle, glatt = t.glaette;
    return `<div class="wd-tag ${schnee ? "warn-schnee" : glatt ? "warn-glatt" : ""}">
      <div class="wd-tag-k">${wdTag(t.datum)} <span>${datum(t.datum).slice(0, 6)}</span></div>
      <div class="wd-tag-w">${t.neuschnee_cm > 0 ? wdCm(t.neuschnee_cm) : "kein Neuschnee"}</div>
      <div class="wd-tag-t">${t.ab && t.neuschnee_cm > 0 ? `ab ca. ${t.ab} Uhr · ` : ""}${wdGrad(t.temp_min)} bis ${wdGrad(t.temp_max)}</div>
      ${schnee ? '<span class="marke m-ueber">Neuschnee: Winterdienst einplanen</span>' : glatt ? `<span class="marke m-bald">${t.eisregen ? "Eisregen möglich" : "Glättegefahr"}</span>` : '<span class="marke m-ok">keine Warnung</span>'}
    </div>`;
  }).join("")}</div>
  <p class="klein">Vorhersage für ${esc(lage.ort || "")}${lage.stand ? `, Stand ${wdZeit(lage.stand)} Uhr` : ""}. Warnung ab ${wdCm(lage.schwelle)} Neuschnee. Wetterdaten: Open-Meteo.</p>`;
}

/* ---------- Seite ---------- */
SEITEN.winterdienst = async (el, _, q) => {
  await Promise.all([lade("objekte"), einstellungenLaden()]);
  const [lage, liste] = await Promise.all([api("GET", "winterdienst/lage"), api("GET", "winterdienst")]);
  const objektFilter = q.get("objekt") || "";
  const gefiltert = liste.filter((e) => !objektFilter || String(e.objekt_id) === objektFilter);
  const laufend = liste.filter((e) => e.status === "läuft");
  const saisonStart = (() => { const h = new Date(); const j = h.getMonth() >= 6 ? h.getFullYear() : h.getFullYear() - 1; return `${j}-10-01`; })();
  const saison = liste.filter((e) => (e.beginn || "") >= saisonStart);
  el.innerHTML = seitenkopf("Winterdienst", "Räumen und Streuen",
    `${darf("einstellungen") ? '<button class="knopf" id="wdPruefen">Vorhersage jetzt prüfen</button>' : ""}${darf("winterdienst") ? `<button class="knopf haupt-k" id="wdNeu">${icon("plus")} Einsatz beginnen</button>` : ""}`) + `
    <div class="karte"><h3>Wetterwarnung</h3>${wdLageHtml(lage)}</div>
    <div class="abstand"></div>
    <div class="raster k4">
      <div class="karte kennzahl ${laufend.length ? "gelb" : ""}"><div class="wert">${laufend.length}</div><div class="text">Einsätze laufen gerade</div></div>
      <div class="karte kennzahl"><div class="wert">${saison.length}</div><div class="text">Einsätze diese Saison (ab 1. Oktober)</div></div>
      <div class="karte kennzahl"><div class="wert">${saison.filter((e) => e.quelle === "Winterdienst-Link").length}</div><div class="text">davon von der Winterdienst-Firma</div></div>
      <div class="karte kennzahl ${lage.warnungen.length ? "rot" : ""}"><div class="wert">${lage.warnungen.length}</div><div class="text">offene Warnungen ab heute</div></div>
    </div>
    ${laufend.length ? `<div class="abstand"></div><div class="karte"><h3>Läuft gerade</h3><ul class="liste">${laufend.map((e) => `<li class="wd-lauf">
      <a href="#/winterdienst/${e.id}"><b>${esc(e.nummer || "")} · ${esc(e.o_kuerzel || "")}</b> ${esc(e.anlass)} · ${esc(e.ausgefuehrt_von)}${e.firma ? ` (${esc(e.firma)})` : ""} · seit ${wdZeit(e.beginn)} Uhr</a>
      ${darf("winterdienst") ? `<button class="knopf klein haupt-k" data-ende="${e.id}">Abschließen</button>` : ""}</li>`).join("")}</ul></div>` : ""}
    <div class="abstand"></div>
    <div class="karte"><div class="karte-kopf"><h3>Einsätze</h3>
      <select id="wdObjekt" aria-label="Objekt"><option value="">Alle Objekte</option>${(S.cache.objekte || []).map((o) => `<option value="${o.id}" ${String(o.id) === objektFilter ? "selected" : ""}>${esc(anzeige("objekte", o))}</option>`).join("")}</select></div>
      ${gefiltert.length ? `<div class="tabelle-wrap" style="box-shadow:none"><table><thead><tr><th>Nr.</th><th>Objekt</th><th>Beginn</th><th>Dauer</th><th>Anlass</th><th>Neuschnee</th><th>Maßnahmen</th><th>Ausgeführt von</th><th>Fotos</th><th>Status</th></tr></thead><tbody>
      ${gefiltert.map((e) => `<tr class="klickbar" data-zu="${e.id}"><td><b>${esc(e.nummer || "")}</b></td><td>${esc(e.o_kuerzel || "")}</td><td>${wdZeit(e.beginn)}</td>
        <td>${wdDauer(e.beginn, e.ende)}</td><td>${esc(e.anlass)}</td><td>${e.neuschnee_cm != null ? wdCm(e.neuschnee_cm) : ""}</td><td>${esc(wdTaten(e))}</td>
        <td>${esc(e.ausgefuehrt_von)}${e.firma ? `<br><span class="klein">${esc(e.firma)}</span>` : ""}${e.quelle === "Winterdienst-Link" ? '<br><span class="klein">über Link</span>' : ""}</td>
        <td>${e.n_vorher} vorher · ${e.n_nachher} nachher</td><td>${wdStatus(e)}</td></tr>`).join("")}</tbody></table></div>`
        : '<p class="klein">Noch keine Einsätze. Mit „Einsatz beginnen“ startest du das erste Protokoll.</p>'}
    </div>
    <div id="wdLinks"></div>`;
  el.querySelector("#wdObjekt").onchange = (e) => { location.hash = `#/winterdienst${e.target.value ? `?objekt=${e.target.value}` : ""}`; };
  el.querySelectorAll("[data-zu]").forEach((tr) => tr.onclick = () => { location.hash = `#/winterdienst/${tr.dataset.zu}`; });
  el.querySelectorAll("[data-ende]").forEach((b) => b.onclick = async () => { if (await wdAbschliessen(Number(b.dataset.ende))) route(); });
  const neu = el.querySelector("#wdNeu");
  if (neu) neu.onclick = async () => { const e = await wdBeginnen({ objekt_id: objektFilter, lage }); if (e) location.hash = `#/winterdienst/${e.id}`; };
  const pr = el.querySelector("#wdPruefen");
  if (pr) pr.onclick = async () => {
    pr.disabled = true; pr.textContent = "Wird geprüft …";
    try { const r = await api("POST", "winterdienst/pruefen"); melde(r.fehler || (r.aus ? "Die Warnung ist ausgeschaltet." : r.neu ? `${r.neu} neue Warnung(en).` : "Vorhersage geprüft. Keine neue Warnung."), !!r.fehler); route(); }
    catch (err) { melde(err.message, true); pr.disabled = false; pr.textContent = "Vorhersage jetzt prüfen"; }
  };
  if (darf("anlagen_bearbeiten")) wdLinksKarte(el.querySelector("#wdLinks"));
};

/* ---------- Einsatz ansehen ---------- */
DETAIL.winterdienst = async (el, id) => {
  const e = await api("GET", `winterdienst/${id}`);
  const fotos = (art) => e.fotos.filter((f) => f.art === art);
  const fotoListe = (art) => fotos(art).length ? fotos(art).map((f) => `<a href="${wdFotoUrl(f.id)}" target="_blank" rel="noopener"><img src="${wdFotoUrl(f.id)}" alt="${art === "vorher" ? "Vorher" : "Nachher"}-Foto"><span>${wdZeit(f.zeit)}</span></a>`).join("")
    : `<p class="klein">${art === "nachher" && e.status === "läuft" ? "Kommt beim Abschließen." : "Keine Fotos."}</p>`;
  el.innerHTML = seitenkopf(`${e.nummer || "Einsatz"} · ${e.o_kuerzel || ""}`, `Winterdienst · ${e.anlass}`,
    `<button class="knopf" id="wdDruck">Protokoll (PDF)</button>${darf("winterdienst") && e.status === "läuft" ? '<button class="knopf haupt-k" id="wdEnde">Abschließen</button>' : ""}`,
    ["#/winterdienst", "Winterdienst"]) + `
    <div class="raster k2">
      <div class="karte"><h3>Einsatz</h3><div class="felder">
        <div><small>Objekt</small>${esc([e.o_kuerzel, e.o_name].filter(Boolean).join(" · "))}</div>
        <div><small>Status</small>${wdStatus(e)}</div>
        <div><small>Beginn</small>${wdZeit(e.beginn)} Uhr</div>
        <div><small>Ende</small>${e.ende ? `${wdZeit(e.ende)} Uhr (${wdDauer(e.beginn, e.ende)})` : "–"}</div>
        <div><small>Ausgeführt von</small>${esc(e.ausgefuehrt_von)}${e.firma ? `, ${esc(e.firma)}` : ""}</div>
        <div><small>Erfasst über</small>${esc(e.quelle === "Winterdienst-Link" ? "Link für die Winterdienst-Firma" : "Programm")}</div>
      </div></div>
      <div class="karte"><h3>Maßnahmen</h3><div class="felder">
        <div><small>Anlass</small>${esc(e.anlass)}</div>
        <div><small>Neuschnee</small>${wdCm(e.neuschnee_cm)}</div>
        <div><small>Geräumt</small>${e.geraeumt ? "ja" : e.status === "erledigt" ? "nein" : "–"}</div>
        <div><small>Gestreut</small>${e.gestreut ? `ja${e.streumittel ? `, ${esc(e.streumittel)}` : ""}${e.streumenge ? `, ${esc(e.streumenge)}` : ""}` : e.status === "erledigt" ? "nein" : "–"}</div>
        <div><small>Temperatur</small>${wdGrad(e.temperatur)}</div>
        <div><small>Flächen</small>${esc(e.flaechen || "–")}</div>
        ${e.bemerkung ? `<div style="grid-column:1/-1"><small>Bemerkung</small>${esc(e.bemerkung)}</div>` : ""}
      </div></div>
    </div>
    <div class="abstand"></div>
    <div class="raster k2 wd-vergleich">
      <div class="karte"><div class="karte-kopf"><h3>Vorher</h3>${darf("winterdienst") ? '<button class="knopf klein" data-mehr="vorher">Foto ergänzen</button>' : ""}</div><div class="wd-fotos">${fotoListe("vorher")}</div></div>
      <div class="karte"><div class="karte-kopf"><h3>Nachher</h3>${darf("winterdienst") && e.status === "erledigt" ? '<button class="knopf klein" data-mehr="nachher">Foto ergänzen</button>' : ""}</div><div class="wd-fotos">${fotoListe("nachher")}</div></div>
    </div>`;
  el.querySelector("#wdDruck").onclick = () => wdProtokoll(e);
  const ende = el.querySelector("#wdEnde");
  if (ende) ende.onclick = async () => { if (await wdAbschliessen(e.id)) route(); };
  el.querySelectorAll("[data-mehr]").forEach((b) => b.onclick = async () => {
    const art = b.dataset.mehr;
    let feld = null;
    const offen = dialog(art === "vorher" ? "Vorher-Foto ergänzen" : "Nachher-Foto ergänzen", '<div class="dfehler"></div><div id="wdMehr" class="sl-fotobox"></div>', [
      { text: "Abbrechen" },
      { text: "Speichern", klasse: "haupt-k", aktion: async () => api("POST", `winterdienst/${e.id}/fotos`, { art, fotos: feld.daten() }) }]);
    feld = wdFotoFeld(document.getElementById("wdMehr"), "Fotos", "Gleicher Blickwinkel wie beim anderen Foto hilft beim Vergleich.");
    if (await offen) route();
  });
};

/* ---------- Einsatz beginnen ---------- */
async function wdBeginnen(vorgabe = {}) {
  await Promise.all([lade("objekte"), lade("dienstleister").catch(() => {})]);
  const lage = vorgabe.lage || await api("GET", "winterdienst/lage");
  const heute = new Date().toISOString().slice(0, 10);
  const tag = lage.tage.find((t) => t.datum === heute);
  const objekte = S.cache.objekte || [];
  const start = String(vorgabe.objekt_id || (objekte.length === 1 ? objekte[0].id : ""));
  const html = `<div class="dfehler"></div><form class="formular" onsubmit="return false">
    <label class="breit"><span class="pflicht">Objekt</span><select name="objekt_id"><option value="">Bitte wählen</option>${objekte.map((o) => `<option value="${o.id}" ${String(o.id) === start ? "selected" : ""}>${esc(anzeige("objekte", o))}</option>`).join("")}</select></label>
    <label><span class="pflicht">Anlass</span><select name="anlass">${["Neuschnee", "Glätte / Eisregen", "Reifglätte", "Kontrollgang"].map((a) => `<option>${a}</option>`).join("")}</select></label>
    <label><span>Neuschnee in cm</span><input name="neuschnee_cm" inputmode="decimal" placeholder="${tag && tag.neuschnee_cm ? `laut Vorhersage ${String(tag.neuschnee_cm).replace(".", ",")}` : "z. B. 5"}"></label>
    <label><span class="pflicht">Ausgeführt von</span><input name="ausgefuehrt_von" value="${esc(S.ich.name)}"></label>
    <label><span>Firma</span><input name="firma" placeholder="z. B. Hausmeisterdienst"></label>
    <label class="breit"><span>Dienstleister (aus der Liste)</span><select name="dienstleister_id"><option value="">–</option>${(S.cache.dienstleister || []).map((d) => `<option value="${d.id}">${esc(anzeige("dienstleister", d))}</option>`).join("")}</select></label>
    <div class="breit sl-fotobox" id="wdVorher"></div>
  </form>`;
  let feld;
  setTimeout(() => { feld = wdFotoFeld(document.getElementById("wdVorher"), "Vorher-Fotos", "Vor dem Räumen oder Streuen: Gehwege, Zufahrt und Eingänge so fotografieren, dass der Schnee gut zu sehen ist."); }, 0);
  return dialog("Winterdienst-Einsatz beginnen", html, [
    { text: "Abbrechen" },
    { text: "Einsatz beginnen", klasse: "haupt-k", aktion: async (hg) => {
      const f = hg.querySelector("form");
      const dl = f.dienstleister_id.value;
      const r = await api("POST", "winterdienst/beginnen", {
        objekt_id: f.objekt_id.value, anlass: f.anlass.value, neuschnee_cm: f.neuschnee_cm.value, ausgefuehrt_von: f.ausgefuehrt_von.value,
        firma: f.firma.value || (dl ? anzeige("dienstleister", (S.cache.dienstleister || []).find((d) => String(d.id) === dl) || {}) : ""), dienstleister_id: dl, fotos: feld.daten() });
      melde(`Einsatz ${r.nummer} begonnen. Nach dem Räumen bitte abschließen.`);
      return r;
    } }]);
}

/* ---------- Einsatz abschließen ---------- */
function wdAbschlussFelder(streumittel) {
  return `<div class="breit wd-haken"><label class="wn-haken"><input type="checkbox" name="geraeumt"> Geräumt</label><label class="wn-haken"><input type="checkbox" name="gestreut"> Gestreut</label></div>
    <label><span>Streumittel</span><select name="streumittel"><option value="">–</option>${streumittel.map((s) => `<option>${s}</option>`).join("")}</select></label>
    <label><span>Streumenge</span><input name="streumenge" placeholder="z. B. 2 Eimer, 25 kg"></label>
    <label class="breit"><span>Flächen</span><input name="flaechen" placeholder="z. B. Gehweg vorne, Zufahrt Tiefgarage, Eingänge"></label>
    <label><span>Temperatur in °C</span><input name="temperatur" inputmode="decimal" placeholder="z. B. -2"></label>
    <label class="breit"><span>Bemerkung</span><textarea name="bemerkung" placeholder="z. B. Streugut nachfüllen, Glatteis am Hintereingang"></textarea></label>
    <div class="breit sl-fotobox" id="wdNachher"></div>`;
}
const wdAbschlussDaten = (f, fotos) => ({ geraeumt: f.geraeumt.checked, gestreut: f.gestreut.checked, streumittel: f.streumittel.value, streumenge: f.streumenge.value,
  flaechen: f.flaechen.value, temperatur: f.temperatur.value, bemerkung: f.bemerkung.value, fotos });

async function wdAbschliessen(id) {
  const e = await api("GET", `winterdienst/${id}`);
  let feld;
  setTimeout(() => { feld = wdFotoFeld(document.getElementById("wdNachher"), "Nachher-Fotos", "Nach dem Räumen oder Streuen: möglichst aus dem gleichen Blickwinkel wie vorher."); }, 0);
  return dialog(`${e.nummer} abschließen`, `<div class="dfehler"></div><p class="klein">${esc(e.o_kuerzel || "")} · ${esc(e.anlass)} · seit ${wdZeit(e.beginn)} Uhr · ${esc(e.ausgefuehrt_von)}</p>
    <form class="formular" onsubmit="return false">${wdAbschlussFelder(["Streusalz", "Sole", "Splitt", "Granulat", "Sand", "Kein Streumittel"])}</form>`, [
    { text: "Abbrechen" },
    { text: "Abschließen", klasse: "haupt-k", aktion: async (hg) => {
      await api("POST", `winterdienst/${id}/abschluss`, wdAbschlussDaten(hg.querySelector("form"), feld.daten()));
      melde("Einsatz abgeschlossen. Das Protokoll ist fertig.");
      return true;
    } }]);
}

/* ---------- Protokoll im Casa-Design (Drucken / PDF) ---------- */
function wdProtokoll(e) {
  const fotos = (art) => e.fotos.filter((f) => f.art === art);
  const spalte = (art, titel) => `<div class="sp"><div class="sp-t">${titel}</div>${fotos(art).length ? fotos(art).map((f) => `<figure><img src="${wdFotoUrl(f.id)}" alt=""><figcaption>${wdZeit(f.zeit)} Uhr</figcaption></figure>`).join("") : '<p class="leer">keine Fotos</p>'}</div>`;
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Winterdienst-Protokoll ${esc(e.nummer || "")}</title><style>
    @font-face { font-family: Carlito; src: url("${location.origin}/schrift/Carlito-Regular.ttf"); }
    @font-face { font-family: Carlito; src: url("${location.origin}/schrift/Carlito-Bold.ttf"); font-weight: 700; }
    @page { size: A4; margin: 16mm 14mm 18mm; }
    body { font-family: Calibri, Carlito, sans-serif; color: #3C3C3B; font-size: 10.5pt; }
    .kopf { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: .6mm solid #E63713; padding-bottom: 4mm; }
    .kopf img { width: 52mm; } h1 { font-size: 20pt; margin: 6mm 0 1mm; } h2 { font-size: 12pt; margin: 7mm 0 2mm; color: #E63713; text-transform: uppercase; letter-spacing: .08em; }
    .k { font-size: 9pt; letter-spacing: .12em; color: #E63713; font-weight: 700; text-transform: uppercase; }
    .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm 8mm; }
    .meta small { display: block; color: #939598; font-size: 8pt; text-transform: uppercase; letter-spacing: .06em; }
    .breit { grid-column: 1 / -1; }
    .status { display: inline-block; padding: .6mm 2.5mm; border-radius: 3mm; font-weight: 700; font-size: 9pt; background: ${e.status === "erledigt" ? "#E3F1E6; color: #2E7A3E" : "#FFF3CC; color: #8A6500"}; }
    .vergleich { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
    .sp-t { font-weight: 700; font-size: 11pt; padding: 1.5mm 3mm; background: #3C3C3B; color: #fff; border-radius: 1mm; margin-bottom: 3mm; }
    figure { margin: 0 0 4mm; break-inside: avoid; } figure img { width: 100%; max-height: 70mm; object-fit: cover; border-radius: 1.5mm; border: .2mm solid #D9DADB; }
    figcaption { font-size: 8pt; color: #939598; margin-top: 1mm; } .leer { color: #939598; }
    .fuss { position: fixed; bottom: 0; left: 0; right: 0; font-size: 8pt; color: #939598; text-align: center; background: #fff; }
  </style></head><body>
    <div class="kopf"><div><div class="k">Winterdienst-Protokoll · ${esc(e.nummer || "")}</div><h1>${esc(e.o_name || "")}</h1>${e.o_strasse ? `<div>${esc(e.o_strasse)}, ${esc([e.o_plz, e.o_ort].filter(Boolean).join(" "))}</div>` : ""}</div><img src="${location.origin}/logo.png" alt=""></div>
    <h2>Einsatz</h2>
    <div class="meta">
      <div><small>Anlass</small>${esc(e.anlass)}</div><div><small>Status</small><span class="status">${e.status === "erledigt" ? "erledigt" : "läuft"}</span></div><div><small>Neuschnee</small>${wdCm(e.neuschnee_cm)}</div>
      <div><small>Beginn</small>${wdZeit(e.beginn)} Uhr</div><div><small>Ende</small>${e.ende ? `${wdZeit(e.ende)} Uhr` : "–"}</div><div><small>Dauer</small>${wdDauer(e.beginn, e.ende) || "–"}</div>
      <div><small>Ausgeführt von</small>${esc(e.ausgefuehrt_von)}</div><div><small>Firma</small>${esc(e.firma || "–")}</div><div><small>Temperatur</small>${wdGrad(e.temperatur)}</div>
    </div>
    <h2>Maßnahmen</h2>
    <div class="meta">
      <div><small>Geräumt</small>${e.geraeumt ? "ja" : e.status === "erledigt" ? "nein" : "–"}</div><div><small>Gestreut</small>${e.gestreut ? "ja" : e.status === "erledigt" ? "nein" : "–"}</div>
      <div><small>Streumittel / Menge</small>${esc([e.streumittel, e.streumenge].filter(Boolean).join(", ") || "–")}</div>
      <div class="breit"><small>Flächen</small>${esc(e.flaechen || "–")}</div>
      ${e.bemerkung ? `<div class="breit"><small>Bemerkung</small>${esc(e.bemerkung)}</div>` : ""}
    </div>
    <h2>Vorher und nachher</h2>
    <div class="vergleich">${spalte("vorher", "Vorher")}${spalte("nachher", "Nachher")}</div>
    <div class="fuss">Casa Concept Consulting GmbH &amp; Co. KG · www.ccc-frankfurt.com · Erfasst über ${e.quelle === "Winterdienst-Link" ? "Winterdienst-Link" : "Casa CAFM"}</div>
    <script>window.onload = () => setTimeout(() => print(), 600);<\/script></body></html>`;
  const f = window.open("", "_blank");
  if (!f) { melde("Das Druckfenster wurde blockiert. Bitte Pop-ups für diese Seite erlauben.", true); return; }
  f.document.open(); f.document.write(html); f.document.close();
}

/* ---------- Links für die Winterdienst-Firma ---------- */
const wdLinkAdresse = (t) => `${(EINST && EINST.basis_url) || location.origin}/m/w/${encodeURIComponent(t)}`;
async function wdLinksKarte(ziel) {
  const liste = await api("GET", "winterdienstlink");
  ziel.innerHTML = `<div class="abstand"></div><div class="karte"><h3>Link für die Winterdienst-Firma</h3>
    <p class="klein">Mit dem Link oder QR-Code kann die Firma ohne Zugang einen Einsatz beginnen und abschließen, mit Vorher- und Nachher-Fotos. Jedes Objekt hat seinen eigenen Link. Abschalten macht den Link sofort ungültig.</p>
    <ul class="liste">${liste.map((o) => `<li class="wd-link"><b>${esc(o.kuerzel || "")}</b> ${esc(o.name || "")}
      <span class="rechts">${o.wd_token ? `<button class="knopf klein" data-kopie="${o.id}">Link kopieren</button><button class="knopf klein" data-qr="${o.id}">QR-Code drucken</button><button class="knopf klein" data-aus="${o.id}">Abschalten</button>`
        : `<button class="knopf klein" data-an="${o.id}">Link erstellen</button>`}</span></li>`).join("")}</ul></div>`;
  const finde = (id) => liste.find((o) => String(o.id) === String(id));
  ziel.querySelectorAll("[data-an]").forEach((b) => b.onclick = async () => { await api("POST", `winterdienstlink/${b.dataset.an}`, {}); melde("Link erstellt."); wdLinksKarte(ziel); });
  ziel.querySelectorAll("[data-aus]").forEach((b) => b.onclick = async () => {
    const ok = await dialog("Link abschalten?", "<p>Der bisherige Link und QR-Code funktionieren danach nicht mehr. Du kannst jederzeit einen neuen Link erstellen.</p>", [{ text: "Abbrechen" }, { text: "Abschalten", klasse: "haupt-k", aktion: () => true }]);
    if (!ok) return;
    await api("POST", `winterdienstlink/${b.dataset.aus}`, { aktion: "aus" }); melde("Link abgeschaltet."); wdLinksKarte(ziel);
  });
  ziel.querySelectorAll("[data-kopie]").forEach((b) => b.onclick = async () => {
    const url = wdLinkAdresse(finde(b.dataset.kopie).wd_token);
    try { await navigator.clipboard.writeText(url); melde("Link kopiert. Du kannst ihn jetzt an die Firma schicken."); }
    catch (e) { await dialog("Link für die Winterdienst-Firma", `<p class="klein">Bitte markieren und kopieren:</p><input readonly value="${esc(url)}" style="width:100%">`, [{ text: "Schließen" }]); }
  });
  ziel.querySelectorAll("[data-qr]").forEach((b) => b.onclick = () => {
    const o = finde(b.dataset.qr), url = wdLinkAdresse(o.wd_token);
    const f = window.open("", "_blank");
    if (!f) { melde("Das Druckfenster wurde blockiert. Bitte Pop-ups für diese Seite erlauben.", true); return; }
    f.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Winterdienst ${esc(o.kuerzel || "")}</title><style>
      @font-face { font-family: Carlito; src: url("${location.origin}/schrift/Carlito-Bold.ttf"); font-weight: 700; }
      @font-face { font-family: Carlito; src: url("${location.origin}/schrift/Carlito-Regular.ttf"); }
      @page { size: A5; margin: 12mm; } body { font-family: Calibri, Carlito, sans-serif; color: #3C3C3B; text-align: center; }
      img.logo { width: 50mm; } h1 { font-size: 22pt; margin: 8mm 0 2mm; } .k { color: #E63713; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; font-size: 10pt; }
      .qr svg { width: 70mm; height: 70mm; } p { font-size: 11pt; } .url { font-size: 8pt; color: #939598; word-break: break-all; }
    </style></head><body><img class="logo" src="${location.origin}/logo.png" alt=""><div class="k" style="margin-top:8mm">Winterdienst</div><h1>${esc(o.name || o.kuerzel || "")}</h1>
      <div class="qr">${qrSvg(url, 260)}</div><p><b>Vor dem Räumen:</b> Code scannen, Einsatz beginnen, Vorher-Fotos machen.<br><b>Danach:</b> Einsatz abschließen, Nachher-Fotos machen.</p>
      <div class="url">${esc(url)}</div><script>window.onload = () => setTimeout(() => print(), 400);<\/script></body></html>`);
    f.document.close();
  });
}

/* ---------- Öffentliche Seite für die Winterdienst-Firma (/m/w/…) ---------- */
function wdGeraetLaden(token) { try { return JSON.parse(localStorage.getItem("cafm-wd-" + token) || "[]"); } catch (e) { return []; } }
function wdGeraetSpeichern(token, liste) { try { localStorage.setItem("cafm-wd-" + token, JSON.stringify(liste)); } catch (e) { /* ohne Speicher */ } }

async function wdSeite(token) {
  document.title = "Winterdienst · Casa Concept Consulting";
  const kopfLogo = '<header><img class="logo-hell" src="/logo.png" alt="Casa Concept Consulting"><img class="logo-dunkel" src="/logo-negativ.png" alt="Casa Concept Consulting"></header>';
  let info;
  try { info = await api("GET", "wd/" + encodeURIComponent(token)); }
  catch (e) { $app.innerHTML = `<div class="qr-seite">${kopfLogo}<div class="karte"><h2>Link nicht gültig</h2><p>${esc(e.message)}</p></div></div>`; return; }
  const o = info.objekt;
  const warn = info.warnungen.map((w) => `<div class="wd-oeff-warn">${w.art === "Neuschnee" ? `<b>${wdTag(w.datum)}: ${wdCm(w.neuschnee_cm)} Neuschnee</b>${w.ab ? ` ab ca. ${w.ab} Uhr` : ""}` : `<b>${wdTag(w.datum)}: Glättegefahr</b>`}</div>`).join("");
  const kopf = `${kopfLogo}<div class="karte qr-anlage"><div><div class="kicker">Winterdienst</div><h1>${esc(o.name || o.kuerzel || "")}</h1><div class="klein">${esc(o.anschrift || "")}</div></div></div>${warn}`;
  const meine = wdGeraetLaden(token).filter((m) => info.offen.some((x) => x.id === m.id));
  wdGeraetSpeichern(token, meine);
  const fremde = info.offen.filter((x) => !meine.some((m) => m.id === x.id));
  const hinweisFremd = fremde.length ? `<p class="klein">Läuft bereits auf einem anderen Gerät: ${fremde.map((x) => `${esc(x.ausgefuehrt_von)} seit ${wdUhr(x.beginn)} Uhr`).join(", ")}.</p>` : "";

  if (meine.length) {
    const m = meine[0];
    $app.innerHTML = `<div class="qr-seite">${kopf}<form class="karte formular" id="wdF" style="grid-template-columns:1fr" novalidate>
      <h2>Einsatz abschließen</h2><p class="klein">${esc(m.nummer)} · begonnen um ${wdUhr(m.beginn)} Uhr von ${esc(m.name)}</p>
      <div class="dfehler" id="wdFe"></div>${wdAbschlussFelder(info.streumittel)}
      <button class="knopf haupt-k gross-k" type="submit">Einsatz abschließen</button></form></div>`;
    const feld = wdFotoFeld(document.getElementById("wdNachher"), "Nachher-Fotos", "Möglichst aus dem gleichen Blickwinkel wie die Vorher-Fotos.");
    const f = document.getElementById("wdF");
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      const k = f.querySelector("button[type=submit]"); k.disabled = true; k.textContent = "Wird gesendet …";
      try {
        await api("POST", `wd/${encodeURIComponent(token)}/abschluss`, { id: m.id, geheim: m.geheim, ...wdAbschlussDaten(f, feld.daten()) });
        wdGeraetSpeichern(token, meine.slice(1));
        $app.innerHTML = `<div class="qr-seite">${kopfLogo}<div class="karte qr-danke"><div class="haken">✓</div><h2>Vielen Dank!</h2>
          <p>Der Einsatz <b>${esc(m.nummer)}</b> ist protokolliert, mit Vorher- und Nachher-Fotos.</p><button class="knopf" onclick="location.reload()">Neuen Einsatz beginnen</button></div></div>`;
      } catch (err) { document.getElementById("wdFe").innerHTML = `<div class="fehler">${esc(err.message)}</div>`; k.disabled = false; k.textContent = "Einsatz abschließen"; }
    };
    return;
  }
  let name = ""; try { name = localStorage.getItem("cafm-wd-name") || ""; } catch (e) { /* egal */ }
  let firma = ""; try { firma = localStorage.getItem("cafm-wd-firma") || ""; } catch (e) { /* egal */ }
  $app.innerHTML = `<div class="qr-seite">${kopf}<form class="karte formular" id="wdF" style="grid-template-columns:1fr" novalidate>
    <h2>Einsatz beginnen</h2>${hinweisFremd}
    <div class="dfehler" id="wdFe"></div>
    <label><span class="pflicht">Anlass</span><select name="anlass">${info.anlaesse.map((a) => `<option>${esc(a)}</option>`).join("")}</select></label>
    <label><span class="pflicht">Ihr Name</span><input name="ausgefuehrt_von" value="${esc(name)}" autocomplete="name"></label>
    <label><span>Firma</span><input name="firma" value="${esc(firma)}" autocomplete="organization"></label>
    <label><span>Neuschnee in cm (geschätzt)</span><input name="neuschnee_cm" inputmode="decimal" placeholder="z. B. 5"></label>
    <div class="sl-fotobox" id="wdVorher"></div>
    <button class="knopf haupt-k gross-k" type="submit">Einsatz beginnen</button>
    <p class="klein">Nach dem Räumen oder Streuen öffnen Sie diesen Link wieder und schließen den Einsatz mit Nachher-Fotos ab.</p></form></div>`;
  const feld = wdFotoFeld(document.getElementById("wdVorher"), "Vorher-Fotos", "Gehwege, Zufahrt und Eingänge so fotografieren, dass Schnee oder Glätte gut zu sehen sind.");
  const f = document.getElementById("wdF");
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    const k = f.querySelector("button[type=submit]"); k.disabled = true; k.textContent = "Wird gesendet …";
    try {
      const r = await api("POST", `wd/${encodeURIComponent(token)}/beginn`, { anlass: f.anlass.value, ausgefuehrt_von: f.ausgefuehrt_von.value, firma: f.firma.value, neuschnee_cm: f.neuschnee_cm.value, fotos: feld.daten() });
      try { localStorage.setItem("cafm-wd-name", f.ausgefuehrt_von.value); localStorage.setItem("cafm-wd-firma", f.firma.value); } catch (e) { /* egal */ }
      wdGeraetSpeichern(token, [{ id: r.id, geheim: r.geheim, nummer: r.nummer, beginn: new Date().toISOString().replace("Z", ""), name: f.ausgefuehrt_von.value }, ...wdGeraetLaden(token)]);
      $app.innerHTML = `<div class="qr-seite">${kopfLogo}<div class="karte qr-danke"><div class="haken">✓</div><h2>Einsatz ${esc(r.nummer)} läuft</h2>
        <p>Die Vorher-Fotos sind gespeichert. Wenn Sie fertig sind, öffnen Sie diesen Link wieder und schließen den Einsatz mit Nachher-Fotos ab.</p>
        <button class="knopf haupt-k" onclick="location.reload()">Jetzt abschließen</button></div></div>`;
    } catch (err) { document.getElementById("wdFe").innerHTML = `<div class="fehler">${esc(err.message)}</div>`; k.disabled = false; k.textContent = "Einsatz beginnen"; }
  };
}

/* ---------- Einstellungen ---------- */
(() => {
  const alt = SEITEN.einstellungen;
  SEITEN.einstellungen = async (el) => {
    await alt(el);
    if (!darf("einstellungen")) return;
    const [ein, personen] = await Promise.all([einstellungenLaden(true), api("GET", "personen")]);
    let gewaehlt = [];
    try { gewaehlt = ein.wd_empfaenger ? JSON.parse(ein.wd_empfaenger) : []; } catch (e) { gewaehlt = []; }
    const box = document.createElement("div");
    box.innerHTML = `<div class="abstand"></div><div class="karte" id="wdEinst"><h3>Winterdienst-Warnung</h3>
      <form class="formular" style="grid-template-columns:1fr 1fr" onsubmit="return false">
        <label class="wn-haken breit"><input type="checkbox" name="wd_aktiv" ${ein.wd_aktiv !== "0" ? "checked" : ""}> Vor Neuschnee warnen (Vorhersage wird jede Stunde geprüft)</label>
        <label><span>Warnen ab wie viel cm Neuschnee</span><input name="wd_schwelle" inputmode="decimal" value="${esc(String(ein.wd_schwelle || "1").replace(".", ","))}"></label>
        <label class="wn-haken"><input type="checkbox" name="wd_glaette" ${ein.wd_glaette !== "0" ? "checked" : ""}> Auch bei Glättegefahr warnen (Frost und Nässe, Eisregen)</label>
        <div class="breit"><div class="sl-titel">Wer bekommt die Warnung?</div>
          <p class="klein">Ohne Auswahl: alle Administratoren, Objektleiter und die eingetragenen Objektleiter der Objekte. Die Warnung kommt als Benachrichtigung, per Push und per E-Mail, wenn das eingerichtet ist.</p>
          <div class="wd-empf">${personen.map((p) => `<label class="wn-haken"><input type="checkbox" value="${p.id}" ${gewaehlt.includes(p.id) ? "checked" : ""}> ${esc(p.name)}</label>`).join("")}</div></div>
        <p class="klein breit">Der Ort für die Vorhersage ist derselbe wie beim Wetter oben: <b>${esc(ein.wetter_ort || "")}</b>.</p>
        <div class="breit"><button class="knopf haupt-k" id="wdSp">Speichern</button></div>
      </form></div>`;
    el.appendChild(box);
    const f = box.querySelector("form");
    box.querySelector("#wdSp").onclick = async () => {
      try {
        await api("PUT", "einstellungen", { wd_aktiv: f.wd_aktiv.checked ? 1 : 0, wd_glaette: f.wd_glaette.checked ? 1 : 0, wd_schwelle: f.wd_schwelle.value,
          wd_empfaenger: [...box.querySelectorAll(".wd-empf input:checked")].map((c) => Number(c.value)) });
        await einstellungenLaden(true); melde("Gespeichert.");
      } catch (err) { melde(err.message, true); }
    };
  };
})();
