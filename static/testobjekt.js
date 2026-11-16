/* Casa CAFM – Testobjekt: ein zusätzliches Objekt mit erfundenen Daten zum Ausprobieren (Karte in den Einstellungen) */
"use strict";

/* Nach dem Anlegen oder Entfernen: Objektliste oben links und alle Zwischenspeicher neu laden, Seite neu zeichnen
   und wieder zur Karte rollen (der Rahmen wird dabei neu aufgebaut) */
async function testobjektNeuLaden(entfernt) {
  try {      // Die Objektwahl oben links bleibt, wie sie war. Nur wenn das gewählte Objekt gerade entfernt wurde, gilt wieder „Alle Objekte“.
    if (entfernt && Number(S.objekt) === Number(entfernt)) localStorage.setItem(OW_KEY, "alle");
    else if (S.objekt) localStorage.setItem(OW_KEY, String(S.objekt));
  } catch (e) { /* ohne Speicher */ }
  await owLaden();
  cacheLeeren();
  rahmen();
  await route();
  const karte = document.getElementById("toKarte");
  if (karte) karte.scrollIntoView({ block: "center" });
}

async function testobjektKarte(karte) {
  let st;
  try { st = await api("GET", "einstellungen/testobjekt"); }
  catch (e) { karte.innerHTML = `<h3>Testobjekt</h3><p class="klein">${esc(e.message)}</p>`; return; }
  const kopf = '<h3>Testobjekt</h3>';
  if (!st.vorhanden) {
    karte.innerHTML = `${kopf}
      <p>Ein zusätzliches Objekt, in dem jeder Bereich des Programms gefüllt ist. Damit kannst du alles ausprobieren und einen Objektbericht ziehen, ohne echte Daten anzufassen.</p>
      <ul class="to-liste">
        <li>Zwei Gebäude und Außenanlagen mit zehn Grundrissen, rund 125 Anlagen mit Symbolen im Plan</li>
        <li>Wartungen und Prüfungen mit zwei Jahren Verlauf: Überfälliges, bald Fälliges, Erledigtes</li>
        <li>Mängel und Störungen, SV-Prüfungen mit Berichten und SV-Mängeln</li>
        <li>Rundgänge mit Checkpoints, Checklisten, Zähler mit Ablesungen, Verträge</li>
        <li>Schlüssel mit Übergabeprotokollen, Winterdienst, Vorgänge, Dokumente und Fotos</li>
      </ul>
      <p class="klein">Alle Angaben sind erfunden. Deine echten Objekte bleiben unverändert. Es werden keine E-Mails verschickt. Das Testobjekt lässt sich hier jederzeit wieder entfernen.</p>
      <div class="qr-knoepfe"><button class="knopf haupt-k" id="toAnlegen">${icon("plus")} Testobjekt anlegen</button></div>`;
    const knopf = karte.querySelector("#toAnlegen");
    knopf.onclick = async () => {
      knopf.disabled = true;
      try {
        const neu = await api("POST", "einstellungen/testobjekt", {});
        melde(`Testobjekt ${neu.kuerzel} ist angelegt.`);
        await testobjektNeuLaden();
      } catch (err) { melde(err.message, true); knopf.disabled = false; }
    };
    return;
  }
  const am = st.angelegt ? new Date(st.angelegt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";
  karte.innerHTML = `${kopf}
    <p><b>${esc(st.kuerzel)} · ${esc(st.name)}</b> ist angelegt${am ? ` (am ${am}${st.von ? ` von ${esc(st.von)}` : ""})` : ""}. Alle Angaben darin sind erfunden.</p>
    <div class="to-zahlen">${st.zahlen.filter((z) => z.anzahl).map((z) => `<span><b>${z.anzahl}</b> ${esc(z.name)}</span>`).join("")}</div>
    <p class="klein">Solange das Testobjekt da ist, zählt es in der Gesamtübersicht „Alle Objekte“ mit. Wähle oben links ein einzelnes Objekt, dann siehst du nur dessen Zahlen.</p>
    <div class="qr-knoepfe">
      <button class="knopf haupt-k" id="toHin">Zum Testobjekt</button>
      <button class="knopf" id="toPlaene">Gebäude und Pläne</button>
      <button class="knopf" id="toBericht">Objektbericht erstellen</button>
      <button class="knopf gefahr" id="toWeg">Testobjekt entfernen</button>
    </div>`;
  const hin = (ziel) => () => {      // erst das Testobjekt oben links wählen: Danach zeigen alle Bereiche nur noch das Testobjekt
    if (Number(S.objekt) !== Number(st.objekt_id)) { owSetzen(st.objekt_id, false); rahmen(); }
    location.hash = ziel;
  };
  karte.querySelector("#toHin").onclick = hin(`#/objekte/${st.objekt_id}`);
  karte.querySelector("#toPlaene").onclick = hin(`#/plaene?o=${st.objekt_id}`);
  karte.querySelector("#toBericht").onclick = async () => {
    try { berichtDialog(await api("GET", `objekte/${st.objekt_id}`)); } catch (err) { melde(err.message, true); }
  };
  karte.querySelector("#toWeg").onclick = async () => {
    const teile = st.zahlen.filter((z) => z.anzahl).map((z) => `${z.anzahl} ${z.name}`).join(", ");
    const ja = await dialog("Testobjekt entfernen", `<div class="dfehler"></div>
      <p><b>${esc(st.kuerzel)} · ${esc(st.name)}</b> wird mit allem entfernt, was dazugehört: ${esc(teile)}.</p>
      <p>Das gilt auch für alles, was du dort selbst eingetragen oder hochgeladen hast. Deine anderen Objekte bleiben unverändert.</p>
      <p class="klein">Vorher legt das Programm eine Sicherung der Datenbank an (Ordner daten › sicherung).</p>`,
      [{ text: "Abbrechen" }, { text: "Testobjekt entfernen", klasse: "haupt-k", aktion: async () => api("DELETE", "einstellungen/testobjekt") }]);
    if (!ja) return;
    melde(ja.firmen_bleiben && ja.firmen_bleiben.length
      ? `Testobjekt entfernt. ${ja.firmen_bleiben.length} Testfirmen bleiben, weil sie in anderen Einträgen stehen.` : "Testobjekt entfernt.");
    await testobjektNeuLaden(st.objekt_id);
  };
}

/* Einstellungen: Karte am Ende der Seite, nur für Administratoren */
const einstellungenVorTestobjekt = SEITEN.einstellungen;
SEITEN.einstellungen = async (el, ...rest) => {
  await einstellungenVorTestobjekt(el, ...rest);
  if (!S.ich || S.ich.rolle !== "admin") return;
  const box = document.createElement("div");
  box.innerHTML = '<div class="abstand"></div><div class="karte" id="toKarte"></div>';
  el.appendChild(box);
  await testobjektKarte(box.querySelector("#toKarte"));
};
