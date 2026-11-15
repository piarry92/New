/* Casa CAFM – Eigentümer-Zugang: nur ansehen, nur die zugewiesenen Objekte */
"use strict";

const istEigentuemer = () => S.ich && S.ich.rolle === "eigentuemer";
const EIGENTUEMER_AUS = ["katalog", "checklisten", "pruefungen", "schluessel", "zugaenge"];

function eigObjekteText(ids) {
  const alle = S.cache.objekte || [];
  const t = (ids || []).map((id) => (alle.find((o) => o.id === id) || {}).kuerzel || `#${id}`);
  return t.length ? t.join(", ") : "kein Objekt";
}
function eigObjekteHaken(gewaehlt) {
  return `<div class="wd-empf">${(S.cache.objekte || []).map((o) => `<label class="wn-haken"><input type="checkbox" name="eobj" value="${o.id}" ${gewaehlt.includes(o.id) ? "checked" : ""}> ${esc(anzeige("objekte", o))}</label>`).join("")}</div>`;
}
/* olFest = null: Eigentümer. Sonst Objektleiter: olFest sind die Objekte, bei denen er am Objekt als Objektleiter eingetragen ist. */
async function eigObjekteWaehlen(gewaehlt, olFest = null) {
  await lade("objekte");
  const ol = Array.isArray(olFest);
  const fest = ol ? olFest : [];
  return dialog(ol ? "Objekte für den Objektleiter" : "Objekte für den Eigentümer", `<div class="dfehler"></div>
    <p class="klein">${ol ? "Der Objektleiter sieht und bearbeitet nur diese Objekte. Zusätzlich gelten alle Objekte, bei denen er in den Stammdaten als „Objektleiter (Zugang)“ eingetragen ist." : "Der Eigentümer sieht nur diese Objekte, mit Anlagen, Wartungen, Prüfungen, Störmeldungen, Plänen, Zählern und Dokumenten. Ändern kann er nichts."}</p>
    ${ol && fest.length ? `<p class="klein">Über die Stammdaten schon zugewiesen: <b>${esc(eigObjekteText(fest))}</b></p>` : ""}${eigObjekteHaken(gewaehlt)}`, [
    { text: "Abbrechen" },
    { text: "Speichern", klasse: "haupt-k", aktion: async (hg) => {
      const ids = [...hg.querySelectorAll("input[name=eobj]:checked")].map((c) => Number(c.value));
      if (!ids.length && !ol) throw new Error("Bitte mindestens ein Objekt wählen.");
      return ids;
    } }]);
}

/* Einladung erzeugen und anbieten (Link kopieren oder per E-Mail) */
async function eigEinladen(b) {
  const ein = await einstellungenLaden(true);
  const w = await dialog(`Einladung für ${b.name}`, `<p>${esc(b.name)} bekommt einen Link und legt damit das Passwort selbst fest. Der Link gilt 14 Tage.</p>
    ${ein.mail_aktiv === "1" ? "" : '<p class="klein">Der E-Mail-Versand ist nicht eingerichtet. Kopier den Link und schick ihn selbst.</p>'}`,
    [{ text: "Später" }, { text: "Link kopieren", aktion: () => "kopieren" }, ...(ein.mail_aktiv === "1" ? [{ text: "Per E-Mail senden", klasse: "haupt-k", aktion: () => "senden" }] : [])]);
  if (w === "senden") { await api("POST", `benutzer/${b.id}/einladung`, { senden: true }); melde(`Einladung an ${b.email} verschickt.`); }
  if (w === "kopieren") {
    const r = await api("POST", `benutzer/${b.id}/einladung`, {});
    try { await navigator.clipboard.writeText(r.link); melde("Einladungslink kopiert."); }
    catch (e) { await dialog("Einladungslink", `<p class="klein">Bitte markieren und kopieren:</p><textarea readonly rows="3" style="width:100%">${esc(r.link)}</textarea>`, [{ text: "Schließen" }]); }
  }
}

/* Karte auf der Objektseite: Eigentümer-Zugänge dieses Objekts */
async function eigentuemerKarte(ziel, o) {
  const alle = await api("GET", "benutzer");
  const hier = alle.filter((b) => b.rolle === "eigentuemer" && (b.objekte || []).includes(o.id));
  ziel.innerHTML = `<div class="karte-kopf"><h3>Eigentümer-Zugang</h3><button class="knopf klein haupt-k" id="eigNeu">${icon("plus")} Zugang für Eigentümer</button></div>
    <p class="klein">Der Eigentümer sieht nur dieses Objekt und kann nichts ändern.${o.eigentuemer ? ` Eigentümer laut Stammdaten: <b>${esc(o.eigentuemer)}</b>.` : ""}</p>
    ${hier.length ? `<ul class="liste">${hier.map((b) => `<li>${avatar(b)}<div><b>${esc(b.name)}</b><br><span class="klein">${esc(b.email)}${(b.objekte || []).length > 1 ? ` · sieht auch ${esc(eigObjekteText(b.objekte.filter((x) => x !== o.id)))}` : ""}</span></div>
      <span class="rechts">${!b.aktiv ? '<span class="marke m-arbeit">gesperrt</span>' : b.einladung_offen ? '<span class="marke m-bald">Einladung offen</span>' : '<span class="marke m-ok">aktiv</span>'}
      <button class="knopf klein" data-eeinl="${b.id}">Einladen</button><button class="knopf klein" data-esperr="${b.id}" data-aktiv="${b.aktiv}">${b.aktiv ? "Sperren" : "Freigeben"}</button></span></li>`).join("")}</ul>`
      : '<p class="klein">Noch kein Zugang angelegt.</p>'}`;
  ziel.querySelector("#eigNeu").onclick = async () => {
    const neu = await dialog(`Eigentümer-Zugang für ${o.kuerzel}`, `<div class="dfehler"></div><form class="formular" onsubmit="return false">
      <label><span class="pflicht">Name</span><input name="name" value="${esc(o.eigentuemer || "")}" autocomplete="off"></label>
      <label><span class="pflicht">E-Mail</span><input name="email" type="email" autocomplete="off"></label>
      <p class="klein breit">Es wird kein Passwort vergeben. Der Eigentümer bekommt eine Einladung und legt sein Passwort selbst fest. Er sieht nur ${esc(o.kuerzel)} und kann nichts ändern.</p></form>`, [
      { text: "Abbrechen" },
      { text: "Anlegen", klasse: "haupt-k", aktion: async (hg) => {
        const f = hg.querySelector("form");
        const r = await api("POST", "benutzer", { name: f.name.value, email: f.email.value, rolle: "eigentuemer", objekte: [o.id], einladen: true });
        return { id: r.id, name: f.name.value.trim(), email: f.email.value.trim() };
      } }]);
    if (neu) { melde("Eigentümer-Zugang angelegt."); await eigEinladen(neu); eigentuemerKarte(ziel, o); }
  };
  ziel.querySelectorAll("[data-eeinl]").forEach((k) => k.onclick = async () => { const b = hier.find((x) => x.id === Number(k.dataset.eeinl)); await eigEinladen(b); eigentuemerKarte(ziel, o); });
  ziel.querySelectorAll("[data-esperr]").forEach((k) => k.onclick = async () => {
    try { await api("PUT", `benutzer/${k.dataset.esperr}`, { aktiv: k.dataset.aktiv === "1" ? 0 : 1 }); melde(k.dataset.aktiv === "1" ? "Zugang gesperrt." : "Zugang freigegeben."); eigentuemerKarte(ziel, o); }
    catch (err) { melde(err.message, true); }
  });
}

(() => {
  const alt = DETAIL.objekte;
  DETAIL.objekte = async (el, id, q) => {
    await alt(el, id, q);
    if (istEigentuemer()) {
      el.querySelectorAll("#oqr, #oqrk").forEach((x) => x.remove());
      return;
    }
    if (!darf("benutzer_verwalten")) return;
    const o = (S.cache.objekte || []).find((x) => x.id === id) || await api("GET", `objekte/${id}`);
    const box = document.createElement("div");
    box.className = "karte"; box.id = "eigKarte";
    const r = el.querySelector("#r");
    r.parentNode.insertBefore(box, r);
    r.insertAdjacentHTML("beforebegin", '<div class="abstand"></div>');
    eigentuemerKarte(box, o);
  };
})();

/* Für Eigentümer: Menü schlanker, Hinweis „nur ansehen“, Objektseite statt Liste */
(() => {
  const altRahmen = rahmen;
  rahmen = function () {
    altRahmen.apply(this, arguments);
    if (!istEigentuemer()) return;
    document.querySelectorAll("#nav a").forEach((a) => { if (EIGENTUEMER_AUS.includes(a.dataset.nav)) a.remove(); });
    document.querySelectorAll("#nav .nav-gruppe").forEach((g) => {
      const n = g.nextElementSibling;
      if (!n || n.classList.contains("nav-gruppe")) g.remove();
    });
  };
  const altStart = SEITEN.start;
  SEITEN.start = async (el, ...rest) => {
    await altStart(el, ...rest);
    if (S.ich.rolle === "objektleiter") {
      await lade("objekte");
      const ob = S.cache.objekte || [];
      const kopf = el.querySelector(".titelzeile");
      if (kopf) kopf.insertAdjacentHTML("afterend", ob.length ? `<div class="karte eig-hinweis"><b>Deine Objekte:</b> ${ob.map((o) => `<a href="#/objekte/${o.id}">${esc(anzeige("objekte", o))}</a>`).join(", ")}</div>`
        : '<div class="karte eig-hinweis"><b>Dir ist noch kein Objekt zugewiesen.</b> Bitte bei einem Administrator melden. Er trägt dich am Objekt als Objektleiter ein oder unter Zugänge &amp; Rechte.</div>');
      return;
    }
    if (!istEigentuemer()) return;
    await lade("objekte");
    const ob = S.cache.objekte || [];
    const kopf = el.querySelector(".titelzeile");
    if (kopf) kopf.insertAdjacentHTML("afterend", `<div class="karte eig-hinweis"><b>Eigentümer-Ansicht</b> · nur ansehen · ${ob.map((o) => `<a href="#/objekte/${o.id}">${esc(anzeige("objekte", o))}</a>`).join(", ") || "noch kein Objekt freigegeben"}</div>`);
  };
})();
