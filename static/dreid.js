/* Casa CAFM – 3D-Ansicht unter Standorte & Pläne: die Etagen eines Gebäudes als gestapelte Ebenen mit Grundriss,
   Anlagen als Punkte in der Farbe ihres Zustands, links Kennzahlen, rechts die Etagenliste (Leitstand-Ansicht) */
"use strict";

function dreidZeichnen(ziel, k) {
  const { d, geb, zellen, gebName, objektId } = k;
  const FARBE = { rot: "#ff4d6d", gelb: "#ffd23f", ok: "#2ee6a8", leer: "#8fa3c8" };
  const AMPEL = { rot: "#ff4d6d", gelb: "#ffd23f", gruen: "#2ee6a8" };
  let g = geb.includes(k.start) ? k.start : geb[0], wahl = null, drehung = -38, neigung = 60, zoom = 0.74, abstand = 100;
  try { const s = JSON.parse(localStorage.getItem("cafm-3d") || "{}"); if (geb.includes(s.g)) g = s.g; if (s.abstand) abstand = s.abstand; } catch (e) { /* egal */ }
  const merken = () => { try { localStorage.setItem("cafm-3d", JSON.stringify({ g, abstand })); } catch (e) { /* egal */ } };
  const ebenen = () => [...zellen.values()].filter((z) => z.g === g).sort((a, b) => guRang(a.e) - guRang(b.e) || a.e.localeCompare(b.e, "de", { numeric: true }));
  const name = (z) => z.e || "Ohne Etage";

  /* Kennzahlen links: gelten für das ganze Objekt */
  const links = () => {
    const a = d.anlagen, rot = a.filter((x) => x.ampel === "rot").length, gelb = a.filter((x) => x.ampel === "gelb").length, ok = a.length - rot - gelb;
    const quote = a.length ? Math.round(ok / a.length * 100) : 100, stoer = a.reduce((s, x) => s + (x.tickets_offen || 0), 0);
    const ueber = a.filter((x) => x.naechste && x.naechste < d.heute).length, bald = a.filter((x) => x.naechste && x.naechste >= d.heute && (new Date(x.naechste) - new Date(d.heute)) / 864e5 <= 30).length;
    const gew = Object.entries(a.reduce((m, x) => { const n = x.gewerk || "Ohne Gewerk"; m[n] = m[n] || { n: 0, auf: 0 }; m[n].n++; if (x.ampel !== "gruen") m[n].auf++; return m; }, {})).sort((x, y) => y[1].n - x[1].n).slice(0, 6);
    const max = Math.max(1, ...gew.map((x) => x[1].n));
    return `<div class="g3-karte"><h4>Zustand</h4>
        <div class="g3-ring" style="--p:${quote}"><b>${quote}<small>%</small></b><span>in Ordnung</span></div>
        <div class="g3-zahlen"><div><b>${a.length}</b>Anlagen</div><div><b style="color:${AMPEL.rot}">${rot}</b>überfällig, Störung</div><div><b style="color:${AMPEL.gelb}">${gelb}</b>bald fällig</div></div></div>
      <div class="g3-karte"><h4>Wartung und Störungen</h4>
        <div class="g3-kreise"><div style="--c:${AMPEL.rot}"><b>${ueber}</b>überfällig</div><div style="--c:${AMPEL.gelb}"><b>${bald}</b>in 30 Tagen</div><div style="--c:#6aa8ff"><b>${stoer}</b>Störungen offen</div></div></div>
      <div class="g3-karte"><h4>Nach Gewerk</h4>${gew.map(([n, w]) => `<div class="g3-bal"><span>${esc(n)}</span><i><u style="width:${w.n / max * 100}%"></u></i><b>${w.n}</b>${w.auf ? `<em>${w.auf}</em>` : ""}</div>`).join("") || '<p class="g3-leer">Noch keine Anlagen.</p>'}</div>`;
  };

  /* Etagenliste rechts, von oben nach unten wie im Haus */
  const rechts = () => {
    const liste = ebenen().reverse(), z = wahl && zellen.get(wahl);
    const auswahl = z ? `<div class="g3-wahl"><b>${esc(name(z))}</b><small>${z.anlagen.length} ${z.anlagen.length === 1 ? "Anlage" : "Anlagen"}${z.auff.length ? ` · ${z.auff.length} auffällig` : ""}</small>
        ${z.auff.slice(0, 4).map((a) => `<button type="button" data-anl="${a.id}" style="--c:${AMPEL[a.ampel]}"><b>${esc(a.bezeichnung)}</b><span>${esc(guGrund(a, d.heute))}</span></button>`).join("")}
        <div class="g3-kn">${z.plaene.map((p, i) => `<a class="knopf haupt-k" href="#/plaene/${p.id}">${z.plaene.length > 1 ? esc(guTeil(p, i, true)) : "Plan öffnen"} →</a>`).join("")}<button type="button" class="knopf" data-g3="alle">Alle Etagen</button></div></div>` : "";
    return `${auswahl}<div class="g3-karte"><h4>Etagen ${geb.length > 1 || g ? "· " + esc(gebName(g)) : ""}</h4>
      <div class="g3-liste">${liste.map((x) => `<button type="button" data-ebene="${esc(x.k)}" class="${wahl === x.k ? "an" : ""}"><i style="background:${FARBE[x.zustand]}"></i><span>${esc(name(x))}</span><b>${x.anlagen.length}</b></button>`).join("")}</div></div>`;
  };

  /* Bühne: jede Etage eine Ebene im Raum, darauf die Grundrisse (Teilpläne nebeneinander) und die Anlagen */
  const buehne = () => {
    const liste = ebenen(), n = liste.length;
    return `<div class="g3-welt" id="g3Welt">${liste.map((z, i) => {
      const hoch = 300, teile = z.plaene.map((p) => ({ p, b: Math.max(160, Math.min(760, hoch * ((p.breite || 4) / (p.hoehe || 3)))) }));
      const breit = teile.reduce((s, t) => s + t.b, 0) + (teile.length - 1) * 14;
      return `<div class="g3-ebene z-${z.zustand} ${wahl === z.k ? "an" : wahl ? "blass" : ""}" data-ebene="${esc(z.k)}" data-i="${i - (n - 1) / 2}" style="--c:${FARBE[z.zustand]};width:${breit}px;height:${hoch}px;margin:${-hoch / 2}px 0 0 ${-breit / 2}px">
        ${teile.map((t) => `<div class="g3-plan" style="width:${t.b}px"><img src="/api/plaene/${t.p.id}/bild" alt="" draggable="false" onerror="this.remove()"></div>`).join("")}
        ${teile.map((t, nr) => { const links = teile.slice(0, nr).reduce((s, x) => s + x.b + 14, 0);      // Anlagen stehen als Fähnchen auf dem Plan
          return t.p.anlagen.filter((a) => a.plan_x != null && a.plan_y != null).map((a) => `<span class="g3-fuss" style="left:${links + a.plan_x * t.b}px;top:${a.plan_y * hoch}px;--c:${AMPEL[a.ampel] || AMPEL.gruen}">
            <i class="g3-pin" data-anl="${a.id}" title="${esc(a.bezeichnung)}"><b>${symbolVon(a, 26)}</b></i></span>`).join(""); }).join("")}</div>`; }).join("")}</div>
      <div class="g3-schilder" id="g3Schilder">${liste.map((z) => `<button type="button" data-ebene="${esc(z.k)}" class="${wahl === z.k ? "an" : ""}" style="--c:${FARBE[z.zustand]}">${esc(name(z))}${z.auff.length ? `<em>${z.auff.length}</em>` : ""}</button>`).join("")}</div>`;
  };

  const el = document.createElement("div");
  el.className = "g3";
  ziel.replaceChildren(el);
  let mitteJetzt = 0, zoomVor = null, nachlauf = 0;
  const stellen = (mitteFest) => {
    const welt = el.querySelector("#g3Welt");
    if (!welt) return;
    welt.style.transform = `scale(${zoom}) rotateX(${neigung}deg) rotateZ(${drehung}deg)`;
    welt.style.setProperty("--gegen", `${-drehung}deg`);          // die Fähnchen drehen sich zum Betrachter
    const gew = wahl && [...welt.children].find((x) => x.dataset.ebene === wahl);
    const mitte = mitteFest != null ? mitteFest : gew ? Number(gew.dataset.i) : 0;      // die gewählte Etage rückt in die Mitte: Größer und kleiner wirkt dann auf sie
    mitteJetzt = mitte;
    welt.querySelectorAll(".g3-ebene").forEach((e) => { e.style.transform = `translateZ(${(Number(e.dataset.i) - mitte) * abstand}px)`; });
    const rahmen = el.querySelector(".g3-buehne").getBoundingClientRect();
    el.querySelectorAll("#g3Schilder button").forEach((s) => {
      const e = [...welt.children].find((x) => x.dataset.ebene === s.dataset.ebene);
      if (!e) return;
      const r = e.getBoundingClientRect();
      s.style.left = `${Math.max(6, r.left - rahmen.left - s.offsetWidth - 10)}px`;
      s.style.top = `${(r.top + r.bottom) / 2 - rahmen.top - s.offsetHeight / 2}px`;
    });
  };
  const zeichnen = () => {
    const mitteAlt = mitteJetzt;
    el.innerHTML = `<div class="g3-links">${links()}</div>
      <div class="g3-mitte">
        <div class="g3-kopf"><div class="g3-ort">${icon("objekte")} <b>${esc(k.o.kuerzel || k.o.name)}</b> ${wahl ? "› " + esc(name(zellen.get(wahl))) : ""}</div>
          ${geb.length > 1 ? `<div class="g3-geb">${geb.map((x) => `<button type="button" data-geb="${esc(x)}" class="${x === g ? "an" : ""}">${esc(gebName(x))}</button>`).join("")}</div>` : ""}</div>
        <div class="g3-buehne">${buehne()}<div class="g3-info" id="g3Info" hidden></div></div>
        <div class="g3-regler"><label>Abstand <input type="range" id="g3Abstand" min="14" max="170" value="${abstand}"></label><label>Größe <input type="range" id="g3Zoom" min="40" max="220" value="${Math.round(zoom * 100)}"></label>
          <span>Ziehen dreht das Gebäude. Ein Klick auf eine Etage wählt sie aus, ein Klick auf ein Symbol zeigt die Anlage.</span></div>
      </div>
      <div class="g3-rechts">${rechts()}</div>`;
    stellen(mitteAlt);                                     // erst der alte Stand, dann gleitet die gewählte Etage in die Mitte
    requestAnimationFrame(() => { stellen(); clearTimeout(nachlauf); nachlauf = setTimeout(() => { if (el.isConnected) stellen(); }, 420); });
    el.querySelectorAll(".g3-plan img").forEach((b) => b.addEventListener("load", stellen, { once: true }));
  };

  /* Karte zur Anlage, wie im Leitstand: Zustand, nächster Termin, letzte Einträge */
  const info = async (id) => {
    const a = d.anlagen.find((x) => x.id === Number(id)), box = el.querySelector("#g3Info");
    if (!a || !box) return;
    const kopf = `<button type="button" class="g3-x" data-g3="zu" aria-label="Schließen">×</button>
      <div class="g3-ik"><span class="g3-sym">${symbolVon(a, 44)}</span><div><small>${esc([a.nummer, a.gewerk].filter(Boolean).join(" · "))}</small><b>${esc(a.bezeichnung)}</b><span style="color:${AMPEL[a.ampel]}">${a.ampel === "gruen" ? "in Ordnung" : esc(guGrund(a, d.heute) || "auffällig")}</span></div></div>
      <div class="g3-iz"><div><small>Zustand</small><b>${esc(a.status || "In Betrieb")}</b></div><div><small>Nächster Termin</small><b>${a.naechste ? datum(a.naechste) : "keiner"}</b></div><div><small>Störungen offen</small><b>${a.tickets_offen || 0}</b></div></div>`;
    box.hidden = false;
    box.innerHTML = `${kopf}<p class="g3-leer">Verlauf wird geladen …</p>`;
    let verlauf = [];
    try { verlauf = await api("GET", `anlagen/${a.id}/aktivitaet`); } catch (e) { /* ohne Verlauf */ }
    const text = { erledigt: "Erledigt", meldung: "Störmeldung", aufgabe: "Aufgabe angelegt", foto: "Foto", dokument: "Dokument" };
    const zeilen = verlauf.filter((v) => v.typ !== "anlage").sort((x, y) => String(y.zeit).localeCompare(String(x.zeit))).slice(0, 4);
    box.innerHTML = `${kopf}<div class="g3-iv"><small>Verlauf</small>${zeilen.map((v) => `<div><span>${datum(v.zeit)}</span><b>${esc(text[v.art] || v.art)}</b><i>${esc(v.info || "")}</i></div>`).join("") || '<p class="g3-leer">Noch keine Einträge.</p>'}</div>
      <div class="g3-kn"><a class="knopf haupt-k" href="#/anlagen/${a.id}">Akte öffnen →</a>${a.plan_id ? `<a class="knopf" href="#/plaene/${a.plan_id}?anlage=${a.id}">Im Plan zeigen</a>` : ""}</div>`;
  };

  const waehlen = (k2) => {
    if (k2 && !wahl) { zoomVor = zoom; zoom = Math.max(zoom, 1.1); }          // Etage gewählt: etwas näher heran
    if (!k2 && zoomVor != null) { zoom = zoomVor; zoomVor = null; }           // Auswahl aufgehoben: zurück zur Übersicht
    wahl = k2; zeichnen();
  };
  let zug = null, bewegt = false;
  el.addEventListener("pointerdown", (e) => { if (e.target.closest(".g3-buehne") && !e.target.closest(".g3-info")) { zug = { x: e.clientX, y: e.clientY, d: drehung, n: neigung }; bewegt = false; } });
  window.addEventListener("pointermove", (e) => {
    if (!zug || !el.isConnected) return;
    const dx = e.clientX - zug.x, dy = e.clientY - zug.y;
    if (Math.abs(dx) + Math.abs(dy) > 5) bewegt = true;
    if (!bewegt) return;
    drehung = zug.d - dx * 0.35; neigung = Math.max(25, Math.min(78, zug.n - dy * 0.25));
    stellen();
  });
  window.addEventListener("pointerup", () => { zug = null; });
  el.addEventListener("wheel", (e) => { if (!e.target.closest(".g3-buehne")) return; e.preventDefault(); zoom = Math.max(0.4, Math.min(2.2, zoom * (e.deltaY < 0 ? 1.08 : 0.93))); const r = el.querySelector("#g3Zoom"); if (r) r.value = Math.round(zoom * 100); stellen(); }, { passive: false });
  el.addEventListener("input", (e) => {
    if (e.target.id === "g3Abstand") { abstand = Number(e.target.value); merken(); stellen(); }
    if (e.target.id === "g3Zoom") { zoom = Number(e.target.value) / 100; stellen(); }
  });
  el.addEventListener("click", (e) => {
    if (bewegt) { bewegt = false; return; }
    const pkt = e.target.closest("[data-anl]"), eb = e.target.closest("[data-ebene]"), gb = e.target.closest("[data-geb]"), kn = e.target.closest("[data-g3]");
    if (pkt) { info(pkt.dataset.anl); return; }
    if (kn && kn.dataset.g3 === "zu") { el.querySelector("#g3Info").hidden = true; return; }
    if (kn && kn.dataset.g3 === "alle") { waehlen(null); return; }
    if (gb) { g = gb.dataset.geb; mitteJetzt = 0; merken(); waehlen(null); return; }
    if (eb) waehlen(wahl === eb.dataset.ebene ? null : eb.dataset.ebene);
  });
  window.addEventListener("resize", () => { if (el.isConnected) stellen(); });
  zeichnen();
}
