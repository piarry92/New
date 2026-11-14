"use strict";
/* Schlüsselmanager: Bestand, Übergabe mit Protokoll und Unterschriften, Rückgabe, Erinnerung per E-Mail */

const slZeit = (iso) => iso ? `${datum(iso)} ${iso.slice(11, 16)}` : "";
const slListe = (u) => u.schluessel.map((s) => `${s.nummer}${s.anzahl > 1 ? ` ×${s.anzahl}` : ""}`).join(", ");
function slMarke(u) {
  if (u.status !== "ausgegeben") return `<span class="marke m-ok">zurück ${slZeit(u.rueckgabe_zeit)}</span>`;
  const jetzt = new Date().toISOString().slice(0, 16), lokal = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  if (u.rueckgabe_bis < lokal) return '<span class="marke m-ueber">überfällig</span>';
  if (u.rueckgabe_bis.slice(0, 10) === lokal.slice(0, 10)) return '<span class="marke m-bald">heute zurück</span>';
  return jetzt ? '<span class="marke m-geplant">ausgegeben</span>' : "";
}
const slJetztLokal = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const slMinus = (hhmm, min) => { const [h, m] = hhmm.split(":").map(Number); const t = Math.max(h * 60 + m - min, 0); return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };

SEITEN.schluessel = async (el, _, q) => {
  await lade("objekte");
  el.innerHTML = seitenkopf("Schlüsselmanager", "Schlüssel, Übergaben und Rückgaben",
    `${darf("schluessel_verwalten") ? `<button class="knopf haupt-k" id="slaus">${icon("plus")} Schlüssel ausgeben</button>` : ""}`)
    + `<div id="slber"></div>`;
  const ber = el.querySelector("#slber");
  const ausgeben = el.querySelector("#slaus");
  if (ausgeben) ausgeben.onclick = async () => { if (await schluesselAusgeben({ objekt_id: ber.dataset.objekt || "" })) schluesselBereich(ber, null, ber.dataset.ansicht); };
  await schluesselBereich(ber, null, q.get("ansicht") || "aus");
};

async function schluesselBereich(ziel, festesObjekt, ansicht = "aus") {
  const z = { ansicht, objekt: festesObjekt ? String(festesObjekt) : (ziel.dataset.objekt || ""), q: "" };
  ziel.innerHTML = `<div class="werkzeug">
      <div class="umschalter"><button data-a="aus">Ausgegeben</button><button data-a="bestand">Schlüssel</button><button data-a="alle">Alle Übergaben</button></div>
      <input type="search" placeholder="Suchen: Name, Firma, Schlüssel" data-q>
      ${festesObjekt ? "" : `<select data-o><option value="">Alle Objekte</option>${(S.cache.objekte || []).map((o) => `<option value="${o.id}" ${String(o.id) === z.objekt ? "selected" : ""}>${esc(anzeige("objekte", o))}</option>`).join("")}</select>`}
      ${festesObjekt && darf("schluessel_verwalten") ? `<button class="knopf haupt-k" data-aus>${icon("plus")} Schlüssel ausgeben</button>` : ""}
      <span data-extra></span><span class="anzahl" data-anz></span></div><div data-inh></div>`;
  let daten = [];
  const passt = (t) => !z.q || t.toLowerCase().includes(z.q.toLowerCase());
  const zeichnen = () => {
    ziel.querySelectorAll("[data-a]").forEach((b) => b.classList.toggle("an", b.dataset.a === z.ansicht));
    const inh = ziel.querySelector("[data-inh]"), extra = ziel.querySelector("[data-extra]");
    if (z.ansicht === "bestand") {
      const liste = daten.filter((s) => passt([s.nummer, s.bezeichnung, s.schliessanlage, s.aufbewahrung, ...s.inhaber.map((i) => i.name + " " + (i.firma || ""))].join(" ")));
      ziel.querySelector("[data-anz]").textContent = `${liste.length} Schlüssel`;
      extra.innerHTML = darfNeu("schluessel") ? `<button class="knopf" data-neu>${icon("plus")} Schlüssel anlegen</button>` : "";
      inh.innerHTML = liste.length ? `<div class="tabelle-wrap"><table><thead><tr><th>Nr.</th><th>Bezeichnung</th>${festesObjekt ? "" : "<th>Objekt</th>"}<th>Aufbewahrung</th><th>Verfügbar</th><th>Ausgegeben an</th></tr></thead><tbody>
        ${liste.map((s) => `<tr class="klickbar" data-s="${s.id}"><td><b>${esc(s.nummer)}</b></td><td>${esc(s.bezeichnung)}${s.schliessanlage ? `<br><span class="klein">${esc(s.schliessanlage)}</span>` : ""}</td>
          ${festesObjekt ? "" : `<td>${esc(refText("objekte", s.objekt_id))}</td>`}<td>${esc(s.aufbewahrung || "")}</td>
          <td>${s.status && s.status !== "aktiv" ? `<span class="marke m-ueber">${esc(s.status)}</span>` : `<span class="marke ${s.verfuegbar ? "m-ok" : "m-bald"}">${s.verfuegbar} von ${zahl(s.anzahl || 1)}</span>`}</td>
          <td>${s.inhaber.map((i) => `<a href="#" data-u="${i.uebergabe_id}">${esc(i.name)}</a>${i.firma ? ` <span class="klein">${esc(i.firma)}</span>` : ""}<br><span class="klein">bis ${slZeit(i.bis)}</span>`).join("<br>")}</td></tr>`).join("")}</tbody></table></div>`
        : `<div class="karte leer">Noch keine Schlüssel angelegt.${darfNeu("schluessel") ? " Leg sie mit „Schlüssel anlegen“ an." : ""}</div>`;
      const nb = extra.querySelector("[data-neu]");
      if (nb) nb.onclick = async () => { if (await bearbeiten("schluessel", null, { objekt_id: z.objekt ? Number(z.objekt) : "", anzahl: 1, status: "aktiv" })) laden(); };
      return;
    }
    extra.innerHTML = "";
    const liste = daten.filter((u) => passt([u.nummer, u.empfaenger_name, u.empfaenger_firma, u.empfaenger_email, slListe(u), u.ausgeber_name].join(" ")));
    ziel.querySelector("[data-anz]").textContent = `${liste.length} Übergaben`;
    const jetzt = slJetztLokal();
    const ueber = liste.filter((u) => u.status === "ausgegeben" && u.rueckgabe_bis < jetzt).length;
    inh.innerHTML = (z.ansicht === "aus" ? `<div class="raster k4 sv-kz">
        <div class="karte kennzahl ${liste.length ? "orange" : ""}"><div class="wert">${liste.length}</div><div class="text">Übergaben offen</div></div>
        <div class="karte kennzahl ${ueber ? "rot" : ""}"><div class="wert">${ueber}</div><div class="text">überfällig</div></div>
        <div class="karte kennzahl"><div class="wert">${liste.filter((u) => u.rueckgabe_bis.slice(0, 10) === jetzt.slice(0, 10)).length}</div><div class="text">heute zurück</div></div>
        <div class="karte kennzahl"><div class="wert">${liste.reduce((n, u) => n + u.schluessel.reduce((m, s) => m + (s.anzahl || 1), 0), 0)}</div><div class="text">Schlüssel unterwegs</div></div></div><div class="abstand"></div>` : "")
      + (liste.length ? `<div class="tabelle-wrap"><table><thead><tr><th>Protokoll</th>${festesObjekt ? "" : "<th>Objekt</th>"}<th>Schlüssel</th><th>Erhalten von</th><th>Ausgabe</th><th>Rückgabe bis</th><th>E-Mail</th><th></th></tr></thead><tbody>
        ${liste.map((u) => `<tr class="klickbar ${u.status === "ausgegeben" && u.rueckgabe_bis < jetzt ? "zeile-rot" : ""}" data-u="${u.id}"><td><b>${esc(u.nummer)}</b></td>
          ${festesObjekt ? "" : `<td>${esc(u.o_kuerzel || "")}</td>`}<td>${esc(slListe(u))}</td>
          <td><b>${esc(u.empfaenger_name)}</b>${u.empfaenger_firma ? `<br><span class="klein">${esc(u.empfaenger_firma)}</span>` : ""}<br><span class="klein">${esc(u.empfaenger_email)}</span></td>
          <td>${slZeit(u.ausgabe_zeit)}<br><span class="klein">von ${esc(u.ausgeber_name)}</span></td>
          <td><b>${slZeit(u.rueckgabe_bis)}</b><br>${slMarke(u)}</td>
          <td class="klein">${u.quittung_gesendet ? "Protokoll gesendet ✓<br>" : ""}${u.erinnert ? `Erinnerung gesendet ✓` : u.erinnerung_um && u.status === "ausgegeben" ? `Erinnerung ${u.erinnerung_um.slice(0, 10) === u.rueckgabe_bis.slice(0, 10) ? u.erinnerung_um.slice(11, 16) + " Uhr" : slZeit(u.erinnerung_um)}` : ""}${u.mail_fehler ? `<br><span class="fehlertext">Versand klappt nicht</span>` : ""}</td>
          <td class="sv-akt">${u.status === "ausgegeben" && darf("schluessel_verwalten") ? `<button class="knopf haupt-k klein" data-rueck="${u.id}">Rückgabe</button>` : ""}<button class="knopf klein" data-prot="${u.id}">Protokoll</button></td></tr>`).join("")}</tbody></table></div>`
        : `<div class="karte leer">${z.ansicht === "aus" ? "Gerade sind keine Schlüssel ausgegeben." : "Noch keine Übergaben."}</div>`);
  };
  const laden = async () => {
    if (z.ansicht === "bestand") daten = (await api("GET", `schluesselbestand${z.objekt ? "?objekt_id=" + z.objekt : ""}`)).schluessel;
    else daten = await api("GET", `schluesseluebergaben?${new URLSearchParams({ ...(z.objekt ? { objekt_id: z.objekt } : {}), ...(z.ansicht === "aus" ? { status: "ausgegeben" } : {}) })}`);
    ziel.dataset.ansicht = z.ansicht; ziel.dataset.objekt = z.objekt;
    zeichnen();
  };
  ziel.querySelectorAll("[data-a]").forEach((b) => b.onclick = () => { z.ansicht = b.dataset.a; laden(); });
  let t;
  ziel.querySelector("[data-q]").oninput = (e) => { clearTimeout(t); t = setTimeout(() => { z.q = e.target.value; zeichnen(); }, 200); };
  const os = ziel.querySelector("[data-o]");
  if (os) os.onchange = () => { z.objekt = os.value; laden(); };
  const ab = ziel.querySelector("[data-aus]");
  if (ab) ab.onclick = async () => { if (await schluesselAusgeben({ objekt_id: z.objekt })) laden(); };
  ziel.querySelector("[data-inh]").addEventListener("click", async (e) => {
    const r = e.target.closest("[data-rueck]"), p = e.target.closest("[data-prot]"), u = e.target.closest("[data-u]"), s = e.target.closest("tr[data-s]");
    if (r) { if (await schluesselRueckgabe(Number(r.dataset.rueck))) laden(); return; }
    if (p) { schluesselProtokoll(await api("GET", `schluesseluebergaben/${p.dataset.prot}`)); return; }
    if (u) { e.preventDefault(); if (await uebergabeAnsehen(Number(u.dataset.u))) laden(); return; }
    if (s && darfAendernRes("schluessel")) { const x = daten.find((d) => d.id === Number(s.dataset.s)); if (await bearbeiten("schluessel", x)) laden(); }
  });
  await laden();
}

/* ---------- Ausgabe ---------- */
async function schluesselAusgeben(vorgabe = {}) {
  const ein = await einstellungenLaden(true);
  const bestandAlle = await api("GET", "schluesselbestand");
  const zeiten = bestandAlle.zeiten;
  const objekte = (S.cache.objekte || []).filter((o) => bestandAlle.schluessel.some((s) => s.objekt_id === o.id));
  if (!objekte.length) { melde("Es sind noch keine Schlüssel angelegt. Bitte zuerst unter „Schlüssel“ anlegen.", true); return null; }
  const startObjekt = String(vorgabe.objekt_id || (objekte.length === 1 ? objekte[0].id : ""));
  const html = `<div class="dfehler"></div><form class="formular sl-form" onsubmit="return false">
    <label class="breit"><span class="pflicht">Objekt</span><select name="objekt_id"><option value="">Bitte wählen</option>${objekte.map((o) => `<option value="${o.id}" ${String(o.id) === startObjekt ? "selected" : ""}>${esc(anzeige("objekte", o))}</option>`).join("")}</select></label>
    <div class="breit"><div class="sl-titel pflicht">Schlüssel</div><div id="slwahl" class="sl-wahl"></div></div>
    <div class="breit sl-titel">Ausgegeben von</div>
    <label class="breit"><span class="pflicht">Name</span><input name="ausgeber_name" value="${esc(S.ich.name)}"></label>
    <div class="breit sl-titel">Erhalten von</div>
    <label><span class="pflicht">Name</span><input name="empfaenger_name" autocomplete="off"></label>
    <label><span>Firma</span><input name="empfaenger_firma" autocomplete="off"></label>
    <label><span class="pflicht">E-Mail-Adresse</span><input name="empfaenger_email" type="email" autocomplete="off" inputmode="email"></label>
    <label><span>Telefon</span><input name="empfaenger_tel" type="tel" autocomplete="off"></label>
    <label class="breit"><span>Zweck</span><input name="zweck" placeholder="z. B. Wartung Aufzug, Reparatur Dach"></label>
    <div class="breit sl-titel">Rückgabe</div>
    <label><span class="pflicht">Zurück am</span><input name="rueck_tag" type="date" value="${zeiten.rueckgabe_bis.slice(0, 10)}"></label>
    <label><span class="pflicht">bis Uhrzeit</span><input name="rueck_zeit" type="time" value="${zeiten.feierabend}"></label>
    <label class="check"><input type="checkbox" name="erinnern" checked> E-Mail-Erinnerung an die Person</label>
    <label><span>Erinnerung um</span><input name="erinnerung_zeit" type="time" value="${zeiten.erinnerung_um.slice(11, 16)}"></label>
    <label class="check breit"><input type="checkbox" name="quittung" checked> Übergabeprotokoll gleich per E-Mail an die Person schicken</label>
    ${ein.mail_aktiv !== "1" ? '<div class="warnung breit klein">Der E-Mail-Versand ist noch nicht eingerichtet. Erinnerung und Protokoll gehen erst raus, wenn ein Administrator unter Einstellungen den Mailserver einträgt.</div>' : ""}
    <p class="klein breit">Die Erinnerung kommt standardmäßig ${zeiten.vorlauf} Minuten vor Feierabend (${zeiten.feierabend} Uhr). Beides lässt sich hier für jede Übergabe ändern, die Standardwerte unter Einstellungen.</p>
    <div class="breit sl-us"><div class="us-box unterschrift-box" id="usA"></div><div class="us-box unterschrift-box" id="usE"></div></div>
  </form>`;
  let usA, usE;
  const p = dialog("Schlüssel ausgeben", html, [{ text: "Abbrechen" }, {
    text: "Ausgeben und Protokoll erstellen", klasse: "haupt-k", aktion: async (hg) => {
      const fm = hg.querySelector("form");
      const gewaehlt = [...hg.querySelectorAll("[data-sl]:checked")].map((c) => ({ id: Number(c.dataset.sl), anzahl: Number((hg.querySelector(`[data-anz="${c.dataset.sl}"]`) || { value: 1 }).value) || 1 }));
      const tag = fm.rueck_tag.value;
      if (!fm.objekt_id.value) throw new Error("Bitte ein Objekt wählen.");
      if (!gewaehlt.length) throw new Error("Bitte mindestens einen Schlüssel auswählen.");
      if (!fm.empfaenger_name.value.trim()) throw new Error("Bitte den Namen der Person eintragen, die den Schlüssel erhält.");
      if (!fm.empfaenger_email.checkValidity() || !fm.empfaenger_email.value.trim()) throw new Error("Bitte eine gültige E-Mail-Adresse der Person eintragen.");
      if (!tag || !fm.rueck_zeit.value) throw new Error("Bitte Tag und Uhrzeit der Rückgabe angeben.");
      if (fm.erinnern.checked && fm.erinnerung_zeit.value > fm.rueck_zeit.value) throw new Error("Die Erinnerung muss vor der Rückgabezeit liegen.");
      if (!usE.bild()) throw new Error("Bitte die Person, die den Schlüssel erhält, unterschreiben lassen.");
      const u = await api("POST", "schluesseluebergaben", {
        objekt_id: Number(fm.objekt_id.value), schluessel: gewaehlt, ausgeber_name: usA.name() || fm.ausgeber_name.value,
        empfaenger_name: usE.name() || fm.empfaenger_name.value, empfaenger_firma: fm.empfaenger_firma.value, empfaenger_email: fm.empfaenger_email.value,
        empfaenger_tel: fm.empfaenger_tel.value, zweck: fm.zweck.value, rueckgabe_bis: `${tag}T${fm.rueck_zeit.value}`,
        erinnern: fm.erinnern.checked, erinnerung_um: fm.erinnern.checked ? `${tag}T${fm.erinnerung_zeit.value}` : null,
        quittung: fm.quittung.checked, sig_ausgeber: usA.bild(), sig_empfaenger: usE.bild(),
      });
      melde(`Übergabe ${u.nummer} gespeichert.`);
      return u;
    },
  }]);
  const hg = letzterDialog();
  hg.querySelector(".dialog").classList.add("breit-dialog");
  const fm = hg.querySelector("form");
  const wahl = () => {
    const liste = bestandAlle.schluessel.filter((s) => String(s.objekt_id) === fm.objekt_id.value);
    hg.querySelector("#slwahl").innerHTML = !fm.objekt_id.value ? '<p class="klein">Bitte zuerst das Objekt wählen.</p>' : liste.length ? liste.map((s) => `
      <label class="sl-k ${s.verfuegbar ? "" : "weg"}"><input type="checkbox" data-sl="${s.id}" ${s.verfuegbar ? "" : "disabled"}>
        <span><b>${esc(s.nummer)}</b> ${esc(s.bezeichnung)}<br><span class="klein">${s.verfuegbar ? `${s.verfuegbar} von ${zahl(s.anzahl || 1)} da` : s.status && s.status !== "aktiv" ? esc(s.status) : `alle ausgegeben${s.inhaber[0] ? ", zuletzt an " + esc(s.inhaber[0].name) : ""}`}${s.aufbewahrung ? " · " + esc(s.aufbewahrung) : ""}</span></span>
        ${s.verfuegbar > 1 ? `<input type="number" min="1" max="${s.verfuegbar}" value="1" data-anz="${s.id}" class="sl-anz" aria-label="Anzahl">` : ""}</label>`).join("") : '<p class="klein">Für dieses Objekt sind keine Schlüssel angelegt.</p>';
  };
  fm.objekt_id.onchange = wahl; wahl();
  let erinnerungGeaendert = false;
  fm.erinnerung_zeit.oninput = () => { erinnerungGeaendert = true; };
  fm.rueck_zeit.oninput = () => { if (!erinnerungGeaendert && fm.rueck_zeit.value) fm.erinnerung_zeit.value = slMinus(fm.rueck_zeit.value, zeiten.vorlauf); };
  fm.erinnern.onchange = () => { fm.erinnerung_zeit.disabled = !fm.erinnern.checked; };
  usA = unterschriftsfeld(hg.querySelector("#usA"), fm.ausgeber_name.value);
  usE = unterschriftsfeld(hg.querySelector("#usE"), "");
  hg.querySelector("#usA .us-kopf b").textContent = "Unterschrift Ausgabe (Casa)";
  hg.querySelector("#usE .us-kopf b").textContent = "Unterschrift Empfang";
  fm.empfaenger_name.oninput = () => { hg.querySelector("#usE [data-us-name]").value = fm.empfaenger_name.value; };
  fm.ausgeber_name.oninput = () => { hg.querySelector("#usA [data-us-name]").value = fm.ausgeber_name.value; };
  const u = await p;
  if (u && u.id) schluesselProtokoll(u);
  return u;
}

/* ---------- Ansicht, Zeit ändern, Rückgabe ---------- */
async function uebergabeAnsehen(uid) {
  const u = await api("GET", `schluesseluebergaben/${uid}`);
  const darfV = darf("schluessel_verwalten") && u.status === "ausgegeben";
  const html = `<div class="sv-fakten">
      <div><small>Objekt</small>${esc([u.o_kuerzel, u.o_name].filter(Boolean).join(" · "))}</div>
      <div><small>Ausgabe</small>${slZeit(u.ausgabe_zeit)} · ${esc(u.ausgeber_name)}</div>
      <div><small>Erhalten von</small>${esc(u.empfaenger_name)}${u.empfaenger_firma ? `, ${esc(u.empfaenger_firma)}` : ""}</div>
      <div><small>E-Mail</small>${esc(u.empfaenger_email)}</div>${u.empfaenger_tel ? `<div><small>Telefon</small>${esc(u.empfaenger_tel)}</div>` : ""}
      <div><small>Rückgabe bis</small>${slZeit(u.rueckgabe_bis)} ${slMarke(u)}</div>
      <div><small>Erinnerung</small>${u.erinnerung_um ? slZeit(u.erinnerung_um) + (u.erinnert ? " · gesendet ✓" : "") : "keine"}</div>
      ${u.zweck ? `<div><small>Zweck</small>${esc(u.zweck)}</div>` : ""}</div>
    <div class="tabelle-wrap"><table><thead><tr><th>Nr.</th><th>Schlüssel</th><th>Anzahl</th></tr></thead><tbody>${u.schluessel.map((s) => `<tr><td><b>${esc(s.nummer)}</b></td><td>${esc(s.bezeichnung)}</td><td>${s.anzahl}</td></tr>`).join("")}</tbody></table></div>
    ${u.mail_fehler ? `<div class="warnung klein">Die E-Mail an ${esc(u.empfaenger_email)} ging nicht raus: ${esc(u.mail_fehler)}</div>` : ""}
    ${u.status !== "ausgegeben" ? `<p class="klein">Zurückgenommen am ${slZeit(u.rueckgabe_zeit)} von ${esc(u.rueckgabe_von || "")}${u.rueckgabe_bemerkung ? `. Bemerkung: ${esc(u.rueckgabe_bemerkung)}` : ""}</p>` : ""}`;
  const knoepfe = [{ text: "Schließen" }, { text: "Protokoll drucken", aktion: () => { schluesselProtokoll(u); return false; } }];
  if (darfV) knoepfe.push({ text: "Rückgabezeit ändern", aktion: async () => "zeit" }, { text: "Rückgabe", klasse: "haupt-k", aktion: async () => "rueck" });
  const w = await dialog(`Übergabe ${u.nummer}`, html, knoepfe);
  if (w === "rueck") return schluesselRueckgabe(uid);
  if (w === "zeit") return rueckgabezeitAendern(u);
  return false;
}

async function rueckgabezeitAendern(u) {
  const html = `<div class="dfehler"></div><form class="formular" onsubmit="return false">
    <label><span class="pflicht">Zurück am</span><input type="date" name="tag" value="${u.rueckgabe_bis.slice(0, 10)}"></label>
    <label><span class="pflicht">bis Uhrzeit</span><input type="time" name="zeit" value="${u.rueckgabe_bis.slice(11, 16)}"></label>
    <label class="check"><input type="checkbox" name="erinnern" ${u.erinnerung_um ? "checked" : ""}> E-Mail-Erinnerung</label>
    <label><span>Erinnerung um</span><input type="time" name="ezeit" value="${(u.erinnerung_um || "").slice(11, 16)}"></label>
    <p class="klein breit">Wird die Zeit geändert, geht die Erinnerung zur neuen Uhrzeit noch einmal raus.</p></form>`;
  return dialog(`Rückgabezeit ändern: ${u.nummer}`, html, [{ text: "Abbrechen" }, {
    text: "Speichern", klasse: "haupt-k", aktion: async (hg) => {
      const fm = hg.querySelector("form");
      if (fm.erinnern.checked && (!fm.ezeit.value || fm.ezeit.value > fm.zeit.value)) throw new Error("Die Erinnerung muss vor der Rückgabezeit liegen.");
      await api("PUT", `schluesseluebergaben/${u.id}`, { rueckgabe_bis: `${fm.tag.value}T${fm.zeit.value}`, erinnerung_um: fm.erinnern.checked ? `${fm.tag.value}T${fm.ezeit.value}` : null });
      melde("Rückgabezeit geändert.");
      return true;
    },
  }]);
}

async function schluesselRueckgabe(uid) {
  const u = await api("GET", `schluesseluebergaben/${uid}`);
  const html = `<div class="dfehler"></div><p>${esc(u.empfaenger_name)}${u.empfaenger_firma ? ` (${esc(u.empfaenger_firma)})` : ""} gibt zurück. Haken weg bei Schlüsseln, die fehlen. Sie werden dann als verloren markiert.</p>
    <div class="sl-wahl">${u.schluessel.map((s) => `<label class="sl-k"><input type="checkbox" data-zur="${s.id}" checked><span><b>${esc(s.nummer)}</b> ${esc(s.bezeichnung)}${s.anzahl > 1 ? ` (${s.anzahl} Stück)` : ""}</span></label>`).join("")}</div>
    <form class="formular" onsubmit="return false"><label class="breit"><span>Bemerkung</span><textarea name="bemerkung" placeholder="z. B. Schlüssel beschädigt"></textarea></label></form>
    <div class="us-box unterschrift-box" id="usR"></div>`;
  let us;
  const p = dialog(`Rückgabe ${u.nummer}`, html, [{ text: "Abbrechen" }, {
    text: "Rückgabe speichern", klasse: "haupt-k", aktion: async (hg) => {
      const fehlend = [...hg.querySelectorAll("[data-zur]:not(:checked)")].map((c) => Number(c.dataset.zur));
      const r = await api("POST", `schluesseluebergaben/${uid}/rueckgabe`, { bemerkung: hg.querySelector("[name=bemerkung]").value, unterschrift: us.bild(), fehlend });
      melde(fehlend.length ? `Rückgabe gespeichert, ${fehlend.length} Schlüssel als verloren markiert.` : "Rückgabe gespeichert.");
      return r;
    },
  }]);
  const hg = letzterDialog();
  us = unterschriftsfeld(hg.querySelector("#usR"), S.ich.name);
  hg.querySelector("#usR .us-kopf b").textContent = "Unterschrift Rücknahme (Casa)";
  return p;
}

/* ---------- Protokoll ---------- */
function schluesselProtokoll(u) {
  const zur = u.status !== "ausgegeben";
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Schlüsselübergabe ${esc(u.nummer)}</title><style>
    @font-face { font-family: Carlito; src: url("${location.origin}/schrift/Carlito-Regular.ttf"); }
    @font-face { font-family: Carlito; src: url("${location.origin}/schrift/Carlito-Bold.ttf"); font-weight: 700; }
    @page { size: A4; margin: 16mm 14mm; }
    body { font-family: Calibri, Carlito, sans-serif; color: #3C3C3B; font-size: 10.5pt; }
    .kopf { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: .6mm solid #E63713; padding-bottom: 4mm; }
    .kopf img { width: 52mm; } h1 { font-size: 20pt; margin: 6mm 0 1mm; } h2 { font-size: 12pt; margin: 7mm 0 2mm; color: #E63713; text-transform: uppercase; letter-spacing: .08em; }
    .k { font-size: 9pt; letter-spacing: .12em; color: #E63713; font-weight: 700; text-transform: uppercase; }
    .meta { display: grid; grid-template-columns: repeat(2, 1fr); gap: 2mm 8mm; }
    .meta small { display: block; color: #939598; font-size: 8pt; text-transform: uppercase; letter-spacing: .06em; }
    table { width: 100%; border-collapse: collapse; } th { background: #3C3C3B; color: #fff; text-align: left; padding: 2mm 3mm; font-size: 9pt; }
    td { padding: 2mm 3mm; border-bottom: .2mm solid #D9DADB; vertical-align: top; }
    .pflicht { background: #FBEEE5; border-left: 1.2mm solid #E63713; padding: 3mm 4mm; margin: 6mm 0 0; }
    .us { margin-top: 6mm; display: flex; gap: 12mm; } .us > div { flex: 1; font-size: 9pt; }
    .us .sig { height: 22mm; display: flex; align-items: flex-end; } .us .sig img { max-height: 22mm; max-width: 100%; }
    .us .l { border-top: .3mm solid #3C3C3B; padding-top: 1.5mm; }
    .fuss { position: fixed; bottom: 0; left: 0; right: 0; font-size: 8pt; color: #939598; text-align: center; }
  </style></head><body>
    <div class="kopf"><div><div class="k">Schlüsselübergabeprotokoll · ${esc(u.nummer)}</div><h1>${esc(u.o_name || "")}</h1>${u.o_strasse ? `<div>${esc(u.o_strasse)}, ${esc([u.o_plz, u.o_ort].filter(Boolean).join(" "))}</div>` : ""}</div><img src="${location.origin}/logo.png" alt=""></div>
    <h2>Übergabe</h2>
    <div class="meta"><div><small>Ausgegeben von</small>${esc(u.ausgeber_name)}<br>Casa Concept Consulting GmbH &amp; Co. KG</div>
      <div><small>Erhalten von</small>${esc(u.empfaenger_name)}${u.empfaenger_firma ? `<br>${esc(u.empfaenger_firma)}` : ""}<br>${esc(u.empfaenger_email)}${u.empfaenger_tel ? ` · ${esc(u.empfaenger_tel)}` : ""}</div>
      <div><small>Ausgabe am</small>${slZeit(u.ausgabe_zeit)} Uhr</div><div><small>Zweck</small>${esc(u.zweck || "–")}</div></div>
    <h2>Schlüssel</h2>
    <table><thead><tr><th>Nr.</th><th>Bezeichnung</th><th>Anzahl</th></tr></thead><tbody>${u.schluessel.map((s) => `<tr><td><b>${esc(s.nummer)}</b></td><td>${esc(s.bezeichnung)}</td><td>${s.anzahl}</td></tr>`).join("")}</tbody></table>
    <div class="pflicht"><b>Rückgabe bis ${slZeit(u.rueckgabe_bis)} Uhr</b> bei ${esc(u.ausgeber_name)}. Die Schlüssel dürfen nicht an Dritte weitergegeben werden. Ein Verlust ist sofort zu melden.</div>
    <div class="us"><div><div class="sig">${u.sig_ausgeber ? `<img src="${u.sig_ausgeber}" alt="">` : ""}</div><div class="l">Unterschrift Ausgabe: ${esc(u.ausgeber_name)}</div></div><div><div class="sig">${u.sig_empfaenger ? `<img src="${u.sig_empfaenger}" alt="">` : ""}</div><div class="l">Unterschrift Empfang: ${esc(u.empfaenger_name)}</div></div></div>
    <h2>Rückgabe</h2>
    ${zur ? `<div class="meta"><div><small>Zurückgenommen am</small>${slZeit(u.rueckgabe_zeit)} Uhr</div><div><small>Zurückgenommen von</small>${esc(u.rueckgabe_von || "")}</div>${u.rueckgabe_bemerkung ? `<div style="grid-column:span 2"><small>Bemerkung</small>${esc(u.rueckgabe_bemerkung)}</div>` : ""}</div>
      <div class="us"><div><div class="sig">${u.sig_rueckgabe ? `<img src="${u.sig_rueckgabe}" alt="">` : ""}</div><div class="l">Unterschrift Rücknahme: ${esc(u.rueckgabe_von || "")}</div></div><div></div></div>`
      : `<div class="meta"><div><small>Zurück am</small>&nbsp;</div><div><small>Bemerkung</small>&nbsp;</div></div><div class="us"><div><div class="sig"></div><div class="l">Unterschrift Rücknahme</div></div><div><div class="sig"></div><div class="l">Unterschrift Rückgabe</div></div></div>`}
    <div class="fuss">Casa Concept Consulting GmbH &amp; Co. KG · www.ccc-frankfurt.com</div>
    <script>window.onload = () => setTimeout(() => print(), 300);<\/script></body></html>`;
  const f = window.open("", "_blank");
  if (!f) { melde("Das Druckfenster wurde blockiert. Bitte Pop-ups für diese Seite erlauben.", true); return; }
  f.document.open(); f.document.write(html); f.document.close();
}

/* ---------- Einstellungen ---------- */
const einstellungenVorSchluessel = SEITEN.einstellungen;
SEITEN.einstellungen = async (el, ...rest) => {
  await einstellungenVorSchluessel(el, ...rest);
  if (!darf("einstellungen")) return;
  const e = await api("GET", "einstellungen");
  const box = document.createElement("div");
  box.innerHTML = `<div class="abstand"></div><div class="raster k2"><div class="karte" id="slEinst"><h3>Schlüsselrückgabe</h3>
    <p class="klein">Standardwerte für neue Übergaben: Schlüssel sind bis Feierabend zurückzugeben, die Person bekommt vorher eine E-Mail-Erinnerung. Bei jeder Übergabe lässt sich beides ändern.</p>
    <form class="formular" onsubmit="return false">
      <label>Feierabend<input type="time" name="feierabend" value="${esc(e.feierabend || "17:00")}"></label>
      <label>Erinnerung (Minuten vorher)<input type="number" name="schluessel_vorlauf" min="0" max="720" step="5" value="${esc(e.schluessel_vorlauf || "60")}"></label>
      <div class="breit qr-knoepfe"><button class="knopf haupt-k" id="slSpeichern">Speichern</button></div></form></div></div>`;
  el.appendChild(box);
  box.querySelector("#slSpeichern").onclick = async () => {
    const fm = box.querySelector("form");
    try { await api("PUT", "einstellungen", { feierabend: fm.feierabend.value, schluessel_vorlauf: fm.schluessel_vorlauf.value }); await einstellungenLaden(true); melde("Gespeichert."); }
    catch (err) { melde(err.message, true); }
  };
};
