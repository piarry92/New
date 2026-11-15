/* Casa CAFM – Jahresmotto: Weihnachten, Silvester/Neujahr, Winter, Ostern, Frühling, Sommer, Herbst (abschaltbar) */
"use strict";

/* ---------- Feste Tage ---------- */
function ersterAdvent(jahr) {
  const tag = new Date(jahr, 11, 24).getDay();
  const vierter = new Date(jahr, 11, 24 - (tag === 0 ? 7 : tag));
  return new Date(jahr, 11, vierter.getDate() - 21);
}
function ostersonntag(j) { // Gregorianische Osterformel
  const a = j % 19, b = Math.floor(j / 100), c = j % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31), tag = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(j, monat - 1, tag);
}
const mPlusTage = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const mTageBis = (von, bis) => Math.round((bis - von) / 86400000);

const MOTTO_NAMEN = { weihnachten: "Weihnachten", silvester: "Silvester", neujahr: "Neujahr", winter: "Winter", ostern: "Ostern",
  fruehling: "Frühling", sommer: "Sommer", herbst: "Herbst" };

function mottoModus() {
  const e = (typeof EINST !== "undefined" && EINST) || {};
  if (e.motto) return e.motto;
  if (e.weihnachten === "aus") return "aus";       // alte Einstellung übernehmen
  if (e.weihnachten === "an") return "weihnachten";
  return "auto";
}

function mottoAutomatisch(heute) {
  const m = heute.getMonth(), t = heute.getDate(), j = heute.getFullYear();
  const os = ostersonntag(j);
  if (heute >= mPlusTage(os, -14) && heute <= mPlusTage(os, 1)) return "ostern";
  if (m === 11 && t <= 26) return "weihnachten";
  if (m === 11) return "silvester";
  if (m === 0 && t <= 6) return "neujahr";
  const md = m * 100 + t;
  if (md < 220) return "winter";        // bis 19. März
  if (md < 521) return "fruehling";     // bis 20. Juni
  if (md < 823) return "sommer";        // bis 22. September
  return "herbst";                      // bis 30. November
}

/* Liefert alles, was die Seite zum Motto braucht */
function mottoHeute(d = new Date()) {
  const modus = mottoModus();
  if (modus === "aus") return null;
  const heute = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const j = heute.getFullYear();
  const name = modus === "auto" ? mottoAutomatisch(heute) : modus;
  const w = { name, kicker: "Casa Concept Consulting", effekt: null };
  if (name === "weihnachten") {
    const a1 = ersterAdvent(j);
    let kerzen = 0;
    for (let i = 0; i < 4; i++) if (heute >= mPlusTage(a1, 7 * i)) kerzen = i + 1;
    const bis = mTageBis(heute, new Date(j, 11, 24));
    if (bis > 0 || heute.getMonth() !== 11) {
      w.titel = "Frohe Adventszeit";
      if (kerzen && heute.getMonth() === 11) w.kicker = `${kerzen}. Advent`;
      w.text = bis === 1 ? "Morgen ist Heiligabend." : bis > 0 ? `Noch ${bis} Tage bis Heiligabend.` : "Eine schöne Adventszeit.";
    } else {
      kerzen = 4; w.titel = "Frohe Weihnachten";
      w.text = bis === 0 ? "Heute ist Heiligabend. Schöne Feiertage." : "Schöne Feiertage und erholsame Tage.";
    }
    w.kerzen = kerzen; w.effekt = "schnee";
  } else if (name === "silvester" || name === "neujahr") {
    const neuesJahr = heute.getMonth() >= 6 ? j + 1 : j;
    w.jahr = neuesJahr; w.effekt = "konfetti";
    if (name === "silvester") {
      const bis = mTageBis(heute, new Date(neuesJahr, 0, 1));
      w.titel = "Einen guten Rutsch";
      w.text = bis === 1 ? `Heute ist Silvester. Alles Gute für ${neuesJahr}.` : bis > 1 ? `Noch ${bis} Tage bis ${neuesJahr}.` : `Alles Gute für ${neuesJahr}.`;
    } else {
      w.titel = `Frohes neues Jahr ${neuesJahr}`;
      w.text = "Auf ein gutes und erfolgreiches gemeinsames Jahr.";
    }
  } else if (name === "ostern") {
    const os = ostersonntag(j), bis = mTageBis(heute, os);
    w.titel = "Frohe Ostern"; w.effekt = "blueten";
    w.text = bis > 2 ? `Noch ${bis} Tage bis Ostern.` : bis >= -1 ? "Schöne Osterfeiertage." : "Schöne Ostertage.";
  } else if (name === "fruehling") {
    w.titel = "Schönen Frühling"; w.effekt = "blueten";
    w.text = "Gute Zeit für die Frühjahrsbegehung: Dach, Außenanlagen und Fassaden.";
  } else if (name === "sommer") {
    w.titel = "Schönen Sommer";
    w.text = "Kälte und Lüftung im Blick behalten. Und an heißen Tagen genug trinken.";
  } else if (name === "herbst") {
    w.titel = "Schönen Herbst"; w.effekt = "blaetter";
    w.text = "Laub und Dachrinnen im Blick behalten. Gute Zeit für den Heizungscheck vor dem Winter.";
  } else if (name === "winter") {
    w.titel = "Schönen Winter"; w.effekt = "schnee";
    w.text = "Bei Schnee und Glätte an den Winterdienst denken.";
  }
  return w;
}

/* ---------- Bewegte Effekte (Schnee, Blüten, Blätter, Konfetti) ---------- */
const EFFEKT_WORT = { schnee: "Schnee", blueten: "Blüten", blaetter: "Blätter", konfetti: "Konfetti" };
function effekteErlaubt() {
  try {
    const v = localStorage.getItem("cafm-effekte");
    if (v) return v !== "aus";
    return localStorage.getItem("cafm-schnee") !== "aus";
  } catch (e) { return true; }
}
function effekteSetzen(an) { try { localStorage.setItem("cafm-effekte", an ? "an" : "aus"); } catch (e) { /* egal */ } }

function effektZeichnen(art) {
  let s = document.getElementById("effekte");
  if (s && s.dataset.art === art) return;
  if (s) s.remove();
  if (!art) return;
  s = document.createElement("div");
  s.id = "effekte"; s.dataset.art = art; s.setAttribute("aria-hidden", "true");
  const farben = { schnee: ["#fff"], blueten: ["#F7C6D3", "#FBE3EA", "#F2A7BC", "#FFFFFF"],
    blaetter: ["#C8561E", "#E0A500", "#A63A1C", "#8C5A2B", "#D9822B"], konfetti: ["#E0A500", "#E63713", "#2456A6", "#C9CBD0", "#3A8F4B"] }[art];
  const anzahl = { schnee: 28, blueten: 18, blaetter: 14, konfetti: 26 }[art];
  let html = "";
  for (let i = 0; i < anzahl; i++) {
    const g = art === "blaetter" ? 12 + Math.random() * 8 : art === "blueten" ? 7 + Math.random() * 5 : art === "konfetti" ? 5 + Math.random() * 4 : 4 + Math.random() * 6;
    const f = farben[Math.floor(Math.random() * farben.length)];
    html += `<i style="left:${(Math.random() * 100).toFixed(1)}%;animation-duration:${(9 + Math.random() * 10).toFixed(1)}s;animation-delay:${(-Math.random() * 18).toFixed(1)}s;--drift:${(Math.random() * 80 - 40).toFixed(0)}px;opacity:${(0.45 + Math.random() * 0.45).toFixed(2)}">`
      + `<b style="--g:${g.toFixed(1)}px;--f:${f};animation-duration:${(2.5 + Math.random() * 4).toFixed(1)}s;animation-delay:${(-Math.random() * 4).toFixed(1)}s"></b></i>`;
  }
  s.innerHTML = html;
  document.body.appendChild(s);
}

/* ---------- Bilder ---------- */
const BILD = {
  kranz(kerzen) {
    const x = [44, 84, 124, 164];
    const kerze = (i) => {
      const brennt = i < kerzen;
      return `<rect x="${x[i] - 8}" y="34" width="16" height="34" rx="3" fill="${brennt ? "#E63713" : "#EFCFB7"}"/>
        <line x1="${x[i]}" y1="34" x2="${x[i]}" y2="29" stroke="#3C3C3B" stroke-width="1.5"/>
        ${brennt ? `<path class="flamme" d="M${x[i]} 14 C ${x[i] + 6} 21, ${x[i] + 5} 28, ${x[i]} 29 C ${x[i] - 5} 28, ${x[i] - 6} 21, ${x[i]} 14 Z" fill="#E0A500"/>` : ""}`;
    };
    return `<svg class="bild-l" viewBox="0 0 208 92" role="img" aria-label="Adventskranz mit ${kerzen} brennenden Kerzen">
      <ellipse cx="104" cy="74" rx="96" ry="14" fill="#4C9A5A"/><ellipse cx="104" cy="71" rx="84" ry="9" fill="#3A8F4B"/>
      ${[22, 64, 104, 144, 186].map((cx) => `<circle cx="${cx}" cy="76" r="4" fill="#B8323F"/>`).join("")}
      ${[0, 1, 2, 3].map(kerze).join("")}</svg>`;
  },
  baum() {
    const k = [[52, 46, "#E63713"], [70, 58, "#E0A500"], [42, 70, "#E0A500"], [62, 80, "#B8323F"], [80, 88, "#E63713"], [34, 92, "#B8323F"], [56, 100, "#E0A500"]];
    return `<svg class="bild-r" viewBox="0 0 112 132" role="img" aria-label="Weihnachtsbaum">
      <rect x="49" y="108" width="14" height="16" rx="2" fill="#7A4A2A"/>
      <path d="M56 18 L82 56 H70 L92 84 H78 L102 112 H10 L34 84 H20 L42 56 H30 Z" fill="#2F6B3A"/>
      <path d="M56 18 L82 56 H70 L92 84 H78 L102 112 H56 Z" fill="#3A8F4B" opacity=".55"/>
      <path d="M38 62 Q56 72 76 60 M30 90 Q56 102 86 88" stroke="#EFCFB7" stroke-width="2" fill="none" stroke-dasharray="1 5" stroke-linecap="round"/>
      ${k.map(([x, y, f], i) => `<circle class="blink" style="animation-delay:${(i * 0.37).toFixed(2)}s" cx="${x}" cy="${y}" r="4.5" fill="${f}"/>`).join("")}
      <path class="glanz" d="M56 3 L59.5 12 L69 12.5 L61.5 18.5 L64 28 L56 22.5 L48 28 L50.5 18.5 L43 12.5 L52.5 12 Z" fill="#E0A500"/></svg>`;
  },
  glaeser() {
    return `<svg class="bild-l" viewBox="0 0 160 110" role="img" aria-label="Zwei Sektgläser stoßen an">
      <g transform="rotate(-14 60 60)"><path d="M44 14 H76 L72 52 Q60 62 48 52 Z" fill="rgba(255,255,255,.18)" stroke="#E8D9B0" stroke-width="2"/>
        <path d="M46 30 H74 L72 52 Q60 62 48 52 Z" fill="#E8B931" opacity=".85"/><line x1="60" y1="58" x2="60" y2="92" stroke="#E8D9B0" stroke-width="2.5"/>
        <line x1="48" y1="94" x2="72" y2="94" stroke="#E8D9B0" stroke-width="2.5" stroke-linecap="round"/></g>
      <g transform="rotate(14 100 60)"><path d="M84 14 H116 L112 52 Q100 62 88 52 Z" fill="rgba(255,255,255,.18)" stroke="#E8D9B0" stroke-width="2"/>
        <path d="M86 30 H114 L112 52 Q100 62 88 52 Z" fill="#E8B931" opacity=".85"/><line x1="100" y1="58" x2="100" y2="92" stroke="#E8D9B0" stroke-width="2.5"/>
        <line x1="88" y1="94" x2="112" y2="94" stroke="#E8D9B0" stroke-width="2.5" stroke-linecap="round"/></g>
      ${[[80, 6], [70, 0], [91, 2]].map(([x, y], i) => `<circle class="blink" style="animation-delay:${i * .5}s" cx="${x}" cy="${y + 6}" r="2.2" fill="#FFF3C4"/>`).join("")}
      ${[[56, 40], [62, 46], [98, 38], [104, 45]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.6" fill="#FFF3C4" opacity=".9"/>`).join("")}</svg>`;
  },
  jahr(j) { return `<div class="bild-r jahreszahl" aria-label="${j}">${j}</div>`; },
  feuerwerk() {
    const farben = ["#E8B931", "#E63713", "#7FB2FF", "#FFFFFF", "#F2A7BC"];
    return `<div class="feuerwerk" aria-hidden="true">${[[12, 34, 0], [30, 22, 1.1], [48, 40, 0.5], [64, 20, 1.7], [82, 36, 0.9], [40, 66, 2.3]].map(([l, t, v], n) =>
      `<span class="fw" style="left:${l}%;top:${t}%;--fc:${farben[n % farben.length]};--fv:${v}s">${Array.from({ length: 12 }, (_, i) => `<i style="--r:${i * 30}deg"></i>`).join("")}</span>`).join("")}</div>`;
  },
  nest() {
    const ei = (x, y, r, f, m) => `<g transform="rotate(${r} ${x} ${y})"><ellipse cx="${x}" cy="${y}" rx="15" ry="20" fill="${f}"/>
      <path d="M${x - 14} ${y - 2} Q${x - 7} ${y - 8} ${x} ${y - 2} T${x + 14} ${y - 2}" stroke="${m}" stroke-width="3" fill="none"/>
      <circle cx="${x - 5}" cy="${y + 8}" r="2.4" fill="${m}"/><circle cx="${x + 5}" cy="${y + 9}" r="2.4" fill="${m}"/></g>`;
    return `<svg class="bild-l" viewBox="0 0 190 100" role="img" aria-label="Osternest mit bunten Eiern">
      ${ei(66, 50, -14, "#F2A7BC", "#FFFFFF")}${ei(98, 44, 4, "#E0A500", "#E63713")}${ei(128, 52, 16, "#7FB2FF", "#FFFFFF")}
      <path d="M30 62 Q95 100 160 62 L154 82 Q95 108 36 82 Z" fill="#B07A43"/>
      <path d="M36 66 Q95 98 154 66 M40 74 Q95 102 150 74" stroke="#8C5A2B" stroke-width="2" fill="none"/>
      ${[38, 50, 140, 152].map((x, i) => `<path d="M${x} 66 l${i % 2 ? 4 : -4} -12" stroke="#6FAE5C" stroke-width="2.5" stroke-linecap="round"/>`).join("")}</svg>`;
  },
  hase() {
    return `<svg class="bild-r" viewBox="0 0 100 120" role="img" aria-label="Osterhase">
      <g class="wippen"><ellipse cx="38" cy="26" rx="8" ry="24" fill="#C9A27E" transform="rotate(-12 38 26)"/><ellipse cx="38" cy="28" rx="4" ry="17" fill="#F2A7BC" transform="rotate(-12 38 28)"/>
      <ellipse cx="62" cy="26" rx="8" ry="24" fill="#C9A27E" transform="rotate(12 62 26)"/><ellipse cx="62" cy="28" rx="4" ry="17" fill="#F2A7BC" transform="rotate(12 62 28)"/></g>
      <ellipse cx="50" cy="94" rx="30" ry="24" fill="#C9A27E"/><ellipse cx="50" cy="100" rx="16" ry="14" fill="#F3E6D6"/><circle cx="50" cy="60" r="20" fill="#C9A27E"/><ellipse cx="50" cy="66" rx="10" ry="7" fill="#F3E6D6"/>
      <circle cx="43" cy="57" r="2.6" fill="#3C3C3B"/><circle cx="57" cy="57" r="2.6" fill="#3C3C3B"/><ellipse cx="50" cy="65" rx="3" ry="2.2" fill="#E63713"/>
      <circle cx="80" cy="100" r="7" fill="#FFFFFF"/></svg>`;
  },
  zweig() {
    const bl = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})">${[0, 72, 144, 216, 288].map((r) => `<ellipse cx="0" cy="-6" rx="4.5" ry="6.5" fill="#F7C6D3" transform="rotate(${r})"/>`).join("")}<circle r="2.6" fill="#E0A500"/></g>`;
    return `<svg class="bild-l" viewBox="0 0 200 90" role="img" aria-label="Blühender Zweig">
      <path d="M6 70 Q60 52 110 50 T196 26" stroke="#7A4A2A" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M70 55 Q80 38 96 34 M136 44 Q140 64 158 70" stroke="#7A4A2A" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      ${[[40, 60, 1], [96, 32, 1.2], [118, 48, .9], [158, 70, 1.1], [176, 32, 1.3], [66, 50, .8]].map(([x, y, s]) => bl(x, y, s)).join("")}
      ${[[84, 50], [146, 36]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="7" ry="3.5" fill="#6FAE5C" transform="rotate(-30 ${x} ${y})"/>`).join("")}</svg>`;
  },
  tulpen() {
    const t = (x, f, h) => `<path d="M${x} 118 Q${x - 2} ${118 - h / 2} ${x} ${118 - h}" stroke="#4C9A5A" stroke-width="3" fill="none"/>
      <path d="M${x} ${112 - h / 3} Q${x - 16} ${100 - h / 3} ${x - 12} ${88 - h / 3} Q${x - 4} ${100 - h / 3} ${x} ${112 - h / 3}" fill="#6FAE5C"/>
      <path d="M${x - 10} ${118 - h} Q${x - 11} ${104 - h} ${x - 5} ${100 - h} L${x} ${106 - h} L${x + 5} ${100 - h} Q${x + 11} ${104 - h} ${x + 10} ${118 - h} Q${x} ${126 - h} ${x - 10} ${118 - h} Z" fill="${f}"/>`;
    return `<svg class="bild-r" viewBox="0 0 100 124" role="img" aria-label="Tulpen">${t(28, "#E63713", 58)}${t(52, "#F2A7BC", 72)}${t(76, "#E0A500", 52)}</svg>`;
  },
  sonne() {
    return `<svg class="bild-l" viewBox="0 0 120 120" role="img" aria-label="Sonne"><g class="drehen">
      ${Array.from({ length: 12 }, (_, i) => `<path d="M60 6 L64 22 L56 22 Z" fill="#E8B931" transform="rotate(${i * 30} 60 60)"/>`).join("")}</g>
      <circle cx="60" cy="60" r="28" fill="#F5C33B"/><circle cx="60" cy="60" r="28" fill="url(#sg)"/>
      <defs><radialGradient id="sg" cx=".35" cy=".35"><stop offset="0" stop-color="#FFF3C4"/><stop offset="1" stop-color="#F5C33B" stop-opacity="0"/></radialGradient></defs></svg>`;
  },
  wellen() {
    return `<svg class="bild-r" viewBox="0 0 130 110" role="img" aria-label="Sonnenschirm am Wasser">
      <path d="M64 24 L64 92" stroke="#7A4A2A" stroke-width="3"/>
      <path d="M20 46 Q64 0 108 46 Q97 38 86 46 Q75 38 64 46 Q53 38 42 46 Q31 38 20 46 Z" fill="#E63713"/>
      <path d="M42 46 Q53 38 64 46 Q64 12 64 4 Q46 14 42 46 Z" fill="#FFFFFF" opacity=".85"/>
      <path class="welle" d="M0 94 Q16 86 32 94 T64 94 T96 94 T128 94 T160 94" stroke="#2456A6" stroke-width="4" fill="none"/>
      <path class="welle w2" d="M0 104 Q16 96 32 104 T64 104 T96 104 T128 104 T160 104" stroke="#29B6D8" stroke-width="4" fill="none"/></svg>`;
  },
  laub() {
    const b = (x, y, r, f) => `<path d="M0 -18 C10 -10 12 4 0 18 C-12 4 -10 -10 0 -18 Z M0 -16 L0 22" fill="${f}" stroke="#7A3A16" stroke-width="1" transform="translate(${x} ${y}) rotate(${r})"/>`;
    return `<svg class="bild-l" viewBox="0 0 180 90" role="img" aria-label="Herbstlaub">
      ${b(36, 52, -40, "#FFD27A")}${b(66, 40, 10, "#F5B335")}${b(96, 56, 50, "#FFE6A8")}${b(124, 38, -20, "#F08A4B")}${b(150, 58, 30, "#FFC15E")}
      <circle cx="80" cy="74" r="6" fill="#F3D3A6"/><path d="M80 68 q2 -6 6 -6" stroke="#F3D3A6" stroke-width="2" fill="none"/></svg>`;
  },
  herbstbaum() {
    const p = [[40, 40, "#F08A4B"], [62, 30, "#FFC15E"], [78, 46, "#E0662A"], [52, 56, "#F5B335"], [70, 62, "#F08A4B"], [32, 60, "#FFD27A"], [88, 64, "#F5B335"]];
    return `<svg class="bild-r" viewBox="0 0 120 130" role="img" aria-label="Baum im Herbst">
      <path d="M56 124 L58 70 M58 86 L42 70 M58 80 L76 64" stroke="#5B2C10" stroke-width="7" stroke-linecap="round" fill="none"/>
      ${p.map(([x, y, f]) => `<circle cx="${x}" cy="${y}" r="17" fill="${f}" opacity=".92"/>`).join("")}
      ${[[22, 112], [90, 116], [100, 106]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="6" ry="3" fill="#C8561E"/>`).join("")}</svg>`;
  },
  flocke() {
    const arm = (r) => `<g transform="rotate(${r} 60 60)"><line x1="60" y1="60" x2="60" y2="12" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round"/>
      <path d="M50 26 L60 36 L70 26 M52 44 L60 50 L68 44" stroke="#FFFFFF" stroke-width="3" fill="none" stroke-linecap="round"/></g>`;
    return `<svg class="bild-l" viewBox="0 0 120 120" role="img" aria-label="Schneeflocke"><g class="drehen langsam">${[0, 60, 120, 180, 240, 300].map(arm).join("")}</g></svg>`;
  },
  schneemann() {
    return `<svg class="bild-r" viewBox="0 0 100 130" role="img" aria-label="Schneemann">
      <circle cx="50" cy="98" r="28" fill="#FFFFFF"/><circle cx="50" cy="54" r="20" fill="#FFFFFF"/>
      <rect x="34" y="18" width="32" height="20" rx="2" fill="#3C3C3B"/><rect x="28" y="36" width="44" height="5" rx="2" fill="#3C3C3B"/>
      <circle cx="43" cy="50" r="2.4" fill="#3C3C3B"/><circle cx="57" cy="50" r="2.4" fill="#3C3C3B"/><path d="M50 56 L64 59 L50 61 Z" fill="#E63713"/>
      <path d="M32 70 Q50 78 68 70 L68 76 Q50 84 32 76 Z" fill="#E63713"/><path d="M60 74 L66 92 L58 92 Z" fill="#E63713"/>
      ${[86, 98, 110].map((y) => `<circle cx="50" cy="${y}" r="2.6" fill="#3C3C3B"/>`).join("")}</svg>`;
  },
};

/* Kleiner Schmuck neben der Begrüßung und am Logo */
const SCHMUCK = {
  stern: ["✦", "✧", "✦", "✧", "✦"],
  bluete: ["✿", "❀", "✿", "❀", "✿"],
  sonne: ["☀", "✦", "☀"],
  blatt: ["❦", "✦", "❦", "✦", "❦"],
  flocke: ["❄", "❅", "❄", "❅", "❄"],
};
const MOTTO_SCHMUCK = { weihnachten: "stern", silvester: "stern", neujahr: "stern", winter: "flocke", ostern: "bluete", fruehling: "bluete", sommer: "sonne", herbst: "blatt" };
const LOGO_ZEICHEN = { weihnachten: "✦", silvester: "✨", neujahr: "✨", winter: "❄", ostern: "✿", fruehling: "✿", sommer: "☀", herbst: "❦" };

function mottoKarte(w) {
  let links = "", rechts = "", extra = "";
  if (w.name === "weihnachten") {
    links = BILD.kranz(w.kerzen); rechts = BILD.baum();
    extra = '<div class="haenger" aria-hidden="true"><span><b>★</b></span><span><b>✦</b></span><span><b>★</b></span><span><b>✦</b></span></div>';
  } else if (w.name === "silvester" || w.name === "neujahr") { links = BILD.glaeser(); rechts = BILD.jahr(w.jahr); extra = BILD.feuerwerk(); }
  else if (w.name === "ostern") { links = BILD.nest(); rechts = BILD.hase(); }
  else if (w.name === "fruehling") { links = BILD.zweig(); rechts = BILD.tulpen(); }
  else if (w.name === "sommer") { links = BILD.sonne(); rechts = BILD.wellen(); }
  else if (w.name === "herbst") { links = BILD.laub(); rechts = BILD.herbstbaum(); }
  else if (w.name === "winter") { links = BILD.flocke(); rechts = BILD.schneemann(); }
  const knopf = w.effekt ? `<button class="knopf klein" id="effektK" title="Bewegte Effekte nur bei dir an- oder ausschalten">${EFFEKT_WORT[w.effekt]} ${effekteErlaubt() ? "aus" : "an"}</button>` : "";
  return `<div class="karte motto-karte" data-motto="${w.name}">${extra}
    ${links}
    <div class="wk-text"><div class="kicker">${esc(w.kicker)}</div><b>${esc(w.titel)}</b><span>${esc(w.text)}</span></div>
    <div class="wk-rechts">${rechts}${knopf}</div>
  </div>`;
}

function mottoAnwenden() {
  const w = mottoHeute();
  document.documentElement.dataset.motto = w ? w.name : "";
  effektZeichnen(w && w.effekt && effekteErlaubt() ? w.effekt : null);
  const logo = document.querySelector(".seite .logo");
  if (logo) {
    const alt = logo.querySelector(".logo-stern");
    if (alt) alt.remove();
    if (w) logo.insertAdjacentHTML("beforeend", `<span class="logo-stern" data-motto="${w.name}" title="${esc(MOTTO_NAMEN[w.name])}" aria-hidden="true">${LOGO_ZEICHEN[w.name]}</span>`);
  }
  return w;
}

/* ---------- Übersicht ---------- */
(() => {
  const alt = SEITEN.start;
  SEITEN.start = async (el) => {
    await alt(el);
    try { await einstellungenLaden(); } catch (e) { /* Standard */ }
    const w = mottoAnwenden();
    if (!w) return;
    const kopf = el.querySelector(".titelzeile");
    if (!kopf) return;
    kopf.insertAdjacentHTML("afterend", mottoKarte(w));
    const h1 = kopf.querySelector("h1");
    if (h1 && !h1.querySelector(".gruss-sterne"))
      h1.insertAdjacentHTML("beforeend", ` <span class="gruss-sterne" data-motto="${w.name}" aria-hidden="true">${SCHMUCK[MOTTO_SCHMUCK[w.name]].map((z) => `<i>${z}</i>`).join("")}</span>`);
    const k = el.querySelector("#effektK");
    if (k) k.onclick = () => {
      const an = !effekteErlaubt();
      effekteSetzen(an);
      effektZeichnen(an ? w.effekt : null);
      k.textContent = `${EFFEKT_WORT[w.effekt]} ${an ? "aus" : "an"}`;
    };
  };
})();

/* ---------- Einstellungen ---------- */
(() => {
  const alt = SEITEN.einstellungen;
  SEITEN.einstellungen = async (el) => {
    await alt(el);
    await einstellungenLaden(true);
    const modus = mottoModus();
    const opt = (v, t) => `<option value="${v}" ${modus === v ? "selected" : ""}>${t}</option>`;
    const box = document.createElement("div");
    box.innerHTML = `<div class="abstand"></div><div class="karte" id="wnEinst"><h3>Jahresmotto</h3>
      <form class="formular" style="grid-template-columns:1fr" onsubmit="return false">
        ${darf("einstellungen") ? `<label>Für alle<select name="motto">
          ${opt("auto", "Automatisch nach Jahreszeit und Festtagen")}${opt("aus", "Aus")}
          <optgroup label="Immer dieses Motto">${Object.entries(MOTTO_NAMEN).map(([k, t]) => opt(k, t)).join("")}</optgroup></select></label>` : ""}
        <label class="wn-haken"><input type="checkbox" name="effekte" ${effekteErlaubt() ? "checked" : ""}> Bewegte Effekte bei mir anzeigen (Schnee, Blüten, Blätter, Konfetti)</label>
        <p class="klein">Automatisch heißt: Weihnachten vom 1. bis 26. Dezember, Silvester bis 31. Dezember, Neujahr bis 6. Januar, danach Winter.
        Ostern zwei Wochen vor Ostern bis Ostermontag. Frühling ab 20. März, Sommer ab 21. Juni, Herbst ab 23. September.
        Zum Motto gehören ein Gruß auf der Übersicht, ein Zeichen am Logo und leichte Effekte. Die Effekte gelten nur für dieses Gerät.</p>
        ${darf("einstellungen") ? '<div><button class="knopf haupt-k" id="wnSpeichern">Speichern</button></div>' : ""}
      </form></div>`;
    el.appendChild(box);
    const f = box.querySelector("form");
    f.effekte.onchange = () => { effekteSetzen(f.effekte.checked); mottoAnwenden(); };
    const sp = box.querySelector("#wnSpeichern");
    if (sp) sp.onclick = async () => {
      try { await api("PUT", "einstellungen", { motto: f.motto.value }); await einstellungenLaden(true); mottoAnwenden(); melde("Gespeichert."); }
      catch (err) { melde(err.message, true); }
    };
  };
})();

(() => {
  const altRahmen = rahmen;
  rahmen = function () { altRahmen.apply(this, arguments); einstellungenLaden().then(mottoAnwenden).catch(() => mottoAnwenden()); };
})();
