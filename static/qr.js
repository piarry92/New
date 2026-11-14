/* Casa CAFM – QR-Code je Anlage: Etikett, Mangel melden (mit und ohne Anmeldung) */
"use strict";

/* ---------- QR-Code als SVG ---------- */
function qrSvg(text, groesse = 160) {
  const qr = qrcode(0, "M");
  qr.addData(text, "Byte");
  qr.make();
  const n = qr.getModuleCount(), rand = 2, ges = n + rand * 2;
  let pfad = "";
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) pfad += `M${x + rand} ${y + rand}h1v1h-1z`;
  return `<svg class="qr-svg" width="${groesse}" height="${groesse}" viewBox="0 0 ${ges} ${ges}" shape-rendering="crispEdges" role="img" aria-label="QR-Code"><rect width="${ges}" height="${ges}" fill="#fff"/><path d="${pfad}" fill="#000"/></svg>`;
}

let EINST = null;
async function einstellungenLaden(neu = false) {
  if (!EINST || neu) { try { EINST = await api("GET", "einstellungen"); } catch (e) { EINST = { basis_url: "", oeffentlich_melden: "1" }; } }
  return EINST;
}
const qrAdresse = (token) => `${(EINST && EINST.basis_url) || location.origin}/m/${encodeURIComponent(token)}`;
const adresseLokal = () => !(EINST && EINST.basis_url) && /^(localhost|127\.|\[::1\])/.test(location.hostname);

/* ---------- Bilder verkleinern (für Meldungen) ---------- */
async function bildVerkleinern(datei, max = 1600) {
  const url = URL.createObjectURL(datei);
  try {
    const img = await new Promise((ok, nein) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => nein(new Error("Das Foto lässt sich nicht öffnen.")); i.src = url; });
    const f = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * f); c.height = Math.round(img.naturalHeight * f);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.82).split(",")[1];
  } finally { URL.revokeObjectURL(url); }
}

/* ---------- Etiketten drucken ---------- */
async function etikettenDrucken(anlagen, titel = "QR-Etiketten") {
  await einstellungenLaden();
  const mit = anlagen.filter((a) => a.qr_token);
  if (!mit.length) { melde("Keine Anlagen mit QR-Code gefunden.", true); return; }
  if (adresseLokal()) melde("Hinweis: Die Adresse ist „localhost“. Handys erreichen das nicht. Bitte in den Einstellungen die Adresse des Programms eintragen.", true);
  const objekte = Object.fromEntries((S.cache.objekte || []).map((o) => [o.id, anzeige("objekte", o)]));
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${esc(titel)}</title><style>
    @font-face { font-family: Carlito; src: url("${location.origin}/schrift/Carlito-Regular.ttf"); }
    @font-face { font-family: Carlito; src: url("${location.origin}/schrift/Carlito-Bold.ttf"); font-weight: 700; }
    @page { size: A4; margin: 10mm; }
    body { font-family: Calibri, Carlito, sans-serif; margin: 0; color: #3C3C3B; }
    .bogen { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
    .et { border: 0.3mm solid #D9DADB; border-radius: 3mm; height: 62mm; padding: 4mm; display: grid; grid-template-columns: 1fr 40mm; gap: 3mm; break-inside: avoid; box-sizing: border-box; position: relative; }
    .et::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 2mm; background: #E63713; border-radius: 3mm 0 0 3mm; }
    .links { display: flex; flex-direction: column; padding-left: 2mm; min-width: 0; }
    .logo { width: 30mm; margin-bottom: 3mm; }
    .nr { font-size: 9pt; color: #E63713; font-weight: 700; letter-spacing: .05em; }
    .name { font-size: 13pt; font-weight: 700; line-height: 1.15; margin: 1mm 0; overflow: hidden; }
    .ort { font-size: 8.5pt; color: #626366; }
    .ruf { margin-top: auto; font-size: 10pt; font-weight: 700; }
    .ruf small { display: block; font-weight: 400; font-size: 7.5pt; color: #939598; word-break: break-all; }
    .qr { display: flex; flex-direction: column; align-items: center; }
    .qr svg.qr-svg { width: 40mm; height: 40mm; display: block; }
    .qr .z { display: flex; justify-content: center; margin-top: 2mm; }
    .qr .z svg { width: 10mm; height: 10mm; display: block; }
  </style></head><body><div class="bogen">${mit.map((a) => `<div class="et"><div class="links">
      <img class="logo" src="${location.origin}/logo.png" alt="Casa Concept Consulting">
      ${a.nummer ? `<div class="nr">${esc(a.nummer)}</div>` : ""}<div class="name">${esc(a.bezeichnung)}</div>
      <div class="ort">${esc([objekte[a.objekt_id], a.standort].filter(Boolean).join(" · "))}</div>
      <div class="ruf">Mangel? QR-Code scannen und melden.<small>${esc(qrAdresse(a.qr_token))}</small></div></div>
      <div class="qr">${qrSvg(qrAdresse(a.qr_token), 150)}<div class="z">${zeichenSvg(zeichenCode(a.planzeichen), 34)}</div></div></div>`).join("")}</div>
    <script>window.onload = () => setTimeout(() => print(), 300);<\/script></body></html>`;
  const fenster = window.open("", "_blank");
  if (!fenster) { melde("Das Druckfenster wurde blockiert. Bitte Pop-ups für diese Seite erlauben.", true); return; }
  fenster.document.open(); fenster.document.write(html); fenster.document.close();
}

/* ---------- QR-Karte auf der Anlagenseite ---------- */
async function qrKarte(ziel, a) {
  await einstellungenLaden();
  const url = qrAdresse(a.qr_token);
  ziel.innerHTML = `<h3>QR-Code der Anlage</h3>
    <div class="qr-karte"><a href="${esc(url)}" target="_blank" rel="noopener" title="Link öffnen">${qrSvg(url, 150)}</a>
    <div><p class="klein">Wer den Code scannt, kommt direkt zu dieser Anlage und kann einen Mangel melden${EINST.oeffentlich_melden === "1" ? ", auch ohne Anmeldung" : ""}.</p>
      <div class="qr-link"><input type="text" readonly value="${esc(url)}" aria-label="Link"><button class="knopf klein" data-qr="kopie">Kopieren</button></div>
      ${adresseLokal() ? '<div class="warnung klein">Die Adresse ist „localhost“. Handys erreichen das nicht. Ein Administrator trägt unter Einstellungen die richtige Adresse ein.</div>' : ""}
      <div class="qr-knoepfe"><button class="knopf haupt-k klein" data-qr="druck">Etikett drucken</button>
      ${darf("tickets_anlegen") ? '<button class="knopf klein" data-qr="mangel">Mangel melden</button>' : ""}${darf("anlagen_bearbeiten") ? '<button class="knopf klein" data-qr="neu">Neuen Code erzeugen</button>' : ""}</div></div></div>`;
  ziel.onclick = async (e) => {
    const k = e.target.closest("[data-qr]");
    if (!k) return;
    if (k.dataset.qr === "kopie") { try { await navigator.clipboard.writeText(url); melde("Link kopiert."); } catch (err) { ziel.querySelector("input").select(); } }
    if (k.dataset.qr === "druck") etikettenDrucken([a], a.bezeichnung);
    if (k.dataset.qr === "mangel") mangelDialog(a);
    if (k.dataset.qr === "neu") {
      if (!confirm("Neuen QR-Code erzeugen? Der alte Code funktioniert danach nicht mehr. Aufgeklebte Etiketten müssen getauscht werden.")) return;
      const r = await api("POST", `anlagen/${a.id}/qr-neu`);
      a.qr_token = r.qr_token; melde("Neuer QR-Code erzeugt."); qrKarte(ziel, a);
    }
  };
}

/* ---------- Mangel melden (angemeldet) ---------- */
async function mangelDialog(a) {
  await Promise.all([katLaden(), lade("dienstleister"), lade("objekte")]);
  const kat = katVon(a.kategorie_id);
  const alle = await api("GET", "kat_maengel");
  const maengel = [...alle.filter((m) => kat && m.kategorie_id === kat.id), ...alle.filter((m) => !m.kategorie_id)];
  const bereiche = [...new Set(maengel.map((m) => m.bereich).filter(Boolean))];
  const plusTage = (t) => { const d = new Date(); d.setDate(d.getDate() + Number(t || 14)); return d.toISOString().slice(0, 10); };
  const dl = S.cache.dienstleister || [];
  const html = `<div class="mangel-fenster">
    <aside class="mf-links">${symbolVon(a, 88)}
      <div class="lbl">Bauteil</div><div>${esc([kat ? kat.name : a.gewerk, refText("kat_gruppen", a.gruppe_id), refText("kat_typen", a.typ_id)].filter((x) => x && !String(x).startsWith("#")).join("\n") || a.bezeichnung).replace(/\n/g, "<br>")}</div>
      <div class="lbl">Anlage</div><div>${esc(a.bezeichnung)}</div>
      <div class="lbl">Standort</div><div>${esc([refText("objekte", a.objekt_id), a.standort].filter(Boolean).join(" · ") || "–")}</div>
      <div class="lbl">Inventar-Nr.</div><div>${esc(a.nummer || "–")}</div>
      <div class="lbl">Zuständig</div><div>${esc(refText("dienstleister", a.dienstleister_id) || a.beauftragter || "–")}</div>
    </aside>
    <div><div class="dfehler"></div><form class="formular" onsubmit="return false">
      <label><span>Typ</span><select name="art"><option>Mangel</option><option>Störung</option><option>Hinweis</option></select></label>
      <label><span>Bereich</span><select name="bereich"><option value="">Alle Bereiche</option>${bereiche.map((b) => `<option>${esc(b)}</option>`).join("")}</select></label>
      <label class="breit"><span>Mangel aus dem Katalog</span><select name="mangel"><option value="">– eigener Text –</option>${maengel.map((m) => `<option value="${esc(m.text)}" data-bereich="${esc(m.bereich || "")}" data-gef="${esc(m.gefaehrdung || "")}" data-tage="${m.frist_tage || ""}">${esc(m.text)}${m.bereich ? ` [${esc(m.bereich)}]` : ""}</option>`).join("")}</select></label>
      <label class="breit"><span>Beschreibung</span><textarea name="beschreibung" maxlength="1024" placeholder="Was genau ist los? Wo genau?"></textarea><span class="klein" data-rest>noch 1024 Zeichen</span></label>
      <label><span>Gefährdung</span><select name="gefaehrdung">${["gering", "mittel", "hoch"].map((g) => `<option ${g === "mittel" ? "selected" : ""}>${g}</option>`).join("")}</select></label>
      <label><span>Frist bis</span><input type="date" name="faellig_am" value="${plusTage(14)}"></label>
      <label class="breit"><span>Zuständig (Dienstleister)</span><select name="dienstleister_id"><option value="">–</option>${dl.map((d) => `<option value="${d.id}" ${d.id === a.dienstleister_id ? "selected" : ""}>${esc(d.firma)}</option>`).join("")}</select></label>
      <label class="breit"><span>Fotos (bis zu 4)</span><input type="file" name="fotos" accept="image/*" capture="environment" multiple></label>
      <div class="breit foto-vorschau" data-fv></div>
    </form></div></div>`;
  const p = dialog(`Mangel erfassen`, html, [{ text: "Abbrechen" }, {
    text: "Speichern", klasse: "haupt-k", aktion: async (hg) => {
      const fm = hg.querySelector("form");
      if (!fm.mangel.value && fm.beschreibung.value.trim().length < 3) throw new Error("Bitte einen Mangel wählen oder kurz beschreiben.");
      const fotos = [];
      for (const d of [...fm.fotos.files].slice(0, 4)) fotos.push(await bildVerkleinern(d));
      return api("POST", `qr/${encodeURIComponent(a.qr_token)}/meldung`, {
        art: fm.art.value, mangel: fm.mangel.value, beschreibung: fm.beschreibung.value, gefaehrdung: fm.gefaehrdung.value,
        faellig_am: fm.faellig_am.value, dienstleister_id: fm.dienstleister_id.value || null, fotos,
      });
    },
  }]);
  const hg = letzterDialog(), fm = hg.querySelector("form");
  fm.bereich.onchange = () => fm.mangel.querySelectorAll("option[data-bereich]").forEach((o) => { o.hidden = !!fm.bereich.value && o.dataset.bereich !== fm.bereich.value; });
  fm.mangel.onchange = () => {
    const o = fm.mangel.selectedOptions[0];
    if (o && o.dataset.gef) fm.gefaehrdung.value = o.dataset.gef;
    if (o && o.dataset.tage) fm.faellig_am.value = plusTage(o.dataset.tage);
  };
  fm.beschreibung.oninput = () => { hg.querySelector("[data-rest]").textContent = `noch ${1024 - fm.beschreibung.value.length} Zeichen`; };
  fm.fotos.onchange = () => {
    hg.querySelector("[data-fv]").innerHTML = [...fm.fotos.files].slice(0, 4).map((d) => `<img src="${URL.createObjectURL(d)}" alt="">`).join("");
  };
  const erg = await p;
  if (erg) { cacheLeeren(); melde(`Eintrag ${erg.nummer} angelegt.`); if (erg.ticket_id) location.hash = `#/tickets/${erg.ticket_id}`; }
}

/* ---------- Öffentliche Seite nach dem Scannen ---------- */
async function qrSeite(token) {
  document.title = "Mangel melden · Casa Concept Consulting";
  let info;
  try { info = await api("GET", "qr/" + encodeURIComponent(token)); }
  catch (e) {
    $app.innerHTML = `<div class="qr-seite"><header><img class="logo-hell" src="/logo.png" alt="Casa Concept Consulting"><img class="logo-dunkel" src="/logo-negativ.png" alt="Casa Concept Consulting"></header><div class="karte"><h2>QR-Code nicht gefunden</h2><p>${esc(e.message)}</p></div></div>`;
    return;
  }
  if (info.angemeldet && info.anlage_id) { location.replace(`/#/anlagen/${info.anlage_id}?mangel=1`); return; }
  const a = info.anlage;
  const kopf = `<header><img class="logo-hell" src="/logo.png" alt="Casa Concept Consulting"><img class="logo-dunkel" src="/logo-negativ.png" alt="Casa Concept Consulting"></header>
    <div class="karte qr-anlage">${zeichenSvg(zeichenCode(a.planzeichen), 48) || (a.kat_symbol ? katSymbol({ name: a.kategorie, symbol: a.kat_symbol, farbe: a.kat_farbe }, 48) : "")}<div>${a.nummer ? `<div class="kicker">${esc(a.nummer)}</div>` : ""}<h1>${esc(a.bezeichnung)}</h1>
      <div class="klein">${esc([a.objekt, a.standort].filter(Boolean).join(" · "))}</div>${a.anschrift ? `<div class="klein">${esc(a.anschrift)}</div>` : ""}</div></div>`;
  const anmelden = `<p class="klein qr-mitarbeiter">Sie arbeiten bei Casa? <a href="/?qr=${encodeURIComponent(token)}">Anmelden und Anlage öffnen</a></p>`;
  if (!info.oeffentlich) {
    $app.innerHTML = `<div class="qr-seite">${kopf}<div class="karte"><p>Meldungen über diesen Code sind nur für angemeldete Mitarbeitende möglich.</p><a class="knopf haupt-k" href="/?qr=${encodeURIComponent(token)}">Anmelden</a></div></div>`;
    return;
  }
  $app.innerHTML = `<div class="qr-seite">${kopf}
    <form class="karte formular" id="qf" style="grid-template-columns:1fr" novalidate>
      <h2>Mangel melden</h2>
      <div class="dfehler" id="qfe"></div>
      ${(info.maengel || []).length ? `<label><span>Was ist das Problem?</span><select name="mangel"><option value="">Bitte wählen oder unten beschreiben</option>${info.maengel.map((m) => `<option>${esc(m)}</option>`).join("")}</select></label>` : ""}
      <label><span class="${(info.maengel || []).length ? "" : "pflicht"}">${(info.maengel || []).length ? "Beschreibung" : "Was ist das Problem?"}</span><textarea name="beschreibung" placeholder="Bitte kurz beschreiben, was nicht funktioniert oder beschädigt ist."></textarea></label>
      <label class="check"><input type="checkbox" name="dringend"> Dringend: Gefahr für Personen oder Ausfall</label>
      <label><span>Fotos (bis zu 4, freiwillig)</span><input type="file" name="fotos" accept="image/*" capture="environment" multiple></label>
      <label><span class="pflicht">Ihr Name</span><input name="name" required autocomplete="name"></label>
      <label><span>Telefon oder E-Mail für Rückfragen</span><input name="kontakt" autocomplete="email"></label>
      <p class="klein">Ihre Angaben nutzen wir nur, um den Mangel zu bearbeiten und bei Rückfragen Kontakt aufzunehmen.</p>
      <button class="knopf haupt-k gross-k" type="submit">Meldung senden</button>
      <p class="klein">Bei Gefahr für Leib und Leben rufen Sie bitte sofort den Notruf <a href="tel:112">112</a>.</p>
    </form>${anmelden}</div>`;
  const fm = document.getElementById("qf");
  fm.onsubmit = async (e) => {
    e.preventDefault();
    const knopf = fm.querySelector("button[type=submit]");
    knopf.disabled = true; knopf.textContent = "Wird gesendet …";
    try {
      const fotos = [];
      for (const d of [...fm.fotos.files].slice(0, 4)) fotos.push(await bildVerkleinern(d));
      const r = await api("POST", `qr/${encodeURIComponent(token)}/meldung`, { mangel: fm.mangel ? fm.mangel.value : "", beschreibung: fm.beschreibung.value, dringend: fm.dringend.checked, name: fm.name.value, kontakt: fm.kontakt.value, fotos });
      $app.innerHTML = `<div class="qr-seite">${kopf}<div class="karte qr-danke"><div class="haken">✓</div><h2>Vielen Dank!</h2>
        <p>Ihre Meldung ist bei uns eingegangen. Die Nummer lautet <b>${esc(r.nummer)}</b>.</p><p class="klein">Wir kümmern uns darum. Bei Rückfragen melden wir uns.</p>
        <button class="knopf" onclick="location.reload()">Weiteren Mangel melden</button></div></div>`;
    } catch (err) {
      document.getElementById("qfe").innerHTML = `<div class="fehler">${esc(err.message)}</div>`;
      knopf.disabled = false; knopf.textContent = "Meldung senden";
    }
  };
}

/* ======================= Mieter-QR-Code je Objekt ======================= */
const objektQrAdresse = (token) => `${(EINST && EINST.basis_url) || location.origin}/m/o/${encodeURIComponent(token)}`;

async function objektQrKarte(ziel, o) {
  await einstellungenLaden();
  if (!o.qr_token) { ziel.innerHTML = '<h3>QR-Code für Mieter</h3><p class="klein">Bitte das Programm neu starten, dann erscheint der Code.</p>'; return; }
  const url = objektQrAdresse(o.qr_token);
  const an = EINST.oeffentlich_objekt !== "0";
  ziel.innerHTML = `<h3>QR-Code für Mieter</h3>
    <div class="qr-karte"><a href="${esc(url)}" target="_blank" rel="noopener" title="Meldeseite öffnen">${qrSvg(url, 140)}</a>
    <div><p class="klein">Zum Aushang im Haus. Mieter scannen den Code und melden einen Mangel, ${an ? "<b>ohne Anmeldung</b>" : "<b>derzeit nur mit Anmeldung</b> (unter Einstellungen änderbar)"}. Die Meldung landet unter Mängel &amp; Störungen.</p>
      <div class="qr-link"><input type="text" readonly value="${esc(url)}" aria-label="Link"><button class="knopf klein" data-oq="kopie">Kopieren</button></div>
      ${adresseLokal() ? '<div class="warnung klein">Die Adresse ist „localhost“. Handys erreichen das nicht. Ein Administrator trägt unter Einstellungen die richtige Adresse ein.</div>' : ""}
      <div class="qr-knoepfe"><button class="knopf haupt-k klein" data-oq="aushang">Aushang drucken (A4)</button>
      ${darf("anlagen_bearbeiten") ? '<button class="knopf klein" data-oq="neu">Neuen Code erzeugen</button>' : ""}</div></div></div>`;
  ziel.onclick = async (e) => {
    const k = e.target.closest("[data-oq]");
    if (!k) return;
    if (k.dataset.oq === "kopie") { try { await navigator.clipboard.writeText(url); melde("Link kopiert."); } catch (err) { ziel.querySelector("input").select(); } }
    if (k.dataset.oq === "aushang") aushangDrucken(o);
    if (k.dataset.oq === "neu") {
      if (!confirm("Neuen QR-Code erzeugen? Der alte Code funktioniert danach nicht mehr. Aushänge müssen getauscht werden.")) return;
      const r = await api("POST", `objekte/${o.id}/qr-neu`);
      o.qr_token = r.qr_token; melde("Neuer QR-Code erzeugt."); objektQrKarte(ziel, o);
    }
  };
}

async function aushangDrucken(o) {
  await einstellungenLaden();
  if (adresseLokal()) melde("Hinweis: Die Adresse ist „localhost“. Handys erreichen das nicht. Bitte in den Einstellungen die Adresse des Programms eintragen.", true);
  const url = objektQrAdresse(o.qr_token);
  const adresse = [o.strasse, [o.plz, o.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Aushang Mängelmeldung ${esc(o.kuerzel)}</title><style>
    @font-face { font-family: Carlito; src: url("${location.origin}/schrift/Carlito-Regular.ttf"); }
    @font-face { font-family: Carlito; src: url("${location.origin}/schrift/Carlito-Bold.ttf"); font-weight: 700; }
    @page { size: A4; margin: 0; }
    html, body { margin: 0; }
    body { font-family: Calibri, Carlito, sans-serif; color: #3C3C3B; width: 210mm; height: 297mm; box-sizing: border-box; padding: 18mm 18mm 14mm; display: flex; flex-direction: column; position: relative; }
    body::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 6mm; background: #E63713; }
    .kopf { display: flex; justify-content: space-between; align-items: flex-start; }
    .kopf img { width: 62mm; }
    .objekt { text-align: right; font-size: 11pt; color: #626366; }
    .objekt b { display: block; color: #3C3C3B; font-size: 13pt; }
    h1 { font-size: 40pt; line-height: 1.05; margin: 22mm 0 6mm; letter-spacing: -.01em; }
    h1 span { color: #E63713; }
    .unter { font-size: 15pt; margin: 0 0 12mm; color: #626366; max-width: 150mm; }
    .qr { display: flex; gap: 12mm; align-items: center; }
    .qr svg { width: 82mm; height: 82mm; border: 0.4mm solid #D9DADB; border-radius: 4mm; padding: 3mm; }
    ol { font-size: 15pt; line-height: 1.5; padding-left: 7mm; margin: 0; }
    ol li { margin-bottom: 3mm; }
    .link { margin-top: 10mm; font-size: 10pt; color: #939598; word-break: break-all; }
    .fuss { margin-top: auto; border-top: 0.4mm solid #D9DADB; padding-top: 5mm; display: flex; justify-content: space-between; font-size: 11pt; }
    .notruf { background: #9E1830; color: #fff; padding: 3mm 5mm; border-radius: 2mm; font-weight: 700; }
  </style></head><body>
    <div class="kopf"><img src="${location.origin}/logo.png" alt="Casa Concept Consulting"><div class="objekt"><b>${esc(o.name)}</b>${esc(adresse)}</div></div>
    <h1>Etwas defekt?<br><span>Einfach melden.</span></h1>
    <p class="unter">Sehr geehrte Mieterinnen und Mieter, Schäden und Störungen im Haus können Sie hier direkt an uns melden, ohne Anmeldung.</p>
    <div class="qr">${qrSvg(url, 300)}<ol><li>QR-Code mit der Handy-Kamera scannen</li><li>Kurz beschreiben, was nicht stimmt, gern mit Foto</li><li>Absenden. Wir kümmern uns darum.</li></ol></div>
    <div class="link">Oder im Browser öffnen: ${esc(url)}</div>
    <div class="fuss"><span>Casa Concept Consulting GmbH &amp; Co. KG · www.ccc-frankfurt.com</span><span class="notruf">Bei Gefahr: Notruf 112</span></div>
    <script>window.onload = () => setTimeout(() => print(), 300);<\/script></body></html>`;
  const f = window.open("", "_blank");
  if (!f) { melde("Das Druckfenster wurde blockiert. Bitte Pop-ups für diese Seite erlauben.", true); return; }
  f.document.open(); f.document.write(html); f.document.close();
}

async function qrObjektSeite(token) {
  document.title = "Mangel melden · Casa Concept Consulting";
  const logo = '<header><img class="logo-hell" src="/logo.png" alt="Casa Concept Consulting"><img class="logo-dunkel" src="/logo-negativ.png" alt="Casa Concept Consulting"></header>';
  let info;
  try { info = await api("GET", "qr/o/" + encodeURIComponent(token)); }
  catch (e) { $app.innerHTML = `<div class="qr-seite">${logo}<div class="karte"><h2>QR-Code nicht gefunden</h2><p>${esc(e.message)}</p></div></div>`; return; }
  if (info.angemeldet && info.objekt_id) { location.replace(`/#/objekte/${info.objekt_id}?melden=1`); return; }
  const o = info.objekt;
  const kopf = `${logo}<div class="karte qr-objekt">${o.bild ? `<img class="qo-bild" src="/api/qr/o/${encodeURIComponent(token)}/bild" alt="">` : ""}
    <div class="qo-text"><div class="kicker">${esc(o.kuerzel)}</div><h1>${esc(o.name)}</h1><div class="klein">${esc(o.anschrift)}</div></div></div>`;
  if (!info.oeffentlich) {
    $app.innerHTML = `<div class="qr-seite">${kopf}<div class="karte"><p>Meldungen über diesen Code sind gerade abgeschaltet. Bitte wenden Sie sich an die Hausverwaltung.</p><p class="klein">Bei Gefahr für Leib und Leben rufen Sie bitte sofort den Notruf <a href="tel:112">112</a>.</p></div></div>`;
    return;
  }
  $app.innerHTML = `<div class="qr-seite">${kopf}
    <form class="karte formular" id="qof" style="grid-template-columns:1fr" novalidate>
      <h2>Mangel melden</h2>
      <div id="qofe"></div>
      <label><span>Worum geht es?</span><select name="thema">${info.themen.map((t) => `<option>${esc(t)}</option>`).join("")}</select></label>
      <label><span>Wo genau?</span>${info.bereiche.length ? `<select name="bereich"><option value="">Bitte wählen</option>${info.bereiche.map((b) => `<option>${esc(b)}</option>`).join("")}<option>Außenbereich</option><option>Tiefgarage</option></select>` : ""}
        <input name="ort" placeholder="z. B. 3. OG, Damen-WC links, Treppenhaus Nord"></label>
      <label><span class="pflicht">Was ist passiert?</span><textarea name="beschreibung" placeholder="Bitte kurz beschreiben, was nicht funktioniert oder beschädigt ist."></textarea></label>
      <label class="check"><input type="checkbox" name="dringend"> Dringend: Gefahr für Personen, Wasser läuft aus oder Ausfall</label>
      <label><span>Fotos (bis zu 4, freiwillig)</span><input type="file" name="fotos" accept="image/*" capture="environment" multiple></label>
      <label><span class="pflicht">Ihr Name</span><input name="name" autocomplete="name"></label>
      <label><span>Telefon oder E-Mail für Rückfragen</span><input name="kontakt" autocomplete="email"></label>
      <p class="klein">Ihre Angaben nutzen wir nur, um die Meldung zu bearbeiten und bei Rückfragen Kontakt aufzunehmen.</p>
      <button class="knopf haupt-k gross-k" type="submit">Meldung senden</button>
      <p class="klein">Bei Gefahr für Leib und Leben rufen Sie bitte sofort den Notruf <a href="tel:112">112</a>.</p>
    </form></div>`;
  const fm = document.getElementById("qof");
  fm.onsubmit = async (e) => {
    e.preventDefault();
    const knopf = fm.querySelector("button[type=submit]");
    knopf.disabled = true; knopf.textContent = "Wird gesendet …";
    try {
      const fotos = [];
      for (const d of [...fm.fotos.files].slice(0, 4)) fotos.push(await bildVerkleinern(d));
      const bereich = [fm.bereich ? fm.bereich.value : "", fm.ort.value.trim()].filter(Boolean).join(", ");
      const r = await api("POST", `qr/o/${encodeURIComponent(token)}/meldung`, { thema: fm.thema.value, bereich, beschreibung: fm.beschreibung.value, dringend: fm.dringend.checked, name: fm.name.value, kontakt: fm.kontakt.value, fotos });
      $app.innerHTML = `<div class="qr-seite">${kopf}<div class="karte qr-danke"><div class="haken">✓</div><h2>Vielen Dank!</h2>
        <p>Ihre Meldung ist bei uns eingegangen. Die Nummer lautet <b>${esc(r.nummer)}</b>.</p><p class="klein">Wir kümmern uns darum. Bei Rückfragen melden wir uns.</p>
        <button class="knopf" onclick="location.reload()">Weitere Meldung</button></div></div>`;
    } catch (err) {
      document.getElementById("qofe").innerHTML = `<div class="fehler">${esc(err.message)}</div>`;
      knopf.disabled = false; knopf.textContent = "Meldung senden";
    }
  };
}
