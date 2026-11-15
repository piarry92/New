/* Casa CAFM – Weihnachtsmotto (1. Dezember bis 6. Januar, abschaltbar) */
"use strict";

/* Erster Advent = vierter Sonntag vor dem 25. Dezember */
function ersterAdvent(jahr) {
  const h = new Date(jahr, 11, 24);           // Heiligabend
  const tag = h.getDay();                      // 0 = Sonntag
  const vierter = new Date(jahr, 11, 24 - (tag === 0 ? 7 : tag)); // letzter Sonntag vor dem 25.12.
  return new Date(jahr, 11, vierter.getDate() - 21);
}

function weihnachtPhase(d = new Date()) {
  const modus = (typeof EINST !== "undefined" && EINST && EINST.weihnachten) || "auto";
  if (modus === "aus") return null;
  const m = d.getMonth(), t = d.getDate(), j = d.getFullYear();
  const heute = new Date(j, m, t);
  let phase = null;
  if (m === 11 && t <= 23) phase = "advent";
  else if (m === 11 && t <= 26) phase = "weihnachten";
  else if (m === 11) phase = "silvester";
  else if (m === 0 && t <= 6) phase = "neujahr";
  if (!phase && modus === "an") phase = "advent";
  if (!phase) return null;
  const texte = { advent: "Frohe Adventszeit", weihnachten: "Frohe Weihnachten", silvester: "Einen guten Rutsch", neujahr: "Frohes neues Jahr" };
  // Brennende Kerzen am Adventskranz
  let kerzen = 0;
  if (m === 11) {
    const a1 = ersterAdvent(j);
    for (let i = 0; i < 4; i++) if (heute >= new Date(a1.getFullYear(), a1.getMonth(), a1.getDate() + 7 * i)) kerzen = i + 1;
    if (phase !== "advent") kerzen = 4;
  } else if (phase === "neujahr") kerzen = 4;
  const bisHeiligabend = Math.round((new Date(j, 11, 24) - heute) / 86400000);
  return { phase, text: texte[phase], kerzen, bisHeiligabend, jahr: m === 0 ? j : j + 1 };
}

function schneeErlaubt() {
  try { return localStorage.getItem("cafm-schnee") !== "aus"; } catch (e) { return true; }
}

/* Schnee: wenige Flocken, ganz leicht, klickt nicht im Weg. Aus bei „Bewegung reduzieren“. */
function schneeZeichnen(an) {
  let s = document.getElementById("schnee");
  if (!an) { if (s) s.remove(); return; }
  if (s) return;
  s = document.createElement("div");
  s.id = "schnee"; s.setAttribute("aria-hidden", "true");
  let html = "";
  for (let i = 0; i < 28; i++) {
    const links = Math.random() * 100, dauer = 9 + Math.random() * 10, verz = -Math.random() * 18;
    const groesse = 4 + Math.random() * 6, drift = (Math.random() * 60 - 30).toFixed(0);
    html += `<i style="left:${links.toFixed(1)}%;width:${groesse.toFixed(1)}px;height:${groesse.toFixed(1)}px;animation-duration:${dauer.toFixed(1)}s;animation-delay:${verz.toFixed(1)}s;--drift:${drift}px;opacity:${(0.35 + Math.random() * 0.45).toFixed(2)}"></i>`;
  }
  s.innerHTML = html;
  document.body.appendChild(s);
}

function weihnachtAnwenden() {
  const w = weihnachtPhase();
  document.documentElement.classList.toggle("weihnacht", !!w);
  schneeZeichnen(!!w && schneeErlaubt());
  const logo = document.querySelector(".seite .logo");
  if (logo) {
    let stern = logo.querySelector(".logo-stern");
    if (w && !stern) logo.insertAdjacentHTML("beforeend", '<span class="logo-stern" title="Frohe Festtage" aria-hidden="true">✦</span>');
    if (!w && stern) stern.remove();
  }
  return w;
}

function adventskranz(kerzen) {
  const x = [44, 84, 124, 164];
  const kerze = (i) => {
    const brennt = i < kerzen;
    return `<g><rect x="${x[i] - 8}" y="34" width="16" height="34" rx="3" fill="${brennt ? "#E63713" : "#EFCFB7"}"/>
      <line x1="${x[i]}" y1="34" x2="${x[i]}" y2="29" stroke="#3C3C3B" stroke-width="1.5"/>
      ${brennt ? `<path class="flamme" d="M${x[i]} 14 C ${x[i] + 6} 21, ${x[i] + 5} 28, ${x[i]} 29 C ${x[i] - 5} 28, ${x[i] - 6} 21, ${x[i]} 14 Z" fill="#E0A500"/>` : ""}</g>`;
  };
  return `<svg class="kranz" viewBox="0 0 208 92" role="img" aria-label="Adventskranz mit ${kerzen} brennenden Kerzen">
    <ellipse cx="104" cy="74" rx="96" ry="14" fill="#2F6B3A"/>
    <ellipse cx="104" cy="71" rx="84" ry="9" fill="#3A8F4B"/>
    ${[22, 64, 104, 144, 186].map((cx) => `<circle cx="${cx}" cy="76" r="4" fill="#B8323F"/>`).join("")}
    ${[0, 1, 2, 3].map(kerze).join("")}
  </svg>`;
}

function weihnachtsbaum() {
  const kugeln = [[52, 46, "#E63713"], [70, 58, "#E0A500"], [42, 70, "#E0A500"], [62, 80, "#B8323F"], [80, 88, "#E63713"], [34, 92, "#B8323F"], [56, 100, "#E0A500"]];
  return `<svg class="baum" viewBox="0 0 112 132" role="img" aria-label="Weihnachtsbaum">
    <rect x="49" y="108" width="14" height="16" rx="2" fill="#7A4A2A"/>
    <path d="M56 18 L82 56 H70 L92 84 H78 L102 112 H10 L34 84 H20 L42 56 H30 Z" fill="#2F6B3A"/>
    <path d="M56 18 L82 56 H70 L92 84 H78 L102 112 H56 Z" fill="#3A8F4B" opacity=".55"/>
    <path d="M38 62 Q56 72 76 60 M30 90 Q56 102 86 88" stroke="#EFCFB7" stroke-width="2" fill="none" stroke-dasharray="1 5" stroke-linecap="round"/>
    ${kugeln.map(([x, y, f], i) => `<circle class="kugel" style="animation-delay:${(i * 0.37).toFixed(2)}s" cx="${x}" cy="${y}" r="4.5" fill="${f}"/>`).join("")}
    <path class="baum-stern" d="M56 3 L59.5 12 L69 12.5 L61.5 18.5 L64 28 L56 22.5 L48 28 L50.5 18.5 L43 12.5 L52.5 12 Z" fill="#E0A500"/>
  </svg>`;
}

function weihnachtKarte(w) {
  let unter;
  if (w.phase === "advent" && w.bisHeiligabend > 0) unter = w.bisHeiligabend === 1 ? "Morgen ist Heiligabend." : `Noch ${w.bisHeiligabend} Tage bis Heiligabend.`;
  else if (w.phase === "advent") unter = "Heute ist Heiligabend.";
  else if (w.phase === "weihnachten") unter = w.bisHeiligabend === 0 ? "Heute ist Heiligabend. Schöne Feiertage." : "Schöne Feiertage und erholsame Tage.";
  else if (w.phase === "silvester") unter = `Alles Gute für ${w.jahr}.`;
  else unter = `Alles Gute für ${w.jahr}. Auf ein gutes gemeinsames Jahr.`;
  const kerzenText = w.phase === "advent" && w.kerzen ? `${w.kerzen}. Advent` : "";
  return `<div class="karte weihnacht-karte">
    <div class="haenger" aria-hidden="true"><span><b>★</b></span><span><b>✦</b></span><span><b>★</b></span><span><b>✦</b></span></div>
    ${adventskranz(w.kerzen)}
    <div class="wk-text"><div class="kicker">${kerzenText || "Casa Concept Consulting"}</div><b>${esc(w.text)}</b><span>${esc(unter)}</span></div>
    <div class="wk-rechts">${weihnachtsbaum()}<button class="knopf klein" id="schneeK" title="Schneefall nur bei dir an- oder ausschalten">${schneeErlaubt() ? "Schnee aus" : "Schnee an"}</button></div>
  </div>`;
}

/* Übersicht: Gruß-Karte oben einfügen */
(() => {
  const alt = SEITEN.start;
  SEITEN.start = async (el) => {
    await alt(el);
    try { await einstellungenLaden(); } catch (e) { /* ohne Einstellungen: Standard */ }
    const w = weihnachtAnwenden();
    if (!w) return;
    const kopf = el.querySelector(".titelzeile");
    if (!kopf) return;
    kopf.insertAdjacentHTML("afterend", weihnachtKarte(w));
    const h1 = kopf.querySelector("h1");
    if (h1 && !h1.querySelector(".gruss-sterne")) h1.insertAdjacentHTML("beforeend",
      ' <span class="gruss-sterne" aria-hidden="true"><i>✦</i><i>✧</i><i>✦</i><i>✧</i><i>✦</i></span>');
    const k = el.querySelector("#schneeK");
    k.onclick = () => {
      const an = !schneeErlaubt();
      try { localStorage.setItem("cafm-schnee", an ? "an" : "aus"); } catch (e) { /* egal */ }
      schneeZeichnen(an);
      k.textContent = an ? "Schnee aus" : "Schnee an";
    };
  };
})();

/* Einstellungen: Motto für alle (Administrator) und Schnee für sich selbst */
(() => {
  const alt = SEITEN.einstellungen;
  SEITEN.einstellungen = async (el) => {
    await alt(el);
    const ein = await einstellungenLaden(true);
    const modus = ein.weihnachten || "auto";
    const box = document.createElement("div");
    box.innerHTML = `<div class="abstand"></div><div class="karte" id="wnEinst"><h3>Weihnachtsmotto</h3>
      <form class="formular" style="grid-template-columns:1fr" onsubmit="return false">
        ${darf("einstellungen") ? `<label>Für alle<select name="weihnachten">
          <option value="auto" ${modus === "auto" ? "selected" : ""}>Automatisch vom 1. Dezember bis 6. Januar</option>
          <option value="an" ${modus === "an" ? "selected" : ""}>Immer an</option>
          <option value="aus" ${modus === "aus" ? "selected" : ""}>Aus</option></select></label>` : ""}
        <label class="wn-haken"><input type="checkbox" name="schnee" ${schneeErlaubt() ? "checked" : ""}> Schneefall bei mir anzeigen</label>
        <p class="klein">Zum Motto gehören ein Gruß mit Adventskranz auf der Übersicht, ein Stern am Logo und leichter Schneefall. Schnee gilt nur für dieses Gerät.</p>
        ${darf("einstellungen") ? '<div><button class="knopf haupt-k" id="wnSpeichern">Speichern</button></div>' : ""}
      </form></div>`;
    el.appendChild(box);
    const f = box.querySelector("form");
    f.schnee.onchange = () => {
      try { localStorage.setItem("cafm-schnee", f.schnee.checked ? "an" : "aus"); } catch (e) { /* egal */ }
      weihnachtAnwenden();
    };
    const sp = box.querySelector("#wnSpeichern");
    if (sp) sp.onclick = async () => {
      try { await api("PUT", "einstellungen", { weihnachten: f.weihnachten.value }); await einstellungenLaden(true); weihnachtAnwenden(); melde("Gespeichert."); }
      catch (err) { melde(err.message, true); }
    };
  };
})();

/* Nach dem Aufbau der Seite (Logo, Kopf) das Motto setzen */
(() => {
  const altRahmen = rahmen;
  rahmen = function () { altRahmen.apply(this, arguments); einstellungenLaden().then(weihnachtAnwenden).catch(() => weihnachtAnwenden()); };
})();
