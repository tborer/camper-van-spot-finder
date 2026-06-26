const Main = (() => {
  let moveDebounce = null;
  let activated = false; // true once user has intentionally navigated somewhere

  const MIN_ZOOM_TO_LOAD = 9;

  function activate() {
    if (!activated) {
      activated = true;
      document.getElementById('map-prompt')?.classList.add('hidden');
      console.log('[VanSpot] Activated — spots will load when map settles');
    }
  }

  async function loadSpotsForBounds(bounds) {
    UI.showLoading();
    console.group(`[VanSpot] Loading spots for bounds`, bounds);
    try {
      const [osmSpots, iOverlanderSpots, freeCampSpots] = await Promise.all([
        Overpass.fetchSpots(bounds),
        IOverlander.fetchSpots(bounds),
        FreeCampsites.fetchSpots(bounds),
      ]);

      const combined = [...osmSpots, ...iOverlanderSpots, ...freeCampSpots];
      console.log(`[VanSpot] Combined: ${combined.length} spots`);

      const deduped = deduplicateSpots(combined);
      console.log(`[VanSpot] After dedup: ${deduped.length} spots`);

      deduped.forEach(s => { s.signalStrength = CellSignal.getSignalStrength(s.lat, s.lng); });

      const activeFilters = Filters.getState();
      console.log('[VanSpot] Active filters:', activeFilters);

      const filtered = Filters.applyFilters(deduped);
      console.log(`[VanSpot] After filters: ${filtered.length} spots` +
        (deduped.length - filtered.length ? ` (${deduped.length - filtered.length} hidden)` : ''));

      if (filtered.length === 0 && deduped.length > 0) {
        console.warn('[VanSpot] All spots filtered out — check active filters.');
      }

      MapView.clearSpots();
      filtered.forEach(s => MapView.addSpotMarker(s));
      MapView.renderOverlapZones(filtered);
      UI.renderResults(filtered, MapView.getCenter());
    } catch (err) {
      console.error('[VanSpot] loadSpotsForBounds error:', err);
    } finally {
      UI.hideLoading();
      console.groupEnd();
    }
  }

  function onMapMoved() {
    if (!activated) {
      console.log('[VanSpot] Map moved — search or tap locate to begin');
      return;
    }
    clearTimeout(moveDebounce);
    moveDebounce = setTimeout(() => {
      const zoom = MapView.getZoom();
      if (zoom < MIN_ZOOM_TO_LOAD) {
        console.log(`[VanSpot] Zoom ${zoom} — need zoom ${MIN_ZOOM_TO_LOAD}+ to load spots`);
        MapView.clearSpots();
        UI.renderResults([], null);
        return;
      }
      loadSpotsForBounds(MapView.getBounds());
    }, 1000);
  }

  function refresh() {
    if (activated) loadSpotsForBounds(MapView.getBounds());
  }

  async function start() {
    console.log('[VanSpot] Starting up…');
    MapView.init();
    UI.init();
    Search.init();

    await CellSignal.init();
    const cs = CellSignal.getStatus();
    console.log(`[VanSpot] Cell signal: ${cs.status} (${cs.towerCount.toLocaleString()} towers)`);
    MapView.renderCellHeatmap(CellSignal.getCellGeoJSON());

    UI.showWelcome();
    console.log('[VanSpot] Ready — search or tap locate to load spots.');
  }

  window.VanSpot = {
    debug() {
      console.group('VanSpot debug info');
      console.log('Activated:', activated);
      console.log('Cell signal:', CellSignal.getStatus());
      console.log('Active filters:', Filters.getState());
      console.log('Map bounds:', MapView.getBounds());
      console.log('Zoom:', MapView.getZoom());
      console.groupEnd();
    },
    reload() { if (activated) loadSpotsForBounds(MapView.getBounds()); },
  };

  document.addEventListener('DOMContentLoaded', start);

  return { onMapMoved, refresh, activate, loadSpotsForBounds };
})();
