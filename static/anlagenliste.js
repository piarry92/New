/* Casa CAFM – Anlagenliste als kompakte Tabelle mit Ampel. Überschriften (Gewerk, Kategorie, Bereich, eigene) sind wählbar. */
"use strict";

const AL_UE = [["", "Keine Überschriften"], ["gewerk", "Nach Gewerk"], ["kategorie", "Nach Kategorie"], ["gruppe", "Nach Bereich"], ["standort", "Nach Standort"], ["eigene", "Eigene Überschriften"]];
const AL_FARBEN = ["#2F6FD0", "#C2203B", "#12A3B8", "#7A5AF0", "#E0A500", "#2E9A4F", "#D9822B", "#6B6E76"];
const AL_ST = { rot: ["überfällig", "var(--ueber)"], gelb: ["bald fällig", "var(--bald)"], ok: ["in Ordnung", "var(--ok)"], grau: ["kein Termin", "var(--grau)"] };
const alMerken = (k, v) => { try { if (v === undefined) return localStorage.getItem("cafm-al-" + k) || ""; localStorage.setItem("cafm-al-" + k, v); } catch (e) { /* ohne Speicher */ } return v || ""; };

async function anlagenListe(ziel, opt = {}) {
  await Promise.all([lade("objekte"), katLaden()]);
  const qs = opt.objekt_id ? `?objekt_id=${opt.objekt_id}` : "";
  const [anlagen, wartungen, tickets] = await Promise.all([api("GET", "anlagen" + qs), api("GET", "wartungen" + qs), api("GET", `tickets${qs ? qs + "&" : "?"}offen=1`)]);
  const mehrereObjekte = !opt.objekt_id && !S.objekt && (S.cache.objekte || []).length > 1;
  const zeilen = anlagen.map((a) => {
    const w = wartungen.filter((x) => x.anlage_id === a.id && x.aktiv && x.naechste);
    const naechste = (arr) => arr.map((x) => x.naechste).sort()[0] || null;
    const wart = naechste(w.filter((x) => x.art !== "SV-Prüfung")), sv = naechste(w.filter((x) => x.art === "SV-Prüfung"));
    const frueh = [wart, sv].filter(Boolean).sort()[0];
    const tage = frueh ? tageBis(frueh) : null;
    const kat = S.kat && S.kat.kMap[a.kategorie_id];
    return { a, wart, sv, stoer: tickets.filter((t) => t.anlage_id === a.id).length, st: tage == null ? "grau" : tage < 0 ? "rot" : tage <= 30 ? "gelb" : "ok",
      hersteller: [a.hersteller || (S.kat && a.gruppe_id && S.kat.gMap[a.gruppe_id] ? S.kat.gMap[a.gruppe_id].name : ""), a.typ || (S.kat && a.typ_id && S.kat.tMap[a.typ_id] ? S.kat.tMap[a.typ_id].name : "")].filter(Boolean).join(" "),
      kategorie: kat ? kat.name : "", katFarbe: kat ? kat.farbe : "", objekt: mehrereObjekte ? (((S.cache.objekte || []).find((o) => o.id === a.objekt_id) || {}).kuerzel || "") : "" };
  });
  let ue = alMerken("ue"), gewerk = "", nurRot = false, nurSv = false, suche = "", sort = "nummer", auf = true;
  const gewerke = [...new Set(zeilen.map((z) => z.a.gewerk).filter(Boolean))].sort();
  const kannAendern = darf("anlagen_bearbeiten");
  const spalten = [["nummer", "Inv.-Nr."], ["bezeichnung", "Bezeichnung"], ["hersteller", "Hersteller / Typ"], ["standort", "Standort"], ...(mehrereObjekte ? [["objekt", "Objekt"]] : []), ["wart", "Nächste Wartung"], ["sv", "SV-Prüfung"], ["stoer", "Störungen"], ["st", "Zustand"]];
  const wert = (z, f) => f in z ? z[f] : z.a[f];

  ziel.innerHTML = `<div class="al-filter">
      <button class="al-chip an" data-g="">Alle <b>${zeilen.length}</b></button>${gewerke.map((g) => `<button class="al-chip" data-g="${esc(g)}">${esc(g)} <b>${zeilen.filter((z) => z.a.gewerk === g).length}</b></button>`).join("")}
      <span class="al-rechts"><input type="search" id="alSuche" placeholder="Suchen: Nummer, Name, Standort …">
        <button class="al-chip" id="alRot"><i class="al-pkt" style="--c:var(--ueber)"></i>nur überfällig</button><button class="al-chip" id="alSv">${icon("svpruefplan")}SV-pflichtig</button></span></div>
    <div class="al-werkzeug"><label class="al-ue">Überschriften <select id="alUe">${AL_UE.map(([v, t]) => `<option value="${v}" ${v === ue ? "selected" : ""}>${t}</option>`).join("")}</select></label>
      <button class="knopf klein" id="alUeNeu" hidden>${icon("plus")} Überschrift hinzufügen</button>
      <span class="al-rechts">${darf("export") ? `<a class="knopf klein" href="/api/export/anlagen">${icon("export")} Excel</a>` : ""}<button class="knopf klein" id="alQr">QR-Etiketten</button>
        ${kannAendern ? `<button class="knopf haupt-k" id="alNeu">${icon("plus")} Anlage</button>` : ""}</span></div>
    <div class="karte al-karte"><div class="al-wrap"><table class="al-tab"><thead><tr><th></th><th></th>${spalten.map(([f, t]) => `<th data-sort="${f}">${t}<span class="al-pfeil"></span></th>`).join("")}</tr></thead><tbody id="alBody"></tbody></table></div>
      <div class="al-fuss" id="alFuss"></div></div>`;

  const sichtbar = () => zeilen.filter((z) => (!gewerk || z.a.gewerk === gewerk) && (!nurRot || z.st === "rot") && (!nurSv || z.a.sv_relevant)
    && (!suche || [z.a.nummer, z.a.bezeichnung, z.a.standort, z.hersteller, z.kategorie, z.a.gewerk].some((x) => String(x || "").toLowerCase().includes(suche))))
    .sort((x, y) => { const a = wert(x, sort) ?? "", b = wert(y, sort) ?? ""; const leerA = a === "" || a == null, leerB = b === "" || b == null;
      if (leerA !== leerB) return leerA ? 1 : -1; return (a < b ? -1 : a > b ? 1 : 0) * (auf ? 1 : -1); });
  const gruppeVon = (z) => ue === "gewerk" ? z.a.gewerk : ue === "kategorie" ? z.kategorie : ue === "gruppe" ? z.a.gruppe : ue === "standort" ? (z.a.standort || "").split(/[·,/]/)[0].trim() : ue === "eigene" ? z.a.liste_ueberschrift : "";
  const zeileHtml = (z) => `<tr data-id="${z.a.id}"><td><i class="al-pkt gross" style="--c:${AL_ST[z.st][1]}" title="${AL_ST[z.st][0]}"></i></td><td><div class="al-sym">${symbolVon(z.a, 22)}</div></td>
    <td>${esc(z.a.nummer || "")}</td><td class="b"><b>${esc(z.a.bezeichnung || "")}</b>${z.a.sv_relevant ? ' <span class="al-sv" title="Prüfung durch Sachverständige">SV</span>' : ""}</td><td class="u">${esc(z.hersteller)}</td><td class="u">${esc(z.a.standort || "")}</td>${mehrereObjekte ? `<td>${esc(z.objekt)}</td>` : ""}
    <td class="${z.wart && tageBis(z.wart) < 0 ? "rt" : z.wart && tageBis(z.wart) <= 30 ? "gb" : ""}">${z.wart ? datum(z.wart) : "–"}</td><td class="${z.sv && tageBis(z.sv) < 0 ? "rt" : z.sv && tageBis(z.sv) <= 30 ? "gb" : ""}">${z.sv ? datum(z.sv) : "–"}</td>
    <td>${z.stoer ? `<span class="marke m-ueber">${z.stoer} offen</span>` : "–"}</td><td><span class="marke al-m" style="--c:${AL_ST[z.st][1]}">${AL_ST[z.st][0]}</span></td></tr>`;

  const zeichnen = () => {
    const rows = sichtbar();
    let html = "";
    if (!ue) html = rows.map(zeileHtml).join("");
    else {
      const namen = [...new Set(rows.map((z) => gruppeVon(z) || ""))].sort((a, b) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b, "de")));
      html = namen.map((n, i) => { const l = rows.filter((z) => (gruppeVon(z) || "") === n); const rot = l.filter((z) => z.st === "rot").length;
        const farbe = ue === "kategorie" && l[0].katFarbe ? l[0].katFarbe : AL_FARBEN[i % AL_FARBEN.length];
        return `<tr class="al-g" style="--c:${n ? farbe : "var(--grau)"}"><td colspan="${spalten.length + 2}">${esc(n || (ue === "eigene" ? "Ohne Überschrift" : "Ohne Angabe"))}<span>${l.length} ${l.length === 1 ? "Anlage" : "Anlagen"}${rot ? ` · ${rot} überfällig` : ""}</span>
          ${ue === "eigene" && n && kannAendern ? `<button class="knopf klein al-ue-b" data-ue="${esc(n)}">Bearbeiten</button>` : ""}</td></tr>` + l.map(zeileHtml).join(""); }).join("");
    }
    ziel.querySelector("#alBody").innerHTML = html || `<tr><td colspan="${spalten.length + 2}" class="klein" style="padding:28px;text-align:center">${zeilen.length ? "Keine Anlagen für diesen Filter." : "Noch keine Anlagen."}</td></tr>`;
    ziel.querySelector("#alFuss").innerHTML = `<span><b>${rows.length}</b> von ${zeilen.length} Anlagen</span><span><b>${rows.filter((z) => z.st === "rot").length}</b> überfällig</span><span><b>${rows.filter((z) => z.st === "gelb").length}</b> bald fällig</span>`;
    ziel.querySelectorAll("th[data-sort]").forEach((th) => { th.querySelector(".al-pfeil").textContent = th.dataset.sort === sort ? (auf ? " ▲" : " ▼") : ""; });
    ziel.querySelector("#alUeNeu").hidden = !(ue === "eigene" && kannAendern);
  };
  zeichnen();

  /* Eigene Überschrift anlegen oder ändern: Name und zugehörige Anlagen */
  const ueDialog = async (alt = "") => {
    const r = await dialog(alt ? "Überschrift bearbeiten" : "Überschrift hinzufügen", `<div class="dfehler"></div><form class="formular" style="grid-template-columns:1fr" onsubmit="return false">
      <label><span class="pflicht">Überschrift</span><input name="name" value="${esc(alt)}" placeholder="z. B. Aufzüge, Brandschutz, Dach"></label>
      <div><div class="sl-titel">Anlagen unter dieser Überschrift</div><div class="al-wahl">${zeilen.map((z) => `<label class="wn-haken"><input type="checkbox" value="${z.a.id}" ${alt && z.a.liste_ueberschrift === alt ? "checked" : ""}> ${esc(z.a.bezeichnung || "")} <span class="klein">${esc(z.a.nummer || "")}${z.a.liste_ueberschrift && z.a.liste_ueberschrift !== alt ? " · bisher: " + esc(z.a.liste_ueberschrift) : ""}</span></label>`).join("")}</div></div></form>`,
      [{ text: "Abbrechen" }, ...(alt ? [{ text: "Überschrift entfernen", aktion: () => "weg" }] : []), { text: "Speichern", klasse: "haupt-k", aktion: async (hg) => {
        const name = hg.querySelector("[name=name]").value.trim();
        if (!name) throw new Error("Bitte einen Namen für die Überschrift eingeben.");
        return { name, ids: [...hg.querySelectorAll(".al-wahl input:checked")].map((c) => Number(c.value)) };
      } }]);
    if (!r) return;
    const aenderungen = [];
    for (const z of zeilen) {
      const soll = r === "weg" ? (z.a.liste_ueberschrift === alt ? null : undefined) : r.ids.includes(z.a.id) ? r.name : (alt && z.a.liste_ueberschrift === alt ? null : undefined);
      if (soll !== undefined && soll !== (z.a.liste_ueberschrift || null)) aenderungen.push([z, soll]);
    }
    try { for (const [z, soll] of aenderungen) { await api("PUT", `anlagen/${z.a.id}`, { liste_ueberschrift: soll }); z.a.liste_ueberschrift = soll; } melde("Überschriften gespeichert."); }
    catch (err) { melde(err.message, true); }
    cacheLeeren(); zeichnen();
  };

  ziel.querySelectorAll("[data-g]").forEach((b) => b.onclick = () => { gewerk = b.dataset.g; ziel.querySelectorAll("[data-g]").forEach((x) => x.classList.toggle("an", x === b)); zeichnen(); });
  ziel.querySelector("#alRot").onclick = (e) => { nurRot = !nurRot; e.currentTarget.classList.toggle("an", nurRot); zeichnen(); };
  ziel.querySelector("#alSv").onclick = (e) => { nurSv = !nurSv; e.currentTarget.classList.toggle("an", nurSv); zeichnen(); };
  ziel.querySelector("#alSuche").oninput = (e) => { suche = e.target.value.trim().toLowerCase(); zeichnen(); };
  ziel.querySelector("#alUe").onchange = (e) => { ue = e.target.value; alMerken("ue", ue); zeichnen(); };
  ziel.querySelector("#alUeNeu").onclick = () => ueDialog("");
  ziel.querySelectorAll("th[data-sort]").forEach((th) => th.onclick = () => { if (sort === th.dataset.sort) auf = !auf; else { sort = th.dataset.sort; auf = true; } zeichnen(); });
  ziel.querySelector("#alBody").addEventListener("click", (e) => {
    const b = e.target.closest("[data-ue]"); if (b) { ueDialog(b.dataset.ue); return; }
    const tr = e.target.closest("tr[data-id]"); if (tr) location.hash = `#/anlagen/${tr.dataset.id}`;
  });
  ziel.querySelector("#alQr").onclick = () => etikettenDrucken(sichtbar().map((z) => z.a), "QR-Etiketten");
  const neu = ziel.querySelector("#alNeu");
  if (neu) neu.onclick = async () => { const a = await bearbeiten("anlagen", null, opt.objekt_id || S.objekt ? { objekt_id: Number(opt.objekt_id || S.objekt) } : {}); if (a && a.id) location.hash = `#/anlagen/${a.id}`; };
}

SEITEN.anlagen = async (el) => {
  el.innerHTML = seitenkopf("Anlagen", "Technische Ausstattung") + '<div id="alHier"></div>';
  await anlagenListe(el.querySelector("#alHier"));
};
