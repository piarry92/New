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
  let modus = "3d", lauf = null;
  const kam = { dreh: -0.62, neig: 0.5, zoom: 1 };                 // Blickwinkel der 3D-Ansicht, bleibt beim Wechseln erhalten
  try { if (localStorage.getItem("cafm-schema-modus") === "flach") modus = "flach"; } catch (e) { /* egal */ }
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
        <div class="sch-modus"><div class="g3-geb"><button type="button" data-modus="3d" class="${modus === "3d" ? "an" : ""}">3D-Ansicht</button><button type="button" data-modus="flach" class="${modus === "flach" ? "an" : ""}">Schema</button></div>
          ${modus === "3d" ? "<span>Ziehen dreht die Anlage, das Mausrad ändert die Größe. Ein Klick auf ein Gerät zeigt seine Daten.</span>" : ""}</div>
        <div class="sch-rahmen">${modus === "3d" ? '<canvas class="sch-3d" id="sch3d"></canvas>' : bild(sch)}</div></div>
      <div class="g3-rechts">${seite(sch, eintrag)}</div></div>`;
    if (lauf) { lauf.stop(); lauf = null; }
    if (modus === "3d") lauf = schema3d(el.querySelector("#sch3d"), sch, kam, anlageVon, () => wahl, (id) => {
      wahl = wahl === id ? null : id;
      el.querySelector(".g3-rechts").innerHTML = seite(sch, eintrag);
    });
  };

  el.addEventListener("click", async (e) => {
    const kn = e.target.closest("[data-knoten]"), sc = e.target.closest("[data-sch]"), id = e.target.closest("[data-sch-id]");
    if (kn) { wahl = wahl === kn.dataset.knoten ? null : kn.dataset.knoten; zeichnen(); return; }
    if (id) { akt = Number(id.dataset.schId); wahl = null; zeichnen(); return; }
    const mo = e.target.closest("[data-modus]");
    if (mo) { modus = mo.dataset.modus; try { localStorage.setItem("cafm-schema-modus", modus); } catch (x) { /* egal */ } zeichnen(); return; }
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

/* 3D-Ansicht eines Schemas: Die Bereiche (Dach, Zentrale …) werden zu Ebenen übereinander, die Geräte zu Körpern,
   die Leitungen zu Rohren, die zwischen den Ebenen senkrecht laufen. Gezeichnet wird ohne Zusatzprogramm auf einer Zeichenfläche.
   Es ist eine Prinzip-Ansicht aus dem Schema, kein vermessenes Modell des Gebäudes. */
function schema3d(canvas, sch, kam, anlageVon, wahlHolen, wahlSetzen) {
  const AMPEL = { rot: "#ff4d6d", gelb: "#ffd23f", gruen: "#2ee6a8" }, ETAGE = 250, TIEFE = 0.85;
  const B = sch.breite || 1600;
  /* Ebenen: die Bereiche, die gleich breit übereinander stehen (die größte solche Gruppe) */
  const gruppen = {};
  for (const z of sch.zonen || []) (gruppen[`${z.x}|${z.b}`] = gruppen[`${z.x}|${z.b}`] || []).push(z);
  let ebenen = Object.values(gruppen).sort((a, b) => b.length - a.length || b[0].b - a[0].b)[0] || [];
  ebenen = [...ebenen].sort((a, b) => a.y - b.y);
  if (!ebenen.length) ebenen = [{ titel: "", x: 0, y: 0, b: B, h: sch.hoehe || 900 }];
  let start = 0;
  const E = ebenen.map((z, i) => { const r = i % 2 ? -1 : 1, e = { z, hoehe: (ebenen.length - 1 - i) * ETAGE, von: start, richt: r, bis: start + r * z.h * TIEFE }; start = e.bis; return e; });
  const tMin = Math.min(...E.map((e) => Math.min(e.von, e.bis))), tMax = Math.max(...E.map((e) => Math.max(e.von, e.bis)));
  const hMitte = (E[0].hoehe + E[E.length - 1].hoehe) / 2, tMitte = (tMin + tMax) / 2;
  const grenzen = E.flatMap((e) => [e.z.y, e.z.y + e.z.h]);
  /* Punkt im Schema (x, y) -> Punkt im Raum (x, Höhe, Tiefe) */
  const raum = (x, y) => {
    let h, t;
    if (y <= E[0].z.y) { h = E[0].hoehe; t = E[0].von; }
    else if (y >= E[E.length - 1].z.y + E[E.length - 1].z.h) { h = E[E.length - 1].hoehe; t = E[E.length - 1].bis; }
    else for (let i = 0; i < E.length; i++) {
      const e = E[i], u = e.z.y + e.z.h;
      if (y >= e.z.y && y <= u) { h = e.hoehe; t = e.von + e.richt * (y - e.z.y) * TIEFE; break; }
      const n = E[i + 1];
      if (n && y > u && y < n.z.y) { h = e.hoehe + (n.hoehe - e.hoehe) * (y - u) / (n.z.y - u); t = e.bis; break; }
    }
    return [x - B / 2, h - hMitte, t - tMitte];
  };
  const MASS = { kaeltemaschine: [130, 54, 60], kuehlturm: [84, 96, 84], waermetauscher: [40, 70, 64], druckhaltung: [42, 84, 42], wasser: [54, 60, 54], verbraucher: [110, 36, 70], kessel: [70, 84, 70], pumpe: [26, 26, 26] };
  const geraete = sch.knoten.map((n) => { const [x, h, t] = raum(n.x, n.y), m = MASS[n.typ] || MASS.verbraucher; return { n, x, h, t, m }; });
  /* Rohre: an den Kanten der Bereiche teilen (dort knickt die Leitung nach unten), lange Stücke für das Sortieren kürzen */
  const rohre = [];
  for (const l of sch.leitungen || []) {
    const farbe = (SCH_MEDIEN[l.medium] || SCH_MEDIEN.sonst)[0];
    for (let i = 1; i < l.punkte.length; i++) {
      const [x0, y0] = l.punkte[i - 1], [x1, y1] = l.punkte[i];
      const schnitte = [0, 1, ...grenzen.filter((g) => (g - y0) * (g - y1) < 0).map((g) => (g - y0) / (y1 - y0))].sort((a, b) => a - b);
      for (let j = 1; j < schnitte.length; j++) {
        const a = schnitte[j - 1], b = schnitte[j], lang = Math.hypot((x1 - x0) * (b - a), (y1 - y0) * (b - a)), teile = Math.max(1, Math.ceil(lang / 70));
        for (let q = 0; q < teile; q++) {
          const u = a + (b - a) * q / teile, v = a + (b - a) * (q + 1) / teile;
          const p = raum(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u), r = raum(x0 + (x1 - x0) * v, y0 + (y1 - y0) * v);
          p[1] += 16; r[1] += 16;
          rohre.push({ p, r, farbe, gegen: !!l.gegen });
        }
      }
    }
  }
  const platten = E.map((e) => { const x0 = e.z.x - B / 2 - 10, x1 = e.z.x + e.z.b - B / 2 + 10, a = Math.min(e.von, e.bis) - tMitte - 10, b = Math.max(e.von, e.bis) - tMitte + 10, h = e.hoehe - hMitte;
    return { titel: e.z.titel, ecken: [[x0, h, a], [x1, h, a], [x1, h, b], [x0, h, b]] }; });

  const ctx = canvas.getContext("2d");
  let breit = 0, hoch = 0, dpr = 1, treffer = [], an = true, takt = 0, zug = null, bewegt = false;
  const ruhig = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const groesse = () => { dpr = Math.min(2, devicePixelRatio || 1); breit = canvas.clientWidth; hoch = canvas.clientHeight; canvas.width = breit * dpr; canvas.height = hoch * dpr; };
  const zeichne = () => {
    if (!breit) groesse();
    const cd = Math.cos(kam.dreh), sd = Math.sin(kam.dreh), cn = Math.cos(kam.neig), sn = Math.sin(kam.neig), mass = Math.min(breit / 1750, hoch / 1150) * kam.zoom, FERN = 3200;
    const pr = ([x, h, t]) => { const x1 = x * cd - t * sd, t1 = x * sd + t * cd, y2 = h * cn - t1 * sn, t2 = h * sn + t1 * cn, k = FERN / (FERN + t2); return [breit / 2 + x1 * mass * k, hoch * 0.52 - y2 * mass * k, t2, mass * k]; };
    const teile = [];
    for (const p of platten) { const e = p.ecken.map(pr); teile.push({ art: "platte", e, tiefe: Math.max(...e.map((q) => q[2])) + 400, titel: p.titel }); }
    for (const r of rohre) { const a = pr(r.p), b = pr(r.r); teile.push({ art: "rohr", a, b, r, tiefe: (a[2] + b[2]) / 2 }); }
    treffer = [];
    for (const g of geraete) {
      const [bx, bh, bt] = g.m, schmal = g.n.typ === "kuehlturm" ? 0.72 : 1, ecken = [];
      for (const oben of [0, 1]) for (const [fx, ft] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const f = oben ? schmal : 1; ecken.push(pr([g.x + fx * bx / 2 * f, g.h + (oben ? bh : 0), g.t + ft * bt / 2 * f])); }
      const m = pr([g.x, g.h + bh / 2, g.t]), kopf = pr([g.x, g.h + bh + 10, g.t]);
      teile.push({ art: "geraet", g, ecken, m, kopf, tiefe: m[2] });
      treffer.push({ id: g.n.id, x: m[0], y: m[1], r: Math.max(16, Math.max(bx, bh) * m[3] * 0.6) });
    }
    teile.sort((a, b) => b.tiefe - a.tiefe);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, breit, hoch); ctx.lineJoin = ctx.lineCap = "round";
    const gewaehlt = wahlHolen(), FLAECHEN = [[0, 1, 2, 3, 0.55], [4, 5, 6, 7, 1], [0, 1, 5, 4, 0.8], [1, 2, 6, 5, 0.66], [2, 3, 7, 6, 0.8], [3, 0, 4, 7, 0.66]];
    for (const t of teile) {
      if (t.art === "platte") {
        ctx.beginPath(); t.e.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath();
        ctx.fillStyle = "rgba(120,160,255,.10)"; ctx.fill(); ctx.strokeStyle = "rgba(160,190,255,.45)"; ctx.lineWidth = 1.2; ctx.setLineDash([]); ctx.stroke();
      } else if (t.art === "rohr") {
        const w = Math.max(2, 9 * (t.a[3] + t.b[3]) / 2);
        ctx.setLineDash([]); ctx.shadowColor = t.r.farbe; ctx.shadowBlur = 8; ctx.strokeStyle = t.r.farbe; ctx.lineWidth = w;
        ctx.beginPath(); ctx.moveTo(t.a[0], t.a[1]); ctx.lineTo(t.b[0], t.b[1]); ctx.stroke(); ctx.shadowBlur = 0;
        ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = Math.max(1, w * 0.22);
        ctx.beginPath(); ctx.moveTo(t.a[0] - w * 0.18, t.a[1] - w * 0.18); ctx.lineTo(t.b[0] - w * 0.18, t.b[1] - w * 0.18); ctx.stroke();
      } else {
        const a = anlageVon(t.g.n), rand = gewaehlt === t.g.n.id ? "#ffffff" : a ? AMPEL[a.ampel] || AMPEL.gruen : "rgba(20,36,92,.9)";
        const fl = FLAECHEN.map((f) => ({ f, tiefe: (t.ecken[f[0]][2] + t.ecken[f[1]][2] + t.ecken[f[2]][2] + t.ecken[f[3]][2]) / 4 })).sort((x, y) => y.tiefe - x.tiefe);
        ctx.setLineDash([]);
        if (a || gewaehlt === t.g.n.id) { ctx.shadowColor = rand; ctx.shadowBlur = 18; }
        for (const { f } of fl) {
          const hell = Math.round(150 + 90 * f[4]);
          ctx.beginPath(); for (let i = 0; i < 4; i++) { const q = t.ecken[f[i]]; if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); } ctx.closePath();
          ctx.fillStyle = t.g.n.typ === "pumpe" ? `rgb(${hell - 40},${hell - 10},${hell + 10})` : `rgb(${hell - 22},${hell - 12},${Math.min(255, hell + 14)})`; ctx.fill();
          ctx.strokeStyle = rand; ctx.lineWidth = gewaehlt === t.g.n.id ? 2.4 : a ? 1.8 : 1; ctx.stroke();
        }
        ctx.shadowBlur = 0;
      }
    }
    /* Beschriftung zuletzt, damit sie immer lesbar bleibt */
    ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    for (const t of teile) {
      if (t.art !== "geraet" || t.g.n.typ === "pumpe") continue;
      const gr = Math.max(9.5, Math.min(13, 15 * t.kopf[3] / Math.max(0.35, Math.min(breit / 1750, hoch / 1150))));
      ctx.font = `700 ${gr}px Carlito, Calibri, system-ui, sans-serif`;
      const text = t.g.n.titel, w = ctx.measureText(text).width + 12;
      ctx.fillStyle = gewaehlt === t.g.n.id ? "rgba(255,255,255,.95)" : "rgba(11,22,64,.78)"; ctx.beginPath(); ctx.roundRect(t.kopf[0] - w / 2, t.kopf[1] - gr - 7, w, gr + 6, 6); ctx.fill();
      ctx.fillStyle = gewaehlt === t.g.n.id ? "#0b1640" : "#fff"; ctx.fillText(text, t.kopf[0], t.kopf[1] - 3);
    }
    ctx.textAlign = "left"; ctx.font = "700 12px Carlito, Calibri, system-ui, sans-serif"; ctx.fillStyle = "#9fb6ee";
    for (const t of teile) if (t.art === "platte" && t.titel) { const q = t.e.reduce((m, x) => (x[0] < m[0] ? x : m)); ctx.fillText(t.titel.toUpperCase(), Math.max(6, q[0] - 4), q[1] - 6); }
  };
  const schleife = () => { if (!an || !canvas.isConnected) { an = false; return; } zeichne(); if (zug) requestAnimationFrame(schleife); };
  const neu = () => { if (an) requestAnimationFrame(zeichne); };
  canvas.addEventListener("pointerdown", (e) => { zug = { x: e.clientX, y: e.clientY, d: kam.dreh, n: kam.neig }; bewegt = false; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", (e) => {
    if (!zug) return;
    const dx = e.clientX - zug.x, dy = e.clientY - zug.y;
    if (Math.abs(dx) + Math.abs(dy) > 5) bewegt = true;
    if (!bewegt) return;
    kam.dreh = zug.d + dx * 0.008; kam.neig = Math.max(0.08, Math.min(1.35, zug.n + dy * 0.006)); neu();
  });
  canvas.addEventListener("pointerup", (e) => {
    const war = zug; zug = null;
    if (!war || bewegt) return;
    const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    const nah = treffer.map((t) => ({ t, d: Math.hypot(t.x - x, t.y - y) })).filter((q) => q.d <= q.t.r).sort((a, b) => a.d - b.d)[0];
    if (nah) { wahlSetzen(nah.t.id); neu(); }
  });
  canvas.addEventListener("wheel", (e) => { e.preventDefault(); kam.zoom = Math.max(0.5, Math.min(3, kam.zoom * (e.deltaY < 0 ? 1.09 : 0.92))); neu(); }, { passive: false });
  const beiGroesse = () => { if (canvas.isConnected) { groesse(); neu(); } };
  window.addEventListener("resize", beiGroesse);
  groesse(); zeichne(); void takt; void ruhig; void schleife;
  return { stop: () => { an = false; window.removeEventListener("resize", beiGroesse); }, neu };
}
