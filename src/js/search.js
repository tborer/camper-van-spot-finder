const Search = (() => {
  let debounceTimer = null;
  let dropdown = null;

  function init() {
    const input = document.getElementById('search-input');
    const locateBtn = document.getElementById('btn-locate');

    dropdown = document.getElementById('search-dropdown');

    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => autocomplete(input.value.trim()), 300);
    });

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        clearTimeout(debounceTimer);
        selectTopResult();
      }
      if (e.key === 'Escape') hideDropdown();
    });

    document.addEventListener('click', e => {
      if (!e.target.closest('#search-bar')) hideDropdown();
    });

    locateBtn.addEventListener('click', geolocate);

    restoreFromHash();
  }

  async function autocomplete(query) {
    if (!query || query.length < 2) { hideDropdown(); return; }
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=us`;
      const res = await fetch(url, { headers: { 'User-Agent': CONFIG.NOMINATIM_USER_AGENT } });
      const results = await res.json();
      renderDropdown(results);
    } catch (err) {
      console.warn('Nominatim autocomplete failed:', err.message);
    }
  }

  function renderDropdown(results) {
    dropdown.innerHTML = '';
    if (!results.length) { hideDropdown(); return; }
    results.forEach(r => {
      const li = document.createElement('li');
      li.textContent = r.display_name;
      li.addEventListener('click', () => selectResult(r));
      dropdown.appendChild(li);
    });
    dropdown.classList.remove('hidden');
    dropdown._results = results;
  }

  function selectTopResult() {
    if (dropdown._results?.length) selectResult(dropdown._results[0]);
  }

  function selectResult(r) {
    document.getElementById('search-input').value = r.display_name;
    hideDropdown();
    MapView.flyTo(parseFloat(r.lat), parseFloat(r.lon), 11);
    saveToHash();
  }

  function hideDropdown() {
    dropdown.classList.add('hidden');
    dropdown.innerHTML = '';
    dropdown._results = null;
  }

  function geolocate() {
    if (!navigator.geolocation) { alert('Geolocation not supported.'); return; }
    navigator.geolocation.getCurrentPosition(pos => {
      MapView.flyTo(pos.coords.latitude, pos.coords.longitude, 12);
      saveToHash();
    }, () => alert('Could not get your location.'));
  }

  function saveToHash() {
    const c = MapView.getCenter();
    const filters = Filters.getState();
    const hash = `#${c.lat.toFixed(4)},${c.lng.toFixed(4)},${MapView.getBounds ? '' : ''}` +
      `?f=${encodeURIComponent(JSON.stringify(filters))}`;
    history.replaceState(null, '', hash);
  }

  function restoreFromHash() {
    const hash = location.hash.slice(1);
    if (!hash) return;
    const [coords] = hash.split('?');
    const parts = coords.split(',');
    if (parts.length >= 2) {
      const lat = parseFloat(parts[0]), lng = parseFloat(parts[1]);
      if (!isNaN(lat) && !isNaN(lng)) {
        setTimeout(() => MapView.flyTo(lat, lng, parseInt(parts[2]) || 10), 200);
      }
    }
  }

  return { init, saveToHash };
})();
