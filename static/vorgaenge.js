/* Casa CAFM – Vorgangsliste: Angebote und Aufträge je Objekt, Claude liest Dokumente aus */
"use strict";

const VG_GRUPPEN = [
  { titel: "Angebotserfasser/in", felder: ["angebot_nr", "bearbeiter", "datum", "summe_netto", "fee", "fee_wert", "objekt_id", "beschreibung"] },
  { titel: "Objektleiter/in", felder: ["firma", "sub_angebot_nr", "auftrag_nr", "beauftragt_am", "fertiggestellt_am", "versendet_am", "bemerkung"] },
  { titel: "Buchhaltung CCC", felder: ["rg_nr", "rg_datum", "rg_betrag", "status"] },
  { titel: "Auftrag", felder: ["cockpit_id", "ab_nr", "ab_am", "casa_auftrag_nr", "nu_beauftragt", "wowflow_ticket"], rand: true },
];
const VG_KURZ = {};
const VG_STATUS_FARBE = { offen: "m-geplant", beauftragt: "m-bald", fertiggestellt: "m-arbeit", abgerechnet: "m-ok", abgelehnt: "m-ueber", storniert: "m-ueber" };
const vgFeld = (n) => S.schema.vorgaenge.felder.find((f) => f.name === n);
const vgLabel = (n) => VG_KURZ[n] || vgFeld(n).label;
const vgEuro = (v) => v == null || v === "" ? "" : Number(v).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

function vgZelle(v, n, dokumente) {
  const w = v[n];
  if (n === "angebot_nr") {
    const dok = dokumente.find((d) => d.vorgang_id === v.id && d.kategorie === "Angebot") || dokumente.find((d) => d.vorgang_id === v.id);
    return w ? (dok ? `<a href="/api/dokumente/${dok.id}/datei" target="_blank" rel="noopener" class="vg-nr" title="Angebot öffnen">${esc(w)}</a>` : esc(w)) : "";
  }
  if (n === "objekt_id") return esc(((S.cache.objekte || []).find((o) => o.id === w) || {}).name || "");
  if (n === "status") return w ? `<span class="marke ${VG_STATUS_FARBE[w] || ""}">${esc(w)}</span>` : "";
  const f = vgFeld(n);
  if (f.typ === "money") return vgEuro(w);
  if (f.typ === "date") return datum(w);
  if (f.typ === "number") return w == null ? "" : zahl(w, 0);
  return esc(w ?? "");
}

/* Vorgangsliste eines Objekts. eingebettet = als Reiter auf der Objektseite */
async function vgBereich(el, oidStart, eingebettet = false) {
  await Promise.all([lade("objekte"), einstellungenLaden()]);
  const objekte = S.cache.objekte || [];
  const oid = String(oidStart || "");
  const [liste, dokumente] = await Promise.all([api("GET", `vorgaenge${oid ? `?objekt_id=${oid}` : ""}`), api("GET", `dokumente${oid ? `?objekt_id=${oid}` : ""}`)]);
  const o = objekte.find((x) => String(x.id) === oid);
  let suche = "", statusFilter = "", sortFeld = "datum", sortAb = true;
  const bearbeitbar = darf("vorgaenge");
  const alleFelder = VG_GRUPPEN.flatMap((g) => g.felder).filter((n) => !(oid && n === "objekt_id" && false));

  el.innerHTML = `${eingebettet ? "" : '<a class="zurueck" href="#/vorgaenge">← Alle Objekte</a>'}<div class="vg-kopf ${eingebettet ? "vg-eingebettet" : ""}"><div>${eingebettet ? "<h2>" : "<h1>"}Vorgangsliste · ${esc(o ? o.name : "")}${eingebettet ? "</h2>" : "</h1>"}
      <p class="klein vg-hinweis">Angebote und Aufträge. Claude liest Angebote, Aufträge, Auftragsbestätigungen und Rechnungen aus und trägt sie ein. Die Nummer öffnet das Angebot. Abgelehnte Angebote bitte im „Angebotsstatus“ markieren.</p></div>
      <img src="/logo.png" alt="Casa Concept Consulting" class="vg-logo"></div>
    <div class="vg-werkzeug">
      ${eingebettet ? "" : `<select id="vgObj" aria-label="Objekt">${objekte.map((x) => `<option value="${x.id}" ${String(x.id) === oid ? "selected" : ""}>${esc(anzeige("objekte", x))}</option>`).join("")}</select>`}
      <input type="search" id="vgSuche" placeholder="Suchen: Nummer, Firma, Beschreibung …">
      <span class="vg-chips">${["", "offen", "beauftragt", "fertiggestellt", "abgerechnet", "abgelehnt"].map((s) => `<button class="knopf klein ${s === statusFilter ? "haupt-k" : ""}" data-st="${s}">${s || "alle"}</button>`).join("")}</span>
      <span class="vg-rechts">${bearbeitbar ? `<button class="knopf haupt-k" id="vgKi">Dokument von Claude auswerten</button><button class="knopf" id="vgNeu">${icon("plus")} Vorgang</button><button class="knopf" id="vgImp">Excel-Liste übernehmen</button>` : ""}
        <button class="knopf" id="vgDruck">Drucken (PDF)</button><button class="knopf" id="vgCsv">Excel (CSV)</button></span>
    </div>
    <div class="raster k4" id="vgKpi"></div><div class="abstand"></div>
    <div class="vg-tabelle-wrap"><table class="vg-tabelle"><thead><tr class="vg-gruppen">${VG_GRUPPEN.map((g) => `<th colspan="${g.felder.length}" class="${g.rand ? "vg-rand" : ""}">${esc(g.titel)}</th>`).join("")}<th></th></tr>
      <tr>${VG_GRUPPEN.map((g) => g.felder.map((n, i) => `<th data-sort="${n}" class="${g.rand && i === 0 ? "vg-rand-l" : ""}">${esc(vgLabel(n))}<span class="vg-pfeil"></span></th>`).join("")).join("")}<th></th></tr></thead>
      <tbody id="vgBody"></tbody></table></div>`;

  const sichtbar = () => liste.filter((v) => (!statusFilter || v.status === statusFilter) && (!suche || alleFelder.some((n) => String(v[n] ?? "").toLowerCase().includes(suche))))
    .sort((a, b) => { const x = a[sortFeld] ?? "", y = b[sortFeld] ?? ""; return (x < y ? -1 : x > y ? 1 : b.id - a.id) * (sortAb ? -1 : 1); });

  const kpis = () => {
    const summe = (arr, f) => arr.reduce((s, v) => s + (Number(v[f]) || 0), 0);
    const of = liste.filter((v) => v.status === "offen"), be = liste.filter((v) => v.status === "beauftragt"), fe = liste.filter((v) => v.status === "fertiggestellt"), ab = liste.filter((v) => v.status === "abgerechnet");
    el.querySelector("#vgKpi").innerHTML = `
      <div class="karte kennzahl"><div class="wert">${of.length}</div><div class="text">offene Angebote · ${vgEuro(summe(of, "summe_netto")) || "0,00 €"}</div></div>
      <div class="karte kennzahl gelb"><div class="wert">${be.length}</div><div class="text">beauftragt · ${vgEuro(summe(be, "summe_netto")) || "0,00 €"}</div></div>
      <div class="karte kennzahl ${fe.length ? "orange" : ""}"><div class="wert">${fe.length}</div><div class="text">fertig, noch nicht abgerechnet</div></div>
      <div class="karte kennzahl"><div class="wert">${vgEuro(summe(ab, "rg_betrag")) || "0,00 €"}</div><div class="text">abgerechnet (${ab.length}) · ${liste.filter((v) => v.status === "abgelehnt").length} abgelehnt</div></div>`;
  };

  const zeichnen = () => {
    const rows = sichtbar();
    el.querySelector("#vgBody").innerHTML = rows.length ? rows.map((v) => `<tr data-id="${v.id}" class="${v.status === "abgelehnt" || v.status === "storniert" ? "vg-ab" : ""}">${VG_GRUPPEN.map((g) => g.felder.map((n, i) =>
      `<td data-f="${n}" class="${["summe_netto", "rg_betrag"].includes(n) ? "rechts" : ""} ${g.rand && i === 0 ? "vg-rand-l" : ""} ${bearbeitbar && n !== "objekt_id" ? "vg-edit" : ""}">${vgZelle(v, n, dokumente)}</td>`).join("")).join("")}
      <td class="vg-akt"><button class="knopf klein" data-mehr="${v.id}" title="Alle Angaben und Unterlagen">…</button></td></tr>`).join("")
      : `<tr><td colspan="${alleFelder.length + 1}" class="klein vg-leer">${liste.length ? "Keine Vorgänge für diesen Filter." : "Noch keine Vorgänge. Leg ein Angebot von Claude auswerten oder übernimm die bisherige Excel-Liste."}</td></tr>`;
    el.querySelectorAll("th[data-sort]").forEach((th) => { th.querySelector(".vg-pfeil").textContent = th.dataset.sort === sortFeld ? (sortAb ? " ▼" : " ▲") : ""; });
    kpis();
  };
  zeichnen();

  const objWahl = el.querySelector("#vgObj");
  if (objWahl) objWahl.onchange = (e) => { location.hash = `#/vorgaenge/${e.target.value}`; };
  el.querySelector("#vgSuche").oninput = (e) => { suche = e.target.value.trim().toLowerCase(); zeichnen(); };
  el.querySelectorAll("[data-st]").forEach((b) => b.onclick = () => { statusFilter = b.dataset.st; el.querySelectorAll("[data-st]").forEach((x) => x.classList.toggle("haupt-k", x === b)); zeichnen(); });
  el.querySelectorAll("th[data-sort]").forEach((th) => th.onclick = () => { if (sortFeld === th.dataset.sort) sortAb = !sortAb; else { sortFeld = th.dataset.sort; sortAb = false; } zeichnen(); });
  const neuLaden = () => vgBereich(el, oid, eingebettet);

  /* Direkt in der Tabelle bearbeiten, wie in Excel */
  el.querySelector("#vgBody").addEventListener("click", async (e) => {
    const mehr = e.target.closest("[data-mehr]");
    if (mehr) { await vgDetail(liste.find((v) => v.id === Number(mehr.dataset.mehr)), dokumente); return neuLaden(); }
    if (e.target.closest("a")) return;
    const td = e.target.closest("td.vg-edit");
    if (!td || td.querySelector("input,select,textarea")) return;
    const v = liste.find((x) => x.id === Number(td.parentElement.dataset.id)), n = td.dataset.f, f = vgFeld(n);
    const alt = v[n] ?? "";
    let feld;
    if (f.typ === "select") feld = `<select>${["", ...f.optionen].map((x) => `<option ${x === alt ? "selected" : ""}>${esc(x)}</option>`).join("")}</select>`;
    else if (f.typ === "date") feld = `<input type="date" value="${esc(alt)}">`;
    else if (f.typ === "money" || f.typ === "number") feld = `<input inputmode="decimal" value="${alt === "" ? "" : String(alt).replace(".", ",")}">`;
    else if (f.typ === "textarea") feld = `<textarea rows="2">${esc(alt)}</textarea>`;
    else feld = `<input value="${esc(alt)}">`;
    td.innerHTML = feld; td.classList.add("vg-aktiv");
    const inp = td.firstElementChild; inp.focus(); if (inp.select) inp.select();
    let fertig = false;
    const ende = async (speichern) => {
      if (fertig) return; fertig = true;
      let wert = inp.value.trim();
      if (f.typ === "money" || f.typ === "number") wert = wert === "" ? null : Number(wert.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
      if (wert === "") wert = null;
      if (!speichern || wert === (v[n] ?? null) || (wert === null && alt === "")) { td.classList.remove("vg-aktiv"); td.innerHTML = vgZelle(v, n, dokumente); return; }
      try {
        const neu = await api("PUT", `vorgaenge/${v.id}`, { [n]: wert });
        Object.assign(v, neu);
        const tr = td.parentElement;
        td.classList.remove("vg-aktiv");
        tr.querySelectorAll("td[data-f]").forEach((z) => { if (!z.querySelector("input,select,textarea")) z.innerHTML = vgZelle(v, z.dataset.f, dokumente); });
        tr.classList.toggle("vg-ab", v.status === "abgelehnt" || v.status === "storniert");
        kpis();
        if (n !== "status" && neu.status !== (alt && n === "status" ? alt : neu.status)) melde(`Gespeichert. Status: ${neu.status}.`); else melde("Gespeichert.");
      } catch (err) { melde(err.message, true); td.classList.remove("vg-aktiv"); td.innerHTML = vgZelle(v, n, dokumente); }
    };
    inp.addEventListener("blur", () => ende(true));
    inp.addEventListener("keydown", (k) => {
      if (k.key === "Escape") { k.preventDefault(); ende(false); }
      if (k.key === "Enter" && !(f.typ === "textarea" && k.shiftKey)) { k.preventDefault(); inp.blur(); }
    });
    if (f.typ === "select") inp.addEventListener("change", () => inp.blur());
  });

  const ki = el.querySelector("#vgKi");
  if (ki) ki.onclick = async () => { if (await vgKiAuswerten(oid)) neuLaden(); };
  const nb = el.querySelector("#vgNeu");
  if (nb) nb.onclick = async () => { const r = await bearbeiten("vorgaenge", null, { objekt_id: oid ? Number(oid) : "", datum: new Date().toISOString().slice(0, 10), status: "offen" }); if (r) neuLaden(); };
  const imp = el.querySelector("#vgImp");
  if (imp) imp.onclick = async () => { if (await vgImport(oid)) neuLaden(); };
  el.querySelector("#vgDruck").onclick = () => vgDrucken(sichtbar(), o, dokumente);
  el.querySelector("#vgCsv").onclick = () => {
    const kopf = alleFelder.map(vgLabel);
    const zeilen = sichtbar().map((v) => alleFelder.map((n) => { const f = vgFeld(n); const w = v[n]; return n === "objekt_id" ? (((S.cache.objekte || []).find((x) => x.id === w) || {}).name || "") : f.typ === "date" ? datum(w) : f.typ === "money" && w != null ? String(w).replace(".", ",") : (w ?? ""); }));
    const csv = "﻿" + [kopf, ...zeilen].map((z) => z.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_Vorgangsliste_${(o ? o.kuerzel : "alle").replace(/\s+/g, "")}.csv`; a.click();
  };
}

/* Übersicht: je Objekt eine eigene Vorgangsliste */
SEITEN.vorgaenge = async (el) => {
  await lade("objekte");
  const objekte = S.cache.objekte || [];
  if (objekte.length === 1) { location.replace(`#/vorgaenge/${objekte[0].id}`); return; }
  const liste = await api("GET", "vorgaenge");
  const summe = (arr, f) => arr.reduce((s, v) => s + (Number(v[f]) || 0), 0);
  el.innerHTML = seitenkopf("Vorgangsliste", "Angebote und Aufträge je Objekt",
    darf("vorgaenge") ? `<button class="knopf haupt-k" id="vgKiAlle">Dokument von Claude auswerten</button>` : "") + `
    <p class="klein">Jedes Objekt hat seine eigene Vorgangsliste. Objekt anklicken, um sie zu öffnen. Ein Dokument, das du hier auswertest, ordnet Claude dem richtigen Objekt zu.</p>
    <div class="vg-objekte">${objekte.map((o) => {
      const l = liste.filter((v) => v.objekt_id === o.id), of = l.filter((v) => v.status === "offen"), be = l.filter((v) => v.status === "beauftragt"), fe = l.filter((v) => v.status === "fertiggestellt");
      return `<a class="karte vg-objekt" href="#/vorgaenge/${o.id}"><div class="kicker">${esc(o.kuerzel || "")}</div><b>${esc(o.name || "")}</b>
        <div class="vg-objekt-zahlen"><span><b>${l.length}</b> Vorgänge</span><span><b>${of.length}</b> offen${of.length ? ` · ${vgEuro(summe(of, "summe_netto"))}` : ""}</span>
        <span><b>${be.length}</b> beauftragt</span>${fe.length ? `<span class="vg-warn"><b>${fe.length}</b> fertig, nicht abgerechnet</span>` : ""}</div></a>`;
    }).join("") || '<p class="klein">Noch keine Objekte.</p>'}</div>`;
  const k = el.querySelector("#vgKiAlle");
  if (k) k.onclick = async () => { if (await vgKiAuswerten("")) route(); };
};
DETAIL.vorgaenge = async (el, id) => vgBereich(el, id, false);




/* ---------- Alle Angaben und Unterlagen eines Vorgangs ---------- */
async function vgDetail(v, dokumente) {
  const doks = dokumente.filter((d) => d.vorgang_id === v.id);
  const felder = S.schema.vorgaenge.felder.filter((f) => v[f.name] != null && v[f.name] !== "");
  const aktion = await dialog(`${v.angebot_nr || "Vorgang"} · ${v.beschreibung || ""}`.slice(0, 90), `
    <div class="felder">${felder.map((f) => `<div><small>${esc(vgLabel(f.name))}</small>${f.name === "status" ? vgZelle(v, "status", []) : vgZelle(v, f.name, [])}</div>`).join("")}</div>
    <h3 style="margin-top:18px">Unterlagen</h3>
    ${doks.length ? `<ul class="liste">${doks.map((d) => `<li><span class="marke m-geplant">${esc(d.kategorie || "Dokument")}</span><a href="/api/dokumente/${d.id}/datei" target="_blank" rel="noopener">${esc(d.dateiname)}</a><span class="rechts klein">${datum(d.hochgeladen_am)} · ${esc(d.hochgeladen_von || "")}</span></li>`).join("")}</ul>`
      : '<p class="klein">Noch keine Unterlagen. Mit „Dokument von Claude auswerten“ werden sie automatisch angehängt.</p>'}`,
    [{ text: "Schließen" }, ...(darf("vorgaenge") ? [{ text: "Bearbeiten", klasse: "haupt-k", aktion: () => "bearb" }] : [])]);
  if (aktion === "bearb") await bearbeiten("vorgaenge", v);
}

/* ---------- Claude liest ein Dokument aus ---------- */
async function vgDateiLesen(datei) {
  return new Promise((ok, nein) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1] || ""); r.onerror = nein; r.readAsDataURL(datei); });
}

async function vgKiAuswerten(oidVorgabe) {
  await einstellungenLaden(true);
  const kiAn = EINST.ki_aktiv === "1";
  const objekte = S.cache.objekte || [];
  const wahl = await dialog("Dokument von Claude auswerten", `<div class="dfehler"></div><form class="formular" style="grid-template-columns:1fr" onsubmit="return false">
    <label><span>Objekt</span><select name="objekt_id"><option value="">Claude erkennt das Objekt aus dem Dokument</option>${objekte.map((o) => `<option value="${o.id}" ${String(o.id) === String(oidVorgabe) ? "selected" : ""}>${esc(anzeige("objekte", o))}</option>`).join("")}</select></label>
    <label><span class="pflicht">Dokument (PDF oder Foto)</span><input type="file" name="datei" accept=".pdf,image/*"></label>
    <p class="klein">Geht mit Angeboten von Casa, Angeboten von Nachunternehmern, Aufträgen, Auftragsbestätigungen, Rechnungen, Fertigmeldungen und Absagen. Claude erkennt die Art, liest Nummern, Datum und Beträge aus und ordnet es dem passenden Vorgang zu. Du prüfst alles, bevor es eingetragen wird. Das Dokument wird beim Objekt abgelegt.</p>
    ${kiAn ? '<p class="klein">„Im Programm auswerten“ schickt das Dokument zur Auswertung an Claude (Anthropic).</p>' : '<p class="klein">Die KI im Programm ist nicht eingeschaltet. Mit „Mit Claude-Chat auswerten“ geht es trotzdem: Anleitung kopieren, mit dem Dokument in den Claude-Chat geben, Antwort hier einfügen.</p>'}
  </form>`, [
    { text: "Abbrechen" },
    { text: "Mit Claude-Chat auswerten", klasse: kiAn ? "" : "haupt-k", aktion: async (hg) => vgAuswahl(hg, true) },
    ...(kiAn ? [{ text: "Im Programm auswerten", klasse: "haupt-k", aktion: async (hg) => vgAuswahl(hg, false) }] : [])]);
  if (!wahl) return false;
  let antwort;
  if (wahl.chat) {
    const vorlage = await api("GET", `vorgaenge/vorlage${wahl.objekt_id ? `?objekt_id=${wahl.objekt_id}` : ""}`);
    antwort = await dialog("Mit Claude-Chat auswerten", `<div class="dfehler"></div>
      <ol class="klein"><li>Anleitung kopieren.</li><li>In einem Claude-Chat die Anleitung einfügen und das Dokument „${esc(wahl.dateiname)}“ anhängen.</li><li>Die Antwort von Claude komplett kopieren und hier einfügen.</li></ol>
      <button type="button" class="knopf" id="vgKopie">Anleitung kopieren</button>
      <label style="display:block;margin-top:12px"><span class="pflicht">Antwort von Claude</span><textarea id="vgAntwort" rows="8" style="width:100%" placeholder="{ &quot;dokumentart&quot;: … }"></textarea></label>`, [
      { text: "Abbrechen" },
      { text: "Auswertung prüfen", klasse: "haupt-k", aktion: async (hg) => api("POST", "vorgaenge/einfuegen", { dokument_id: wahl.dokument_id, objekt_id: wahl.objekt_id, ergebnis: hg.querySelector("#vgAntwort").value }) }]);
    void 0;
  } else antwort = wahl.antwort;
  if (!antwort) return false;
  return vgVorschlagPruefen(antwort);
}
// Kopierknopf im Chat-Dialog (Dialog ist schon im DOM, wenn der Klick kommt)
document.addEventListener("click", async (e) => {
  if (!e.target.closest("#vgKopie")) return;
  const sel = document.querySelector(".dialog select[name=objekt_id]");
  const oid = sel ? sel.value : ((document.querySelector("#vgObj") || {}).value || (location.hash.match(/#\/(?:vorgaenge|objekte)\/(\d+)/) || [])[1] || "");
  try { const v = await api("GET", `vorgaenge/vorlage${oid ? `?objekt_id=${oid}` : ""}`); await navigator.clipboard.writeText(v.text); melde("Anleitung kopiert."); }
  catch (err) { melde("Kopieren ging nicht. Bitte Pop-ups und Zwischenablage erlauben.", true); }
});

async function vgAuswahl(hg, chat) {
  const f = hg.querySelector("form"), datei = f.datei.files[0];
  if (!datei) throw new Error("Bitte ein Dokument auswählen.");
  const inhalt = await vgDateiLesen(datei);
  const objekt_id = f.objekt_id.value || null;
  if (chat) {
    const r = await api("POST", "vorgaenge/auswerten", { objekt_id, dateiname: datei.name, inhalt, nur_ablegen: true });
    return { chat: true, dokument_id: r.dokument_id, objekt_id, dateiname: datei.name };
  }
  hg.querySelectorAll(".df button").forEach((b) => { b.disabled = true; });
  const knopf = [...hg.querySelectorAll(".df button")].pop(); knopf.textContent = "Claude liest …";
  try { return { antwort: await api("POST", "vorgaenge/auswerten", { objekt_id, dateiname: datei.name, inhalt }) }; }
  finally { hg.querySelectorAll(".df button").forEach((b) => { b.disabled = false; }); knopf.textContent = "Im Programm auswerten"; }
}

async function vgVorschlagPruefen(r) {
  const e = r.ergebnis, v = r.vorschlag;
  const objekte = S.cache.objekte || [];
  const felderAlle = S.schema.vorgaenge.felder.filter((f) => !f.nurlesen && f.name !== "objekt_id" && f.name !== "dienstleister_id");
  const zeile = (n, wert) => {
    const f = vgFeld(n);
    const altW = v.alt ? v.alt[n] : null;
    const eingabe = f.typ === "select" ? `<select data-vf="${n}">${["", ...f.optionen].map((x) => `<option ${x === wert ? "selected" : ""}>${esc(x)}</option>`).join("")}</select>`
      : f.typ === "date" ? `<input type="date" data-vf="${n}" value="${esc(wert || "")}">`
      : `<input data-vf="${n}" value="${esc(wert == null ? "" : f.typ === "money" ? String(wert).replace(".", ",") : wert)}">`;
    return `<tr><td><input type="checkbox" data-vh="${n}" checked aria-label="${esc(vgLabel(n))} übernehmen"></td><td>${esc(vgLabel(n))}</td>${v.alt ? `<td class="klein">${vgZelle(v.alt, n, []) || "–"}</td>` : ""}<td>${eingabe}</td></tr>`;
  };
  const html = `<div class="dfehler"></div>
    ${e.hinweis_anweisung ? '<div class="fehler">Achtung: Im Dokument steht Text, der sich wie eine Anweisung an eine KI liest. Claude ist dem nicht gefolgt. Bitte die Angaben besonders genau prüfen.</div>' : ""}
    <p><span class="marke m-bald">${esc(e.dokumentart)}</span> ${esc(e.zusammenfassung || "")}</p>
    <form class="formular" onsubmit="return false">
      <label><span class="pflicht">Objekt</span><select name="objekt_id"><option value="">Bitte wählen</option>${objekte.map((o) => `<option value="${o.id}" ${o.id === v.objekt_id ? "selected" : ""}>${esc(anzeige("objekte", o))}</option>`).join("")}</select></label>
      <label><span class="pflicht">Was soll passieren?</span><select name="ziel"><option value="neu" ${v.aktion !== "aktualisieren" ? "selected" : ""}>Neuen Vorgang anlegen</option>
        ${v.vorgaenge.map((x) => `<option value="${x.id}" ${x.id === v.vorgang_id ? "selected" : ""}>Ergänzen: ${esc(x.kennung)} · ${esc((x.beschreibung || "").slice(0, 50))}</option>`).join("")}</select></label>
    </form>
    ${v.aktion === "zuordnen" ? '<p class="klein">Claude hat keinen passenden Vorgang gefunden. Bitte oben den Vorgang wählen, zu dem das Dokument gehört.</p>' : v.aktion === "aktualisieren" ? '<p class="klein">Claude hat den passenden Vorgang gefunden. Links steht der bisherige Wert, rechts der neue.</p>' : ""}
    <table class="vg-pruef"><thead><tr><th></th><th>Feld</th>${v.alt ? "<th>bisher</th>" : ""}<th>neu</th></tr></thead><tbody>${Object.entries(v.felder).map(([n, w]) => zeile(n, w)).join("")}</tbody></table>
    <div class="vg-mehr"><select id="vgFeldPlus"><option value="">+ weiteres Feld</option>${felderAlle.filter((f) => !(f.name in v.felder)).map((f) => `<option value="${f.name}">${esc(vgLabel(f.name))}</option>`).join("")}</select></div>`;
  const offen = dialog("Auswertung prüfen und eintragen", html, [
    { text: "Abbrechen" },
    { text: "Eintragen", klasse: "haupt-k", aktion: async (hg) => {
      const f = hg.querySelector("form");
      const ziel = f.ziel.value;
      if (!f.objekt_id.value && ziel === "neu") throw new Error("Bitte das Objekt wählen.");
      const felder = {};
      hg.querySelectorAll("[data-vh]:checked").forEach((c) => {
        const n = c.dataset.vh, typ = vgFeld(n).typ; let w = hg.querySelector(`[data-vf="${n}"]`).value.trim();
        if (typ === "money" || typ === "number") w = w === "" ? null : Number(w.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
        felder[n] = w === "" ? null : w;
      });
      if (ziel === "neu" && !felder.beschreibung) felder.beschreibung = e.beschreibung || e.zusammenfassung || "Vorgang";
      const neu = await api("POST", "vorgaenge/uebernehmen", { vorgang_id: ziel === "neu" ? null : Number(ziel), objekt_id: f.objekt_id.value ? Number(f.objekt_id.value) : null,
        felder, dokument_id: r.dokument_id, dokumentart: e.dokumentart, quelle: "Claude" });
      melde(`${ziel === "neu" ? "Vorgang angelegt" : "Vorgang ergänzt"}: ${neu.angebot_nr || neu.beschreibung}. Status: ${neu.status}.`);
      return true;
    } }]);
  const plus = document.getElementById("vgFeldPlus");
  plus.onchange = () => {
    if (!plus.value) return;
    document.querySelector(".vg-pruef tbody").insertAdjacentHTML("beforeend", zeile(plus.value, ""));
    plus.querySelector(`option[value="${plus.value}"]`).remove(); plus.value = "";
  };
  return offen;
}

/* ---------- Bisherige Excel-Liste übernehmen ---------- */
async function vgImport(oid) {
  const objekte = S.cache.objekte || [];
  const r = await dialog("Excel-Vorgangsliste übernehmen", `<div class="dfehler"></div><form class="formular" style="grid-template-columns:1fr" onsubmit="return false">
    <label><span class="pflicht">Objekt</span><select name="objekt_id"><option value="">Bitte wählen</option>${objekte.map((o) => `<option value="${o.id}" ${String(o.id) === String(oid) ? "selected" : ""}>${esc(anzeige("objekte", o))}</option>`).join("")}</select></label>
    <label><span class="pflicht">Objektliste oder Vorgangsliste (.xlsx)</span><input type="file" name="datei" accept=".xlsx"></label>
    <p class="klein">Die Spalten werden an der Kopfzeile erkannt (Angebots Nr., Bearbeiter, Datum, Angebotssumme, Fee, Beschreibung, (Sub-)Firma, Auftrags Nr., beauftragt am, RG- Nr., Angebotsstatus, Cockpit-ID, AB Nr. …). Du kannst die ganze Objektliste nehmen: Der Reiter „Vorgangsliste“ wird automatisch gefunden. Angebotsnummern, die es beim Objekt schon gibt, werden übersprungen.</p></form>`,
    [{ text: "Abbrechen" }, { text: "Übernehmen", klasse: "haupt-k", aktion: async (hg) => {
      const f = hg.querySelector("form"), d = f.datei.files[0];
      if (!f.objekt_id.value) throw new Error("Bitte das Objekt wählen.");
      if (!d) throw new Error("Bitte die Excel-Datei auswählen.");
      return api("POST", "vorgaenge/import", { objekt_id: Number(f.objekt_id.value), inhalt: await vgDateiLesen(d), dateiname: d.name });
    } }]);
  if (r) melde(`${r.neu} Vorgänge übernommen${r.vorhanden ? `, ${r.vorhanden} gab es schon` : ""}.`);
  return r;
}

/* ---------- Drucken im Casa-Design (quer, wie die Excel-Liste) ---------- */
function vgDrucken(rows, o, dokumente) {
  const felder = VG_GRUPPEN.flatMap((g) => g.felder);
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Vorgangsliste ${esc(o ? o.kuerzel : "")}</title><style>
    @font-face { font-family: Carlito; src: url("${location.origin}/schrift/Carlito-Regular.ttf"); }
    @font-face { font-family: Carlito; src: url("${location.origin}/schrift/Carlito-Bold.ttf"); font-weight: 700; }
    @page { size: A3 landscape; margin: 10mm; }
    body { font-family: Calibri, Carlito, sans-serif; color: #3C3C3B; font-size: 7.5pt; margin: 0; }
    .kopf { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4mm; }
    .kopf img { width: 45mm; } h1 { font-size: 16pt; margin: 0 0 1mm; } .h { color: #E63713; font-size: 8pt; }
    table { width: 100%; border-collapse: collapse; table-layout: auto; }
    th { background: #E63713; color: #fff; padding: 1.5mm 1mm; text-align: left; font-size: 7pt; vertical-align: bottom; border-right: .2mm solid #F5A98F; }
    tr.g th { background: #FBEEE5; color: #E63713; text-transform: uppercase; letter-spacing: .06em; font-size: 6.5pt; border-right: 0; }
    td { padding: 1.2mm 1mm; border-bottom: .2mm solid #EFCFB7; border-right: .2mm solid #F3E1D3; vertical-align: top; }
    tr:nth-child(even) td { background: #FDF6F1; } td.r { text-align: right; white-space: nowrap; } tr.ab td { color: #939598; text-decoration: line-through; }
    a { color: #E63713; } .fuss { margin-top: 3mm; font-size: 7pt; color: #939598; }
  </style></head><body>
    <div class="kopf"><div><h1>Vorgangsliste · ${esc(o ? o.name : "")}</h1><div class="h">Angebote und Aufträge · Stand ${new Date().toLocaleDateString("de-DE")}</div></div><img src="${location.origin}/logo.png" alt=""></div>
    <table><thead><tr class="g">${VG_GRUPPEN.map((g) => `<th colspan="${g.felder.length}">${esc(g.titel)}</th>`).join("")}</tr>
      <tr>${felder.map((n) => `<th>${esc(vgLabel(n))}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((v) => `<tr class="${v.status === "abgelehnt" || v.status === "storniert" ? "ab" : ""}">${felder.map((n) => `<td class="${["summe_netto", "rg_betrag"].includes(n) ? "r" : ""}">${n === "status" ? esc(v.status || "") : vgZelle(v, n, dokumente).replace(/href="\//g, `href="${location.origin}/`)}</td>`).join("")}</tr>`).join("")}</tbody></table>
    <div class="fuss">Casa Concept Consulting GmbH &amp; Co. KG · ${rows.length} Vorgänge</div>
    <script>window.onload = () => setTimeout(() => print(), 400);<\/script></body></html>`;
  const f = window.open("", "_blank");
  if (!f) { melde("Das Druckfenster wurde blockiert. Bitte Pop-ups für diese Seite erlauben.", true); return; }
  f.document.open(); f.document.write(html); f.document.close();
}
