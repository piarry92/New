"use strict";
/* SV-Berichte hochladen, mit KI auswerten, SV-Mängelplan je Objekt */

const SV_EINST_FARBE = { "gefährlich": "m-ueber", "wesentlich": "m-bald", "geringfügig": "m-geplant", "unklar": "m-geplant" };
const SV_STATUS_FARBE = { offen: "m-ueber", "in Arbeit": "m-bald", behoben: "m-ok", "nachgeprüft": "m-ok" };
const svEinstMarke = (e) => e ? `<span class="marke ${SV_EINST_FARBE[e] || "m-geplant"}">${esc(e)}</span>` : "";
const svStatusMarke = (s) => `<span class="marke ${SV_STATUS_FARBE[s] || "m-geplant"}">${esc(s || "offen")}</span>`;
const svOffen = (m) => ["offen", "in Arbeit"].includes(m.status || "offen");

/* ---------- Karte „SV-Berichte“ auf der Anlagenseite ---------- */
async function svBerichtKarte(box, a) {
  const doks = (await api("GET", `dokumente?anlage_id=${a.id}`)).filter((d) => d.kategorie === "Prüfbericht");
  const ein = await einstellungenLaden();
  const kiAn = ein.ki_aktiv === "1";
  box.innerHTML = `<h3>SV-Berichte</h3>
    <p class="klein">Lade den Prüfbericht hoch. Gib ihn dann im Claude-Chat zum Auswerten und füge die Antwort hier mit „Auswertung von Claude einfügen“ ein. Du prüfst die Mängel und übernimmst sie in den SV-Mängelplan des Objekts.</p>
    ${doks.length ? `<div class="sv-berichte">${doks.map((d) => `<div class="sv-bericht"><a href="/api/dokumente/${d.id}/datei" target="_blank" rel="noopener">${icon("dokumente")}<span><b>${esc(d.titel)}</b><br><span class="klein">${datum(d.hochgeladen_am)} · ${esc(d.dateiname || "")}</span></span></a>
      ${darf("tickets_bearbeiten") ? `<span class="sv-bk"><button class="knopf klein haupt-k" data-svclaude="${d.id}">Auswertung von Claude einfügen</button><button class="knopf klein" data-svaus="${d.id}">${kiAn ? "KI-Auswertung im Programm" : "Von Hand eintragen"}</button></span>` : ""}</div>`).join("")}</div>` : '<p class="klein">Noch kein SV-Bericht hochgeladen.</p>'}
    ${darf("dokumente_hochladen") ? `<div class="qr-knoepfe"><button class="knopf haupt-k" id="svhoch">${icon("plus")} SV-Bericht hochladen</button></div>` : ""}`;
  const hoch = box.querySelector("#svhoch");
  if (hoch) hoch.onclick = async () => {
    const neu = await hochladen({ objekt_id: a.objekt_id, anlage_id: a.id, kategorie: "Prüfbericht", titel: `SV-Bericht ${a.bezeichnung} ${heute().slice(0, 4)}` });
    if (!neu || !neu.id) return;
    const d = await api("GET", `dokumente/${neu.id}`);
    await svBerichtKarte(box, a);
    if (d.id && darf("tickets_bearbeiten") && kiAn) await svBerichtAuswerten({ ...d, objekt_id: a.objekt_id, anlage_id: a.id }, a, kiAn);
  };
  box.querySelectorAll("[data-svclaude]").forEach((b) => b.onclick = async () => {
    const d = doks.find((x) => x.id === Number(b.dataset.svclaude));
    const aus = await svClaudeEinfuegen(d);
    if (aus && await svPruefDialog(d, a, aus, false)) route();
  });
  box.querySelectorAll("[data-svaus]").forEach((b) => b.onclick = async () => {
    const d = doks.find((x) => x.id === Number(b.dataset.svaus));
    if (await svBerichtAuswerten(d, a, kiAn)) route();
  });
}

/* ---------- Auswertung aus dem Claude-Chat einfügen ---------- */
function svJsonFinden(text) {
  const t = String(text || "").replace(/```(?:json)?/gi, "");
  const start = t.indexOf("{"), ende = t.lastIndexOf("}");
  if (start < 0 || ende <= start) throw new Error("Im eingefügten Text steht keine Auswertung. Bitte die ganze Antwort von Claude kopieren.");
  try { return JSON.parse(t.slice(start, ende + 1)); }
  catch (e) { throw new Error("Der eingefügte Text ist unvollständig. Bitte die ganze Antwort von Claude kopieren, vom ersten { bis zum letzten }."); }
}

async function svClaudeEinfuegen(dok) {
  const html = `<div class="dfehler"></div>
    <ol class="sv-schritte">
      <li>Öffne einen Chat mit Claude und lade dort den SV-Bericht <b>${esc(dok.titel)}</b> hoch (<a href="/api/dokumente/${dok.id}/datei" target="_blank" rel="noopener">Bericht öffnen</a>).</li>
      <li>Schreib dazu: „Werte den SV-Bericht für Casa CAFM aus.“ Oder kopier die genaue Anleitung mit <button class="knopf klein" type="button" id="svvorl">Anleitung kopieren</button> und füge sie in den Chat ein.</li>
      <li>Kopier die Antwort von Claude komplett und füge sie unten ein. Eine gespeicherte Datei (.json oder .txt) geht auch.</li>
    </ol>
    <form class="formular" onsubmit="return false">
      <label class="breit"><span>Antwort von Claude</span><textarea name="text" rows="10" placeholder="{ &quot;pruefdatum&quot;: … }"></textarea></label>
      <label class="breit"><span>oder Datei</span><input type="file" name="datei" accept=".json,.txt,application/json,text/plain"></label>
    </form>`;
  const p = dialog(`Auswertung einfügen: ${dok.titel}`, html, [{ text: "Abbrechen" }, {
    text: "Weiter zum Prüfen", klasse: "haupt-k", aktion: async (hg) => {
      const fm = hg.querySelector("form");
      let text = fm.text.value;
      if (!text.trim() && fm.datei.files[0]) text = await fm.datei.files[0].text();
      if (!text.trim()) throw new Error("Bitte die Antwort von Claude einfügen.");
      const r = await api("PUT", `dokumente/${dok.id}/sv-auswertung`, { ergebnis: svJsonFinden(text) });
      return r.auswertung;
    },
  }]);
  const hg = letzterDialog();
  hg.querySelector(".dialog").classList.add("breit-dialog");
  hg.querySelector("#svvorl").onclick = async () => {
    try {
      const { text } = await api("GET", "sv-vorlage");
      await navigator.clipboard.writeText(text);
      melde("Anleitung kopiert. Jetzt im Claude-Chat einfügen und den Bericht dazu hochladen.");
    } catch (e) { melde("Kopieren ging nicht. Bitte im Browser die Zwischenablage erlauben.", true); }
  };
  return p;
}

/* ---------- Auswertung prüfen und übernehmen ---------- */
async function svBerichtAuswerten(dok, a, kiAn) {
  let aus = null;
  if (kiAn) {
    aus = (await api("GET", `dokumente/${dok.id}/sv-auswertung`)).auswertung;
    if (!aus) aus = await svKiLaufen(dok);
    if (!aus) return false;
  }
  return svPruefDialog(dok, a, aus, kiAn);
}

async function svKiLaufen(dok) {
  const warte = document.createElement("div");
  warte.className = "dialog-hg";
  warte.innerHTML = `<div class="dialog sv-warte"><div class="di"><div class="sv-kreisel"></div><h2>Die KI liest den Bericht</h2>
    <p>„${esc(dok.titel)}“ wird ausgewertet. Das dauert meist ein bis drei Minuten. Du kannst das Fenster offen lassen.</p></div></div>`;
  document.body.appendChild(warte);
  try { return (await api("POST", `dokumente/${dok.id}/sv-auswertung`)).auswertung; }
  catch (err) { melde(err.message, true); return null; }
  finally { warte.remove(); }
}

async function svPruefDialog(dok, a, aus, kiAn) {
  const sv = a ? (await api("GET", `wartungen?anlage_id=${a.id}`)).filter((w) => w.aktiv && w.art === "SV-Prüfung") : [];
  let liste = (aus && aus.maengel ? aus.maengel : []).map((m) => ({ ...m, an: true }));
  if (!liste.length && !kiAn) liste = [{ nummer: "", beschreibung: "", ort: "", einstufung: "unklar", frist: "", frist_text: "", seite: null, an: true }];
  const einst = S.schema.sv_maengel.felder.find((f) => f.name === "einstufung").optionen;
  const fakten = aus ? [["Prüfdatum", datum(aus.pruefdatum)], ["Sachverständige", aus.sachverstaendiger], ["Prüfstelle", aus.pruefstelle], ["Prüfart", aus.pruefart],
    ["Ergebnis", aus.gesamtergebnis], ["Nächste Prüfung laut Bericht", datum(aus.naechste_pruefung)]].filter(([, w]) => w) : [];
  const zeile = (m, i) => `<tr data-i="${i}" class="${m.an ? "" : "aus"}"><td><input type="checkbox" data-f="an" ${m.an ? "checked" : ""} aria-label="Übernehmen"></td>
    <td><input data-f="nummer" value="${esc(m.nummer || "")}" class="sv-nr"></td>
    <td><textarea data-f="beschreibung" rows="2">${esc(m.beschreibung || "")}</textarea><input data-f="ort" value="${esc(m.ort || "")}" placeholder="Ort"></td>
    <td><select data-f="einstufung">${einst.map((o) => `<option ${m.einstufung === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></td>
    <td><input type="date" data-f="frist" value="${esc(m.frist || "")}">${m.frist_text ? `<div class="klein">${esc(m.frist_text)}</div>` : ""}</td>
    <td class="klein">${m.seite ? `S. ${m.seite}` : ""}</td></tr>`;
  const html = `<div class="dfehler"></div>
    ${aus && aus.hinweis_anweisung ? '<div class="warnung">Der Bericht enthält Text, der wie eine Anweisung an eine KI aussieht. Die KI hat ihn nicht befolgt. Bitte die Angaben besonders genau prüfen.</div>' : ""}
    ${aus && aus.ist_pruefbericht === false ? '<div class="warnung">Die KI hält dieses Dokument nicht für einen Prüfbericht. Bitte prüfen, ob die richtige Datei hochgeladen wurde.</div>' : ""}
    ${aus && aus.uebernommen ? `<div class="warnung">Diese Auswertung wurde am ${datum(aus.uebernommen)} schon übernommen. Ein zweites Übernehmen legt die Mängel doppelt an.</div>` : ""}
    ${aus ? `<div class="sv-fakten">${fakten.map(([l, w]) => `<div><small>${esc(l)}</small>${esc(w)}</div>`).join("")}</div>
      ${aus.zusammenfassung ? `<p class="sv-zus">${esc(aus.zusammenfassung)}</p>` : ""}
      <p class="klein">${aus.modell === "Claude-Chat (eingefügt)" ? "Auswertung aus dem Claude-Chat, eingefügt" : "Ausgewertet von der KI"} am ${datum(aus.zeit)} ${String(aus.zeit || "").slice(11, 16)}${aus.von ? ` ${aus.modell === "Claude-Chat (eingefügt)" ? "von" : "für"} ${esc(aus.von)}` : ""}. Bitte jeden Mangel mit dem Bericht vergleichen, die KI kann sich irren. Abgehakte Zeilen werden übernommen.</p>` : ""}
    <div class="tabelle-wrap"><table class="sv-pruef"><thead><tr><th></th><th>Nr.</th><th>Mangel und Ort</th><th>Einstufung</th><th>Frist</th><th></th></tr></thead><tbody id="svz">${liste.map(zeile).join("")}</tbody></table></div>
    ${!liste.length ? '<p class="klein">Die KI hat keine Mängel gefunden.</p>' : ""}
    <div class="werkzeug" style="margin-top:10px"><button class="knopf klein" id="svplus" type="button">${icon("plus")} Mangel von Hand ergänzen</button>${kiAn && aus ? '<button class="knopf klein" id="svneu" type="button">Noch einmal auswerten</button>' : ""}</div>
    <form class="formular" onsubmit="return false">
      <label><span>Prüfdatum</span><input type="date" name="pruefdatum" value="${esc((aus && aus.pruefdatum) || "")}"></label>
      ${sv.length && darf("wartung_erledigen") ? `<label class="check breit"><input type="checkbox" name="pruefung" ${aus && aus.pruefdatum ? "checked" : ""}> Prüfung im SV-Prüfplan eintragen („${esc(sv[0].titel)}“, nächster Termin wird neu berechnet)</label>` : ""}
    </form>`;
  const p = dialog(`SV-Bericht: ${dok.titel}`, html, [{ text: "Abbrechen" }, {
    text: "In den SV-Mängelplan übernehmen", klasse: "haupt-k", aktion: async (hg) => {
      lesen(hg);
      const gewaehlt = liste.filter((m) => m.an);
      if (gewaehlt.some((m) => !String(m.beschreibung || "").trim())) throw new Error("Bitte bei jedem abgehakten Mangel eine Beschreibung eintragen.");
      const fm = hg.querySelector("form");
      const pruef = fm.pruefung && fm.pruefung.checked;
      if (pruef && !fm.pruefdatum.value) throw new Error("Für den Eintrag im SV-Prüfplan bitte das Prüfdatum angeben.");
      if (!gewaehlt.length && !pruef) throw new Error("Es ist kein Mangel abgehakt.");
      const r = await api("POST", `svberichte/${dok.id}/uebernehmen`, {
        maengel: gewaehlt.map(({ an, ...m }) => m), pruefdatum: fm.pruefdatum.value || null, ki: !!aus, auswertung_id: aus && aus.id,
        pruefung: pruef ? { wartung_id: sv[0].id, datum: fm.pruefdatum.value } : null,
      });
      melde(`${r.angelegt} ${r.angelegt === 1 ? "SV-Mangel" : "SV-Mängel"} übernommen${r.pruefung_eingetragen ? ", Prüfung im SV-Prüfplan eingetragen" : ""}.`);
      cacheLeeren();
      return r;
    },
  }]);
  const hg = letzterDialog();
  hg.querySelector(".dialog").classList.add("breit-dialog");
  const lesen = (h) => h.querySelectorAll("#svz tr").forEach((tr) => {
    const m = liste[Number(tr.dataset.i)];
    tr.querySelectorAll("[data-f]").forEach((f) => { m[f.dataset.f] = f.type === "checkbox" ? f.checked : f.value; });
  });
  hg.querySelector("#svz").addEventListener("change", (e) => { const tr = e.target.closest("tr"); if (tr && e.target.dataset.f === "an") tr.classList.toggle("aus", !e.target.checked); });
  hg.querySelector("#svplus").onclick = () => {
    lesen(hg);
    liste.push({ nummer: "", beschreibung: "", ort: "", einstufung: "unklar", frist: "", frist_text: "", seite: null, an: true });
    hg.querySelector("#svz").insertAdjacentHTML("beforeend", zeile(liste[liste.length - 1], liste.length - 1));
    hg.querySelector("#svz tr:last-child textarea").focus();
  };
  const neu = hg.querySelector("#svneu");
  if (neu) neu.onclick = async () => {
    hg.querySelector(".x").click();
    const frisch = await svKiLaufen(dok);
    if (frisch) await svPruefDialog(dok, a, frisch, kiAn);
  };
  return p;
}

/* ---------- SV-Mängelplan ---------- */
async function svMaengelReiter(ziel, filter = {}) {
  await refsLaden("sv_maengel");
  const z = { status: "offen", q: "" };
  const titelObjekt = filter.objekt_id ? refText("objekte", filter.objekt_id) : "";
  ziel.innerHTML = `<div class="werkzeug"><input type="search" placeholder="SV-Mängel suchen" data-q>
    <select data-st><option value="offen">Offen und in Arbeit</option><option value="erledigt">Behoben und nachgeprüft</option><option value="">Alle</option></select>
    ${darfNeu("sv_maengel") ? `<button class="knopf haupt-k" data-neu>${icon("plus")} SV-Mangel</button>` : ""}
    <button class="knopf" data-druck>Drucken / PDF</button>${darf("export") ? `<button class="knopf" data-csv>${icon("export")} Excel</button>` : ""}<span class="anzahl" data-anz></span></div>
    <div data-kz></div><div data-inhalt></div>`;
  let daten = [];
  const RANG = { "gefährlich": 0, "wesentlich": 1, "unklar": 2, "geringfügig": 3 };
  const sichtbar = () => daten.slice().sort((x, y) => (RANG[x.einstufung] ?? 2) - (RANG[y.einstufung] ?? 2) || String(x.frist || "9999").localeCompare(String(y.frist || "9999"))).filter((m) => (z.status === "offen" ? svOffen(m) : z.status === "erledigt" ? !svOffen(m) : true)
    && (!z.q || [m.beschreibung, m.nummer, m.ort, refText("anlagen", m.anlage_id)].some((x) => String(x || "").toLowerCase().includes(z.q.toLowerCase()))));
  const zeichnen = () => {
    const liste = sichtbar();
    const offen = daten.filter(svOffen);
    const ueber = offen.filter((m) => m.frist && tageBis(m.frist) < 0).length;
    ziel.querySelector("[data-anz]").textContent = `${liste.length} Einträge`;
    ziel.querySelector("[data-kz]").innerHTML = `<div class="raster k4 sv-kz">
      <div class="karte kennzahl ${offen.length ? "orange" : ""}"><div class="wert">${offen.length}</div><div class="text">SV-Mängel offen</div></div>
      <div class="karte kennzahl ${offen.some((m) => m.einstufung === "gefährlich") ? "rot" : ""}"><div class="wert">${offen.filter((m) => m.einstufung === "gefährlich").length}</div><div class="text">gefährlich</div></div>
      <div class="karte kennzahl ${ueber ? "rot" : ""}"><div class="wert">${ueber}</div><div class="text">Frist überschritten</div></div>
      <div class="karte kennzahl"><div class="wert">${daten.length - offen.length}</div><div class="text">behoben oder nachgeprüft</div></div></div><div class="abstand"></div>`;
    ziel.querySelector("[data-inhalt]").innerHTML = liste.length ? `<div class="tabelle-wrap"><table><thead><tr><th>Nr.</th><th>Mangel</th>${filter.anlage_id ? "" : "<th>Anlage</th>"}${filter.objekt_id ? "" : "<th>Objekt</th>"}<th>Einstufung</th><th>Frist</th><th>Status</th><th>Bericht</th><th></th></tr></thead><tbody>
      ${liste.map((m) => `<tr class="klickbar" data-id="${m.id}"><td>${esc(m.nummer || "")}</td>
        <td class="sv-text"><b>${esc(m.beschreibung)}</b>${m.ort ? `<br><span class="klein">${esc(m.ort)}</span>` : ""}${m.massnahme ? `<br><span class="klein">Maßnahme: ${esc(m.massnahme)}</span>` : ""}</td>
        ${filter.anlage_id ? "" : `<td>${m.anlage_id ? `<a href="#/anlagen/${m.anlage_id}">${esc(refText("anlagen", m.anlage_id))}</a>` : ""}</td>`}
        ${filter.objekt_id ? "" : `<td>${esc(refText("objekte", m.objekt_id))}</td>`}
        <td>${svEinstMarke(m.einstufung)}</td>
        <td>${m.frist ? `${datum(m.frist)}${svOffen(m) ? `<br>${faelligMarke(m.frist)}` : ""}` : `<span class="klein">${esc(m.frist_text || "")}</span>`}</td>
        <td>${svStatusMarke(m.status)}${m.behoben_am ? `<br><span class="klein">${datum(m.behoben_am)}</span>` : ""}</td>
        <td>${m.bericht_id ? `<a href="/api/dokumente/${m.bericht_id}/datei" target="_blank" rel="noopener">${esc(refText("dokumente", m.bericht_id))}</a>${m.seite ? ` <span class="klein">S. ${zahl(m.seite)}</span>` : ""}` : ""}</td>
        <td class="sv-akt">${darfAendernRes("sv_maengel") && svOffen(m) ? `<button class="knopf klein" data-beh="${m.id}">Behoben</button>` : ""}${darf("tickets_anlegen") && svOffen(m) && !m.ticket_id ? `<button class="knopf klein" data-tik="${m.id}">Störmeldung</button>` : ""}${m.ticket_id ? `<a class="knopf klein" href="#/tickets/${m.ticket_id}">Störmeldung</a>` : ""}</td></tr>`).join("")}</tbody></table></div>`
      : `<div class="karte leer">${daten.length ? "Keine Einträge für diese Auswahl." : "Noch keine SV-Mängel. Lade auf einer sicherheitsrelevanten Anlage den SV-Bericht hoch, dann landen die Mängel hier."}</div>`;
  };
  const laden = async () => { [daten] = await Promise.all([api("GET", `sv_maengel?${new URLSearchParams(filter)}`), refsLaden("sv_maengel")]); zeichnen(); };
  let t;
  ziel.querySelector("[data-q]").oninput = (e) => { clearTimeout(t); t = setTimeout(() => { z.q = e.target.value; zeichnen(); }, 200); };
  ziel.querySelector("[data-st]").onchange = (e) => { z.status = e.target.value; zeichnen(); };
  const nb = ziel.querySelector("[data-neu]");
  if (nb) nb.onclick = async () => { if (await bearbeiten("sv_maengel", null, { ...filter, status: "offen" })) laden(); };
  ziel.querySelector("[data-druck]").onclick = () => svMaengelDrucken(sichtbar(), titelObjekt);
  const cs = ziel.querySelector("[data-csv]");
  if (cs) cs.onclick = () => {
    const kopf = ["Objekt", "Anlage", "Nr.", "Mangel", "Ort", "Einstufung", "Frist", "Frist laut Bericht", "Status", "Behoben am", "Maßnahme", "Bericht", "Seite", "Prüfdatum"];
    const rows = sichtbar().map((m) => [refText("objekte", m.objekt_id), m.anlage_id ? refText("anlagen", m.anlage_id) : "", m.nummer, m.beschreibung, m.ort, m.einstufung, datum(m.frist), m.frist_text, m.status, datum(m.behoben_am), m.massnahme, m.bericht_id ? refText("dokumente", m.bericht_id) : "", m.seite, datum(m.pruefdatum)]);
    const csv = "﻿" + [kopf, ...rows].map((r) => r.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const l = document.createElement("a");
    l.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    l.download = `${heute().replace(/-/g, "")}_SV-Maengelplan.csv`;
    l.click();
    setTimeout(() => URL.revokeObjectURL(l.href), 2000);
  };
  ziel.querySelector("[data-inhalt]").addEventListener("click", async (e) => {
    if (e.target.closest("a")) return;
    const beh = e.target.closest("[data-beh]"), tik = e.target.closest("[data-tik]"), tr = e.target.closest("tr[data-id]");
    if (beh) {
      const m = daten.find((x) => x.id === Number(beh.dataset.beh));
      if (await bearbeiten("sv_maengel", { ...m, status: "behoben", behoben_am: m.behoben_am || heute() })) laden();
      return;
    }
    if (tik) {
      const m = daten.find((x) => x.id === Number(tik.dataset.tik));
      const neu = await bearbeiten("tickets", null, { objekt_id: m.objekt_id, anlage_id: m.anlage_id, art: "Mangel", titel: `SV-Mangel${m.nummer ? " " + m.nummer : ""}: ${m.beschreibung}`.slice(0, 200),
        beschreibung: [m.beschreibung, m.ort && `Ort: ${m.ort}`, m.frist_text && `Frist laut Bericht: ${m.frist_text}`].filter(Boolean).join("\n"),
        faellig_am: m.frist || "", prioritaet: m.einstufung === "gefährlich" ? "Notfall" : m.einstufung === "wesentlich" ? "Hoch" : "Normal",
        gefaehrdung: m.einstufung === "gefährlich" ? "hoch" : m.einstufung === "wesentlich" ? "mittel" : "gering" });
      if (neu && neu.id) { await api("PUT", `sv_maengel/${m.id}`, { ticket_id: neu.id, status: "in Arbeit" }).catch(() => {}); laden(); }
      return;
    }
    if (tr && darfAendernRes("sv_maengel")) {
      const m = daten.find((x) => x.id === Number(tr.dataset.id));
      if (await bearbeiten("sv_maengel", m)) laden();
    }
  });
  await laden();
}

function svMaengelDrucken(liste, objektText) {
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>SV-Mängelplan</title><style>
    @font-face { font-family: Carlito; src: url("${location.origin}/schrift/Carlito-Regular.ttf"); }
    @font-face { font-family: Carlito; src: url("${location.origin}/schrift/Carlito-Bold.ttf"); font-weight: 700; }
    @page { size: A4 landscape; margin: 14mm 12mm; }
    body { font-family: Calibri, Carlito, sans-serif; color: #3C3C3B; font-size: 9.5pt; }
    .kopf { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: .6mm solid #E63713; padding-bottom: 3mm; margin-bottom: 5mm; }
    .kopf img { width: 48mm; } h1 { font-size: 19pt; margin: 4mm 0 1mm; }
    .k { font-size: 8.5pt; letter-spacing: .12em; color: #E63713; font-weight: 700; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #3C3C3B; color: #fff; text-align: left; padding: 1.8mm 2.5mm; font-size: 8.5pt; }
    td { padding: 1.8mm 2.5mm; border-bottom: .2mm solid #D9DADB; vertical-align: top; }
    tr.g td { background: #F5DDE2; } small { color: #626366; }
    .fuss { position: fixed; bottom: 0; left: 0; right: 0; font-size: 7.5pt; color: #939598; text-align: center; }
  </style></head><body>
    <div class="kopf"><div><div class="k">Mängel aus Sachverständigen-Prüfungen · Stand ${datum(heute())}</div><h1>SV-Mängelplan${objektText ? " " + esc(objektText) : ""}</h1></div><img src="${location.origin}/logo.png" alt=""></div>
    <table><thead><tr><th>Anlage</th><th>Nr.</th><th>Mangel</th><th>Einstufung</th><th>Frist</th><th>Status</th><th>Maßnahme</th><th>Bericht</th></tr></thead><tbody>
    ${liste.map((m) => `<tr class="${m.einstufung === "gefährlich" && svOffen(m) ? "g" : ""}"><td>${esc(m.anlage_id ? refText("anlagen", m.anlage_id) : "")}${objektText ? "" : `<br><small>${esc(refText("objekte", m.objekt_id))}</small>`}</td><td>${esc(m.nummer || "")}</td>
      <td><b>${esc(m.beschreibung)}</b>${m.ort ? `<br><small>${esc(m.ort)}</small>` : ""}</td><td>${esc(m.einstufung || "")}</td>
      <td>${m.frist ? datum(m.frist) : `<small>${esc(m.frist_text || "")}</small>`}</td><td>${esc(m.status || "offen")}${m.behoben_am ? `<br><small>${datum(m.behoben_am)}</small>` : ""}</td>
      <td>${esc(m.massnahme || "")}</td><td><small>${esc(m.bericht_id ? refText("dokumente", m.bericht_id) : "")}${m.pruefdatum ? `<br>Prüfung ${datum(m.pruefdatum)}` : ""}</small></td></tr>`).join("")}</tbody></table>
    <div class="fuss">Casa Concept Consulting GmbH &amp; Co. KG · www.ccc-frankfurt.com</div>
    <script>window.onload = () => setTimeout(() => print(), 300);<\/script></body></html>`;
  const f = window.open("", "_blank");
  if (!f) { melde("Das Druckfenster wurde blockiert. Bitte Pop-ups für diese Seite erlauben.", true); return; }
  f.document.open(); f.document.write(html); f.document.close();
}

/* ---------- Einstellungen: KI-Auswertung ---------- */
const einstellungenVorKi = SEITEN.einstellungen;
SEITEN.einstellungen = async (el, ...rest) => {
  await einstellungenVorKi(el, ...rest);
  if (!darf("einstellungen")) return;
  const box = document.createElement("div");
  box.innerHTML = '<div class="abstand"></div><div class="raster k2"><div class="karte" id="kiEinst"></div></div>';
  el.appendChild(box);
  await kiKarte(el.querySelector("#kiEinst"));
};

async function kiKarte(k) {
  const e = await api("GET", "einstellungen");
  k.innerHTML = `<h3>KI-Auswertung der SV-Berichte</h3>
    <p class="klein">Die KI liest hochgeladene Prüfberichte und schlägt die Mängel für den SV-Mängelplan vor. Dafür wird der Bericht an Anthropic (Claude) übertragen und dort ausgewertet. Jede Auswertung kostet je nach Länge des Berichts ein paar Cent. Den Schlüssel bekommst du unter console.anthropic.com.</p>
    <form class="formular" onsubmit="return false">
      <label class="check breit"><input type="checkbox" name="ki_aktiv" ${e.ki_aktiv === "1" ? "checked" : ""}> KI-Auswertung eingeschaltet</label>
      <label class="breit">API-Schlüssel<input name="ki_schluessel" type="password" autocomplete="new-password" placeholder="${e.ki_schluessel_gesetzt ? "gespeichert, leer lassen zum Behalten" : "sk-ant-…"}"></label>
      <div class="breit qr-knoepfe"><button class="knopf haupt-k" id="kiSpeichern">Speichern</button></div>
    </form>`;
  const fm = k.querySelector("form");
  k.querySelector("#kiSpeichern").onclick = async () => {
    try {
      await api("PUT", "einstellungen", { ki_aktiv: fm.ki_aktiv.checked ? 1 : 0, ...(fm.ki_schluessel.value ? { ki_schluessel: fm.ki_schluessel.value } : {}) });
      await einstellungenLaden(true);
      melde("Gespeichert."); kiKarte(k);
    } catch (err) { melde(err.message, true); }
  };
}
