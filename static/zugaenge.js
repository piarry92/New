/* Casa CAFM – Zugänge, Rollen und Rechte */
"use strict";

SEITEN.zugaenge = async (el) => {
  if (!darf("benutzer_verwalten")) { el.innerHTML = seitenkopf("Zugänge & Rechte") + '<div class="karte">Dafür fehlt dir das Recht.</div>'; return; }
  let info = await api("GET", "rechte");
  const gruppen = [...new Set(info.liste.map((r) => r.gruppe))];

  el.innerHTML = seitenkopf("Zugänge & Rechte", "Wer darf was",
    `<button class="knopf" id="impB">Benutzer aus Datei importieren</button><button class="knopf haupt-k" id="neuB">${icon("plus")} Zugang anlegen</button>`) + `
    <div class="karte"><h3>Zugänge</h3>
      <p class="klein">Mehrere Benutzer auf einmal: <button class="knopf klein" id="impB2">Benutzer aus Datei importieren (Excel/CSV)</button></p>
      <p class="klein"><b>Administrator:</b> alles. <b>Objektleiter:</b> alles im Objekt, auch Pläne, Anlagen, Wartungsplan und Verträge, aber keine Zugänge und Einstellungen.
      <b>Benutzer:</b> Störungen melden und bearbeiten, Wartungen erledigen, Zähler, Dokumente, Schlüssel. Pläne und Anlagen nur ansehen. <b>Zuschauer:</b> nur ansehen.</p>
      <div id="bl"></div></div>
    <div class="abstand"></div>
    <div class="karte"><h3>Rollen und Rechte</h3>
      <p class="klein">Häkchen setzen oder entfernen. Das gilt sofort für alle Zugänge mit dieser Rolle, außer bei Zugängen mit eigenen Rechten.
      Administratoren haben immer alle Rechte. Lesen dürfen alle angemeldeten Zugänge.</p>
      <div class="tabelle-wrap" style="box-shadow:none"><table class="rechte-matrix"><thead><tr><th>Recht</th>${["admin", "objektleiter", "benutzer", "zuschauer"].map((k) => `<th class="mitte">${esc(info.rollennamen[k])}</th>`).join("")}</tr></thead>
      <tbody id="rm"></tbody></table></div></div>
    <div class="abstand"></div>
    <div class="karte"><h3>Letzte Änderungen</h3><div id="vl" class="tabelle-wrap" style="box-shadow:none"></div></div>`;

  /* Rollen-Matrix */
  const matrix = () => {
    el.querySelector("#rm").innerHTML = gruppen.map((g) => `<tr class="gruppe"><td colspan="5">${esc(g)}</td></tr>` + info.liste.filter((r) => r.gruppe === g).map((r) => `<tr>
      <td>${esc(r.text)}</td>
      <td class="mitte"><input type="checkbox" class="haken" checked disabled title="Administratoren haben immer alle Rechte"></td>
      ${["objektleiter", "benutzer", "zuschauer"].map((rolle) => `<td class="mitte"><input type="checkbox" class="haken" data-rolle="${rolle}" data-recht="${r.key}" ${info.rollen[rolle][r.key] ? "checked" : ""} aria-label="${esc(info.rollennamen[rolle])}: ${esc(r.text)}"></td>`).join("")}
    </tr>`).join("")).join("");
  };
  matrix();
  el.querySelector("#rm").addEventListener("change", async (e) => {
    const c = e.target.closest("[data-rolle]");
    if (!c) return;
    try {
      info.rollen = await api("PUT", "rechte", { rolle: c.dataset.rolle, rechte: { [c.dataset.recht]: c.checked } });
      melde(`${info.rollennamen[c.dataset.rolle]}: ${c.checked ? "Recht gegeben" : "Recht entzogen"}.`);
      ladeB();
    } catch (err) { c.checked = !c.checked; melde(err.message, true); }
  });

  /* Zugänge */
  let liste = [];
  const ladeB = async () => {
    liste = await api("GET", "benutzer");
    el.querySelector("#bl").innerHTML = `<div class="tabelle-wrap" style="box-shadow:none"><table><thead><tr><th>Name</th><th>Rolle</th><th>Rechte</th><th>Status</th><th></th></tr></thead><tbody>${liste.map((b) => {
      const abw = Object.keys(b.abweichungen || {}).length;
      const anzahl = Object.values(b.rechte).filter(Boolean).length;
      return `<tr><td><div class="profil-zeile klein-z">${avatar(b)}<div><b>${esc(b.name)}</b>${b.id === S.ich.id ? ' <span class="marke m-geplant">du</span>' : ""}<br><span class="klein">${esc(b.email)}</span></div></div></td>
        <td><select data-rolle-b="${b.id}" ${b.id === S.ich.id && b.rolle === "admin" ? "disabled" : ""}>${Object.entries(info.rollennamen).map(([k, t]) => `<option value="${k}" ${k === b.rolle ? "selected" : ""}>${t}</option>`).join("")}</select></td>
        <td>${b.rolle === "eigentuemer" ? `<span class="klein">nur ansehen: ${esc(eigObjekteText(b.objekte))}</span>` : b.rolle === "admin" ? '<span class="klein">alle</span>' : `${anzahl} von ${info.liste.length}${abw ? ` <span class="marke m-neu" title="Eigene Rechte, abweichend von der Rolle">angepasst</span>` : ' <span class="klein">wie Rolle</span>'}`}</td>
        <td>${!b.aktiv ? '<span class="marke m-arbeit">gesperrt</span>' : b.einladung_offen ? '<span class="marke m-bald">Einladung offen</span>' : '<span class="marke m-ok">aktiv</span>'}</td>
        <td class="rechts-knoepfe">${b.rolle === "eigentuemer" ? `<button class="knopf klein" data-eobj="${b.id}">Objekte</button>` : b.rolle !== "admin" ? `<button class="knopf klein" data-rechte="${b.id}">Rechte</button>` : ""}
          <button class="knopf klein" data-pw="${b.id}">Passwort</button><button class="knopf klein ${b.einladung_offen ? "haupt-k" : ""}" data-einl="${b.id}">Einladen</button>
          ${b.id !== S.ich.id ? `<button class="knopf klein" data-sperr="${b.id}" data-aktiv="${b.aktiv}">${b.aktiv ? "Sperren" : "Freigeben"}</button>` : ""}</td></tr>`;
    }).join("")}</tbody></table></div>`;
  };
  await ladeB();
  el.querySelector("#impB2").onclick = () => el.querySelector("#impB").click();
  el.querySelector("#impB").onclick = async () => {
    const r = await dialog("Zugänge übernehmen", `<div class="dfehler"></div><form class="formular" onsubmit="return false">
      <label class="breit"><span class="pflicht">Datei (.xlsx oder .csv)</span><input type="file" name="datei" accept=".xlsx,.csv,text/csv"></label>
      <p class="klein breit">Spalten Name, E-Mail und wahlweise Rolle (Administrator, Benutzer, Zuschauer; leer = Benutzer). Es werden keine Passwörter vergeben: Jeder neue Zugang bekommt eine Einladung und legt sein Passwort selbst fest. Vorhandene E-Mail-Adressen werden übersprungen.</p></form>`,
      [{ text: "Abbrechen" }, { text: "Übernehmen", klasse: "haupt-k", aktion: async (hg) => {
        const datei = hg.querySelector("[name=datei]").files[0];
        if (!datei) throw new Error("Bitte eine Datei auswählen.");
        const inhalt = await new Promise((ok, nein) => { const f = new FileReader(); f.onload = () => ok(String(f.result).split(",")[1] || ""); f.onerror = nein; f.readAsDataURL(datei); });
        return api("POST", "benutzer/import", { inhalt, dateiname: datei.name });
      } }]);
    if (r) { melde(`${r.neu} Zugänge angelegt${r.vorhanden ? `, ${r.vorhanden} gab es schon` : ""}. Jetzt bei jedem auf „Einladen“ klicken.`); ladeB(); }
  };

  const ichNeuLaden = async () => {
    const st = await api("GET", "status");
    if (st.benutzer) { S.ich = st.benutzer; rahmen(); route(); }
  };

  el.querySelector("#bl").addEventListener("change", async (e) => {
    const s = e.target.closest("[data-rolle-b]");
    if (!s) return;
    try {
      if (s.value === "eigentuemer") {
        const b = liste.find((x) => x.id === Number(s.dataset.rolleB));
        const objekte = await eigObjekteWaehlen(b.objekte || []);
        if (!objekte) { ladeB(); return; }
        await api("PUT", `benutzer/${s.dataset.rolleB}`, { rolle: s.value, objekte });
      } else await api("PUT", `benutzer/${s.dataset.rolleB}`, { rolle: s.value });
      melde("Rolle geändert.");
    }
    catch (err) { melde(err.message, true); }
    ladeB();
  });
  el.querySelector("#bl").addEventListener("click", async (e) => {
    const s = e.target.closest("[data-sperr]"), p = e.target.closest("[data-pw]"), r = e.target.closest("[data-rechte]"), ei = e.target.closest("[data-einl]"), eo = e.target.closest("[data-eobj]");
    try {
      if (eo) {
        const b = liste.find((x) => x.id === Number(eo.dataset.eobj));
        const objekte = await eigObjekteWaehlen(b.objekte || []);
        if (objekte) { await api("PUT", `benutzer/${b.id}`, { objekte }); melde("Objekte gespeichert."); ladeB(); }
        return;
      }
      if (ei) {
        const b = liste.find((x) => x.id === Number(ei.dataset.einl));
        const ein = await einstellungenLaden(true);
        const w = await dialog(`Einladung für ${b.name}`, `<p>${esc(b.name)} bekommt einen Link und legt damit das Passwort selbst fest. Der Link gilt 14 Tage. Ein früherer Link wird damit ungültig.</p>
          ${ein.mail_aktiv === "1" ? "" : '<p class="klein">Der E-Mail-Versand ist nicht eingerichtet. Kopier den Link und schick ihn selbst, zum Beispiel per Teams.</p>'}`,
          [{ text: "Abbrechen" }, { text: "Link kopieren", aktion: () => "kopieren" }, ...(ein.mail_aktiv === "1" ? [{ text: "Per E-Mail senden", klasse: "haupt-k", aktion: () => "senden" }] : [])]);
        if (w === "senden") { await api("POST", `benutzer/${b.id}/einladung`, { senden: true }); melde(`Einladung an ${b.email} verschickt.`); }
        if (w === "kopieren") {
          const r2 = await api("POST", `benutzer/${b.id}/einladung`, {});
          try { await navigator.clipboard.writeText(r2.link); melde("Einladungslink kopiert."); }
          catch (err2) { await dialog("Einladungslink", `<p class="klein">Bitte markieren und kopieren:</p><textarea readonly rows="3" style="width:100%">${esc(r2.link)}</textarea>`, [{ text: "Schließen" }]); }
        }
        if (w) ladeB();
        return;
      }
      if (s) { await api("PUT", `benutzer/${s.dataset.sperr}`, { aktiv: s.dataset.aktiv === "1" ? 0 : 1 }); melde(s.dataset.aktiv === "1" ? "Zugang gesperrt." : "Zugang freigegeben."); ladeB(); }
      if (p) {
        const b = liste.find((x) => x.id === Number(p.dataset.pw));
        const ok = await dialog(`Passwort für ${b.name}`, `<div class="dfehler"></div><form class="formular" style="grid-template-columns:1fr" onsubmit="return false">
          <label><span class="pflicht">Neues Passwort (mindestens 8 Zeichen)</span><input name="pw" type="text" minlength="8" autocomplete="new-password" required></label>
          <p class="klein">Gib das Passwort der Person persönlich weiter. Sie kann es danach unter Einstellungen selbst ändern.</p></form>`,
          [{ text: "Abbrechen" }, { text: "Setzen", klasse: "haupt-k", aktion: async (hg) => api("PUT", `benutzer/${b.id}`, { passwort: hg.querySelector("[name=pw]").value }) }]);
        if (ok) melde("Passwort gesetzt.");
      }
      if (r) {
        const b = liste.find((x) => x.id === Number(r.dataset.rechte));
        if (await rechteDialog(b, info)) { await ladeB(); if (b.id === S.ich.id) ichNeuLaden(); }
      }
    } catch (err) { melde(err.message, true); }
  });

  el.querySelector("#neuB").onclick = async () => {
    await lade("objekte");
    setTimeout(() => { const sel = document.querySelector(".dialog select[name=rolle]"); if (sel) sel.onchange = () => { document.querySelector(".dialog .eig-wahl").hidden = sel.value !== "eigentuemer"; }; }, 0);
    const ok = await dialog("Zugang anlegen", `<div class="dfehler"></div><form class="formular" onsubmit="return false">
      <label><span class="pflicht">Name</span><input name="name" required></label><label><span class="pflicht">E-Mail</span><input name="email" type="email" required></label>
      <label><span class="pflicht">Erstes Passwort</span><input name="passwort" type="text" minlength="8" autocomplete="new-password" required></label>
      <label>Rolle<select name="rolle">${Object.entries(info.rollennamen).map(([k, t]) => `<option value="${k}" ${k === "benutzer" ? "selected" : ""}>${t}</option>`).join("")}</select></label>
      <div class="breit eig-wahl" hidden><div class="sl-titel">Objekte, die der Eigentümer sehen darf</div>${eigObjekteHaken([])}</div>
      <p class="klein breit"><b>Administrator</b>: darf alles. <b>Objektleiter</b>: alles im Objekt, keine Zugänge und Einstellungen. <b>Benutzer</b>: arbeitet mit, Rechte wie unten in der Rolle. <b>Zuschauer</b>: sieht alles, ändert nichts. <b>Eigentümer</b>: sieht nur die gewählten Objekte und ändert nichts.</p></form>`,
      [{ text: "Abbrechen" }, { text: "Anlegen", klasse: "haupt-k", aktion: async (hg) => {
        const d = Object.fromEntries(new FormData(hg.querySelector("form")));
        delete d.eobj;
        if (d.rolle === "eigentuemer") d.objekte = [...hg.querySelectorAll(".eig-wahl input:checked")].map((c) => Number(c.value));
        return api("POST", "benutzer", d);
      } }]);
    if (ok) { melde("Zugang angelegt."); ladeB(); }
  };

  /* Verlauf */
  const vl = await api("GET", "verlauf");
  const namen = { ...Object.fromEntries(Object.entries(S.schema).map(([k, r]) => [k, r.einzahl])), benutzer: "Zugang", rollen: "Rolle", einstellungen: "Einstellungen" };
  el.querySelector("#vl").innerHTML = `<table><thead><tr><th>Zeit</th><th>Wer</th><th>Was</th><th>Bereich</th><th>Info</th></tr></thead><tbody>${vl.slice(0, 80).map((v) =>
    `<tr><td>${datum(v.zeit)} ${v.zeit.slice(11, 16)}</td><td>${esc(v.benutzer)}</td><td>${esc(v.aktion)}</td><td>${esc(namen[v.tabelle] || v.tabelle || "")}${v.datensatz && DETAIL[v.tabelle] && v.aktion !== "gelöscht" ? ` <a href="#/${v.tabelle}/${v.datensatz}">öffnen</a>` : ""}</td><td>${esc(v.info)}</td></tr>`).join("")}</tbody></table>`;
};

/* Eigene Rechte eines Zugangs an- und abwählen */
async function rechteDialog(b, info) {
  const rolle = info.rollen[b.rolle] || {};
  const gruppen = [...new Set(info.liste.map((r) => r.gruppe))];
  const html = `<div class="dfehler"></div><p>Rolle: <b>${esc(info.rollennamen[b.rolle])}</b>. Häkchen setzen oder entfernen. Was von der Rolle abweicht, ist markiert.</p>
    <div class="rechte-liste">${gruppen.map((g) => `<div class="rl-gruppe">${esc(g)}</div>` + info.liste.filter((r) => r.gruppe === g).map((r) => `
      <label class="rl-zeile"><input type="checkbox" class="haken" data-r="${r.key}" ${b.rechte[r.key] ? "checked" : ""}><span>${esc(r.text)}</span>
      <span class="rl-abw" data-abw="${r.key}"></span></label>`).join("")).join("")}</div>`;
  const p = dialog(`Rechte für ${b.name}`, html, [
    { text: "Wie Rolle", aktion: async (hg) => { await api("PUT", `benutzer/${b.id}`, { rechte: null }); melde("Rechte wie Rolle."); return true; } },
    { text: "Abbrechen" },
    { text: "Speichern", klasse: "haupt-k", aktion: async (hg) => {
      const abw = {};
      hg.querySelectorAll("[data-r]").forEach((c) => { if (c.checked !== !!rolle[c.dataset.r]) abw[c.dataset.r] = c.checked; });
      await api("PUT", `benutzer/${b.id}`, { rechte: Object.keys(abw).length ? abw : null });
      melde("Rechte gespeichert.");
      return true;
    } },
  ]);
  const hg = letzterDialog();
  const markieren = () => hg.querySelectorAll("[data-r]").forEach((c) => {
    const anders = c.checked !== !!rolle[c.dataset.r];
    hg.querySelector(`[data-abw="${c.dataset.r}"]`).innerHTML = anders ? `<span class="marke m-neu">${c.checked ? "zusätzlich" : "entzogen"}</span>` : "";
  });
  hg.addEventListener("change", markieren);
  markieren();
  return p;
}
