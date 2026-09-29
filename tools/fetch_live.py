#!/usr/bin/env python3
"""Mirror the live fleet state from the GpsGate tracker into atara/data/live.json.

Run it on a schedule (cron / systemd timer) and the static atara pages will show the
same data the upstream tracking system shows.

    python3 atara/tools/fetch_live.py

Passwords are never stored in the repository. They are read from, in order:
  1. $ATARA_PASSWORDS   JSON object {"bus": "kamez", ...}
  2. atara/tools/accounts.json   {"bus": "kamez", ...}   (git-ignored)
  3. $ATARA_<USERNAME>  per-line environment variables, upper-cased
"""

import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))

from gpsgate import (  # noqa: E402
    GpsGate,
    GpsGateError,
    ONLINE_MAX_AGE_S,
    STALE_MAX_AGE_S,
    normalise_vehicle,
)

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "tools" / "lines.json"
ACCOUNTS = ROOT / "tools" / "accounts.json"
OUTPUT = ROOT / "data" / "live.json"
OUTPUT_JS = ROOT / "data" / "live.js"
PLACES = ROOT / "data" / "places.json"

TZ = timezone(timedelta(hours=1))  # Europe/Tirane, the tracker's own timezone

NOMINATIM = "https://nominatim.openstreetmap.org/reverse"
GRID_DEG = 0.004  # ~350 m cells, big enough that a bus idling at a stop stays put
MAX_STOPS = 8
MIN_BUSES_PER_STOP = 2


def load_passwords(usernames):
    if os.environ.get("ATARA_PASSWORDS"):
        return json.loads(os.environ["ATARA_PASSWORDS"])
    if ACCOUNTS.exists():
        return json.loads(ACCOUNTS.read_text())
    return {
        user: os.environ[f"ATARA_{user.upper()}"]
        for user in usernames
        if os.environ.get(f"ATARA_{user.upper()}")
    }


def cluster_stops(buses):
    """Derive the stop overlay from where the fleet actually is.

    The upstream tracker has no concept of stops, so the only honest source is the
    live positions themselves: grid the reporting buses and keep the cells that
    actually hold more than one vehicle.
    """
    cells = {}
    for bus in buses:
        if bus["status"] != "online" or bus["lat"] is None:
            continue
        key = (round(bus["lat"] / GRID_DEG), round(bus["lng"] / GRID_DEG))
        entry = cells.setdefault(key, {"lats": [], "lngs": [], "lines": set(), "buses": []})
        entry["lats"].append(bus["lat"])
        entry["lngs"].append(bus["lng"])
        entry["buses"].append(bus["name"])

    ranked = sorted(cells.values(), key=lambda e: (-len(e["buses"]), e["lats"][0]))
    stops = []
    for index, entry in enumerate(ranked[:MAX_STOPS], start=1):
        if len(entry["buses"]) < MIN_BUSES_PER_STOP:
            break
        stops.append(
            {
                "id": f"S{index}",
                "lat": round(sum(entry["lats"]) / len(entry["lats"]), 5),
                "lng": round(sum(entry["lngs"]) / len(entry["lngs"]), 5),
                "buses": len(entry["buses"]),
                "bus_names": sorted(entry["buses"]),
            }
        )
    return stops


def name_stops(stops, cache_path):
    """Attach street names via OSM Nominatim, cached so each grid cell is looked up once."""
    cache = json.loads(cache_path.read_text()) if cache_path.exists() else {}
    changed = False
    for stop in stops:
        key = f"{stop['lat']:.2f},{stop['lng']:.2f}"
        if key in cache:
            stop["name"] = cache[key]
            continue
        name = None
        try:
            response = requests.get(
                NOMINATIM,
                params={"format": "jsonv2", "lat": stop["lat"], "lon": stop["lng"], "zoom": 17},
                headers={"User-Agent": "ATARA/1.0 (bus tracker)"},
                timeout=20,
            )
            if response.status_code == 200:
                address = response.json().get("address") or {}
                road = address.get("road") or address.get("pedestrian") or address.get("footway")
                area = (
                    address.get("suburb")
                    or address.get("neighbourhood")
                    or address.get("city_district")
                    or address.get("city")
                )
                if road:
                    name = f"{road}, {area}" if area else road
                elif area:
                    name = area
        except Exception:
            pass
        name = name or f"GRID {stop['lat']:.4f}, {stop['lng']:.4f}"
        cache[key] = name
        stop["name"] = name
        changed = True
        time.sleep(1.1)  # Nominatim asks for at most 1 request per second
    if changed:
        cache_path.write_text(json.dumps(cache, indent=1) + "\n")


def line_stats(vehicles):
    online = [v for v in vehicles if v["status"] == "online"]
    moving = [v for v in online if v["speed_kmh"] > 3]
    points = [(v["lat"], v["lng"]) for v in online if v["lat"] is not None]
    speeds = [v["speed_kmh"] for v in online]
    return {
        "total": len(vehicles),
        "online": len(online),
        "stale": sum(1 for v in vehicles if v["status"] == "stale"),
        "offline": sum(1 for v in vehicles if v["status"] == "offline"),
        "moving": len(moving),
        "idle": len(online) - len(moving),
        "avg_speed_kmh": round(sum(speeds) / len(speeds), 1) if speeds else 0.0,
        "bbox": (
            {
                "min_lat": round(min(p[0] for p in points), 6),
                "max_lat": round(max(p[0] for p in points), 6),
                "min_lng": round(min(p[1] for p in points), 6),
                "max_lng": round(max(p[1] for p in points), 6),
            }
            if points
            else None
        ),
    }


def collect(online_max_age_s=ONLINE_MAX_AGE_S, stale_max_age_s=STALE_MAX_AGE_S):
    config = json.loads(CONFIG.read_text())
    passwords = load_passwords([line["username"] for line in config["lines"]])
    now_ms = int(time.time() * 1000)
    lines, failures = [], []

    for line in config["lines"]:
        password = passwords.get(line["username"])
        if not password:
            failures.append({"line": line["name"], "error": "no password configured"})
            continue

        client = GpsGate()
        try:
            client.login(line["username"], password)
            views = client.views()
            view = next((v for v in views if v["id"] == line["view_id"]), None) or (views[0] if views else None)
            if view is None:
                raise GpsGateError("account exposes no view")
            vehicles = [
                normalise_vehicle(record, now_ms, online_max_age_s, stale_max_age_s)
                for record in client.vehicles(view["id"])
            ]
            vehicles.sort(key=lambda v: (v["status"] != "online", v["age_s"] if v["age_s"] is not None else 1e9))
            lines.append(
                {
                    "id": line["id"],
                    "number": line["number"],
                    "name": line["name"],
                    "color": line["color"],
                    "view_id": view["id"],
                    "view_name": view["name"],
                    "tag_ids": view.get("tagIDs") or [],
                    "stats": line_stats(vehicles),
                    "buses": vehicles,
                }
            )
            print(f"  {line['name']:36s} {len(vehicles):3d} buses  {line_stats(vehicles)['online']:3d} online")
        except Exception as exc:  # keep going, one bad account must not break the mirror
            failures.append({"line": line["name"], "error": str(exc)})
            print(f"  {line['name']:36s} FAILED: {exc}", file=sys.stderr)
        finally:
            client.logout()

    all_buses = [bus for line in lines for bus in line["buses"]]
    stops = cluster_stops(all_buses)
    name_stops(stops, PLACES)
    return {
        "generated_at": datetime.fromtimestamp(now_ms / 1000, TZ).isoformat(),
        "generated_ms": now_ms,
        "source": config["source"],
        # The site re-ages buses against the wall clock between refreshes, so it has
        # to use the same thresholds the collector used, not its own defaults.
        "thresholds": {"online_s": online_max_age_s, "stale_s": stale_max_age_s},
        "totals": {
            "lines": len(lines),
            "buses": len(all_buses),
            "online": sum(1 for b in all_buses if b["status"] == "online"),
            "stale": sum(1 for b in all_buses if b["status"] == "stale"),
            "offline": sum(1 for b in all_buses if b["status"] == "offline"),
            "moving": sum(1 for b in all_buses if b["status"] == "online" and b["speed_kmh"] > 3),
        },
        "stops": stops,
        "lines": lines,
        "failures": failures,
    }


def run_once(online_max_age_s=ONLINE_MAX_AGE_S, stale_max_age_s=STALE_MAX_AGE_S):
    data = collect(online_max_age_s, stale_max_age_s)
    payload = json.dumps(data, indent=1)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(payload + "\n")
    # Mirror as a plain script so the pages also work when opened straight from disk.
    OUTPUT_JS.write_text("window.ATARA_LIVE = " + payload + ";\n")
    t = data["totals"]
    stamp = datetime.now(timezone(timedelta(hours=2))).strftime("%H:%M:%S")
    print(
        f"[{stamp}] {t['lines']} lines, {t['buses']} buses, "
        f"{t['online']} online ({t['moving']} moving), {t['stale']} stale, {t['offline']} offline"
        + (f" | {len(data['failures'])} line(s) failed" if data["failures"] else "")
    )
    return not data["failures"]


def main():
    args = sys.argv[1:]

    def flag(name, default):
        if name in args:
            i = args.index(name)
            if i + 1 < len(args) and args[i + 1].isdigit():
                return int(args[i + 1])
        return default

    # A snapshot is only as fresh as the process that wrote it. When we publish on a
    # 5-minute cron, "online" has to mean "seen in the last 5 minutes" or every bus
    # reads as stale on arrival.
    online_s = flag("--online-sec", ONLINE_MAX_AGE_S)
    stale_s = max(online_s + 1, flag("--stale-sec", STALE_MAX_AGE_S))

    interval = 30
    if "--loop" in args:
        i = args.index("--loop")
        if i + 1 < len(args) and args[i + 1].isdigit():
            interval = max(5, int(args[i + 1]))
        print(
            f"Mirroring the GpsGate tracker every {interval}s "
            f"(online<={online_s}s, stale<={stale_s}s). Ctrl-C to stop."
        )
        failures = 0
        try:
            while True:
                if not run_once(online_s, stale_s):
                    failures += 1
                time.sleep(interval)
        except KeyboardInterrupt:
            print(f"\nStopped after {failures} failed pull(s).")
        return 0

    print("Fetching live fleet from the GpsGate tracker...")
    return 0 if run_once(online_s, stale_s) else 1


if __name__ == "__main__":
    sys.exit(main())
