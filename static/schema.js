/* Casa CAFM – Anlagenschema unter Standorte & Pläne: Geräte einer Anlage (z. B. Kälte) mit ihren Leitungen als Schaubild.
   Jedes Gerät lässt sich mit einer Anlage aus dem Programm verknüpfen und zeigt dann deren Zustand. */
"use strict";

const SCH_MEDIEN = {
  kaltV: ["#4db8ff", "Kaltwasser Vorlauf"], kaltR: ["#a9b8ff", "Kaltwasser Rücklauf"],
  kuehlV: ["#2ee6a8", "Kühlwasser zu den Kältemaschinen"], kuehlR: ["#ff5fa2", "Kühlwasser zu den Kühltürmen"],
  glykol: ["#c58bff", "Wasser-Glykol-Gemisch"], heizV: ["#ff7a59", "Heizung Vorlauf"], heizR: ["#ffb199", "Heizung Rücklauf"], druck: ["#8fa3c8", "Anschluss Druckhaltung"], sonst: ["#8fa3c8", "Sonstiges"] };
const SCH_ZEICHEN = {
  kaeltemaschine: '<rect x="-17" y="-9" width="34" height="18" rx="9"/><circle cx="-7" cy="0" r="4"/><circle cx="7" cy="0" r="4"/>',
  kuehlturm: '<path d="M-14 12 L-9 -12 H9 L14 12 Z"/><path d="M-6 -4 H6 M-8 4 H8"/>',
  waermetauscher: '<rect x="-12" y="-13" width="24" height="26" rx="2"/><path d="M-12 -5 L12 5 M-12 3 L12 13 M-12 -13 L12 -3"/>',
  pumpe: '<circle r="11"/><path d="M-5 -8 L9 0 L-5 8 Z"/>',
  druckhaltung: '<rect x="-9" y="-14" width="18" height="28" rx="9"/><path d="M-9 0 H9"/>',
  wasser: '<path d="M0 -14 C8 -3 11 2 11 6 A11 11 0 0 1 -11 6 C-11 2 -8 -3 0 -14 Z"/>',
  verbraucher: '<rect x="-14" y="-11" width="28" height="22" rx="3"/><path d="M-8 -4 H8 M-8 2 H8 M-8 8 H2"/>',
  kessel: '<rect x="-12" y="-14" width="24" height="28" rx="4"/><path d="M0 8 C-5 2 0 -1 0 -7 C5 -2 5 3 0 8 Z"/>' };

async function schemaZeichnen(ziel, k) {
  const { d, objektId } = k, aendern = darf("plaene_bearbeiten"), AMPEL = { rot: "#ff4d6d", gelb: "#ffd23f", gruen: "#2ee6a8" };
  let liste = [], akt = null, wahl = null;
  const el = document.createElement("div");
  ziel.replaceChildren(el);
  const laden = async () => { liste = await api("GET", `schemata?objekt_id=${objektId}`); if (!akt || !liste.some((s) => s.id === akt)) akt = liste.length ? liste[0].id : null; };
  const daten = (s) => { try { return JSON.parse(s.daten); } catch (e) { return { knoten: [], leitungen: [] }; } };
  const anlageVon = (n) => {
    if (n.anlage_id) return d.anlagen.find((a) => a.id === Number(n.anlage_id)) || null;
    if (!n.suche) return null;
    const muster = String(n.suche).toLowerCase().split("|");
    return d.anlagen.find((a) => muster.some((m) => m && String(a.bezeichnung || "").toLowerCase().includes(m))) || null;
  };

  const importieren = async () => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = ".json,application/json";
    const datei = await new Promise((ok) => { input.onchange = () => ok(input.files[0]); input.click(); });
    if (!datei) return;
    try {
      const sch = JSON.parse(await datei.text());
      if (!sch || !Array.isArray(sch.knoten)) throw new Error("Das ist keine Schema-Datei für Casa CAFM.");
      const neu = await api("POST", "schemata", { objekt_id: objektId, titel: String(sch.titel || datei.name.replace(/\.json$/i, "")).slice(0, 120), daten: JSON.stringify(sch) });
      akt = neu.id; wahl = null; melde("Schema gespeichert."); await laden(); zeichnen();
    } catch (e) { melde(e instanceof SyntaxError ? "Die Datei lässt sich nicht lesen. Bitte die Schema-Datei (Endung .json) wählen." : e.message, true); }
  };

  const bild = (sch) => {
    const b = sch.breite || 1600, h = sch.hoehe || 900;
    const zonen = (sch.zonen || []).map((z) => `<g class="sch-zone"><rect x="${z.x}" y="${z.y}" width="${z.b}" height="${z.h}" rx="14"/><text x="${z.x + z.b - 14}" y="${z.y + 22}" text-anchor="end">${esc(z.titel)}</text></g>`).join("");
    const leit = (sch.leitungen || []).map((l) => {
      const f = (SCH_MEDIEN[l.medium] || SCH_MEDIEN.sonst)[0], pkt = l.punkte.map((p) => p.join(",")).join(" ");
      return `<polyline class="sch-rohr" points="${pkt}" style="stroke:${f}"/><polyline class="sch-fluss ${l.gegen ? "gegen" : ""}" points="${pkt}"/>`;
    }).join("");
    const knoten = sch.knoten.map((n) => {
      const a = anlageVon(n), farbe = a ? AMPEL[a.ampel] || AMPEL.gruen : "#8fa3c8", klein = n.typ === "pumpe";
      const zeichen = `<g class="sch-zeichen" style="stroke:${farbe}">${SCH_ZEICHEN[n.typ] || SCH_ZEICHEN.verbraucher}</g>`;
      if (klein) return `<g class="sch-knoten klein ${wahl === n.id ? "an" : ""}" data-knoten="${esc(n.id)}" transform="translate(${n.x},${n.y})"><circle r="15" class="sch-hg"/>${zeichen}<title>${esc(n.titel)}</title></g>`;
      const bw = n.b || 176, bh = 62;
      return `<g class="sch-knoten ${wahl === n.id ? "an" : ""} ${a ? "mit" : ""}" data-knoten="${esc(n.id)}" transform="translate(${n.x},${n.y})" style="--c:${farbe}">
        <rect class="sch-hg" x="${-bw / 2}" y="${-bh / 2}" width="${bw}" height="${bh}" rx="12"/><g transform="translate(${-bw / 2 + 28},0)">${zeichen}</g>
        <text class="sch-t" x="${-bw / 2 + 54}" y="-5">${esc(n.titel)}</text><text class="sch-u" x="${-bw / 2 + 54}" y="13">${esc(n.text || "")}</text>
        ${a ? `<circle class="sch-ampel" cx="${bw / 2 - 12}" cy="${-bh / 2 + 12}" r="5" style="fill:${farbe}"/>` : ""}</g>`;
    }).join("");
    return `<svg class="sch-svg" viewBox="0 0 ${b} ${h}" role="img" aria-label="${esc(sch.titel || "Anlagenschema")}">${zonen}${leit}${knoten}</svg>`;
  };

  const seite = (sch, eintrag) => {
    const n = sch.knoten.find((x) => x.id === wahl);
    const medien = [...new Set((sch.leitungen || []).map((l) => l.medium))].map((m) => SCH_MEDIEN[m] || SCH_MEDIEN.sonst);
    const legende = `<div class="g3-karte"><h4>Leitungen</h4>${medien.map(([f, t]) => `<div class="sch-leg"><i style="background:${f}"></i>${esc(t)}</div>`).join("")}</div>`;
    const verkn = sch.knoten.filter((x) => x.typ !== "pumpe"), mit = verkn.filter(anlageVon).length;
    const quelle = `<div class="g3-karte"><h4>Stand</h4><p class="g3-leer">${mit} von ${verkn.length} Geräten sind mit einer Anlage im Programm verknüpft. Verknüpfte Geräte zeigen ihren Zustand als Farbe.</p>
      ${sch.quelle ? `<p class="g3-leer"><b>Quelle:</b> ${esc(sch.quelle)}</p>` : ""}${sch.hinweis ? `<p class="g3-leer">${esc(sch.hinweis)}</p>` : ""}
      ${aendern ? `<div class="g3-kn"><button class="knopf" type="button" data-sch="import">Weiteres Schema</button><button class="knopf" type="button" data-sch="weg">Schema löschen</button></div>` : ""}</div>`;
    if (!n) return `<div class="g3-karte"><h4>Gerät</h4><p class="g3-leer">Klick auf ein Gerät im Schema. Dann stehen hier seine Daten und sein Zustand.</p></div>${legende}${quelle}`;
    const a = anlageVon(n);
    const zeilen = (n.daten || []).map(([l, w]) => `<div><small>${esc(l)}</small><b>${esc(w)}</b></div>`).join("");
    const zustand = a ? `<div class="sch-anl" style="--c:${AMPEL[a.ampel]}"><small>${esc(a.nummer || "Anlage im Programm")}</small><b>${esc(a.bezeichnung)}</b>
        <span>${a.ampel === "gruen" ? "in Ordnung" : esc(guGrund(a, d.heute) || "auffällig")}</span><span>Nächster Termin: ${a.naechste ? datum(a.naechste) : "keiner"} · Störungen offen: ${a.tickets_offen || 0}</span>
        <div class="g3-kn"><a class="knopf haupt-k" href="#/anlagen/${a.id}">Akte öffnen →</a>${a.plan_id ? `<a class="knopf" href="#/plaene/${a.plan_id}?anlage=${a.id}">Im Plan zeigen</a>` : ""}</div></div>`
      : '<p class="g3-leer">Noch mit keiner Anlage im Programm verknüpft.</p>';
    const wahlfeld = aendern ? `<label class="sch-wahl"><small>Mit Anlage verknüpfen</small><select data-sch="anlage"><option value="">keine${n.suche ? " (nach Namen suchen)" : ""}</option>
        ${[...d.anlagen].sort((x, y) => String(x.bezeichnung).localeCompare(String(y.bezeichnung), "de", { numeric: true })).map((x) => `<option value="${x.id}" ${Number(n.anlage_id) === x.id ? "selected" : ""}>${esc(x.bezeichnung)}${x.nummer ? " · " + esc(x.nummer) : ""}</option>`).join("")}</select></label>` : "";
    return `<div class="g3-wahl sch-info"><b>${esc(n.titel)}</b><small>${esc(n.text || "")}</small><div class="sch-daten">${zeilen}</div>${zustand}${wahlfeld}</div>${legende}${quelle}`;
  };

  const zeichnen = () => {
    if (!liste.length) {
      el.innerHTML = `<div class="karte leer"><b>Für dieses Objekt gibt es noch kein Anlagenschema.</b><br>Ein Schema zeigt die Geräte einer Anlage mit ihren Leitungen, zum Beispiel die Kälte mit Kältemaschinen, Kühltürmen und Kältekreisen.
        ${aendern ? '<div class="qr-knoepfe" style="justify-content:center;margin-top:14px"><button class="knopf haupt-k" type="button" data-sch="import">Schema-Datei wählen</button></div>' : ""}</div>`;
      return;
    }
    const eintrag = liste.find((s) => s.id === akt), sch = daten(eintrag);
    el.innerHTML = `<div class="g3 sch"><div class="g3-mitte">
        <div class="g3-kopf"><div class="g3-ort">${icon("plaene")} <b>${esc(eintrag.titel)}</b></div>
          ${liste.length > 1 ? `<div class="g3-geb">${liste.map((s) => `<button type="button" data-sch-id="${s.id}" class="${s.id === akt ? "an" : ""}">${esc(s.titel)}</button>`).join("")}</div>` : ""}</div>
        <div class="sch-rahmen">${bild(sch)}</div></div>
      <div class="g3-rechts">${seite(sch, eintrag)}</div></div>`;
  };

  el.addEventListener("click", async (e) => {
    const kn = e.target.closest("[data-knoten]"), sc = e.target.closest("[data-sch]"), id = e.target.closest("[data-sch-id]");
    if (kn) { wahl = wahl === kn.dataset.knoten ? null : kn.dataset.knoten; zeichnen(); return; }
    if (id) { akt = Number(id.dataset.schId); wahl = null; zeichnen(); return; }
    if (!sc || sc.tagName === "SELECT") return;
    if (sc.dataset.sch === "import") importieren();
    if (sc.dataset.sch === "weg") {
      const eintrag = liste.find((s) => s.id === akt);
      const ja = await dialog("Schema löschen", `<p><b>${esc(eintrag.titel)}</b> wird gelöscht. Die Anlagen im Programm bleiben unverändert.</p>`, [{ text: "Abbrechen" }, { text: "Löschen", klasse: "haupt-k", aktion: async () => api("DELETE", `schemata/${akt}`) }]);
      if (ja) { akt = null; wahl = null; await laden(); zeichnen(); }
    }
  });
  el.addEventListener("change", async (e) => {
    if (e.target.dataset.sch !== "anlage") return;
    const eintrag = liste.find((s) => s.id === akt), sch = daten(eintrag), n = sch.knoten.find((x) => x.id === wahl);
    if (!n) return;
    if (e.target.value) n.anlage_id = Number(e.target.value); else delete n.anlage_id;
    try { await api("PUT", `schemata/${akt}`, { daten: JSON.stringify(sch) }); melde("Gespeichert."); await laden(); zeichnen(); } catch (err) { melde(err.message, true); }
  });
  try { await laden(); } catch (e) { el.innerHTML = `<div class="karte leer">${esc(e.message)}</div>`; return; }
  zeichnen();
}
