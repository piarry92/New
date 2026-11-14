/* Casa CAFM – Benachrichtigungen (Glocke) und „Meine Aufgaben“ */
"use strict";

const GLOCKE = '<svg class="icon" viewBox="0 0 24 24"><path d="M18 16v-5a6 6 0 0 0-12 0v5l-2 2h16z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>';
const B_ICON = { zuweisung: "👤", bald: "⏰", ueber: "⚠️", info: "ℹ️", pruefung: "🛡️", bestaetigt: "✅", rueckfrage: "❓" };
let bBekannt = null, bTakt = null;

function glockeEinbauen() {
  const rechts = document.querySelector(".kopf-rechts");
  if (!rechts || document.getElementById("glocke")) return;
  rechts.insertAdjacentHTML("afterbegin", `<div class="glocke-wrap"><button class="kopf-knopf glocke" id="glocke" title="Benachrichtigungen" aria-label="Benachrichtigungen">${GLOCKE}<span class="glocke-zahl" id="glockeZahl" hidden></span></button>
    <div class="glocke-panel" id="glockePanel" hidden></div></div>`);
  const knopf = document.getElementById("glocke"), panel = document.getElementById("glockePanel");
  knopf.onclick = (e) => { e.stopPropagation(); panel.hidden = !panel.hidden; if (!panel.hidden) benachrichtigungenLaden(); };
  document.addEventListener("click", (e) => { if (!e.target.closest(".glocke-wrap")) panel.hidden = true; });
  panel.addEventListener("click", async (e) => {
    const alle = e.target.closest("[data-b-alle]"), erlauben = e.target.closest("[data-b-erlauben]"), item = e.target.closest("[data-b]");
    if (alle) { await api("POST", "benachrichtigungen/gelesen", { alle: true }); benachrichtigungenLaden(); return; }
    if (erlauben) { try { await pushEinschalten(); melde("Push-Benachrichtigungen sind auf diesem Gerät an."); } catch (err) { melde(err.message, true); } benachrichtigungenLaden(); return; }
    if (item) {
      await api("POST", "benachrichtigungen/gelesen", { ids: [Number(item.dataset.b)] });
      panel.hidden = true;
      if (item.dataset.link) location.hash = item.dataset.link;
      benachrichtigungenLaden();
    }
  });
  clearInterval(bTakt);
  bTakt = setInterval(() => { if (!document.hidden && S.ich) benachrichtigungenLaden(); }, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && S.ich) benachrichtigungenLaden(); });
  benachrichtigungenLaden();
}

const vorZeit = (iso) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} Min.`;
  if (min < 1440) return `vor ${Math.round(min / 60)} Std.`;
  return datum(iso);
};

async function benachrichtigungenLaden() {
  let d;
  try { d = await api("GET", "benachrichtigungen"); } catch (e) { return; }
  const zahl_ = document.getElementById("glockeZahl"), panel = document.getElementById("glockePanel");
  if (!zahl_ || !panel) return;
  zahl_.textContent = d.ungelesen > 9 ? "9+" : d.ungelesen;
  zahl_.hidden = !d.ungelesen;
  const pStatus = await pushStatus();
  const kannGeraet = pStatus === "aus";
  panel.innerHTML = `<div class="gp-kopf"><b>Benachrichtigungen</b>${d.ungelesen ? '<button class="knopf klein" data-b-alle>Alle gelesen</button>' : ""}</div>
    <div class="gp-liste">${d.liste.length ? d.liste.map((b) => `<button class="gp-item ${b.gelesen ? "" : "neu"} gp-${esc(b.art || "info")}" data-b="${b.id}" data-link="${esc(b.link || "")}">
      <span class="gp-icon">${B_ICON[b.art] || B_ICON.info}</span><span class="gp-text"><b>${esc(b.titel)}</b><span>${esc(b.text || "")}</span><span class="gp-zeit">${vorZeit(b.zeit)}</span></span></button>`).join("")
      : '<p class="klein gp-leer">Keine Benachrichtigungen. Sobald dir ein Rundgang oder eine Checkliste zugewiesen wird oder etwas ansteht, erscheint es hier.</p>'}</div>
    ${kannGeraet ? '<button class="gp-fuss" data-b-erlauben>📱 Push-Benachrichtigungen auf diesem Gerät einschalten</button>' : ""}`;
  // Neue ungelesene Einträge melden
  const ungelesen = d.liste.filter((b) => !b.gelesen);
  if (bBekannt) {
    const neu = ungelesen.filter((b) => !bBekannt.has(b.id));
    neu.slice(0, 3).forEach((b) => {
      melde(b.titel);
      if ("Notification" in window && Notification.permission === "granted") {
        try {
          const n = new Notification(b.titel, { body: b.text || "", icon: "/favicon.png", tag: `cafm-${b.id}` });
          n.onclick = () => { window.focus(); if (b.link) location.hash = b.link; n.close(); };
        } catch (e) { /* manche Geräte erlauben das nur im Hintergrunddienst */ }
      }
    });
  }
  bBekannt = new Set(ungelesen.map((b) => b.id));
  try {
    const p = await api("GET", "pruefungen?status=offen");
    const z = document.querySelector('[data-zahl="pruefungen"]');
    if (z) { z.textContent = p.offen_fuer_mich; z.hidden = !p.offen_fuer_mich; }
  } catch (e) { /* egal */ }
}

/* Übersicht: eigene Rundgänge und Checklisten oben anzeigen */
const startAlt = SEITEN.start;
SEITEN.start = async (el, ...rest) => {
  await startAlt(el, ...rest);
  let meine = [];
  try { meine = (await api("GET", `checklisten?zustaendig_id=${S.ich.id}`)).filter((c) => c.aktiv); } catch (e) { return; }
  if (!meine.length) return;
  meine.sort((a, b) => String(a.naechste_zeit || "9999").localeCompare(String(b.naechste_zeit || "9999")));
  const karte = document.createElement("div");
  karte.className = "karte meine-aufgaben";
  karte.innerHTML = `<div class="ma-kopf"><h3>Meine Rundgänge &amp; Checklisten</h3><a class="klein" href="#/checklisten?meine=1">Alle anzeigen</a></div>
    <div class="ma-liste">${meine.slice(0, 6).map((c) => {
      const t = c.naechste_zeit ? Math.round((new Date(c.naechste_zeit) - Date.now()) / 3600000) : null;
      const wann = !c.naechste_zeit ? "bei Bedarf" : t < 0 ? `überfällig seit ${datum(c.naechste_zeit)}` : t < 24 ? `heute um ${c.naechste_zeit.slice(11, 16)} Uhr` : `fällig ${datum(c.naechste_zeit)} um ${c.naechste_zeit.slice(11, 16)}`;
      const klasse = !c.naechste_zeit ? "m-geplant" : t < 0 ? "m-ueber" : c.erinnerung_ab && new Date(c.erinnerung_ab) <= new Date() ? "m-bald" : "m-geplant";
      return `<div class="ma-item"><span class="cl-art ${c.art === "Rundgang" ? "rg" : ""}">${c.art === "Rundgang" ? "Rundgang" : "Checkliste"}</span>
        <a href="#/checklisten/${c.id}"><b>${esc(c.titel)}</b><br><span class="klein">${esc(refText("objekte", c.objekt_id))}</span></a>
        <span class="marke ${klasse}">${wann}</span>${darf("wartung_erledigen") ? `<a class="knopf haupt-k klein" href="#/checklisten/${c.id}?durchfuehren=1">Durchführen</a>` : ""}</div>`;
    }).join("")}</div>`;
  const titel = el.querySelector(".titelzeile");
  if (titel) titel.after(karte);
};


/* ======================= App und Push ======================= */
let installHinweis = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installHinweis = e; });
async function swRegistrierung() {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return null;
  try { return await navigator.serviceWorker.register("/sw.js", { scope: "/" }); } catch (e) { return null; }
}
window.addEventListener("load", () => { swRegistrierung(); });
const istIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const alsAppGeoeffnet = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

async function pushStatus() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !window.isSecureContext || !("Notification" in window)) return "nicht_moeglich";
  if (Notification.permission === "denied") return "blockiert";
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const abo = reg && await reg.pushManager.getSubscription();
    return abo ? "an" : "aus";
  } catch (e) { return "aus"; }
}
function schluesselBytes(b64) {
  const roh = atob((b64 + "=".repeat((4 - b64.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(roh, (c) => c.charCodeAt(0));
}
async function pushEinschalten() {
  if (!window.isSecureContext) throw new Error("Push geht nur, wenn das Programm über https erreichbar ist (oder direkt am Rechner unter localhost).");
  if (!("PushManager" in window)) throw new Error(istIOS() && !alsAppGeoeffnet() ? "Auf dem iPhone erst die App installieren: Teilen › Zum Home-Bildschirm. Dann in der App einschalten." : "Dieser Browser unterstützt keine Push-Benachrichtigungen.");
  const erlaubt = await Notification.requestPermission();
  if (erlaubt !== "granted") throw new Error("Benachrichtigungen sind für diese Seite nicht erlaubt. Das lässt sich in den Browser-Einstellungen ändern.");
  const reg = (await navigator.serviceWorker.getRegistration("/")) || (await swRegistrierung());
  if (!reg) throw new Error("Der Hintergrunddienst ließ sich nicht starten.");
  await navigator.serviceWorker.ready;
  const { schluessel } = await api("GET", "push/schluessel");
  let abo = await reg.pushManager.getSubscription();
  if (!abo) abo = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: schluesselBytes(schluessel) });
  const geraet = /android/i.test(navigator.userAgent) ? "Android" : istIOS() ? "iPhone/iPad" : /windows/i.test(navigator.userAgent) ? "Windows" : /mac/i.test(navigator.userAgent) ? "Mac" : "Gerät";
  await api("POST", "push/abo", { endpoint: abo.endpoint, geraet });
}
async function pushAusschalten() {
  const reg = await navigator.serviceWorker.getRegistration("/");
  const abo = reg && await reg.pushManager.getSubscription();
  if (abo) { try { await api("DELETE", "push/abo", { endpoint: abo.endpoint }); } catch (e) { /* egal */ } await abo.unsubscribe(); }
}

/* Einstellungen: Benachrichtigungen, App und Mailserver */
const einstellungenAlt = SEITEN.einstellungen;
SEITEN.einstellungen = async (el, ...rest) => {
  await einstellungenAlt(el, ...rest);
  const box = document.createElement("div");
  box.innerHTML = `<div class="abstand"></div><div class="raster k2">
    <div class="karte" id="bnEinst"></div>${darf("einstellungen") ? '<div class="karte" id="mailEinst"></div>' : ""}</div>`;
  el.querySelector(".raster.k2").after(box);
  await benachrichtigungsKarte(el.querySelector("#bnEinst"));
  if (darf("einstellungen")) await mailserverKarte(el.querySelector("#mailEinst"));
};

async function benachrichtigungsKarte(k) {
  const ein = await einstellungenLaden(true);
  const ps = await pushStatus();
  const pushText = { an: '<span class="marke m-ok">an</span>', aus: '<span class="marke m-geplant">aus</span>', blockiert: '<span class="marke m-ueber">im Browser blockiert</span>', nicht_moeglich: '<span class="marke m-arbeit">hier nicht möglich</span>' }[ps];
  k.innerHTML = `<h3>Benachrichtigungen &amp; App</h3>
    <label class="schalter-zeile ohne-rand"><span><b>Per E-Mail benachrichtigen</b><br><span class="klein">an ${esc(S.ich.email)}${ein.mail_aktiv === "1" ? "" : " · der Mailversand ist noch nicht eingerichtet"}</span></span><input type="checkbox" class="schalter" id="bnMail" ${S.ich.mail_an ? "checked" : ""}></label>
    <div class="bn-zeile"><span><b>Push auf diesem Gerät</b> ${pushText}<br><span class="klein">${ps === "nicht_moeglich" ? (window.isSecureContext ? (istIOS() ? "Auf dem iPhone: erst die App zum Home-Bildschirm hinzufügen, dann dort einschalten." : "Dieser Browser unterstützt kein Push.") : "Geht nur über https oder direkt am Rechner (localhost).") : "Hinweise kommen auch, wenn die App geschlossen ist."}</span></span>
      ${ps === "aus" ? '<button class="knopf haupt-k klein" id="bnPushAn">Einschalten</button>' : ps === "an" ? '<button class="knopf klein" id="bnPushTest">Test</button><button class="knopf klein" id="bnPushAus">Ausschalten</button>' : ""}</div>
    <div class="bn-zeile"><span><b>Als App installieren</b><br><span class="klein">${alsAppGeoeffnet() ? "Läuft bereits als App." : istIOS() ? "iPhone/iPad: in Safari auf Teilen tippen, dann „Zum Home-Bildschirm“." : "Mit eigenem Symbol auf Handy oder Rechner, ohne Browserleiste."}</span></span>
      ${!alsAppGeoeffnet() && installHinweis ? '<button class="knopf haupt-k klein" id="bnInstall">Installieren</button>' : ""}</div>`;
  k.querySelector("#bnMail").onchange = async (e) => {
    try { await api("PUT", "ich", { mail_an: e.target.checked ? 1 : 0 }); S.ich.mail_an = e.target.checked ? 1 : 0; melde(e.target.checked ? "E-Mail-Benachrichtigungen an." : "E-Mail-Benachrichtigungen aus."); }
    catch (err) { melde(err.message, true); }
  };
  const an = k.querySelector("#bnPushAn"), aus = k.querySelector("#bnPushAus"), test = k.querySelector("#bnPushTest"), inst = k.querySelector("#bnInstall");
  if (an) an.onclick = async () => { try { await pushEinschalten(); melde("Push ist an."); } catch (err) { melde(err.message, true); } benachrichtigungsKarte(k); };
  if (aus) aus.onclick = async () => { await pushAusschalten(); melde("Push ist aus."); benachrichtigungsKarte(k); };
  if (test) test.onclick = async () => { await api("POST", "push/test"); melde("Testhinweis kommt in wenigen Sekunden."); };
  if (inst) inst.onclick = async () => { installHinweis.prompt(); await installHinweis.userChoice; installHinweis = null; benachrichtigungsKarte(k); };
}

async function mailserverKarte(k) {
  const e = await api("GET", "einstellungen");
  k.innerHTML = `<h3>E-Mail-Versand (Mailserver)</h3>
    <p class="klein">Damit das Programm Benachrichtigungen per E-Mail verschickt, hier den Mailserver eintragen. Die Angaben bekommst du von der IT, zum Beispiel für ein eigenes Postfach wie cafm@…</p>
    <form class="formular" onsubmit="return false">
      <label class="check breit"><input type="checkbox" name="mail_aktiv" ${e.mail_aktiv === "1" ? "checked" : ""}> E-Mail-Versand eingeschaltet</label>
      <label>Mailserver (SMTP)<input name="smtp_host" value="${esc(e.smtp_host || "")}" placeholder="z. B. smtp.office365.com"></label>
      <label>Port<input name="smtp_port" value="${esc(e.smtp_port || "587")}" inputmode="numeric"></label>
      <label>Verschlüsselung<select name="smtp_tls"><option value="starttls" ${e.smtp_tls === "starttls" ? "selected" : ""}>STARTTLS (meist Port 587)</option><option value="ssl" ${e.smtp_tls === "ssl" ? "selected" : ""}>SSL/TLS (meist Port 465)</option><option value="keine" ${e.smtp_tls === "keine" ? "selected" : ""}>keine (nur im eigenen Netz)</option></select></label>
      <label>Absenderadresse<input name="smtp_absender" type="email" value="${esc(e.smtp_absender || "")}" placeholder="cafm@ccc-frankfurt.com"></label>
      <label>Benutzername<input name="smtp_user" value="${esc(e.smtp_user || "")}" autocomplete="off"></label>
      <label>Passwort<input name="smtp_pass" type="password" autocomplete="new-password" placeholder="${e.smtp_pass_gesetzt ? "gespeichert, leer lassen zum Behalten" : ""}"></label>
      ${e.versand_fehler ? `<div class="warnung breit klein">Letzter Fehler beim Versand: ${esc(e.versand_fehler)}</div>` : ""}
      <div class="breit qr-knoepfe"><button class="knopf haupt-k" id="msSpeichern">Speichern</button><button class="knopf" id="msTest">Testnachricht an mich</button></div>
    </form>`;
  const fm = k.querySelector("form");
  const lesen = () => ({ mail_aktiv: fm.mail_aktiv.checked ? 1 : 0, smtp_host: fm.smtp_host.value, smtp_port: fm.smtp_port.value, smtp_tls: fm.smtp_tls.value,
    smtp_absender: fm.smtp_absender.value, smtp_user: fm.smtp_user.value, ...(fm.smtp_pass.value ? { smtp_pass: fm.smtp_pass.value } : {}) });
  k.querySelector("#msSpeichern").onclick = async () => { try { await api("PUT", "einstellungen", lesen()); melde("Gespeichert."); mailserverKarte(k); } catch (err) { melde(err.message, true); } };
  k.querySelector("#msTest").onclick = async (ev) => {
    ev.target.disabled = true;
    try { await api("PUT", "einstellungen", lesen()); const r = await api("POST", "einstellungen/testmail", { an: S.ich.email }); melde(`Testnachricht an ${r.an} verschickt.`); }
    catch (err) { melde(err.message, true); }
    ev.target.disabled = false;
  };
}
