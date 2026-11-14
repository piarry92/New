/* Casa CAFM – Planzeichen
   Sicherheitszeichen nach dem Vorbild von DIN EN ISO 7010 (F = Brandschutz, E = Rettung)
   und Kürzel, wie sie in Feuerwehrplänen üblich sind. Eigene Nachzeichnung, keine Originalvorlage der Norm. */
"use strict";

const ROT = "#E30613", GRUEN = "#009A44";
const FLAMME = '<path d="M13 0C15 7 22 11 22 21C22 28 18 33 12 34C6 33 2 28 3 21C4 16 7 13 9 9C10 13 11 15 13 16C14 11 12 6 13 0Z"/>';
const flamme = (x = 68, y = 8, s = 0.85) => `<g transform="translate(${x} ${y}) scale(${s})" fill="#fff">${FLAMME}</g>`;
const HOERER = '<path d="M27 26C21 31 21 43 28 55C37 70 50 80 63 84C71 86 78 84 80 79L82 72L69 61L60 67C52 63 44 55 40 47L46 39L35 25Z"/>';
const KREUZ = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})" fill="#fff"><rect x="7" y="0" width="8" height="22"/><rect x="0" y="7" width="22" height="8"/></g>`;
const MANN = `<g fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">
  <path d="M41 32L33 56"/><path d="M40 35L51 43L60 37"/><path d="M38 35L28 43L19 41"/>
  <path d="M33 56L45 66L43 84"/><path d="M33 56L23 70L10 72"/></g><circle cx="45" cy="19" r="7.5" fill="#fff"/>
  <rect x="64" y="12" width="26" height="78" fill="none" stroke="#fff" stroke-width="5"/>`;

const ZEICHEN = {
  F001: { name: "Feuerlöscher", farbe: ROT, svg: `<g fill="#fff"><rect x="24" y="38" width="28" height="52" rx="8"/><rect x="32" y="29" width="12" height="10"/><path d="M28 30L49 23L51 28L36 33Z"/></g>
    <path d="M44 32C60 33 63 50 59 70" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/><rect x="55" y="68" width="8" height="14" rx="2" fill="#fff" transform="rotate(10 59 75)"/>${flamme()}` },
  F002: { name: "Löschschlauch (Wandhydrant)", farbe: ROT, svg: `<g fill="none" stroke="#fff" stroke-width="6"><circle cx="40" cy="58" r="27"/><circle cx="40" cy="58" r="15"/></g><circle cx="40" cy="58" r="5" fill="#fff"/>
    <path d="M62 74L80 88" stroke="#fff" stroke-width="7" stroke-linecap="round"/><path d="M78 83L90 93L85 97L74 88Z" fill="#fff"/>${flamme()}` },
  F003: { name: "Feuerleiter", farbe: ROT, svg: `<g stroke="#fff" stroke-width="6" stroke-linecap="square"><path d="M30 18V92M56 18V92"/><path d="M30 30H56M30 46H56M30 62H56M30 78H56"/></g>${flamme(68, 10)}` },
  F005: { name: "Brandmelder (Handfeuermelder)", farbe: ROT, svg: `<rect x="16" y="38" width="44" height="44" fill="none" stroke="#fff" stroke-width="6"/><circle cx="38" cy="60" r="9" fill="#fff"/>
    <path d="M46 64L60 58L88 84L78 94Z" fill="#fff"/><g stroke="#fff" stroke-width="4" stroke-linecap="round"><path d="M12 28L20 34M26 20L30 30M40 18V28"/></g>${flamme()}` },
  F006: { name: "Brandmeldetelefon", farbe: ROT, svg: `<g transform="translate(-6 6) scale(.92)" fill="#fff">${HOERER}</g>${flamme()}` },
  E001: { name: "Notausgang links", farbe: GRUEN, svg: `<g transform="translate(100 0) scale(-1 1)">${MANN}</g>` },
  E002: { name: "Notausgang rechts", farbe: GRUEN, svg: MANN },
  E003: { name: "Erste Hilfe", farbe: GRUEN, svg: '<g fill="#fff"><rect x="38" y="16" width="24" height="68"/><rect x="16" y="38" width="68" height="24"/></g>' },
  E004: { name: "Notruftelefon", farbe: GRUEN, svg: `<g transform="translate(-4 8) scale(.9)" fill="#fff">${HOERER}</g>${KREUZ(66, 10, 1)}` },
  E007: { name: "Sammelstelle", farbe: GRUEN, svg: `<g fill="#fff">
    ${[0, 90, 180, 270].map((w) => `<path transform="rotate(${w} 50 50)" d="M8 13L13 8L26 21L32 17L34 34L17 32L21 26Z"/>`).join("")}
    <circle cx="42" cy="42" r="4.5"/><circle cx="58" cy="42" r="4.5"/><circle cx="50" cy="47" r="4.5"/>
    <path d="M37 48h10v12h-10zM53 48h10v12h-10zM45 53h10v13h-10z"/></g>` },
  E010: { name: "Defibrillator (AED)", farbe: GRUEN, svg: `<path d="M46 88C18 68 12 54 12 42C12 30 21 22 31 22C39 22 43 27 46 33C49 27 53 22 61 22C71 22 80 30 80 42C80 54 74 68 46 88Z" fill="#fff"/>
    <path d="M50 32L36 56H46L40 76L60 48H50L56 32Z" fill="${GRUEN}"/>${KREUZ(72, 6, .9)}` },
  E011: { name: "Augenspüleinrichtung", farbe: GRUEN, svg: `<path d="M10 64C26 44 74 44 90 64C74 84 26 84 10 64Z" fill="#fff"/><circle cx="50" cy="64" r="11" fill="${GRUEN}"/><circle cx="50" cy="64" r="5" fill="#fff"/>
    <g fill="#fff"><path d="M30 14C34 22 36 26 36 30A6 6 0 0 1 24 30C24 26 26 22 30 14Z"/><path d="M50 8C54 16 56 20 56 24A6 6 0 0 1 44 24C44 20 46 16 50 8Z"/><path d="M70 14C74 22 76 26 76 30A6 6 0 0 1 64 30C64 26 66 22 70 14Z"/></g>` },
};
const KUERZEL = { BMZ: "Brandmeldezentrale", FBF: "Feuerwehr-Bedienfeld", FSD: "Feuerwehr-Schlüsseldepot", RWA: "Rauchabzug (RWA)", FAT: "Feuerwehr-Anzeigetableau" };

/* Code aus dem gespeicherten Wert ("F001 Feuerlöscher" → "F001") */
const zeichenCode = (wert) => (wert ? String(wert).split(" ")[0] : "");

function zeichenSvg(code, groesse = 26) {
  const z = ZEICHEN[code];
  if (z) return `<svg class="zeichen-svg" width="${groesse}" height="${groesse}" viewBox="0 0 100 100" role="img" aria-label="${z.name}"><title>${code} ${z.name}</title><rect width="100" height="100" rx="6" fill="${z.farbe}"/>${z.svg}</svg>`;
  if (KUERZEL[code]) return `<svg class="zeichen-svg" width="${groesse}" height="${groesse}" viewBox="0 0 100 100" role="img" aria-label="${KUERZEL[code]}"><title>${KUERZEL[code]}</title><rect x="4" y="4" width="92" height="92" rx="4" fill="#fff" stroke="${ROT}" stroke-width="8"/><text x="50" y="62" text-anchor="middle" font-family="Calibri, Carlito, Arial, sans-serif" font-weight="700" font-size="${code.length > 3 ? 26 : 32}" fill="${ROT}">${code}</text></svg>`;
  return "";
}
