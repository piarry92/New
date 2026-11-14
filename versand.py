"""Versand von Benachrichtigungen per E-Mail und Web-Push, dazu ein Hintergrunddienst.

- E-Mail über den Mailserver, der unter Einstellungen eingetragen ist (SMTP).
- Web-Push über die Push-Dienste der Browser (Google, Mozilla, Apple). Gesendet wird eine leere Nachricht mit
  VAPID-Anmeldung. Die App auf dem Gerät holt den Text danach selbst beim Programm ab. So reicht die
  Python-Standardbibliothek, eine Verschlüsselung des Inhalts ist nicht nötig.
- Der Hintergrunddienst prüft alle paar Minuten fällige Erinnerungen und verschickt neue Benachrichtigungen.
"""
from __future__ import annotations

import base64
import datetime as dt
import hashlib
import html
import json
import secrets
import smtplib
import ssl
import threading
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request
from email.message import EmailMessage
from email.utils import formataddr, make_msgid

# ---------------------------------------------------------------------------
# ECDSA P-256 (für VAPID), reine Python-Umsetzung
# ---------------------------------------------------------------------------
P = 0xFFFFFFFF00000001000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFF
A = P - 3
B = 0x5AC635D8AA3A93E7B3EBBD55769886BC651D06B0CC53B0F63BCE3C3E27D2604B
N = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551
G = (0x6B17D1F2E12C4247F8BCE6E563A440F277037D812DEB33A0F4A13945D898C296,
     0x4FE342E2FE1A7F9B8EE7EB4A7C0F9E162BCE33576B315ECECBB6406837BF51F5)


def _addieren(p1, p2):
    if p1 is None:
        return p2
    if p2 is None:
        return p1
    if p1[0] == p2[0] and (p1[1] + p2[1]) % P == 0:
        return None
    if p1 == p2:
        m = (3 * p1[0] * p1[0] + A) * pow(2 * p1[1], -1, P) % P
    else:
        m = (p2[1] - p1[1]) * pow(p2[0] - p1[0], -1, P) % P
    x = (m * m - p1[0] - p2[0]) % P
    return x, (m * (p1[0] - x) - p1[1]) % P


def _mal(k, punkt=G):
    erg = None
    while k:
        if k & 1:
            erg = _addieren(erg, punkt)
        punkt = _addieren(punkt, punkt)
        k >>= 1
    return erg


def _b64(daten: bytes) -> str:
    return base64.urlsafe_b64encode(daten).rstrip(b"=").decode()


def schluessel_erzeugen() -> tuple[int, str]:
    d = secrets.randbelow(N - 1) + 1
    x, y = _mal(d)
    return d, _b64(b"\x04" + x.to_bytes(32, "big") + y.to_bytes(32, "big"))


def signieren(d: int, nachricht: bytes) -> bytes:
    z = int.from_bytes(hashlib.sha256(nachricht).digest(), "big")
    while True:
        k = secrets.randbelow(N - 1) + 1
        r = _mal(k)[0] % N
        if not r:
            continue
        s = pow(k, -1, N) * (z + r * d) % N
        if s:
            return r.to_bytes(32, "big") + s.to_bytes(32, "big")


def pruefen(oeffentlich_b64: str, nachricht: bytes, signatur: bytes) -> bool:
    roh = base64.urlsafe_b64decode(oeffentlich_b64 + "=" * (-len(oeffentlich_b64) % 4))
    q = (int.from_bytes(roh[1:33], "big"), int.from_bytes(roh[33:65], "big"))
    r, s = int.from_bytes(signatur[:32], "big"), int.from_bytes(signatur[32:], "big")
    if not (0 < r < N and 0 < s < N):
        return False
    z = int.from_bytes(hashlib.sha256(nachricht).digest(), "big")
    w = pow(s, -1, N)
    punkt = _addieren(_mal(z * w % N), _mal(r * w % N, q))
    return punkt is not None and punkt[0] % N == r


def vapid_kopf(d: int, oeffentlich: str, endpunkt: str, kontakt: str) -> str:
    teile = urllib.parse.urlsplit(endpunkt)
    kopf = _b64(json.dumps({"typ": "JWT", "alg": "ES256"}, separators=(",", ":")).encode())
    inhalt = _b64(json.dumps({"aud": f"{teile.scheme}://{teile.netloc}", "exp": int(time.time()) + 12 * 3600,
                              "sub": kontakt}, separators=(",", ":")).encode())
    unterschrift = _b64(signieren(d, f"{kopf}.{inhalt}".encode()))
    return f"vapid t={kopf}.{inhalt}.{unterschrift}, k={oeffentlich}"


# ---------------------------------------------------------------------------
# Versand
# ---------------------------------------------------------------------------
class Versand:
    extern_holen = None   # Funktion(con, mail_moeglich) -> Liste {"id", "an", "betreff", "text", "extern"}
    extern_melden = None  # Funktion(con, id, ok, fehler)

    def __init__(self, db, lock, einstellung, faellige_erinnerungen, jetzt):
        self.db, self.lock, self.einstellung = db, lock, einstellung
        self.faellige_erinnerungen, self.jetzt = faellige_erinnerungen, jetzt
        self.letzte_pruefung = 0.0
        self.letzter_fehler = ""

    # --- Konfiguration ---------------------------------------------------
    def smtp(self, con) -> dict:
        return {k: self.einstellung(con, k) for k in ("smtp_host", "smtp_port", "smtp_user", "smtp_pass",
                                                       "smtp_absender", "smtp_tls", "mail_aktiv", "basis_url")}

    def vapid(self, con) -> tuple[int, str]:
        privat = self.einstellung(con, "vapid_privat")
        oeff = self.einstellung(con, "vapid_public")
        if not privat or not oeff:
            d, oeff = schluessel_erzeugen()
            con.execute("INSERT OR REPLACE INTO einstellungen VALUES ('vapid_privat', ?)", (format(d, "x"),))
            con.execute("INSERT OR REPLACE INTO einstellungen VALUES ('vapid_public', ?)", (oeff,))
            return d, oeff
        return int(privat, 16), oeff

    # --- E-Mail ----------------------------------------------------------
    def mail_senden(self, cfg: dict, an: str, betreff: str, text: str, link: str = "", extern: dict | None = None) -> None:
        """extern: Mail an Personen ohne Zugang (Sie-Form), z. B. {"antwort_an": "...", "fuss": "..."}."""
        if not cfg.get("smtp_host"):
            raise RuntimeError("Kein Mailserver eingetragen.")
        absender = cfg.get("smtp_absender") or cfg.get("smtp_user")
        if not absender:
            raise RuntimeError("Bitte eine Absenderadresse eintragen.")
        url = (cfg.get("basis_url") or "").rstrip("/")
        ziel = f"{url}/{link.lstrip('/')}" if url and link else ""
        msg = EmailMessage()
        if extern is not None:
            ziel = ""
        msg["Subject"] = betreff if extern is not None else f"Casa CAFM: {betreff}"
        msg["From"] = formataddr(("Casa Concept Consulting" if extern is not None else "Casa CAFM", absender))
        if extern and extern.get("antwort_an"):
            msg["Reply-To"] = extern["antwort_an"]
        msg["To"] = an
        msg["Message-ID"] = make_msgid(domain=absender.split("@")[-1] if "@" in absender else None)
        fuss = ((extern or {}).get("fuss") or "Casa Concept Consulting GmbH & Co. KG") if extern is not None else \
            "Diese Nachricht kommt automatisch aus Casa CAFM. Einstellen lässt sie sich im Programm unter Einstellungen."
        msg.set_content(f"{betreff}\n\n{text}\n\n" + (f"Öffnen: {ziel}\n\n" if ziel else "") + fuss)
        text_html = html.escape(text).replace("\n", "<br>")
        knopf = (f'<p style="margin:22px 0"><a href="{html.escape(ziel)}" style="background:#E63713;color:#fff;text-decoration:none;'
                 f'padding:11px 20px;border-radius:8px;font-weight:bold;display:inline-block">Im Programm öffnen</a></p>') if ziel else ""
        msg.add_alternative(f"""<!doctype html><html><body style="margin:0;background:#F5F6F8;font-family:Calibri,Carlito,Arial,sans-serif;color:#3C3C3B">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:14px;border-top:5px solid #E63713">
<tr><td style="padding:24px 28px">
<div style="font-size:12px;letter-spacing:.14em;color:#E63713;font-weight:bold">{"CASA CONCEPT CONSULTING" if extern is not None else "CASA CAFM"}</div>
<h1 style="font-size:21px;margin:8px 0 10px;color:#3C3C3B">{html.escape(betreff)}</h1>
<p style="font-size:15px;line-height:1.5;margin:0;color:#3C3C3B">{text_html}</p>{knopf}
<p style="font-size:12px;color:#939598;margin:18px 0 0">{html.escape(fuss)}</p>
</td></tr></table>
<p style="font-size:11px;color:#939598">Casa Concept Consulting GmbH &amp; Co. KG · www.ccc-frankfurt.com</p>
</td></tr></table></body></html>""", subtype="html")
        port = int(cfg.get("smtp_port") or (465 if cfg.get("smtp_tls") == "ssl" else 587))
        kontext = ssl.create_default_context()
        if cfg.get("smtp_tls") == "ssl":
            server = smtplib.SMTP_SSL(cfg["smtp_host"], port, timeout=20, context=kontext)
        else:
            server = smtplib.SMTP(cfg["smtp_host"], port, timeout=20)
        try:
            server.ehlo()
            if cfg.get("smtp_tls", "starttls") == "starttls":
                server.starttls(context=kontext)
                server.ehlo()
            if cfg.get("smtp_user") and cfg.get("smtp_pass"):
                server.login(cfg["smtp_user"], cfg["smtp_pass"])
            server.send_message(msg)
        finally:
            try:
                server.quit()
            except Exception:  # noqa: BLE001
                pass

    # --- Push ------------------------------------------------------------
    def push_senden(self, d: int, oeff: str, endpunkt: str) -> int:
        anfrage = urllib.request.Request(endpunkt, data=b"", method="POST", headers={
            "TTL": "86400", "Urgency": "high", "Content-Length": "0",
            "Authorization": vapid_kopf(d, oeff, endpunkt, "mailto:info@ccc-frankfurt.com")})
        try:
            with urllib.request.urlopen(anfrage, timeout=15) as antwort:
                return antwort.status
        except urllib.error.HTTPError as e:
            return e.code

    # --- Hintergrunddienst -----------------------------------------------
    def runde(self) -> None:
        grenze = (dt.datetime.now() - dt.timedelta(hours=24)).isoformat(timespec="seconds")
        with self.lock:
            con = self.db()
            try:
                with con:
                    if time.time() - self.letzte_pruefung > 240:
                        self.letzte_pruefung = time.time()
                        for (bid,) in con.execute("SELECT DISTINCT zustaendig_id FROM checklisten WHERE zustaendig_id IS NOT NULL AND aktiv=1").fetchall():
                            self.faellige_erinnerungen(con, bid)
                    cfg = self.smtp(con)
                    d, oeff = self.vapid(con)
                    con.execute("UPDATE benachrichtigungen SET gemailt=2 WHERE gemailt=0 AND zeit<?", (grenze,))
                    con.execute("UPDATE benachrichtigungen SET gepusht=2 WHERE gepusht=0 AND zeit<?", (grenze,))
                    mails = [dict(r) for r in con.execute(
                        "SELECT n.*, b.email, b.name FROM benachrichtigungen n JOIN benutzer b ON b.id=n.benutzer_id "
                        "WHERE n.gemailt=0 AND b.aktiv=1 ORDER BY n.id LIMIT 30")] if cfg.get("mail_aktiv") == "1" and cfg.get("smtp_host") else []
                    keine_mail = [m["id"] for m in mails if not self._mail_gewuenscht(con, m["benutzer_id"])]
                    for i in keine_mail:
                        con.execute("UPDATE benachrichtigungen SET gemailt=2 WHERE id=?", (i,))
                    mails = [m for m in mails if m["id"] not in keine_mail]
                    externe = self.extern_holen(con, cfg.get("mail_aktiv") == "1" and bool(cfg.get("smtp_host"))) if self.extern_holen else []
                    pushes = [dict(r) for r in con.execute(
                        "SELECT n.id, n.benutzer_id FROM benachrichtigungen n WHERE n.gepusht=0 ORDER BY n.id LIMIT 50")]
                    abos = {}
                    for p in pushes:
                        abos[p["id"]] = [dict(a) for a in con.execute("SELECT * FROM push_abos WHERE benutzer_id=?", (p["benutzer_id"],))]
            finally:
                con.close()
        # Versand außerhalb der Datenbanksperre
        erledigt_mail, fehler_mail, erledigt_push, alte_abos = [], [], [], []
        for m in mails:
            try:
                self.mail_senden(cfg, m["email"], m["titel"], m["text"] or "", m["link"] or "")
                erledigt_mail.append(m["id"])
            except Exception as e:  # noqa: BLE001
                self.letzter_fehler = f"{self.jetzt()}: {e}"
                fehler_mail.append(m["id"])
        extern_ergebnis = []
        for x in externe:
            try:
                self.mail_senden(cfg, x["an"], x["betreff"], x["text"], "", x.get("extern") or {})
                extern_ergebnis.append((x["id"], True, ""))
            except Exception as e:  # noqa: BLE001
                self.letzter_fehler = f"{self.jetzt()}: {e}"
                extern_ergebnis.append((x["id"], False, str(e)))
        if extern_ergebnis and self.extern_melden:
            with self.lock:
                con = self.db()
                try:
                    with con:
                        for i, ok, f in extern_ergebnis:
                            self.extern_melden(con, i, ok, f)
                finally:
                    con.close()
        gesendet = set()
        for p in pushes:
            for a in abos.get(p["id"], []):
                if a["endpoint"] in gesendet:
                    continue
                try:
                    status = self.push_senden(d, oeff, a["endpoint"])
                    if status in (404, 410):
                        alte_abos.append(a["id"])
                    gesendet.add(a["endpoint"])
                except Exception as e:  # noqa: BLE001
                    self.letzter_fehler = f"{self.jetzt()}: Push {e}"
            erledigt_push.append(p["id"])
        if erledigt_mail or fehler_mail or erledigt_push or alte_abos:
            with self.lock:
                con = self.db()
                try:
                    with con:
                        for i in erledigt_mail:
                            con.execute("UPDATE benachrichtigungen SET gemailt=1 WHERE id=?", (i,))
                        for i in fehler_mail:
                            con.execute("UPDATE benachrichtigungen SET mailfehler=COALESCE(mailfehler,0)+1, "
                                        "gemailt=CASE WHEN COALESCE(mailfehler,0)>=4 THEN 3 ELSE 0 END WHERE id=?", (i,))
                        for i in erledigt_push:
                            con.execute("UPDATE benachrichtigungen SET gepusht=1 WHERE id=?", (i,))
                        for i in alte_abos:
                            con.execute("DELETE FROM push_abos WHERE id=?", (i,))
                finally:
                    con.close()

    def _mail_gewuenscht(self, con, bid: int) -> bool:
        r = con.execute("SELECT mail_an FROM benutzer WHERE id=?", (bid,)).fetchone()
        return bool(r and (r[0] is None or r[0]))

    def starten(self, takt: int = 20) -> None:
        def schleife():
            while True:
                try:
                    self.runde()
                except Exception:  # noqa: BLE001
                    traceback.print_exc()
                time.sleep(takt)
        threading.Thread(target=schleife, name="versand", daemon=True).start()
