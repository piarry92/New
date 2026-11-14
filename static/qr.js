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
      ${darfAendern() ? '<button class="knopf klein" data-qr="mangel">Mangel melden</button><button class="knopf klein" data-qr="neu">Neuen Code erzeugen</button>' : ""}</div></div></div>`;
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
  const html = `<div class="dfehler"></div><form class="formular" onsubmit="return false">
    <label class="breit"><span class="pflicht">Was ist das Problem?</span><textarea name="beschreibung" required placeholder="z. B. Lüfter macht laute Geräusche, Filteranzeige leuchtet"></textarea></label>
    <label><span>Priorität</span><select name="prioritaet">${["Normal", "Hoch", "Notfall", "Niedrig"].map((p) => `<option>${p}</option>`).join("")}</select></label>
    <label><span>Fotos (bis zu 3)</span><input type="file" name="fotos" accept="image/*" capture="environment" multiple></label>
  </form>`;
  const erg = await dialog(`Mangel melden: ${a.bezeichnung}`, html, [{ text: "Abbrechen" }, {
    text: "Melden", klasse: "haupt-k", aktion: async (hg) => {
      const fm = hg.querySelector("form");
      const fotos = [];
      for (const d of [...fm.fotos.files].slice(0, 3)) fotos.push(await bildVerkleinern(d));
      return api("POST", `qr/${encodeURIComponent(a.qr_token)}/meldung`, { beschreibung: fm.beschreibung.value, prioritaet: fm.prioritaet.value, fotos });
    },
  }]);
  if (erg) { cacheLeeren(); melde(`Mangel ${erg.nummer} angelegt.`); if (erg.ticket_id) location.hash = `#/tickets/${erg.ticket_id}`; }
}

/* ---------- Öffentliche Seite nach dem Scannen ---------- */
async function qrSeite(token) {
  document.title = "Mangel melden · Casa Concept Consulting";
  let info;
  try { info = await api("GET", "qr/" + encodeURIComponent(token)); }
  catch (e) {
    $app.innerHTML = `<div class="qr-seite"><header><img src="/logo.png" alt="Casa Concept Consulting"></header><div class="karte"><h2>QR-Code nicht gefunden</h2><p>${esc(e.message)}</p></div></div>`;
    return;
  }
  if (info.angemeldet && info.anlage_id) { location.replace(`/#/anlagen/${info.anlage_id}?mangel=1`); return; }
  const a = info.anlage;
  const kopf = `<header><img src="/logo.png" alt="Casa Concept Consulting"></header>
    <div class="karte qr-anlage">${zeichenSvg(zeichenCode(a.planzeichen), 48)}<div>${a.nummer ? `<div class="kicker">${esc(a.nummer)}</div>` : ""}<h1>${esc(a.bezeichnung)}</h1>
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
      <label><span class="pflicht">Was ist das Problem?</span><textarea name="beschreibung" required placeholder="Bitte kurz beschreiben, was nicht funktioniert oder beschädigt ist."></textarea></label>
      <label class="check"><input type="checkbox" name="dringend"> Dringend: Gefahr für Personen oder Ausfall</label>
      <label><span>Fotos (bis zu 3, freiwillig)</span><input type="file" name="fotos" accept="image/*" capture="environment" multiple></label>
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
      for (const d of [...fm.fotos.files].slice(0, 3)) fotos.push(await bildVerkleinern(d));
      const r = await api("POST", `qr/${encodeURIComponent(token)}/meldung`, { beschreibung: fm.beschreibung.value, dringend: fm.dringend.checked, name: fm.name.value, kontakt: fm.kontakt.value, fotos });
      $app.innerHTML = `<div class="qr-seite">${kopf}<div class="karte qr-danke"><div class="haken">✓</div><h2>Vielen Dank!</h2>
        <p>Ihre Meldung ist bei uns eingegangen. Die Nummer lautet <b>${esc(r.nummer)}</b>.</p><p class="klein">Wir kümmern uns darum. Bei Rückfragen melden wir uns.</p>
        <button class="knopf" onclick="location.reload()">Weiteren Mangel melden</button></div></div>`;
    } catch (err) {
      document.getElementById("qfe").innerHTML = `<div class="fehler">${esc(err.message)}</div>`;
      knopf.disabled = false; knopf.textContent = "Meldung senden";
    }
  };
}
