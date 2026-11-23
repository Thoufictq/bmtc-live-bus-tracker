(() => {
  "use strict";
  const FEED_URL = "https://maps.reclaim.city/bengaluru/rt/vehicle_positions.json";
  const STATUS_URL = "https://maps.reclaim.city/bengaluru/rt/status.json";
  const POLL_MS = 180000;
  const ROUTES = ["378","378-B","378-C","378-D","378-E","378-C UTH-ELC","378-E D44G-ELC"];
  const $ = id => document.getElementById(id);
  let selectedRoute = "all";
  let vehicles = [];
  let routeData = null;
  let map = null;
  let markers = null;
  let routeOverlay = null;

  function initMap() {
    if (!window.L) {
      $("map").innerHTML = '<div class="loading-card">Map library could not be loaded. Live bus details can still appear below.</div>';
      return;
    }
    map = L.map("map", {scrollWheelZoom:false}).setView([12.835,77.665], 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom:19,
      attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
    markers = L.layerGroup().addTo(map);
    routeOverlay = L.layerGroup().addTo(map);
  }

  function norm(value) {
    return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  }
  function tripOf(vehicle) {
    return vehicle.trip || {};
  }
  function findMatchedRoute(vehicle) {
    const trip = tripOf(vehicle);
    const routeId = String(trip.routeId || "");
    const tripId = String(trip.tripId || "");
    const direction = $("direction").value;

    if (routeData?.routes?.length) {
      for (const route of routeData.routes) {
        if (!ROUTES.includes(route.label)) continue;
        const routeIdMatch = (route.route_ids || []).includes(routeId);
        const directionRecord = (route.directions || []).find(item => item.direction === direction);
        const tripIdMatch = Boolean(tripId && directionRecord?.trips?.some(item => item.trip_id === tripId));
        if (tripId) {
          if (tripIdMatch) return route;
          // A trip ID is present but is not in the selected direction's verified trip list.
          continue;
        }
        if (routeIdMatch) return route;
      }
      return null;
    }

    // Before the first GTFS extract is generated, only accept an explicit service label.
    const identifiers = norm([routeId, tripId, vehicle.vehicle?.label, vehicle.vehicle?.licensePlate].join(" "));
    const fallbacks = [
      ["378-C UTH-ELC","378C UTHELC"],
      ["378-E D44G-ELC","378E D44GELC"],
      ["378-B","378B"],["378-C","378C"],["378-D","378D"],["378-E","378E"],["378","378"]
    ];
    for (const [label, token] of fallbacks) {
      if (identifiers.includes(token)) return {label};
    }
    return null;
  }
  function selectedVehicles() {
    return vehicles.map(vehicle => ({vehicle, route:findMatchedRoute(vehicle)}))
      .filter(item => item.route && (selectedRoute === "all" || item.route.label === selectedRoute));
  }
  function ageSeconds(vehicle) {
    const stamp = Number(vehicle.timestamp || vehicle.position?.timestamp || 0);
    return stamp ? Math.max(0, Math.floor(Date.now()/1000 - stamp)) : null;
  }
  function ageLabel(age) {
    if (age == null) return "GPS timestamp unavailable";
    if (age < 90) return "Updated " + age + " sec ago";
    return "Updated " + Math.round(age/60) + " min ago";
  }
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[char]));
  }
  function drawSelectedRoute() {
    if (!routeOverlay || !window.L) return;
    routeOverlay.clearLayers();
    if (!routeData?.routes) return;
    const routes = selectedRoute === "all"
      ? routeData.routes.filter(route => ROUTES.includes(route.label))
      : routeData.routes.filter(route => route.label === selectedRoute);
    const direction = $("direction").value;
    const bounds = [];
    routes.forEach(route => {
      const segment = (route.directions || []).find(item => item.direction === direction);
      if (!segment) return;
      if (segment.shape?.length > 1) {
        const points = segment.shape.map(point => [point.lat, point.lon]);
        L.polyline(points, {color:"#7cf0c2",weight:selectedRoute === "all" ? 3 : 5,opacity:selectedRoute === "all" ? .35 : .9}).addTo(routeOverlay);
        bounds.push(...points);
      } else {
        (segment.stops || []).forEach(stop => {
          if (Number.isFinite(stop.lat) && Number.isFinite(stop.lon)) bounds.push([stop.lat,stop.lon]);
        });
      }
      (segment.stops || []).forEach(stop => {
        if (!Number.isFinite(stop.lat) || !Number.isFinite(stop.lon)) return;
        L.circleMarker([stop.lat,stop.lon], {
          radius:selectedRoute === "all" ? 3 : 4,
          color:"#f5fbff",weight:1,fillColor:"#ffbd69",fillOpacity:1
        }).bindPopup("<strong>"+escapeHtml(stop.name)+"</strong><br>"+
          escapeHtml(stop.arrival_time || "Scheduled time unavailable")).addTo(routeOverlay);
      });
    });
    if (bounds.length) map.fitBounds(bounds, {padding:[20,20],maxZoom:15});
  }
  async function loadRouteData() {
    try {
      const response = await fetch("data/route-data.json?"+Date.now(), {cache:"no-store"});
      if (!response.ok) throw new Error("Route data not generated");
      routeData = await response.json();
      displayVehicles();
    } catch (_) {
      // The live view remains limited to explicit matches for the seven requested services.
    }
  }
  function displayVehicles() {
    const matched = selectedVehicles();
    $("map-count").textContent = matched.length + " matching bus" + (matched.length === 1 ? "" : "es");
    $("bus-list").innerHTML = matched.length ? matched.map(({vehicle,route}) => {
      const position = vehicle.position || {};
      const label = vehicle.vehicle?.label || vehicle.vehicle?.licensePlate || "BMTC vehicle";
      const age = ageSeconds(vehicle);
      const stale = age != null && age > 300;
      const speed = Number.isFinite(position.speed) ? Math.round(position.speed * 3.6) + " km/h" : "Speed unavailable";
      const bearing = Number.isFinite(position.bearing) ? " · " + Math.round(position.bearing) + "°" : "";
      return '<article class="bus-card"><div><div class="bus-title">'+escapeHtml(route.label)+
        '<span class="bus-badge">'+(vehicle.trip?.tripId ? "TRIP MATCHED" : "ROUTE MATCHED")+'</span></div>'+
        '<div class="bus-sub">'+escapeHtml(label)+'</div></div>'+
        '<div class="bus-eta"><strong>'+(stale ? "STALE" : "LIVE")+'</strong><span>GPS status</span></div>'+
        '<div class="bus-meta">'+speed+bearing+' · '+ageLabel(age)+'</div>'+
        '<div class="bus-meta">'+(Number.isFinite(position.latitude) && Number.isFinite(position.longitude)
          ? position.latitude.toFixed(5)+", "+position.longitude.toFixed(5) : "GPS coordinates unavailable")+'</div></article>';
    }).join("") : '<div class="empty-card">No live GPS vehicle currently matches '+escapeHtml(selectedRoute === "all" ? "the seven requested 378 services" : selectedRoute)+
      ' in the selected direction. This does not mean the service is not operating.</div>';

    if (markers) {
      markers.clearLayers();
      matched.forEach(({vehicle,route}) => {
        const position = vehicle.position || {};
        if (!Number.isFinite(position.latitude) || !Number.isFinite(position.longitude)) return;
        const marker = L.marker([position.latitude,position.longitude], {
          icon:L.divIcon({
            className:"",
            html:'<span class="bus-pin">🚌 '+escapeHtml(route.label)+'</span>',
            iconSize:null,iconAnchor:[18,12]
          })
        });
        marker.bindPopup("<strong>"+escapeHtml(route.label)+"</strong><br>"+
          escapeHtml(vehicle.vehicle?.label || vehicle.vehicle?.licensePlate || "BMTC vehicle")+
          "<br>"+ageLabel(ageSeconds(vehicle))).addTo(markers);
      });
    }
    drawSelectedRoute();
  }
  async function refresh() {
    const status = $("feed-status");
    $("feed-message").textContent = "Refreshing BMTC GPS positions…";
    status.className = "feed-status";
    try {
      const [feedResponse,statusResponse] = await Promise.all([
        fetch(FEED_URL,{cache:"no-store"}),
        fetch(STATUS_URL,{cache:"no-store"}).catch(() => null)
      ]);
      if (!feedResponse.ok) throw new Error("Live feed returned HTTP "+feedResponse.status);
      const feed = await feedResponse.json();
      const feedStatus = statusResponse?.ok ? await statusResponse.json() : null;
      vehicles = (feed.entity || []).map(entity => entity.vehicle).filter(Boolean);
      const stamp = Number(feed.header?.timestamp || feedStatus?.feed_time || 0);
      const age = stamp ? Math.max(0,Math.floor(Date.now()/1000-stamp)) : null;
      if (age != null && age > 600) {
        status.className = "feed-status stale";
        $("feed-message").textContent = "BMTC feed is stale · last update "+Math.round(age/60)+" min ago";
      } else {
        $("feed-message").textContent = "Connected · "+selectedVehicles().length+
          " matching buses · checked "+new Date().toLocaleTimeString()+" · source updates about every 3 min";
      }
      displayVehicles();
    } catch (error) {
      status.className = "feed-status error";
      $("feed-message").textContent = "BMTC live feed unavailable · "+error.message;
      $("bus-list").innerHTML = '<div class="empty-card">Live BMTC GPS data could not be loaded. Please try again later.</div>';
      if (markers) markers.clearLayers();
      if ($("map-count")) $("map-count").textContent = "Feed unavailable";
    }
  }

  $("route-filters").addEventListener("click", event => {
    const button = event.target.closest("button[data-route]");
    if (!button) return;
    selectedRoute = button.dataset.route;
    document.querySelectorAll(".route-chip").forEach(chip => chip.classList.toggle("active",chip === button));
    displayVehicles();
  });
  $("direction").addEventListener("change", () => {
    displayVehicles();
    $("feed-message").textContent = "Showing "+$("direction").selectedOptions[0].text+" · live GPS feed";
  });
  $("refresh").addEventListener("click",refresh);
  initMap();
  loadRouteData();
  refresh();
  window.setInterval(refresh,POLL_MS);
})();