"""Multi-Order Kommissionier-box (M-Nummer) muss in die CW-Liste — nicht nur die
Produkt-EANs. Pulpo legt die M-Nummer pro Artikel in items[].batches[].cart_box;
Scan ('m030974'/'M030974') und gespeicherte cart_box werden GROSS normalisiert,
damit das exakte CW-Matching greift (Bug: 'M erkannt, aber nicht in CW-Liste')."""

from __future__ import annotations

from app.modules.pulpo.cw_sync import _extract_cartbox
from app.gateway.connection import sanitize_barcode


def _multi_order():
    return {
        "sequence_number": "PA-0593867",
        "items": [
            {"product": {"sku": "00689", "barcodes": ["4005240006894"]},
             "batches": [{"cart_box": {"barcode": "m030974"}, "cart_box_id": 30974}]},
            {"product": {"sku": "01364", "barcodes": ["4005240030417"]},
             "batches": [{"cart_box": {"barcode": "m030974"}}]},
        ],
    }


def test_cartbox_extracted_from_item_batches_and_normalized():
    # M-Nummer steckt pro Artikel in den batches → wird gezogen und GROSS normalisiert
    assert _extract_cartbox(_multi_order()) == "M030974"


def test_single_order_has_no_cartbox():
    single = {"items": [{"product": {"sku": "00689", "barcodes": ["4005240006894"]},
                         "batches": [{"cart_box": None, "cart_box_id": None}]}]}
    assert _extract_cartbox(single) == ""


def test_scan_and_stored_cartbox_match_case_insensitively():
    stored = _extract_cartbox(_multi_order())   # "M030974"
    assert sanitize_barcode("m030974") == stored   # Scan klein → groß normalisiert
    assert sanitize_barcode("M030974") == stored
    # Multi-Read (Karton-M + enthaltene EAN): M gewinnt
    assert sanitize_barcode("4005240006894;m030974") == stored


def test_ean_unchanged():
    assert sanitize_barcode("4005240006894") == "4005240006894"


if __name__ == "__main__":  # pragma: no cover
    test_cartbox_extracted_from_item_batches_and_normalized()
    test_single_order_has_no_cartbox()
    test_scan_and_stored_cartbox_match_case_insensitively()
    test_ean_unchanged()
    print("OK")
