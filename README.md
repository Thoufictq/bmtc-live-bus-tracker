# BMTC Live Bus Tracker

A mobile-friendly live BMTC vehicle tracker for the corridor:

- **Start:** Infosys Foundation Metro Station, Electronic City Phase 1
- **Destination:** Toguru Cross
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

## Important validation note

The requested 378 route variants, their exact stop sequences, direction-specific service patterns, and stop coordinates still need to be matched against the current BMTC GTFS feed. Until that validation is complete, the map uses an approximate Electronic City viewport, route filters match route/trip identifiers only when those identifiers contain the requested code, and the app does **not** invent stop ETAs or a route polyline.

A missing GPS marker does not mean a bus is not operating. Some vehicles may not have a current GPS fix or a matched trip.

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
