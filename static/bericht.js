"use strict";
/* Berichtswesen je Objekt: Auswahl von Zeitraum und Teilbereichen, Bericht im Casa-Design zum Drucken oder als PDF */

const BERICHT_TEILE = [
  ["ueberblick", "Überblick und Kennzahlen", "Die wichtigsten Zahlen auf einen Blick"],
  ["anlagen", "Anlagenbestand", "Anlagen nach Gewerk und Zustand, mit Liste"],
  ["wartung", "Wartungen und Prüfungen", "Erledigt im Zeitraum, überfällig, anstehend"],
  ["sv", "SV-Prüfplan", "Sicherheitsrelevante Anlagen und Prüftermine"],
  ["svmaengel", "SV-Mängel", "Offene und behobene Mängel aus SV-Prüfungen"],
  ["tickets", "Mängel und Störungen", "Meldungen im Zeitraum, offene Meldungen"],
  ["checklisten", "Checklisten und Rundgänge", "Durchgänge, Rundgänge mit Checkpoints, Abweichungen"],
  ["zaehler", "Zähler und Verbrauch", "Verbrauch je Zähler im Zeitraum"],
  ["vertraege", "Verträge", "Laufende Verträge und Kündigungsfristen"],
  ["schluessel", "Schlüssel und Transponder", "Übergaben, ausgegeben, verloren"],
  ["dokumente", "Dokumente", "Im Zeitraum abgelegte Dokumente"],
];

function berichtZeitraum(art) {
  const d = new Date(), j = d.getFullYear(), m = d.getMonth(), q = Math.floor(m / 3);
  const iso = (x) => new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const r = {
    monat_letzter: [new Date(j, m - 1, 1), new Date(j, m, 0)],
    monat: [new Date(j, m, 1), d],
    quartal_letztes: [new Date(j, q * 3 - 3, 1), new Date(j, q * 3, 0)],
    quartal: [new Date(j, q * 3, 1), d],
    jahr: [new Date(j, 0, 1), d],
    jahr_letztes: [new Date(j - 1, 0, 1), new Date(j - 1, 11, 31)],
  }[art];
  return r ? [iso(r[0]), iso(r[1])] : null;
}

async function berichtDialog(o) {
  let gemerkt = {};
  try { gemerkt = JSON.parse(localStorage.getItem("cafm-bericht") || "{}"); } catch (e) { gemerkt = {}; }
  const gewaehlt = new Set(gemerkt.teile || BERICHT_TEILE.map((t) => t[0]));
  const zr = gemerkt.zeitraum || "quartal_letztes";
  const [v0, b0] = berichtZeitraum(zr === "eigen" ? "quartal_letztes" : zr);
  const html = `<div class="dfehler"></div><form class="formular" onsubmit="return false">
    <label><span>Zeitraum</span><select name="zeitraum">
      ${[["monat_letzter", "Letzter Monat"], ["monat", "Laufender Monat"], ["quartal_letztes", "Letztes Quartal"], ["quartal", "Laufendes Quartal"], ["jahr", "Laufendes Jahr"], ["jahr_letztes", "Letztes Jahr"], ["eigen", "Eigener Zeitraum"]]
        .map(([w, t]) => `<option value="${w}" ${w === zr ? "selected" : ""}>${t}</option>`).join("")}</select></label>
    <label><span>Titel</span><input name="titel" value="${esc(gemerkt.titel || "Objektbericht")}"></label>
    <label><span>von</span><input type="date" name="von" value="${zr === "eigen" && gemerkt.von ? gemerkt.von : v0}"></label>
    <label><span>bis</span><input type="date" name="bis" value="${zr === "eigen" && gemerkt.bis ? gemerkt.bis : b0}"></label>
    <div class="breit"><div class="bt-kopf"><span class="sl-titel">Teilbereiche</span><button type="button" class="knopf klein" data-alle="1">Alle</button><button type="button" class="knopf klein" data-alle="0">Keine</button></div>
      <div class="bt-wahl">${BERICHT_TEILE.map(([k, t, b]) => `<label class="sl-k"><input type="checkbox" data-teil="${k}" ${gewaehlt.has(k) ? "checked" : ""}><span><b>${esc(t)}</b><br><span class="klein">${esc(b)}</span></span></label>`).join("")}</div></div>
    <label class="breit"><span>Rundgänge im Bericht</span><select name="rundgang">
      ${[["checkpoints", "Mit Checkpoints: jeder Rundgang mit Scan-Zeiten je Station und den Abweichungen"], ["voll", "Vollständig: zusätzlich alle Prüfpunkte je Rundgang"], ["kurz", "Kurz: nur die Liste der Durchgänge"]]
        .map(([w, t]) => `<option value="${w}" ${w === (gemerkt.rundgang || "checkpoints") ? "selected" : ""}>${t}</option>`).join("")}</select></label>
    <label class="check breit"><input type="checkbox" name="kosten" ${gemerkt.kosten ? "checked" : ""}> Beträge und Kosten zeigen (Störungskosten, Vertragsbeträge). Für Berichte an Auftraggeber meist aus.</label>
    <label class="breit"><span>Anmerkung im Bericht (optional)</span><textarea name="anmerkung" rows="3" placeholder="z. B. Besonderheiten im Berichtszeitraum">${esc(gemerkt.anmerkung || "")}</textarea></label>
  </form>`;
  const p = dialog(`Bericht: ${o.kuerzel || ""} ${o.name}`.trim(), html, [{ text: "Abbrechen" }, {
    text: "Bericht erstellen", klasse: "haupt-k", aktion: async (hg) => {
      const fm = hg.querySelector("form");
      const teile = [...hg.querySelectorAll("[data-teil]:checked")].map((c) => c.dataset.teil);
      if (!teile.length) throw new Error("Bitte mindestens einen Teilbereich auswählen.");
      if (!fm.von.value || !fm.bis.value || fm.bis.value < fm.von.value) throw new Error("Bitte einen gültigen Zeitraum wählen.");
      const einst = { teile, zeitraum: fm.zeitraum.value, von: fm.von.value, bis: fm.bis.value, kosten: fm.kosten.checked, rundgang: fm.rundgang.value, titel: fm.titel.value.trim() || "Objektbericht", anmerkung: fm.anmerkung.value.trim() };
      try { localStorage.setItem("cafm-bericht", JSON.stringify({ ...einst, anmerkung: "" })); } catch (e) { /* egal */ }
      const daten = await api("GET", `objekte/${o.id}/bericht?${new URLSearchParams({ von: einst.von, bis: einst.bis, teile: teile.join(","), kosten: einst.kosten ? "1" : "0", rundgang: einst.rundgang })}`);
      berichtDrucken(daten, einst);
      return true;
    },
  }]);
  const hg = letzterDialog();
  hg.querySelector(".dialog").classList.add("breit-dialog");
  const fm = hg.querySelector("form");
  const zeit = () => { const r = berichtZeitraum(fm.zeitraum.value); if (r) { fm.von.value = r[0]; fm.bis.value = r[1]; } };
  fm.zeitraum.onchange = zeit;
  [fm.von, fm.bis].forEach((f) => f.addEventListener("input", () => { fm.zeitraum.value = "eigen"; }));
  hg.querySelectorAll("[data-alle]").forEach((b) => b.onclick = () => hg.querySelectorAll("[data-teil]").forEach((c) => { c.checked = b.dataset.alle === "1"; }));
  return p;
}

/* ---------- Bericht als Druckseite ---------- */
function berichtDrucken(d, e) {
  const o = d.objekt;
  const h = (v) => esc(v ?? "");
  const dat = (v) => (v ? datum(String(v).slice(0, 10)) : "");
  const MON = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
  const monat = (m) => `${MON[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
  let nr = 0;
  const abschnitt = (titel, innen) => `<section><h2><span>${String(++nr).padStart(2, "0")}</span>${h(titel)}</h2>${innen}</section>`;
  const kacheln = (liste) => `<div class="kacheln">${liste.map(([w, t, ton]) => `<div class="kachel ${ton || ""}"><b>${h(w)}</b><span>${h(t)}</span></div>`).join("")}</div>`;
  const tabelle = (kopf, zeilen, leer = "Keine Einträge.") => zeilen.length
    ? `<table><thead><tr>${kopf.map((k) => `<th>${h(k)}</th>`).join("")}</tr></thead><tbody>${zeilen.map((z) => `<tr>${z.map((c) => `<td>${c ?? ""}</td>`).join("")}</tr>`).join("")}</tbody></table>`
    : `<p class="leer">${h(leer)}</p>`;
  const balken = (paare, einheit = "") => {
    const max = Math.max(1, ...paare.map((p) => Number(p[1]) || 0));
    return `<div class="balken">${paare.map(([k, v]) => `<div class="b"><div class="bw"><div class="bs" style="height:${Math.round(((Number(v) || 0) / max) * 100)}%"></div></div><div class="bz">${v == null ? "–" : zahl(v, Number(v) % 1 ? 1 : 0)}${einheit}</div><div class="bl">${h(k)}</div></div>`).join("")}</div>`;
  };
  const verteilung = (paare) => {
    const sum = paare.reduce((n, p) => n + p[1], 0) || 1;
    return `<div class="vert">${paare.map(([k, v]) => `<div class="vz"><span>${h(k)}</span><div class="vb"><div style="width:${Math.round(v / sum * 100)}%"></div></div><b>${v}</b></div>`).join("")}</div>`;
  };
  const marke = (t, ton) => `<span class="m ${ton}">${h(t)}</span>`;
  const faellig = (iso) => { const t = tageBis(iso.slice(0, 10)); return t < 0 ? marke(`${-t} Tage überfällig`, "rot") : t <= 30 ? marke(`in ${t} Tagen`, "gelb") : ""; };
  const teile = [];

  if (d.ueberblick) {
    const u = d.ueberblick;
    teile.push(abschnitt("Überblick", kacheln([
      [u.anlagen, "Anlagen im Bestand"], [u.tickets_zeitraum, "Meldungen im Zeitraum"], [u.tickets_offen, "Meldungen offen", u.tickets_offen ? "orange" : ""],
      [u.wartung_erledigt, "Wartungen und Prüfungen erledigt", "gruen"], [u.wartung_ueberfaellig, "Termine überfällig", u.wartung_ueberfaellig ? "rot" : "gruen"],
      [u.sv_maengel_offen, "SV-Mängel offen", u.sv_maengel_offen ? "rot" : "gruen"], [u.rundgaenge, "Rundgänge und Checklisten"],
    ]) + (e.anmerkung ? `<div class="anm"><b>Anmerkung</b><br>${h(e.anmerkung).replace(/\n/g, "<br>")}</div>` : "")));
  }
  if (d.anlagen) {
    const a = d.anlagen;
    teile.push(abschnitt("Anlagenbestand", `<div class="zwei"><div><h3>Nach Gewerk</h3>${verteilung(a.nach_gewerk)}</div><div><h3>Nach Zustand</h3>${verteilung(a.nach_status)}
      <p class="klein">${a.pflichtig} Anlagen mit gesetzlicher Prüf- oder Wartungspflicht bzw. im SV-Prüfplan.</p></div></div>
      <h3>Anlagenliste</h3>${tabelle(["Nr.", "Anlage", "Gewerk", "Standort", "Zustand"], a.liste.map((x) => [h(x.nummer), `<b>${h(x.bezeichnung)}</b>${x.hersteller ? `<br><small>${h(x.hersteller)}${x.baujahr ? ", Baujahr " + h(x.baujahr) : ""}</small>` : ""}`, h(x.gewerk), h(x.standort), h(x.status)]))}`));
  }
  if (d.wartung) {
    const w = d.wartung;
    teile.push(abschnitt("Wartungen und Prüfungen", kacheln([[w.erledigt.length, "erledigt im Zeitraum", "gruen"], [w.ueberfaellig.length, "überfällig", w.ueberfaellig.length ? "rot" : "gruen"], [w.anstehend.length, "anstehend (90 Tage)"], [w.aufgaben, "Aufgaben im Wartungsplan"]])
      + (w.nach_ergebnis.length ? `<h3>Ergebnisse</h3>${verteilung(w.nach_ergebnis)}` : "")
      + `<h3>Erledigt im Zeitraum</h3>${tabelle(["Datum", "Aufgabe", "Anlage", "Ergebnis"], w.erledigt.map((x) => [dat(x.datum), `<b>${h(x.titel)}</b><br><small>${h(x.art)}</small>`, h(x.anlage), marke(x.ergebnis, x.ergebnis === "Mängel offen" ? "rot" : x.ergebnis === "Nicht durchgeführt" ? "gelb" : "gruen")]), "Im Zeitraum wurde nichts als erledigt gemeldet.")}`
      + (w.ueberfaellig.length ? `<h3>Überfällig</h3>${tabelle(["Fällig seit", "Aufgabe", "Anlage"], w.ueberfaellig.map((x) => [`${dat(x.naechste)}<br>${faellig(x.naechste)}`, `<b>${h(x.titel)}</b><br><small>${h(x.art)}</small>`, h(x.anlage)]))}` : "")
      + `<h3>Anstehend in den nächsten 90 Tagen</h3>${tabelle(["Fällig", "Aufgabe", "Anlage"], w.anstehend.map((x) => [dat(x.naechste), `<b>${h(x.titel)}</b><br><small>${h(x.art)}</small>`, h(x.anlage)]), "Keine Termine.")}`));
  }
  if (d.sv) {
    const z = [];
    d.sv.forEach((a) => (a.pruefungen.length ? a.pruefungen : [null]).forEach((p) => z.push([`<b>${h(a.bezeichnung)}</b>${a.nummer ? `<br><small>${h(a.nummer)}</small>` : ""}`, h(a.sv_gegenstand),
      p && p.letztes ? `${dat(p.letztes.datum)}<br><small>${h(p.letztes.ergebnis)}</small>` : p && p.letzte ? dat(p.letzte) : "–",
      p ? `${dat(p.naechste)} ${faellig(p.naechste)}` : marke("kein Termin", "gelb"), a.sv_maengel_offen ? marke(`${a.sv_maengel_offen} offen`, "rot") : "–"])));
    teile.push(abschnitt("SV-Prüfplan", tabelle(["Anlage", "Prüfgegenstand", "Letzte Prüfung", "Nächste Prüfung", "SV-Mängel"], z, "Keine Anlage im SV-Prüfplan.")));
  }
  if (d.svmaengel) {
    const s = d.svmaengel;
    const einst = (x) => marke(x.einstufung || "unklar", x.einstufung === "gefährlich" ? "rot" : x.einstufung === "erheblich" ? "gelb" : "grau");
    teile.push(abschnitt("SV-Mängel", kacheln([[s.offen.length, "offen", s.offen.length ? "rot" : "gruen"], [s.offen.filter((m) => m.einstufung === "gefährlich").length, "davon gefährlich", s.offen.some((m) => m.einstufung === "gefährlich") ? "rot" : ""], [s.behoben_zeitraum.length, "behoben im Zeitraum", "gruen"], [s.neu_zeitraum, "neu erfasst im Zeitraum"]])
      + `<h3>Offene SV-Mängel</h3>${tabelle(["Anlage", "Mangel", "Einstufung", "Frist", "Status"], s.offen.map((m) => [h(m.anlage), `${m.nummer ? `<small>${h(m.nummer)}</small> ` : ""}<b>${h(m.beschreibung)}</b>${m.ort ? `<br><small>${h(m.ort)}</small>` : ""}`, einst(m), m.frist ? `${dat(m.frist)} ${faellig(m.frist)}` : `<small>${h(m.frist_text)}</small>`, h(m.status)]), "Keine offenen SV-Mängel.")}`
      + (s.behoben_zeitraum.length ? `<h3>Behoben im Zeitraum</h3>${tabelle(["Anlage", "Mangel", "Behoben am", "Maßnahme"], s.behoben_zeitraum.map((m) => [h(m.anlage), h(m.beschreibung), dat(m.behoben_am), h(m.massnahme)]))}` : "")));
  }
  if (d.tickets) {
    const t = d.tickets;
    teile.push(abschnitt("Mängel und Störungen", kacheln([[t.zeitraum.length, "Meldungen im Zeitraum"], [t.offen.length, "derzeit offen", t.offen.length ? "orange" : "gruen"], [t.dauer_tage == null ? "–" : `${zahl(t.dauer_tage, 1)} T.`, "Ø Bearbeitungsdauer"], ...(e.kosten && t.kosten != null ? [[geld(t.kosten), "Kosten im Zeitraum"]] : [])])
      + `<h3>Meldungen je Monat</h3>${balken(t.monate.map(([m, v]) => [monat(m), v]))}`
      + `<div class="zwei"><div><h3>Nach Gewerk</h3>${verteilung(t.nach_gewerk)}</div><div><h3>Nach Priorität</h3>${verteilung(t.nach_prioritaet)}</div></div>`
      + `<h3>Offene Meldungen</h3>${tabelle(["Nr.", "Meldung", "Gemeldet", "Priorität", "Status"], t.offen.map((x) => [h(x.nummer), `<b>${h(x.titel)}</b>${x.anlage ? `<br><small>${h(x.anlage)}</small>` : ""}`, dat(x.gemeldet_am), h(x.prioritaet), h(x.status)]), "Keine offenen Meldungen.")}`
      + `<h3>Meldungen im Zeitraum</h3>${tabelle(["Nr.", "Meldung", "Gemeldet", "Erledigt", "Status", ...(e.kosten ? ["Kosten"] : [])], t.zeitraum.map((x) => [h(x.nummer), `<b>${h(x.titel)}</b>${x.gewerk ? `<br><small>${h(x.gewerk)}</small>` : ""}`, dat(x.gemeldet_am), dat(x.erledigt_am), h(x.status), ...(e.kosten ? [x.kosten ? geld(x.kosten) : ""] : [])]), "Im Zeitraum keine Meldungen.")}`));
  }
  if (d.checklisten) {
    const c = d.checklisten, rg = c.rundgaenge;
    const pruefText = (x) => ({ bestaetigt: "bestätigt", rueckfrage: "Rückfrage", offen: "offen" }[x.pruef_status] || "");
    const uhr = (iso) => h(String(iso || "").slice(11, 16));
    const dauer = (min) => (min == null ? "" : min < 1 ? "unter 1 Min." : min < 60 ? `${min} Min.` : `${Math.floor(min / 60)} Std. ${min % 60} Min.`);
    const quote = (a, b) => (b ? `${Math.round((a / b) * 100)} %` : "–");
    /* Ein Rundgang: Kennzahlen, je Durchgang die Scan-Zeiten der Checkpoints, darunter die Abweichungen */
    const rundgang = (r) => {
      const kopf = `<h3>Rundgang: ${h(r.titel)} <small>${h([r.rhythmus, r.zustaendig, r.stationen.length ? `${r.stationen.length} Stationen` : "", r.stationen.length ? (r.pflicht ? "Scannen ist Pflicht" : "Scannen freiwillig") : "", r.aktiv ? "" : "nicht mehr aktiv"].filter(Boolean).join(" · "))}</small></h3>`;
      if (!r.durchgaenge.length) return `<div class="rg">${kopf}<p class="leer">Im Zeitraum kein Durchgang.</p></div>`;
      const zahlen = `<p class="rgz"><b>${r.durchgaenge.length}</b> ${r.durchgaenge.length === 1 ? "Durchgang" : "Durchgänge"}${r.mit_checkpoints ? ` · Checkpoints gescannt: <b>${r.gescannt} von ${r.soll}</b> (${quote(r.gescannt, r.soll)}) · alle Stationen gescannt bei <b>${r.vollstaendig} von ${r.mit_checkpoints}</b>` : ""} · Abweichungen: <b>${r.abweichungen}</b>${r.dauer_min != null ? ` · Dauer im Schnitt ${dauer(r.dauer_min)}` : ""}</p>`;
      const zeit = (x, s) => { const cp = x.checkpoints.find((k) => k.bereich === s); return !cp ? '<span class="cpn">–</span>' : cp.zeit ? `<span class="cpj">${uhr(cp.zeit)}</span>` : '<span class="cpf">fehlt</span>'; };
      const erg = (x) => `${x.abweichungen ? marke(`${x.abweichungen} Abw.`, "rot") : marke("i. O.", "gruen")}${x.pruef_status ? `<br><small>${h(pruefText(x))}</small>` : ""}`;
      const wann = (x) => `<b>${dat(x.zeit)}</b><br><small>${x.beginn ? `${uhr(x.beginn)} bis ${uhr(x.zeit)}` : uhr(x.zeit)}${x.dauer_min != null ? ` · ${dauer(x.dauer_min)}` : ""}</small>`;
      /* Bis acht Stationen als Raster (eine Spalte je Station), darüber als Zeile mit Marken. Ohne Checkpoints nur die Durchgänge. */
      const raster = !r.mit_checkpoints ? tabelle(["Datum", "Durchgeführt von", "Ergebnis"], r.durchgaenge.map((x) => [`<div class="nw">${wann(x)}</div>`, h(x.wer), erg(x)]))
        : r.stationen.length <= 8
        ? `<table class="cpt rgt"><thead><tr><th>Datum</th><th>Durchgeführt von</th>${r.stationen.map((s) => `<th class="cps">${h(s)}</th>`).join("")}<th>Ergebnis</th></tr></thead><tbody>${r.durchgaenge.map((x) =>
          `<tr><td>${wann(x)}</td><td>${h(x.wer)}</td>${x.checkpoints.length ? r.stationen.map((s) => `<td class="cps">${zeit(x, s)}</td>`).join("") : `<td class="cps" colspan="${r.stationen.length}"><small>ohne Checkpoints erfasst</small></td>`}<td>${erg(x)}</td></tr>`).join("")}</tbody></table>`
        : tabelle(["Datum", "Durchgeführt von", "Checkpoints", "Ergebnis"], r.durchgaenge.map((x) => [`<div class="nw">${wann(x)}</div>`, h(x.wer), x.checkpoints.length ? `<div class="cpl">${x.checkpoints.map((k) => `<span class="${k.zeit ? "cpj" : "cpf"}">${h(k.bereich)} ${k.zeit ? uhr(k.zeit) : "fehlt"}</span>`).join("")}</div>` : "<small>ohne Checkpoints erfasst</small>", erg(x)]));
      const abw = r.durchgaenge.flatMap((x) => x.abw.map((a) => [dat(x.zeit), h(a.bereich), `<b>${h(a.text)}</b>`, h(a.befund), h(a.ticket)]));
      const hinweise = r.durchgaenge.filter((x) => x.bemerkung || (x.pruef_kommentar && x.pruef_status !== "offen")).map((x) => [dat(x.zeit), h(x.wer), `${x.bemerkung ? h(x.bemerkung) : ""}${x.pruef_kommentar && x.pruef_status !== "offen" ? `${x.bemerkung ? "<br>" : ""}<small>${h(pruefText(x))} durch ${h(x.geprueft_von || "")}: ${h(x.pruef_kommentar)}</small>` : ""}`]);
      /* Vollständig: jeder Durchgang mit allen Prüfpunkten, nach Stationen geordnet */
      const voll = r.durchgaenge.some((x) => x.punkte) ? r.durchgaenge.map((x) => {
        let bereich = null;
        const zeilen = x.punkte.map((e) => {
          const gruppe = e.bereich && e.bereich !== bereich ? `<tr class="g"><td colspan="3">${h(e.bereich)}${(() => { const cp = x.checkpoints.find((k) => k.bereich === e.bereich); return cp ? ` <small>${cp.zeit ? `gescannt um ${uhr(cp.zeit)}` : "nicht gescannt"}</small>` : ""; })()}</td></tr>` : "";
          bereich = e.bereich || bereich;
          const wert = e.status === "na" ? "entfällt" : e.typ === "haken" ? (e.status === "ok" ? "i. O." : e.status === "mangel" ? "Mangel" : "–")
            : e.typ === "zahl" ? (e.wert == null ? "–" : `${zahl(e.wert, Number(e.wert) % 1 ? 2 : 0)} ${h(e.einheit || "")}`) : h(e.wert || "–");
          const soll = e.typ === "zahl" && (e.min != null || e.max != null) ? `${e.min ?? "…"} bis ${e.max ?? "…"} ${h(e.einheit || "")}` : "";
          return `${gruppe}<tr class="${e.abweichung ? "a" : ""}"><td>${h(e.text)}${e.notiz ? `<br><small>${h(e.notiz)}</small>` : ""}</td><td>${soll}</td><td><b>${wert}</b></td></tr>`;
        }).join("");
        return `<div class="rgd"><h4>${dat(x.zeit)}, ${uhr(x.zeit)} Uhr · ${h(x.wer)} <small>${x.unterschrieben ? `unterschrieben${x.unterschrift_name ? " von " + h(x.unterschrift_name) : ""}` : "ohne Unterschrift"}${x.pruef_status ? ` · Prüfung ${h(pruefText(x))}` : ""}</small></h4>
          <table class="rgp"><thead><tr><th>Prüfpunkt</th><th>Soll</th><th>Ergebnis</th></tr></thead><tbody>${zeilen}</tbody></table></div>`;
      }).join("") : "";
      return `<div class="rg">${kopf}${zahlen}${raster}${abw.length ? `<h4>Abweichungen</h4>${tabelle(["Datum", "Station", "Prüfpunkt", "Festgestellt", "Mangel-Nr."], abw)}` : ""}${hinweise.length ? `<h4>Bemerkungen</h4>${tabelle(["Datum", "Von", "Bemerkung"], hinweise)}` : ""}${voll ? `<h4>Alle Prüfpunkte je Durchgang</h4>${voll}` : ""}</div>`;
    };
    teile.push(abschnitt("Checklisten und Rundgänge", kacheln([[c.liste.length, "durchgeführt"], [c.abweichungen, "Abweichungen", c.abweichungen ? "orange" : "gruen"], [c.geprueft, "vom Objektleiter bestätigt", "gruen"], [c.listen, "aktive Listen"],
      ...(rg && rg.mit_checkpoints ? [[quote(rg.gescannt, rg.soll), `Checkpoints gescannt (${rg.gescannt} von ${rg.soll})`, rg.gescannt === rg.soll ? "gruen" : "orange"]] : []),
      ...(rg && rg.ohne_durchgang ? [[rg.ohne_durchgang, rg.ohne_durchgang === 1 ? "Rundgang ohne Durchgang" : "Rundgänge ohne Durchgang", "orange"]] : [])])
      + (rg && rg.liste.length ? `${rg.liste.map(rundgang).join("")}<h3>Alle Durchgänge im Zeitraum</h3>` : "")
      + tabelle(["Datum", "Liste", "Durchgeführt von", "Ergebnis", "Prüfung"], c.liste.map((x) => [`${dat(x.zeit)} ${h(x.zeit.slice(11, 16))}`, `<b>${h(x.titel)}</b><br><small>${h(x.art)}</small>`, h(x.wer), x.abweichungen ? marke(`${x.abweichungen} Abweichung${x.abweichungen > 1 ? "en" : ""}`, "rot") : marke("alles i. O.", "gruen"), h(pruefText(x))]), "Im Zeitraum keine Durchgänge.")));
  }
  if (d.zaehler) {
    teile.push(abschnitt("Zähler und Verbrauch", d.zaehler.length ? d.zaehler.map((z) => `<div class="zaehler"><h3>${h(z.medium)} · ${h(z.bezeichnung || z.nummer)} <small>${h(z.nummer)}${z.standort ? " · " + h(z.standort) : ""}</small></h3>
      <p>Verbrauch im Zeitraum: <b>${z.verbrauch == null ? "nicht ermittelbar (zu wenige Ablesungen)" : `${zahl(z.verbrauch, z.verbrauch % 1 ? 2 : 0)} ${h(z.einheit)}`}</b> · ${z.ablesungen} Ablesungen${z.letzte ? `, letzter Stand ${zahl(z.letzte.stand, 2)} am ${dat(z.letzte.datum)}` : ""}</p>
      ${z.monate.some((m) => m[1] != null) ? balken(z.monate.map(([m, v]) => [monat(m), v])) : ""}</div>`).join("") : '<p class="leer">Keine Zähler angelegt.</p>'));
  }
  if (d.vertraege) {
    teile.push(abschnitt("Verträge", tabelle(["Vertrag", "Dienstleister", "Laufzeit", "Kündigen bis", ...(e.kosten ? ["Betrag pro Jahr"] : [])], d.vertraege.map((v) => [`<b>${h(v.titel)}</b>${v.gewerk ? `<br><small>${h(v.gewerk)}</small>` : ""}`, h(v.firma), `${dat(v.beginn)} – ${v.ende ? dat(v.ende) : "unbefristet"}`, v.kuendigen_bis ? `${dat(v.kuendigen_bis)} ${faellig(v.kuendigen_bis)}` : "–", ...(e.kosten ? [v.betrag_jahr ? geld(v.betrag_jahr) : ""] : [])]), "Keine laufenden Verträge.")));
  }
  if (d.schluessel) {
    const s = d.schluessel;
    const liste = (u) => u.schluessel.map((k) => `${k.art === "Transponder" ? "Transponder " : ""}${k.nummer}`).join(", ");
    teile.push(abschnitt("Schlüssel und Transponder", kacheln([[s.bestand, "im Bestand"], [s.zeitraum.length, "Übergaben im Zeitraum"], [s.offen.length, "derzeit ausgegeben", s.offen.length ? "orange" : "gruen"], [s.zu_spaet, "zu spät zurück", s.zu_spaet ? "rot" : "gruen"], [s.verloren.length, "verloren", s.verloren.length ? "rot" : "gruen"]])
      + (s.offen.length ? `<h3>Derzeit ausgegeben</h3>${tabelle(["Protokoll", "Ausgegeben", "Erhalten von", "Rückgabe bis"], s.offen.map((u) => [h(u.nummer), h(liste(u)), `<b>${h(u.empfaenger_name)}</b>${u.empfaenger_firma ? `<br><small>${h(u.empfaenger_firma)}</small>` : ""}`, `${dat(u.rueckgabe_bis)} ${h(u.rueckgabe_bis.slice(11, 16))}`]))}` : "")
      + (s.verloren.length ? `<h3>Als verloren gemeldet</h3>${tabelle(["Nr.", "Art", "Bezeichnung"], s.verloren.map((k) => [h(k.nummer), h(k.art || "Schlüssel"), h(k.bezeichnung)]))}` : "")
      + `<h3>Übergaben im Zeitraum</h3>${tabelle(["Protokoll", "Ausgabe", "Erhalten von", "Zurück"], s.zeitraum.map((u) => [h(u.nummer), `${dat(u.ausgabe_zeit)}<br><small>${h(liste(u))}</small>`, `<b>${h(u.empfaenger_name)}</b>${u.empfaenger_firma ? `<br><small>${h(u.empfaenger_firma)}</small>` : ""}`, u.rueckgabe_zeit ? `${dat(u.rueckgabe_zeit)} ${h(u.rueckgabe_zeit.slice(11, 16))}` : marke("noch aus", "gelb")]), "Im Zeitraum keine Übergaben.")}`));
  }
  if (d.dokumente) {
    teile.push(abschnitt("Dokumente", tabelle(["Datum", "Titel", "Kategorie"], d.dokumente.map((x) => [dat(x.hochgeladen_am), `<b>${h(x.titel)}</b><br><small>${h(x.dateiname)}</small>`, h(x.kategorie)]), "Im Zeitraum keine Dokumente abgelegt.")));
  }

  const adresse = [o.strasse, [o.plz, o.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const bild = o.bild ? `${location.origin}/api/objekte/${o.id}/bild?v=${encodeURIComponent(o.bild)}` : "";
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${h(e.titel)} ${h(o.kuerzel || "")} ${dat(d.von)} bis ${dat(d.bis)}</title><style>
    @font-face { font-family: Carlito; src: url("${location.origin}/schrift/Carlito-Regular.ttf"); }
    @font-face { font-family: Carlito; src: url("${location.origin}/schrift/Carlito-Bold.ttf"); font-weight: 700; }
    @page { size: A4; margin: 16mm 14mm 18mm; @bottom-right { content: "Seite " counter(page) " von " counter(pages); font: 8pt Carlito, Calibri, sans-serif; color: #939598; } @bottom-left { content: "Casa Concept Consulting GmbH & Co. KG · ${h(e.titel)} ${h(o.kuerzel || o.name)}"; font: 8pt Carlito, Calibri, sans-serif; color: #939598; } }
    @page :first { @bottom-left { content: none; } @bottom-right { content: none; } }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: Calibri, Carlito, sans-serif; color: #3C3C3B; font-size: 10pt; margin: 0; line-height: 1.35; }
    .deckblatt { height: 255mm; display: flex; flex-direction: column; break-after: page; }
    .deckblatt .logo { width: 62mm; align-self: flex-end; }
    .deckblatt .bild { margin-top: 12mm; height: 105mm; border-radius: 3mm; overflow: hidden; background: #F1F2F2; }
    .deckblatt .bild img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .deckblatt .bild.ohne { background: linear-gradient(135deg, #FBEEE5, #FFFFFF 70%); display: flex; align-items: center; justify-content: center; gap: 12mm; }
    .deckblatt .bild.ohne svg { width: 70mm; } .deckblatt .bild.ohne div { display: flex; flex-direction: column; gap: 1.5mm; font-size: 11pt; color: #626366; }
    .deckblatt .bild.ohne b { font-size: 15pt; color: #3C3C3B; }
    .deckblatt .titel { margin-top: auto; border-left: 2.2mm solid #E63713; padding-left: 7mm; }
    .deckblatt .k { font-size: 10pt; letter-spacing: .16em; color: #E63713; font-weight: 700; text-transform: uppercase; }
    .deckblatt h1 { font-size: 34pt; margin: 2mm 0 1mm; line-height: 1.05; }
    .deckblatt .ob { font-size: 16pt; font-weight: 700; } .deckblatt .ad { font-size: 12pt; color: #626366; }
    .deckblatt .zr { margin-top: 6mm; display: flex; gap: 10mm; font-size: 10.5pt; }
    .deckblatt .zr small { display: block; color: #939598; font-size: 8pt; text-transform: uppercase; letter-spacing: .08em; }
    .deckblatt .inhalt { margin-top: 9mm; columns: 2; column-gap: 10mm; font-size: 10pt; color: #626366; }
    .deckblatt .inhalt div { break-inside: avoid; padding: 1mm 0; border-bottom: .2mm solid #E6E7E8; }
    .deckblatt .inhalt b { color: #E63713; margin-right: 3mm; }
    section { margin-bottom: 8mm; }
    h2 { font-size: 16pt; margin: 0 0 4mm; padding-bottom: 2mm; border-bottom: .5mm solid #E63713; display: flex; gap: 4mm; align-items: baseline; break-after: avoid; }
    h2 span { color: #E63713; font-size: 12pt; }
    h3 { font-size: 11pt; margin: 5mm 0 2mm; break-after: avoid; } h3 small { font-weight: 400; color: #939598; }
    .kacheln { display: grid; grid-template-columns: repeat(auto-fit, minmax(38mm, 1fr)); gap: 3mm; break-inside: avoid; }
    .kachel { background: #F5F5F5; border-radius: 2.5mm; padding: 3.5mm 4mm; border-top: 1.2mm solid #BCBEC0; }
    .kachel b { display: block; font-size: 19pt; line-height: 1.1; } .kachel span { font-size: 8.5pt; color: #626366; }
    .kachel.orange { border-top-color: #E63713; } .kachel.rot { border-top-color: #B42318; } .kachel.rot b { color: #B42318; }
    .kachel.gruen { border-top-color: #6E9E3C; } .kachel.gelb { border-top-color: #E8A33D; }
    table { width: 100%; border-collapse: collapse; font-size: 9pt; }
    thead { display: table-header-group; } tr { break-inside: avoid; }
    th { background: #3C3C3B; color: #fff; text-align: left; padding: 1.8mm 2.5mm; font-weight: 700; font-size: 8.5pt; }
    td { padding: 1.8mm 2.5mm; border-bottom: .2mm solid #E6E7E8; vertical-align: top; }
    tbody tr:nth-child(even) td { background: #FAFAFA; }
    small, .klein { color: #8A8C8F; font-size: 8pt; }
    .leer { color: #939598; font-style: italic; }
    .m { display: inline-block; padding: .3mm 2mm; border-radius: 3mm; font-size: 7.8pt; font-weight: 700; white-space: nowrap; }
    .m.rot { background: #FBE4E1; color: #B42318; } .m.gelb { background: #FDF0D5; color: #8A5A00; } .m.gruen { background: #E6F0DA; color: #3E6A16; } .m.grau { background: #EEE; color: #555; }
    .zwei { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; break-inside: avoid; }
    .vert { display: grid; gap: 1.6mm; } .vz { display: grid; grid-template-columns: 38mm 1fr 10mm; gap: 2mm; align-items: center; font-size: 9pt; }
    .vb { background: #F1F2F2; height: 3.2mm; border-radius: 1.6mm; overflow: hidden; } .vb div { height: 100%; background: #E63713; border-radius: 1.6mm; }
    .vz b { text-align: right; }
    .balken { display: flex; gap: 1.5mm; align-items: flex-end; height: 42mm; margin: 2mm 0 4mm; break-inside: avoid; }
    .b { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; min-width: 0; }
    .bw { flex: 1; width: 100%; display: flex; align-items: flex-end; } .bs { width: 100%; background: #E63713; border-radius: 1mm 1mm 0 0; min-height: .4mm; }
    .bz { font-size: 7.5pt; font-weight: 700; margin-top: 1mm; white-space: nowrap; } .bl { font-size: 7.2pt; color: #8A8C8F; white-space: nowrap; }
    .anm { margin-top: 5mm; background: #FBEEE5; border-left: 1.2mm solid #E63713; padding: 3mm 4mm; }
    .zaehler { break-inside: avoid; margin-bottom: 4mm; }
    h4 { font-size: 9.5pt; margin: 4mm 0 1.5mm; break-after: avoid; } h4 small { font-weight: 400; }
    .rg { margin: 0 0 7mm; padding-top: 1mm; } .rg > h3 { border-left: 1.2mm solid #E63713; padding-left: 3mm; margin-top: 6mm; }
    .rgz { margin: 0 0 2.5mm; font-size: 9pt; color: #626366; } .rgz b { color: #3C3C3B; }
    table.cpt th.cps, table.cpt td.cps { text-align: center; padding-left: 1mm; padding-right: 1mm; }
    table.cpt th.cps { font-size: 7.6pt; line-height: 1.15; font-weight: 700; overflow-wrap: anywhere; }
    .cpj, .cpf, .cpn { display: inline-block; min-width: 11mm; padding: .3mm 1.6mm; border-radius: 3mm; font-size: 8pt; font-weight: 700; white-space: nowrap; }
    .cpj { background: #E6F0DA; color: #3E6A16; } .cpf { background: #FBE4E1; color: #B42318; } .cpn { color: #BCBEC0; }
    .cpl { display: flex; flex-wrap: wrap; gap: 1mm; }
    .rgd { margin-bottom: 4mm; } .rgd h4 { margin-top: 3mm; }
    .nw, table.rgt td:first-child { white-space: nowrap; }
    table.rgp { font-size: 8.5pt; } table.rgp th { background: #626366; }
    table.rgp tr.g { break-after: avoid; } table.rgp tr.g td { background: #FBEEE5; color: #B82C0F; font-weight: 700; } table.rgp tr.g small { color: #B82C0F; font-weight: 400; }
    table.rgp tr.a td { background: #FBE4E1; }
    .stand { margin-top: 10mm; font-size: 8pt; color: #939598; }
  </style></head><body>
    <div class="deckblatt">
      <img class="logo" src="${location.origin}/logo.png" alt="Casa Concept Consulting">
      ${bild ? `<div class="bild"><img src="${bild}" alt=""></div>` : `<div class="bild ohne"><svg viewBox="0 0 200 120" aria-hidden="true"><path d="M30 110V52L80 18l50 34v58" fill="none" stroke="#E63713" stroke-width="5" stroke-linejoin="round"/><path d="M95 110V70h22v40M48 66h18v16H48z" fill="none" stroke="#E63713" stroke-width="3" opacity=".55"/><path d="M8 112h184" stroke="#E63713" stroke-width="3" opacity=".35"/></svg><div><b>${h(o.nutzung || "Objekt")}</b>${o.flaeche_m2 ? `<span>${zahl(o.flaeche_m2)} m²</span>` : ""}${o.baujahr ? `<span>Baujahr ${h(o.baujahr)}</span>` : ""}</div></div>`}
      <div class="titel"><div class="k">${h(e.titel)}</div><h1>${h(o.name)}</h1>
        <div class="ob">${h(o.kuerzel || "")}</div><div class="ad">${h(adresse)}</div>
        <div class="zr"><div><small>Berichtszeitraum</small>${dat(d.von)} bis ${dat(d.bis)}</div><div><small>Stand</small>${dat(d.erstellt)}</div>${o.objektleiter ? `<div><small>Objektleitung</small>${h(o.objektleiter)}</div>` : ""}${o.eigentuemer ? `<div><small>Auftraggeber</small>${h(o.eigentuemer)}</div>` : ""}</div>
        <div class="inhalt">${BERICHT_TEILE.filter(([k]) => d.teile.includes(k)).map(([, t], i) => `<div><b>${String(i + 1).padStart(2, "0")}</b>${h(t)}</div>`).join("")}</div>
      </div>
    </div>
    ${teile.join("")}
    <p class="stand">Erstellt am ${dat(d.erstellt)} um ${h(d.erstellt.slice(11, 16))} Uhr von ${h(S.ich.name)}. Grundlage sind die Einträge in Casa CAFM zum Zeitpunkt der Erstellung.</p>
    <script>window.onload = () => setTimeout(() => print(), 500);<\/script></body></html>`;
  const f = window.open("", "_blank");
  if (!f) { melde("Das Berichtsfenster wurde blockiert. Bitte Pop-ups für diese Seite erlauben.", true); return; }
  f.document.open(); f.document.write(html); f.document.close();
}
