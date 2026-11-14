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
    <label class="check"><input type="checkbox" name="unterschrift_pflicht" ${c.unterschrift_pflicht !== 0 ? "checked" : ""}> Unterschrift beim Abschließen erforderlich</label>
    <label class="check nur-rundgang"><input type="checkbox" name="checkpoints_pflicht" ${c.checkpoints_pflicht ? "checked" : ""}> Checkpoints (QR-Codes der Stationen) müssen gescannt werden</label>
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
        unterschrift_pflicht: fm.unterschrift_pflicht.checked ? 1 : 0, checkpoints_pflicht: fm.art.value === "Rundgang" && fm.checkpoints_pflicht.checked ? 1 : 0,
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
    hg.querySelector(".nur-rundgang").hidden = !rundgang();
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
  if (c.art === "Rundgang") {
    const box = document.createElement("div");
    box.className = "karte cp-karte";
    el.querySelector(".raster.k2").after(Object.assign(document.createElement("div"), { className: "abstand" }), box);
    checkpointKarte(box, c);
  }
};

/* ---------- Checkpoints (QR-Codes der Stationen) ---------- */
const checkpointAdresse = (token) => `${(EINST && EINST.basis_url) || location.origin}/m/c/${encodeURIComponent(token)}`;
async function checkpointKarte(box, c) {
  await einstellungenLaden();
  const liste = await api("GET", `checklisten/${c.id}/checkpoints`);
  box.innerHTML = `<div class="cp-kopf"><h3>Checkpoints · QR-Codes der Stationen</h3>${liste.length ? `<button class="knopf haupt-k klein" id="cpdruck">QR-Etiketten drucken</button>` : ""}</div>
    <p class="klein">Jede Station des Rundgangs bekommt einen eigenen QR-Code. Häng ihn an die Stelle, zum Beispiel an die Tür der Technikzentrale. Beim Rundgang scannt der Haustechniker den Code mit dem Handy, das Programm hält Zeit und Person fest.
    ${c.checkpoints_pflicht ? "<b>Bei diesem Rundgang ist das Scannen Pflicht:</b> Die Punkte einer Station lassen sich erst nach dem Scan abhaken." : "Scannen ist bei diesem Rundgang freiwillig. Pflicht lässt es sich unter „Bearbeiten“ machen."}</p>
    ${adresseLokal() ? '<div class="warnung klein">Die Adresse ist „localhost“. Handys erreichen das nicht. Ein Administrator trägt unter Einstellungen die richtige Adresse ein.</div>' : ""}
    ${liste.length ? `<div class="cp-raster">${liste.map((cp) => `<div class="cp-eintrag"><a href="${esc(checkpointAdresse(cp.token))}" target="_blank" rel="noopener">${qrSvg(checkpointAdresse(cp.token), 96)}</a><div><b>${esc(cp.bereich)}</b><br><span class="klein">Checkpoint</span></div></div>`).join("")}</div>`
      : '<p class="klein">Noch keine Stationen. Trag bei den Prüfpunkten unter „Station / Bereich“ Namen ein, dann entstehen die Checkpoints von selbst.</p>'}`;
  const d = box.querySelector("#cpdruck");
  if (d) d.onclick = () => checkpointEtiketten(c, liste);
}

function checkpointEtiketten(c, liste) {
  const objekt = refText("objekte", c.objekt_id);
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Checkpoints ${esc(c.titel)}</title><style>
    @font-face { font-family: Carlito; src: url("${location.origin}/schrift/Carlito-Regular.ttf"); }
    @font-face { font-family: Carlito; src: url("${location.origin}/schrift/Carlito-Bold.ttf"); font-weight: 700; }
    @page { size: A4; margin: 10mm; }
    body { font-family: Calibri, Carlito, sans-serif; color: #3C3C3B; margin: 0; }
    .bogen { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
    .et { border: .4mm solid #D9DADB; border-radius: 3mm; height: 88mm; padding: 6mm; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; text-align: center; break-inside: avoid; position: relative; }
    .et::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 2.5mm; background: #E63713; border-radius: 3mm 3mm 0 0; }
    .et img { width: 32mm; margin: 2mm 0 2mm; }
    .k { font-size: 9pt; letter-spacing: .14em; color: #E63713; font-weight: 700; }
    .st { font-size: 16pt; font-weight: 700; margin: 1mm 0; line-height: 1.1; }
    .et svg { width: 40mm; height: 40mm; margin: 1mm 0; }
    .u { font-size: 8.5pt; color: #626366; }
  </style></head><body><div class="bogen">${liste.map((cp) => `<div class="et"><img src="${location.origin}/logo.png" alt=""><div class="k">CHECKPOINT</div><div class="st">${esc(cp.bereich)}</div>
    ${qrSvg(checkpointAdresse(cp.token), 160)}<div class="u">${esc(c.titel)} · ${esc(objekt)}<br>Beim Rundgang mit dem Handy scannen</div></div>`).join("")}</div>
    <script>window.onload = () => setTimeout(() => print(), 300);<\/script></body></html>`;
  const f = window.open("", "_blank");
  if (!f) { melde("Das Druckfenster wurde blockiert. Bitte Pop-ups für diese Seite erlauben.", true); return; }
  f.document.open(); f.document.write(html); f.document.close();
}

/* Seite, die sich beim Scannen eines Checkpoints öffnet */
async function qrCheckpointSeite(token) {
  document.title = "Checkpoint · Casa CAFM";
  const logo = '<header><img class="logo-hell" src="/logo.png" alt="Casa Concept Consulting"><img class="logo-dunkel" src="/logo-negativ.png" alt="Casa Concept Consulting"></header>';
  let info;
  try { info = await api("GET", "qr/c/" + encodeURIComponent(token)); }
  catch (e) { $app.innerHTML = `<div class="qr-seite">${logo}<div class="karte"><h2>Checkpoint nicht gefunden</h2><p>${esc(e.message)}</p></div></div>`; return; }
  if (!info.angemeldet) {
    $app.innerHTML = `<div class="qr-seite">${logo}<div class="karte"><div class="kicker">CHECKPOINT</div><h1>${esc(info.bereich)}</h1><p class="klein">${esc(info.rundgang)} · ${esc(info.objekt || "")}</p>
      <p>Bitte einmal anmelden, damit der Checkpoint erfasst wird. Auf diesem Handy bleibst du danach angemeldet.</p><a class="knopf haupt-k gross-k" href="/?c=${encodeURIComponent(token)}">Anmelden und erfassen</a></div></div>`;
    return;
  }
  try {
    const r = await checkpointErfassen(token);
    $app.innerHTML = `<div class="qr-seite">${logo}<div class="karte qr-danke"><div class="haken">✓</div><div class="kicker">CHECKPOINT ERFASST</div><h1>${esc(r.bereich)}</h1>
      <p>${esc(r.rundgang)} · ${esc(r.objekt || "")}</p><p class="klein">${datum(r.zeit)} um ${r.zeit.slice(11, 16)} Uhr</p>
      <a class="knopf haupt-k gross-k" href="/#/checklisten/${r.checkliste_id}?durchfuehren=1">Weiter zum Rundgang</a></div></div>`;
  } catch (e) { $app.innerHTML = `<div class="qr-seite">${logo}<div class="karte"><h2>Nicht erfasst</h2><p>${esc(e.message)}</p></div></div>`; }
}
async function checkpointErfassen(token) {
  let ort = {};
  try { ort = await Promise.race([standortHolen(), new Promise((_, nein) => setTimeout(() => nein(new Error("zeit")), 2500))]); } catch (e) { ort = {}; }
  return api("POST", `qr/c/${encodeURIComponent(token)}/scan`, ort);
}

/* Scanner im Programm (Android/Chrome); sonst die Handy-Kamera nutzen */
async function checkpointScanner() {
  if (!("BarcodeDetector" in window) || !navigator.mediaDevices) {
    await dialog("Checkpoint scannen", '<p>Öffne die <b>Kamera-App</b> deines Handys und halte sie auf den QR-Code der Station. Tippe dann auf den Link, der erscheint. Danach geht es hier weiter.</p>', [{ text: "Verstanden", klasse: "haupt-k" }]);
    return null;
  }
  let strom = null, aktiv = true;
  const p = dialog("Checkpoint scannen", '<div class="scanner"><video playsinline muted></video><div class="scan-rahmen"></div></div><p class="klein">Halte die Kamera auf den QR-Code der Station.</p>', [{ text: "Abbrechen" }]);
  const hg = letzterDialog(), video = hg.querySelector("video");
  try {
    strom = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.srcObject = strom; await video.play();
    const det = new BarcodeDetector({ formats: ["qr_code"] });
    const schleife = async () => {
      if (!aktiv || !document.body.contains(video)) return;
      try {
        const r = await det.detect(video);
        const treffer = r.map((x) => x.rawValue).find((v) => /\/m\/c\/[A-Za-z0-9_-]+/.test(v));
        if (treffer) {
          aktiv = false;
          const token = decodeURIComponent(treffer.match(/\/m\/c\/([A-Za-z0-9_-]+)/)[1]);
          const erg = await checkpointErfassen(token);
          melde(`Checkpoint erfasst: ${erg.bereich}`);
          hg.querySelector(".x").click();
          return;
        }
      } catch (e) { /* weiter versuchen */ }
      setTimeout(schleife, 250);
    };
    schleife();
  } catch (e) { hg.querySelector(".di").insertAdjacentHTML("beforeend", `<div class="fehler">Die Kamera ließ sich nicht öffnen: ${esc(e.message)}. Nutze die Kamera-App des Handys.</div>`); }
  await p;
  aktiv = false;
  if (strom) strom.getTracks().forEach((t) => t.stop());
  return true;
}

/* Unterschriftsfeld */
function unterschriftsfeld(box, name) {
  box.innerHTML = `<div class="us-kopf"><b>Unterschrift</b><button type="button" class="knopf klein" data-us-weg>Löschen</button></div>
    <canvas class="us-feld" aria-label="Unterschriftsfeld"></canvas><div class="us-linie">Hier mit Finger oder Maus unterschreiben</div>
    <label class="us-name">Name<input type="text" data-us-name value="${esc(name || "")}"></label>`;
  const cv = box.querySelector("canvas"), ctx = cv.getContext("2d");
  let leer = true, zeichnet = false, letzter = null;
  const groesse = () => {
    const r = cv.getBoundingClientRect(), f = window.devicePixelRatio || 1;
    const alt = leer ? null : cv.toDataURL();
    cv.width = Math.round(r.width * f); cv.height = Math.round(r.height * f);
    ctx.setTransform(f, 0, 0, f, 0, 0); ctx.lineWidth = 2.4; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#1A1A1A";
    if (alt) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, r.width, r.height); img.src = alt; }
  };
  groesse();
  const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  cv.addEventListener("pointerdown", (e) => { zeichnet = true; letzter = pos(e); cv.setPointerCapture(e.pointerId); e.preventDefault(); });
  cv.addEventListener("pointermove", (e) => {
    if (!zeichnet) return;
    const p = pos(e);
    ctx.beginPath(); ctx.moveTo(letzter.x, letzter.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    letzter = p; leer = false; box.classList.add("unterschrieben");
  });
  const ende = () => { zeichnet = false; };
  cv.addEventListener("pointerup", ende); cv.addEventListener("pointercancel", ende);
  box.querySelector("[data-us-weg]").onclick = () => { ctx.clearRect(0, 0, cv.width, cv.height); leer = true; box.classList.remove("unterschrieben"); };
  window.addEventListener("resize", groesse);
  return {
    bild: () => (leer ? "" : cv.toDataURL("image/png")),
    name: () => box.querySelector("[data-us-name]").value.trim(),
  };
}

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
    ${d.checkpoints.length ? `<p><b>Checkpoints:</b> ${d.checkpoints.map((cp) => `${esc(cp.bereich)} ${cp.zeit ? `<span class="marke m-ok">${cp.zeit.slice(11, 16)}</span>` : '<span class="marke m-ueber">nicht gescannt</span>'}`).join(" · ")}</p>` : ""}
    ${d.unterschrift ? `<div class="us-anzeige"><img src="${d.unterschrift}" alt="Unterschrift"><span>${esc(d.unterschrift_name || "")}</span></div>` : ""}
    ${d.tickets.length ? `<p><b>Angelegte Mängel:</b> ${d.tickets.map((t) => `<a href="#/tickets/${t.id}">${esc(t.nummer)}</a>`).join(", ")}</p>` : ""}`;
  await dialog(d.titel, html, [{ text: "Protokoll drucken", aktion: () => { protokollDrucken(d); return false; } }, { text: "Schließen", klasse: "haupt-k" }]);
}

async function durchfuehren(el, c) {
  const punkte = punkteVon(c);
  const speicherKey = `cafm-dg-${c.id}`;
  let gespeichert = null;
  try { gespeichert = JSON.parse(localStorage.getItem(speicherKey) || "null"); } catch (e) { gespeichert = null; }
  if (gespeichert && (gespeichert.punkte !== punkte.length || Date.now() - (gespeichert.ts || 0) > 12 * 3600 * 1000)) gespeichert = null;
  const erste = await api("GET", `checklisten/${c.id}/scans${gespeichert ? "?seit=" + encodeURIComponent(gespeichert.start) : ""}`);
  const startZeit = gespeichert ? gespeichert.start : erste.jetzt;
  let scans = erste.stand;
  const stand = gespeichert ? gespeichert.stand : punkte.map(() => ({ status: null, wert: "", notiz: "" }));
  const sichern = () => { try { localStorage.setItem(speicherKey, JSON.stringify({ start: startZeit, stand, punkte: punkte.length, ts: Date.now(), bem: el.querySelector("#dfbem")?.value || "" })); } catch (e) { /* egal */ } };
  const cpVon = (bereich) => scans.find((x) => x.bereich === bereich);
  const gesperrt = (p) => c.checkpoints_pflicht && p.bereich && cpVon(p.bereich) && !cpVon(p.bereich).zeit;
  let bereich = null;
  el.innerHTML = `<a class="zurueck" href="#/checklisten/${c.id}">← Abbrechen</a>
    <div class="titelzeile"><div><div class="kicker">${c.art === "Rundgang" ? "Rundgang" : "Checkliste"} · ${esc(refText("objekte", c.objekt_id))}${c.anlage_id ? " · " + esc(refText("anlagen", c.anlage_id)) : ""}</div><h1>${esc(c.titel)}</h1>
      <div class="klein">Begonnen ${datum(startZeit)} um ${startZeit.slice(11, 16)} Uhr${gespeichert ? " · Zwischenstand wiederhergestellt" : ""}</div></div>
      ${scans.length ? `<div class="aktionen"><button class="knopf haupt-k" id="dfscan">${icon("suche")} Checkpoint scannen</button></div>` : ""}</div>
    <div class="df-liste">${punkte.map((p, i) => {
      const kopf = p.bereich && p.bereich !== bereich ? `<div class="df-station" data-station="${esc(p.bereich)}">${icon("plaene")} <span>${esc(p.bereich)}</span><span class="cp-status" data-cp="${esc(p.bereich)}"></span></div>` : "";
      bereich = p.bereich || bereich;
      const eingabe = p.typ === "haken" ? `<div class="df-wahl" role="group"><button type="button" data-s="ok">✓ i. O.</button><button type="button" data-s="mangel">✗ Mangel</button><button type="button" data-s="na">– entfällt</button></div>`
        : p.typ === "zahl" ? `<div class="df-wert"><input type="text" inputmode="decimal" autocomplete="off" data-w placeholder="Wert"><span>${esc(p.einheit || "")}</span>${p.min != null || p.max != null ? `<span class="klein">Soll ${p.min ?? "…"} bis ${p.max ?? "…"}</span>` : ""}<button type="button" class="df-na" data-s="na">entfällt</button></div>`
          : `<div class="df-wert"><input type="text" data-w placeholder="Eintragen"><button type="button" class="df-na" data-s="na">entfällt</button></div>`;
      return kopf + `<div class="karte df-punkt" data-i="${i}" data-bereich="${esc(p.bereich || "")}"><div class="df-text"><span class="df-nr">${i + 1}</span><div><b>${esc(p.text)}</b>${p.pflicht ? "" : ' <span class="klein">freiwillig</span>'}${p.anlage_id ? `<br><span class="klein">${esc(refText("anlagen", p.anlage_id))}</span>` : ""}</div></div>${eingabe}
        <input class="df-notiz" data-n placeholder="Notiz (optional)" hidden><div class="df-sperre">Erst den Checkpoint dieser Station scannen</div></div>`;
    }).join("")}</div>
    <div class="karte df-abschluss"><label for="dfbem">Bemerkung zum Durchgang</label><textarea id="dfbem" placeholder="z. B. Firma informiert, Zugang Dach verschlossen"></textarea>
      <label class="check"><input type="checkbox" id="dfm" checked> Für jede Abweichung gleich einen Mangel anlegen</label></div>
    <div class="karte df-abschluss unterschrift-box" id="dfus"></div>
    <div class="df-leiste"><div class="df-fortschritt"><div id="dfbalken"></div></div><span id="dfstand"></span><button class="knopf haupt-k" id="dfok">Abschließen</button></div>`;
  if (gespeichert && gespeichert.bem) el.querySelector("#dfbem").value = gespeichert.bem;
  const us = unterschriftsfeld(el.querySelector("#dfus"), S.ich.name);
  if (c.unterschrift_pflicht) el.querySelector("#dfus .us-kopf b").insertAdjacentHTML("afterend", ' <span class="pflicht"></span>');
  // Gespeicherte Eingaben wiederherstellen
  punkte.forEach((p, i) => {
    const karte = el.querySelector(`.df-punkt[data-i="${i}"]`), s_ = stand[i];
    if (s_.wert) karte.querySelector("[data-w]").value = s_.wert;
    if (s_.notiz) karte.querySelector("[data-n]").value = s_.notiz;
    karte.querySelectorAll("[data-s]").forEach((x) => x.classList.toggle("an", x.dataset.s === s_.status));
  });
  const checkpointsZeigen = () => {
    el.querySelectorAll("[data-cp]").forEach((x) => {
      const cp = cpVon(x.dataset.cp);
      if (!cp) { x.innerHTML = ""; return; }
      x.innerHTML = cp.zeit ? `<span class="marke m-ok">✓ gescannt ${cp.zeit.slice(11, 16)}</span>` : `<span class="marke ${c.checkpoints_pflicht ? "m-ueber" : "m-geplant"}">Checkpoint noch nicht gescannt</span>`;
    });
    el.querySelectorAll(".df-punkt").forEach((k) => k.classList.toggle("gesperrt", !!gesperrt(punkte[Number(k.dataset.i)])));
  };
  const pruefen = () => {
    let fertig = 0, abw = 0;
    punkte.forEach((p, i) => {
      const s_ = stand[i], karte = el.querySelector(`.df-punkt[data-i="${i}"]`);
      let abweichung = s_.status === "mangel";
      if (p.typ === "zahl" && s_.wert !== "" && s_.status !== "na") {
        const w = Number(String(s_.wert).replace(",", "."));
        if ((p.min != null && w < p.min) || (p.max != null && w > p.max)) abweichung = true;
      }
      const erledigt = s_.status !== null || (p.typ !== "haken" && String(s_.wert).trim() !== "");
      if (erledigt) fertig++;
      if (abweichung) abw++;
      karte.classList.toggle("erledigt", erledigt && !abweichung);
      karte.classList.toggle("abweichung", abweichung);
      karte.querySelector("[data-n]").hidden = !abweichung && !s_.notiz;
    });
    const offeneCp = scans.filter((x) => !x.zeit).length;
    el.querySelector("#dfbalken").style.width = `${punkte.length ? (fertig / punkte.length) * 100 : 0}%`;
    el.querySelector("#dfstand").innerHTML = `${fertig} von ${punkte.length}${abw ? ` · <b class="rot-text">${abw} Abweichung${abw > 1 ? "en" : ""}</b>` : ""}${scans.length ? ` · Checkpoints ${scans.length - offeneCp}/${scans.length}` : ""}`;
    sichern();
  };
  const liste = el.querySelector(".df-liste");
  liste.addEventListener("click", (e) => {
    const b = e.target.closest("[data-s]");
    if (!b) return;
    const karte = b.closest(".df-punkt"), i = Number(karte.dataset.i);
    if (karte.classList.contains("gesperrt")) { melde("Bitte zuerst den Checkpoint dieser Station scannen.", true); return; }
    stand[i].status = stand[i].status === b.dataset.s ? null : b.dataset.s;
    karte.querySelectorAll("[data-s]").forEach((x) => x.classList.toggle("an", x.dataset.s === stand[i].status));
    pruefen();
  });
  liste.addEventListener("input", (e) => {
    const karte = e.target.closest(".df-punkt"), i = Number(karte.dataset.i);
    if (karte.classList.contains("gesperrt")) { e.target.value = ""; melde("Bitte zuerst den Checkpoint dieser Station scannen.", true); return; }
    if (e.target.matches("[data-w]")) { stand[i].wert = e.target.value; if (stand[i].status === "na") { stand[i].status = null; karte.querySelectorAll("[data-s]").forEach((x) => x.classList.remove("an")); } }
    if (e.target.matches("[data-n]")) stand[i].notiz = e.target.value;
    pruefen();
  });
  el.querySelector("#dfbem").addEventListener("input", sichern);
  // Scans regelmäßig abfragen, solange die Seite offen ist
  const scansLaden = async () => {
    if (!scans.length || !document.body.contains(liste)) return;
    try { scans = (await api("GET", `checklisten/${c.id}/scans?seit=${encodeURIComponent(startZeit)}`)).stand; checkpointsZeigen(); pruefen(); } catch (e) { /* später */ }
  };
  const takt = setInterval(() => { if (!document.body.contains(liste)) { clearInterval(takt); return; } if (!document.hidden) scansLaden(); }, 5000);
  window.addEventListener("focus", scansLaden);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) scansLaden(); });
  const scanKnopf = el.querySelector("#dfscan");
  if (scanKnopf) scanKnopf.onclick = async () => { await checkpointScanner(); scansLaden(); };
  checkpointsZeigen(); pruefen();
  el.querySelector("#dfok").onclick = async () => {
    const k = el.querySelector("#dfok");
    if (c.unterschrift_pflicht && !us.bild()) { melde("Bitte unten unterschreiben.", true); el.querySelector("#dfus").scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    k.disabled = true;
    try {
      const r = await api("POST", `checklisten/${c.id}/durchgang`, {
        ergebnisse: stand.map((s_, idx) => ({ idx, status: s_.status, wert: s_.wert, notiz: s_.notiz })),
        bemerkung: el.querySelector("#dfbem").value, maengel_anlegen: el.querySelector("#dfm").checked,
        start: startZeit, unterschrift: us.bild(), unterschrift_name: us.name() });
      try { localStorage.removeItem(speicherKey); } catch (e) { /* egal */ }
      clearInterval(takt);
      melde(r.abweichungen ? `Abgeschlossen: ${r.abweichungen} Abweichungen${r.tickets ? `, ${r.tickets} Mängel angelegt` : ""}.` : "Abgeschlossen: alles in Ordnung.");
      cacheLeeren();
      location.hash = `#/checklisten/${c.id}`;
    } catch (err) { melde(err.message, true); k.disabled = false; }
  };
}


/* Prüfprotokoll eines Durchgangs zum Drucken (Casa-Design) */
function protokollDrucken(d) {
  let bereich = null;
  const zeilen = d.ergebnisse.map((e) => {
    const kopf = e.bereich && e.bereich !== bereich ? `<tr class="g"><td colspan="3">${esc(e.bereich)}</td></tr>` : "";
    bereich = e.bereich || bereich;
    const wert = e.status === "na" ? "entfällt" : e.typ === "haken" ? (e.status === "ok" ? "i. O." : e.status === "mangel" ? "Mangel" : "–")
      : e.typ === "zahl" ? (e.wert == null ? "–" : `${String(e.wert).replace(".", ",")} ${esc(e.einheit || "")}`) : esc(e.wert || "–");
    const soll = e.typ === "zahl" && (e.min != null || e.max != null) ? `${e.min ?? "…"} bis ${e.max ?? "…"} ${esc(e.einheit || "")}` : "";
    return kopf + `<tr class="${e.abweichung ? "a" : ""}"><td>${esc(e.text)}${e.notiz ? `<br><small>${esc(e.notiz)}</small>` : ""}</td><td>${soll}</td><td><b>${wert}</b></td></tr>`;
  }).join("");
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Prüfprotokoll ${esc(d.titel)}</title><style>
    @font-face { font-family: Carlito; src: url("${location.origin}/schrift/Carlito-Regular.ttf"); }
    @font-face { font-family: Carlito; src: url("${location.origin}/schrift/Carlito-Bold.ttf"); font-weight: 700; }
    @page { size: A4; margin: 16mm 14mm; }
    body { font-family: Calibri, Carlito, sans-serif; color: #3C3C3B; font-size: 10.5pt; }
    .kopf { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: .6mm solid #E63713; padding-bottom: 4mm; }
    .kopf img { width: 52mm; }
    h1 { font-size: 20pt; margin: 6mm 0 1mm; }
    .k { font-size: 9pt; letter-spacing: .12em; color: #E63713; font-weight: 700; text-transform: uppercase; }
    .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2mm 6mm; margin: 4mm 0 6mm; }
    .meta div small { display: block; color: #939598; font-size: 8pt; text-transform: uppercase; letter-spacing: .06em; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #3C3C3B; color: #fff; text-align: left; padding: 2mm 3mm; font-size: 9pt; }
    td { padding: 2mm 3mm; border-bottom: .2mm solid #D9DADB; vertical-align: top; }
    tr.g td { background: #FBEEE5; color: #B82C0F; font-weight: 700; }
    tr.a td { background: #F5DDE2; }
    small { color: #626366; }
    .us { margin-top: 10mm; display: flex; gap: 12mm; }
    .us div { flex: 1; border-top: .3mm solid #3C3C3B; padding-top: 1.5mm; font-size: 9pt; }
    .us img { height: 22mm; display: block; margin-bottom: -2mm; }
    .fuss { position: fixed; bottom: 0; left: 0; right: 0; font-size: 8pt; color: #939598; text-align: center; }
  </style></head><body>
    <div class="kopf"><div><div class="k">${d.art === "Rundgang" ? "Rundgang" : "Checkliste"} · Prüfprotokoll</div><h1>${esc(d.titel)}</h1></div><img src="${location.origin}/logo.png" alt=""></div>
    <div class="meta"><div><small>Objekt</small>${esc(refText("objekte", d.objekt_id))}</div><div><small>Anlage</small>${esc(d.anlage_id ? refText("anlagen", d.anlage_id) : "–")}</div>
      <div><small>Durchgeführt</small>${datum(d.zeit)} ${d.zeit.slice(11, 16)} · ${esc(d.wer || "")}</div>
      <div><small>Ergebnis</small>${d.abweichungen ? `${d.abweichungen} Abweichung${d.abweichungen > 1 ? "en" : ""}` : "alles in Ordnung"}</div>
      ${d.checkpoints.length ? `<div style="grid-column: span 2"><small>Checkpoints</small>${d.checkpoints.map((cp) => `${esc(cp.bereich)} ${cp.zeit ? cp.zeit.slice(11, 16) : "nicht gescannt"}`).join(" · ")}</div>` : ""}</div>
    <table><thead><tr><th>Prüfpunkt</th><th>Soll</th><th>Ergebnis</th></tr></thead><tbody>${zeilen}</tbody></table>
    ${d.bemerkung ? `<p><b>Bemerkung:</b> ${esc(d.bemerkung)}</p>` : ""}
    <div class="us"><div>${d.unterschrift ? `<img src="${d.unterschrift}" alt="">` : ""}Unterschrift ${esc(d.unterschrift_name || d.wer || "")}</div><div>Datum ${datum(d.zeit)}</div></div>
    <div class="fuss">Casa Concept Consulting GmbH &amp; Co. KG · www.ccc-frankfurt.com</div>
    <script>window.onload = () => setTimeout(() => print(), 300);<\/script></body></html>`;
  const f = window.open("", "_blank");
  if (!f) { melde("Das Druckfenster wurde blockiert. Bitte Pop-ups für diese Seite erlauben.", true); return; }
  f.document.open(); f.document.write(html); f.document.close();
}
