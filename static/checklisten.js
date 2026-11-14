/* Casa CAFM – Checklisten je Anlage und Rundgänge je Objekt */
"use strict";

const PUNKT_TYPEN = { haken: "Abhaken (i. O. / Mangel)", zahl: "Wert eintragen (Zahl)", text: "Text eintragen" };
const punkteVon = (c) => { try { return JSON.parse(c.punkte || "[]"); } catch (e) { return []; } };

function faelligChecklisteMarke(c) {
  if (!c.aktiv) return '<span class="marke m-arbeit">inaktiv</span>';
  if (!c.naechste) return '<span class="marke m-geplant">bei Bedarf</span>';
  return faelligMarke(c.naechste);
}

/* ---------- Editor ---------- */
async function checklisteBearbeiten(c, vorgabe = {}) {
  await Promise.all([lade("objekte"), lade("anlagen")]);
  const neu = !c;
  c = c ? { ...c } : { art: "Anlage", rhythmus: "monatlich", aktiv: 1, ...vorgabe };
  let punkte = c.punkte ? punkteVon(c) : (vorgabe.punkte || []);
  if (!punkte.length) punkte = [{ text: "", typ: "haken", pflicht: true }];
  const rundgang = () => hg.querySelector('[name="art"]').value === "Rundgang";
  const anlagenObjekt = () => (S.cache.anlagen || []).filter((a) => String(a.objekt_id) === hg.querySelector('[name="objekt_id"]').value);
  const zeile = (p, i) => `<div class="pk-zeile" data-i="${i}">
    <div class="pk-griff"><button type="button" data-auf="${i}" title="Nach oben" aria-label="Nach oben">▲</button><button type="button" data-ab="${i}" title="Nach unten" aria-label="Nach unten">▼</button></div>
    <div class="pk-felder">
      <div class="pk-reihe"><input class="pk-text" data-f="text" value="${esc(p.text || "")}" placeholder="Prüfpunkt, z. B. Filter-Differenzdruck">
        <select data-f="typ">${Object.entries(PUNKT_TYPEN).map(([k, t]) => `<option value="${k}" ${p.typ === k ? "selected" : ""}>${t}</option>`).join("")}</select></div>
      <div class="pk-reihe pk-klein">
        <span class="pk-zahl" ${p.typ === "zahl" ? "" : "hidden"}><input data-f="einheit" value="${esc(p.einheit || "")}" placeholder="Einheit"><input data-f="min" type="number" step="any" value="${p.min ?? ""}" placeholder="Soll min"><input data-f="max" type="number" step="any" value="${p.max ?? ""}" placeholder="Soll max"></span>
        <span class="pk-rg" ${rundgangStart ? "" : "hidden"}><input data-f="bereich" value="${esc(p.bereich || "")}" placeholder="Station / Bereich, z. B. Technikzentrale UG" list="pk-bereiche">
          <select data-f="anlage_id"><option value="">Anlage (optional)</option>${(S.cache.anlagen || []).filter((a) => a.objekt_id === Number(c.objekt_id)).map((a) => `<option value="${a.id}" ${a.id === p.anlage_id ? "selected" : ""}>${esc(a.bezeichnung)}</option>`).join("")}</select></span>
        <label class="check"><input type="checkbox" data-f="pflicht" ${p.pflicht !== false ? "checked" : ""}> Pflicht</label>
      </div>
    </div>
    <button type="button" class="pk-weg" data-weg="${i}" title="Punkt entfernen" aria-label="Punkt entfernen">×</button></div>`;
  let rundgangStart = c.art === "Rundgang";
  const html = `<div class="dfehler"></div><form class="formular" onsubmit="return false">
    <label class="breit"><span class="pflicht">Titel</span><input name="titel" value="${esc(c.titel || "")}" placeholder="${c.art === "Rundgang" ? "z. B. Wöchentlicher Objektrundgang" : "z. B. Monatliche Sichtkontrolle"}"></label>
    <label><span>Art</span><select name="art"><option ${c.art === "Anlage" ? "selected" : ""}>Anlage</option><option ${c.art === "Rundgang" ? "selected" : ""}>Rundgang</option></select></label>
    <label><span>Rhythmus</span><select name="rhythmus">${S.schema.checklisten.felder.find((f) => f.name === "rhythmus").optionen.map((r) => `<option ${r === c.rhythmus ? "selected" : ""}>${r}</option>`).join("")}</select></label>
    <label><span class="pflicht">Objekt</span><select name="objekt_id"><option value="">–</option>${S.cache.objekte.map((o) => `<option value="${o.id}" ${o.id === Number(c.objekt_id) ? "selected" : ""}>${esc(anzeige("objekte", o))}</option>`).join("")}</select></label>
    <label class="nur-anlage"><span>Anlage</span><select name="anlage_id"><option value="">–</option></select></label>
    <label><span>Zuständig</span><input name="zustaendig" value="${esc(c.zustaendig || "")}" placeholder="z. B. Haustechnik"></label>
    <label class="check"><input type="checkbox" name="aktiv" ${c.aktiv ? "checked" : ""}> Aktiv</label>
    <div class="breit"><div class="pk-kopf"><b>Prüfpunkte</b><span class="klein" id="pk-anz"></span></div><div id="pk-liste" class="pk-liste"></div>
      <button type="button" class="knopf klein" id="pk-neu">${icon("plus")} Prüfpunkt</button>
      <datalist id="pk-bereiche"></datalist></div>
  </form>`;
  const p = dialog(neu ? (c.art === "Rundgang" ? "Rundgang anlegen" : "Checkliste anlegen") : `${c.art === "Rundgang" ? "Rundgang" : "Checkliste"} bearbeiten`, html, [
    ...(c.id && darf("loeschen") ? [{ text: "Löschen", klasse: "gefahr", aktion: async () => { if (!confirm("Checkliste löschen? Der Verlauf bleibt nicht erhalten.")) return false; await api("DELETE", `checklisten/${c.id}`); melde("Gelöscht."); return "geloescht"; } }] : []),
    { text: "Abbrechen" },
    { text: "Speichern", klasse: "haupt-k", aktion: async () => {
      lesen();
      const fm = hg.querySelector("form");
      const daten = { titel: fm.titel.value, art: fm.art.value, rhythmus: fm.rhythmus.value, objekt_id: fm.objekt_id.value || null,
        anlage_id: fm.art.value === "Anlage" ? (fm.anlage_id.value || null) : null, zustaendig: fm.zustaendig.value || null, aktiv: fm.aktiv.checked ? 1 : 0,
        punkte: punkte.filter((x) => (x.text || "").trim()) };
      if (!daten.punkte.length) throw new Error("Bitte mindestens einen Prüfpunkt eintragen.");
      if (daten.art === "Anlage" && !daten.anlage_id) throw new Error("Bitte die Anlage wählen.");
      const erg = c.id ? await api("PUT", `checklisten/${c.id}`, daten) : await api("POST", "checklisten", daten);
      melde("Gespeichert.");
      return erg;
    } },
  ]);
  const hg = letzterDialog();
  hg.querySelector(".dialog").classList.add("breit-dialog");
  const liste = hg.querySelector("#pk-liste");
  const lesen = () => {
    liste.querySelectorAll(".pk-zeile").forEach((z) => {
      const i = Number(z.dataset.i), wert = (f) => z.querySelector(`[data-f="${f}"]`);
      punkte[i] = { text: wert("text").value, typ: wert("typ").value, einheit: wert("einheit").value, min: wert("min").value, max: wert("max").value,
        bereich: wert("bereich").value, anlage_id: wert("anlage_id").value || null, pflicht: wert("pflicht").checked };
    });
  };
  const zeichnen = () => {
    rundgangStart = rundgang();
    liste.innerHTML = punkte.map(zeile).join("");
    hg.querySelector("#pk-anz").textContent = `${punkte.length} Punkte`;
    hg.querySelector("#pk-bereiche").innerHTML = [...new Set(punkte.map((x) => x.bereich).filter(Boolean))].map((b) => `<option value="${esc(b)}">`).join("");
    hg.querySelector(".nur-anlage").hidden = rundgang();
  };
  const anlagenFuellen = () => {
    const sel = hg.querySelector('[name="anlage_id"]');
    sel.innerHTML = `<option value="">–</option>${anlagenObjekt().map((a) => `<option value="${a.id}" ${a.id === Number(c.anlage_id) ? "selected" : ""}>${esc([a.nummer, a.bezeichnung].filter(Boolean).join(" · "))}</option>`).join("")}`;
  };
  anlagenFuellen(); zeichnen();
  hg.querySelector('[name="objekt_id"]').addEventListener("change", () => { lesen(); c.objekt_id = hg.querySelector('[name="objekt_id"]').value; anlagenFuellen(); zeichnen(); });
  hg.querySelector('[name="art"]').addEventListener("change", () => { lesen(); zeichnen(); });
  liste.addEventListener("change", (e) => { if (e.target.dataset.f === "typ") { lesen(); zeichnen(); } });
  liste.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    lesen();
    if (b.dataset.weg) punkte.splice(Number(b.dataset.weg), 1);
    if (b.dataset.auf && Number(b.dataset.auf) > 0) { const i = Number(b.dataset.auf); [punkte[i - 1], punkte[i]] = [punkte[i], punkte[i - 1]]; }
    if (b.dataset.ab && Number(b.dataset.ab) < punkte.length - 1) { const i = Number(b.dataset.ab); [punkte[i + 1], punkte[i]] = [punkte[i], punkte[i + 1]]; }
    if (!punkte.length) punkte.push({ text: "", typ: "haken", pflicht: true });
    zeichnen();
  });
  hg.querySelector("#pk-neu").onclick = () => {
    lesen();
    const letzte = punkte[punkte.length - 1] || {};
    punkte.push({ text: "", typ: "haken", pflicht: true, bereich: letzte.bereich || "" });
    zeichnen();
    const felder = liste.querySelectorAll(".pk-text"); felder[felder.length - 1].focus();
  };
  const erg = await p;
  if (erg) cacheLeeren();
  return erg;
}

/* ---------- Liste in Anlage und Objekt ---------- */
async function checklistenReiter(ziel, { objekt_id, anlage_id }) {
  const qs = anlage_id ? `anlage_id=${anlage_id}` : `objekt_id=${objekt_id}`;
  const liste = await api("GET", `checklisten?${qs}`);
  const planen = darf("wartung_planen"), erledigen = darf("wartung_erledigen");
  ziel.innerHTML = `<div class="werkzeug">${planen ? `<button class="knopf haupt-k" data-cneu="${anlage_id ? "Anlage" : "Rundgang"}">${icon("plus")} ${anlage_id ? "Checkliste" : "Rundgang"}</button>
      ${!anlage_id ? `<button class="knopf" data-cneu="Anlage">${icon("plus")} Checkliste für eine Anlage</button>` : `<button class="knopf" data-ckopie>Von anderer Anlage übernehmen</button>`}` : ""}
    <span class="anzahl">${liste.length} Listen</span></div>
    ${liste.length ? `<div class="cl-karten">${liste.map((c) => `<div class="karte cl-karte" data-c="${c.id}">
      <div class="cl-kopf"><span class="cl-art ${c.art === "Rundgang" ? "rg" : ""}">${c.art === "Rundgang" ? "Rundgang" : "Checkliste"}</span>${faelligChecklisteMarke(c)}</div>
      <a class="cl-titel" href="#/checklisten/${c.id}">${esc(c.titel)}</a>
      <div class="klein">${esc([c.anlage_id ? refText("anlagen", c.anlage_id) : "", c.rhythmus, `${c.anzahl_punkte} Punkte`].filter(Boolean).join(" · "))}</div>
      <div class="klein">Zuletzt: ${c.letzte ? `${datum(c.letzte)} ${c.letzte.slice(11, 16)}` : "noch nie"}${c.naechste ? ` · nächste ${datum(c.naechste)}` : ""}</div>
      <div class="cl-knoepfe">${erledigen ? `<a class="knopf haupt-k klein" href="#/checklisten/${c.id}?durchfuehren=1">Durchführen</a>` : ""}<a class="knopf klein" href="#/checklisten/${c.id}">Verlauf</a></div></div>`).join("")}</div>`
      : `<div class="karte leer">${anlage_id ? "Für diese Anlage gibt es noch keine Checkliste." : "Für dieses Objekt gibt es noch keinen Rundgang und keine Checkliste."}${planen ? " Leg oben die erste an." : ""}</div>`}`;
  ziel.onclick = async (e) => {
    const n = e.target.closest("[data-cneu]"), k = e.target.closest("[data-ckopie]");
    if (n) {
      const erg = await checklisteBearbeiten(null, { art: n.dataset.cneu, objekt_id, anlage_id: anlage_id || null, rhythmus: n.dataset.cneu === "Rundgang" ? "wöchentlich" : "monatlich" });
      if (erg && erg.id) location.hash = `#/checklisten/${erg.id}`;
    }
    if (k) {
      const alle = (await api("GET", "checklisten?art=Anlage")).filter((c) => c.anlage_id !== anlage_id);
      if (!alle.length) { melde("Es gibt noch keine Checkliste, die sich übernehmen lässt.", true); return; }
      await lade("anlagen");
      const wahl = await dialog("Checkliste übernehmen", `<div class="dfehler"></div><form class="formular" style="grid-template-columns:1fr" onsubmit="return false">
        <label>Vorlage<select name="v">${alle.map((c) => `<option value="${c.id}">${esc(c.titel)} · ${esc(refText("anlagen", c.anlage_id))}</option>`).join("")}</select></label>
        <p class="klein">Die Prüfpunkte werden kopiert. Danach lässt sich die Liste für diese Anlage anpassen.</p></form>`,
      [{ text: "Abbrechen" }, { text: "Weiter", klasse: "haupt-k", aktion: async (hg) => alle.find((c) => c.id === Number(hg.querySelector("[name=v]").value)) }]);
      if (wahl && wahl.id) {
        const erg = await checklisteBearbeiten(null, { art: "Anlage", objekt_id, anlage_id, rhythmus: wahl.rhythmus, titel: wahl.titel, punkte: punkteVon(wahl) });
        if (erg && erg.id) location.hash = `#/checklisten/${erg.id}`;
      }
    }
  };
}

/* ---------- Gesamtübersicht ---------- */
SEITEN.checklisten = async (el) => {
  await Promise.all([lade("objekte"), lade("anlagen")]);
  el.innerHTML = seitenkopf("Checklisten & Rundgänge", "Kontrollen vor Ort", darf("wartung_planen") ? `<button class="knopf haupt-k" id="cneuRg">${icon("plus")} Rundgang</button><button class="knopf" id="cneuCl">${icon("plus")} Checkliste</button>` : "") + `
    <div class="werkzeug"><select id="cobj"><option value="">Alle Objekte</option>${S.cache.objekte.map((o) => `<option value="${o.id}">${esc(anzeige("objekte", o))}</option>`).join("")}</select>
      <select id="cart"><option value="">Rundgänge und Checklisten</option><option>Rundgang</option><option>Anlage</option></select>
      <select id="cfae"><option value="">Alle</option><option value="faellig">Fällig oder überfällig</option></select></div>
    <div class="tabelle-wrap"><table><thead><tr><th>Liste</th><th>Art</th><th>Objekt</th><th>Anlage</th><th>Rhythmus</th><th>Zuletzt</th><th>Nächste</th><th></th></tr></thead><tbody id="cbody"></tbody></table></div>`;
  const alle = await api("GET", "checklisten");
  const zeichnen = () => {
    const o = el.querySelector("#cobj").value, a = el.querySelector("#cart").value, f = el.querySelector("#cfae").value;
    const liste = alle.filter((c) => (!o || String(c.objekt_id) === o) && (!a || c.art === a) && (!f || (c.naechste && tageBis(c.naechste) <= 0)));
    el.querySelector("#cbody").innerHTML = liste.map((c) => `<tr class="klickbar" data-c="${c.id}"><td><b>${esc(c.titel)}</b><br><span class="klein">${c.anzahl_punkte} Punkte${c.zustaendig ? " · " + esc(c.zustaendig) : ""}</span></td>
      <td><span class="cl-art ${c.art === "Rundgang" ? "rg" : ""}">${c.art === "Rundgang" ? "Rundgang" : "Checkliste"}</span></td><td>${esc(refText("objekte", c.objekt_id))}</td><td>${esc(c.anlage_id ? refText("anlagen", c.anlage_id) : "")}</td>
      <td>${esc(c.rhythmus || "")}</td><td>${c.letzte ? datum(c.letzte) : '<span class="klein">noch nie</span>'}</td><td>${c.naechste ? datum(c.naechste) + " " + faelligChecklisteMarke(c) : faelligChecklisteMarke(c)}</td>
      <td>${darf("wartung_erledigen") ? `<a class="knopf haupt-k klein" href="#/checklisten/${c.id}?durchfuehren=1" onclick="event.stopPropagation()">Durchführen</a>` : ""}</td></tr>`).join("") || '<tr><td colspan="8" class="leer">Keine Listen für diese Auswahl.</td></tr>';
  };
  zeichnen();
  ["#cobj", "#cart", "#cfae"].forEach((s) => el.querySelector(s).addEventListener("change", zeichnen));
  el.querySelector("#cbody").addEventListener("click", (e) => { const tr = e.target.closest("tr[data-c]"); if (tr) location.hash = `#/checklisten/${tr.dataset.c}`; });
  const ob = () => Number(el.querySelector("#cobj").value) || (S.cache.objekte[0] && S.cache.objekte[0].id);
  const rg = el.querySelector("#cneuRg"), cl = el.querySelector("#cneuCl");
  if (rg) rg.onclick = async () => { const e = await checklisteBearbeiten(null, { art: "Rundgang", objekt_id: ob(), rhythmus: "wöchentlich" }); if (e && e.id) location.hash = `#/checklisten/${e.id}`; };
  if (cl) cl.onclick = async () => { const e = await checklisteBearbeiten(null, { art: "Anlage", objekt_id: ob(), rhythmus: "monatlich" }); if (e && e.id) location.hash = `#/checklisten/${e.id}`; };
};

/* ---------- Detail: Verlauf und Durchführen ---------- */
DETAIL.checklisten = async (el, id, q) => {
  await Promise.all([lade("objekte"), lade("anlagen")]);
  const c = await api("GET", `checklisten/${id}`);
  if (q.get("durchfuehren") === "1" && darf("wartung_erledigen")) return durchfuehren(el, c);
  const [liste, gesamt] = await Promise.all([api("GET", `checklisten/${id}/durchgaenge`), api("GET", `checklisten?id=${id}`)]);
  const info = gesamt[0] || c;
  const punkte = punkteVon(c);
  const zurueck = c.anlage_id ? [`#/anlagen/${c.anlage_id}?reiter=3`, refText("anlagen", c.anlage_id)] : [`#/objekte/${c.objekt_id}?reiter=3`, refText("objekte", c.objekt_id)];
  el.innerHTML = seitenkopf(c.titel, `${c.art === "Rundgang" ? "Rundgang" : "Checkliste"} · ${refText("objekte", c.objekt_id)}${c.anlage_id ? " · " + refText("anlagen", c.anlage_id) : ""}`,
    `${darf("wartung_erledigen") ? `<a class="knopf haupt-k" href="#/checklisten/${c.id}?durchfuehren=1">Jetzt durchführen</a>` : ""}${darf("wartung_planen") ? '<button class="knopf" id="cbearb">Bearbeiten</button>' : ""}`, zurueck) + `
    <div class="raster k4">
      <div class="karte kennzahl ${info.naechste && tageBis(info.naechste) < 0 ? "rot" : info.naechste && tageBis(info.naechste) <= 1 ? "gelb" : ""}"><div class="wert">${info.naechste ? datum(info.naechste) : "–"}</div><div class="text">nächste Durchführung · ${esc(c.rhythmus || "")}</div></div>
      <div class="karte kennzahl"><div class="wert">${liste.length}</div><div class="text">Durchgänge</div></div>
      <div class="karte kennzahl"><div class="wert">${punkte.length}</div><div class="text">Prüfpunkte</div></div>
      <div class="karte kennzahl ${liste[0] && liste[0].abweichungen ? "orange" : ""}"><div class="wert">${liste[0] ? liste[0].abweichungen : "–"}</div><div class="text">Abweichungen beim letzten Mal</div></div>
    </div><div class="abstand"></div>
    <div class="raster k2"><div class="karte"><h3>Prüfpunkte</h3><ol class="cl-punkte">${punkte.map((p) => `<li>${p.bereich ? `<span class="klein">${esc(p.bereich)} · </span>` : ""}<b>${esc(p.text)}</b>
        <span class="klein">${p.typ === "zahl" ? `Wert${p.einheit ? " in " + esc(p.einheit) : ""}${p.min != null || p.max != null ? ` · Soll ${p.min ?? "…"} bis ${p.max ?? "…"}` : ""}` : p.typ === "text" ? "Text" : "Abhaken"}${p.pflicht ? "" : " · freiwillig"}${p.anlage_id ? " · " + esc(refText("anlagen", p.anlage_id)) : ""}</span></li>`).join("")}</ol></div>
      <div class="karte"><h3>Verlauf</h3>${liste.length ? `<ul class="liste-einfach">${liste.map((d) => `<li class="klickbar-li" data-d="${d.id}"><span><b>${datum(d.zeit)} ${d.zeit.slice(11, 16)}</b><br><span class="klein">${esc(d.wer || "")}${d.bemerkung ? " · " + esc(d.bemerkung.slice(0, 60)) : ""}</span></span>
        <span class="rechts">${d.abweichungen ? `<span class="marke m-ueber">${d.abweichungen} Abweichung${d.abweichungen > 1 ? "en" : ""}</span>` : '<span class="marke m-ok">alles i. O.</span>'}</span></li>`).join("")}</ul>` : '<p class="klein">Noch nicht durchgeführt.</p>'}</div></div>`;
  const b = el.querySelector("#cbearb");
  if (b) b.onclick = async () => { const e = await checklisteBearbeiten(c); if (e === "geloescht") location.hash = zurueck[0]; else if (e) route(); };
  el.querySelectorAll("[data-d]").forEach((li) => li.onclick = () => durchgangAnsehen(Number(li.dataset.d)));
};

async function durchgangAnsehen(did) {
  const d = await api("GET", `durchgaenge/${did}`);
  let bereich = null;
  const html = `<p><b>${datum(d.zeit)} ${d.zeit.slice(11, 16)}</b> · ${esc(d.wer || "")} · ${d.abweichungen ? `<span class="marke m-ueber">${d.abweichungen} Abweichungen</span>` : '<span class="marke m-ok">alles i. O.</span>'}</p>
    <table class="cl-ergebnis"><tbody>${d.ergebnisse.map((e) => {
      const kopf = e.bereich && e.bereich !== bereich ? `<tr class="gruppe"><td colspan="2">${esc(e.bereich)}</td></tr>` : "";
      bereich = e.bereich || bereich;
      const wert = e.status === "na" ? '<span class="klein">entfällt</span>' : e.typ === "haken" ? (e.status === "ok" ? '<span class="marke m-ok">i. O.</span>' : e.status === "mangel" ? '<span class="marke m-ueber">Mangel</span>' : "–")
        : e.typ === "zahl" ? (e.wert == null ? "–" : `<b class="${e.abweichung ? "rot-text" : ""}">${zahl(e.wert)} ${esc(e.einheit || "")}</b>${e.min != null || e.max != null ? ` <span class="klein">Soll ${e.min ?? "…"} bis ${e.max ?? "…"}</span>` : ""}`)
          : esc(e.wert || "–");
      return kopf + `<tr class="${e.abweichung ? "abw" : ""}"><td>${esc(e.text)}${e.notiz ? `<br><span class="klein">${esc(e.notiz)}</span>` : ""}</td><td class="nowrap">${wert}</td></tr>`;
    }).join("")}</tbody></table>
    ${d.bemerkung ? `<p><b>Bemerkung:</b> ${esc(d.bemerkung)}</p>` : ""}
    ${d.tickets.length ? `<p><b>Angelegte Mängel:</b> ${d.tickets.map((t) => `<a href="#/tickets/${t.id}">${esc(t.nummer)}</a>`).join(", ")}</p>` : ""}`;
  await dialog(d.titel, html, [{ text: "Drucken", aktion: () => { window.print(); return false; } }, { text: "Schließen", klasse: "haupt-k" }]);
}

function durchfuehren(el, c) {
  const punkte = punkteVon(c);
  const stand = punkte.map(() => ({ status: null, wert: "", notiz: "" }));
  let bereich = null;
  el.innerHTML = `<a class="zurueck" href="#/checklisten/${c.id}">← Abbrechen</a>
    <div class="titelzeile"><div><div class="kicker">${c.art === "Rundgang" ? "Rundgang" : "Checkliste"} · ${esc(refText("objekte", c.objekt_id))}${c.anlage_id ? " · " + esc(refText("anlagen", c.anlage_id)) : ""}</div><h1>${esc(c.titel)}</h1></div></div>
    <div class="df-liste">${punkte.map((p, i) => {
      const kopf = p.bereich && p.bereich !== bereich ? `<div class="df-station">${icon("plaene")} ${esc(p.bereich)}</div>` : "";
      bereich = p.bereich || bereich;
      const eingabe = p.typ === "haken" ? `<div class="df-wahl" role="group"><button type="button" data-s="ok">✓ i. O.</button><button type="button" data-s="mangel">✗ Mangel</button><button type="button" data-s="na">– entfällt</button></div>`
        : p.typ === "zahl" ? `<div class="df-wert"><input type="text" inputmode="decimal" autocomplete="off" data-w placeholder="Wert"><span>${esc(p.einheit || "")}</span>${p.min != null || p.max != null ? `<span class="klein">Soll ${p.min ?? "…"} bis ${p.max ?? "…"}</span>` : ""}<button type="button" class="df-na" data-s="na">entfällt</button></div>`
          : `<div class="df-wert"><input type="text" data-w placeholder="Eintragen"><button type="button" class="df-na" data-s="na">entfällt</button></div>`;
      return kopf + `<div class="karte df-punkt" data-i="${i}"><div class="df-text"><span class="df-nr">${i + 1}</span><div><b>${esc(p.text)}</b>${p.pflicht ? "" : ' <span class="klein">freiwillig</span>'}${p.anlage_id ? `<br><span class="klein">${esc(refText("anlagen", p.anlage_id))}</span>` : ""}</div></div>${eingabe}
        <input class="df-notiz" data-n placeholder="Notiz (optional)" hidden></div>`;
    }).join("")}</div>
    <div class="karte df-abschluss"><label for="dfbem">Bemerkung zum Durchgang</label><textarea id="dfbem" placeholder="z. B. Firma informiert, Zugang Dach verschlossen"></textarea>
      <label class="check"><input type="checkbox" id="dfm" checked> Für jede Abweichung gleich einen Mangel anlegen</label></div>
    <div class="df-leiste"><div class="df-fortschritt"><div id="dfbalken"></div></div><span id="dfstand"></span><button class="knopf haupt-k" id="dfok">Abschließen</button></div>`;
  const pruefen = () => {
    let fertig = 0, abw = 0;
    punkte.forEach((p, i) => {
      const s = stand[i], karte = el.querySelector(`.df-punkt[data-i="${i}"]`);
      let abweichung = s.status === "mangel";
      if (p.typ === "zahl" && s.wert !== "" && s.status !== "na") {
        const w = Number(String(s.wert).replace(",", "."));
        if ((p.min != null && w < p.min) || (p.max != null && w > p.max)) abweichung = true;
      }
      const erledigt = s.status !== null || (p.typ !== "haken" && String(s.wert).trim() !== "");
      if (erledigt) fertig++;
      if (abweichung) abw++;
      karte.classList.toggle("erledigt", erledigt && !abweichung);
      karte.classList.toggle("abweichung", abweichung);
      karte.querySelector("[data-n]").hidden = !abweichung && !s.notiz;
    });
    el.querySelector("#dfbalken").style.width = `${punkte.length ? (fertig / punkte.length) * 100 : 0}%`;
    el.querySelector("#dfstand").innerHTML = `${fertig} von ${punkte.length}${abw ? ` · <b class="rot-text">${abw} Abweichung${abw > 1 ? "en" : ""}</b>` : ""}`;
  };
  el.querySelector(".df-liste").addEventListener("click", (e) => {
    const b = e.target.closest("[data-s]");
    if (!b) return;
    const i = Number(b.closest(".df-punkt").dataset.i);
    stand[i].status = stand[i].status === b.dataset.s ? null : b.dataset.s;
    b.closest(".df-punkt").querySelectorAll("[data-s]").forEach((x) => x.classList.toggle("an", x.dataset.s === stand[i].status));
    pruefen();
  });
  el.querySelector(".df-liste").addEventListener("input", (e) => {
    const karte = e.target.closest(".df-punkt"), i = Number(karte.dataset.i);
    if (e.target.matches("[data-w]")) { stand[i].wert = e.target.value; if (stand[i].status === "na") { stand[i].status = null; karte.querySelectorAll("[data-s]").forEach((x) => x.classList.remove("an")); } }
    if (e.target.matches("[data-n]")) stand[i].notiz = e.target.value;
    pruefen();
  });
  pruefen();
  el.querySelector("#dfok").onclick = async () => {
    const k = el.querySelector("#dfok");
    k.disabled = true;
    try {
      const r = await api("POST", `checklisten/${c.id}/durchgang`, {
        ergebnisse: stand.map((s, idx) => ({ idx, status: s.status, wert: s.wert, notiz: s.notiz })),
        bemerkung: el.querySelector("#dfbem").value, maengel_anlegen: el.querySelector("#dfm").checked });
      melde(r.abweichungen ? `Abgeschlossen: ${r.abweichungen} Abweichungen${r.tickets ? `, ${r.tickets} Mängel angelegt` : ""}.` : "Abgeschlossen: alles in Ordnung.");
      cacheLeeren();
      location.hash = `#/checklisten/${c.id}`;
    } catch (err) { melde(err.message, true); k.disabled = false; }
  };
}
