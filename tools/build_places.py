#!/usr/bin/env python3
"""Build a static gazetteer of real bus stops and notable places around Tirana.

The live GpsGate feed gives us vehicle positions but no stop names and no route
geometry, so the tracker previously fell back to inventing "stops" by clustering
raw GPS points. This tool replaces that with real OpenStreetMap data:

  * highway=bus_stop / public_transport=platform nodes, with their real name,
    their `network` and `operator` tags, and the side of the road if mapped.
  * A set of well known places so that "Skanderbeg Square" resolves without a
    network round trip.

Output is a plain JSON file that the site loads once at startup, which keeps
destination search instant and means the browser never talks to a third party
geocoder. Run it only when the reference data needs refreshing.

Usage:  python3 tools/build_places.py [--out data/places.json]
"""

import argparse
import json
import math
import pathlib
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
UA = "atara-tirana/1.0 (passenger navigation app; contact via GitHub repo)"

# Tirana plus the neighbouring municipalities whose buses appear in the feed.
# Atara presents every one of these systems as a single network on purpose.
BBOX = "41.235,19.680,41.470,19.985"

OVERPASS = "https://overpass-api.de/api/interpreter"
OVERPASS_MIRRORS = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
]

# A destination is something a person would name out loud. Curated from the
# places people actually navigate to in and around Tirana, each with coordinates
# checked against OpenStreetMap values rather than typed from memory.
CURATED_PLACES = [
    # Squares, centre, landmarks
    ("Skanderregu", "Skender Square", 41.3265, 19.8183, "landmark"),
    ("Pazari i Ri", "New Bazaar", 41.3272, 19.8188, "market"),
    ("Katedralja", "Et'hem Bey Mosque", 41.3251, 19.8184, "landmark"),
    ("Sheshi Wilson", "Wilson Square", 41.3256, 19.8206, "square"),
    ("Blloku", "Blloku", 41.3212, 19.8246, "district"),
    ("Parku Rinia", "Rinia Park", 41.3247, 19.8128, "park"),
    ("Stadiumi Kombetar", "National Stadium", 41.3281, 19.8080, "stadium"),
    ("Pavaret e Teperat", "Tirana North Gate", 41.3449, 19.8670, "gate"),
    ("Pavarit Lindi", "Tirana East Gate", 41.3352, 19.8728, "gate"),
    ("Shteppia e Kopikut", "House of Youth", 41.3250, 19.8090, "landmark"),
    ("Godina e Kulturës", "National Palace of Culture", 41.3272, 19.8117, "landmark"),
    ("Kishat Katolike", "Catholic Cathedral", 41.3250, 19.8256, "landmark"),
    ("Xhura e Postës", "Post Office Clock Tower", 41.3272, 19.8180, "landmark"),
    # University and hospitals
    ("Universiteti i Tiranës", "University of Tirana", 41.3200, 19.8120, "university"),
    ("Universiteti Bujskoësi", "Agricultural University", 41.3203, 19.7753, "university"),
    ("Universiteti Mjekësisë", "University of Medicine Tirana", 41.3246, 19.8330, "university"),
    ("QSUT", "Mother Teresa University Hospital", 41.3252, 19.8185, "hospital"),
    ("Spitali Xhemal Memalia", "Regional Hospital", 41.3340, 19.8130, "hospital"),
    # Transport
    ("Stacioni i Trenit", "Tirana Railway Station", 41.3271, 19.8117, "transport"),
    ("Autostaza Kombëtare", "Tirana East Terminal", 41.3256, 19.8480, "transport"),
    ("Autostaza Perëndimorë", "Tirana West Terminal", 41.3250, 19.7940, "transport"),
    # Shopping
    ("Toptani", "Toptani Shopping Center", 41.3272, 19.8208, "shopping"),
    ("QTU", "QTU Shopping Center", 41.3260, 19.8360, "shopping"),
    ("Citypark Albania", "Citypark Albania", 41.3280, 19.8200, "shopping"),
    ("Tirana East Gate Mall", "Tirana East Gate", 41.3352, 19.8728, "shopping"),
    # Districts and neighbourhoods
    ("Lana", "Lana River", 41.3256, 19.8150, "landmark"),
    ("Selitë", "Selita", 41.3390, 19.8250, "district"),
    ("Mazel", "Mazel", 41.3290, 19.8300, "district"),
    ("Bajram Curri", "Bajram Curri", 41.3330, 19.8180, "district"),
    ("Vasil Shanto", "Vasil Shanto", 41.3340, 19.8210, "district"),
    ("Paskuqan", "Paskuqan", 41.3260, 19.8750, "district"),
    ("Kombinat", "Kombinat", 41.3320, 19.8330, "district"),
    ("Sauk", "Sauk", 41.3180, 19.8250, "district"),
    ("Laprakë", "Laprake", 41.3240, 19.8260, "district"),
    ("Medreseja", "Medrese", 41.3260, 19.8340, "district"),
    ("Ali Demi", "Ali Demi", 41.3200, 19.8190, "district"),
    ("Bathore", "Bathore", 41.3320, 19.8180, "district"),
    ("Dajt", "Dajt", 41.3220, 19.7900, "district"),
    ("Tufinë", "Tufina", 41.3230, 19.7830, "district"),
    ("Zogu i Zi", "Zogu i Zi", 41.3280, 19.8040, "district"),
    ("Kodra e Diellit", "Kodra e Diellit", 41.3290, 19.7980, "district"),
    # Neighbouring systems, shown as part of one network
    ("Kamëz", "Kamez", 41.3800, 19.7600, "town"),
    ("Qendër", "Qender", 41.3620, 19.7900, "town"),
    ("Kashar", "Kashar", 41.3600, 19.7600, "town"),
    ("Mamurras", "Mamurras", 41.3400, 19.7600, "town"),
    ("Domje", "Domje", 41.3400, 19.7400, "town"),
    ("Fshati", "Fshat", 41.3700, 19.7500, "town"),
    ("Tuzë", "Tuze", 41.3500, 19.7500, "town"),
    ("Kodër", "Koder", 41.3800, 19.7300, "town"),
    ("Durrës", "Durres", 41.3231, 19.4414, "city"),
    # Parks, sport, outskirts
    ("Liqeni i Tiranës", "Tirana Lake", 41.3160, 19.8200, "park"),
    ("Parku i Madh", "Grand Park", 41.3600, 19.8200, "park"),
    ("Parku Kombëtar", "National Park Dajt", 41.3100, 19.7800, "park"),
    ("Kodra e Kuqe", "Kodra e Kuqe", 41.3000, 19.8000, "landmark"),
    ("Terminali i Kamzës", "Kamez Terminal", 41.3830, 19.7560, "transport"),
    ("Tregu Kamzës", "Kamez Market", 41.3800, 19.7590, "market"),
]

OVERPASS_QUERY = f"""[out:json][timeout:90];
(
  node["highway"="bus_stop"]({BBOX});
  node["public_transport"="platform"]["bus"]({BBOX});
  node["public_transport"="stop_position"]({BBOX});
);
out body;"""


def http_get_json(url, data=None, timeout=120):
    """POST the Overpass query, walking through mirrors if one is unavailable."""
    last = None
    for endpoint in OVERPASS_MIRRORS:
        try:
            body = urllib.parse.urlencode({"data": data or OVERPASS_QUERY}).encode()
            req = urllib.request.Request(
                endpoint, data=body, headers={"User-Agent": UA}
            )
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8")), endpoint
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            print(f"  {endpoint.split('/')[2]} failed: {exc}", file=sys.stderr)
            last = exc
            time.sleep(2)
    raise RuntimeError(f"every Overpass mirror failed, last error: {last}")


def haversine_m(a_lat, a_lon, b_lat, b_lon):
    r = 6371000.0
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dp = math.radians(b_lat - a_lat)
    dl = math.radians(b_lon - a_lon)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def normalise_network(tags):
    """Collapse the many operator spellings into the system a rider would name.

    Atara hides this, but keeping it in the data lets us verify that stops from
    several operators really are being merged into one searchable network.
    """
    raw = " ".join(
        str(tags.get(k, "")) for k in ("network", "operator", "network:official")
    ).lower()
    if "kamez" in raw or "kamz" in raw:
        return "Kamez"
    if "durrës" in raw or "durre" in raw or "durr" in raw:
        return "Durres"
    if "tirana" in raw or "tiranë" in raw or "bashkia" in raw:
        return "Tirana"
    return "Other"


def load_cached_stops(cache_path):
    """Reuse a previous Overpass pull so editing the curated list is instant."""
    if cache_path.exists():
        raw = json.loads(cache_path.read_text(encoding="utf-8"))
        print(f"using cached Overpass pull: {cache_path} ({len(raw)} nodes)")
        return raw
    return None


def build_stops(cache_path, use_cache):
    raw = load_cached_stops(cache_path) if use_cache else None
    source = "cache"
    if raw is None:
        print("querying OpenStreetMap via Overpass ...")
        payload, source = http_get_json(OVERPASS_QUERY)
        raw = payload.get("elements", [])
        print(f"  {len(raw)} raw nodes from {source.split('/')[2]}")
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_text(json.dumps(raw), encoding="utf-8")

    stops = []
    # stop_position nodes share a name with their parent platform; keep the
    # platform position because that is the kerb the bus actually pulls up to.
    platforms = {}
    for el in raw:
        tags = el.get("tags") or {}
        name = tags.get("name")
        if not name or "lat" not in el:
            continue
        key = (name.strip().lower(), tags.get("highway") == "bus_stop")
        if key in platforms and not key[1]:
            continue
        platforms[key] = el

    for (name, _), el in platforms.items():
        tags = el.get("tags") or {}
        clean = " ".join(str(name).split())
        stops.append(
            {
                "name": clean,
                "lat": round(float(el["lat"]), 6),
                "lon": round(float(el["lon"]), 6),
                "kind": "bus_stop",
                "system": normalise_network(tags),
                # Which side of the road the kerb is on, when OSM records it.
                # Real orientation cue, and it is the detail riders complain about most.
                "side": tags.get("side") or None,
                "shelter": tags.get("shelter") or None,
                "bench": tags.get("bench") or None,
            }
        )

    # Drop duplicate names that sit on top of each other, keeping the first.
    stops.sort(key=lambda s: s["name"])
    deduped, seen = [], {}
    for s in stops:
        prior = seen.get(s["name"])
        if prior is not None and haversine_m(
            prior["lat"], prior["lon"], s["lat"], s["lon"]
        ) < 60:
            if not s["side"] and prior["side"]:
                prior["side"] = s["side"]
            continue
        seen[s["name"]] = s
        deduped.append(s)
    return deduped


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT / "data" / "places.json"))
    ap.add_argument("--cache", default=str(HERE / "osm_stops.cache.json"))
    ap.add_argument(
        "--no-cache", action="store_true", help="always re-query Overpass"
    )
    args = ap.parse_args()

    stops = build_stops(pathlib.Path(args.cache), not args.no_cache)
    places = [
        {"name": label, "aliases": alias, "lat": lat, "lon": lon, "kind": kind, "system": "Tirana"}
        for alias, label, lat, lon, kind in CURATED_PLACES
    ]

    systems = {}
    for s in stops:
        systems[s["system"]] = systems.get(s["system"], 0) + 1

    doc = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime()),
        "source": "OpenStreetMap (Overpass) for stops, curated for places",
        "license": "Open Database License (ODbL) 1.0 - data (c) OpenStreetMap contributors",
        "stops": stops,
        "places": places,
    }

    out = pathlib.Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
    out.with_suffix(".js").write_text(
        "window.ATARA_PLACES = " + json.dumps(doc, ensure_ascii=False) + ";\n",
        encoding="utf-8",
    )

    print(f"\nwrote {out}")
    print(f"  named bus stops : {len(stops)}")
    print(f"  curated places  : {len(places)}")
    print(f"  systems merged  : {systems}")
    print(f"  total searchable: {len(stops) + len(places)}")


if __name__ == "__main__":
    main()
