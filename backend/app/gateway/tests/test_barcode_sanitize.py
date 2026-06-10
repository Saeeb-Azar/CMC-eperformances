"""Multi-Barcode-Auflösung (FA-29): aus einer (Mehrfach-)Lesung wird genau
EIN Routing-Code. Ein M-/Buchstaben-Code (CartBox/Multi-Order) hat immer
Vorrang vor numerischen EANs — die werden ignoriert."""

from __future__ import annotations

from app.gateway.connection import sanitize_barcode


def test_single_numeric_passthrough():
    assert sanitize_barcode("4062196101493") == "4062196101493"


def test_single_mcode_passthrough():
    assert sanitize_barcode("M319991") == "M319991"


def test_semicolon_mcode_wins_over_ean():
    assert sanitize_barcode("M319991;4062196101493") == "M319991"
    # Reihenfolge egal — M gewinnt auch wenn die EAN zuerst kommt.
    assert sanitize_barcode("4062196101493;M319991") == "M319991"


def test_whitespace_separated_multiread():
    assert sanitize_barcode("4062196101493 M319991  4001234500000") == "M319991"


def test_multiple_eans_no_mcode_takes_first():
    assert sanitize_barcode("4062196101493;4001234500000") == "4062196101493"


def test_prefers_explicit_m_prefix_over_other_alnum():
    # Anderer alphanumerischer Code + echter M-Code → M gewinnt.
    assert sanitize_barcode("ABC123;M555") == "M555"


def test_empty_and_noread():
    assert sanitize_barcode("") == ""
    assert sanitize_barcode("   ") == ""
    assert sanitize_barcode("NOREAD") == "NOREAD"


if __name__ == "__main__":
    import inspect, sys
    mod = sys.modules[__name__]
    failures = 0
    for name, fn in sorted(inspect.getmembers(mod, inspect.isfunction)):
        if name.startswith("test_"):
            try:
                fn()
                print(f"PASS {name}")
            except Exception as e:  # noqa: BLE001
                failures += 1
                import traceback; traceback.print_exc()
                print(f"FAIL {name}: {e!r}")
    sys.exit(1 if failures else 0)
