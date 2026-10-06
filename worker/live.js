/**
 * Live fleet positions for Atara.
 *
 * GitHub Pages can only serve files that were committed, so positions read from
 * there are always as old as the last successful push. This worker holds the
 * GpsGate credentials, pulls the fleet on request, and answers with exactly the
 * same JSON shape as data/live.json so the site can treat both the same way.
 *
 * Credentials live in Worker secrets, never in this file:
 *   wrangler secret put FLEET_PASSWORD_BUS
 *   wrangler secret put FLEET_PASSWORD_BUSS
 *   ... one per account below, named FLEET_PASSWORD_<USERNAME>.
 *
 * One bad account must not take the fleet down, so each line is fetched
 * independently and a failure is reported rather than thrown.
 */

const HOST = 'https://bus.atd-grp.com';
const APP_ID = 14;
const VERSION = '4.0.0.5777';
const ONLINE_MAX_AGE_S = 600;
const STALE_MAX_AGE_S = 3600;

// Teltonika recordData field ids, matching tools/gpsgate.py.
const FIELD_VOLTAGE = 9;
const FIELD_SPEED = 34;
const FIELD_GSM = 39;
const FIELD_IGNITION = 44;
const FIELD_SATELLITES = 52;
const FIELD_KOFANO = 2418;

const LINES = [
  { id: 'L1', number: '1', name: '1-Linja Kamez', username: 'bus', view_id: 24, color: '#0047DE' },
  { id: 'L2', number: '2', name: '2-Linja Paskuqan', username: 'buss', view_id: 51, color: '#0e9f6e' },
  { id: 'L3', number: '3', name: 'Tag Instituti Bujqesor', username: 'instituti', view_id: 187, color: '#b45309' },
  { id: 'L4', number: '4', name: '4-Linja Unaza Perendimore Valias', username: 'unazaperindimore', view_id: 172, color: '#7c3aed' },
  { id: 'L5', number: '5', name: '5-Linja Unaza Lindore', username: 'unazalindore', view_id: 171, color: '#db2777' },
  { id: 'L6', number: '6', name: '6-Linja Bathore Zallher', username: 'bathorezallherr', view_id: 173, color: '#0f766e' },
  { id: 'L7', number: '7', name: '7-Linja Unaza Paskuqan', username: 'unazapaskuqan', view_id: 169, color: '#c2410c' }
];

/* The seven accounts are separate logins, so one pull is seven logins. Holding
   the answer briefly keeps the upstream from being hammered by every open tab,
   while still being far fresher than a committed snapshot. */
const CACHE_TTL_MS = 12000;
let cache = { at: 0, body: null };
let inflight = null;

function statusOf(ageS) {
  if (ageS <= ONLINE_MAX_AGE_S) return 'online';
  if (ageS <= STALE_MAX_AGE_S) return 'stale';
  return 'offline';
}

function field(record, key) {
  const entry = (record.recordData || {})[String(key)];
  return entry && typeof entry === 'object' ? entry.value : null;
}

function normalise(record, nowMs) {
  const track = record.trackPoint || {};
  const pos = track.pos || {};
  const vel = track.vel || {};
  let speedMs = field(record, FIELD_SPEED);
  if (speedMs === null || speedMs === undefined) speedMs = vel.speed || 0;
  const lastSeenMs = track.utc || record.deviceActivity || 0;
  const ageS = lastSeenMs ? Math.max(0, Math.floor((nowMs - lastSeenMs) / 1000)) : null;
  const device = (record.devices || [{}])[0];
  return {
    id: record.id,
    name: record.name || String(record.id),
    driver: record.username || null,
    lat: pos.lat ?? null,
    lng: pos.lng ?? null,
    alt: pos.alt ?? null,
    speed_kmh: Math.round((speedMs || 0) * 3.6 * 10) / 10,
    speed_ms: Math.round((speedMs || 0) * 100) / 100,
    heading: vel.heading ?? null,
    ignition: field(record, FIELD_IGNITION),
    satellites: field(record, FIELD_SATELLITES),
    gsm: field(record, FIELD_GSM),
    voltage: field(record, FIELD_VOLTAGE),
    kofano: field(record, FIELD_KOFANO),
    protocol: record.lastTransportProtocol ?? null,
    device: device.name ?? null,
    last_seen_ms: lastSeenMs || null,
    age_s: ageS,
    status: ageS === null ? 'offline' : statusOf(ageS)
  };
}

function statsOf(vehicles) {
  const moving = vehicles.filter(v => v.status === 'online' && v.speed_kmh > 3);
  const speeds = moving.map(v => v.speed_kmh).filter(v => v > 0);
  return {
    online: vehicles.filter(v => v.status === 'online').length,
    stale: vehicles.filter(v => v.status === 'stale').length,
    offline: vehicles.filter(v => v.status === 'offline').length,
    moving: moving.length,
    avg_speed_kmh: speeds.length
      ? Math.round((speeds.reduce((a, b) => a + b, 0) / speeds.length) * 10) / 10
      : null
  };
}

/* GpsGate serialises dates as `new Date(<ms>)`, which is not valid JSON. */
function loads(text) {
  return JSON.parse(text.replace(/new Date\((-?\d+)\)/g, '$1'));
}

class GpsGate {
  constructor() {
    this.cookie = '';
    this.seq = 0;
  }

  async rpc(namespace, method, params) {
    this.seq += 1;
    const payload = JSON.stringify({
      id: this.seq, method, params: { ...params, appId: APP_ID }
    });
    const url = (method === 'Login' || method === 'Logout')
      ? `${HOST}/Services/Directory.ashx?_METHOD=${method}&v=${VERSION}`
      : `${HOST}/comGpsGate/rpc/${namespace}?_METHOD=${method}&v=${VERSION}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: `${HOST}/m/index.html`,
        'User-Agent': 'Atara live fleet reader',
        ...(this.cookie ? { Cookie: this.cookie } : {})
      },
      body: payload
    });
    if (!res.ok) throw new Error(`${namespace}.${method} -> HTTP ${res.status}`);

    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      const parts = setCookie.split(/,(?=\s*[^;=]+=)/).map(s => s.trim().split(';')[0]);
      const jar = new Map(this.cookie.split('; ').filter(Boolean).map(c => c.split('=')));
      parts.forEach(c => {
        const i = c.indexOf('=');
        if (i > 0) jar.set(c.slice(0, i), c.slice(i + 1));
      });
      this.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    }

    const body = loads(await res.text());
    if (body.error) throw new Error(`${namespace}.${method} -> ${body.error.message}`);
    return body.result;
  }

  async login(username, password) {
    await this.rpc('Directory', 'Login', {
      strUserName: username, strPassword: password, bStaySignedIn: true
    });
  }

  logout() {
    return this.rpc('Directory', 'Logout', {}).catch(() => {});
  }
}

async function fetchLine(line, nowMs, env) {
  const password = env[`FLEET_PASSWORD_${line.username.toUpperCase()}`];
  if (!password) throw new Error('no password configured');

  const client = new GpsGate();
  try {
    await client.login(line.username, password);
    const views = ((await client.rpc('View', 'GetViews', {})) || {}).views || [];
    const view = views.find(v => v.id === line.view_id) || views[0];
    if (!view) throw new Error('account exposes no view');
    const records = ((await client.rpc('Directory', 'GetLatestUserDataByView', {
      iViewID: view.id
    })) || {}).result || [];

    const buses = records.map(r => normalise(r, nowMs));
    buses.sort((a, b) => {
      if ((a.status !== 'online') !== (b.status !== 'online')) return a.status === 'online' ? -1 : 1;
      return (a.age_s ?? 1e9) - (b.age_s ?? 1e9);
    });
    return {
      id: line.id, number: line.number, name: line.name, color: line.color,
      view_id: view.id, view_name: view.name, tag_ids: view.tagIDs || [],
      stats: statsOf(buses), buses
    };
  } finally {
    await client.logout();
  }
}

async function collect(env) {
  const nowMs = Date.now();
  const settled = await Promise.all(
    LINES.map(async line => {
      try {
        return { line: await fetchLine(line, nowMs, env) };
      } catch (err) {
        return { id: line.id, name: line.name, error: String((err && err.message) || err) };
      }
    })
  );

  const lines = [];
  const failures = [];
  for (const r of settled) {
    if (r.line) lines.push(r.line);
    else failures.push({ line: r.name, error: r.error });
  }
  lines.sort((a, b) =>
    LINES.findIndex(l => l.id === a.id) - LINES.findIndex(l => l.id === b.id));

  const all = lines.flatMap(l => l.buses);
  return {
    generated_at: new Date(nowMs).toISOString(),
    generated_ms: nowMs,
    source: { system: 'GpsGate Server', host: HOST, app_id: APP_ID, version: VERSION, live: true },
    thresholds: { online_s: ONLINE_MAX_AGE_S, stale_s: STALE_MAX_AGE_S },
    totals: {
      lines: lines.length,
      buses: all.length,
      online: all.filter(b => b.status === 'online').length,
      stale: all.filter(b => b.status === 'stale').length,
      offline: all.filter(b => b.status === 'offline').length,
      moving: all.filter(b => b.status === 'online' && b.speed_kmh > 3).length
    },
    lines,
    failures
  };
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store'
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (cache.body && Date.now() - cache.at < CACHE_TTL_MS) {
      return new Response(cache.body, { headers: { ...CORS, 'X-Atara-Cache': 'hit' } });
    }

    // Collapse a burst of parallel requests onto one upstream pull.
    if (!inflight) {
      inflight = collect(env)
        .then(data => {
          cache = { at: Date.now(), body: JSON.stringify(data) };
          return cache.body;
        })
        .finally(() => { inflight = null; });
    }

    try {
      const body = await inflight;
      return new Response(body, { headers: { ...CORS, 'X-Atara-Cache': 'miss' } });
    } catch (err) {
      // Never serve a fabricated fleet. If the upstream fails, say so plainly.
      const last = cache.body;
      if (last) {
        return new Response(last, {
          status: 200,
          headers: {
            ...CORS,
            'X-Atara-Cache': 'stale',
            'X-Atara-Error': String((err && err.message) || err)
          }
        });
      }
      return new Response(
        JSON.stringify({ error: String((err && err.message) || err), lines: [], failures: [] }),
        { status: 502, headers: CORS }
      );
    }
  }
};