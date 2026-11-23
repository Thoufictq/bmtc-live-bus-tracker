# BMTC Live Bus Tracker

A mobile-friendly live BMTC vehicle tracker for the corridor:

- **Start:** Neeladri Nagara or Concord Apartment Electronic City
- **Destination:** Electronic City 378
- **Requested services:** 378, 378-B, 378-C, 378-D, 378-E, 378-C UTH-ELC, 378-E D44G-ELC

## Current build

This first implementation follows the lightweight HTML/CSS/JavaScript structure of the [Boost reference app](https://github.com/gattarakesh-star/Boost).

- Live BMTC GTFS-Realtime vehicle positions.
- Auto-refresh every 3 minutes, aligned with the BMTC source's approximate update cadence.
- Route-code filters for the seven requested variants.
- Map markers and vehicle details when GPS coordinates are present.
- Feed freshness and stale-data messaging.
- Responsive dark interface.

## Data source

- Vehicle positions: https://maps.reclaim.city/bengaluru/rt/vehicle_positions.json
- Feed status: https://maps.reclaim.city/bengaluru/rt/status.json
- BMTC static GTFS catalog and documentation: https://github.com/reclaimchennai/India_GTFS and https://api.reclaim.city/docs/

The feed is public GTFS-Realtime data. The source documentation says Bengaluru vehicle positions refresh roughly every three minutes. The app polls every three minutes; polling more often would not make the underlying GPS update faster.

## GTFS validation

The generated route extract now matches both corridor endpoints for all seven requested services. The latest successful build (23 November 2026) reports:

| Service | Matched timetable trips |
|---|---:|
| 378 | 387 |
| 378-B | 9 |
| 378-C | 17 |
| 378-D | 12 |
| 378-E | 13 |
| 378-C UTH-ELC | 38 |
| 378-E D44G-ELC | 5 |

Each service has route data for both directions, including stop sequences, stop coordinates, and route shapes. The destination is represented in the GTFS feed as **Electronic City**; the passenger-facing destination remains **Electronic City 378**.

These counts are static timetable trips, not buses currently on the road. The live map shows a bus marker only when the real-time feed supplies a matching trip and GPS coordinates. A missing GPS marker does not mean a bus is not operating. The app does not fabricate vehicle positions or live ETAs.

## Run locally

Open `index.html` in a browser, or serve the folder with any static web server. The live feed endpoint supports browser CORS according to its public API documentation.

## Files

- `index.html` — app layout
- `styles.css` — responsive visual design
- `app.js` — live feed polling, filtering, freshness checks, and map markers

## Attribution

Live transit data: [Reclaim.city](https://maps.reclaim.city/bengaluru/). Map tiles: [OpenStreetMap](https://www.openstreetmap.org/copyright).


## GTFS data and licence

The route extract is generated from the Bengaluru BMTC GTFS feed published by [Reclaim.city](https://github.com/reclaimchennai/India_GTFS) and sourced from [Vonter/bmtc-gtfs](https://github.com/Vonter/bmtc-gtfs). The source dataset is made available under the Open Database License (ODbL-1.0); derived route data in this project is attributed accordingly. See the source repository for the full licence and its share-alike requirements. The source warns that some timetable and stop timings may be inaccurate, so these values are displayed as scheduled data, not guaranteed or live arrival predictions.

To generate the first route extract, open **Actions → Refresh BMTC route data → Run workflow** in this repository. The workflow also refreshes the extract daily. It commits only the filtered corridor JSON, not the full GTFS archive.
