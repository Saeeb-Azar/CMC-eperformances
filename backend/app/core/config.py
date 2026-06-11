from pydantic_settings import BaseSettings
from pydantic import field_validator
from functools import lru_cache


class Settings(BaseSettings):
    app_name: str = "CMC ePerformances"
    app_version: str = "0.1.0"
    debug: bool = False

    # Database — defaults to a local SQLite file so the backend starts without
    # any external DB install. Override with DATABASE_URL for Supabase/Postgres:
    #   postgresql://...  (auto-rewritten to postgresql+asyncpg://...)
    database_url: str = "sqlite+aiosqlite:///./local.db"

    @field_validator("database_url", mode="before")
    @classmethod
    def normalize_db_url(cls, v: str) -> str:
        """Convert plain postgresql:// to postgresql+asyncpg:// for async SQLAlchemy."""
        if isinstance(v, str) and v.startswith("postgresql://"):
            return v.replace("postgresql://", "postgresql+asyncpg://", 1)
        return v

    # Auth
    secret_key: str = "CHANGE-ME-IN-PRODUCTION"
    algorithm: str = "HS256"
    # Lange Sessions sind hier gewollt: ein Operator soll mitten in einem
    # Pack-Vorgang nicht ausgeloggt werden. 30 Tage Access-Token + 365 Tage
    # Refresh-Token. JWT bleibt signiert/verifiziert wie bisher.
    access_token_expire_minutes: int = 60 * 24 * 30
    refresh_token_expire_days: int = 365

    # CMC Gateway
    cmc_tcp_host: str = "0.0.0.0"
    cmc_tcp_port: int = 15001
    # Öffentliche TCP-Adresse des Gateways aus Sicht der MASCHINE — bei
    # Railway der TCP-Proxy ("xyz.proxy.rlwy.net:43521"), lokal "IP:15001".
    # Rein informativ: wird im UI als Verbindungs-Anleitung angezeigt.
    public_tcp_address: str = ""
    cmc_tcp_role: str = "server"  # "server" or "client"

    # Event persistence: when False, incoming machine events are only kept in
    # the in-memory ring buffer for the live dashboard. order_states and
    # audit_logs receive no writes. Flip to True once long-term storage is
    # actually wanted.
    events_persist_enabled: bool = True
    # Aufbewahrungsdauer persistierter Aufträge/Logs in Tagen. Danach werden sie
    # vom Retention-Task automatisch gelöscht (Glocke warnt vorher).
    retention_days: int = 30

    # CORS
    cors_origins: list[str] = ["http://localhost:5173"]

    # ── Pulpo WMS integration ─────────────────────────────────────────
    # Aktiv sobald base_url + username + password gesetzt sind. Pulpo nutzt
    # OAuth2 Password-Flow: der Client holt sich per POST /api/v1/auth ein
    # Bearer-Token (siehe modules/pulpo/client.py) und cached es bis zum
    # Ablauf. Endpoints sind in client.py gegen die WMS-OpenAPI gemappt.
    pulpo_base_url: str = "https://eu.pulpo.co"
    pulpo_username: str = ""
    pulpo_password: str = ""
    # OAuth2-Scope laut WMS-Spec ("general" = Standard-User-Scope).
    pulpo_scope: str = "general"
    # Legacy/optional: statischer API-Key. Wird nicht mehr genutzt, seit der
    # Client auf OAuth2 umgestellt ist — bleibt nur für Abwärtskompatibilität.
    pulpo_api_key: str = ""
    # HMAC-Secret zur Webhook-Verifikation. Leerlassen für lokale Tests
    # (akzeptiert dann alles, loggt eine Warnung). Produktiv setzen.
    pulpo_webhook_secret: str = ""
    # Pick-Location-Code der unserer CMC1000-Maschine entspricht. Wird
    # bei jedem ENQ-Lookup zur Filterung der Pulpo-Queue gebraucht
    # (origin_location_code in GET /packing/orders).
    pulpo_pick_location: str = ""
    # Intervall (Sekunden) des Hintergrund-Tasks, der die CW-Listen aus der
    # Pulpo-Queue neu aufbaut (Self-Heal für verpasste Webhooks).
    cw_sync_interval_s: int = 8

    # ENQ-Antwort, Feld "Feeders": Maschine erwartet hier eine EINZELNE
    # Ziffer = welche Karton-/Pappe-Bahn benutzt werden soll (siehe HMI-
    # Dekodierung "Feeders=1 InvSel=0 Lab1Sel=…"). 0 = Maschine wählt
    # selbst, 1-8 = expliziter Feeder. Per Env überschreibbar, damit der
    # korrekte Wert vor Ort ohne Code-Deploy gefunden werden kann.
    cmc_enq_feeders: str = "1"

    # ----- weclapp ERP (Produkt-Stammdaten per EAN) ---------------------
    # Read-only Anbindung: liefert Name/SKU/Beschreibung/Bild zu einem EAN
    # für die Produktkarten in den CW-Listen. base_url ist die Instanz-URL
    # (z.B. https://firma.weclapp.com) — der /webapp/api/v1-Prefix wird vom
    # Client automatisch ergänzt. Auth via "AuthenticationToken"-Header.
    weclapp_base_url: str = ""
    weclapp_api_key: str = ""

    # ----- DHL Parcel DE Business Shipment (B2C) -----------------------
    # Produktion: https://api-eu.dhl.com/parcel/de/shipping/v2
    # Sandbox:    https://api-sandbox.dhl.com/parcel/de/shipping/v2
    # Auth-Pärchen:
    #   • dhl_api_key       → Header "dhl-api-key" (aus Entwicklerportal)
    #   • dhl_username/pass → HTTP Basic Auth (Geschäftskundenportal-Login)
    # billing_number = EKP + Verfahren + Teilnahme (z.B. "33333333330102"
    # für Sandbox-Tests, im Produktiv-Konto aus dem GK-Portal).
    dhl_base_url: str = "https://api-eu.dhl.com/parcel/de/shipping/v2"
    # API-Key + Secret (aus DHL-Entwicklerportal → Geschäftskundenversand-App).
    # `dhl_api_key` geht als Header "dhl-api-key" mit; `dhl_api_secret` ist
    # bei der aktuellen API ungenutzt — manche Tenants brauchen es aber als
    # 2. Auth-Faktor. Wir hinterlegen es, damit es später ohne Code-Änderung
    # eingebunden werden kann.
    dhl_api_key: str = ""
    dhl_api_secret: str = ""
    # Geschäftskundenportal-Login (geschaeftskunden.dhl.de) — wird per HTTP
    # Basic Auth gegen die Shipping-API gesendet.
    dhl_username: str = ""
    dhl_password: str = ""
    # Abrechnungsnummer (EKP + Verfahren + Teilnahme). National und INT
    # können sich unterscheiden — die richtige wird je nach Empfänger-Land
    # ausgewählt (s. service.py).
    dhl_billing_number: str = ""
    dhl_billing_number_international: str = ""
    # Profilname aus dem GK-Portal (steht direkt im Body, ersetzt das
    # bislang hartkodierte "STANDARD_GRUPPENPROFIL").
    dhl_profile: str = "STANDARD_GRUPPENPROFIL"
    # Standard-Produkt = "V01PAK" (DHL Paket National). V53WPAK Warenpost,
    # V54EPAK Europaket. Pro Sendung überschreibbar.
    dhl_default_product: str = "V01PAK"
    # Absender (eure Firma).
    dhl_sender_name: str = ""
    dhl_sender_street: str = ""
    dhl_sender_street_no: str = ""
    dhl_sender_zip: str = ""
    dhl_sender_city: str = ""
    dhl_sender_country: str = "DEU"
    # Fallback-Empfänger für Tests, solange wir die echte Lieferadresse
    # nicht aus Pulpo holen — damit das LAB1-Label-Smoke an einer echten
    # Maschine nicht an einer fehlenden Adresse stirbt. NICHT für Live!
    dhl_default_recipient_name: str = "Test Empfänger"
    dhl_default_recipient_street: str = "Sträßchensweg"
    dhl_default_recipient_street_no: str = "10"
    dhl_default_recipient_zip: str = "53113"
    dhl_default_recipient_city: str = "Bonn"
    dhl_default_recipient_country: str = "DEU"
    # Label-Format: ZPL2 für direkten Druck am thermischen Labeler der CW1000,
    # sonst "PDF" zum Anzeigen/Archivieren.
    dhl_label_format: str = "ZPL2"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
