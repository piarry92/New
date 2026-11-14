/* Casa CAFM – Katalog: Kategorie > Hersteller/Gruppe > Bezeichnung > Detailinfo, Mängelkatalog, Kategorie-Symbole */
"use strict";

const KAT_FARBE = { Rot: "#E30613", Blau: "#2456A6", "Grün": "#009A44", Gelb: "#E0A500", Orange: "#F08A00", Grau: "#626366", Lila: "#6A4C93", Petrol: "#00808A", Schwarz: "#231F20" };

/* Eigene Bildzeichen je Kategorie (schwarz auf weiß im farbigen Rahmen) */
const S5 = 'fill="none" stroke="#231F20" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"';
const KAT_BILD = {
  tuer: { l: "Tür", s: `<rect x="31" y="14" width="38" height="50" ${S5}/><circle cx="61" cy="40" r="3.5" fill="#231F20"/><path d="M20 64h60" ${S5}/>` },
  melder: { s: `<circle cx="50" cy="46" r="24" ${S5}/><circle cx="50" cy="46" r="10" fill="#F2C200" stroke="#231F20" stroke-width="3"/><path d="M24 80h52" ${S5}/>` },
  schott: { l: "Schott", s: `<rect x="22" y="14" width="56" height="50" ${S5}/><path d="M50 18v42M26 39h48" ${S5}/>` },
  fsa: { l: "FSA", s: `<rect x="30" y="16" width="40" height="30" ${S5}/><path d="M36 46v12h28V46" ${S5}/><path d="M42 26h16" ${S5}/>` },
  notlicht: { s: `<path d="M38 56c-6-6-10-12-10-20a22 22 0 0 1 44 0c0 8-4 14-10 20v8H38z" ${S5}/><path d="M40 72h20" ${S5}/><path d="M44 36l6 8 6-8" ${S5}/>` },
  aufzug: { s: `<rect x="26" y="14" width="48" height="66" ${S5}/><path d="M50 22l10 12H40zM50 72L40 60h20z" fill="#231F20"/>` },
  heizung: { l: "HEIZUNG", lc: "#2456A6", s: `<path d="M34 18c-6 8 6 12 0 20s6 12 0 20M50 18c-6 8 6 12 0 20s6 12 0 20M66 18c-6 8 6 12 0 20s6 12 0 20" ${S5}/><path d="M26 66h48" ${S5}/>` },
  klima: { s: `<circle cx="50" cy="48" r="32" ${S5}/><path d="M50 24v48M29 36l42 24M29 60l42-24M44 28l6 6 6-6M44 68l6-6 6 6" fill="none" stroke="#2456A6" stroke-width="5" stroke-linecap="round"/>` },
  lueftung: { s: `<circle cx="50" cy="48" r="32" ${S5}/>${[0, 90, 180, 270].map((w) => `<path transform="rotate(${w} 50 48)" d="M50 48c-4-10 0-22 12-24 2 8-2 18-12 24z" fill="#231F20"/>`).join("")}<circle cx="50" cy="48" r="4" fill="#fff" stroke="#231F20" stroke-width="3"/>` },
  kaelte: { s: `<path d="M40 16v40a12 12 0 1 0 10 0V16a5 5 0 0 0-10 0z" ${S5}/><circle cx="45" cy="66" r="6" fill="#29B6D8"/><path d="M62 24v24M52 30l20 12M52 42l20-12" fill="none" stroke="#29B6D8" stroke-width="4" stroke-linecap="round"/>` },
  sanitaer: { s: `<path d="M50 20c10 14 18 24 18 34a18 18 0 0 1-36 0c0-10 8-20 18-34z" fill="#2456A6"/><path d="M22 18h22v8" ${S5}/>` },
  elektro: { s: `<path d="M56 12L30 52h16l-6 32 28-42H52z" fill="#231F20"/>` },
  ga: { s: `<rect x="20" y="22" width="60" height="44" rx="3" ${S5}/><text x="50" y="54" text-anchor="middle" font-family="Calibri, Carlito, Arial" font-weight="700" font-size="24" fill="#231F20">GA</text><path d="M34 66v12M50 66v12M66 66v12" ${S5}/>` },
  it: { s: `<text x="50" y="66" text-anchor="middle" font-family="Calibri, Carlito, Arial" font-weight="700" font-size="50" fill="#231F20">IT</text>` },
  fenster: { s: `<rect x="24" y="16" width="52" height="62" ${S5}/><path d="M50 16v62M24 47h52" ${S5}/>` },
  tor: { s: `<path d="M18 36L50 16l32 20" ${S5}/><path d="M26 40v40M74 40v40M30 48h40M30 58h40M30 68h40M30 78h40" ${S5}/>` },
  schloss: { s: `<circle cx="50" cy="38" r="14" fill="#231F20"/><path d="M44 46h12l6 32H38z" fill="#231F20"/>` },
  dach: { s: `<path d="M14 50L50 18l36 32" ${S5}/><path d="M26 44v34h48V44" ${S5}/>` },
  baum: { s: `<circle cx="50" cy="36" r="22" fill="#231F20"/><path d="M50 50v30M38 80h24" ${S5}/>` },
  spiel: { s: `<path d="M20 80L36 18h28l16 62M36 18h28" ${S5}/><path d="M44 18v34M56 18v34M40 54h20" ${S5}/>` },
  regal: { s: `<rect x="24" y="14" width="52" height="68" ${S5}/><path d="M24 36h52M24 58h52M24 14l52 22M76 14L24 36" fill="none" stroke="#231F20" stroke-width="3"/>` },
  solar: { s: `<circle cx="50" cy="46" r="14" fill="#231F20"/>${Array.from({ length: 12 }, (_, i) => `<path transform="rotate(${i * 30} 50 46)" d="M50 18v8" ${S5}/>`).join("")}` },
  gefahr: { rahmenlos: true, s: `<rect x="17" y="17" width="66" height="66" transform="rotate(45 50 50)" fill="#F08A00" stroke="#231F20" stroke-width="3"/><path d="M50 30v26" stroke="#231F20" stroke-width="8" stroke-linecap="round"/><circle cx="50" cy="68" r="5" fill="#231F20"/>` },
};
const KAT_BILD_NAMEN = Object.keys(KAT_BILD);

/* Kategorien dauerhaft im Speicher halten (nicht bei jedem Speichern leeren) */
async function katLaden(neu = false) {
  if (!S.kat || neu) {
    const [k, g, t] = await Promise.all([api("GET", "kat_kategorien"), api("GET", "kat_gruppen"), api("GET", "kat_typen")]);
    S.kat = { k, g, t, kMap: Object.fromEntries(k.map((x) => [x.id, x])), gMap: Object.fromEntries(g.map((x) => [x.id, x])), tMap: Object.fromEntries(t.map((x) => [x.id, x])) };
  }
  return S.kat;
}
const katVon = (id) => (S.kat && id ? S.kat.kMap[id] : null);

function katSymbol(kat, groesse = 26) {
  if (!kat) return "";
  if (kat.symbol_id) { const e = eigenesSymbol(kat.symbol_id, groesse); if (e) return e; }
  const code = (kat.symbol || "").trim();
  if (code.startsWith("i:") && KAT_BILD[code.slice(2)]) {
    const b = KAT_BILD[code.slice(2)], farbe = KAT_FARBE[kat.farbe] || KAT_FARBE.Blau;
    const label = b.l ? `<text x="50" y="${b.l.length > 6 ? 86 : 88}" text-anchor="middle" font-family="Calibri, Carlito, Arial" font-weight="700" font-size="${b.l.length > 6 ? 13 : 18}" fill="${b.lc || "#231F20"}">${b.l}</text>` : "";
    const inhalt = b.l ? `<g transform="translate(9 0) scale(.82)">${b.s}</g>` : b.s;
    return `<svg class="zeichen-svg kat-svg" width="${groesse}" height="${groesse}" viewBox="0 0 100 100" role="img" aria-label="${esc(kat.name)}"><title>${esc(kat.name)}</title>
      ${b.rahmenlos ? "" : `<rect x="4" y="4" width="92" height="92" rx="3" fill="#fff" stroke="${farbe}" stroke-width="8"/>`}${inhalt}${label}</svg>`;
  }
  const z = zeichenSvg(code, groesse);
  if (z) return z;
  const farbe = KAT_FARBE[kat.farbe] || KAT_FARBE.Blau;
  const kurz = (code || kat.name).slice(0, 4);
  return `<svg class="zeichen-svg kat-svg" width="${groesse}" height="${groesse}" viewBox="0 0 100 100"><title>${esc(kat.name)}</title><rect x="4" y="4" width="92" height="92" rx="3" fill="#fff" stroke="${farbe}" stroke-width="8"/><text x="50" y="60" text-anchor="middle" font-family="Calibri, Carlito, Arial" font-weight="700" font-size="${kurz.length > 3 ? 24 : 30}" fill="${farbe}">${esc(kurz)}</text></svg>`;
}

/* Zusatzfelder einer Kategorie lesen: "Name; Art; Auswahl1, Auswahl2" */
function zusatzfelder(kat) {
  return (kat && kat.zusatzfelder ? kat.zusatzfelder : "").split("\n").map((z) => z.trim()).filter(Boolean).map((z) => {
    const [name, art = "Text", opt = ""] = z.split(";").map((x) => x.trim());
    return { name, art: art.toLowerCase(), optionen: opt.split(",").map((x) => x.trim()).filter(Boolean) };
  }).filter((f) => f.name);
}
const detailsVon = (a) => { try { return a.details ? JSON.parse(a.details) : {}; } catch (e) { return {}; } };
function detailWert(f, v) {
  if (v == null || v === "") return "";
  if (f.art.startsWith("ja")) return v ? "ja" : "nein";
  if (f.art === "datum") return datum(v);
  if (f.art === "zahl") return zahl(v);
  return esc(v);
}

async function detailsBearbeiten(a) {
  const kat = katVon(a.kategorie_id), felder = zusatzfelder(kat), d = detailsVon(a);
  const html = `<div class="dfehler"></div><form class="formular" onsubmit="return false">${felder.map((f, i) => {
    const v = d[f.name];
    if (f.art.startsWith("ja")) return `<label class="check"><input type="checkbox" data-z="${i}" ${v ? "checked" : ""}> ${esc(f.name)}</label>`;
    if (f.art === "auswahl") return `<label>${esc(f.name)}<select data-z="${i}"><option value="">–</option>${f.optionen.map((o) => `<option ${o === v ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></label>`;
    return `<label>${esc(f.name)}<input data-z="${i}" type="${f.art === "zahl" ? "number" : f.art === "datum" ? "date" : "text"}" step="any" value="${esc(v ?? "")}"></label>`;
  }).join("")}</form>`;
  const erg = await dialog(`Detailinfo ${kat.name}`, html, [{ text: "Abbrechen" }, {
    text: "Speichern", klasse: "haupt-k", aktion: async (hg) => {
      const neu = { ...d };
      felder.forEach((f, i) => {
        const el = hg.querySelector(`[data-z="${i}"]`);
        neu[f.name] = f.art.startsWith("ja") ? el.checked : f.art === "zahl" ? (el.value === "" ? null : Number(el.value)) : (el.value || null);
      });
      return api("PUT", `anlagen/${a.id}`, { details: neu });
    },
  }]);
  if (erg) { cacheLeeren(); melde("Gespeichert."); }
  return erg;
}

async function katalogZuordnen(a) {
  await katLaden();
  const felder = S.schema.anlagen.felder.filter((f) => ["kategorie_id", "gruppe_id", "typ_id"].includes(f.name));
  S.cache.kat_kategorien = S.kat.k; S.cache.kat_gruppen = S.kat.g; S.cache.kat_typen = S.kat.t;
  const html = `<div class="dfehler"></div><form class="formular" style="grid-template-columns:1fr" onsubmit="return false">
    ${felder.map((f) => `<label>${esc(f.label)}${eingabe(f, a[f.name])}</label>`).join("")}
    <p class="klein">Erst die Kategorie wählen, dann den Hersteller, dann die Bezeichnung. Fehlt etwas, lässt es sich unter „Katalog“ ergänzen.</p></form>`;
  const p = dialog("Aus dem Katalog zuordnen", html, [{ text: "Abbrechen" }, {
    text: "Speichern", klasse: "haupt-k", aktion: async (hg) => {
      const d = formularDaten(hg, "anlagen");
      const neu = { kategorie_id: d.kategorie_id, gruppe_id: d.gruppe_id, typ_id: d.typ_id };
      const kat = katVon(Number(d.kategorie_id));
      if (kat && !a.gewerk) neu.gewerk = kat.gewerk;
      return api("PUT", `anlagen/${a.id}`, neu);
    },
  }]);
  formularVerdrahten(letzterDialog());
  const erg = await p;
  if (erg) { cacheLeeren(); melde("Zugeordnet."); }
  return erg;
}

/* ---------- Katalogseite ---------- */
SEITEN.katalog = async (el, _, q) => {
  const k = await katLaden(true);
  await lade("symbole");
  const kid = Number(q.get("k")) || null, gid = Number(q.get("g")) || null, tid = Number(q.get("t")) || null;
  const pflegen = darf("katalog_bearbeiten");
  const kat = kid ? k.kMap[kid] : null, grp = gid ? k.gMap[gid] : null, typ = tid ? k.tMap[tid] : null;
  const ebene = typ ? 3 : grp ? 2 : kat ? 1 : 0;
  const link = (o) => "#/katalog?" + new URLSearchParams(Object.entries(o).filter(([, v]) => v)).toString();
  const reiter = [["Kategorie", link({})], kat && [kat.name + " · Gruppe", link({ k: kid })], grp && [grp.name + " · Bezeichnung", link({ k: kid, g: gid })], typ && ["Detailinfo", ""]].filter(Boolean);
  const neuKnopf = !pflegen ? "" : ebene === 0 ? `<button class="knopf haupt-k" data-neu="kat">${icon("plus")} Kategorie</button>`
    : ebene === 1 ? `<button class="knopf haupt-k" data-neu="grp">${icon("plus")} Hersteller / Gruppe</button><button class="knopf" data-edit="kat">Kategorie bearbeiten</button>`
      : ebene === 2 ? `<button class="knopf haupt-k" data-neu="typ">${icon("plus")} Bezeichnung</button><button class="knopf" data-edit="grp">Hersteller bearbeiten</button>`
        : `<button class="knopf" data-edit="typ">Bezeichnung bearbeiten</button>`;
  el.innerHTML = `<div class="kseite">` + seitenkopf("Katalog", "Kategorie › Hersteller › Bezeichnung", neuKnopf) + `
    <div class="kat-reiter">${reiter.map(([t, h], i) => `<a class="${i === reiter.length - 1 ? "an" : ""}" ${h ? `href="${h}"` : ""}>${esc(t)}${i < reiter.length - 1 || ebene < 3 ? " ›" : ""}</a>`).join("")}</div>
    <div class="werkzeug"><input type="search" id="ksuche" placeholder="Im Katalog suchen, z. B. T 30, GLORIA, Rauchmelder" style="flex:1;min-width:240px"></div>
    <div id="kinhalt"></div></div>`;
  const seite = el.querySelector(".kseite");
  const inhalt = el.querySelector("#kinhalt");
  const kachel = (href, kat_, titel, unter, editAttr) => `<a class="kachel" href="${href}">${katSymbol(kat_, 88)}<span class="k-titel">${esc(titel)}</span>${unter ? `<span class="klein">${esc(unter)}</span>` : ""}${pflegen && editAttr ? `<button class="k-stift" ${editAttr} title="Bearbeiten">✎</button>` : ""}</a>`;
  const zeichneEbene = async () => {
    if (ebene === 0) {
      const anzahl = (id) => k.g.filter((g) => g.kategorie_id === id).length;
      const maengel = await api("GET", "kat_maengel");
      const allg = maengel.filter((m) => !m.kategorie_id);
      inhalt.innerHTML = `<div class="kacheln">${k.k.map((x) => kachel(link({ k: x.id }), x, x.name, `${anzahl(x.id)} Hersteller`, `data-ek="${x.id}"`)).join("")}</div>
        <div class="abstand"></div><div class="karte"><h3>Allgemeine Mängel (für alle Kategorien)</h3><div id="km"></div></div>`;
      maengelListe(inhalt.querySelector("#km"), null);
    } else if (ebene === 1) {
      const gruppen = k.g.filter((g) => g.kategorie_id === kid);
      const anzahl = (id) => k.t.filter((t) => t.gruppe_id === id).length;
      const felder = zusatzfelder(kat);
      inhalt.innerHTML = `<div class="kacheln">${gruppen.map((g) => kachel(link({ k: kid, g: g.id }), kat, g.name, `${anzahl(g.id)} Bezeichnungen`, `data-eg="${g.id}"`)).join("") || '<div class="karte leer">Noch kein Hersteller.</div>'}</div>
        <div class="abstand"></div>
        <div class="raster k2"><div class="karte"><h3>Kategorie ${esc(kat.name)}</h3><div class="felder">
          <div class="feld"><div class="lbl">Gewerk</div><div class="val">${esc(kat.gewerk || "–")}</div></div>
          <div class="feld"><div class="lbl">Nummernkreis Inventar-Nr.</div><div class="val">${esc(kat.nummernkreis || "–")}</div></div>
          <div class="feld"><div class="lbl">Prüfung / Wartung / Kontrolle</div><div class="val">${[kat.pruefung_monate && `Prüfung ${zahl(kat.pruefung_monate)} M.`, kat.wartung_monate && `Wartung ${zahl(kat.wartung_monate)} M.`, kat.kontrolle_monate && `Kontrolle ${zahl(kat.kontrolle_monate)} M.`].filter(Boolean).join(" · ") || "–"}</div></div>
          <div class="feld breit"><div class="lbl">Grundlage (Vorschlag)</div><div class="val">${esc(kat.grundlage || "–")}</div></div>
          <div class="feld breit"><div class="lbl">Zusatzfelder in der Anlage</div><div class="val">${felder.length ? felder.map((f) => esc(f.name)).join(", ") : "–"}</div></div></div></div>
          <div class="karte"><h3>Mängelkatalog ${esc(kat.name)}</h3><div id="km"></div></div></div>`;
      maengelListe(inhalt.querySelector("#km"), kid);
    } else if (ebene === 2) {
      const typen = k.t.filter((t) => t.gruppe_id === gid);
      inhalt.innerHTML = `<div class="kacheln">${typen.map((t) => kachel(link({ k: kid, g: gid, t: t.id }), kat, t.name, "", `data-et="${t.id}"`)).join("") || '<div class="karte leer">Noch keine Bezeichnung.</div>'}</div>`;
    } else {
      const anl = await api("GET", `anlagen?typ_id=${tid}`);
      await lade("objekte");
      inhalt.innerHTML = `<div class="raster k2"><div class="karte typ-detail">${katSymbol(kat, 110)}<div class="felder">
          <div class="feld"><div class="lbl">Kategorie</div><div class="val">${esc(kat.name)}</div></div>
          <div class="feld"><div class="lbl">Hersteller / Gruppe</div><div class="val">${esc(grp.name)}</div></div>
          <div class="feld"><div class="lbl">Bezeichnung</div><div class="val"><b>${esc(typ.name)}</b></div></div>
          <div class="feld"><div class="lbl">Intervalle (Vorschlag)</div><div class="val">${[kat.pruefung_monate && `Prüfung ${zahl(kat.pruefung_monate)} M.`, kat.wartung_monate && `Wartung ${zahl(kat.wartung_monate)} M.`, kat.kontrolle_monate && `Kontrolle ${zahl(kat.kontrolle_monate)} M.`].filter(Boolean).join(" · ") || "–"}</div></div>
          ${typ.beschreibung ? `<div class="feld breit"><div class="lbl">Beschreibung</div><div class="val">${esc(typ.beschreibung)}</div></div>` : ""}</div>
          ${darf("anlagen_bearbeiten") ? '<div class="abstand"></div><button class="knopf haupt-k" id="anlNeu">Anlage mit diesem Typ anlegen</button>' : ""}</div>
        <div class="karte"><h3>Verbaut in ${anl.length} Anlage${anl.length === 1 ? "" : "n"}</h3>${anl.length ? `<ul class="liste-einfach">${anl.map((a) => `<li>${symbolVon(a, 24)}<a href="#/anlagen/${a.id}"><b>${esc(a.bezeichnung)}</b><br><span class="klein">${esc([a.nummer, refText("objekte", a.objekt_id), a.standort].filter(Boolean).join(" · "))}</span></a></li>`).join("")}</ul>` : '<p class="klein">Noch nirgends verbaut.</p>'}</div></div>`;
      const an = inhalt.querySelector("#anlNeu");
      if (an) an.onclick = async () => {
        const n = await bearbeiten("anlagen", null, { kategorie_id: kid, gruppe_id: gid, typ_id: tid, gewerk: kat.gewerk, bezeichnung: `${kat.name} ${typ.name}`, status: "In Betrieb" });
        if (n && n.id) location.hash = `#/anlagen/${n.id}`;
      };
    }
  };
  await zeichneEbene();

  /* Suche über alles */
  let st;
  el.querySelector("#ksuche").addEventListener("input", (e) => {
    clearTimeout(st);
    st = setTimeout(() => {
      const w = e.target.value.trim().toLowerCase();
      if (w.length < 2) { zeichneEbene(); return; }
      const kats = k.k.filter((x) => x.name.toLowerCase().includes(w));
      const grps = k.g.filter((x) => x.name.toLowerCase().includes(w));
      const typen = k.t.filter((x) => x.name.toLowerCase().includes(w)).slice(0, 80);
      inhalt.innerHTML = `${kats.length ? `<h3>Kategorien</h3><div class="kacheln">${kats.map((x) => kachel(link({ k: x.id }), x, x.name)).join("")}</div>` : ""}
        ${grps.length ? `<h3>Hersteller / Gruppen</h3><div class="kacheln">${grps.map((g) => kachel(link({ k: g.kategorie_id, g: g.id }), k.kMap[g.kategorie_id], g.name, k.kMap[g.kategorie_id]?.name)).join("")}</div>` : ""}
        ${typen.length ? `<h3>Bezeichnungen</h3><div class="kacheln">${typen.map((t) => kachel(link({ k: t.kategorie_id, g: t.gruppe_id, t: t.id }), k.kMap[t.kategorie_id], t.name, `${k.gMap[t.gruppe_id]?.name || ""} · ${k.kMap[t.kategorie_id]?.name || ""}`)).join("")}</div>` : ""}
        ${!kats.length && !grps.length && !typen.length ? '<div class="karte leer">Nichts gefunden.</div>' : ""}`;
    }, 200);
  });

  /* Anlegen und Bearbeiten */
  const nach = async (erg, ziel) => { if (!erg) return; await katLaden(true); if (erg === "geloescht") location.hash = ziel; else route(); };
  seite.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-neu],[data-edit],[data-ek],[data-eg],[data-et]");
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    if (b.dataset.neu === "kat") { const n = await bearbeiten("kat_kategorien", null, { farbe: "Blau", symbol: "i:tuer" }); if (n && n.id) { await katLaden(true); location.hash = link({ k: n.id }); } }
    if (b.dataset.neu === "grp") { const n = await bearbeiten("kat_gruppen", null, { kategorie_id: kid }); if (n && n.id) { await katLaden(true); location.hash = link({ k: kid, g: n.id }); } }
    if (b.dataset.neu === "typ") { const n = await bearbeiten("kat_typen", null, { kategorie_id: kid, gruppe_id: gid }); nach(n, ""); }
    if (b.dataset.edit === "kat") nach(await katBearbeiten(kat), link({}));
    if (b.dataset.edit === "grp") nach(await bearbeiten("kat_gruppen", grp), link({ k: kid }));
    if (b.dataset.edit === "typ") nach(await bearbeiten("kat_typen", typ), link({ k: kid, g: gid }));
    if (b.dataset.ek) nach(await katBearbeiten(k.kMap[b.dataset.ek]), link({}));
    if (b.dataset.eg) nach(await bearbeiten("kat_gruppen", k.gMap[b.dataset.eg]), link({ k: kid }));
    if (b.dataset.et) nach(await bearbeiten("kat_typen", k.tMap[b.dataset.et]), link({ k: kid, g: gid }));
  });
};

async function katBearbeiten(kat) {
  const p = bearbeiten("kat_kategorien", kat);
  const hg = letzterDialog();
  const feld = hg && hg.querySelector('[name="symbol"]');
  if (feld) {
    const hilfe = document.createElement("div");
    hilfe.className = "breit sym-wahl";
    hilfe.innerHTML = `<div class="klein">Symbol wählen:</div>${[...KAT_BILD_NAMEN.map((n) => "i:" + n), ...Object.keys(ZEICHEN), ...Object.keys(KUERZEL)].map((c) => `<button type="button" data-sym="${c}" title="${c}">${katSymbol({ name: c, symbol: c, farbe: kat.farbe }, 34)}</button>`).join("")}`;
    feld.closest("label").after(hilfe);
    hilfe.onclick = (e) => { const b = e.target.closest("[data-sym]"); if (b) { feld.value = b.dataset.sym; hilfe.querySelectorAll("button").forEach((x) => x.classList.toggle("an", x === b)); } };
  }
  return p;
}

async function maengelListe(ziel, kid) {
  const alle = await api("GET", "kat_maengel");
  const liste = alle.filter((m) => (kid ? m.kategorie_id === kid : !m.kategorie_id));
  const pflegen = darf("katalog_bearbeiten");
  ziel.innerHTML = `${liste.length ? `<ul class="liste-einfach">${liste.map((m) => `<li class="${pflegen ? "klickbar-li" : ""}" data-m="${m.id}"><span>${esc(m.text)}${m.bereich ? ` <span class="klein">[${esc(m.bereich)}]</span>` : ""}</span>
      <span class="rechts">${gefMarke(m.gefaehrdung)} ${m.frist_tage ? `<span class="klein">${zahl(m.frist_tage)} T.</span>` : ""}</span></li>`).join("")}</ul>` : '<p class="klein">Noch keine Mängel hinterlegt.</p>'}
    ${pflegen ? `<button class="knopf klein" data-mneu>${icon("plus")} Mangel</button>` : ""}`;
  ziel.onclick = async (e) => {
    if (e.target.closest("[data-mneu]")) { if (await bearbeiten("kat_maengel", null, { kategorie_id: kid, gefaehrdung: "mittel", frist_tage: 14 })) maengelListe(ziel, kid); return; }
    const li = e.target.closest("[data-m]");
    if (li && pflegen && await bearbeiten("kat_maengel", liste.find((m) => m.id === Number(li.dataset.m)))) maengelListe(ziel, kid);
  };
}

function gefMarke(g) {
  return g ? `<span class="marke gef-${esc(g)}">${esc(g)}</span>` : "";
}

/* ---------- Katalog in der Plan-Seitenleiste ---------- */
function zuletztGenutzt(neu) {
  let liste = [];
  try { liste = JSON.parse(localStorage.getItem("cafm-zuletzt") || "[]"); } catch (e) { liste = []; }
  if (neu) {
    liste = [neu, ...liste.filter((x) => x !== neu)].slice(0, 8);
    try { localStorage.setItem("cafm-zuletzt", JSON.stringify(liste)); } catch (e) { /* egal */ }
  }
  return liste;
}

function katalogPaletteItem(t) {
  const kat = S.kat.kMap[t.kategorie_id], grp = S.kat.gMap[t.gruppe_id];
  return `<div class="p-item" data-typ="${t.id}" data-vorlage="${esc(kat.name)}" data-gewerk="${esc(kat.gewerk || "")}" title="${esc(kat.name)} · ${esc(grp ? grp.name : "")} · ${esc(t.name)}">${katSymbol(kat, 26)}<span>${esc(t.name)}<br><span class="klein">${esc(grp ? grp.name : "")}</span></span></div>`;
}

function katalogPalette(ziel, suche = "") {
  const k = S.kat;
  if (!k) return;
  if (suche) {
    const w = suche.toLowerCase();
    const treffer = k.t.filter((t) => [t.name, k.gMap[t.gruppe_id]?.name, k.kMap[t.kategorie_id]?.name].join(" ").toLowerCase().includes(w)).slice(0, 60);
    ziel.innerHTML = `<h3>Katalog <span class="klein">${treffer.length} Treffer</span></h3>${treffer.map(katalogPaletteItem).join("") || '<p class="klein">Nichts gefunden.</p>'}`;
    return;
  }
  const zuletzt = zuletztGenutzt().map((id) => k.tMap[id]).filter(Boolean);
  ziel.innerHTML = `${zuletzt.length ? `<details open><summary><span class="sym" style="--c:var(--anthrazit)">↺</span> Zuletzt benutzt</summary>${zuletzt.map(katalogPaletteItem).join("")}</details>` : ""}
    <h3>Katalog</h3>${k.k.map((kat) => `<details data-kk="${kat.id}"><summary>${katSymbol(kat, 24)} ${esc(kat.name)}</summary><div class="kk-inhalt"></div></details>`).join("")}`;
  ziel.querySelectorAll("details[data-kk]").forEach((d) => d.addEventListener("toggle", () => {
    const box = d.querySelector(".kk-inhalt");
    if (!d.open || box.dataset.fertig) return;
    const kid = Number(d.dataset.kk);
    box.innerHTML = k.g.filter((g) => g.kategorie_id === kid).map((g) => `<details class="kk-grp"><summary>${esc(g.name)}</summary>${k.t.filter((t) => t.gruppe_id === g.id).map(katalogPaletteItem).join("")}</details>`).join("");
    box.dataset.fertig = "1";
  }));
}
