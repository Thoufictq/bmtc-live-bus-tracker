#!/usr/bin/env python3
"""Build a small, route-specific JSON extract from the public BMTC GTFS feed.

The upstream archive is large; this script downloads it in CI and commits only
the selected 378 corridor data. No live locations or ETAs are fabricated.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import re
import urllib.request
import zipfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

FEED_URL = "https://maps.reclaim.city/gtfs/bengaluru.zip"
SPECS = [
    {"label": "378", "short": "378", "suffix": None},
    {"label": "378-B", "short": "378B", "suffix": None},
    {"label": "378-C", "short": "378C", "suffix": None},
    {"label": "378-D", "short": "378D", "suffix": None},
    {"label": "378-E", "short": "378E", "suffix": None},
    {"label": "378-C UTH-ELC", "short": "378C", "suffix": "UTHELC"},
    {"label": "378-E D44G-ELC", "short": "378E", "suffix": "D44GELC"},
]

def norm(value: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", (value or "").upper())

def read_rows(zf: zipfile.ZipFile, filename: str):
    with zf.open(filename) as raw:
        text = io.TextIOWrapper(raw, encoding="utf-8-sig", newline="")
        yield from csv.DictReader(text)

def stop_matches(name: str, kind: str) -> bool:
    value = norm(name)
    if kind == "origin":
        # Either requested boarding point on Neeladri Road is an accepted start.
        return value in ("NEELADRINAGARA", "CONCORDAPARTMENTELECTRONICCITY")
    # The corridor ends at the Electronic City 378 terminal stop.
    return value == "ELECTRONICCITY378"

def route_matches(route: dict, spec: dict) -> bool:
    short = norm(route.get("route_short_name", ""))
    combined = norm(" ".join(route.get(k, "") for k in
                             ("route_short_name", "route_long_name", "route_desc")))
    if spec["suffix"]:
        return short.startswith(spec["short"]) and spec["suffix"] in combined
    # Keep the two extended variants separate from their base route chips.
    if short != spec["short"]:
        return False
    if spec["short"] == "378C" and "UTHELC" in combined:
        return False
    if spec["short"] == "378E" and "D44GELC" in combined:
        return False
    return True

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", help="Use a local GTFS zip instead of downloading")
    parser.add_argument("--output", default="data/route-data.json")
    args = parser.parse_args()

    archive = Path(args.input) if args.input else None
    if archive is None:
        request = urllib.request.Request(FEED_URL, headers={"User-Agent": "BMTC-Live-Tracker/1.0"})
        with urllib.request.urlopen(request, timeout=180) as response:
            import tempfile
            with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tmp:
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    tmp.write(chunk)
                archive = Path(tmp.name)

    with zipfile.ZipFile(archive) as zf:
        stops = {}
        origin_stops, destination_stops = set(), set()
        for row in read_rows(zf, "stops.txt"):
            item = {
                "stop_id": row.get("stop_id", ""),
                "name": row.get("stop_name", ""),
                "lat": float(row["stop_lat"]) if row.get("stop_lat") else None,
                "lon": float(row["stop_lon"]) if row.get("stop_lon") else None,
            }
            stops[item["stop_id"]] = item
            if stop_matches(item["name"], "origin"):
                origin_stops.add(item["stop_id"])
            if stop_matches(item["name"], "destination"):
                destination_stops.add(item["stop_id"])

        all_routes = list(read_rows(zf, "routes.txt"))
        route_results = []
        selected_route_ids = set()
        route_to_label = {}
        for spec in SPECS:
            matches = [r for r in all_routes if route_matches(r, spec)]
            ids = [r.get("route_id", "") for r in matches if r.get("route_id")]
            selected_route_ids.update(ids)
            for rid in ids:
                route_to_label[rid] = spec["label"]
            route_results.append({
                "label": spec["label"],
                "route_ids": ids,
                "route_names": [{
                    "route_id": r.get("route_id", ""),
                    "short_name": r.get("route_short_name", ""),
                    "long_name": r.get("route_long_name", ""),
                    "description": r.get("route_desc", ""),
                } for r in matches],
                "trip_count": 0,
                "directions": [],
            })

        trip_rows = {}
        for row in read_rows(zf, "trips.txt"):
            if row.get("route_id") in selected_route_ids:
                trip_rows[row.get("trip_id", "")] = row

        times_by_trip = defaultdict(list)
        for row in read_rows(zf, "stop_times.txt"):
            tid = row.get("trip_id", "")
            if tid in trip_rows:
                times_by_trip[tid].append(row)

        # Keep only trips that actually serve both requested corridor stops.
        matched_by_route = defaultdict(lambda: {"outbound": [], "inbound": []})
        selected_shapes = set()
        for tid, rows in times_by_trip.items():
            rows.sort(key=lambda x: int(x.get("stop_sequence") or 0))
            origin_indexes = [i for i, x in enumerate(rows) if x.get("stop_id") in origin_stops]
            destination_indexes = [i for i, x in enumerate(rows) if x.get("stop_id") in destination_stops]
            if not origin_indexes or not destination_indexes:
                continue
            trip = trip_rows[tid]
            rid = trip.get("route_id", "")
            for oi in origin_indexes:
                for di in destination_indexes:
                    if oi == di:
                        continue
                    direction = "outbound" if oi < di else "inbound"
                    start_row, end_row = (rows[oi], rows[di]) if oi < di else (rows[di], rows[oi])
                    # A trip can loop past multiple matching platforms; record one ordered pair.
                    shape_id = trip.get("shape_id", "")
                    if shape_id:
                        selected_shapes.add(shape_id)
                    matched_by_route[rid][direction].append({
                        "trip_id": tid,
                        "service_id": trip.get("service_id", ""),
                        "direction_id": trip.get("direction_id", ""),
                        "headsign": trip.get("trip_headsign", ""),
                        "shape_id": shape_id,
                        "from_stop_id": start_row.get("stop_id", ""),
                        "to_stop_id": end_row.get("stop_id", ""),
                        "departure": start_row.get("departure_time") or start_row.get("arrival_time", ""),
                        "arrival": end_row.get("arrival_time") or end_row.get("departure_time", ""),
                        "sequence": rows,
                    })
                    break

        shape_points = defaultdict(list)
        if selected_shapes:
            for row in read_rows(zf, "shapes.txt"):
                sid = row.get("shape_id", "")
                if sid in selected_shapes:
                    shape_points[sid].append({
                        "lat": float(row["shape_pt_lat"]),
                        "lon": float(row["shape_pt_lon"]),
                        "sequence": int(row.get("shape_pt_sequence") or 0),
                    })
        for sid in shape_points:
            shape_points[sid].sort(key=lambda p: p["sequence"])

        for result in route_results:
            ids = result["route_ids"]
            for direction in ("outbound", "inbound"):
                candidates = []
                for rid in ids:
                    candidates.extend(matched_by_route[rid][direction])
                candidates.sort(key=lambda x: (x["departure"], x["trip_id"]))
                if not candidates:
                    continue
                sample = candidates[0]
                stop_sequence = []
                seen = set()
                for row in sample["sequence"]:
                    sid = row.get("stop_id", "")
                    if sid in seen or sid not in stops:
                        continue
                    seen.add(sid)
                    stop = dict(stops[sid])
                    stop["sequence"] = int(row.get("stop_sequence") or 0)
                    stop["arrival_time"] = row.get("arrival_time", "")
                    stop["departure_time"] = row.get("departure_time", "")
                    stop_sequence.append(stop)
                result["directions"].append({
                    "direction": direction,
                    "sample_trip_id": sample["trip_id"],
                    "shape_id": sample["shape_id"],
                    "shape": [{"lat": p["lat"], "lon": p["lon"]}
                              for p in shape_points.get(sample["shape_id"], [])],
                    "stops": stop_sequence,
                    "trips": [{
                        k: t[k] for k in ("trip_id", "service_id", "direction_id",
                                          "headsign", "shape_id", "departure", "arrival")
                    } for t in candidates],
                })
                result["trip_count"] += len(candidates)

    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": FEED_URL,
        "timezone": "Asia/Kolkata",
        "stops_found": {
            "origin": [stops[s] for s in sorted(origin_stops)],
            "destination": [stops[s] for s in sorted(destination_stops)],
        },
        "routes": route_results,
        "notes": [
            "A route is corridor-verified only when at least one trip serves both target stops.",
            "GTFS stop times are timetable data, not live ETA predictions.",
            "A route without a matched trip is not proof that the service is discontinued.",
        ],
    }
    target = Path(args.output)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(json.dumps({
        "output": str(target),
        "origin_stops": len(origin_stops),
        "destination_stops": len(destination_stops),
        "routes": [{
            "label": r["label"], "route_ids": len(r["route_ids"]),
            "matched_trips": r["trip_count"],
            "directions": [d["direction"] for d in r["directions"]],
        } for r in route_results],
    }, indent=2))

if __name__ == "__main__":
    main()
