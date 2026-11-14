/* Casa CAFM – Hintergrunddienst für App und Push-Benachrichtigungen */
const VERSION = "cafm-2026.11.15-8";

self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(self.clients.claim()); });

/* Kein Zwischenspeicher für Daten: Inhalte kommen immer frisch vom Programm. */
self.addEventListener("fetch", () => {});

/* Push kommt ohne Inhalt. Den Text holt die App selbst beim Programm ab. */
self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let titel = "Casa CAFM", text = "Es gibt eine neue Benachrichtigung.", link = "#/", tag = "cafm";
    try {
      const r = await fetch("/api/benachrichtigungen/neueste", { credentials: "include", headers: { "X-CAFM": "1" } });
      if (r.ok) {
        const d = await r.json();
        if (d.neueste) { titel = d.neueste.titel; text = d.neueste.text || ""; link = d.neueste.link || "#/"; tag = `cafm-${d.neueste.id}`; }
        if (self.navigator && self.navigator.setAppBadge && d.ungelesen) self.navigator.setAppBadge(d.ungelesen).catch(() => {});
      } else if (r.status === 401) {
        text = "Bitte in der App anmelden, um die Benachrichtigung zu sehen.";
      }
    } catch (e) { /* ohne Verbindung den allgemeinen Text zeigen */ }
    await self.registration.showNotification(titel, { body: text, icon: "/app-192.png", badge: "/app-192.png", tag, data: { link } });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const ziel = "/" + (event.notification.data && event.notification.data.link ? event.notification.data.link : "#/");
  event.waitUntil((async () => {
    const fenster = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const f of fenster) { if ("focus" in f) { await f.navigate(ziel).catch(() => {}); return f.focus(); } }
    return self.clients.openWindow(ziel);
  })());
});
