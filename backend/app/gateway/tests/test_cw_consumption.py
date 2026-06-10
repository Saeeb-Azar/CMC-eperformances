"""CW-Slot-Buchführung: Eject gibt den Slot zurück, COMPLETED behält ihn,
und ein erneut aufgelegtes (noch aktives) Paket wird als Wiederaufnahme
behandelt — ohne den Slot doppelt zu verbrauchen."""

from __future__ import annotations

from app.gateway.connection import ConnectionManager


def _cm_with_list():
    cm = ConnectionManager()
    cm.set_pulpo_cw_lists("0001", {"CW10": {"BC1": 2}}, active=True)
    return cm


def _consume(cm, ref, barcode="BC1", list_name="CW10"):
    assert cm.consume_cw_entry("0001", list_name, barcode) is True
    cm.record_cw_consumption("0001", ref, list_name, barcode)


def _consumed(cm, list_name="CW10", barcode="BC1"):
    return cm.get_cw_lists("0001")[list_name]["items"][barcode]["consumed"]


def test_eject_returns_the_slot():
    cm = _cm_with_list()
    _consume(cm, "ref-1")
    assert _consumed(cm) == 1
    # Auftrag wird ausgeworfen → Slot zurück.
    assert cm.release_cw_for_ref("0001", "ref-1") is True
    assert _consumed(cm) == 0
    # Doppelte Rückgabe tut nichts.
    assert cm.release_cw_for_ref("0001", "ref-1") is False
    assert _consumed(cm) == 0


def test_completed_keeps_the_slot():
    cm = _cm_with_list()
    _consume(cm, "ref-1")
    cm.finalize_cw_for_ref("0001", "ref-1")
    assert _consumed(cm) == 1
    # Nach Abschluss gibt es nichts mehr zurückzugeben.
    assert cm.release_cw_for_ref("0001", "ref-1") is False
    assert _consumed(cm) == 1


def test_eject_then_refeed_counts_once():
    cm = _cm_with_list()
    _consume(cm, "ref-1")           # erster Durchlauf
    cm.release_cw_for_ref("0001", "ref-1")   # ausgeworfen
    _consume(cm, "ref-2")           # neu aufgelegt → neuer Slot
    assert _consumed(cm) == 1       # netto genau einmal verbraucht


def test_resume_ref_has_no_slot_to_release():
    cm = _cm_with_list()
    _consume(cm, "ref-1")
    # Wiederaufnahme bucht KEINEN Slot ab → kein record; release ist ein No-Op.
    assert cm.release_cw_for_ref("0001", "ref-resume") is False
    assert _consumed(cm) == 1


def test_active_barcode_detects_resume():
    cm = _cm_with_list()
    cm._tracker.apply("0001", "ENQ", {"barcode": "BC1", "event": "5"}, "ref-1")
    assert cm._tracker.is_active_barcode("0001", "BC1") is True
    # Nach Abschluss ist der Barcode nicht mehr aktiv.
    cm._tracker.apply("0001", "END", {"status": "1"}, "ref-1")
    assert cm._tracker.is_active_barcode("0001", "BC1") is False


def test_clear_resets_consumption_bookkeeping():
    cm = _cm_with_list()
    _consume(cm, "ref-1")
    cm.reset_runtime("0001")
    # Nach Reset ist die Buchführung leer → release findet nichts.
    assert cm.release_cw_for_ref("0001", "ref-1") is False


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
