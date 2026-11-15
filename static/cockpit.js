/* Casa CAFM – Cockpit: neue Übersicht mit Objektfoto, Objekt-Zustand, Kennzahlen und „Was ansteht“ */
"use strict";

const cpEuro = (v) => Number(v || 0).toLocaleString("de-DE", { maximumFractionDigits: 0 }) + " €";
const cpMonat = (ym) => new Date(ym + "-15").toLocaleDateString("de-DE", { month: "short" }).replace(".", "");
const cpFarbe = (tage) => tage < 0 ? "var(--ueber)" : tage <= 30 ? "var(--bald)" : "var(--ok)";
const cpWann = (tage) => tage < 0 ? `überfällig seit ${-tage} T.` : tage === 0 ? "heute" : tage === 1 ? "morgen" : `in ${tage} Tagen`;
const CP_PRIO = { Notfall: "var(--ueber)", Hoch: "var(--ueber)", Normal: "var(--bald)", Niedrig: "var(--grau)" };

function cpZustandErklaeren(c) {
  dialog("So wird der Objekt-Zustand berechnet", `<p>Der Wert zeigt auf einen Blick, wie das Objekt dasteht. Er setzt sich aus drei Teilen zusammen:</p>
    <table class="vg-pruef"><thead><tr><th>Teil</th><th>Gewicht</th><th>aktuell</th></tr></thead><tbody>
      <tr><td><b>Wartungen im Plan</b><br><span class="klein">Anteil der aktiven Wartungen und Prüfungen, die nicht überfällig sind</span></td><td>50 %</td><td><b>${c.teile.wartung} %</b></td></tr>
      <tr><td><b>Störungen</b><br><span class="klein">100 minus 10 je offene Störung (Hoch 20, Notfall 30)</span></td><td>30 %</td><td><b>${c.teile.stoerung} %</b></td></tr>
      <tr><td><b>SV-Mängel</b><br><span class="klein">100 minus 15 je offenen Mangel (erheblich 25, gefährlich 40)</span></td><td>20 %</td><td><b>${c.teile.sv} %</b></td></tr>
    </tbody></table><p class="klein">Ergebnis: ${c.zustand} %. Die Rechnung lässt sich anpassen.</p>`, [{ text: "Schließen" }]);
}

SEITEN.start = async (el) => {
  const [d, wetter] = await Promise.all([zaehlerNav(), api("GET", "wetter").catch(() => null), lade("objekte"), lade("dienstleister")]);
  if (!d) { el.innerHTML = seitenkopf("Cockpit") + '<div class="fehler">Die Übersicht ließ sich nicht laden.</div>'; return; }
  const c = d.cockpit, k = d.kennzahlen;
  const o = typeof owObjekt === "function" ? owObjekt() : null;
  const eig = S.ich.rolle === "eigentuemer";
  const vorname = S.ich.name.split(" ").find((w) => !/\.$/.test(w)) || S.ich.name;
  const stunde = new Date().getHours();
  const warn = (wetter && wetter.wd_warnungen) || [];
  const schnee = warn.find((w) => w.art === "Neuschnee"), glatt = warn.find((w) => w.art === "Glätte");
  const tagWort = (iso) => tageBis(iso) === 0 ? "heute" : "morgen";

  /* Was braucht Aufmerksamkeit? */
  const dinge = [];
  if (c.wartungen_ueberfaellig) dinge.push(`${c.wartungen_ueberfaellig} überfällige ${c.wartungen_ueberfaellig === 1 ? "Wartung oder Prüfung" : "Wartungen und Prüfungen"}`);
  if (c.stoerungen_hoch) dinge.push(`${c.stoerungen_hoch} ${c.stoerungen_hoch === 1 ? "Störung" : "Störungen"} mit hoher Priorität`);
  if (schnee) dinge.push(`${String(schnee.neuschnee_cm).replace(".", ",")} cm Neuschnee ${tagWort(schnee.datum)}${schnee.ab ? ` ab ${schnee.ab} Uhr` : ""}`);
  else if (glatt) dinge.push(`Glättegefahr ${tagWort(glatt.datum)}`);
  if (k.vertraege_kuendigen && !eig) dinge.push(`${k.vertraege_kuendigen} ${k.vertraege_kuendigen === 1 ? "Kündigungsfrist" : "Kündigungsfristen"} in 90 Tagen`);
  const satz = dinge.length ? `<b>${dinge.length === 1 ? "1 Sache braucht" : `${dinge.length} Dinge brauchen`}</b> deine Aufmerksamkeit: ${dinge.length > 1 ? dinge.slice(0, -1).join(", ") + " und " + dinge[dinge.length - 1] : dinge[0]}.`
    : "<b>Alles im grünen Bereich.</b> Nichts ist überfällig und keine dringende Störung offen.";

  /* Was ansteht: Wartungen und Prüfungen plus Schneewarnung */
  const termine = d.faellig.map((w) => ({ datum: w.naechste, titel: w.titel, text: [S.objekt ? "" : refText("objekte", w.objekt_id), w.art].filter(Boolean).join(" · "), link: `#/wartungen/${w.id}`, tage: tageBis(w.naechste) }));
  warn.forEach((w) => termine.push({ datum: w.datum, titel: w.art === "Neuschnee" ? `Winterdienst: ${String(w.neuschnee_cm).replace(".", ",")} cm Neuschnee` : "Winterdienst: Glättegefahr",
    text: w.ab ? `ab ca. ${w.ab} Uhr` : "laut Wettervorhersage", link: "#/winterdienst", tage: tageBis(w.datum), blau: true }));
  termine.sort((a, b) => (a.datum < b.datum ? -1 : 1));

  const ring = 245, rest = Math.round(ring * (1 - c.zustand / 100));
  const maxM = Math.max(1, ...c.monate.map((m) => m.anzahl));
  const vg = c.vorgaenge, vgMax = Math.max(1, ...Object.values(vg).map((x) => x.anzahl));
  const bild = o && o.bild ? objektBildUrl(o) : "";
  const w0 = wetter && wetter.jetzt ? wetter : null;

  el.innerHTML = `
  <section class="cp-held ${bild ? "" : "ohne-bild"}" ${bild ? `style="--bild:url('${bild}')"` : ""}>
    <div class="cp-gruss">
      <div class="cp-text"><div class="cp-k">${esc(o ? (o.kuerzel || o.name) : "Alle Objekte")} · Cockpit</div>
        <h1>Guten ${stunde < 11 ? "Morgen" : stunde < 18 ? "Tag" : "Abend"}, ${esc(vorname)}</h1>
        <p>${satz}</p>
        <div class="cp-akt">${darf("tickets_anlegen") ? `<button class="cp-kn p" id="cpStoer">${icon("plus")}Störung melden</button>` : ""}
          ${darf("vorgaenge") ? `<button class="cp-kn" id="cpKi">${icon("vorgaenge")}<span>Dokument von Claude auswerten</span></button>` : ""}
          ${darf("winterdienst") ? `<button class="cp-kn" id="cpWd">${icon("winterdienst")}<span>Winterdienst starten</span></button>` : ""}</div></div>
      <button class="cp-zustand" id="cpZustand" title="So wird der Wert berechnet"><div class="cp-ring"><svg viewBox="0 0 92 92"><circle cx="46" cy="46" r="39" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="9"/>
          <circle cx="46" cy="46" r="39" fill="none" stroke="${c.zustand >= 80 ? "#4CC38A" : c.zustand >= 60 ? "#F5B335" : "#FF6A3D"}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${ring}" stroke-dashoffset="${rest}"/></svg><b>${c.zustand}%</b></div>
        <div><small>Objekt-Zustand</small><ul>
          <li style="--c:${c.teile.wartung >= 90 ? "#4CC38A" : "#F5B335"}">Wartungen im Plan ${c.teile.wartung} %</li>
          <li style="--c:${c.sv_offen ? "#F5B335" : "#4CC38A"}">${c.sv_offen} SV-${c.sv_offen === 1 ? "Mangel" : "Mängel"} offen</li>
          <li style="--c:${c.wartungen_ueberfaellig ? "#FF6A3D" : "#4CC38A"}">${c.wartungen_ueberfaellig} ${c.wartungen_ueberfaellig === 1 ? "Termin" : "Termine"} überfällig</li></ul></div></button>
    </div>
  </section>
  <div class="cp-inhalt">
    <div class="cp-kz">
      <a class="karte cp-kachel ${k.tickets_offen ? "akzent" : ""}" style="--c:var(--orange)" href="#/tickets"><div class="ic">${icon("tickets")}</div>${c.stoerungen_hoch ? `<span class="tr">${c.stoerungen_hoch} hoch</span>` : ""}<div class="w">${k.tickets_offen}</div><div class="t">offene Störungen</div></a>
      <a class="karte cp-kachel" style="--c:var(--ueber)" href="#/wartungen?f=ueber"><div class="ic">${icon("kalender")}</div><div class="w">${k.wartung_ueberfaellig}</div><div class="t">${k.wartung_ueberfaellig === 1 ? "Termin" : "Termine"} überfällig</div></a>
      <a class="karte cp-kachel" style="--c:var(--bald)" href="#/wartungen?f=30"><div class="ic">${icon("wartungen")}</div><div class="w">${k.wartung_30}</div><div class="t">fällig in 30 Tagen</div></a>
      ${eig ? `<a class="karte cp-kachel" style="--c:#2F6FD0" href="#/anlagen"><div class="ic">${icon("anlagen")}</div><div class="w">${k.anlagen}</div><div class="t">Anlagen</div></a>`
        : `<a class="karte cp-kachel" style="--c:#2F6FD0" href="#/vorgaenge${S.objekt ? "/" + S.objekt : ""}"><div class="ic">${icon("vorgaenge")}</div>${vg.offen.anzahl ? `<span class="tr">${vg.offen.anzahl} offen</span>` : ""}<div class="w">${cpEuro(vg.offen.summe)}</div><div class="t">offene Angebote</div></a>`}
      <a class="karte cp-kachel" style="--c:var(--ok)" href="#/wartungen"><div class="ic">${icon("svpruefplan")}</div><div class="w">${c.teile.wartung} %</div><div class="t">Wartungen im Plan</div></a>
    </div>
    <div class="titelzeile cp-anker"></div>
    <div class="cp-zwei">
      <div class="karte"><div class="cp-kk"><h3>Was ansteht</h3><div class="cp-tabs"><button data-tage="7">7 Tage</button><button data-tage="30" class="an">30 Tage</button></div></div><div class="cp-zeit" id="cpZeit"></div></div>
      <div class="karte"><div class="cp-kk"><h3>Störungen</h3><a href="#/tickets">Alle ${k.tickets_offen} ansehen →</a></div>
        <div class="cp-tick">${d.tickets.slice(0, 5).map((t) => `<a class="t" href="#/tickets/${t.id}" style="--c:${CP_PRIO[t.prioritaet] || "var(--bald)"}"><div><b>${esc(t.titel)}</b><span>${esc(t.nummer || "")} · ${esc(t.status || "")}${S.objekt ? "" : " · " + esc(refText("objekte", t.objekt_id))}</span></div><span class="cp-pill">${esc(t.prioritaet || "Normal")}</span></a>`).join("")
          || '<p class="klein">Keine offenen Störungen.</p>'}</div></div>
    </div>
    <div class="cp-drei">
      <div class="karte"><div class="cp-kk"><h3>Wartungen erledigt</h3><a href="#/wartungen">Wartungsplan →</a></div><div class="cp-gross">${c.erledigt_jahr}<small>erledigt in ${new Date().getFullYear()}</small></div>
        <div class="cp-balken">${c.monate.map((m) => `<div title="${m.anzahl} erledigt"><span>${m.anzahl || ""}</span><i style="height:${Math.max(4, (m.anzahl / maxM) * 100)}%" class="${m.anzahl ? "" : "nix"}"></i>${cpMonat(m.monat)}</div>`).join("")}</div></div>
      ${eig ? `<div class="karte"><div class="cp-kk"><h3>Bestand</h3><a href="#/anlagen">Anlagen →</a></div><div class="cp-gross">${k.anlagen}<small>Anlagen</small></div><p class="klein">Eigentümer-Ansicht: nur ansehen.</p></div>`
        : `<div class="karte"><div class="cp-kk"><h3>Vorgangsliste</h3><a href="#/vorgaenge${S.objekt ? "/" + S.objekt : ""}">Öffnen →</a></div><div class="cp-gross">${cpEuro(vg.offen.summe)}<small>offen</small></div>
        <div class="cp-trichter">${[["offen", "var(--grau)"], ["beauftragt", "var(--bald)"], ["fertiggestellt", "#2F6FD0"], ["abgerechnet", "var(--ok)"]].map(([s, f]) =>
          `<div><span>${s}</span><i style="--c:${f};--w:${Math.max(vg[s].anzahl ? 6 : 0, (vg[s].anzahl / vgMax) * 100)}%"></i><b>${vg[s].anzahl}</b></div>`).join("")}</div>
        ${vg.fertiggestellt.anzahl ? `<p class="klein" style="margin-top:14px">${vg.fertiggestellt.anzahl} ${vg.fertiggestellt.anzahl === 1 ? "Vorgang ist" : "Vorgänge sind"} fertig und noch nicht abgerechnet.</p>` : ""}</div>`}
      ${w0 ? `<a class="karte cp-wetter" href="#/winterdienst"><div class="fl">${schnee ? "❄" : "☁"}</div><h3>Wetter · ${esc(w0.ort || "")}</h3><div class="tmp">${Math.round(w0.jetzt.temp)}°</div>
        <div>${esc((typeof WETTER_TEXT !== "undefined" && WETTER_TEXT[w0.jetzt.code]) || "")}${w0.jetzt.gefuehlt != null ? ` · gefühlt ${Math.round(w0.jetzt.gefuehlt)}°` : ""}</div>
        ${schnee ? `<div class="ws"><b>${tagWort(schnee.datum) === "heute" ? "Heute" : "Morgen"} ${String(schnee.neuschnee_cm).replace(".", ",")} cm Neuschnee</b>${schnee.ab ? ` ab ca. ${schnee.ab} Uhr` : ""}. Winterdienst einplanen.</div>`
          : glatt ? `<div class="ws"><b>Glättegefahr ${tagWort(glatt.datum)}.</b> Streuen einplanen.</div>` : '<div class="ws">Keine Warnung für den Winterdienst.</div>'}
        <div class="tage">${(w0.tage || []).map((t, i) => `<span>${i === 0 ? "Heute" : new Date(t.datum + "T12:00:00").toLocaleDateString("de-DE", { weekday: "short" })}<b>${Math.round(t.max)}°</b></span>`).join("")}</div></a>`
        : `<div class="karte"><div class="cp-kk"><h3>Verträge</h3><a href="#/vertraege">Öffnen →</a></div><div class="cp-gross">${k.vertraege_kuendigen}<small>Kündigungsfristen in 90 Tagen</small></div></div>`}
    </div>
    ${d.kuendigen.length && !eig ? `<div class="karte"><div class="cp-kk"><h3>Kündigungsfristen</h3><a href="#/vertraege">Verträge →</a></div><div class="cp-zeit">${d.kuendigen.map((v) =>
      `<a class="e" href="#/vertraege" style="--c:var(--bald)"><div class="d"><b>${v.kuendigen_bis.slice(8, 10)}</b><span>${cpMonat(v.kuendigen_bis.slice(0, 7))}</span></div><div class="n"><b>${esc(v.titel)}</b><span>${esc(refText("dienstleister", v.dienstleister_id) || "")}</span></div><span class="cp-pill">kündigen bis ${datum(v.kuendigen_bis)}</span></a>`).join("")}</div></div>` : ""}
  </div>`;

  const zeitZeichnen = (tage) => {
    const liste = termine.filter((t) => t.tage <= tage).slice(0, 8);
    el.querySelector("#cpZeit").innerHTML = liste.length ? liste.map((t) => `<a class="e ${t.tage < 0 ? "h" : ""}" href="${t.link}" style="--c:${t.blau ? "#2F6FD0" : cpFarbe(t.tage)}">
      <div class="d"><b>${t.datum.slice(8, 10)}</b><span>${cpMonat(t.datum.slice(0, 7))}</span></div><div class="n"><b>${esc(t.titel)}</b><span>${esc(t.text)}</span></div><span class="cp-pill">${cpWann(t.tage)}</span></a>`).join("")
      : '<p class="klein">In diesem Zeitraum steht nichts an.</p>';
  };
  zeitZeichnen(30);
  el.querySelectorAll(".cp-tabs button").forEach((b) => b.onclick = () => { el.querySelectorAll(".cp-tabs button").forEach((x) => x.classList.toggle("an", x === b)); zeitZeichnen(Number(b.dataset.tage)); });
  el.querySelector("#cpZustand").onclick = () => cpZustandErklaeren(c);
  const st = el.querySelector("#cpStoer");
  if (st) st.onclick = async () => { const t = await bearbeiten("tickets", null, S.objekt ? { objekt_id: S.objekt } : {}); if (t && t.id) location.hash = `#/tickets/${t.id}`; };
  const ki = el.querySelector("#cpKi");
  if (ki) ki.onclick = async () => { if (await vgKiAuswerten(S.objekt || "")) route(); };
  const wd = el.querySelector("#cpWd");
  if (wd) wd.onclick = async () => { const e = await wdBeginnen({ objekt_id: S.objekt || "" }); if (e) location.hash = `#/winterdienst/${e.id}`; };
};

/* Cockpit: Kopfzeile liegt über dem Foto. Handy: feste Leiste unten. Strg+K springt in die Suche. */
(() => {
  const altRoute = route;
  route = async function () {
    const name = (location.hash.slice(1) || "/").split("?")[0].split("/").filter(Boolean)[0] || "start";
    document.body.classList.toggle("cp-an", name === "start");
    document.querySelectorAll(".unten-leiste a[data-u]").forEach((a) => a.classList.toggle("an", a.dataset.u === name));
    return altRoute.apply(this, arguments);
  };
  const altRahmen = rahmen;
  rahmen = function () {
    altRahmen.apply(this, arguments);
    document.querySelectorAll(".unten-leiste").forEach((x) => x.remove());
    if (!S.ich) return;
    const leiste = document.createElement("div");
    leiste.className = "unten-leiste";
    leiste.innerHTML = `<a href="#/" data-u="start">${icon("start")}Cockpit</a><a href="#/tickets" data-u="tickets">${icon("tickets")}Störungen</a>
      ${darf("tickets_anlegen") ? `<button class="plus" id="untenPlus" aria-label="Störung melden">${icon("plus")}</button>` : ""}
      <a href="#/wartungen" data-u="wartungen">${icon("wartungen")}Wartung</a><a href="#" id="untenMehr">${icon("menue")}Mehr</a>`;
    document.body.appendChild(leiste);
    const plus = leiste.querySelector("#untenPlus");
    if (plus) plus.onclick = async () => { const t = await bearbeiten("tickets", null, S.objekt ? { objekt_id: S.objekt } : {}); if (t && t.id) location.hash = `#/tickets/${t.id}`; };
    leiste.querySelector("#untenMehr").onclick = (e) => { e.preventDefault(); const s = document.getElementById("seite"); if (s) s.classList.toggle("offen"); };
  };
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { const f = document.getElementById("suchfeld"); if (f) { e.preventDefault(); f.focus(); f.select(); } }
  });
})();
