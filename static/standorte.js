/* Casa CAFM – Standortbaum: Objekt › Gebäude › Etage, Bauteil-Liste und Plan */
"use strict";

const ETAGE_RANG = (e) => {
  const t = (e || "").trim().toUpperCase();
  if (!t) return 500;
  if (/^(\d+)\.\s*UG/.test(t)) return -Number(t.match(/^(\d+)/)[1]);
  if (/^(UG|KG|KELLER|UNTERGESCHOSS|TIEFGARAGE)/.test(t) || /^TG\b/.test(t)) return -1;
  if (/^(EG|ERDGESCHOSS)/.test(t)) return 0;
  if (/^(\d+)\.?\s*(OG|OBERGESCHOSS|ETAGE)/.test(t)) return Number(t.match(/^(\d+)/)[1]);
  if (/^(DG|DACH)/.test(t)) return 90;
  return 400;
};
/* Etage im Baum; mehrere Teilpläne derselben Etage zeigen ihren Zusatz (z. B. „2. OG Teil a“) */
const etagenName = (p) => {
  if (!p.etage) return p.titel;
  const vorne = [p.gebaeude, p.etage].filter(Boolean).join(" ");
  const rest = p.titel && p.titel.startsWith(vorne) ? p.titel.slice(vorne.length).trim() : "";
  return rest ? `${p.etage} ${rest}` : p.etage;
};
const etagenSort = (a, b) => ETAGE_RANG(a.etage) - ETAGE_RANG(b.etage) || String(a.etage || a.titel).localeCompare(String(b.etage || b.titel), "de");

function baumOffen(neu) {
  let s = [];
  try { s = JSON.parse(localStorage.getItem("cafm-baum") || "[]"); } catch (e) { s = []; }
  if (neu) {
    s = s.includes(neu) ? s.filter((x) => x !== neu) : [...s, neu];
    try { localStorage.setItem("cafm-baum", JSON.stringify(s)); } catch (e) { /* egal */ }
  }
  return new Set(s);
}

async function standortAnsicht(el, planId, q) {
  await Promise.all([lade("objekte"), katLaden(), lade("symbole")]);
  const plaene = await api("GET", "plaene");
  const plan = planId ? plaene.find((p) => p.id === planId) : null;
  let objektId = plan ? plan.objekt_id : Number(q.get("o")) || null;
  if (!plan && !S.cache.objekte.some((o) => o.id === objektId)) objektId = S.cache.objekte.length === 1 ? S.cache.objekte[0].id : null;
  if (!plan) return objektId ? gebaeudeUebersicht(el, objektId, q) : objektePlaene(el, plaene);
  /* Ab hier: ein Plan ist gewählt. Links der Baum und die Bauteile der Etage, rechts die Plan-Arbeitsfläche. */
  let offen = baumOffen();
  if (!offen.has("o" + objektId)) offen = baumOffen("o" + objektId);

  el.innerHTML = `<div class="standort-ansicht">
    <aside class="baum-spalte">
      <div class="karte baum-karte">
        <div class="baum-kopf"><h3>Standorte</h3>${darf("plaene_bearbeiten") ? `<button class="knopf klein" id="bgr" title="Grundriss hochladen">${icon("plus")} Grundriss</button>` : ""}</div>
        <input type="search" id="bsuche" placeholder="Objekt oder Etage suchen">
        <ul class="baum" id="baum"></ul>
      </div>
      <div class="karte bauteile-karte">
        <div class="baum-kopf"><h3>Bauteile</h3><span class="klein" id="banz"></span></div>
        <div class="bt-filter"><input type="search" id="btsuche" placeholder="Inv.-Nr., Bezeichnung …"><select id="btkat"><option value="">Alle Kategorien</option>${S.kat.k.map((k) => `<option value="${k.id}">${esc(k.name)}</option>`).join("")}</select></div>
        <div class="bt-liste" id="btl"></div>
      </div>
    </aside>
    <section class="standort-rechts" id="sr"></section>
  </div>`;
  const baum = el.querySelector("#baum"), sr = el.querySelector("#sr");

  /* Baum zeichnen */
  const zeichneBaum = () => {
    const w = el.querySelector("#bsuche").value.trim().toLowerCase();
    baum.innerHTML = S.cache.objekte.map((o) => {
      const eigene = plaene.filter((p) => p.objekt_id === o.id).sort(etagenSort);
      const passt = !w || anzeige("objekte", o).toLowerCase().includes(w) || eigene.some((p) => [p.gebaeude, p.etage, p.titel].join(" ").toLowerCase().includes(w));
      if (!passt) return "";
      const auf = offen.has("o" + o.id) || !!w;
      const gebaeude = [...new Set(eigene.map((p) => p.gebaeude || ""))];
      const mitGebaeude = gebaeude.some(Boolean);
      const etage = (p) => `<li><a class="b-knoten b-etage ${plan && plan.id === p.id ? "an" : ""}" href="#/plaene/${p.id}">${icon("plaene")}<span>${esc(etagenName(p))}</span><span class="b-zahl">${p.anlagen_anzahl || 0}</span></a></li>`;
      const kinder = !mitGebaeude ? eigene.map(etage).join("") : gebaeude.map((g) => {
        const key = `g${o.id}|${g}`, gAuf = !offen.has("zu" + key) || !!w;
        return `<li><span class="b-knoten b-gebaeude" data-gtoggle="${esc(key)}"><span class="b-pfeil">${gAuf ? "▾" : "▸"}</span>${icon("objekte")}<span>${esc(g || "Ohne Gebäudeangabe")}</span></span>
          ${gAuf ? `<ul>${eigene.filter((p) => (p.gebaeude || "") === g).map(etage).join("")}</ul>` : ""}</li>`;
      }).join("");
      return `<li><span class="b-knoten b-objekt"><span class="b-pfeil" data-otoggle="${o.id}">${auf ? "▾" : "▸"}</span>
          <a href="#/plaene?o=${o.id}">${icon("start")}<span>${esc(o.kuerzel)} · ${esc(o.name)}</span></a></span>
        ${auf ? `<ul>${kinder || '<li class="klein b-leer">Noch kein Grundriss</li>'}
          <li><a class="b-knoten b-ohne" href="#/plaene?o=${o.id}&ohne=1"><span>Ohne Plan</span></a></li></ul>` : ""}</li>`;
    }).join("") || '<li class="klein">Nichts gefunden.</li>';
  };
  zeichneBaum();
  baum.addEventListener("click", (e) => {
    const ot = e.target.closest("[data-otoggle]"), gt = e.target.closest("[data-gtoggle]");
    if (ot) { e.preventDefault(); offen = baumOffen("o" + ot.dataset.otoggle); zeichneBaum(); }
    if (gt) { offen = baumOffen("zu" + gt.dataset.gtoggle); zeichneBaum(); }
  });
  el.querySelector("#bsuche").addEventListener("input", zeichneBaum);
  const bgr = el.querySelector("#bgr");
  if (bgr) bgr.onclick = async () => { const e = await planHochladen({ objekt_id: objektId }); if (e) location.hash = `#/plaene/${e.id}`; };

  /* Bauteil-Liste */
  let anlagen = [];
  const ladeBauteile = async () => {
    anlagen = await api("GET", `anlagen?objekt_id=${objektId}`);
    zeichneBauteile();
  };
  const zeichneBauteile = () => {
    const box = el.querySelector("#btl");
    const w = el.querySelector("#btsuche").value.trim().toLowerCase(), k = Number(el.querySelector("#btkat").value) || null;
    let liste = anlagen.filter((a) => a.plan_id === plan.id);
    if (k) liste = liste.filter((a) => a.kategorie_id === k);
    if (w) liste = liste.filter((a) => [a.nummer, a.bezeichnung, a.standort, refText("kat_typen", a.typ_id)].join(" ").toLowerCase().includes(w));
    el.querySelector("#banz").textContent = `${liste.length}`;
    const frei = anlagen.filter((a) => !a.plan_id);
    box.innerHTML = (liste.length ? `<table class="bauteile"><thead><tr><th></th><th>Inv.-Nr.</th><th>Bezeichnung</th></tr></thead><tbody>${liste.map((a) => `
      <tr data-a="${a.id}" title="Klick: im Plan zeigen · Doppelklick: Anlage öffnen"><td>${symbolVon(a, 22)}</td><td class="nowrap">${esc(a.nummer || "")}</td>
        <td><b>${esc(a.bezeichnung)}</b><br><span class="klein">${esc([katVon(a.kategorie_id)?.name || a.gewerk, a.typ_id ? S.kat.tMap[a.typ_id]?.name : ""].filter(Boolean).join(" · "))}</span></td></tr>`).join("")}</tbody></table>`
      : '<p class="klein">Keine Bauteile.</p>')
      + (frei.length && darf("plaene_bearbeiten") ? `<p class="klein">${frei.length} Bauteile dieses Objekts sind noch auf keinem Plan. Sie stehen im Plan rechts unter „Noch nicht im Plan“.</p>` : "");
  };
  el.querySelector("#btsuche").addEventListener("input", zeichneBauteile);
  el.querySelector("#btkat").addEventListener("change", zeichneBauteile);
  el.querySelector("#btl").addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-a]");
    if (!tr) return;
    el.querySelectorAll("#btl tr.an").forEach((x) => x.classList.remove("an"));
    tr.classList.add("an");
    if (sr.planApi) sr.planApi.zeige(Number(tr.dataset.a));
  });
  el.querySelector("#btl").addEventListener("dblclick", (e) => { const tr = e.target.closest("tr[data-a]"); if (tr) location.hash = `#/anlagen/${tr.dataset.a}`; });
  sr.addEventListener("plangeaendert", async () => {
    const neu = await api("GET", "plaene");
    plaene.splice(0, plaene.length, ...neu);
    zeichneBaum(); ladeBauteile();
  });

  /* Rechte Seite */
  await planEditor(sr, plan.id, q);
  await ladeBauteile();
}

/* ---------- Ohne gewähltes Objekt: erst das Objekt wählen ---------- */
function objektePlaene(el, plaene) {
  const zahl = (o) => plaene.filter((p) => p.objekt_id === o.id);
  el.innerHTML = seitenkopf("Standorte & Pläne", "Objekt wählen") + (S.cache.objekte.length
    ? `<div class="plan-karten">${S.cache.objekte.map((o) => { const pl = zahl(o); return `
      <a class="karte gu-objekt" href="#/plaene?o=${o.id}"><b>${esc(o.name)}</b><span class="klein">${esc([o.kuerzel, o.ort].filter(Boolean).join(" · "))}</span>
        <span class="gu-objekt-zahl">${pl.length} ${pl.length === 1 ? "Plan" : "Pläne"} · ${pl.reduce((n, p) => n + (p.anlagen_anzahl || 0), 0)} Anlagen im Plan</span></a>`; }).join("")}</div>`
    : '<div class="karte leer">Noch kein Objekt angelegt.</div>');
}

/* ---------- Gebäude-Übersicht: alle Gebäude nebeneinander, die Etagen gestapelt wie im Haus ---------- */
const guRang = (e) => { const r = ETAGE_RANG(e); return r >= 400 ? -1000 : r; };       // Pläne ohne erkennbare Etage ganz nach unten
const GU_FARBE = { rot: "var(--ueber)", gelb: "var(--bald)", ok: "var(--ok)" };

/* Kurzer Grund, warum eine Anlage auffällt: offene Störung, überfälliger oder naher Termin */
function guGrund(a, heuteIso) {
  const t = [];
  if (a.status === "Außer Betrieb") t.push("außer Betrieb");
  if (a.tickets_offen) t.push(`${a.tickets_offen} ${a.tickets_offen === 1 ? "Störung" : "Störungen"} offen`);
  if (a.naechste) {
    const tage = Math.round((new Date(a.naechste + "T00:00:00") - new Date(heuteIso + "T00:00:00")) / 86400000), art = a.naechste_art || "Termin";
    if (tage < 0) t.push(`${art} überfällig seit ${-tage} ${tage === -1 ? "Tag" : "Tagen"}`);
    else if (tage <= 30) t.push(tage === 0 ? `${art} heute fällig` : `${art} in ${tage} ${tage === 1 ? "Tag" : "Tagen"}`);
  }
  if (a.status === "Eingeschränkt") t.push("eingeschränkt in Betrieb");
  return t.join(" · ");
}
/* Teilpläne einer Etage: Kurzzeichen („Teil b“ → b, sonst die laufende Nummer) und Name unter dem kleinen Bild */
function guTeil(p, i, lang = false) {
  const name = etagenName(p), rest = p.etage && name.startsWith(p.etage) ? name.slice(p.etage.length).trim() : "";
  const m = rest.match(/^Teil\s+(\S{1,3})$/i);
  if (lang) return m ? `Teil ${m[1]}` : rest || p.titel;
  return m ? m[1] : String(i + 1);
}

async function gebaeudeUebersicht(ziel, objektId, q) {
  const el = document.createElement("div");                   // eigener Behälter: Die Klick-Behandlung endet mit dem Seitenwechsel
  ziel.replaceChildren(el);
  const aendern = darf("plaene_bearbeiten");
  const o = S.cache.objekte.find((x) => x.id === objektId);
  let d, geb, etagen, zellen, frei, auff, wahl = null, ansicht = "gebaeude";
  try { ansicht = localStorage.getItem("cafm-plaene-ansicht") || "gebaeude"; } catch (e) { /* egal */ }
  if (!["gebaeude", "kacheln", "liste"].includes(ansicht)) ansicht = "gebaeude";
  const key = (g, e) => `${g}|${e}`;
  const gebName = (g) => g || (geb.length > 1 ? "Ohne Gebäudeangabe" : o.name);
  const zName = (z) => [z.g || (geb.length > 1 ? "Ohne Gebäudeangabe" : ""), z.e || "Ohne Etage"].filter(Boolean).join(" · ");

  const aufbereiten = () => {
    const proPlan = new Map();
    for (const a of d.anlagen) if (a.plan_id) { if (!proPlan.has(a.plan_id)) proPlan.set(a.plan_id, []); proPlan.get(a.plan_id).push(a); }
    frei = d.anlagen.filter((a) => !a.plan_id);
    geb = [...new Set(d.plaene.map((p) => p.gebaeude || ""))].sort((a, b) => a.localeCompare(b, "de", { numeric: true }));
    etagen = [...new Set(d.plaene.map((p) => p.etage || ""))].sort((a, b) => guRang(b) - guRang(a) || a.localeCompare(b, "de", { numeric: true }));
    zellen = new Map();
    for (const p of [...d.plaene].sort((a, b) => a.titel.localeCompare(b.titel, "de", { numeric: true }))) {
      const k = key(p.gebaeude || "", p.etage || "");
      if (!zellen.has(k)) zellen.set(k, { k, g: p.gebaeude || "", e: p.etage || "", plaene: [], anlagen: [] });
      p.anlagen = proPlan.get(p.id) || [];
      p.anlagen_anzahl = p.anlagen.length; p.objekt_id = objektId;
      zellen.get(k).plaene.push(p); zellen.get(k).anlagen.push(...p.anlagen);
    }
    for (const z of zellen.values()) {
      z.auff = z.anlagen.filter((a) => a.ampel !== "gruen").sort((a, b) => (a.ampel === "rot" ? 0 : 1) - (b.ampel === "rot" ? 0 : 1));
      z.zustand = z.auff.some((a) => a.ampel === "rot") ? "rot" : z.auff.length ? "gelb" : z.anlagen.length ? "ok" : "leer";
    }
    const alle = [...zellen.values()];
    auff = alle.filter((z) => z.auff.length).sort((a, b) => (a.zustand === "rot" ? 0 : 1) - (b.zustand === "rot" ? 0 : 1) || b.auff.length - a.auff.length);
    if (!wahl || !zellen.has(wahl)) wahl = (auff[0] || alle.find((z) => z.anlagen.length) || alle.find((z) => guRang(z.e) === 0) || alle[0] || {}).k || null;
  };

  /* Gitter: Kopfzeile je Gebäude, darunter die Etagen von oben nach unten, das Gelände als Linie */
  const gitter = () => {
    const oben = etagen.filter((e) => guRang(e) >= 0).length, sonst = etagen.filter((e) => guRang(e) === -1000).length, unten = etagen.length - oben - sonst;
    const erste = {};                                         // oberste Etage je Gebäude: bekommt das runde Dach
    geb.forEach((g) => { erste[g] = etagen.find((e) => zellen.has(key(g, e))); });
    const kopf = geb.map((g) => {
      const zl = [...zellen.values()].filter((z) => z.g === g), n = zl.length || 1;
      const rot = zl.filter((z) => z.zustand === "rot").length, gelb = zl.filter((z) => z.zustand === "gelb").length, ok = zl.filter((z) => z.zustand === "ok").length;
      const teil = (zahl, farbe) => zahl ? `<i style="flex:${zahl};background:${farbe}"></i>` : "";
      return `<div class="gu-kopf"><b>${esc(gebName(g))}</b><small>${zl.reduce((s, z) => s + z.anlagen.length, 0)} Anlagen · ${zl.reduce((s, z) => s + z.plaene.length, 0)} ${zl.reduce((s, z) => s + z.plaene.length, 0) === 1 ? "Plan" : "Pläne"}</small>
        <div class="gu-balken">${teil(ok, "var(--ok)")}${teil(n - ok - gelb - rot, "var(--rand-stark)")}${teil(gelb, "var(--bald)")}${teil(rot, "var(--ueber)")}</div></div>`;
    }).join("");
    const zeile = (e) => `<div class="gu-achse">${esc(e || "Ohne Etage")}</div>` + geb.map((g) => {
      const z = zellen.get(key(g, e));
      if (!z) return '<div class="gu-zelle fehlt"></div>';
      return `<button type="button" class="gu-zelle ${z.zustand} ${erste[g] === e ? "dach" : ""} ${wahl === z.k ? "an" : ""}" data-zelle="${esc(z.k)}" title="${esc(zName(z))}: ${z.anlagen.length} Anlagen${z.auff.length ? `, ${z.auff.length} auffällig` : ""}">
        <b>${z.anlagen.length}</b>${z.plaene.length > 1 ? `<span class="gu-teile">${z.plaene.map((p, i) => `<i>${esc(guTeil(p, i))}</i>`).join("")}</span>` : ""}
        ${z.auff.length ? `<span class="gu-marke" style="--c:${GU_FARBE[z.zustand]}">${z.auff.length}</span>` : ""}</button>`;
    }).join("");
    const linie = oben && unten ? 1 : 0, abU = 2 + oben + linie;                                  // Gitterzeile 1 ist die Kopfzeile
    const turm = (oben ? `<i class="gu-turm" style="grid-row:2 / ${2 + oben}"></i>` : "") + (unten ? `<i class="gu-turm u" style="grid-row:${abU} / ${abU + unten}"></i>` : "");   // Fläche hinter den Etagen
    const trenner = (i) => i === oben && linie ? '<div class="gu-gelaende">Gelände</div>' : i === oben + unten && sonst && i ? '<div class="gu-gelaende">Weitere Pläne</div>' : "";
    return `<div class="karte gu-schnitt"><div class="gu-gitter" style="--n:${geb.length}">${turm}<div></div>${kopf}
      ${etagen.map((e, i) => trenner(i) + zeile(e)).join("")}</div>
      <div class="gu-legende"><span><b>12</b> = Anlagen auf der Etage</span><span><i style="--c:color-mix(in srgb, var(--ok) 30%, var(--weiss))"></i>in Ordnung</span><span><i style="--c:color-mix(in srgb, var(--bald) 45%, var(--weiss))"></i>bald fällig</span>
        <span><i style="--c:color-mix(in srgb, var(--ueber) 35%, var(--weiss))"></i>überfällig oder Störung</span><span><i style="--c:repeating-linear-gradient(135deg, var(--weiss) 0 3px, var(--rand-stark) 3px 6px)"></i>noch keine Anlagen im Plan</span>
        <span><em class="gu-tl">a</em>Teilpläne der Etage</span><span><em class="gu-mk">2</em>hier ist etwas zu tun</span></div></div>`;
  };

  /* Rechte Spalte: gewählte Etage, Auffälliges, Anlagen ohne Plan */
  const rechts = () => {
    const z = zellen.get(wahl);
    const etage = z ? `<div class="karte gu-etage"><div class="gu-pk"><h3>Gewählte Etage</h3><small>${z.anlagen.length} ${z.anlagen.length === 1 ? "Anlage" : "Anlagen"}</small></div><h2>${esc(zName(z))}</h2>
        ${z.auff.length ? `<div class="gu-zl">${z.auff.slice(0, 4).map((a) => `<a href="#/plaene/${a.plan_id}?anlage=${a.id}" class="${a.ampel === "rot" ? "rot" : "gelb"}"><b>${esc(a.bezeichnung)}:</b> ${esc(guGrund(a, d.heute))}</a>`).join("")}${z.auff.length > 4 ? `<span class="klein">und ${z.auff.length - 4} weitere</span>` : ""}</div>` : ""}
        <div class="gu-zw ${z.plaene.length === 1 ? "eins" : ""}">${z.plaene.map((p, i) => `<a href="#/plaene/${p.id}" title="${esc(p.titel)} öffnen"><img src="/api/plaene/${p.id}/bild" alt="" loading="lazy">
          <small>${z.plaene.length > 1 ? `${esc(guTeil(p, i, true))} · ` : ""}${p.anlagen.length} ${p.anlagen.length === 1 ? "Anlage" : "Anlagen"}</small></a>`).join("")}</div>
        <div class="gu-kn"><a class="knopf haupt-k" href="#/plaene/${z.auff.length ? `${z.auff[0].plan_id}?anlage=${z.auff[0].id}` : z.plaene[0].id}">Plan öffnen →</a>
          ${z.anlagen.length ? '<button class="knopf" type="button" data-gu="qr">QR-Etiketten</button>' : ""}</div></div>` : "";
    const zeigen = auff.length > 7 ? 6 : 7;                    // nie nur „und 1 weitere“
    const liste = auff.length ? `<div class="gu-auf">${auff.slice(0, zeigen).map((a) => `<button type="button" data-zelle="${esc(a.k)}" style="--c:${GU_FARBE[a.zustand]}"><b>${esc(zName(a))}</b>
          <span>${esc(a.auff[0].bezeichnung)}: ${esc(guGrund(a.auff[0], d.heute))}${a.auff.length > 1 ? ` · und ${a.auff.length - 1} weitere` : ""}</span></button>`).join("")}</div>
        ${auff.length > zeigen ? `<p class="klein gu-ruhig">und ${auff.length - zeigen} weitere Etagen. Sie sind im Gebäude farbig markiert.</p>` : ""}`
      : '<p class="klein gu-ruhig">Auf keiner Etage ist etwas überfällig oder gestört.</p>';
    return `<div class="gu-rechts">${etage}
      <div class="karte"><div class="gu-pk"><h3>Auffällig</h3><small>${auff.length} ${auff.length === 1 ? "Etage" : "Etagen"}</small></div>${liste}</div>
      ${frei.length ? `<div class="karte gu-ohne"><b>${frei.length}</b><span>${frei.length === 1 ? "Anlage ist" : "Anlagen sind"} noch auf keinem Plan.</span><button class="knopf" type="button" data-gu="einordnen">${aendern ? "Einordnen" : "Ansehen"}</button></div>` : ""}</div>`;
  };

  const tabelle = () => `<div class="tabelle-wrap"><table><thead><tr><th>Gebäude</th><th>Etage</th><th>Plan</th><th>Anlagen</th><th>Zustand</th></tr></thead><tbody>${
    [...zellen.values()].sort((a, b) => a.g.localeCompare(b.g, "de", { numeric: true }) || etagenSort({ etage: a.e, titel: "" }, { etage: b.e, titel: "" })).flatMap((z) => z.plaene.map((p) => {
      const auf = p.anlagen.filter((a) => a.ampel !== "gruen"), rot = auf.some((a) => a.ampel === "rot");
      return `<tr class="klickbar" data-plan="${p.id}"><td>${esc(z.g || "")}</td><td>${esc(z.e || "")}</td><td><b>${esc(p.titel)}</b></td><td>${p.anlagen.length}</td>
        <td>${auf.length ? `<span class="marke ${rot ? "m-ueber" : "m-bald"}">${auf.length} auffällig</span>` : p.anlagen.length ? '<span class="marke m-ok">in Ordnung</span>' : '<span class="klein">noch keine Anlagen</span>'}</td></tr>`; })).join("")}</tbody></table></div>`;

  /* Suche: Anlagen und Etagen, ein Klick öffnet den richtigen Plan */
  const treffer = (w) => {
    const aus = [];
    for (const a of d.anlagen) {
      if (aus.length >= 8) break;
      if (![a.bezeichnung, a.nummer, a.standort, a.gewerk].join(" ").toLowerCase().includes(w)) continue;
      const p = a.plan_id ? d.plaene.find((x) => x.id === a.plan_id) : null;
      aus.push(`<a href="${p ? `#/plaene/${p.id}?anlage=${a.id}` : `#/anlagen/${a.id}`}">${symbolVon(a, 26)}<span><b>${esc(a.bezeichnung)}</b><small>${esc([a.nummer, p ? p.titel : "noch auf keinem Plan"].filter(Boolean).join(" · "))}</small></span></a>`);
    }
    for (const p of d.plaene) {
      if (aus.length >= 12) break;
      if ([p.titel, p.gebaeude, p.etage].join(" ").toLowerCase().includes(w)) aus.push(`<a href="#/plaene/${p.id}">${icon("plaene")}<span><b>${esc(p.titel)}</b><small>${p.anlagen.length} ${p.anlagen.length === 1 ? "Anlage" : "Anlagen"}</small></span></a>`);
    }
    return aus;
  };
  const beispiele = () => {
    const erste = d.anlagen[0], gew = Object.entries(d.anlagen.reduce((m, a) => { if (a.gewerk) m[a.gewerk] = (m[a.gewerk] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1])[0];
    const pl = d.plaene.find((p) => p.gebaeude && p.etage) || d.plaene[0];
    return [erste && erste.bezeichnung, gew && gew[0], pl && [pl.gebaeude, pl.etage].filter(Boolean).join(" ")].filter(Boolean).slice(0, 3);
  };

  /* Anlagen ohne Plan einordnen: Plan wählen, dann im Plan die Stelle antippen. Ohne das Recht nur ansehen. */
  const einordnen = async () => {
    const wahlPlan = (a) => {
      const s = (a.standort || "").toLowerCase();                // Vorschlag aus dem Feld Standort, z. B. „Finger 2, 3. OG“
      const hat = (teil) => new RegExp(`(^|[^0-9a-zäöüß])${teil.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^0-9a-zäöüß])`).test(s);
      const tipp = d.plaene.find((p) => p.etage && hat(p.etage) && (!p.gebaeude || hat(p.gebaeude)));
      return `<select data-fuer="${a.id}">${geb.map((g) => `<optgroup label="${esc(gebName(g))}">${d.plaene.filter((p) => (p.gebaeude || "") === g).sort(etagenSort).map((p) =>
        `<option value="${p.id}" ${tipp && tipp.id === p.id ? "selected" : ""}>${esc(p.titel)}</option>`).join("")}</optgroup>`).join("")}</select>`;
    };
    const zeile = (a, rest) => `<div>${symbolVon(a, 28)}<a href="#/anlagen/${a.id}"><b>${esc(a.bezeichnung)}</b><small>${esc([a.nummer, a.standort].filter(Boolean).join(" · "))}</small></a>${rest}</div>`;
    const html = !aendern ? `<div class="gu-einordnen nur">${frei.map((a) => zeile(a, "")).join("")}</div>`
      : d.plaene.length ? `<p class="klein">Wähl den Plan und klick auf „Setzen“. Im Plan tippst du dann auf die Stelle, an der die Anlage steht.</p>
      <div class="gu-einordnen">${frei.map((a) => zeile(a, `${wahlPlan(a)}<button class="knopf klein" type="button" data-setzen="${a.id}">Setzen</button>`)).join("")}</div>`
      : '<p>Für dieses Objekt gibt es noch keinen Grundriss. Lade zuerst einen hoch.</p>';
    const p = dialog(`${frei.length} ${frei.length === 1 ? "Anlage" : "Anlagen"} ohne Plan`, html, [{ text: "Schließen" }]);
    const hg = letzterDialog();
    hg.addEventListener("click", (e) => {
      if (e.target.closest(".gu-einordnen a")) { hg.querySelector(".x").click(); return; }   // der Verweis führt zur Anlage
      const k = e.target.closest("[data-setzen]");
      if (!k) return;
      const pid = hg.querySelector(`select[data-fuer="${k.dataset.setzen}"]`).value;
      hg.querySelector(".x").click();
      location.hash = `#/plaene/${pid}?platzieren=${k.dataset.setzen}`;
    });
    await p;
  };

  const zeichnen = () => {
    const knoepfe = `<div class="umschalter">${[["gebaeude", "Gebäude"], ["kacheln", "Kacheln"], ["liste", "Liste"]].map(([k, t]) => `<button type="button" data-ans="${k}" class="${ansicht === k ? "an" : ""}">${t}</button>`).join("")}</div>
      ${aendern ? `<button class="knopf" type="button" data-gu="import">Grundrisse importieren</button><button class="knopf haupt-k" type="button" data-gu="neu">${icon("plus")} Grundriss</button>` : ""}`;
    const leer = '<div class="karte leer">Für dieses Objekt gibt es noch keinen Grundriss. Lade oben den ersten hoch, zum Beispiel für das EG.</div>';
    const innen = !d.plaene.length ? leer
      : ansicht === "kacheln" ? geb.map((g) => `${geb.length > 1 ? `<h3 class="gu-geb">${esc(gebName(g))}</h3>` : ""}${planKarten(d.plaene.filter((p) => (p.gebaeude || "") === g).sort(etagenSort), false)}`).join("")
      : ansicht === "liste" ? tabelle()
      : `<div class="gu-layout">${gitter()}${rechts()}</div>`;
    el.innerHTML = seitenkopf("Standorte & Pläne", `${o.kuerzel || o.name} · Bestand`, knoepfe)
      + (d.plaene.length || d.anlagen.length ? `<div class="gu-such">${icon("suche")}<input type="search" id="guSuche" placeholder="Anlage, Raum oder Etage suchen. Das Programm öffnet gleich den richtigen Plan." autocomplete="off">
          <div class="bsp">${beispiele().length ? "z. B. " + beispiele().map((b) => `<button type="button" data-bsp="${esc(b)}">${esc(b)}</button>`).join("") : ""}</div><div class="gu-treffer" id="guTreffer" hidden></div></div>` : "")
      + `<div id="guInnen">${innen}</div>`;
    const feld = el.querySelector("#guSuche"), box = el.querySelector("#guTreffer");
    if (!feld) return;
    const suchen = () => {
      const w = feld.value.trim().toLowerCase();
      const liste = w.length >= 2 ? treffer(w) : [];
      box.hidden = w.length < 2;
      box.innerHTML = liste.join("") || '<p class="klein gu-ruhig">Nichts gefunden.</p>';
    };
    feld.addEventListener("input", suchen);
    feld.addEventListener("keydown", (e) => { if (e.key === "Enter") { const a = box.querySelector("a"); if (a) location.hash = a.getAttribute("href"); } if (e.key === "Escape") { feld.value = ""; suchen(); } });
    el.querySelectorAll("[data-bsp]").forEach((b) => b.onclick = () => { feld.value = b.dataset.bsp; suchen(); feld.focus(); });
  };

  el.onclick = async (e) => {
    const ans = e.target.closest("[data-ans]"), zl = e.target.closest("[data-zelle]"), gu = e.target.closest("[data-gu]"), tr = e.target.closest("tr[data-plan]");
    const box = el.querySelector("#guTreffer");
    if (box && !e.target.closest(".gu-such")) box.hidden = true;
    if (ans) { ansicht = ans.dataset.ans; try { localStorage.setItem("cafm-plaene-ansicht", ansicht); } catch (x) { /* egal */ } zeichnen(); }
    else if (zl) {
      wahl = zl.dataset.zelle;
      el.querySelectorAll(".gu-zelle.an").forEach((x) => x.classList.remove("an"));
      el.querySelectorAll(".gu-zelle").forEach((x) => { if (x.dataset.zelle === wahl) x.classList.add("an"); });
      const alt = el.querySelector(".gu-rechts");
      if (alt) alt.outerHTML = rechts();
      const karte = el.querySelector(".gu-etage");           // schmale Ansicht: die Etage steht unter dem Gebäude, also dorthin rollen
      if (karte && e.target.closest(".gu-zelle") && matchMedia("(max-width: 1180px)").matches) karte.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    else if (tr) location.hash = `#/plaene/${tr.dataset.plan}`;
    else if (gu && gu.dataset.gu === "qr") {
      etikettenDrucken(zellen.get(wahl).anlagen.map((a) => ({ ...a, objekt_id: objektId })), `QR-Etiketten ${zName(zellen.get(wahl))}`);
    }
    else if (gu && gu.dataset.gu === "einordnen") einordnen();
    else if (gu && gu.dataset.gu === "import") { if (await plaeneImportieren(objektId)) { cacheLeeren(); await neu(); } }
    else if (gu && gu.dataset.gu === "neu") { const erg = await planHochladen({ objekt_id: objektId }); if (erg) location.hash = `#/plaene/${erg.id}`; }
  };
  const neu = async () => { d = await api("GET", `plaene/uebersicht?objekt_id=${objektId}`); aufbereiten(); zeichnen(); };
  await neu();
  if (q.get("ohne") === "1" && frei.length) einordnen();
}

SEITEN.plaene = async (el, _, q) => standortAnsicht(el, null, q);
DETAIL.plaene = async (el, id, q) => standortAnsicht(el, id, q);
