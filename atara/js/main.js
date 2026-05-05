// ATARA - Smart Transit System for Tirana
// Based on real open data from Tirana Municipality

// ============================================
// REAL BUS STATIONS FROM YOUR DATA
// ============================================
const ATARA_STATIONS = {
  kamez: { lat: 41.3812, lon: 19.7721, name: 'KAMEZ', zone: 'North', code: 'KZ-01' },
  teuta: { lat: 41.3520, lon: 19.8010, name: 'TEUTA', zone: 'North', code: 'TT-02' },
  paskugan: { lat: 41.3650, lon: 19.8120, name: 'PASKUGAN', zone: 'East', code: 'PG-03' },
  shiraz: { lat: 41.3380, lon: 19.8280, name: 'SHIRAZ', zone: 'Central', code: 'SZ-04' },
  suko: { lat: 41.3420, lon: 19.8410, name: 'SUKO', zone: 'East', code: 'SK-05' },
  porcelan: { lat: 41.3156, lon: 19.7821, name: 'PORCELAN', zone: 'South', code: 'PC-06' },
  kombinat: { lat: 41.3089, lon: 19.7934, name: 'KOMBINAT', zone: 'South', code: 'KB-07' },
  willson: { lat: 41.3207, lon: 19.7978, name: 'SHESHI WILLSON', zone: 'Central', code: 'SW-08' },
  blloku: { lat: 41.3230, lon: 19.8150, name: 'BLLOKU', zone: 'Central', code: 'BL-09' },
  qender: { lat: 41.3275, lon: 19.8189, name: 'QENDER', zone: 'Central', code: 'QD-10' },
  skenderbej: { lat: 41.3285, lon: 19.8193, name: 'SHESHI SKENDERBEJ', zone: 'Central', code: 'SS-11' },
  stacion: { lat: 41.3368, lon: 19.8200, name: 'STACIONI I TRENIT', zone: 'North', code: 'ST-12' }
};

// ============================================
// BUS LINES WITH SMART TIMING
// ============================================
// Distance between stations (in km) for accurate ETA calculation
const DISTANCE_MATRIX = {
  'kamez-teuta': 3.8, 'teuta-paskugan': 2.4, 'paskugan-shiraz': 1.9,
  'shiraz-suko': 1.5, 'suko-stacion': 1.2, 'stacion-skenderbej': 0.8,
  'skenderbej-qender': 0.5, 'qender-blloku': 0.6, 'blloku-willson': 0.7,
  'willson-kombinat': 1.1, 'kombinat-porcelan': 1.3
};

// Bus lines with complete station sequences
const ATARA_BUS_LINES = [
  {
    id: 'L1', number: '1', name: 'KAMEZ TO QENDER',
    color: '#00ff41',
    stations: ['kamez', 'teuta', 'paskugan', 'shiraz', 'suko', 'stacion', 'skenderbej', 'qender'],
    distances: [3.8, 2.4, 1.9, 1.5, 1.2, 0.8, 0.5],
    avgSpeed: 25, // km/h average
    stopDuration: 45, // seconds per stop
    buses: [
      { id: 'ATR-101', lat: 41.3812, lon: 19.7721, speed: 28, status: 'active' }
    ]
  },
  {
    id: 'L2', number: '2', name: 'PORCELAN TO STACION',
    color: '#ff4444',
    stations: ['porcelan', 'kombinat', 'willson', 'blloku', 'qender', 'skenderbej', 'stacion'],
    distances: [1.3, 1.1, 0.7, 0.6, 0.5, 0.8],
    avgSpeed: 28,
    stopDuration: 40,
    buses: [
      { id: 'ATR-201', lat: 41.3156, lon: 19.7821, speed: 32, status: 'active' },
      { id: 'ATR-202', lat: 41.3230, lon: 19.8150, speed: 26, status: 'active' }
    ]
  },
  {
    id: 'L3', number: '3', name: 'SHIRAZ TO SKENDERBEJ',
    color: '#ffaa00',
    stations: ['shiraz', 'suko', 'stacion', 'skenderbej'],
    distances: [1.5, 1.2, 0.8],
    avgSpeed: 30,
    stopDuration: 35,
    buses: [
      { id: 'ATR-301', lat: 41.3380, lon: 19.8280, speed: 34, status: 'active' }
    ]
  }
];

// ============================================
// SMART ETA CALCULATION
// ============================================
function calculateSmartETA(currentLat, currentLon, targetLat, targetLon, avgSpeed, remainingStops, stopDuration) {
  // Calculate straight-line distance using Haversine formula
  const R = 6371;
  const dLat = (targetLat - currentLat) * Math.PI / 180;
  const dLon = (targetLon - currentLon) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(currentLat*Math.PI/180) * Math.cos(targetLat*Math.PI/180) * Math.sin(dLon/2)**2;
  const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  
  // Travel time in minutes
  const travelTime = (distance / avgSpeed) * 60;
  
  // Stop time in minutes
  const stopTime = (remainingStops * stopDuration) / 60;
  
  // Total ETA with buffer for traffic (15% congestion factor)
  const totalETA = Math.ceil((travelTime + stopTime) * 1.15);
  
  return Math.max(1, totalETA);
}

// Calculate time to reach each station in the route
function calculateStationETAs(busLat, busLon, stations, avgSpeed, stopDuration, currentIndex) {
  const results = [];
  let cumulativeTime = 0;
  
  for (let i = currentIndex; i < stations.length - 1; i++) {
    const current = ATARA_STATIONS[stations[i]];
    const next = ATARA_STATIONS[stations[i + 1]];
    
    if (!current || !next) continue;
    
    // Get actual distance from matrix or calculate
    const distanceKey = `${stations[i]}-${stations[i+1]}`;
    const distance = DISTANCE_MATRIX[distanceKey] || 
      calculateDistance(current.lat, current.lon, next.lat, next.lon);
    
    // Travel time to next station
    const travelTime = (distance / avgSpeed) * 60;
    
    cumulativeTime += travelTime;
    results.push({
      station: next,
      etaMinutes: Math.ceil(cumulativeTime),
      distance: distance,
      travelTime: travelTime
    });
    
    // Add stop time at station (except for last)
    if (i < stations.length - 2) {
      cumulativeTime += stopDuration / 60;
    }
  }
  
  return results;
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ============================================
// ACCIDENT HOTSPOTS (Black Spots)
// ============================================
const ACCIDENT_BLACK_SPOTS = [
  { lat: 41.3275, lon: 19.8189, name: 'SHESHI SKENDERBEJ', severity: 'HIGH', incidents: 24, type: 'ROUNDABOUT', warning: 'HIGH PEDESTRIAN TRAFFIC - REDUCE SPEED' },
  { lat: 41.3207, lon: 19.7978, name: 'SHESHI WILLSON', severity: 'HIGH', incidents: 18, type: 'INTERSECTION', warning: 'MISSING CROSSWALKS - USE CAUTION' },
  { lat: 41.3089, lon: 19.7934, name: 'KOMBINAT', severity: 'HIGH', incidents: 32, type: 'INDUSTRIAL ZONE', warning: 'HEAVY TRUCKS - POOR VISIBILITY' },
  { lat: 41.3368, lon: 19.8200, name: 'STACIONI I TRENIT', severity: 'MEDIUM', incidents: 12, type: 'RAILWAY CROSSING', warning: 'POOR LIGHTING - SHARP TURN' },
  { lat: 41.3812, lon: 19.7721, name: 'KAMEZ HIGHWAY', severity: 'HIGH', incidents: 19, type: 'HIGHWAY', warning: 'EXCESSIVE SPEED - NO CAMERAS' },
  { lat: 41.3520, lon: 19.8010, name: 'TEUTA INTERSECTION', severity: 'MEDIUM', incidents: 8, type: 'T-JUNCTION', warning: 'FREQUENT SIDE COLLISIONS' }
];

// ============================================
// RFID DATABASE with BALANCE
// ============================================
const ATARA_RFID_DB = {
  'ATR-001': { name: 'ANDI HOXHA', balance: 1250, tariff: 'STANDARD - 40 ALL', status: 'ACTIVE', expiry: '2025-12-31' },
  'ATR-002': { name: 'BESA DEMA', balance: 450, tariff: 'STUDENT - 20 ALL', status: 'ACTIVE', expiry: '2025-09-15' },
  'ATR-003': { name: 'GENTI BRAHO', balance: 800, tariff: 'STANDARD - 40 ALL', status: 'ACTIVE', expiry: '2025-07-01' },
  'ATR-004': { name: 'MIRELA KOCI', balance: 0, tariff: 'STANDARD - 40 ALL', status: 'EXPIRED', expiry: '2025-06-30' },
  'STU-001': { name: 'SARA LEKA', balance: 'STUDENT', tariff: 'STUDENT - 20 ALL', status: 'ACTIVE', expiry: '2026-06-30' },
  'PEN-001': { name: 'GJERGJ PRIFTI', balance: 'FREE', tariff: 'PENSIONER - FREE', status: 'ACTIVE', expiry: '2025-12-31' }
};

// ============================================
// TRAINS
// ============================================
const ATARA_TRAINS = [
  { id: 'AT-01', from: 'TIRANE', to: 'DURRES', dep: '07:00', arr: '07:55', status: 'ON TIME', platform: 1 },
  { id: 'AT-02', from: 'TIRANE', to: 'SHKODER', dep: '08:30', arr: '11:00', status: 'ON TIME', platform: 2 },
  { id: 'AT-03', from: 'TIRANE', to: 'DURRES', dep: '10:15', arr: '11:10', status: 'DELAYED +12', platform: 1 },
  { id: 'AT-04', from: 'TIRANE', to: 'VLORE', dep: '12:00', arr: '14:30', status: 'ON TIME', platform: 3 },
  { id: 'AT-05', from: 'TIRANE', to: 'DURRES', dep: '13:45', arr: '14:40', status: 'ON TIME', platform: 1 },
  { id: 'AT-06', from: 'TIRANE', to: 'ELBASAN', dep: '15:20', arr: '17:00', status: 'CANCELLED', platform: 2 }
];

// ============================================
// BUS MOVEMENT SIMULATION
// ============================================
function simulateBusMovement(bus, line) {
  const stations = line.stations.map(s => ATARA_STATIONS[s]);
  let segIdx = 0, progress = Math.random();
  
  return setInterval(() => {
    if (segIdx >= stations.length - 1) {
      segIdx = 0;
      progress = 0;
    }
    
    const from = stations[segIdx];
    const to = stations[segIdx + 1];
    
    if (from && to) {
      progress += 0.002 + Math.random() * 0.0015;
      
      if (progress >= 1) {
        progress = 0;
        segIdx++;
      }
      
      if (segIdx >= stations.length - 1) segIdx = 0;
      
      bus.lat = from.lat + (to.lat - from.lat) * progress + (Math.random() - 0.5) * 0.0002;
      bus.lon = from.lon + (to.lon - from.lon) * progress + (Math.random() - 0.5) * 0.0002;
    }
  }, 1500);
}

function timeNow() {
  const d = new Date();
  return d.toTimeString().slice(0, 5);
}

const SAFETY_ALERTS = [
  'ACCIDENT BLACK SPOT AHEAD: Kombinat intersection - 32 incidents reported',
  'REDUCE SPEED: Sheshi Skenderbej - high pedestrian zone',
  'HAZARD REPORT: Pothole reported on Rruga e Elbasanit',
  'WEATHER WARNING: Reduced visibility near Kamez highway',
  'SCHOOL ZONE ACTIVE: Near 15 Kateshi - speed limit 30km/h'
];

let alertIndex = 0;
function showSafetyAlert() {
  const el = document.querySelector('.safety-alert');
  if (!el) return;
  el.textContent = SAFETY_ALERTS[alertIndex % SAFETY_ALERTS.length];
  el.style.display = 'block';
  alertIndex++;
  setTimeout(() => {
    if (el) el.style.display = 'none';
  }, 6000);
}
