(() => {
  "use strict";
  const FEED_URL = "https://maps.reclaim.city/bengaluru/rt/vehicle_positions.json";
  const STATUS_URL = "https://maps.reclaim.city/bengaluru/rt/status.json";
  const POLL_MS = 180000;
  const ROUTES = ["378","378-B","378-C","378-D","378-E","378-C UTH-ELC","378-E D44G-ELC"];
  const $ = (id) => document.getElementById(id);
  let selectedRoute = "all";
  let vehicles = [];
  let map, markers;

  // Approximate corridor viewport only; verified stop coordinates and route shape
  // will replace this once the exact 378 GTFS stop sequence is confirmed.
  const corridorBounds = [[12.78,77.61],[12.89,77.72]];
  function initMap() {
    if (!window.L) {
      $("map").innerHTML = '<div class="loading-card">Map library could not be loaded. Live bus cards can still work.</div>';
      return;
    }
    map = L.map("map", {scrollWheelZoom:false}).setView([12.835,77.665], 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
    markers = L.layerGroup().addTo(map);
    map.fitBounds(corridorBounds);
  }

  function norm(value) {
    return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  }
  function vehicleRoute(v) {
    const trip = v.trip || {};
    return String(trip.routeId || trip.tripId || "");
  }
  function routeMatches(v, route) {
    if (route === "all") return true;
    const haystack = norm([vehicleRoute(v), v.vehicle?.label, v.vehicle?.licensePlate].join(" "));
    const needle = norm(route);
    // Match a complete route token or the route code embedded in a trip/route id.
    return haystack.includes(needle);
  }
  function inCorridor(v) {
    const p = v.position || {};
    return Number.isFinite(p.latitude) && Number.isFinite(p.longitude) &&
      p.latitude >= corridorBounds[0][0] && p.latitude <= corridorBounds[1][0] &&
      p.longitude >= corridorBounds[0][1] && p.longitude <= corridorBounds[1][1];
  }
  function ageSeconds(v) {
    const stamp = Number(v.timestamp || v.position?.timestamp || 0);
    return stamp ? Math.max(0, Math.floor(Date.now()/1000 - stamp)) : null;
  }
  function ageLabel(seconds) {
    if (seconds == null) return "GPS time unavailable";
    if (seconds < 90) return "Updated " + seconds + " sec ago";
    return "Updated " + Math.round(seconds/60) + " min ago";
  }
  function routeLabel(v) {
    const trip = v.trip || {};
    return trip.routeId || trip.tripId || "Route not matched";
  }
  function displayVehicles() {
    const visible = vehicles.filter(inCorridor).filter(v => routeMatches(v, selectedRoute));
    $("map-count").textContent = visible.length + " vehicle" + (visible.length === 1 ? "" : "s");
    $("bus-list").innerHTML = visible.length ? visible.map(v => {
      const p = v.position || {};
      const label = v.vehicle?.label || v.vehicle?.licensePlate || "BMTC vehicle";
      const speed = Number.isFinite(p.speed) ? Math.round(p.speed * 3.6) + " km/h" : "Speed unavailable";
      const bearing = Number.isFinite(p.bearing) ? Math.round(p.bearing) + "°" : "";
      const age = ageSeconds(v);
      const old = age != null && age > 300;
      return '<article class="bus-card"><div><div class="bus-title">' + escapeHtml(routeLabel(v)) +
        '<span class="bus-badge">' + (v.trip?.tripId ? "TRIP MATCHED" : "GPS ONLY") + '</span></div>' +
        '<div class="bus-sub">' + escapeHtml(label) + '</div></div>' +
        '<div class="bus-eta"><strong>' + (old ? "STALE" : "LIVE") + '</strong><span>GPS status</span></div>' +
        '<div class="bus-meta">' + speed + (bearing ? " · " + bearing : "") + ' · ' + ageLabel(age) + '</div>' +
        '<div class="bus-meta">' + p.latitude.toFixed(5) + ', ' + p.longitude.toFixed(5) + '</div></article>';
    }).join("") : '<div class="empty-card">' +
      (selectedRoute === "all" ? "No BMTC vehicle positions are currently available inside this map area." :
      "No live vehicle in this area matched " + escapeHtml(selectedRoute) + ". This does not confirm that the service is not operating.") +
      '</div>';
    markers.clearLayers();
    visible.forEach(v => {
      const p = v.position || {};
      const label = v.vehicle?.label || v.vehicle?.licensePlate || routeLabel(v);
      const marker = L.marker([p.latitude,p.longitude], {
        icon: L.divIcon({className:"",html:'<span class="bus-pin">🚌 '+escapeHtml(routeLabel(v))+'</span>',iconSize:null,iconAnchor:[18,12]})
      });
      marker.bindPopup('<strong>'+escapeHtml(routeLabel(v))+'</strong><br>'+escapeHtml(label)+'<br>'+ageLabel(ageSeconds(v)));
      marker.addTo(markers);
    });
  }
  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }
  async function refresh() {
    const status = $("feed-status");
    $("feed-message").textContent = "Refreshing BMTC GPS positions…";
    status.className = "feed-status";
    try {
      const [feedResponse, statusResponse] = await Promise.all([
        fetch(FEED_URL, {cache:"no-store"}),
        fetch(STATUS_URL, {cache:"no-store"}).catch(() => null)
      ]);
      if (!feedResponse.ok) throw new Error("Live feed returned HTTP " + feedResponse.status);
      const feed = await feedResponse.json();
      const statusData = statusResponse?.ok ? await statusResponse.json() : null;
      vehicles = (feed.entity || []).map(e => e.vehicle).filter(Boolean);
      const feedTime = Number(feed.header?.timestamp || statusData?.feed_time || 0);
      const feedAge = feedTime ? Math.max(0, Math.floor(Date.now()/1000 - feedTime)) : null;
      if (feedAge != null && feedAge > 600) {
        status.className = "feed-status stale";
        $("feed-message").textContent = "Feed is stale · last position " + Math.round(feedAge/60) + " min ago";
      } else {
        $("feed-message").textContent = "Feed connected · " + vehicles.length + " vehicles received · refreshed " + new Date().toLocaleTimeString() + " · source updates about every 3 min";
      }
      displayVehicles();
    } catch (error) {
      status.className = "feed-status error";
      $("feed-message").textContent = "Live feed unavailable · " + error.message;
      $("bus-list").innerHTML = '<div class="empty-card">Could not load live BMTC GPS data. Check your connection and try again. No vehicle positions or ETAs are being fabricated.</div>';
    }
  }

  $("route-filters").addEventListener("click", event => {
    const button = event.target.closest("button[data-route]");
    if (!button) return;
    selectedRoute = button.dataset.route;
    document.querySelectorAll(".route-chip").forEach(b => b.classList.toggle("active", b === button));
    displayVehicles();
  });
  $("refresh").addEventListener("click", refresh);
  $("direction").addEventListener("change", () => {
    // Direction control is ready for the validated outbound/inbound trip patterns.
    $("feed-message").textContent = "Direction selected. Route-specific direction matching will activate after GTFS stop-sequence validation.";
  });
  initMap();
  refresh();
  window.setInterval(refresh, POLL_MS);
})();