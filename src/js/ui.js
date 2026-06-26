const UI = (() => {
  const SIGNAL_ICON = { strong: '📶', fair: '📶', weak: '📶', none: '🚫' };
  const SIGNAL_CLASS = { strong: 'signal-strong', fair: 'signal-fair', weak: 'signal-weak', none: 'signal-none' };

  let activeCardId = null;

  function init() {
    document.getElementById('detail-close').addEventListener('click', hideDetailPanel);

    // Mobile sidebar toggle
    const toggleBtn = document.getElementById('btn-sidebar-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('open');
      });
    }

    // Filter chips
    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const key = chip.dataset.filter, val = chip.dataset.value;
        const isToggle = chip.dataset.type === 'toggle';
        if (isToggle) {
          const state = Filters.getState();
          chip.classList.toggle('active');
          Filters.setFilter(key, !state[key]);
        }
      });
    });

    // Signal slider
    const slider = document.getElementById('signal-slider');
    if (slider) {
      const levels = ['none', 'weak', 'fair', 'strong'];
      slider.addEventListener('input', () => {
        Filters.setFilter('minSignal', levels[parseInt(slider.value)]);
        document.getElementById('signal-label').textContent = levels[parseInt(slider.value)];
      });
    }

    // Legend toggle
    const legendToggle = document.getElementById('legend-toggle');
    const legendBody = document.getElementById('legend-body');
    legendToggle?.addEventListener('click', () => {
      const open = !legendBody.classList.contains('hidden');
      legendBody.classList.toggle('hidden', open);
      legendToggle.textContent = open ? '? Legend' : '▲ Legend';
    });

    // Layer toggle
    document.getElementById('btn-layers')?.addEventListener('click', () => {
      const panel = document.getElementById('layer-panel');
      panel?.classList.toggle('hidden');
    });

    document.querySelectorAll('.layer-toggle').forEach(cb => {
      cb.addEventListener('change', () => {
        MapView.toggleLayer(cb.dataset.layer, cb.checked);
      });
    });

    syncFilterUI();
  }

  function syncFilterUI() {
    const state = Filters.getState();
    document.querySelectorAll('.filter-chip[data-type="toggle"]').forEach(chip => {
      chip.classList.toggle('active', !!state[chip.dataset.filter]);
    });
    const levels = ['none', 'weak', 'fair', 'strong'];
    const slider = document.getElementById('signal-slider');
    if (slider) {
      slider.value = levels.indexOf(state.minSignal);
      document.getElementById('signal-label').textContent = state.minSignal;
    }
  }

  function showLoading() { document.getElementById('loading-indicator')?.classList.remove('hidden'); }
  function hideLoading() { document.getElementById('loading-indicator')?.classList.add('hidden'); }

  function renderResults(spots, mapCenter) {
    const list = document.getElementById('results-list');
    if (!spots.length) {
      list.innerHTML = '<p class="empty-state">No spots found in this area.<br>Try zooming out or adjusting filters.</p>';
      return;
    }

    function distKm(s) {
      if (!mapCenter) return null;
      const R = 6371, dLat = (s.lat - mapCenter.lat) * Math.PI/180;
      const dLng = (s.lng - mapCenter.lng) * Math.PI/180;
      const a = Math.sin(dLat/2)**2 + Math.cos(mapCenter.lat*Math.PI/180)*Math.cos(s.lat*Math.PI/180)*Math.sin(dLng/2)**2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }

    const sorted = [...spots].sort((a, b) => (distKm(a)||0) - (distKm(b)||0));

    list.innerHTML = sorted.map(s => {
      const dist = distKm(s);
      const distStr = dist != null ? `${dist.toFixed(1)} km` : '';
      const badges = s.sources.map(src => `<span class="badge badge-${src}">${src}</span>`).join('');
      return `<div class="spot-card${s.id === activeCardId ? ' active' : ''}" data-id="${s.id}" data-lat="${s.lat}" data-lng="${s.lng}">
        <div class="spot-card-header">
          <span class="spot-name">${escHtml(s.name)}</span>
          <span class="${SIGNAL_CLASS[s.signalStrength]}">${SIGNAL_ICON[s.signalStrength]}</span>
        </div>
        <div class="spot-card-meta">
          ${badges}
          <span class="spot-type">${s.type}</span>
          ${distStr ? `<span class="spot-dist">${distStr}</span>` : ''}
          ${s.free ? '<span class="badge-free">Free</span>' : ''}
        </div>
      </div>`;
    }).join('');

    list.querySelectorAll('.spot-card').forEach(card => {
      card.addEventListener('click', () => {
        const spot = spots.find(s => s.id === card.dataset.id);
        if (spot) showDetailPanel(spot);
      });
    });
  }

  function showDetailPanel(spot) {
    activeCardId = spot.id;
    const panel = document.getElementById('detail-panel');
    const content = document.getElementById('detail-content');

    const facList = Object.entries(spot.facilities || {})
      .filter(([, v]) => v)
      .map(([k]) => `<li>${k}</li>`)
      .join('');

    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${spot.lat},${spot.lng}`;
    const appleMapsUrl = `https://maps.apple.com/?daddr=${spot.lat},${spot.lng}`;

    content.innerHTML = `
      <h2>${escHtml(spot.name)}</h2>
      <div class="detail-badges">${spot.sources.map(s => `<span class="badge badge-${s}">${s}</span>`).join('')}</div>
      <div class="detail-signal ${SIGNAL_CLASS[spot.signalStrength]}">Signal: ${spot.signalStrength}</div>
      <div class="detail-row"><strong>Type:</strong> ${spot.type}</div>
      <div class="detail-row"><strong>Free:</strong> ${spot.free ? 'Yes' : 'No'}</div>
      ${spot.stayLimitDays ? `<div class="detail-row"><strong>Stay limit:</strong> ${spot.stayLimitDays} days</div>` : ''}
      ${facList ? `<div class="detail-row"><strong>Facilities:</strong><ul>${facList}</ul></div>` : ''}
      ${spot.notes ? `<div class="detail-row detail-notes">${escHtml(spot.notes)}</div>` : ''}
      <div class="detail-links">
        <a href="${mapsUrl}" target="_blank" rel="noopener">Open in Google Maps</a>
        <a href="${appleMapsUrl}" target="_blank" rel="noopener">Open in Apple Maps</a>
      </div>`;

    panel.classList.add('open');
    panel.classList.remove('hidden');
  }

  function hideDetailPanel() {
    activeCardId = null;
    const panel = document.getElementById('detail-panel');
    panel.classList.remove('open');
  }

  function escHtml(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return { init, showLoading, hideLoading, renderResults, showDetailPanel, hideDetailPanel };
})();
