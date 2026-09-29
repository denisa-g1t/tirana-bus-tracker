"""Minimal client for the GpsGate Server JSON-RPC API used by the ATARA tracker.

The upstream tracker is a GpsGate Server instance. It exposes a JSON-RPC 2.0 style
API over plain HTTP; a session is opened with Directory.Login and identified by the
FransonSessionID cookie, then every other call is made against /comGpsGate/rpc/<ns>.
"""

import json
import re

import requests

HOST = "https://bus.atd-grp.com"
APP_ID = 14
VERSION = "4.0.0.5777"

# GpsGate serialises dates as `new Date(<ms>)`, which is not valid JSON.
_DATE_RE = re.compile(r"new Date\((-?\d+)\)")

# recordData keys of the Teltonika fields this project reads, see GetMappedFields.
FIELD_VOLTAGE = 9
FIELD_SPEED = 34
FIELD_GSM = 39
FIELD_IGNITION = 44
FIELD_SATELLITES = 52
FIELD_KOFANO = 2418

ONLINE_MAX_AGE_S = 120
STALE_MAX_AGE_S = 900


class GpsGateError(RuntimeError):
    pass


def _loads(text):
    return json.loads(_DATE_RE.sub(r"\1", text))


class GpsGate:
    def __init__(self, host=HOST, app_id=APP_ID, timeout=40):
        self.host = host.rstrip("/")
        self.app_id = app_id
        self.timeout = timeout
        self._id = 0
        self.session = requests.Session()
        self.session.headers.update(
            {
                "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) ATARA/1.0",
                "Accept": "application/json, text/javascript, */*; q=0.01",
                "Content-Type": "application/json; charset=UTF-8",
                "X-Requested-With": "XMLHttpRequest",
                "Referer": f"{self.host}/m/index.html",
            }
        )
        self.user = None
        self.app_name = None

    def _rpc(self, namespace, method, params, url=None):
        self._id += 1
        payload = {"id": self._id, "method": method, "params": dict(params, appId=self.app_id)}
        if url is None:
            url = f"{self.host}/comGpsGate/rpc/{namespace}?_METHOD={method}&v={VERSION}"
        response = self.session.post(url, data=json.dumps(payload), timeout=self.timeout)
        if response.status_code != 200:
            raise GpsGateError(f"{namespace}.{method} -> HTTP {response.status_code}")
        body = _loads(response.text)
        if "error" in body:
            raise GpsGateError(f"{namespace}.{method} -> {body['error'].get('message')}")
        return body.get("result")

    def login(self, username, password):
        # Login and Logout live on the plain Directory handler, not on /comGpsGate/rpc.
        result = self._rpc(
            "Directory",
            "Login",
            {"strUserName": username, "strPassword": password, "bStaySignedIn": True},
            url=f"{self.host}/Services/Directory.ashx?_METHOD=Login&v={VERSION}",
        )
        self.user = username
        apps = (result or {}).get("applications") or []
        for app in apps:
            if app.get("iD") == self.app_id:
                self.app_name = app.get("name") or app.get("description")
                break
        return result

    def logout(self):
        try:
            self._rpc(
                "Directory",
                "Logout",
                {},
                url=f"{self.host}/Services/Directory.ashx?_METHOD=Logout&v={VERSION}",
            )
        except GpsGateError:
            pass
        self.session.close()

    def views(self):
        return (self._rpc("View", "GetViews", {}) or {}).get("views") or []

    def vehicles(self, view_id):
        result = self._rpc("Directory", "GetLatestUserDataByView", {"iViewID": view_id}) or {}
        return result.get("result") or []

    def mapped_fields(self):
        result = self._rpc("Directory", "GetMappedFields", {}) or {}
        return result.get("result") or []


def _field(record, key):
    entry = (record.get("recordData") or {}).get(str(key))
    return entry.get("value") if isinstance(entry, dict) else None


def _status(age_s, online_max_age_s=ONLINE_MAX_AGE_S, stale_max_age_s=STALE_MAX_AGE_S):
    if age_s <= online_max_age_s:
        return "online"
    if age_s <= stale_max_age_s:
        return "stale"
    return "offline"


def normalise_vehicle(record, now_ms, online_max_age_s=ONLINE_MAX_AGE_S, stale_max_age_s=STALE_MAX_AGE_S):
    track = record.get("trackPoint") or {}
    pos = track.get("pos") or {}
    vel = track.get("vel") or {}
    speed_ms = _field(record, FIELD_SPEED)
    if speed_ms is None:
        speed_ms = vel.get("speed") or 0.0
    last_seen_ms = track.get("utc") or record.get("deviceActivity") or 0
    age_s = max(0, int((now_ms - last_seen_ms) / 1000)) if last_seen_ms else None
    device = (record.get("devices") or [{}])[0]

    return {
        "id": record.get("id"),
        "name": record.get("name") or str(record.get("id")),
        "driver": record.get("username") or None,
        "lat": pos.get("lat"),
        "lng": pos.get("lng"),
        "alt": pos.get("alt"),
        "speed_kmh": round((speed_ms or 0.0) * 3.6, 1),
        "speed_ms": round(speed_ms or 0.0, 2),
        "heading": vel.get("heading"),
        "ignition": _field(record, FIELD_IGNITION),
        "satellites": _field(record, FIELD_SATELLITES),
        "gsm": _field(record, FIELD_GSM),
        "voltage": _field(record, FIELD_VOLTAGE),
        "kofano": _field(record, FIELD_KOFANO),
        "protocol": record.get("lastTransportProtocol"),
        "device": device.get("name"),
        "last_seen_ms": last_seen_ms or None,
        "age_s": age_s,
        "status": _status(age_s, online_max_age_s, stale_max_age_s) if age_s is not None else "offline",
    }
