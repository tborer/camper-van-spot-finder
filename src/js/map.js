const MapView = (() => {
  const PIN_COLORS = {
    green:  '#22c55e',
    yellow: '#f59e0b',
    blue:   '#3b82f6',
    gray:   '#9ca3af',
  };

  let map, clusterLayer, cellLayer, overlapLayer;

  function pinColor(spot) {
    if (spot.type === 'campsite' || spot.type === 'overlanding') return 'blue';
    if (spot.free && (spot.signalStrength === 'strong' || spot.signalStrength === 'fair')) return 'green';
    if (spot.free) return 'yellow';
    return 'gray';
  }

  // Tooltip label shown on hover
  function pinLabel(spot) {
    const sig = { strong: '📶 Strong', fair: '📶 Fair', weak: '📶 Weak', none: 'No signal data' }[spot.signalStrength];
    return `<b>${spot.name}</b><br>${spot.type} · ${spot.free ? 'Free' : 'Paid'}<br>${sig}`;
  }

  function makeIcon(color) {
    return L.divIcon({
      className: '',
      html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
  }

  function init() {
    map = L.map('map', { zoomControl: true }).setView([39.5, -98.35], 5);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · iOverlander · OpenCelliD · FreeCampsites.net',
      maxZoom: 19,
    }).addTo(map);

    clusterLayer = L.markerClusterGroup({ maxClusterRadius: 40 });
    cellLayer = L.layerGroup();
    overlapLayer = L.layerGroup();

    clusterLayer.addTo(map);
    cellLayer.addTo(map);
    overlapLayer.addTo(map);

    // Only fire after map has fully settled — suppress the burst of moveend
    // events Leaflet emits during invalidateSize on startup
    let mapReady = false;
    setTimeout(() => { mapReady = true; }, 1200);
    map.on('moveend', () => {
      if (mapReady && typeof Main !== 'undefined') Main.onMapMoved();
    });
  }

  function addSpotMarker(spot) {
    const color = pinColor(spot);
    const marker = L.marker([spot.lat, spot.lng], { icon: makeIcon(PIN_COLORS[color]) });
    marker.bindTooltip(pinLabel(spot), { direction: 'top', offset: [0, -10] });
    marker.on('click', () => {
      if (typeof UI !== 'undefined') UI.showDetailPanel(spot);
    });
    marker.spotData = spot;
    clusterLayer.addLayer(marker);
  }

  function clearSpots() {
    clusterLayer.clearLayers();
    overlapLayer.clearLayers();
  }

  function renderCellHeatmap(geojson) {
    cellLayer.clearLayers();
    if (!geojson) return;
    L.geoJSON(geojson, {
      pointToLayer: (feature, latlng) =>
        L.circleMarker(latlng, { radius: 6, color: '#6366f1', fillOpacity: 0.3, stroke: false }),
    }).addTo(cellLayer);
  }

  function renderOverlapZones(spots) {
    overlapLayer.clearLayers();
    spots
      .filter(s => s.free && (s.signalStrength === 'strong' || s.signalStrength === 'fair'))
      .forEach(s => {
        L.circle([s.lat, s.lng], {
          radius: 800,
          color: '#22c55e',
          fillColor: '#22c55e',
          fillOpacity: 0.08,
          weight: 0,
        }).addTo(overlapLayer);
      });
  }

  function flyTo(lat, lng, zoom = 11) {
    map.flyTo([lat, lng], zoom, { duration: 1.2 });
  }

  function getBounds() {
    const b = map.getBounds();
    return { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() };
  }

  function getCenter() { return map.getCenter(); }
  function getZoom() { return map.getZoom(); }

  function toggleLayer(name, visible) {
    const layer = { cell: cellLayer, overlap: overlapLayer }[name];
    if (!layer) return;
    if (visible) map.addLayer(layer); else map.removeLayer(layer);
  }

  return { init, addSpotMarker, clearSpots, renderCellHeatmap, renderOverlapZones, flyTo, getBounds, getCenter, getZoom, toggleLayer };
})();
