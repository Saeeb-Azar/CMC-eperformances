/**
 * QZ Tray-Anbindung — druckt direkt aus dem Browser an einen LAN-Drucker,
 * OHNE dass etwas Neues installiert werden muss (QZ Tray läuft bereits auf
 * den Operator-PCs). QZ Tray stellt lokal einen WebSocket bereit
 * (wss://localhost:8181), den wir aus dem geöffneten Dashboard-Tab ansprechen.
 *
 * Warum nicht direkt Cloud→Drucker? Der Drucker hat eine private LAN-IP
 * (192.168.1.120) — die Cloud erreicht sie nicht. Der Browser im selben LAN
 * schon. QZ Tray ist die Brücke Browser↔Drucker.
 *
 * Die qz-tray-Bibliothek wird per CDN dynamisch nachgeladen (keine npm-
 * Abhängigkeit, kein Build-Schritt). Signatur: QZ Tray verlangt für den
 * stillen Betrieb ein signiertes Zertifikat; ohne Signatur erscheint ein
 * Bestätigungs-Popup. Da ihr QZ Tray produktiv nutzt, ist das Cert i.d.R.
 * schon hinterlegt — wir nutzen den "unsigned"-Promise-Pfad als Fallback.
 */

const QZ_CDN = "https://cdn.jsdelivr.net/npm/qz-tray@2.2.4/qz-tray.js";

// Minimal getypter Ausschnitt der globalen qz-API (vom CDN-Script gesetzt).
interface QZ {
  websocket: {
    isActive: () => boolean;
    connect: (opts?: Record<string, unknown>) => Promise<void>;
    disconnect: () => Promise<void>;
  };
  configs: { create: (printer: unknown, opts?: Record<string, unknown>) => unknown };
  print: (config: unknown, data: unknown[]) => Promise<void>;
  security: {
    setCertificatePromise: (fn: (resolve: (v: string) => void, reject: (e: unknown) => void) => void) => void;
    setSignaturePromise: (fn: (toSign: string) => (resolve: (v: string) => void, reject: (e: unknown) => void) => void) => void;
  };
}

declare global {
  interface Window { qz?: QZ }
}

let loadPromise: Promise<QZ> | null = null;

/**
 * Euer QZ-Tray-Zertifikat (öffentlich, kein Geheimnis). Damit erkennt QZ Tray
 * den Absender; beim ersten Druck erscheint ggf. einmalig der „Allow"-Dialog
 * → dort „Remember this decision" anhaken, danach läuft es lautlos.
 *
 * WICHTIG zur Signatur (siehe qzConnect): Ohne den passenden PRIVATE KEY können
 * wir die Anfrage nicht serverseitig kryptografisch signieren. Wir liefern
 * daher eine LEERE Signatur (resolve ohne Wert) — NICHT reject! Ein reject
 * erzeugt „Failed to sign request" und der Job scheitert komplett, bevor er
 * den Drucker überhaupt erreicht (genau der Fehler, der alle Drucke blockierte).
 */
const QZ_CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIIECzCCAvOgAwIBAgIGAZx01n4JMA0GCSqGSIb3DQEBCwUAMIGiMQswCQYDVQQG
EwJVUzELMAkGA1UECAwCTlkxEjAQBgNVBAcMCUNhbmFzdG90YTEbMBkGA1UECgwS
UVogSW5kdXN0cmllcywgTExDMRswGQYDVQQLDBJRWiBJbmR1c3RyaWVzLCBMTEMx
HDAaBgkqhkiG9w0BCQEWDXN1cHBvcnRAcXouaW8xGjAYBgNVBAMMEVFaIFRyYXkg
RGVtbyBDZXJ0MB4XDTI2MDIxODA3Mzg1OVoXDTQ2MDIxODA3Mzg1OVowgaIxCzAJ
BgNVBAYTAlVTMQswCQYDVQQIDAJOWTESMBAGA1UEBwwJQ2FuYXN0b3RhMRswGQYD
VQQKDBJRWiBJbmR1c3RyaWVzLCBMTEMxGzAZBgNVBAsMElFaIEluZHVzdHJpZXMs
IExMQzEcMBoGCSqGSIb3DQEJARYNc3VwcG9ydEBxei5pbzEaMBgGA1UEAwwRUVog
VHJheSBEZW1vIENlcnQwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQCb
hzCN9cz6Eh47ZECdYTm9XQnaKqgNyr2nE8bBOrxmtrNhKU0IqUhta+v7TajmWWKQ
IGdG+85PVi1g0UCM5jXHg75KoKl8T36uoxjeqi0Ht3j00gzXTmwevomY280WmpQS
14hM9licDPesWaAKDqLtw/CBASGe2lgppk4UqGA2PjqlZcuB30jQmccsf9CvKfa7
f9pvC0Q8ngBKmGP6VJT2spBq4+68SFcUS3GiYECZXSi6ZpcxA9SRn1zIcukLcFxf
rzztG8LO2DqEtlxIGatTBkD15w+Uvql1FP0owTKAZ/dx8qaNSh4ANdm+dFUNZcYe
GTQHXoYIFqVt4dEBkhLlAgMBAAGjRTBDMBIGA1UdEwEB/wQIMAYBAf8CAQEwDgYD
VR0PAQH/BAQDAgEGMB0GA1UdDgQWBBRvqqJsdBhZGuxKuy57wkuuMXIcnjANBgkq
hkiG9w0BAQsFAAOCAQEANkW0N7kvAgpVjW9CBbdK6PilM3fZQ0/+I8H1DBATX+kD
4njt7QW3D80sIEvZ7jI/Tzf4C2tmY0LDsRxf10V+NqXiKvLtPgHeVLk4or5/WE0H
3tJr7P/2VCu8q4jKavQFS/aiDvDLlr5K13VU2P7A1At/rzh6sRTVvW1n99gIOywe
HjUtOoPMtaycQo2FefQoQOm/nITHFicnHFAQZbvuk38yb8ta/ZeCguZ4In1C8xcA
R2cmeC/05ggFvL4qIqoawdSJK530T7AtFh5CmXl97TTkL8J7e7U1fQPYEhTvJ9Ww
oEn16k/1aNgERPdP8DgTMLzA+Y4MYBHeJl2y1QNbZg==
-----END CERTIFICATE-----`;

/** qz-tray.js einmalig vom CDN laden. */
function loadQz(): Promise<QZ> {
  if (window.qz) return Promise.resolve(window.qz);
  if (loadPromise) return loadPromise;
  loadPromise = new Promise<QZ>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = QZ_CDN;
    s.async = true;
    s.onload = () => {
      if (window.qz) resolve(window.qz);
      else reject(new Error("qz-tray geladen, aber window.qz fehlt"));
    };
    s.onerror = () => reject(new Error("qz-tray.js konnte nicht geladen werden (CDN/Offline?)"));
    document.head.appendChild(s);
  });
  return loadPromise;
}

/** Verbindung zum lokalen QZ Tray sicherstellen. */
export async function qzConnect(): Promise<void> {
  const qz = await loadQz();
  // Zertifikat liefern, damit QZ Tray den Absender erkennt (Allow-Dialog mit
  // „Remember this decision" merkt sich die Freigabe pro Zertifikat).
  qz.security.setCertificatePromise((resolve) => resolve(QZ_CERTIFICATE));
  // Signatur LEER auflösen (resolve, NICHT reject!). reject() erzeugte zuvor
  // „Failed to sign request" und ließ jeden Druck scheitern, bevor er QZ
  // erreichte. Mit leerer Signatur akzeptiert QZ die Anfrage (ggf. einmaliger
  // Allow-Dialog → „Remember"); für vollständig stille, signierte Anfragen
  // müsste serverseitig mit dem zugehörigen Private Key signiert werden.
  qz.security.setSignaturePromise(() => (resolve) => resolve(""));
  if (!qz.websocket.isActive()) {
    await qz.websocket.connect({ retries: 2, delay: 1 });
  }
}

export function qzIsConnected(): boolean {
  return !!window.qz && window.qz.websocket.isActive();
}

export interface PrinterTarget {
  /** Windows/macOS Druckername wie er im System installiert ist (z.B. „DR_CW").
   *  Das ist der Standardweg bei QZ Tray; QZ findet den Drucker über den
   *  installierten Treiber. Hat Vorrang vor host/port wenn gesetzt. */
  name?: string;
  /** Direkte Netzwerk-Adresse (Raw-TCP, z.B. Zebra). Nur Fallback, falls
   *  der Drucker NICHT im OS installiert ist und du wirklich direkt per
   *  TCP an host:port schreiben willst. */
  host?: string;
  port?: number;
  /** pdf = Pixel-Druck (Standard, was Pulpo liefert),
   *  raw = ZPL/Roh-Bytes direkt. */
  format: "pdf" | "raw";
}

/**
 * Ein Label drucken. `labelB64` ist Base64 (PDF von Pulpo, oder ZPL).
 *  - format "pdf": als PDF an den OS-Drucker (Pixel-Rendering)
 *  - format "raw": Roh-Bytes (ZPL) direkt an den Drucker
 *
 * Drucker-Auswahl: bevorzugt `name` (im OS installierter Drucker, was die
 * bestehende Pulpo-Integration auch nutzt — siehe QZ-Log: `printer.name=DR_CW`).
 * Nur wenn kein Name gesetzt ist, wird `host:port` als Raw-TCP-Fallback verwendet.
 */
export async function qzPrintLabel(labelB64: string, target: PrinterTarget): Promise<void> {
  const qz = await loadQz();
  await qzConnect();
  // Drucker-Konfig: Name hat Vorrang (= so druckt Pulpo auch); host:port
  // ist nur ein Fallback für nicht-installierte Netzwerk-Thermo-Drucker.
  const printerSpec: Record<string, unknown> =
    target.name ? { name: target.name }
    : target.host ? { host: target.host, port: target.port ?? 9100 }
    : { name: "default" };
  if (target.format === "raw") {
    const config = qz.configs.create(printerSpec, { jobName: `CMC Label ${Date.now()}` });
    await qz.print(config, [{ type: "raw", format: "base64", data: labelB64 }]);
    return;
  }

  // PDF-Pfad für Thermo-/ZPL-Label-Drucker (z.B. Zebra ZE511, 300 dpi).
  //
  // WICHTIG: Ohne explizite Optionen reicht QZ das PDF nativ über PDFBox an
  // den Drucker-Spooler. Auf Zebra-ZPL-Treibern meldet der Job dann zwar
  // „Printing complete", es kommt aber nichts heraus (der Treiber verwirft
  // den Java-Render-Job still). Der zuverlässige Weg ist, QZ das Label vorher
  // selbst in ein Bitmap mit korrekter Dichte/Größe RASTERN zu lassen
  // (rasterize:true). Der Treiber bekommt dann ein sauberes Vollbild, exakt
  // so wie beim funktionierenden Windows-Testdruck (GDI).
  // ACHTUNG units↔density: Bei units:"mm" interpretiert QZ `density` als
  // Punkte pro MILLIMETER (dpmm), NICHT als dpi. density:300 + mm ergab eine
  // 64770×97155-px-Bitmap → QZ-Fehler „Dimensions too large", nichts kam raus.
  // Darum hier units:"in" + density:300 (echte DPI) und die Standard-
  // 4×6-Zoll-Versandlabelgröße (≈101×152 mm, deckt das 100×150-Label ab).
  const config = qz.configs.create(printerSpec, {
    jobName: `CMC Label ${Date.now()}`,
    rasterize: true,        // PDF vor dem Senden zu Bitmap rendern (nicht nativ durchreichen)
    density: 300,           // 300 DPI passend zum Zebra ZE511 LH-300dpi-Treiber
    units: "in",            // density wird hier als echte DPI interpretiert
    size: { width: 4, height: 6 }, // 4×6"-Versandlabel (300 dpi → 1200×1800 px)
    scaleContent: true,     // Inhalt auf die Labelfläche skalieren
    margins: 0,
    colorType: "grayscale", // Thermodruck ist monochrom — Graustufen statt Farbe
    interpolation: "bicubic",
    rotation: 0,
  });
  await qz.print(config, [{ type: "pixel", format: "pdf", flavor: "base64", data: labelB64 }]);
}
