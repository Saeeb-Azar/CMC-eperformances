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
  // Unsigned-Betrieb: leeres Zertifikat + Reject der Signatur → QZ zeigt
  // (falls kein Cert hinterlegt) einen einmaligen Allow-Dialog. Mit eurem
  // produktiven Cert greift das gar nicht erst.
  qz.security.setCertificatePromise((resolve) => resolve(""));
  qz.security.setSignaturePromise(() => (_resolve, reject) => reject(undefined));
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
  const config = qz.configs.create(printerSpec, {
    jobName: `CMC Label ${Date.now()}`,
    rasterize: true,        // PDF vor dem Senden zu Bitmap rendern (nicht nativ durchreichen)
    density: 300,           // dpi passend zum Zebra ZE511 LH-300dpi-Treiber
    units: "mm",
    size: { width: 100, height: 150 }, // 100×150-mm-Label (MediaBox 283×422 pt)
    scaleContent: true,     // Inhalt auf die Labelfläche skalieren
    margins: 0,
    colorType: "grayscale", // Thermodruck ist monochrom — Graustufen statt Farbe
    interpolation: "bicubic",
    rotation: 0,
  });
  await qz.print(config, [{ type: "pixel", format: "pdf", flavor: "base64", data: labelB64 }]);
}
