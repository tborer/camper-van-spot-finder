const SIGNAL_RANK = { none: 0, weak: 1, fair: 2, strong: 3 };

const Filters = (() => {
  const defaults = {
    freeOnly: true,
    showCamping: true,
    showParking: true,
    showRestAreas: true,
    minSignal: 'none',
    hasFacilities: false,
    hasStayLimit: false,
  };

  let state = { ...defaults };

  function load() {
    try {
      const saved = localStorage.getItem('vanspot_filters');
      if (saved) state = { ...defaults, ...JSON.parse(saved) };
    } catch { /* ignore */ }
  }

  function save() {
    try { localStorage.setItem('vanspot_filters', JSON.stringify(state)); } catch { /* ignore */ }
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
