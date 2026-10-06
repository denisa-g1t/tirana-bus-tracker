/* Atara app controller.

   The rule the whole screen is built around: at any moment the person is shown
   one thing to do, not a list of everything that could happen. The plan is
   available underneath for reassurance, but the guidance card carries a single
   instruction, and it is re-derived from live positions on every feed update
   rather than played back as a script.
*/
(function () {
  'use strict';

  const { Places, Buses, Plan, Guide, bearingDeg, ARRIVED_M } = window.ATARA_APP;
  const { formatMinutes, formatKm } = window.ATARA_HELPERS;
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const TIRANA = [41.355, 19.79];

  // Where the person is, and how we know it.
  const User = {
    lat: null, lon: null, source: 'unknown',   // 'gps' | 'picked' | 'default'
    label: 'Tirana',
    accuracy: null
  };

  let map = null;
  let plan = null;
  let guiding = false;
  let pickedFor = null;            // 'origin' | 'destination'
  let activeSuggest = null;

  const layers = { buses: null, user: null, route: null, points: null };
  const busMarkers = new Map();

  const $ = id => document.getElementById(id);

  /* ---------------- map ---------------- */

  function initMap() {
    map = L.map('map', { zoomControl: false, attributionControl: true })
      .setView(TIRANA, 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    L.control.zoom({ position: 'topright' }).addTo(map);

    layers.buses = L.layerGroup().addTo(map);
    layers.points = L.layerGroup().addTo(map);
    layers.route = L.layerGroup().addTo(map);

    // Tapping the map sets the endpoint the user is currently editing, which is
    // the only way to use Atara for a place the gazetteer does not know.
    map.on('click', e => {
      if (!pickedFor) return;
      const p = { lat: e.latlng.lat, lon: e.latlng.lng, name: 'Point on the map', kind: 'picked' };
      if (pickedFor === 'origin') setOrigin(p, 'picked'); else setDestination(p, 'picked');
      pickedFor = null;
      setHint('Point set. Tap the other box to set the other end.');
    });
  }

  /* ---------------- bus markers ---------------- */

  /* Vehicles that have not reported recently are still shown, but dimmed, and
     the map says how long ago each one was last heard. Hiding them would make a
     stalled collector look like an empty city, which is the opposite of honest. */
  function busIcon(color, bus, isTarget) {
    const age = bus.age_s || 0;
    const cls = bus.status === 'offline' ? 'is-gone' : (bus.status === 'stale' ? 'is-late' : '');
    return L.divIcon({
      className: '',
      html: `<span class="bus-dot ${cls}${isTarget ? ' is-target' : ''}" style="--c:${esc(color)}"></span>`,
      iconSize: isTarget ? [20, 20] : [14, 14],
      iconAnchor: isTarget ? [10, 10] : [7, 7]
    });
  }

  function drawBuses() {
    layers.buses.clearLayers();
    busMarkers.clear();
    const targetId = guiding && plan && plan.target ? plan.target.item.bus.id : null;
    const f = window.ATARA_HELPERS;

    for (const item of Buses.all()) {
      const b = item.bus;
      const m = L.marker([b.lat, b.lng], {
        icon: busIcon(item.line.color, b, b.id === targetId),
        keyboard: false, interactive: true, zIndexOffset: b.id === targetId ? 1000 : 0
      });
      const lastSeen = b.status === 'online'
        ? 'updated ' + f.formatAge(b.age_s)
        : 'last seen ' + f.formatAge(b.age_s);
      m.bindPopup(
        `<div class="bus-pop">
           <span class="bus-pop-line${b.status === 'offline' ? ' is-gone' : ''}" style="--c:${esc(item.line.color)}">Line ${esc(item.line.number)}</span>
           <strong>${esc(item.line.name)}</strong>
           <dl>
             <div><dt>Speed</dt><dd>${Math.round(b.speed_kmh || 0)} km/h</dd></div>
             <div><dt>Occupancy</dt><dd>${esc(b.occupancy_text || 'not reported')}</dd></div>
             <div><dt>Signal</dt><dd>${esc(lastSeen)}</dd></div>
           </dl>
         </div>`, { closeButton: false, offset: [0, -6] });
      m.addTo(layers.buses);
      busMarkers.set(b.id, m);
    }
  }

  function drawUser() {
    if (User.lat === null) return;
    layers.user = L.marker([User.lat, User.lon], {
      icon: L.divIcon({ className: '', html: '<span class="me-dot"><i></i></span>',
        iconSize: [22, 22], iconAnchor: [11, 11] }),
      zIndexOffset: 2000, keyboard: false, interactive: false
    }).addTo(map);
  }

  function moveUser() {
    if (User.lat === null) { drawUser(); return; }
    if (layers.user) layers.user.setLatLng([User.lat, User.lon]);
    else drawUser();
  }

  /* ---------------- route drawing ---------------- */

  function stopPin(label, cls) {
    return L.divIcon({
      className: '',
      html: `<span class="stop-pin ${cls}"><i></i><b>${esc(label)}</b></span>`,
      iconSize: [12, 12], iconAnchor: [6, 6]
    });
  }

  function drawRoute() {
    layers.route.clearLayers();
    layers.points.clearLayers();
    if (!plan || !plan.ok) return;

    const board = [plan.board.lat, plan.board.lon];
    const alight = [plan.alight.lat, plan.alight.lon];
    const dest = [plan.destination.lat, plan.destination.lon];
    const org = [plan.origin.lat, plan.origin.lon];

    // Walk leg, ride leg, walk leg, drawn in the order they are travelled.
    L.polyline([org, board], { color: '#0e9f6e', weight: 5, opacity: .75, dashArray: '2 9', lineCap: 'round' }).addTo(layers.route);
    if (plan.target) {
      const c = plan.target.item.line.color;
      L.polyline([board, alight], { color: c, weight: 6, opacity: .9, lineCap: 'round' }).addTo(layers.route);
    }
    L.polyline([alight, dest], { color: '#0e9f6e', weight: 5, opacity: .75, dashArray: '2 9', lineCap: 'round' }).addTo(layers.route);

    L.marker(board, { icon: stopPin('Board here', 'is-board'), keyboard: false, interactive: true })
      .bindPopup(`<strong>${esc(plan.board.name)}</strong><br>the stop you board at`).addTo(layers.points);
    L.marker(alight, { icon: stopPin('Get off', 'is-alight'), keyboard: false, interactive: true })
      .bindPopup(`<strong>${esc(plan.alight.name)}</strong><br>the stop to leave the bus at`).addTo(layers.points);
    L.marker(dest, { icon: stopPin(plan.destination.name, 'is-dest'), keyboard: false, interactive: true })
      .bindPopup(`<strong>${esc(plan.destination.name)}</strong><br>your destination`).addTo(layers.points);
  }

  function fitPlan() {
    if (!plan || !plan.ok) return;
    const pts = [[plan.origin.lat, plan.origin.lon], [plan.board.lat, plan.board.lon],
                 [plan.alight.lat, plan.alight.lon], [plan.destination.lat, plan.destination.lon]];
    map.fitBounds(L.latLngBounds(pts).pad(0.25));
  }

  /* ---------------- search ---------------- */

  function setHint(t) { $('askHint').textContent = t; }

  function renderSuggest(list, inputId) {
    const ul = $('suggest');
    if (!list.length) { ul.hidden = true; ul.innerHTML = ''; return; }
    ul.hidden = false;
    ul.innerHTML = list.map((e, i) => {
      const km = e._km != null ? ` &middot; ${formatKm(e._km)} away` : '';
      const kind = e.kind === 'bus_stop' ? 'Stop' : (e.kind === 'picked' ? 'Map point' : 'Place');
      return `<li role="option" data-i="${i}" tabindex="-1">
        <span class="s-name">${esc(e.name)}</span>
        <span class="s-meta">${esc(kind)}${km}</span></li>`;
    }).join('');
    ul.dataset.for = inputId;
    activeSuggest = list;
  }

  function wireSearch(inputId, apply) {
    const input = $(inputId);
    let t = null;
    input.addEventListener('input', () => {
      clearTimeout(t);
      const q = input.value.trim();
      pickedFor = null;
      if (q.length < 2) { $('suggest').hidden = true; return; }
      t = setTimeout(() => {
        renderSuggest(Places.search(q, User.lat !== null ? User : null, 8), inputId);
      }, 110);
    });
    input.addEventListener('focus', () => {
      if (input.value.trim().length >= 2) {
        renderSuggest(Places.search(input.value.trim(), User.lat !== null ? User : null, 8), inputId);
      }
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Escape') { $('suggest').hidden = true; input.blur(); }
      if (e.key === 'Enter' && activeSuggest && activeSuggest.length) {
        e.preventDefault();
        apply(activeSuggest[0]);
        $('suggest').hidden = true;
        input.blur();
      }
    });
  }

  $('suggest').addEventListener('mousedown', e => {
    const li = e.target.closest('li[data-i]');
    if (!li || !activeSuggest) return;
    e.preventDefault();
    const entry = activeSuggest[Number(li.dataset.i)];
    if ($('suggest').dataset.for === 'originInput') setOrigin(entry, 'search');
    else setDestination(entry, 'search');
    $('suggest').hidden = true;
  });

  /* ---------------- endpoints ---------------- */

  function setOrigin(p, source) {
    User.lat = p.lat; User.lon = p.lon;
    User.source = source;
    User.label = p.name;
    $('originInput').value = p.name === 'Point on the map' ? '' : p.name;
    $('originInput').placeholder = 'Set by tapping the map';
    moveUser();
    rebuild();
  }

  /* Which bus the passenger wants. Null means "whichever is best", which stays
     the default so the common case is still one tap. Picking a line is a real
     constraint passed into the planner, not a filter applied to its answer. */
  let preferLineId = null;

  function currentOrigin() {
    return User.lat !== null ? { lat: User.lat, lon: User.lon, name: User.label } : null;
  }

  function setDestination(p, source) {
    plan = null;
    $('plan').hidden = true;
    renderPlan(Plan.build(currentOrigin(), p, preferLineId));
  }

  function rebuild() {
    if (!plan || !plan.ok) return;
    plan = Plan.build(currentOrigin(), plan.destination, preferLineId);
    renderPlan(plan);
  }

  /* The lines that can serve this trip, as a row of chips. Each chip carries the
     real time from the live feed, so choosing between two services is a choice
     between two numbers rather than a leap of faith. */
  function renderLinePicker(p) {
    const box = $('linesPick');
    const row = $('linesPickRow');
    const note = $('linesPickNote');
    const options = (p && p.lineOptions) || [];
    row.innerHTML = '';

    if (!p || !p.ok || options.length < 2) {
      box.hidden = true;
      return;
    }
    box.hidden = false;

    const anyGood = options.some(o => o.beatsWalking);
    $('linesPickLabel').textContent = anyGood ? 'Which bus?' : 'Buses that pass near both ends';

    for (const o of options) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'line-chip';
      btn.dataset.lineId = o.id;
      const chosen = o.id === preferLineId;
      if (chosen) btn.classList.add('is-chosen');
      btn.setAttribute('aria-pressed', chosen ? 'true' : 'false');
      if (o.color) btn.style.setProperty('--line', o.color);

      const num = document.createElement('span');
      num.className = 'line-chip-num';
      num.textContent = o.number;

      const name = document.createElement('span');
      name.className = 'line-chip-name';
      name.textContent = o.name;

      btn.append(num, name);
      if (o.beatsWalking) {
        const mins = document.createElement('span');
        mins.className = 'line-chip-mins';
        mins.textContent = formatMinutes(o.best);
        btn.append(mins);
      }
      btn.addEventListener('click', () => {
        preferLineId = chosen ? null : o.id;
        boarded = false;
        rebuild();
      });
      row.append(btn);
    }

    if (preferLineId) {
      const chosen = options.find(o => o.id === preferLineId);
      if (!chosen) {
        note.textContent = 'That bus is not serving this trip at the moment. Showing the best available instead.';
        note.hidden = false;
      } else if (!chosen.beatsWalking) {
        note.textContent = `${chosen.name} can take you, but walking is quicker right now.`;
        note.hidden = false;
      } else {
        note.hidden = true;
      }
    } else {
      note.hidden = true;
    }
  }

  function renderPlan(p) {
    plan = p;
    const panel = $('plan');
    if (!p || !p.ok) {
      panel.hidden = true;
      $('linesPick').hidden = true;
      if (p && p.reason === 'no_stop_near_origin') {
        setHint('There is no mapped bus stop near you. Tap the map where you are to set it closer to a stop.');
      } else if (p && p.reason === 'no_stop_near_destination') {
        setHint('There is no mapped bus stop near that destination. Try a stop, a square or a main road.');
      }
      return;
    }

    renderLinePicker(p);
    panel.hidden = false;
    $('planTotal').textContent = p.noVehicle
      ? `Walk it, about ${formatMinutes(p.walkAllMin)}`
      : `About ${formatMinutes(p.totalMinutes)}`;
    $('planSub').textContent = p.noVehicle
      ? 'No bus is currently faster than walking this route.'
      : `From ${User.label || 'your position'} to ${p.destination.name}`;

    const phase = currentPhase();
    $('steps').innerHTML = p.steps.map((s, i) => {
      const active = i === nextStepIndex(phase);
      if (s.type === 'walk') {
        return `<li class="step walk${active ? ' is-next' : ''}">
          <span class="step-ico" aria-hidden="true">${walkSvg()}</span>
          <div class="step-main">
            <p class="step-title">Walk to ${esc(s.to)}</p>
            <p class="step-sub">${esc(s.detail)}</p>
          </div>
          <span class="step-time">${esc(formatMinutes(s.minutes))}</span></li>`;
      }
      /* What we can honestly claim about the ride. There is no route geometry
         behind this, so Atara states the two things it actually measured: how far
         the vehicle is from the alighting stop right now, and whether it is
         pointing that way. It never promises the vehicle will stop there. */
      const where = s.alightDistanceM >= 1000
        ? `${(s.alightDistanceM / 1000).toFixed(1)} km from ${s.to} right now`
        : `${s.alightDistanceM} m from ${s.to} right now`;
      const toward = s.headingToward ? ' and heading that way' : ' with no clear heading yet';
      return `<li class="step ride${active ? ' is-next' : ''}">
        <span class="step-ico" style="--c:${esc(s.line.color)}" aria-hidden="true">${busSvg()}</span>
        <div class="step-main">
          <p class="step-title">Take line ${esc(s.line.number)} towards ${esc(s.to)}</p>
          <p class="step-sub">${esc(s.line.name)} &middot; ${esc(where)}${esc(toward)}</p>
        </div>
        <span class="step-time">${esc(formatMinutes(s.minutes))}<small>ride</small></span></li>`;
    }).join('');

    $('planNote').innerHTML = p.noVehicle
      ? 'Atara compares riding against walking and only suggests a bus when it is genuinely the faster way. No vehicle is currently close enough to your stop to say otherwise.'
      : `Line ${esc(p.target.item.line.number)} is <strong>${esc(formatKm(p.target.toBoardKm))}</strong> from ${esc(p.board.name)}. `
        + 'The ride time is worked out from the distance still to cover and the speed the vehicle is doing now, '
        + 'not from a timetable, so treat it as a guide.';

    // A walk-only plan has nothing to guide, and the walk is already spelled out
    // in the steps above. A button reading "Show the walk" that cannot be pressed
    // just looks broken, so it is removed instead of left there disabled.
    $('startJourney').hidden = p.noVehicle;

    drawRoute();
    drawLegend();
    if (!guiding) fitPlan();
  }

  function walkSvg() {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13" cy="4" r="1.6"/><path d="M9 21l2.5-6.5L8 12l1.5-4.5 3.5-1 2 3.5 3 1"/><path d="M6.5 12.5L4 16"/></svg>';
  }
  function busSvg() {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="13" rx="2.5"/><rect x="6.5" y="7" width="11" height="4" rx="1" fill="#fff" opacity=".85"/><circle cx="8" cy="19" r="2"/><circle cx="16" cy="19" r="2"/></svg>';
  }

  function nextStepIndex(phase) {
    if (phase === 'walk_to_stop') return 0;
    if (phase === 'wait_for_bus' || phase === 'on_board') return 1;
    if (phase === 'walk_to_destination') return 2;
    return -1;
  }

  function drawLegend() {
    if (!plan || !plan.ok || !plan.target) { $('mapLegend').hidden = true; return; }
    const l = plan.target.item.line;
    $('mapLegend').hidden = false;
    $('mapLegend').innerHTML =
      `<span class="lg"><i style="background:${esc(l.color)}"></i>line ${esc(l.number)}</span>`
      + '<span class="lg"><i class="lg-walk"></i>on foot</span>';
  }

  /* ---------------- guidance ---------------- */

  function guidePhase(onboard) {
    if (!plan || !plan.ok || User.lat === null) return 'unavailable';
    return Guide.phase(plan, User, onboard);
  }

  /* Once you are on the bus, you stay on the bus. Guide.phase works from where
     the rider is standing, and a rider on a moving bus is never standing near the
     kerb any more, so without this the screen would point them back the way they
     came the moment the vehicle pulled away. The latch records the boarding and
     is handed to Guide.phase, which then only waits for the alighting stop. */
  let boarded = false;

  function currentPhase() {
    const phase = guidePhase(boarded);
    if (phase === 'on_board') boarded = true;
    return phase;
  }

  const PHASE_COPY = {
    walk_to_stop: 'Step 1 of 3',
    wait_for_bus: 'Step 2 of 3',
    on_board: 'Step 3 of 3',
    walk_to_destination: 'Last step',
    arrived: 'Done'
  };

  function renderGuide() {
    const card = $('guide');
    if (!guiding) { card.hidden = true; return; }
    card.hidden = false;

    const phase = currentPhase();
    if (phase === 'unavailable') {
      $('guideStep').textContent = 'Journey';
      $('guideLead').textContent = 'We lost track of your position';
      $('guideSub').textContent = 'Tap I am here now to point Atara at you again.';
      $('guideDist').textContent = '';
      $('guideArrow').style.transform = 'rotate(0deg)';
      return;
    }

    const d = Guide.detail(phase, plan, User);
    $('guideStep').textContent = PHASE_COPY[phase] || 'Journey';
    $('guideLead').textContent = d.lead;
    $('guideSub').textContent = d.sub;
    $('guideDist').textContent = phase === 'arrived' ? '' : formatKm(d.metres / 1000);
    $('guideArrow').style.transform = `rotate(${d.heading || 0}deg)`;
    $('guideArrow').classList.toggle('is-moving', phase === 'wait_for_bus' || phase === 'on_board');

    // Highlight the matching step in the plan underneath.
    const idx = nextStepIndex(phase);
    [...$('steps').children].forEach((li, i) => li.classList.toggle('is-next', i === idx));
  }

  $('startJourney').addEventListener('click', () => {
    if (!plan || !plan.ok || plan.noVehicle) return;
    guiding = true;
    boarded = false;
    $('plan').hidden = true;
    $('linesPick').hidden = true;
    $('ask').hidden = true;
    renderGuide();
    $('recenter').click();
  });

  $('stopGuide').addEventListener('click', () => {
    guiding = false;
    boarded = false;
    $('guide').hidden = true;
    $('plan').hidden = false;
    $('ask').hidden = false;
    drawBuses();
    fitPlan();
  });

  /* ---------------- location ---------------- */

  /* fresh=true forces a new fix. A cached one is fine on arrival, but while
     someone is walking to a kerb a thirty second old position makes the
     guidance sit still and look broken. */
  function locate(then, fresh) {
    if (!navigator.geolocation) {
      setHint('This browser cannot share your location. Tap the map to set where you are.');
      return;
    }
    setHint(fresh ? 'Finding where you are now...' : 'Finding your location...');
    navigator.geolocation.getCurrentPosition(pos => {
      User.lat = pos.coords.latitude;
      User.lon = pos.coords.longitude;
      User.accuracy = pos.coords.accuracy;
      User.source = 'gps';
      User.label = 'Your location';
      $('originInput').value = 'Your location';
      moveUser();
      if (!guiding) setHint('Location set. Now search where you want to go.');
      map.setView([User.lat, User.lon], 15);
      if (then) then();
      // While guiding, the plan and its chosen vehicle stay fixed; only the
      // current instruction is re-derived from the new position.
      if (guiding) renderGuide();
      else rebuild();
    }, err => {
      setHint(err.code === 1
        ? 'Location permission was declined. Tap the map to set where you are.'
        : 'Could not get a location fix. Tap the map to set where you are.');
    }, {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: fresh ? 0 : 30000
    });
  }

  $('useLocation').addEventListener('click', () => locate());
  $('mapLocate').addEventListener('click', () => locate());
  $('recenter').addEventListener('click', () => locate(null, true));

  $('clearPlan').addEventListener('click', () => {
    guiding = false;
    // A new trip should not inherit the last trip's bus choice.
    preferLineId = null;
    $('guide').hidden = true;
    $('plan').hidden = true;
    $('linesPick').hidden = true;
    $('ask').hidden = false;
    $('destInput').value = '';
    $('destInput').placeholder = 'Where do you want to go?';
    setHint('Search a destination, or tap the map to set where you are.');
    layers.route.clearLayers();
    layers.points.clearLayers();
    $('mapLegend').hidden = true;
    drawBuses();
  });

  /* ---------------- status: feed freshness ---------------- */

  /* main.js rebases vehicle ages on every poll and announces the new snapshot
     through ATARA.onUpdate, so the pill and the banner are painted from the
     same event that redraws the buses. Freshness is measured from when the
     collector wrote the file, not from when the browser downloaded it. */
  const Status = {
    FEED_LATE_S: 900,

    age() {
      const d = window.ATARA && ATARA.data;
      if (!d || !d.generated_at) return null;
      const t = new Date(d.generated_at).getTime();
      return Number.isFinite(t) ? Math.round((Date.now() - t) / 1000) : null;
    },

    paint() {
      const pill = $('livePill');
      const banner = $('feedBanner');
      const age = this.age();
      const d = window.ATARA && ATARA.data;
      const f = window.ATARA_HELPERS;

      if (!d) {
        pill.className = 'live-pill down';
        pill.innerHTML = '<span class="live-dot"></span>Connecting';
        return;
      }

      if (age !== null && age > this.FEED_LATE_S) {
        pill.className = 'live-pill stale';
        pill.innerHTML = `<span class="live-dot"></span>Feed ${esc(f.formatAge(age))}`;
        banner.hidden = false;
        banner.innerHTML = '<strong>The live feed was last updated ' + esc(f.formatAge(age)) + '.</strong> '
          + 'The positions below are that old, not now. Vehicles stay on the map, dimmed, '
          + 'with the time each was last seen, so it is clear what is being shown. '
          + 'The live endpoint did not answer'
          + (window.ATARA && ATARA.liveError ? ' (' + esc(String(ATARA.liveError)) + ')' : '')
          + ', so this is the most recent mirror.';
      } else {
        const live = window.ATARA && ATARA.feedSource === 'live';
        pill.className = 'live-pill';
        pill.innerHTML = `<span class="live-dot"></span>${d.totals.online} of ${d.totals.buses} buses live`
          + (live ? '' : ' · mirrored');
        banner.hidden = true;
      }
    }
  };

  /* ---------------- live updates ---------------- */

  function refresh() {
    Status.paint();
    drawBuses();
    if (guiding) {
      // Re-derive the instruction from where the bus actually is now.
      if (plan && plan.ok) {
        const item = Buses.find(plan.target.item.bus.id);
        if (item) plan.target.item = item;
        else { guiding = false; $('guide').hidden = true; $('ask').hidden = false; }
      }
      renderGuide();
      followBus();
    } else if (plan && plan.ok) {
      rebuild();
    }
  }

  function followBus() {
    if (!guiding || !plan || !plan.target) return;
    const b = plan.target.item.bus;
    const zoom = map.getZoom();
    map.panTo([b.lat, b.lng], { animate: true, duration: 0.6 });
    if (zoom < 15) map.setZoom(15);
  }

  /* ---------------- boot ---------------- */

  async function boot() {
    initMap();

    try {
      const n = await Places.load();
      setHint(`${n} places and stops ready. Search a destination, or tap the map to set where you are.`);
    } catch (e) {
      setHint('The place search could not be loaded. You can still tap the map to set your route.');
    }

    wireSearch('originInput', p => setOrigin(p, 'search'));
    wireSearch('destInput', p => setDestination(p, 'search'));

    // Tapping the label above a field tells you that tapping the map will set it.
    $('originInput').addEventListener('click', () => {
      pickedFor = 'origin';
      setHint('Tap the map to set where you are.');
    });
    $('destInput').addEventListener('click', () => {
      pickedFor = 'destination';
      setHint('Tap the map to set your destination.');
    });

    drawBuses();
    drawUser();
    Status.paint();

    // main.js owns polling. It rebases vehicle ages on every load and announces
    // the new snapshot through onUpdate, so subscribe before starting it and the
    // buses, the pill and the guidance card all move to the same snapshot.
    if (window.ATARA && typeof ATARA.onUpdate === 'function') ATARA.onUpdate(refresh);
    if (window.ATARA && typeof ATARA.start === 'function') ATARA.start();
    setInterval(refresh, window.ATARA_REFRESH_MS || 15000);
    window.addEventListener('resize', () => map.invalidateSize());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
