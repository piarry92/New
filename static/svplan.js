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

/* ---------- Jahresraster und Kennwerte wie im Excel-Prüfplan ---------- */
const svJahre = () => { const j = new Date().getFullYear(); return [j - 5, j - 4, j - 3, j - 2, j - 1, j, j + 1]; };
const svIntervall = (m) => !m ? "" : Number(m) % 12 === 0 ? `${Number(m) / 12} J` : `${zahl(m)} M`;
function svCodes(w) {
  const c = {};
  const dazu = (jahr, text, geplant = false) => {
    if (!jahr) return;
    const alt = c[jahr];
    if (!alt) c[jahr] = { text, geplant };
    else if (!alt.text.split("/").includes(text)) c[jahr] = { text: `${alt.text}/${text}`, geplant: alt.geplant && geplant };
  };
  if (!w) return c;
  const raster = w.raster || {};
  for (const [jahr, text] of Object.entries(raster)) String(text).split("/").forEach((t) => t.trim() && dazu(jahr, t.trim().toUpperCase(), t.trim().toUpperCase() === "P"));
  // Aus der Excel übernommene Prüfungen stecken schon im Raster; neu eingetragene kommen dazu
  for (const h of w.historie || []) if (!(h.importiert && raster[h.datum.slice(0, 4)])) dazu(h.datum.slice(0, 4), h.pruefart === "Nachprüfung" ? "NP" : "A");
  if (w.nachpruefung && !c[w.nachpruefung.slice(0, 4)]) dazu(w.nachpruefung.slice(0, 4), "NP", true);
  if (w.naechste && !c[w.naechste.slice(0, 4)]) dazu(w.naechste.slice(0, 4), "P", true);
  return c;
}
function svErheblich(a, w) {
  if (a.sv_erheblich_offen > 0) return "ja";
  const e = w && w.letztes && w.letztes.ergebnis;
  return e === "Mängel offen" ? "ja" : e === "Ohne Mängel" || e === "Mängel behoben" ? "nein" : "";
}
const svPruefer = (w) => (w && (w.pruefer || w.dl_name)) || "";
const svKommentar = (w, a) => !w ? ((a && a.notiz) || "") : [w.notiz, w.nachpruefung ? `Nachprüfung am ${datum(w.nachpruefung)}` : "", w.maengelfrist ? `Mängelfrist ${datum(w.maengelfrist)}` : ""].filter(Boolean).join(" · ");
const svBereiche = () => [...(S.schema.anlagen.felder.find((f) => f.name === "sv_bereich") || { optionen: [] }).optionen, ""];
function svGruppiert(zeilen) {
  const gruppen = new Map(svBereiche().map((b) => [b, []]));
  for (const z of zeilen) { const b = z.a.sv_bereich || ""; if (!gruppen.has(b)) gruppen.set(b, []); gruppen.get(b).push(z); }
  return [...gruppen].filter(([, l]) => l.length);
}

function svDrucken(zeilen, objektText) {
  const jahre = svJahre();
  const zelle = (w, j) => { const c = svCodes(w)[j]; return c ? `<span class="c ${c.geplant ? "g" : ""}">${esc(c.text)}</span>` : ""; };
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>SV-Prüfplan ${esc(objektText || "")}</title><style>
    @font-face { font-family: Carlito; src: url("${location.origin}/schrift/Carlito-Regular.ttf"); }
    @font-face { font-family: Carlito; src: url("${location.origin}/schrift/Carlito-Bold.ttf"); font-weight: 700; }
    @page { size: A4 landscape; margin: 12mm 10mm; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: Calibri, Carlito, sans-serif; color: #3C3C3B; font-size: 8.6pt; }
    .kopf { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: .6mm solid #E63713; padding-bottom: 3mm; margin-bottom: 4mm; }
    .kopf img { width: 44mm; } h1 { font-size: 17pt; margin: 3mm 0 1mm; }
    .k { font-size: 8pt; letter-spacing: .12em; color: #E63713; font-weight: 700; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; } thead { display: table-header-group; } tr { break-inside: avoid; }
    th { background: #3C3C3B; color: #fff; text-align: left; padding: 1.5mm 1.8mm; font-size: 7.8pt; }
    th.j, td.j { text-align: center; width: 9mm; }
    td { padding: 1.4mm 1.8mm; border-bottom: .2mm solid #D9DADB; vertical-align: top; }
    tr.g td { background: #FBEEE5; color: #B82C0F; font-weight: 700; padding-top: 2mm; }
    tr.u td.n { color: #B42318; font-weight: 700; }
    .c { display: inline-block; min-width: 6mm; padding: .2mm 1mm; border-radius: 1mm; background: #3C3C3B; color: #fff; font-weight: 700; font-size: 7.4pt; }
    .c.g { background: #fff; color: #E63713; border: .3mm solid #E63713; }
    .ja { color: #B42318; font-weight: 700; } small { color: #626366; }
    .leg { margin-top: 3mm; font-size: 7.6pt; color: #626366; }
    .fuss { position: fixed; bottom: 0; left: 0; right: 0; font-size: 7pt; color: #939598; text-align: center; }
  </style></head><body>
    <div class="kopf"><div><div class="k">SV-Prüfplan${objektText ? " · " + esc(objektText) : ""} · Stand ${datum(heute())}</div><h1>Prüfpflichtige technische Anlagen und Einrichtungen</h1></div><img src="${location.origin}/logo.png" alt=""></div>
    <table><thead><tr><th>Anlage</th><th>Nr.</th><th>Prüfgrundlage</th><th>Intervall</th><th>Prüfer</th><th>Letzte Prüfung</th><th>Erhebl. Mängel</th>${jahre.map((j) => `<th class="j">${j}</th>`).join("")}<th>Nächste</th><th>Kommentar</th></tr></thead><tbody>
    ${svGruppiert(zeilen).map(([b, l]) => `<tr class="g"><td colspan="${10 + jahre.length}">${esc(b || "Ohne Bereich")}</td></tr>` + l.map(({ a, w }) => {
      const t = w && w.naechste ? tageBis(w.naechste) : null, e = svErheblich(a, w);
      return `<tr class="${t != null && t < 0 ? "u" : ""}"><td><b>${esc(a.bezeichnung)}</b>${objektText ? "" : `<br><small>${esc(a.o_kuerzel || "")}</small>`}</td><td>${esc((w && w.pruefnummer) || "")}</td>
        <td>${esc((w && w.rechtsgrundlage) || a.sv_grundlage || "")}</td><td>${svIntervall(w && w.intervall_monate)}</td><td>${esc(svPruefer(w))}</td>
        <td>${w && w.letztes ? datum(w.letztes.datum) : w && w.letzte ? datum(w.letzte) : ""}</td><td class="${e === "ja" ? "ja" : ""}">${e}</td>
        ${jahre.map((j) => `<td class="j">${zelle(w, j)}</td>`).join("")}
        <td class="n">${w ? datum(w.naechste) : "kein Termin"}</td><td><small>${esc(svKommentar(w, a))}</small></td></tr>`;
    }).join("")).join("")}</tbody></table>
    <div class="leg">A = Prüfung durchgeführt · NP = Nachprüfung · P = geplante Prüfung (umrandet = noch offen)</div>
    <div class="fuss">Casa Concept Consulting GmbH &amp; Co. KG · www.ccc-frankfurt.com</div>
    <script>window.onload = () => setTimeout(() => print(), 300);<\/script></body></html>`;
  const f = window.open("", "_blank");
  if (!f) { melde("Das Druckfenster wurde blockiert. Bitte Pop-ups für diese Seite erlauben.", true); return; }
  f.document.open(); f.document.write(html); f.document.close();
}

async function svExcelImport(objektId) {
  await lade("objekte");
  const html = `<div class="dfehler"></div><form class="formular" onsubmit="return false">
    <label class="breit"><span class="pflicht">Objekt</span><select name="objekt_id"><option value="">Bitte wählen</option>${(S.cache.objekte || []).map((o) => `<option value="${o.id}" ${String(o.id) === String(objektId) ? "selected" : ""}>${esc(anzeige("objekte", o))}</option>`).join("")}</select></label>
    <label class="breit"><span class="pflicht">Excel-Datei (.xlsx)</span><input type="file" name="datei" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></label>
    <p class="klein breit">Aufbau wie die Übersicht der SV-Prüfungen: Bereichszeilen (z. B. Raumlufttechnik), darunter je Anlage Nr., Prüfgrundlage, Intervall, Prüfer, letzte Prüfung, erhebliche Mängel ja/nein, Jahresspalten mit A, NP, P und Kommentar. Fehlende Anlagen werden angelegt, die Prüftermine aus letzter Prüfung und Intervall berechnet. Schon übernommene Zeilen werden übersprungen.</p></form>`;
  return dialog("SV-Prüfplan aus Excel übernehmen", html, [{ text: "Abbrechen" }, {
    text: "Übernehmen", klasse: "haupt-k", aktion: async (hg) => {
      const fm = hg.querySelector("form"), datei = fm.datei.files[0];
      if (!fm.objekt_id.value) throw new Error("Bitte ein Objekt wählen.");
      if (!datei) throw new Error("Bitte die Excel-Datei auswählen.");
      const inhalt = await new Promise((ok, nein) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1] || ""); r.onerror = nein; r.readAsDataURL(datei); });
      const r = await api("POST", "svpruefplan/import", { objekt_id: Number(fm.objekt_id.value), inhalt });
      melde(`${r.zeilen} Zeilen gelesen: ${r.anlagen_neu} Anlagen neu, ${r.pruefungen_neu} Prüftermine angelegt${r.uebersprungen ? `, ${r.uebersprungen} schon vorhanden` : ""}${r.ohne_termin ? `, ${r.ohne_termin} ohne letzte Prüfung (kein Termin)` : ""}.`);
      cacheLeeren();
      return r;
    },
  }]);
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
  const passt = (a) => !z.q || [a.bezeichnung, a.nummer, a.standort, a.sv_gegenstand, a.sv_bereich, ...(a.pruefungen || []).flatMap((w) => [w.pruefer, w.pruefnummer])].some((x) => String(x || "").toLowerCase().includes(z.q.toLowerCase()));
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
      if (z.status === "maengel") return svErheblich(a, w) === "ja" || a.sv_maengel_offen > 0 || a.tickets_offen > 0;
      return true;
    });
  };

  const zeichnenPlan = () => {
    const alle = [];
    for (const a of plan) { if (!a.pruefungen.length) alle.push({ a, w: null }); for (const w of a.pruefungen) alle.push({ a, w }); }
    const ueber = alle.filter((x) => x.w && tageBis(x.w.naechste) < 0).length, bald = alle.filter((x) => x.w && tageBis(x.w.naechste) >= 0 && tageBis(x.w.naechste) <= 90).length;
    const ohne = alle.filter((x) => !x.w).length, erheblich = alle.filter((x) => svErheblich(x.a, x.w) === "ja").length;
    const zeilen = zeilenPlan(), jahre = svJahre(), mitObjekt = !z.objekt;
    el.querySelector("#sva").textContent = `${zeilen.length} Einträge`;
    el.querySelector("#svk").innerHTML = `${darf("anlagen_bearbeiten") && darf("wartung_planen") ? `<button class="knopf" id="svimp">Excel übernehmen</button>` : ""}${darf("export") ? `<button class="knopf" id="svcsv">${icon("export")} Excel</button>` : ""}<button class="knopf" id="svdruck">Drucken / PDF</button>`;
    const code = (w, j) => { const c = svCodes(w)[j]; return c ? `<span class="sv-code ${c.geplant ? "geplant" : ""} ${c.text.includes("NP") ? "np" : ""}">${esc(c.text)}</span>` : ""; };
    el.querySelector("#svinhalt").innerHTML = `<div class="raster k4 sv-kz5">
      <div class="karte kennzahl"><div class="wert">${plan.length}</div><div class="text">Anlagen im SV-Prüfplan</div></div>
      <div class="karte kennzahl ${ueber ? "rot" : ""}"><div class="wert">${ueber}</div><div class="text">Prüfungen überfällig</div></div>
      <div class="karte kennzahl ${bald ? "gelb" : ""}"><div class="wert">${bald}</div><div class="text">fällig in 90 Tagen</div></div>
      <div class="karte kennzahl ${erheblich ? "rot" : ""}"><div class="wert">${erheblich}</div><div class="text">mit erheblichen Mängeln</div></div>
      <div class="karte kennzahl ${ohne ? "gelb" : ""}"><div class="wert">${ohne}</div><div class="text">ohne Prüftermin</div></div></div>
      <div class="abstand"></div>
      ${plan.length ? `<div class="tabelle-wrap"><table class="sv-plan"><thead><tr><th>Anlage</th><th>Nr.</th><th>Prüfgrundlage</th><th>Intervall</th><th>Prüfer</th><th>Letzte Prüfung</th><th title="erhebliche Mängel">Erhebl. Mängel</th>
          ${jahre.map((j) => `<th class="sv-j ${j === new Date().getFullYear() ? "jetzt" : ""}">${j}</th>`).join("")}<th>Nächste Prüfung</th><th>Kommentar</th><th></th></tr></thead><tbody>
        ${svGruppiert(zeilen).map(([b, l]) => `<tr class="sv-gruppe"><td colspan="${11 + jahre.length}">${esc(b || "Ohne Bereich")} <span class="klein">${l.length}</span></td></tr>` + l.map(({ a, w }) => {
          const e = svErheblich(a, w);
          return `<tr class="klickbar" data-a="${a.id}" ${w ? `data-w="${w.id}"` : ""}>
          <td><span class="sv-anl">${symbolVon(a, 24)}<span><b>${esc(a.bezeichnung)}</b>${mitObjekt ? `<br><span class="klein">${esc(a.o_kuerzel || "")}</span>` : ""}${a.sv_gegenstand && a.sv_gegenstand !== a.bezeichnung ? `<br><span class="klein">${esc(a.sv_gegenstand)}</span>` : ""}</span></span></td>
          <td class="klein">${esc((w && w.pruefnummer) || "")}</td>
          <td class="klein">${esc((w && w.rechtsgrundlage) || a.sv_grundlage || "")}</td>
          <td>${svIntervall(w && w.intervall_monate)}</td>
          <td>${esc(svPruefer(w))}</td>
          <td>${w ? (w.letztes ? datum(w.letztes.datum) : datum(w.letzte)) : ""}</td>
          <td>${e === "ja" ? `<span class="marke m-ueber">ja</span>${a.sv_maengel_offen ? `<br><span class="klein">${a.sv_maengel_offen} offen</span>` : ""}` : e === "nein" ? '<span class="marke m-ok">nein</span>' : ""}</td>
          ${jahre.map((j) => `<td class="sv-j ${j === new Date().getFullYear() ? "jetzt" : ""}">${code(w, j)}</td>`).join("")}
          <td>${w ? `<b>${datum(w.naechste)}</b><br>${faelligMarke(w.naechste)}` : '<span class="marke m-bald">kein Termin</span>'}</td>
          <td class="klein sv-komm">${esc(svKommentar(w, a))}</td>
          <td class="sv-akt">${w ? (darf("wartung_erledigen") ? `<button class="knopf haupt-k klein" data-erl="${w.id}">Prüfung eintragen</button>` : "")
            : (darf("wartung_planen") ? `<button class="knopf haupt-k klein" data-termin="${a.id}">${icon("plus")} Termin</button>` : "")}</td></tr>`;
        }).join("")).join("") || `<tr><td class="leer" colspan="${11 + jahre.length}">Keine Einträge für diese Auswahl.</td></tr>`}</tbody></table></div>
        <div class="legende sv-legende"><span><span class="sv-code">A</span> Prüfung durchgeführt</span><span><span class="sv-code np">NP</span> Nachprüfung</span><span><span class="sv-code geplant">P</span> geplante Prüfung (umrandet = noch offen)</span></div>`
      : `<div class="karte leer">Noch keine Anlage im SV-Prüfplan. Übernimm einen Prüfplan mit „Excel übernehmen“ oder wechsle zu „Anlagen auswählen“ und hake die sicherheitsrelevanten Anlagen an.</div>`}`;
    const im = el.querySelector("#svimp");
    if (im) im.onclick = async () => { if (await svExcelImport(z.objekt)) laden(); };
    const cs = el.querySelector("#svcsv");
    if (cs) cs.onclick = () => {
      const kopf = ["Bereich", "Objekt", "Anlage", "Nr.", "Prüfgrundlage", "Intervall", "Prüfer", "Letzte Prüfung", "erhebliche Mängel ja/nein", ...jahre.map(String), "Nächste Prüfung", "Kommentar"];
      const rows = svGruppiert(zeilen).flatMap(([b, l]) => l.map(({ a, w }) => { const c = svCodes(w); return [b, a.o_kuerzel, a.bezeichnung, w && w.pruefnummer, (w && w.rechtsgrundlage) || a.sv_grundlage, svIntervall(w && w.intervall_monate), svPruefer(w),
        w ? (w.letztes ? datum(w.letztes.datum) : datum(w.letzte)) : "", svErheblich(a, w), ...jahre.map((j) => (c[j] ? c[j].text : "")), w ? datum(w.naechste) : "kein Termin", svKommentar(w, a)]; }));
      const csv = "\ufeff" + [kopf, ...rows].map((r) => r.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
      const l = document.createElement("a");
      l.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      l.download = `${heute().replace(/-/g, "")}_SV-Pruefplan.csv`;
      l.click();
      setTimeout(() => URL.revokeObjectURL(l.href), 2000);
    };
    el.querySelector("#svdruck").onclick = () => { const a0 = zeilen[0] && zeilen[0].a; svDrucken(zeilen, z.objekt && a0 ? [a0.o_kuerzel, a0.o_name].filter(Boolean).join(" · ") : ""); };
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
    ? [["", "Alle Prüfungen"], ["ueber", "Überfällig"], ["90", "Fällig in 90 Tagen"], ["ohne", "Ohne Prüftermin"], ["maengel", "Mit erheblichen oder offenen Mängeln"]]
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
