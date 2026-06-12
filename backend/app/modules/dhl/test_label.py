"""Gerendertes Test-Versandlabel (4×6 Zoll PDF).

Im DHL-Test-Modus geht KEIN echter API-Call raus — trotzdem soll der Operator
ein realistisches Label *sehen* (Empfänger, Tracking, Produkt, Barcode), um den
ganzen Demo-Durchlauf zu prüfen. Dieses Modul rendert genau das als PDF und
liefert es base64-kodiert zurück (passt in ``Shipment.label_b64`` und in die
PDF-Vorschau der „Alle Infos"-Ansicht; QZ kann es ebenso rasterisiert drucken).

Klar als TEST markiert (Wasserzeichen + Banner), damit es niemals mit einer
echten Sendung verwechselt wird.

reportlab wird *lazy* importiert: fehlt das Paket (z.B. alte Deployment-Images),
fällt die Funktion auf ein minimales statisches Platzhalter-PDF zurück, statt
den Flow zu sprengen.
"""

from __future__ import annotations

import base64

from app.core.logging import logger

# 4×6 Zoll @ 72pt/Zoll — Standard-Versandlabelformat (Zebra ZE511 / DR_CW).
_LABEL_W = 4 * 72
_LABEL_H = 6 * 72


def render_test_label_pdf(
    *,
    tracking: str,
    order_ref: str,
    recipient_name: str = "",
    recipient_company: str = "",
    recipient_street: str = "",
    recipient_house_no: str = "",
    recipient_zip: str = "",
    recipient_city: str = "",
    recipient_country: str = "",
    sender_line: str = "",
    product: str = "",
    weight_g: int | None = None,
    length_mm: int | None = None,
    width_mm: int | None = None,
    height_mm: int | None = None,
    article_name: str = "",
) -> str:
    """Rendert ein 4×6-Test-Label und gibt es base64-kodiert zurück."""
    try:
        return _render_with_reportlab(
            tracking=tracking, order_ref=order_ref,
            recipient_name=recipient_name, recipient_company=recipient_company,
            recipient_street=recipient_street, recipient_house_no=recipient_house_no,
            recipient_zip=recipient_zip, recipient_city=recipient_city,
            recipient_country=recipient_country, sender_line=sender_line,
            product=product, weight_g=weight_g,
            length_mm=length_mm, width_mm=width_mm, height_mm=height_mm,
            article_name=article_name,
        )
    except Exception as e:  # ImportError oder Rendering-Fehler
        logger.warning(f"Test-Label-Rendering fehlgeschlagen ({e}) — Platzhalter-PDF")
        return _PLACEHOLDER_PDF_B64


def _render_with_reportlab(**kw) -> str:
    from io import BytesIO

    from reportlab.graphics.barcode import code128
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas

    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=(_LABEL_W, _LABEL_H))

    # Rahmen
    c.setLineWidth(1)
    c.rect(6, 6, _LABEL_W - 12, _LABEL_H - 12)

    # Diagonales TEST-Wasserzeichen
    c.saveState()
    c.translate(_LABEL_W / 2, _LABEL_H / 2)
    c.rotate(35)
    c.setFont("Helvetica-Bold", 60)
    c.setFillGray(0.88)
    c.drawCentredString(0, -20, "TEST")
    c.restoreState()
    c.setFillGray(0.0)

    y = _LABEL_H - 30

    # Banner
    c.setFillGray(0.12)
    c.rect(6, y - 6, _LABEL_W - 12, 30, fill=1, stroke=0)
    c.setFillGray(1.0)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(16, y + 2, "DEMO / TEST-VERSANDLABEL")
    c.setFont("Helvetica", 8)
    c.drawRightString(_LABEL_W - 16, y + 4, "KEINE ECHTE SENDUNG")
    c.setFillGray(0.0)
    y -= 36

    # Absender (klein)
    c.setFont("Helvetica", 7)
    c.drawString(16, y, f"Absender: {kw.get('sender_line') or '—'}")
    y -= 18

    # Empfänger-Block
    c.setFont("Helvetica-Bold", 9)
    c.drawString(16, y, "EMPFÄNGER")
    y -= 16
    c.setFont("Helvetica-Bold", 13)
    lines = []
    if kw.get("recipient_company"):
        lines.append(kw["recipient_company"])
    lines.append(kw.get("recipient_name") or "—")
    street = " ".join(p for p in (kw.get("recipient_street"), kw.get("recipient_house_no")) if p)
    if street:
        lines.append(street)
    city = " ".join(p for p in (kw.get("recipient_zip"), kw.get("recipient_city")) if p)
    if city:
        lines.append(city)
    if kw.get("recipient_country"):
        lines.append(kw["recipient_country"])
    for ln in lines:
        c.drawString(16, y, str(ln))
        y -= 18

    y -= 6
    c.setLineWidth(0.5)
    c.line(16, y, _LABEL_W - 16, y)
    y -= 18

    # Sendungsdaten
    c.setFont("Helvetica", 9)

    def _kv(label: str, value: str) -> None:
        nonlocal y
        c.setFont("Helvetica", 8)
        c.drawString(16, y, label)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(110, y, value or "—")
        y -= 15

    _kv("Produkt", str(kw.get("product") or "—"))
    if kw.get("article_name"):
        _kv("Artikel", str(kw["article_name"]))
    dims = "—"
    if kw.get("length_mm") or kw.get("width_mm") or kw.get("height_mm"):
        dims = f"{kw.get('length_mm') or '?'}×{kw.get('width_mm') or '?'}×{kw.get('height_mm') or '?'} mm"
    _kv("Maße", dims)
    _kv("Gewicht", f"{kw['weight_g']} g" if kw.get("weight_g") else "—")
    _kv("Auftrag", str(kw.get("order_ref") or "—"))

    # Tracking + Barcode (unten)
    tracking = str(kw.get("tracking") or "")
    by = 40
    try:
        bc = code128.Code128(tracking, barHeight=22 * mm / 1.2, barWidth=0.95)
        bc_w = bc.width
        bc.drawOn(c, max(16, (_LABEL_W - bc_w) / 2), by + 16)
    except Exception:
        pass
    c.setFont("Helvetica-Bold", 11)
    c.drawCentredString(_LABEL_W / 2, by, tracking or "—")

    c.showPage()
    c.save()
    return base64.b64encode(buf.getvalue()).decode("ascii")


# Minimales gültiges 1-seitiges PDF („TEST LABEL") als Fallback, falls reportlab
# fehlt. Nur damit die Vorschau nie leer/kaputt ist.
_PLACEHOLDER_PDF_B64 = (
    "JVBERi0xLjQKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PgplbmRvYmoKMiAw"
    "IG9iago8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PgplbmRvYmoKMyAwIG9iago8"
    "PC9UeXBlL1BhZ2UvUGFyZW50IDIgMCBSL01lZGlhQm94WzAgMCAyODggNDMyXS9SZXNvdXJjZXM8"
    "PC9Gb250PDwvRjEgNCAwIFI+Pj4+L0NvbnRlbnRzIDUgMCBSPj4KZW5kb2JqCjQgMCBvYmoKPDwv"
    "VHlwZS9Gb250L1N1YnR5cGUvVHlwZTEvQmFzZUZvbnQvSGVsdmV0aWNhLUJvbGQ+PgplbmRvYmoK"
    "NSAwIG9iago8PC9MZW5ndGggNTg+PnN0cmVhbQpCVCAvRjEgMjAgVGYgNjAgMjIwIFRkIChURVNU"
    "IExBQkVMKSBUaiBFVAplbmRzdHJlYW0KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUg"
    "ZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDU4IDAwMDAwIG4gCjAwMDAwMDAxMTUgMDAw"
    "MDAgbiAKMDAwMDAwMDI0NyAwMDAwMCBuIAowMDAwMDAwMzE5IDAwMDAwIG4gCnRyYWlsZXIKPDwv"
    "U2l6ZSA2L1Jvb3QgMSAwIFI+PgpzdGFydHhyZWYKNDI3CiUlRU9GCg=="
)
