// Shared map, journey picker and trip list for the ATARA public pages.

const ATARA_ICONS = {
  swap: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 16V4"/><path d="M3 8l4-4 4 4"/><path d="M17 8v12"/><path d="M13 16l4 4 4-4"/></svg>',
  pin: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0116 0z"/><circle cx="12" cy="10" r="3"/></svg>',
  clock: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'
};

const esc = value => (value === null || value === undefined || value === '')
  ? '--'
  : String(value).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const ATARA_UI = {
  map: null,
  busMarkers: {},
  stopMarkers: {},
  link: null,
  destMarker: null,
  originMarker: null,
  stopSignature: '',

  icon(color, label, cls) {
    return L.divIcon({
      className: 'bus-marker',
      html: `<div class="bus-marker-inner ${cls || ''}" style="background:${color}">${esc(label)}</div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17]
    });
  },

  pinIcon(color) {
    return L.divIcon({
      className: 'bus-marker',
      html: `<svg width="26" height="34" viewBox="0 0 24 32" style="filter:drop-shadow(0 2px 5px rgba(6,26,47,.4))">
        <path d="M12 31C12 31 22 20.5 22 12A10 10 0 002 12c0 8.5 10 19 10 19z" fill="${color}"/>
        <circle cx="12" cy="12" r="4" fill="#fff"/></svg>`,
      iconSize: [26, 34],
      iconAnchor: [13, 31]
    });
  },

  initMap(elId) {
    this.map = L.map(elId, { zoomControl: true, attributionControl: true })
      .setView(ATARA_MAP_CENTER, ATARA_MAP_ZOOM);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(this.map);

    this.map.on('click', e => {
      if (!ATARA.picking) return;
      const point = { lat: e.latlng.lat, lng: e.latlng.lng, label: 'Map point', sub: 'Chosen on the map' };
      if (ATARA.picking === 'origin') ATARA.setOrigin(point); else ATARA.setDestination(point);
      ATARA.setPicking(null);
      this.map.dragging.enable();
    });
    return this.map;
  },

  drawStops() {
    const signature = ATARA.stops.map(s => `${s.id}${s.lat},${s.lng}`).join('|');
    if (signature === this.stopSignature) return;
    this.stopSignature = signature;
    Object.values(this.stopMarkers).forEach(m => m.remove());
    this.stopMarkers = {};
    ATARA.stops.forEach(stop => {
      const marker = L.marker([stop.lat, stop.lng], {
        icon: L.divIcon({
          className: 'bus-marker',
          html: '<div style="width:11px;height:11px;border-radius:50%;background:#fff;border:3px solid #0047DE;box-shadow:0 1px 4px rgba(6,26,47,.4)"></div>',
          iconSize: [11, 11], iconAnchor: [5, 5]
        })
      }).addTo(this.map);
      marker.bindTooltip(`${shortPlaceName(stop.name)} · ${stop.buses} buses`, { direction: 'top', className: 'bus-tip', offset: [0, -6] });
      this.stopMarkers[stop.id] = marker;
    });
  },

  drawEndpoints() {
    if (this.originMarker) { this.originMarker.remove(); this.originMarker = null; }
    if (this.destMarker) { this.destMarker.remove(); this.destMarker = null; }
    if (ATARA.origin) {
      this.originMarker = L.marker([ATARA.origin.lat, ATARA.origin.lng], { icon: this.pinIcon('#0e9f6e'), zIndexOffset: 600 })
        .addTo(this.map).bindTooltip(ATARA.origin.label, { direction: 'top', className: 'bus-tip' });
    }
    if (ATARA.destination) {
      this.destMarker = L.marker([ATARA.destination.lat, ATARA.destination.lng], { icon: this.pinIcon('#b31414'), zIndexOffset: 600 })
        .addTo(this.map).bindTooltip(ATARA.destination.label, { direction: 'top', className: 'bus-tip' });
    }
  },

  // A soft arc from the selected bus to the destination, not a straight line.
  drawLink(bus) {
    if (this.link) { this.link.remove(); this.link = null; }
    if (!bus || !ATARA.destination || bus.lat === null) return;
    const from = mapPoint(bus.lat, bus.lng);
    const to = mapPoint(ATARA.destination.lat, ATARA.destination.lng);
    const mid = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
    const bow = 0.16;
    const control = [mid[0] + (to[1] - from[1]) * bow, mid[1] + (from[0] - to[0]) * bow];
    this.link = L.polyline(
      [from, ...quadratic(from, control, to, 24), to],
      { color: '#0047DE', weight: 3, opacity: 0.55, dashArray: '1,9', lineCap: 'round' }
    ).addTo(this.map);
  },

  renderBuses() {
    const seen = new Set();
    ATARA.visibleBuses().forEach(({ bus, line }) => {
      if (bus.lat === null) return;
      const key = ATARA.busKey(bus, line);
      seen.add(key);
      const live = bus.status === 'online';
      const selected = ATARA.selectedBus === key;
      const color = live ? line.color : '#848484';
      const icon = this.icon(color, bus.name, `${live ? '' : 'dim'} ${selected ? 'sel' : ''}`);
      if (this.busMarkers[key]) {
        this.busMarkers[key].marker.setLatLng([bus.lat, bus.lng]).setIcon(icon);
      } else {
        const marker = L.marker([bus.lat, bus.lng], { icon, zIndexOffset: selected ? 700 : 400 }).addTo(this.map);
        marker.on('click', () => ATARA.selectBus(key));
        marker.bindTooltip(`Bus ${bus.name} · ${bus.speed_kmh} km/h`, { direction: 'top', className: 'bus-tip', offset: [0, -16] });
        this.busMarkers[key] = { marker, key };
      }
      this.busMarkers[key].marker.unbindPopup();
      this.busMarkers[key].marker.bindPopup(this.popup(bus, line));
    });
    Object.keys(this.busMarkers).forEach(key => {
      if (!seen.has(key)) { this.busMarkers[key].marker.remove(); delete this.busMarkers[key]; }
    });
  },

  popup(bus, line) {
    const status = ATARA_STATUS[bus.status] || ATARA_STATUS.offline;
    const eta = ATARA.destination ? ATARA.eta(bus, line, ATARA.destination) : null;
    const near = ATARA.nearestStops(bus, 1)[0];
    return `<div style="min-width:210px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px">
        <span style="width:10px;height:10px;border-radius:2px;background:${line.color}"></span>
        <b style="font-size:15px">Bus ${esc(bus.name)}</b>
      </div>
      <div style="color:#646464;font-size:13px;margin-bottom:7px">${esc(line.name)}</div>
      ${eta ? `<div style="font-size:20px;font-weight:700;color:#0047DE;letter-spacing:-.02em">${esc(formatMinutes(eta.minutes))}</div>
        <div style="color:#646464;font-size:12px;margin-bottom:7px">${esc(formatKm(eta.km))} to your destination · ${eta.speedKmh} km/h${eta.usingLiveSpeed ? ' (live)' : ' (line average)'}${eta.reliable ? '' : ' · position may be out of date'}</div>` : ''}
      <div><span class="status-chip ${status.className}">${status.label}</span>
        <span style="color:#646464;font-size:12px;margin-left:6px">${esc(bus.speed_kmh)} km/h · ${esc(formatAge(bus.age_s))}</span></div>
      ${near ? `<div style="color:#646464;font-size:12px;margin-top:5px">Nearest reported area: ${esc(shortPlaceName(near.stop.name))} (${esc(formatKm(near.km))})</div>` : ''}
    </div>`;
  },

  fitTo(entries) {
    const points = entries.filter(({ bus }) => bus.lat !== null).map(({ bus }) => [bus.lat, bus.lng]);
    if (points.length > 1) this.map.fitBounds(L.latLngBounds(points).pad(0.15));
    else if (points.length === 1) this.map.setView(points[0], 13);
  },

  render() {
    this.drawStops();
    this.drawEndpoints();
    this.renderBuses();
    const sel = ATARA.getSelected();
    this.drawLink(sel ? sel.bus : null);
  }
};

function mapPoint(lat, lng) {
  return [lat, lng];
}

function quadratic(p0, p1, p2, steps) {
  const out = [];
  for (let i = 1; i < steps; i++) {
    const t = i / steps, u = 1 - t;
    out.push([
      u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
      u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]
    ]);
  }
  return out;
}

/* ---------------- journey picker ---------------- */

const ATARA_JOURNEY = {
  mount(rootId, opts) {
    const root = document.getElementById(rootId);
    if (!root) return;
    const options = opts || {};
    root.innerHTML = `
      <div class="journey-tabs" role="tablist">
        <button class="journey-tab" role="tab" aria-selected="true" data-mode="leave">Leaving from</button>
        <button class="journey-tab" role="tab" aria-selected="false" data-mode="arrive">Arriving at</button>
      </div>
      <div class="journey-grid">
        <div class="field field-from">
          <label class="field-label" for="ataraFrom">From</label>
          <button type="button" class="field-input" id="ataraFrom" aria-haspopup="listbox" aria-expanded="false">
            ${ATARA_ICONS.pin}<span class="value"></span>
          </button>
          <div class="suggest" id="ataraFromList" role="listbox" hidden></div>
        </div>
        <div class="field field-swap"><button type="button" class="swap" id="ataraSwap" title="Swap" aria-label="Swap origin and destination">${ATARA_ICONS.swap}</button></div>
        <div class="field field-to">
          <label class="field-label" for="ataraTo">To</label>
          <button type="button" class="field-input" id="ataraTo" aria-haspopup="listbox" aria-expanded="false">
            ${ATARA_ICONS.pin}<span class="value"></span>
          </button>
          <div class="suggest" id="ataraToList" role="listbox" hidden></div>
        </div>
        <div class="field field-date">
          <label class="field-label" for="ataraWhen">When</label>
          <button type="button" class="field-input" id="ataraWhen">${ATARA_ICONS.clock}<span class="value">Now</span></button>
        </div>
        <div class="field field-when">
          <label class="field-label" for="ataraOffset">Show buses within</label>
          <select class="field-input" id="ataraOffset" style="padding:0 10px">
            <option value="15">15 minutes</option>
            <option value="30" selected>30 minutes</option>
            <option value="60">1 hour</option>
            <option value="999">Any distance</option>
          </select>
        </div>
        <div class="field field-go">
          <button type="button" class="btn btn-primary" id="ataraGo" style="height:48px">Search</button>
        </div>
      </div>`;

    const state = { offset: 30, open: null, when: 0 };
    this.state = state;

    root.querySelectorAll('.journey-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        root.querySelectorAll('.journey-tab').forEach(t => t.setAttribute('aria-selected', String(t === tab)));
        state.focusField = tab.dataset.mode === 'leave' ? 'origin' : 'destination';
      });
    });

    const openList = which => {
      this.closeLists();
      state.open = which;
      const list = document.getElementById(which === 'origin' ? 'ataraFromList' : 'ataraToList');
      const input = document.getElementById(which === 'origin' ? 'ataraFrom' : 'ataraTo');
      input.classList.add('open');
      input.setAttribute('aria-expanded', 'true');
      list.hidden = false;
      list.innerHTML = this.listHtml();
      this.wireList(which, list);
      const first = list.querySelector('.suggest-item');
      if (first) first.classList.add('active');
    };

    this.closeLists = () => {
      ['ataraFromList', 'ataraToList'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.hidden = true;
      });
      ['ataraFrom', 'ataraTo'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.classList.remove('open'); el.setAttribute('aria-expanded', 'false'); }
      });
      state.open = null;
    };

    document.getElementById('ataraFrom').addEventListener('click', e => {
      e.stopPropagation();
      state.open === 'origin' ? this.closeLists() : openList('origin');
    });
    document.getElementById('ataraTo').addEventListener('click', e => {
      e.stopPropagation();
      state.open === 'destination' ? this.closeLists() : openList('destination');
    });
    document.getElementById('ataraSwap').addEventListener('click', () => ATARA.swap());
    document.getElementById('ataraOffset').addEventListener('change', e => {
      state.offset = Number(e.target.value);
      if (options.onOffset) options.onOffset(state.offset);
      if (options.onChange) options.onChange();
    });
    document.getElementById('ataraWhen').addEventListener('click', () => {
      state.when = state.when ? 0 : 30;
      this.paintWhen();
    });
    document.getElementById('ataraGo').addEventListener('click', () => {
      this.closeLists();
      if (options.onSearch) options.onSearch();
    });
    document.addEventListener('click', () => this.closeLists());
  },

  listHtml() {
    const places = ATARA.places();
    const lines = ATARA.lines.length
      ? `<div class="suggest-sep">Or jump to a line</div>` + ATARA.lines.map(l =>
        `<button class="suggest-item" data-line="${l.id}">
          <span class="pin" style="width:18px;height:18px;border-radius:4px;background:${l.color}"></span>
          <span>${esc(l.name)}<small>${l.buses.filter(b => b.status === 'online').length} of ${l.buses.length} live</small></span>
        </button>`).join('')
      : '';
    return `<div class="suggest-sep">Places buses are reporting from</div>` +
      places.map(p => `<button class="suggest-item" data-label="${esc(p.label)}" data-lat="${p.lat}" data-lng="${p.lng}">
          <span class="pin">${ATARA_ICONS.pin}</span>
          <span>${esc(p.label)}<small>${esc(p.sub)}</small></span>
        </button>`).join('') + lines;
  },

  wireList(which, list) {
    list.querySelectorAll('.suggest-item').forEach(item => {
      item.addEventListener('click', e => {
        e.stopPropagation();
        if (item.dataset.line) {
          ATARA.setLine(ATARA.lineFilter === item.dataset.line ? null : item.dataset.line);
          ATARA.setDestination(ATARA.destination || { lat: 41.355, lng: 19.79, label: 'Tirana centre', sub: 'Network centre' });
        } else {
          const place = { lat: Number(item.dataset.lat), lng: Number(item.dataset.lng), label: item.dataset.label, sub: 'From live fleet data' };
          if (which === 'origin') ATARA.setOrigin(place); else ATARA.setDestination(place);
        }
        this.closeLists();
        if (this.state && this.state.onPick) this.state.onPick(which);
      });
    });
  },

  paintWhen() {
    const el = document.getElementById('ataraWhen');
    if (!el) return;
    const value = this.state.when
      ? new Date(Date.now() + this.state.when * 60000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
      : 'Now';
    el.querySelector('.value').textContent = value;
  },

  paint() {
    const set = (id, place, placeholder) => {
      const el = document.getElementById(id);
      if (!el) return;
      const span = el.querySelector('.value');
      span.textContent = place ? place.label : placeholder;
      span.classList.toggle('placeholder', !place);
    };
    set('ataraFrom', ATARA.origin, 'Where are you?');
    set('ataraTo', ATARA.destination, 'Where to?');
    this.paintWhen();
  }
};

/* ---------------- trip results ---------------- */

const ATARA_TRIPS = {
  state: { offset: 30 },

  // Buses on the selected line, ranked by how long until they reach the destination.
  // Live buses always rank ahead of stale ones: a bus whose last fix is 20 minutes
  // old may be closer on paper, but we cannot claim it is arriving first.
  rows() {
    const target = ATARA.destination;
    let entries = ATARA.visibleBuses();
    if (target) {
      entries = entries
        .map(({ bus, line }) => ({ bus, line, eta: ATARA.eta(bus, line, target) }))
        .filter(r => r.eta && r.bus.status !== 'offline')
        .sort((a, b) => {
          const rank = r => (r.bus.status === 'online' ? 0 : 1);
          return rank(a) - rank(b) || a.eta.minutes - b.eta.minutes;
        });
    } else {
      entries = entries
        .map(({ bus, line }) => ({ bus, line, eta: null }))
        .sort((a, b) => {
          const rank = { online: 0, stale: 1, offline: 2 };
          return (rank[a.bus.status] - rank[b.bus.status]) ||
            (a.bus.age_s || 0) - (b.bus.age_s || 0);
        });
    }
    return entries;
  },

  visible() {
    const all = this.rows();
    if (!ATARA.destination || this.state.offset >= 999) return all;
    return all.filter(r => r.eta.minutes <= this.state.offset);
  },

  render(containerId, emptyHint) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const rows = this.visible();
    if (!rows.length) {
      el.innerHTML = `<div class="empty">${esc(emptyHint || 'No buses match this journey. Try a wider time window or another line.')}</div>`;
      return;
    }
    el.innerHTML = rows.map(({ bus, line, eta }) => {
      const status = ATARA_STATUS[bus.status] || ATARA_STATUS.offline;
      const key = ATARA.busKey(bus, line);
      const near = ATARA.nearestStops(bus, 1)[0];
      const moving = bus.status === 'online' && bus.speed_kmh > 3;
      const state = bus.status !== 'online'
        ? `last seen ${formatAge(bus.age_s)}`
        : moving ? 'moving' : 'stopped';
      return `<div class="trip" data-key="${key}" aria-selected="${ATARA.selectedBus === key}">
        <div class="trip-eta ${eta && eta.reliable ? '' : 'off'}">
          <div class="trip-eta-v">${eta ? esc(formatMinutes(eta.minutes)) : '--'}</div>
          <div class="trip-eta-u">${!eta ? 'set a destination' : eta.minutes < 1 ? 'at your stop' : 'away'}</div>
        </div>
        <div class="trip-main">
          <div class="trip-top">
            <span class="trip-bus"><span class="tag" style="background:${line.color}"></span>Bus ${esc(bus.name)}</span>
            <span class="status-chip ${status.className}">${status.label}</span>
          </div>
          <div class="trip-line">${esc(line.name)}</div>
          <div class="trip-facts">
            ${eta ? `<span class="trip-fact"><b>${esc(formatKm(eta.km))}</b> away</span>` : ''}
            <span class="trip-fact"><b>${esc(bus.speed_kmh)} km/h</b> ${state}</span>
            ${near ? `<span class="trip-fact">near <b>${esc(shortPlaceName(near.stop.name))}</b></span>` : ''}
          </div>
        </div>
        <div><button type="button" class="btn btn-white" data-focus="${key}">Track</button></div>
      </div>`;
    }).join('');

    el.querySelectorAll('.trip').forEach(row => {
      row.addEventListener('click', () => ATARA.selectBus(row.dataset.key));
    });
    el.querySelectorAll('[data-focus]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const key = btn.dataset.focus;
        ATARA.selectBus(key);
        const sel = ATARA.getSelected();
        if (sel && ATARA_UI.map && sel.bus.lat !== null) {
          ATARA_UI.map.setView([sel.bus.lat, sel.bus.lng], Math.max(ATARA_UI.map.getZoom(), 14));
        }
      });
    });
  }
};

function renderLivePill() {
  const el = document.getElementById('livePill');
  if (!el) return;
  if (ATARA.error) {
    el.className = 'live-pill down';
    el.innerHTML = `<span class="live-dot"></span>${esc(ATARA.error)}`;
    return;
  }
  if (!ATARA.data) { el.className = 'live-pill down'; el.innerHTML = '<span class="live-dot"></span>Connecting'; return; }
  const ageS = ATARA.loadedAt ? Math.round((Date.now() - ATARA.loadedAt) / 1000) : 0;
  const t = ATARA.totals;
  // The snapshot is only as fresh as the job that wrote it. A collector on a
  // 5-minute cadence should not be flagged broken, but it must not claim "live" either.
  const onlineMax = (ATARA.data.thresholds && ATARA.data.thresholds.online_s) || 120;
  if (ageS > onlineMax) {
    el.className = 'live-pill stale';
    el.innerHTML = `<span class="live-dot"></span>Feed ${formatAge(ageS)}`;
  } else {
    el.className = 'live-pill';
    el.innerHTML = `<span class="live-dot"></span>${t.online} of ${t.buses} buses live`;
  }
}

window.ATARA_UI = ATARA_UI;
window.ATARA_JOURNEY = ATARA_JOURNEY;
window.ATARA_TRIPS = ATARA_TRIPS;
window.renderLivePill = renderLivePill;
