/* Atara app core.

   Everything the journey screen needs, with no dependency on a network geocoder
   and no third party at runtime:

     * where the person is            -> browser geolocation, or a map pin
     * what the bus stops are called   -> OpenStreetMap, baked into places.json
     * where the buses are right now   -> the live GpsGate snapshot

   The operator feed carries vehicle positions but no route geometry, no ordered
   stops and no timetable. So nothing here invents a stop sequence. A journey is
   built only from distances that can be measured, and every duration is shown
   to the passenger as an estimate.
*/
(function () {
  'use strict';

  const { haversineKm, formatMinutes, formatKm } = window.ATARA_HELPERS;

  // Captured while this file is still evaluating. By the time Places.load() runs
  // from a DOMContentLoaded handler, document.currentScript is already null.
  const SELF_URL = (document.currentScript && document.currentScript.src) || '';
  const PLACES_URL = SELF_URL
    ? new URL('../data/places.json', SELF_URL).href
    : 'data/places.json';

  // Walking and road distances.
  const WINDING = 1.3;          // straight line under-reads an urban street grid
  const WALK_KMH = 4.6;         // comfortable urban walking pace
  const BUS_MIN_KMH = 8;        // below this a vehicle in traffic is crawling
  const BUS_MAX_KMH = 48;       // motorway-ish, used only to keep junk GPS sane
  const BUS_PICKUP_RADIUS_M = 2600;  // a bus further out than this is not "coming to you"
  const ARRIVED_M = 160;        // close enough to call it "you are here"

  // A dot product on the unit circle: 1 means heading exactly at the target.
  function alignment(fromLat, fromLng, headingDeg, toLat, toLng) {
    if (headingDeg === null || headingDeg === undefined) return null;
    const f = fromLat * Math.PI / 180, t = toLat * Math.PI / 180;
    const dLng = (toLng - fromLng) * Math.PI / 180;
    const bearing = Math.atan2(
      Math.sin(dLng) * Math.cos(t),
      Math.cos(f) * Math.sin(t) - Math.sin(f) * Math.cos(t) * Math.cos(dLng)
    ) * 180 / Math.PI;
    const diff = ((bearing - headingDeg + 540) % 360) - 180;
    return Math.cos(diff * Math.PI / 180);
  }

  function bearingDeg(fromLat, fromLng, toLat, toLng) {
    const f = fromLat * Math.PI / 180, t = toLat * Math.PI / 180;
    const dLng = (toLng - fromLng) * Math.PI / 180;
    return (Math.atan2(
      Math.sin(dLng) * Math.cos(t),
      Math.cos(f) * Math.sin(t) - Math.sin(f) * Math.cos(t) * Math.cos(dLng)
    ) * 180 / Math.PI + 360) % 360;
  }

  /* ---------- gazetteer search ---------- */

  const Places = {
    data: null,
    index: [],

    load() {
      return fetch(PLACES_URL)
        .then(r => r.json())
        .then(d => {
          this.data = d;
          this.index = (d.stops || []).map(s => ({
            key: 'stop:' + s.name, name: s.name, lat: s.lat, lon: s.lon,
            kind: 'bus_stop', system: s.system, side: s.side
          })).concat((d.places || []).map(p => ({
            key: 'place:' + p.name, name: p.name, alias: p.aliases,
            lat: p.lat, lon: p.lon, kind: p.kind, system: p.system
          })));
          return this.index.length;
        });
    },

    // Ranked so that the thing a person most likely meant comes first: exact
    // prefix on the name, then a prefix, then a word match, then anything
    // containing the text. Nearness to the user breaks ties.
    search(query, near, limit) {
      const q = norm(query);
      if (q.length < 2) return [];
      const terms = q.split(/\s+/);
      const out = [];
      for (const e of this.index) {
        const name = norm(e.name);
        const alias = norm(e.alias || '');
        let score = 0;
        if (name === q || alias === q) score = 1000;
        else if (name.startsWith(q) || alias.startsWith(q)) score = 800;
        else if (terms.every(t => name.includes(t) || alias.includes(t))) score = 600;
        else if (name.includes(q) || alias.includes(q)) score = 400;
        else continue;
        if (e.kind === 'bus_stop') score -= 120;   // prefer landmarks over kerbs
        if (near) {
          const km = haversineKm(near.lat, near.lon, e.lat, e.lon);
          score -= Math.min(200, km * 8);
          e._km = km;
        }
        out.push({ entry: e, score });
      }
      out.sort((a, b) => b.score - a.score);
      return out.slice(0, limit || 8).map(o => o.entry);
    },

    nearestStop(lat, lon, maxM) {
      let best = null, bestD = Infinity;
      for (const e of this.index) {
        if (e.kind !== 'bus_stop') continue;
        const d = haversineKm(lat, lon, e.lat, e.lon) * 1000;
        if (d < bestD) { bestD = d; best = e; }
      }
      return (!maxM || bestD <= maxM) ? { stop: best, metres: Math.round(bestD) } : null;
    },

    /* Candidate kerbs near a point, closest first. The planner needs a short
       list rather than only the single nearest stop, because the stop that is
       closest to you is often not the stop that is on your way. */
    stopsNear(lat, lon, maxM, limit) {
      const out = [];
      for (const e of this.index) {
        if (e.kind !== 'bus_stop') continue;
        const d = haversineKm(lat, lon, e.lat, e.lon) * 1000;
        if (d <= maxM) out.push({ stop: e, metres: Math.round(d) });
      }
      out.sort((a, b) => a.metres - b.metres);
      return out.slice(0, limit || 6);
    }
  };

  // Search must ignore Albanian diacritics: someone types "qender", not "qendër",
  // so "qender" has to match "Qendër". NFD splits the accent off, then we drop it.
  function norm(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\u00b7\u2022\u2019]/g, ' ')
      .trim();
  }

  /* ---------- live bus layer ---------- */

  const Buses = {
    /* Every vehicle with a position, newest first. Offline vehicles are included
       on purpose: if the collector stops, a map that silently empties looks
       broken, whereas dimmed vehicles with their real last-seen time tells the
       truth about what Atara knows and when it knew it. */
    all() {
      const out = [];
      const lines = (window.ATARA && ATARA.data && ATARA.data.lines) || [];
      for (const line of lines) {
        for (const b of (line.buses || [])) {
          if (b.lat === null || b.lng === null) continue;
          out.push({ bus: b, line });
        }
      }
      out.sort((a, b) => (a.bus.age_s || 0) - (b.bus.age_s || 0));
      return out;
    },

    /* Only vehicles fresh enough to plan a journey on. The cut-off comes from
       the snapshot's own online threshold, because a collector running on a five
       minute cadence legitimately produces vehicles several minutes old, and a
       fixed seven minute ceiling would plan with an empty fleet. */
    plannable(maxAgeS) {
      const t = (window.ATARA && ATARA.data && ATARA.data.thresholds) || {};
      const limit = maxAgeS || t.online_s || 600;
      return this.all().filter(i => i.bus.status !== 'offline' && (i.bus.age_s || 0) <= limit);
    },

    // What speed to plan with. A stationary bus in traffic will report 0, which
    // would give an infinite ETA, so fall back to the line's own average.
    planningSpeed(item) {
      const s = item.bus.speed_kmh;
      if (s >= BUS_MIN_KMH) return Math.min(s, BUS_MAX_KMH);
      const avg = item.line.stats && item.line.stats.avg_speed_kmh;
      if (avg >= BUS_MIN_KMH) return Math.min(avg, BUS_MAX_KMH);
      return 18;
    },

    find(id) {
      for (const item of this.all()) if (item.bus.id === id) return item;
      return null;
    }
  };

  /* ---------- journey planning ---------- */

  const Plan = {
    /* Build the best honest journey we can from where the person is to where
       they want to be.

       Because the feed has no route graph, the board and alight stops are the
       stops closest to the origin and to the destination, and the vehicle is
       the one that will reach the boarding stop soonest and then pass closest
       to the destination. That is a real, checkable statement, and it is the
       honest one. */
    build(origin, destination) {
      if (!origin || !destination) return null;

      const plannable = Buses.plannable();

      // How much service each kerb has right now, expressed in metres of walking,
      // so the walk totals below stay comparable.
      const service = new Map();
      for (const item of plannable) {
        for (const s of Places.stopsNear(item.bus.lat, item.bus.lng, 900, 1)) {
          service.set(s.stop.key, (service.get(s.stop.key) || 0) + 1);
        }
      }
      const serviceBonus = key => Math.min(service.get(key) || 0, 6) * 60;

      const nearOrigin = Places.stopsNear(origin.lat, origin.lon, 1200, 6);
      const nearDest = Places.stopsNear(destination.lat, destination.lon, 1500, 8);
      if (!nearOrigin.length || !nearDest.length) {
        return { ok: false, reason: !nearOrigin.length ? 'no_stop_near_origin' : 'no_stop_near_destination' };
      }

      /* The direct walk, which is the baseline any bus has to beat. It has to be
         measured origin to destination, never stop to stop, or a boarding kerb in
         the centre and an alighting kerb seven kilometres away would report as a
         three hundred metre walk. */
      const directWalkM = haversineKm(origin.lat, origin.lon, destination.lat, destination.lon) * 1000 * WINDING;
      const walkAllMin = directWalkM / 1000 / WALK_KMH * 60;

      /* Choose the boarding kerb, the alighting kerb and the vehicle together.

         Picking the nearest stop and then the nearest bus separately produces
         plans that contradict themselves: walk to this kerb, then catch a bus
         that is nowhere near it. Searching the three at once means the stop
         offered is one the chosen vehicle is actually near, so the wait estimate
         and the guidance that follows describe the same journey. */
      const options = [];
      let walkBest = null, walkBestScore = Infinity;

      for (const nb of nearOrigin) {
        for (const na of nearDest) {
          if (nb.stop.key === na.stop.key) continue;
          const walkIn = nb.metres * WINDING;
          const walkOut = na.metres * WINDING;
          const walkScore = walkIn + walkOut - serviceBonus(na.stop.key);
          if (walkScore < walkBestScore) {
            walkBestScore = walkScore;
            walkBest = { board: nb, alight: na, walkIn, walkOut };
          }

          for (const item of plannable) {
            const b = item.bus;
            const toBoardKm = haversineKm(b.lat, b.lng, nb.stop.lat, nb.stop.lon);
            if (toBoardKm * 1000 > BUS_PICKUP_RADIUS_M) continue;

            const toAlightKm = haversineKm(b.lat, b.lng, na.stop.lat, na.stop.lon);
            // Keep the vehicle only if it is closing on the alighting kerb, or
            // pointing that way. Rejecting on heading alone would discard every
            // stationary bus, which still holds a usable bearing.
            const aim = alignment(b.lat, b.lng, b.heading, na.stop.lat, na.stop.lon);
            if (!(toAlightKm <= toBoardKm) && !(aim !== null && aim > 0)) continue;

            const speed = Buses.planningSpeed(item);
            const waitMin = (toBoardKm * WINDING) / speed * 60;
            const rideMin = (toAlightKm * WINDING) / speed * 60;
            const totalMin = waitMin + rideMin
              + walkIn / 1000 / WALK_KMH * 60 + walkOut / 1000 / WALK_KMH * 60;

            let score = totalMin;
            if (b.speed_kmh >= BUS_MIN_KMH) score -= 2.0;      // moving beats parked
            if (aim !== null && aim > 0) score -= aim * 2.0;   // heading the right way
            if (b.ignition === false) score += 4;               // engine off, not running

            options.push({
              board: nb, alight: na, item, speed,
              walkIn, walkOut, waitMin, rideMin, totalMin, score,
              toBoardKm, toAlightKm, aim,
              toDestinationKm: haversineKm(b.lat, b.lng, destination.lat, destination.lon)
            });
          }
        }
      }

      /* Only suggest a bus when it genuinely helps: it has to beat walking, and
         the trip has to be long enough that standing at a kerb is worth it.
         Recommending a bus for a three hundred metre hop would be true and
         completely useless. */
      const WORTH_TRAIN_MIN = 8;
      const SAVES_MIN = 3;
      const viable = options.filter(
        o => walkAllMin >= WORTH_TRAIN_MIN && o.totalMin <= walkAllMin - SAVES_MIN
      );
      viable.sort((a, b) => a.totalMin - b.totalMin);
      const best = viable[0] || null;

      const use = best || walkBest;
      const walkToStopM = use.walkIn;
      const walkToDestM = use.walkOut;
      const board = use.board;
      const alight = use.alight;

      const steps = [];
      steps.push({
        type: 'walk',
        to: board.stop.name,
        metres: Math.round(walkToStopM),
        minutes: Math.max(1, Math.round(walkToStopM / 1000 / WALK_KMH * 60)),
        stop: board.stop,
        detail: `${Math.round(board.metres / 10) * 10} m away`
      });

      if (best) {
        steps.push({
          type: 'ride',
          line: best.item.line,
          bus: best.item.bus,
          to: alight.stop.name,
          waitMinutes: Math.max(1, Math.round(best.waitMin)),
          minutes: Math.max(1, Math.round(best.rideMin)),
          alightDistanceM: Math.round(best.toAlightKm * 1000),
          headingToward: best.aim === null ? null : best.aim > 0.1,
          detail: best.item.line.name
        });
      }

      steps.push({
        type: 'walk',
        to: destination.name,
        metres: Math.round(walkToDestM),
        minutes: Math.max(1, Math.round(walkToDestM / 1000 / WALK_KMH * 60)),
        stop: alight.stop,
        detail: `from ${alight.stop.name}`
      });

      return {
        ok: true,
        origin, destination,
        board: board.stop,
        alight: alight.stop,
        target: best,
        candidates: viable,
        walkAllMin,
        steps,
        totalMinutes: steps.reduce((s, x) => s + (x.minutes || 0), 0),
        noVehicle: !best
      };
    }
  };

  /* ---------- guidance ---------- */

  /* The whole guidance screen is a function of these three points, so it can be
     re-evaluated on every feed update instead of being a scripted animation. */
  const Guide = {
    phase(plan, user) {
      if (!plan || !plan.ok || !plan.target) return 'unavailable';
      const t = plan.target;
      const bus = t.item.bus;

      const userToBoardM = haversineKm(user.lat, user.lon, plan.board.lat, plan.board.lon) * 1000;
      if (userToBoardM > 70) return 'walk_to_stop';

      // Once at the kerb, the question is only "how far away is my bus".
      const busToBoardM = haversineKm(bus.lat, bus.lng, plan.board.lat, plan.board.lon) * 1000;
      if (busToBoardM > 120) return 'wait_for_bus';

      // On board. The alighting trigger is the bus getting near the stop where
      // the onward walk starts, not the destination pin, because that stop is
      // the last place the bus is known to help.
      const busToAlightM = haversineKm(bus.lat, bus.lng, plan.alight.lat, plan.alight.lon) * 1000;
      if (busToAlightM > ARRIVED_M) return 'on_board';

      const meToDestM = haversineKm(user.lat, user.lon, plan.destination.lat, plan.destination.lon) * 1000;
      if (meToDestM > 60) return 'walk_to_destination';

      return 'arrived';
    },

    /* Live numbers for the phase the person is actually in. */
    detail(phase, plan, user) {
      const bus = plan.target.item.bus;
      const speed = Buses.planningSpeed(plan.target.item);
      const busToBoardM = haversineKm(bus.lat, bus.lng, plan.board.lat, plan.board.lon) * 1000;
      const busToAlightM = haversineKm(bus.lat, bus.lng, plan.alight.lat, plan.alight.lon) * 1000;
      const userToBoardM = haversineKm(user.lat, user.lon, plan.board.lat, plan.board.lon) * 1000;

      if (phase === 'walk_to_stop') {
        return {
          heading: bearingDeg(user.lat, user.lon, plan.board.lat, plan.board.lon),
          metres: Math.round(userToBoardM),
          lead: 'Walk to ' + plan.board.name,
          sub: `${Math.round(userToBoardM / 10) * 10} m to the stop`
        };
      }
      if (phase === 'wait_for_bus') {
        const mins = Math.max(1, Math.round((busToBoardM * WINDING) / speed / 1000 * 60));
        return {
          heading: bearingDeg(user.lat, user.lon, bus.lat, bus.lng),
          metres: Math.round(busToBoardM),
          lead: 'Wait for line ' + plan.target.item.line.number,
          sub: `${plan.target.item.line.name} is ${Math.round(busToBoardM / 10) * 10} m away, about ${formatMinutes(mins)}`,
          busId: bus.id
        };
      }
      if (phase === 'on_board') {
        const mins = Math.max(1, Math.round((busToAlightM * WINDING) / speed / 1000 * 60));
        return {
          heading: bus.heading,
          metres: Math.round(busToAlightM),
          lead: 'Stay on line ' + plan.target.item.line.number,
          sub: `Get off in about ${formatMinutes(mins)}, at ${plan.alight.name}`,
          busId: bus.id
        };
      }
      if (phase === 'walk_to_destination') {
        const d = haversineKm(user.lat, user.lon, plan.destination.lat, plan.destination.lon) * 1000;
        return {
          heading: bearingDeg(user.lat, user.lon, plan.destination.lat, plan.destination.lon),
          metres: Math.round(d),
          lead: 'Walk to ' + plan.destination.name,
          sub: `${Math.round(d / 10) * 10} m to go`
        };
      }
      return { heading: 0, metres: 0, lead: 'You have arrived', sub: plan.destination.name };
    }
  };

  window.ATARA_APP = { Places, Buses, Plan, Guide, bearingDeg, ARRIVED_M, WINDING };
})();
