const SIGNAL_RANK = { none: 0, weak: 1, fair: 2, strong: 3 };

const Filters = (() => {
  const defaults = {
    freeOnly: false,
    showCamping: true,
    showParking: true,
    showRestAreas: true,
    minSignal: 'none',
    hasFacilities: false,
    hasStayLimit: false,
  };

  let state = { ...defaults };

  const SCHEMA_VERSION = 2; // bump when defaults change to reset stored state

  function load() {
    try {
      const saved = localStorage.getItem('vanspot_filters');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed._v !== SCHEMA_VERSION) {
          console.log('[Filters] Resetting stored filters — schema version changed');
          localStorage.removeItem('vanspot_filters');
          return;
        }
        state = { ...defaults, ...parsed };
      }
    } catch { localStorage.removeItem('vanspot_filters'); }
  }

  function save() {
    try { localStorage.setItem('vanspot_filters', JSON.stringify({ ...state, _v: SCHEMA_VERSION })); } catch { /* ignore */ }
  }

  function getState() { return { ...state }; }

  function setFilter(key, value) {
    state[key] = value;
    save();
    if (typeof Main !== 'undefined') Main.refresh();
  }

  function applyFilters(spots) {
    return spots.filter(s => {
      if (state.freeOnly && !s.free) return false;
      if (!state.showCamping && (s.type === 'campsite' || s.type === 'overlanding')) return false;
      if (!state.showParking && (s.type === 'parking' || s.type === 'picnic_area')) return false;
      if (!state.showRestAreas && (s.type === 'rest_area')) return false;
      if (SIGNAL_RANK[s.signalStrength] < SIGNAL_RANK[state.minSignal]) return false;
      if (state.hasFacilities && !s.facilities?.toilets && !s.facilities?.water) return false;
      if (state.hasStayLimit && !s.stayLimitDays) return false;
      return true;
    });
  }

  load();
  return { getState, setFilter, applyFilters };
})();
