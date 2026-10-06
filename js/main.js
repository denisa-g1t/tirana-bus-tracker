// ATARA - public transit tracker for Tirana.
// Fleet data is mirrored from the GpsGate tracker by tools/fetch_live.py into
// data/live.json (and data/live.js so the pages also work from file://).
// Nothing on the public site is simulated and nothing requires a sign-in.

// The same file is loaded from the site root (index.html) and from pages/ (bus.html),
// so the data path cannot be a fixed relative string: "../data/live.json" works from
// pages/ but escapes the site root from index.html. Resolve it against this script's
// own URL instead, which is the same directory in both cases.
const ATARA_SCRIPT_URL = (document.currentScript && document.currentScript.src)
  || (document.querySelector('script[src*="main.js"]') || {}).src
  || '';
const ATARA_DATA_URL = ATARA_SCRIPT_URL
  ? new URL('../data/live.json', ATARA_SCRIPT_URL).href
  : '../data/live.json';
/* Positions pulled live from the fleet tracker, when the live endpoint is
   deployed. It answers in exactly the shape of data/live.json, so the site can
   use either. Left empty, the site reads the committed snapshot instead, which
   is only as fresh as the last successful push, and says so on screen. */
const ATARA_LIVE_URL = '';

const ATARA_REFRESH_MS = 15000;
const ATARA_MAP_CENTER = [41.355, 19.79];
const ATARA_MAP_ZOOM = 11;

// Straight-line distance under-reads a real road. 1.3 is a normal winding factor
// for an urban corridor and is applied to every estimate on the site.
const ATARA_ROAD_WINDING = 1.3;
const ATARA_SPEED_RANGE = [8, 45];

const ATARA_STATUS = {
  online: { label: 'Live', className: 'status-online' },
  stale: { label: 'Delayed signal', className: 'status-stale' },
  offline: { label: 'No signal', className: 'status-offline' }
};

const ATARA_LINE_FALLBACK_COLORS = ['#0047DE', '#0e9f6e', '#b45309', '#7c3aed', '#db2777', '#0f766e', '#c2410c'];

// Reverse geocoding returns long administrative strings. "Rruga Elez Isufi,
// Njesia Bashkiake Nr. 11" is unreadable in a 200px picker, so we keep the street
// and drop the municipality suffix.
function shortPlaceName(name) {
  if (!name) return 'Map point';
  const street = String(name).split(',')[0].trim();
  return street || String(name).trim();
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Multiplier on travel time by hour of day, Tirana.
function trafficFactor(date) {
  const hour = (date || new Date()).getHours();
  if (hour >= 0 && hour < 5) return 1.15;
  if (hour < 7) return 0.9;
  if (hour < 9) return 1.55;
  if (hour < 12) return 1.1;
  if (hour < 15) return 1.0;
  if (hour < 19) return 1.45;
  if (hour < 22) return 1.0;
  return 0.9;
}

function formatAge(ageS) {
  if (ageS === null || ageS === undefined) return 'unknown';
  if (ageS < 60) return `${ageS}s ago`;
  if (ageS < 3600) return `${Math.floor(ageS / 60)} min ago`;
  if (ageS < 86400) return `${Math.floor(ageS / 3600)} h ago`;
  return `${Math.floor(ageS / 86400)} d ago`;
}

function formatClock(ms) {
  if (!ms) return '--:--';
  return new Date(ms).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Tirane'
  });
}

function formatMinutes(mins) {
  if (mins === null || mins === undefined) return '--';
  if (mins < 1) return '< 1 min';
  if (mins < 60) return `${Math.round(mins)} min`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins - h * 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

// A bus standing at your stop is 40 m away, not "0.0 km".
function formatKm(km) {
  if (km === null || km === undefined) return '--';
  if (km < 0.1) return '<0.1 km';
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

const ATARA = {
  data: null,
  error: null,
  loadedAt: null,
  // 'live' when the positions came from the live endpoint, 'snapshot' when they
  // came from the last committed mirror, 'bundled' from the offline copy. Named
  // feedSource because ATARA already has a getter called source for the upstream
  // descriptor, and a plain property with the same name would just be ignored.
  feedSource: 'snapshot',
  liveError: null,
  origin: null,
  destination: null,
  lineFilter: null,
  selectedBus: null,
  picking: null,          // 'origin' | 'destination' | null
  listeners: [],

  get totals() {
    return (this.data && this.data.totals) || { lines: 0, buses: 0, online: 0, stale: 0, offline: 0, moving: 0 };
  },
  get source() { return (this.data && this.data.source) || {}; },
  get failures() { return (this.data && this.data.failures) || []; },
  get lines() { return (this.data && this.data.lines) || []; },
  get stops() { return (this.data && this.data.stops) || []; },

  line(id) { return this.lines.find(l => l.id === id) || null; },

  busKey(bus, line) { return `${line.id}:${bus.id}`; },

  allBuses() {
    const out = [];
    this.lines.forEach(line => line.buses.forEach(bus => out.push({ bus, line })));
    return out;
  },

  visibleBuses() {
    if (!this.lineFilter) return this.allBuses();
    const line = this.line(this.lineFilter);
    return line ? line.buses.map(bus => ({ bus, line })) : [];
  },

  getSelected() {
    if (!this.selectedBus) return null;
    return this.allBuses().find(({ bus, line }) => this.busKey(bus, line) === this.selectedBus) || null;
  },

  // Places offered in the From / To pickers. The tracker has no stop table, so the
  // only real places we can offer are the clusters the fleet actually reports from.
  places() {
    return this.stops.map(s => ({
      id: s.id,
      label: shortPlaceName(s.name),
      sub: `${s.buses} bus${s.buses === 1 ? '' : 'es'} reporting here`,
      lat: s.lat,
      lng: s.lng
    }));
  },

  lineAverageSpeed(line) {
    const moving = line.buses.filter(b => b.status === 'online' && b.speed_kmh > 3);
    if (moving.length) return moving.reduce((sum, b) => sum + b.speed_kmh, 0) / moving.length;
    const any = line.buses.filter(b => b.status === 'online' && b.speed_kmh > 0);
    if (any.length) return any.reduce((sum, b) => sum + b.speed_kmh, 0) / any.length;
    return 18;
  },

  // Time for one bus to reach a point. Uses the bus's own live speed when it is
  // actually moving and its line's live average when it is not, so a bus parked at
  // the depot is not reported as arriving in four minutes. A bus whose last fix is
  // already stale is still listed, but flagged: its position is a guess by now.
  eta(bus, line, target) {
    if (!bus || !target || bus.lat === null) return null;
    const straight = haversineKm(bus.lat, bus.lng, target.lat, target.lng);
    const km = straight * ATARA_ROAD_WINDING;
    const live = bus.status === 'online';
    const measured = live && bus.speed_kmh > 3 ? bus.speed_kmh : this.lineAverageSpeed(line);
    const speed = Math.min(ATARA_SPEED_RANGE[1], Math.max(ATARA_SPEED_RANGE[0], measured));
    const minutes = (km / (speed / trafficFactor())) * 60;
    return {
      km,
      straightKm: straight,
      minutes: km < 0.12 ? 0 : minutes,
      speedKmh: Math.round(speed * 10) / 10,
      usingLiveSpeed: live && bus.speed_kmh > 3,
      reliable: live
    };
  },

  nearestStops(bus, limit) {
    if (!bus || bus.lat === null) return [];
    return this.stops
      .map(stop => ({ stop, km: haversineKm(bus.lat, bus.lng, stop.lat, stop.lng) }))
      .sort((a, b) => a.km - b.km)
      .slice(0, limit || 3);
  },

  onUpdate(fn) { this.listeners.push(fn); },
  emit() { this.listeners.forEach(fn => fn(this)); },

  setOrigin(place) { this.origin = place; this.selectedBus = null; this.emit(); },
  setDestination(place) { this.destination = place; this.selectedBus = null; this.emit(); },
  swap() {
    const o = this.origin;
    this.origin = this.destination;
    this.destination = o;
    this.emit();
  },
  setLine(id) { this.lineFilter = id || null; this.emit(); },
  selectBus(key) { this.selectedBus = key; this.emit(); },
  setPicking(which) { this.picking = which; this.emit(); },

  // Journey survives a page reload and a link from the landing page. The label is
  // carried too, otherwise a place chosen by name arrives on the map as "Map point".
  toHash() {
    const part = v => v
      ? `${v.lat.toFixed(5)},${v.lng.toFixed(5)},${encodeURIComponent(v.label || '')}`
      : '';
    const bits = [];
    if (this.origin) bits.push(`from=${part(this.origin)}`);
    if (this.destination) bits.push(`to=${part(this.destination)}`);
    if (this.lineFilter) bits.push(`line=${this.lineFilter}`);
    return bits.join('&');
  },

  fromHash(hash) {
    const params = new URLSearchParams((hash || '').replace(/^#/, ''));
    const read = key => {
      const raw = params.get(key);
      if (!raw) return null;
      const [lat, lng, ...rest] = raw.split(',');
      const numLat = Number(lat);
      const numLng = Number(lng);
      if (!Number.isFinite(numLat) || !Number.isFinite(numLng)) return null;
      let label = 'Map point';
      let sub = 'Chosen on the map';
      try {
        const decoded = decodeURIComponent(rest.join(','));
        if (decoded) { label = decoded; sub = 'From your journey'; }
      } catch (err) { /* keep the generic label */ }
      return { lat: numLat, lng: numLng, label, sub };
    };
    this.origin = read('from');
    this.destination = read('to');
    this.lineFilter = params.get('line');
  },

  /* Live endpoint first, committed snapshot second.

     The live endpoint is the only source that can be seconds old. If it is
     unreachable the snapshot is still shown rather than an empty map, but the
     source is recorded so the status line can tell the truth about how fresh
     the positions on screen actually are. */
  async load() {
    if (ATARA_LIVE_URL) {
      try {
        const res = await fetch(`${ATARA_LIVE_URL}?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (Array.isArray(data.lines) && data.lines.length) {
          this.setData(data, 'live');
          return;
        }
        this.liveError = 'live endpoint returned no lines';
      } catch (err) {
        this.liveError = String((err && err.message) || err);
      }
    }

    try {
      const res = await fetch(`${ATARA_DATA_URL}?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.setData(await res.json(), 'snapshot');
      return;
    } catch (err) {
      if (typeof window.ATARA_LIVE === 'undefined') {
        this.error = 'Live feed unavailable — run atara/tools/fetch_live.py';
        this.emit();
        return;
      }
    }
    this.setData(window.ATARA_LIVE, 'bundled');
  },

  setData(data, source) {
    this.data = data;
    this.error = null;
    this.loadedAt = Date.now();
    this.feedSource = source || this.feedSource || 'snapshot';
    this.rebaseAges();
    this.emit();
  },

  // Snapshot ages are computed when it is written. Between refreshes they only ever
  // count upwards from the newest fix, so a bus can go stale without a new pull.
  // Thresholds come from the snapshot, because they have to match the cadence the
  // collector was actually run at.
  rebaseAges() {
    if (!this.data) return;
    const now = Date.now();
    const t = (this.data && this.data.thresholds) || {};
    const onlineMax = t.online_s || 120;
    const staleMax = t.stale_s || 900;
    this.lines.forEach(line => line.buses.forEach(bus => {
      if (!bus.last_seen_ms) return;
      bus.age_s = Math.max(0, Math.round((now - bus.last_seen_ms) / 1000));
      bus.status = bus.age_s <= onlineMax ? 'online' : bus.age_s <= staleMax ? 'stale' : 'offline';
    }));
  },

  start() {
    this.load();
    setInterval(() => this.load(), ATARA_REFRESH_MS);
  }
};

window.ATARA = ATARA;
window.ATARA_HELPERS = { haversineKm, trafficFactor, formatAge, formatClock, formatMinutes, formatKm, shortPlaceName };
