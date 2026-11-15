/* Casa CAFM – Standortbaum: Objekt › Gebäude › Etage, Bauteil-Liste und Plan */
"use strict";

const ETAGE_RANG = (e) => {
  const t = (e || "").trim().toUpperCase();
  if (!t) return 500;
  if (/^(\d+)\.\s*UG/.test(t)) return -Number(t.match(/^(\d+)/)[1]);
  if (/^(UG|KG|KELLER|UNTERGESCHOSS)/.test(t)) return -1;
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
  const objektId = plan ? plan.objekt_id : Number(q.get("o")) || (S.cache.objekte.length === 1 ? S.cache.objekte[0].id : null);
  const ohnePlan = q.get("ohne") === "1";
  let offen = baumOffen();
  if (objektId && !offen.has("o" + objektId)) offen = baumOffen("o" + objektId);

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
        <div class="bt-liste" id="btl"><p class="klein">Links ein Objekt oder eine Etage wählen.</p></div>
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
      return `<li><span class="b-knoten b-objekt ${objektId === o.id && !plan && !ohnePlan ? "an" : ""}"><span class="b-pfeil" data-otoggle="${o.id}">${auf ? "▾" : "▸"}</span>
          <a href="#/plaene?o=${o.id}">${icon("start")}<span>${esc(o.kuerzel)} · ${esc(o.name)}</span></a></span>
        ${auf ? `<ul>${kinder || '<li class="klein b-leer">Noch kein Grundriss</li>'}
          <li><a class="b-knoten b-ohne ${objektId === o.id && ohnePlan ? "an" : ""}" href="#/plaene?o=${o.id}&ohne=1"><span>Ohne Plan</span></a></li></ul>` : ""}</li>`;
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
  if (bgr) bgr.onclick = async () => { const e = await planHochladen(objektId ? { objekt_id: objektId } : {}); if (e) location.hash = `#/plaene/${e.id}`; };

  /* Bauteil-Liste */
  let anlagen = [];
  const ladeBauteile = async () => {
    if (!objektId) { anlagen = []; zeichneBauteile(); return; }
    anlagen = await api("GET", `anlagen?objekt_id=${objektId}`);
    zeichneBauteile();
  };
  const zeichneBauteile = () => {
    const box = el.querySelector("#btl");
    if (!objektId) { box.innerHTML = '<p class="klein">Links ein Objekt oder eine Etage wählen.</p>'; el.querySelector("#banz").textContent = ""; return; }
    const w = el.querySelector("#btsuche").value.trim().toLowerCase(), k = Number(el.querySelector("#btkat").value) || null;
    let liste = plan ? anlagen.filter((a) => a.plan_id === plan.id) : ohnePlan ? anlagen.filter((a) => !a.plan_id) : anlagen;
    if (k) liste = liste.filter((a) => a.kategorie_id === k);
    if (w) liste = liste.filter((a) => [a.nummer, a.bezeichnung, a.standort, refText("kat_typen", a.typ_id)].join(" ").toLowerCase().includes(w));
    el.querySelector("#banz").textContent = `${liste.length}`;
    const frei = plan ? anlagen.filter((a) => !a.plan_id) : [];
    box.innerHTML = (liste.length ? `<table class="bauteile"><thead><tr><th></th><th>Inv.-Nr.</th><th>Bezeichnung</th></tr></thead><tbody>${liste.map((a) => `
      <tr data-a="${a.id}" title="Klick: im Plan zeigen · Doppelklick: Anlage öffnen"><td>${symbolVon(a, 22)}</td><td class="nowrap">${esc(a.nummer || "")}</td>
        <td><b>${esc(a.bezeichnung)}</b><br><span class="klein">${esc([katVon(a.kategorie_id)?.name || a.gewerk, a.typ_id ? S.kat.tMap[a.typ_id]?.name : ""].filter(Boolean).join(" · "))}</span></td></tr>`).join("")}</tbody></table>`
      : '<p class="klein">Keine Bauteile.</p>')
      + (plan && frei.length && darf("plaene_bearbeiten") ? `<p class="klein">${frei.length} Bauteile dieses Objekts sind noch auf keinem Plan. Sie stehen im Plan rechts unter „Noch nicht im Plan“.</p>` : "");
  };
  el.querySelector("#btsuche").addEventListener("input", zeichneBauteile);
  el.querySelector("#btkat").addEventListener("change", zeichneBauteile);
  el.querySelector("#btl").addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-a]");
    if (!tr) return;
    el.querySelectorAll("#btl tr.an").forEach((x) => x.classList.remove("an"));
    tr.classList.add("an");
    const aid = Number(tr.dataset.a);
    if (plan && sr.planApi && sr.planApi.zeige(aid)) return;
    if (!plan) location.hash = `#/anlagen/${aid}`;
  });
  el.querySelector("#btl").addEventListener("dblclick", (e) => { const tr = e.target.closest("tr[data-a]"); if (tr) location.hash = `#/anlagen/${tr.dataset.a}`; });
  sr.addEventListener("plangeaendert", async () => {
    const neu = await api("GET", "plaene");
    plaene.splice(0, plaene.length, ...neu);
    zeichneBaum(); ladeBauteile();
  });

  /* Rechte Seite */
  if (plan) {
    await planEditor(sr, plan.id, q);
  } else if (objektId) {
    const o = S.cache.objekte.find((x) => x.id === objektId);
    const eigene = plaene.filter((p) => p.objekt_id === objektId).sort(etagenSort);
    sr.innerHTML = seitenkopf(o.name, `${o.kuerzel}${o.ort ? " · " + o.ort : ""}${ohnePlan ? " · Bauteile ohne Plan" : ""}`,
      `${darf("plaene_bearbeiten") ? `<button class="knopf haupt-k" id="sgr">${icon("plus")} Grundriss hochladen</button><button class="knopf" id="sgi">Mehrere importieren (ZIP)</button>` : ""}<a class="knopf" href="#/objekte/${o.id}">Objekt öffnen</a><button class="knopf" id="sqr">QR-Etiketten</button>`)
      + (eigene.length ? `<h3>Etagen und Grundrisse</h3>${planKarten(eigene, false)}` : '<div class="karte leer">Für dieses Objekt gibt es noch keinen Grundriss. Lade oben den ersten hoch, zum Beispiel für das EG.</div>');
    const sg = sr.querySelector("#sgr");
    if (sg) sg.onclick = async () => { const e = await planHochladen({ objekt_id: objektId }); if (e) location.hash = `#/plaene/${e.id}`; };
    const si = sr.querySelector("#sgi");
    if (si) si.onclick = async () => { if (await plaeneImportieren(objektId)) { cacheLeeren(); route(); } };
    sr.querySelector("#sqr").onclick = async () => etikettenDrucken(ohnePlan ? anlagen.filter((a) => !a.plan_id) : anlagen, `QR-Etiketten ${o.kuerzel}`);
  } else {
    sr.innerHTML = seitenkopf("Standorte & Pläne", "Objekt › Gebäude › Etage") + `<div class="karte leer">Links ein Objekt wählen. Darunter erscheinen Gebäude und Etagen mit ihren Grundrissen.</div>
      ${plaene.length ? `<div class="abstand"></div><h3>Alle Grundrisse</h3>${planKarten(plaene)}` : ""}`;
  }
  await ladeBauteile();
}

SEITEN.plaene = async (el, _, q) => standortAnsicht(el, null, q);
DETAIL.plaene = async (el, id, q) => standortAnsicht(el, id, q);
