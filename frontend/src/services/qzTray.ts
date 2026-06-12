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
  host: string;   // z.B. 192.168.1.120
  port: number;   // z.B. 51236 (oder 9100)
  format: "pdf" | "raw"; // pdf = Standard-/Pixeldruck, raw = ZPL etc.
}

/**
 * Ein Label drucken. `labelB64` ist Base64 (PDF von Pulpo, oder ZPL).
 *  - format "pdf": als PDF an einen Netzwerk-Drucker (Pixel-Rendering)
 *  - format "raw": Roh-Bytes (ZPL) direkt an host:port
 */
export async function qzPrintLabel(labelB64: string, target: PrinterTarget): Promise<void> {
  const qz = await loadQz();
  await qzConnect();
  // Netzwerk-Drucker per host/port ansprechen (raw socket). QZ akzeptiert
  // ein Config-Objekt mit host+port für direkten TCP-Druck.
  const config = qz.configs.create({ host: target.host, port: target.port });
  if (target.format === "raw") {
    // ZPL/Roh — base64 so an den Drucker geben.
    await qz.print(config, [{ type: "raw", format: "base64", data: labelB64 }]);
  } else {
    // PDF — als Dokument rendern und drucken.
    await qz.print(config, [{ type: "pixel", format: "pdf", flavor: "base64", data: labelB64 }]);
  }
}
