"use strict";
/* SV-Prüfplan: sicherheitsrelevante Anlagen und Prüfungen durch Sachverständige */

const SV_REGELN = [
  [/brandmelde|\bbm[az]\b|alarmierung/i, "Brandmelde- und Alarmierungsanlage"],
  [/\brwa\b|rauchabzug|rauch- und wärmeabzug|entrauchung/i, "Rauchabzugsanlage (RWA)"],
  [/druckbelüft|\brda\b/i, "Druckbelüftungsanlage (RDA)"],
  [/co-warn|co warn|kohlenmonoxid/i, "CO-Warnanlage"],
  [/sprinkler|löschanlage|gaslösch|lösch­anlage/i, "Feuerlöschanlage (Sprinkler, Gaslöschanlage)"],
  [/wandhydrant|steigleitung|hydrant/i, "Wandhydranten / Steigleitungen"],
  [/notstrom|netzersatz|\bnea\b|sicherheitsstrom|\busv\b/i, "Sicherheitsstromversorgung / Notstrom"],
  [/sicherheitsbeleucht|notbeleucht|notlicht/i, "Sicherheitsbeleuchtung"],
  [/feststell|brandschutztür|\bbst\b|\bfsa\b/i, "Feststellanlage (Brandschutztür)"],
  [/aufzug|fahrstuhl/i, "Aufzug"],
  [/druckbehälter/i, "Druckbehälter"],
  [/blitzschutz/i, "Blitzschutzanlage"],
  [/\brlt\b|lüftung/i, "Lüftungsanlage"],
];

function svVorschlag(a) {
  const text = [a.bezeichnung, a.typ, a.beschreibung, refText("kat_kategorien", a.kategorie_id)].filter(Boolean).join(" ");
  for (const [muster, g] of SV_REGELN) if (muster.test(text)) return g;
  if (a.planzeichen && a.planzeichen.startsWith("F002")) return "Wandhydranten / Steigleitungen";
  if (a.planzeichen && /^(BMZ|FAT|FBF|F005)/.test(a.planzeichen)) return "Brandmelde- und Alarmierungsanlage";
  if (a.planzeichen && a.planzeichen.startsWith("RWA")) return "Rauchabzugsanlage (RWA)";
  if (a.gewerk === "Aufzug") return "Aufzug";
  if (a.gewerk === "Lüftung/Klima") return "Lüftungsanlage";
  return "";
}
function svGrundlageVorschlag(gegenstand) {
  const g = S.schema.anlagen.felder.find((f) => f.name === "sv_grundlage").optionen;
  if (["Aufzug", "Druckbehälter"].includes(gegenstand)) return g[1];
  if (["Elektrische Anlage", "Blitzschutzanlage", "Feststellanlage (Brandschutztür)", "Sonstiges", ""].includes(gegenstand)) return "";
  return g[0];
}

function svErgebnisMarke(h) {
  if (!h) return '<span class="klein">noch nicht erfasst</span>';
  const k = h.ergebnis === "Ohne Mängel" ? "m-ok" : h.ergebnis === "Mängel offen" ? "m-ueber" : h.ergebnis === "Nicht durchgeführt" ? "m-bald" : "m-geplant";
  return `${datum(h.datum)}<br><span class="marke ${k}">${esc(h.ergebnis)}</span>`;
}

async function svTerminAnlegen(a) {
  const neu = await bearbeiten("wartungen", null, {
    objekt_id: a.objekt_id, anlage_id: a.id, art: "SV-Prüfung", titel: `SV-Prüfung ${a.bezeichnung}`,
    rechtsgrundlage: a.sv_grundlage || "", intervall_monate: "", aktiv: 1,
    taetigkeiten: "Prüfung durch Sachverständige\nPrüfbericht erhalten und abgelegt\nMängel aus dem Bericht erfasst",
  });
  if (neu) melde("Termin angelegt. Die Frist bitte mit dem letzten Prüfbericht abgleichen.");
  return neu;
}

function svDrucken(zeilen, objektText) {
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>SV-Prüfplan</title><style>
    @font-face { font-family: Carlito; src: url("${location.origin}/schrift/Carlito-Regular.ttf"); }
    @font-face { font-family: Carlito; src: url("${location.origin}/schrift/Carlito-Bold.ttf"); font-weight: 700; }
    @page { size: A4 landscape; margin: 14mm 12mm; }
    body { font-family: Calibri, Carlito, sans-serif; color: #3C3C3B; font-size: 9.5pt; }
    .kopf { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: .6mm solid #E63713; padding-bottom: 3mm; margin-bottom: 5mm; }
    .kopf img { width: 48mm; }
    h1 { font-size: 19pt; margin: 4mm 0 1mm; }
    .k { font-size: 8.5pt; letter-spacing: .12em; color: #E63713; font-weight: 700; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #3C3C3B; color: #fff; text-align: left; padding: 1.8mm 2.5mm; font-size: 8.5pt; }
    td { padding: 1.8mm 2.5mm; border-bottom: .2mm solid #D9DADB; vertical-align: top; }
    tr.u td { background: #F5DDE2; } tr.b td { background: #FBEEE5; } tr.o td { color: #B82C0F; }
    small { color: #626366; }
    .fuss { position: fixed; bottom: 0; left: 0; right: 0; font-size: 7.5pt; color: #939598; text-align: center; }
  </style></head><body>
    <div class="kopf"><div><div class="k">Sicherheitsrelevante Anlagen · Stand ${datum(heute())}</div><h1>SV-Prüfplan${objektText ? " " + esc(objektText) : ""}</h1></div><img src="${location.origin}/logo.png" alt=""></div>
    <table><thead><tr><th>Objekt</th><th>Anlage</th><th>Prüfgegenstand</th><th>Grundlage</th><th>Sachverständige</th><th>Intervall</th><th>Letzte Prüfung</th><th>Nächste Prüfung</th><th>Mängel offen</th></tr></thead><tbody>
    ${zeilen.map((z) => {
      const w = z.w, t = w && w.naechste ? tageBis(w.naechste) : null;
      return `<tr class="${!w ? "o" : t < 0 ? "u" : t <= 90 ? "b" : ""}"><td>${esc(z.a.o_kuerzel || "")}</td><td><b>${esc(z.a.bezeichnung)}</b>${z.a.nummer ? `<br><small>${esc(z.a.nummer)}</small>` : ""}${z.a.standort ? `<br><small>${esc(z.a.standort)}</small>` : ""}</td>
        <td>${esc(z.a.sv_gegenstand || "")}</td><td>${esc((w && w.rechtsgrundlage) || z.a.sv_grundlage || "")}</td><td>${esc((w && w.dl_name) || "")}</td>
        <td>${w && w.intervall_monate ? `${zahl(w.intervall_monate)} Monate` : ""}</td>
        <td>${w && w.letztes ? `${datum(w.letztes.datum)}<br><small>${esc(w.letztes.ergebnis)}</small>` : w && w.letzte ? datum(w.letzte) : ""}</td>
        <td><b>${w ? datum(w.naechste) : "kein Termin"}</b>${t != null && t < 0 ? "<br><small>überfällig</small>" : ""}</td><td>${z.a.tickets_offen || ""}</td></tr>`;
    }).join("")}</tbody></table>
    <div class="fuss">Casa Concept Consulting GmbH &amp; Co. KG · www.ccc-frankfurt.com</div>
    <script>window.onload = () => setTimeout(() => print(), 300);<\/script></body></html>`;
  const f = window.open("", "_blank");
  if (!f) { melde("Das Druckfenster wurde blockiert. Bitte Pop-ups für diese Seite erlauben.", true); return; }
  f.document.open(); f.document.write(html); f.document.close();
}

SEITEN.svpruefplan = async (el, _, q) => {
  await Promise.all([lade("objekte"), refsLaden("anlagen"), katLaden()]);
  const z = { ansicht: ["auswahl", "maengel"].includes(q.get("ansicht")) ? q.get("ansicht") : "plan", objekt: q.get("objekt") || "", status: "", q: "" };
  el.innerHTML = seitenkopf("SV-Prüfplan", "Sicherheitsrelevante Anlagen · Prüfung durch Sachverständige",
    `<div class="umschalter"><button data-ans="plan">Prüfplan</button><button data-ans="maengel">SV-Mängel</button><button data-ans="auswahl">Anlagen auswählen</button></div>`)
    + `<div class="werkzeug"><input type="search" placeholder="Anlage suchen" id="svq">
      <select id="svo"><option value="">Alle Objekte</option>${(S.cache.objekte || []).map((o) => `<option value="${o.id}" ${String(o.id) === z.objekt ? "selected" : ""}>${esc(anzeige("objekte", o))}</option>`).join("")}</select>
      <select id="svs"></select><span id="svk"></span><span class="anzahl" id="sva"></span></div><div id="svinhalt"></div>`;

  let plan = [], anlagen = [];
  const passt = (a) => !z.q || [a.bezeichnung, a.nummer, a.standort, a.sv_gegenstand].some((x) => String(x || "").toLowerCase().includes(z.q.toLowerCase()));
  const zeilenPlan = () => {
    const out = [];
    for (const a of plan.filter(passt)) {
      if (!a.pruefungen.length) out.push({ a, w: null });
      for (const w of a.pruefungen) out.push({ a, w });
    }
    return out.filter(({ a, w }) => {
      const t = w && w.naechste ? tageBis(w.naechste) : null;
      if (z.status === "ueber") return t != null && t < 0;
      if (z.status === "90") return t != null && t <= 90;
      if (z.status === "ohne") return !w;
      if (z.status === "maengel") return a.tickets_offen > 0 || a.sv_maengel_offen > 0 || (w && w.letztes && w.letztes.ergebnis === "Mängel offen");
      return true;
    });
  };

  const zeichnenPlan = () => {
    const alle = [];
    for (const a of plan) { if (!a.pruefungen.length) alle.push({ a, w: null }); for (const w of a.pruefungen) alle.push({ a, w }); }
    const ueber = alle.filter((x) => x.w && tageBis(x.w.naechste) < 0).length, bald = alle.filter((x) => x.w && tageBis(x.w.naechste) >= 0 && tageBis(x.w.naechste) <= 90).length;
    const ohne = alle.filter((x) => !x.w).length, maengel = plan.filter((a) => a.tickets_offen > 0 || a.sv_maengel_offen > 0).length;
    const zeilen = zeilenPlan();
    el.querySelector("#sva").textContent = `${zeilen.length} Einträge`;
    el.querySelector("#svk").innerHTML = `${darf("export") ? `<button class="knopf" id="svcsv">${icon("export")} Excel</button>` : ""}<button class="knopf" id="svdruck">Drucken / PDF</button>`;
    el.querySelector("#svinhalt").innerHTML = `<div class="raster k4">
      <div class="karte kennzahl"><div class="wert">${plan.length}</div><div class="text">Anlagen im SV-Prüfplan</div></div>
      <div class="karte kennzahl ${ueber ? "rot" : ""}"><div class="wert">${ueber}</div><div class="text">Prüfungen überfällig</div></div>
      <div class="karte kennzahl ${bald ? "gelb" : ""}"><div class="wert">${bald}</div><div class="text">fällig in 90 Tagen</div></div>
      <div class="karte kennzahl ${ohne ? "gelb" : ""}"><div class="wert">${ohne}</div><div class="text">ohne Prüftermin${maengel ? ` · ${maengel} mit offenen Mängeln` : ""}</div></div></div>
      <div class="abstand"></div>
      ${plan.length ? `<div class="tabelle-wrap"><table><thead><tr><th>Objekt</th><th>Anlage</th><th>Prüfgegenstand</th><th>Sachverständige</th><th>Letzte Prüfung</th><th>Nächste Prüfung</th><th>Mängel</th><th></th></tr></thead><tbody>
        ${zeilen.map(({ a, w }) => `<tr class="klickbar" data-a="${a.id}" ${w ? `data-w="${w.id}"` : ""}>
          <td>${esc(a.o_kuerzel || "")}</td>
          <td><span class="sv-anl">${symbolVon(a, 26)}<span><b>${esc(a.bezeichnung)}</b>${a.nummer ? `<br><span class="klein">${esc(a.nummer)}</span>` : ""}${a.standort ? `<br><span class="klein">${esc(a.standort)}</span>` : ""}</span></span></td>
          <td>${esc(a.sv_gegenstand || "")}${a.sv_gegenstand ? "" : '<span class="klein">nicht angegeben</span>'}<br><span class="klein">${esc((w && w.rechtsgrundlage) || a.sv_grundlage || "")}</span></td>
          <td>${esc((w && w.dl_name) || "")}${w && w.intervall_monate ? `<br><span class="klein">alle ${zahl(w.intervall_monate)} Monate</span>` : ""}</td>
          <td>${w ? svErgebnisMarke(w.letztes || (w.letzte ? { datum: w.letzte, ergebnis: "erledigt" } : null)) : ""}</td>
          <td>${w ? `<b>${datum(w.naechste)}</b><br>${faelligMarke(w.naechste)}` : '<span class="marke m-bald">kein Termin</span>'}</td>
          <td>${a.sv_maengel_offen ? `<span class="marke m-ueber">${a.sv_maengel_offen} SV-Mängel</span><br>` : ""}${a.tickets_offen ? `<span class="marke m-bald">${a.tickets_offen} Störmeldung${a.tickets_offen > 1 ? "en" : ""}</span>` : ""}</td>
          <td class="sv-akt">${w ? (darf("wartung_erledigen") ? `<button class="knopf haupt-k klein" data-erl="${w.id}">Prüfung eintragen</button>` : "")
            : (darf("wartung_planen") ? `<button class="knopf haupt-k klein" data-termin="${a.id}">${icon("plus")} Termin</button>` : "")}</td></tr>`).join("")
          || `<tr><td class="leer" colspan="8">Keine Einträge für diese Auswahl.</td></tr>`}</tbody></table></div>`
      : `<div class="karte leer">Noch keine Anlage im SV-Prüfplan. Wechsle oben zu „Anlagen auswählen“ und hake die sicherheitsrelevanten Anlagen an.</div>`}`;
    const cs = el.querySelector("#svcsv");
    if (cs) cs.onclick = () => {
      const kopf = ["Objekt", "Anlagennummer", "Anlage", "Standort", "Prüfgegenstand", "Grundlage", "Sachverständige", "Intervall (Monate)", "Letzte Prüfung", "Ergebnis", "Nächste Prüfung", "Mängel offen"];
      const rows = zeilen.map(({ a, w }) => [`${a.o_kuerzel || ""} ${a.o_name || ""}`.trim(), a.nummer, a.bezeichnung, a.standort, a.sv_gegenstand, (w && w.rechtsgrundlage) || a.sv_grundlage,
        w && w.dl_name, w && w.intervall_monate, w && (w.letztes ? datum(w.letztes.datum) : datum(w.letzte)), w && w.letztes && w.letztes.ergebnis, w ? datum(w.naechste) : "kein Termin", a.tickets_offen || ""]);
      const csv = "﻿" + [kopf, ...rows].map((r) => r.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
      const l = document.createElement("a");
      l.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      l.download = `${heute().replace(/-/g, "")}_SV-Pruefplan.csv`;
      l.click();
      setTimeout(() => URL.revokeObjectURL(l.href), 2000);
    };
    el.querySelector("#svdruck").onclick = () => svDrucken(zeilen, z.objekt ? refText("objekte", z.objekt) : "");
  };

  const zeichnenAuswahl = () => {
    const aendern = darf("anlagen_bearbeiten");
    const felder = Object.fromEntries(S.schema.anlagen.felder.map((f) => [f.name, f]));
    let liste = anlagen.filter(passt);
    if (z.status === "an") liste = liste.filter((a) => a.sv_relevant);
    if (z.status === "aus") liste = liste.filter((a) => !a.sv_relevant);
    if (z.status === "vorschlag") liste = liste.filter((a) => !a.sv_relevant && svVorschlag(a));
    const offen = anlagen.filter((a) => !a.sv_relevant && svVorschlag(a));
    el.querySelector("#sva").textContent = `${liste.length} Anlagen · ${anlagen.filter((a) => a.sv_relevant).length} ausgewählt`;
    el.querySelector("#svk").innerHTML = aendern && offen.length ? `<button class="knopf" id="svalle">Alle ${offen.length} Vorschläge anwählen</button>` : "";
    const sel = (a, name) => `<select data-sv="${name}" data-id="${a.id}" ${aendern && a.sv_relevant ? "" : "disabled"}><option value="">–</option>${felder[name].optionen.map((o) => `<option ${a[name] === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
    el.querySelector("#svinhalt").innerHTML = `<p class="hinweis-text">Hake an, welche Anlagen sicherheitsrelevant sind und von Sachverständigen geprüft werden. Sie erscheinen dann im Prüfplan.
      Ein <span class="marke m-geplant">Vorschlag</span> ist nur eine Hilfe nach der Bezeichnung. Welche Anlagen wirklich prüfpflichtig sind, steht in der Prüfverordnung des Landes, in der Baugenehmigung und im Brandschutzkonzept.</p>
      <div class="tabelle-wrap"><table class="sv-auswahl"><thead><tr><th>Im SV-Prüfplan</th><th>Anlage</th><th>Objekt</th><th>Prüfgegenstand</th><th>Prüfgrundlage</th></tr></thead><tbody>
      ${liste.map((a) => { const v = svVorschlag(a); return `<tr class="${a.sv_relevant ? "sv-an" : ""}"><td><input type="checkbox" class="schalter" data-an="${a.id}" ${a.sv_relevant ? "checked" : ""} ${aendern ? "" : "disabled"} aria-label="${esc(a.bezeichnung)} im SV-Prüfplan"></td>
        <td><a class="sv-anl" href="#/anlagen/${a.id}">${symbolVon(a, 24)}<span><b>${esc(a.bezeichnung)}</b>${a.nummer ? ` <span class="klein">${esc(a.nummer)}</span>` : ""}${!a.sv_relevant && v ? `<br><span class="marke m-geplant">Vorschlag: ${esc(v)}</span>` : ""}</span></a></td>
        <td>${esc(((S.cache.objekte || []).find((o) => o.id === a.objekt_id) || {}).kuerzel || refText("objekte", a.objekt_id))}</td><td>${sel(a, "sv_gegenstand")}</td><td>${sel(a, "sv_grundlage")}</td></tr>`; }).join("")
        || '<tr><td class="leer" colspan="5">Keine Anlagen gefunden.</td></tr>'}</tbody></table></div>`;
    const speichern = async (a, daten) => {
      await api("PUT", `anlagen/${a.id}`, daten);
      Object.assign(a, daten);
    };
    el.querySelectorAll("[data-an]").forEach((c) => c.onchange = async () => {
      const a = anlagen.find((x) => x.id === Number(c.dataset.an));
      const daten = { sv_relevant: c.checked ? 1 : 0 };
      if (c.checked && !a.sv_gegenstand && svVorschlag(a)) { daten.sv_gegenstand = svVorschlag(a); if (!a.sv_grundlage) daten.sv_grundlage = svGrundlageVorschlag(daten.sv_gegenstand) || null; }
      try { await speichern(a, daten); melde(c.checked ? `${a.bezeichnung} ist jetzt im SV-Prüfplan.` : `${a.bezeichnung} ist nicht mehr im SV-Prüfplan.`); cacheLeeren(); zeichnenAuswahl(); }
      catch (err) { melde(err.message, true); c.checked = !c.checked; }
    });
    el.querySelectorAll("[data-sv]").forEach((s) => s.onchange = async () => {
      const a = anlagen.find((x) => x.id === Number(s.dataset.id));
      try { await speichern(a, { [s.dataset.sv]: s.value || null }); melde("Gespeichert."); cacheLeeren(); }
      catch (err) { melde(err.message, true); }
    });
    const alleK = el.querySelector("#svalle");
    if (alleK) alleK.onclick = async () => {
      const ok = await dialog("Vorschläge anwählen", `<p>${offen.length} Anlagen kommen in den SV-Prüfplan:</p><ul class="sv-liste">${offen.map((a) => `<li><b>${esc(a.bezeichnung)}</b> · ${esc(svVorschlag(a))}</li>`).join("")}</ul>
        <p class="klein">Bitte prüfen, ob das zur Prüfverordnung und zum Brandschutzkonzept passt. Abwählen geht jederzeit.</p>`,
        [{ text: "Abbrechen" }, { text: "Alle anwählen", klasse: "haupt-k", aktion: () => true }]);
      if (!ok) return;
      let n = 0;
      for (const a of offen) {
        const g = svVorschlag(a);
        try { await speichern(a, { sv_relevant: 1, sv_gegenstand: a.sv_gegenstand || g, sv_grundlage: a.sv_grundlage || svGrundlageVorschlag(g) || null }); n++; }
        catch (err) { melde(`${a.bezeichnung}: ${err.message}`, true); }
      }
      melde(`${n} Anlagen in den SV-Prüfplan übernommen.`); cacheLeeren(); zeichnenAuswahl();
    };
  };

  const statusOptionen = () => z.ansicht === "plan"
    ? [["", "Alle Prüfungen"], ["ueber", "Überfällig"], ["90", "Fällig in 90 Tagen"], ["ohne", "Ohne Prüftermin"], ["maengel", "Mit offenen Mängeln"]]
    : [["", "Alle Anlagen"], ["an", "Ausgewählt"], ["aus", "Nicht ausgewählt"], ["vorschlag", "Nur Vorschläge"]];
  const laden = async () => {
    el.querySelectorAll("[data-ans]").forEach((b) => b.classList.toggle("an", b.dataset.ans === z.ansicht));
    const s = el.querySelector("#svs");
    s.innerHTML = statusOptionen().map(([w, t]) => `<option value="${w}" ${w === z.status ? "selected" : ""}>${t}</option>`).join("");
    const qs = z.objekt ? `?objekt_id=${z.objekt}` : "";
    el.querySelector("#svs").hidden = el.querySelector("#svq").hidden = z.ansicht === "maengel";
    if (z.ansicht === "maengel") { el.querySelector("#svk").innerHTML = ""; el.querySelector("#sva").textContent = ""; await svMaengelReiter(el.querySelector("#svinhalt"), z.objekt ? { objekt_id: z.objekt } : {}); return; }
    if (z.ansicht === "plan") { plan = (await api("GET", `svpruefplan${qs}`)).anlagen; zeichnenPlan(); }
    else { anlagen = await api("GET", `anlagen${qs}`); zeichnenAuswahl(); }
  };
  el.querySelectorAll("[data-ans]").forEach((b) => b.onclick = () => {
    z.ansicht = b.dataset.ans; z.status = "";
    history.replaceState(null, "", `#/svpruefplan${z.ansicht !== "plan" ? "?ansicht=" + z.ansicht : ""}`);
    laden();
  });
  el.querySelector("#svo").onchange = (e) => { z.objekt = e.target.value; laden(); };
  el.querySelector("#svs").onchange = (e) => { z.status = e.target.value; z.ansicht === "plan" ? zeichnenPlan() : zeichnenAuswahl(); };
  let t;
  el.querySelector("#svq").oninput = (e) => { clearTimeout(t); t = setTimeout(() => { z.q = e.target.value; z.ansicht === "plan" ? zeichnenPlan() : zeichnenAuswahl(); }, 200); };
  el.querySelector("#svinhalt").addEventListener("click", async (e) => {
    const erl = e.target.closest("[data-erl]"), ter = e.target.closest("[data-termin]");
    if (erl) {
      const a = plan.find((x) => x.pruefungen.some((w) => w.id === Number(erl.dataset.erl)));
      const w = a.pruefungen.find((x) => x.id === Number(erl.dataset.erl));
      if (await erledigtMelden(w, a)) laden();
      return;
    }
    if (ter) { if (await svTerminAnlegen(plan.find((x) => x.id === Number(ter.dataset.termin)))) laden(); return; }
    const tr = e.target.closest("tr[data-a]");
    if (z.ansicht !== "plan") return;
    if (tr) location.hash = tr.dataset.w ? `#/wartungen/${tr.dataset.w}` : `#/anlagen/${tr.dataset.a}`;
  });
  await laden();
};
