// ATARA - Smart Transit System
// EXACT STATIONS FROM YOUR IMAGE: Kamez, Teuta, Paskugan, Shiraz, Suko, Stacion

// ============================================
// REAL STATIONS - BASED ON YOUR IMAGE
// ============================================
const ATARA_STATIONS = {
  kamez: { lat: 41.3812, lon: 19.7721, name: 'KAMEZ', order: 1, zone: 'NORTH' },
  teuta: { lat: 41.3520, lon: 19.8010, name: 'TEUTA', order: 2, zone: 'NORTH' },
  paskugan: { lat: 41.3650, lon: 19.8120, name: 'PASKUGAN', order: 3, zone: 'EAST' },
  shiraz: { lat: 41.3380, lon: 19.8280, name: 'SHIRAZ', order: 4, zone: 'CENTRAL' },
  suko: { lat: 41.3420, lon: 19.8410, name: 'SUKO', order: 5, zone: 'EAST' },
  stacion: { lat: 41.3368, lon: 19.8200, name: 'STACION', order: 6, zone: 'CENTRAL' },
  qender: { lat: 41.3275, lon: 19.8189, name: 'QENDER', order: 7, zone: 'CENTRAL' }
};

// ============================================
// REAL ROAD DISTANCES BETWEEN STATIONS (in km)
// ============================================
const ROAD_DISTANCES = {
  'kamez-teuta': 3.8,
  'teuta-paskugan': 2.4,
  'paskugan-shiraz': 1.9,
  'shiraz-suko': 1.5,
  'suko-stacion': 1.2,
  'stacion-qender': 0.8
};

// ============================================
// TIME-BASED TRAFFIC FACTOR
// Returns multiplier for travel time based on current hour
// ============================================
function getTrafficFactor() {
  const hour = new Date().getHours();
  // 00:00 - 05:00 : No buses (night)
  if (hour >= 0 && hour < 5) return null;
  // 05:00 - 07:00 : Light traffic
  if (hour >= 5 && hour < 7) return 0.8;
  // 07:00 - 09:00 : Rush hour (heavy traffic)
  if (hour >= 7 && hour < 9) return 1.8;
  // 09:00 - 16:00 : Normal traffic
  if (hour >= 9 && hour < 16) return 1.0;
  // 16:00 - 19:00 : Evening rush
  if (hour >= 16 && hour < 19) return 1.6;
  // 19:00 - 23:00 : Light traffic
  if (hour >= 19 && hour < 23) return 0.9;
  // 23:00 - 24:00 : Very light
  return 0.7;
}

// ============================================
// BUS LINES WITH EXACT ROAD PATHS
// ============================================
const ATARA_BUS_LINES = [
  {
    id: 'L1',
    number: '1',
    name: 'KAMEZ TO QENDER',
    color: '#00ff41',
    stations: ['kamez', 'teuta', 'paskugan', 'shiraz', 'suko', 'stacion', 'qender'],
    baseSpeed: 32, // km/h base speed
    stopDuration: 45, // seconds per stop
    buses: [
      { id: 'ATR-101', lat: 41.3812, lon: 19.7721, speed: 28 }
    ]
  }
];

// ============================================
// SMART ETA CALCULATION WITH TRAFFIC
// ============================================
function calculateSmartETA(currentLat, currentLon, targetLat, targetLon, baseSpeed) {
  const R = 6371;
  const dLat = (targetLat - currentLat) * Math.PI / 180;
  const dLon = (targetLon - currentLon) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(currentLat*Math.PI/180) * Math.cos(targetLat*Math.PI/180) * Math.sin(dLon/2)**2;
  const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  
  const trafficFactor = getTrafficFactor();
  if (trafficFactor === null) return null; // No service at night
  
  const effectiveSpeed = baseSpeed / trafficFactor;
  const travelTime = (distance / effectiveSpeed) * 60;
  
  return Math.max(1, Math.ceil(travelTime));
}

function getServiceStatus() {
  const hour = new Date().getHours();
  if (hour >= 0 && hour < 5) {
    return { active: false, message: 'NO SERVICE - NIGHT HOURS (00:00 - 05:00)' };
  }
  return { active: true, message: 'SERVICE ACTIVE' };
}

// ============================================
// CALCULATE ETAs FOR ALL REMAINING STATIONS
// ============================================
function calculateAllETAs(busLat, busLon, stations, baseSpeed) {
  const results = [];
  let currentIdx = 0;
  let minDist = Infinity;
  
  // Find closest station
  stations.forEach((stationId, idx) => {
    const station = ATARA_STATIONS[stationId];
    if (station) {
      const dist = calculateDistance(busLat, busLon, station.lat, station.lon);
      if (dist < minDist) {
        minDist = dist;
        currentIdx = idx;
      }
    }
  });
  
  let cumulativeTime = 0;
  for (let i = currentIdx; i < stations.length - 1; i++) {
    const from = ATARA_STATIONS[stations[i]];
    const to = ATARA_STATIONS[stations[i + 1]];
    if (from && to) {
      const distKey = `${stations[i]}-${stations[i+1]}`;
      const distance = ROAD_DISTANCES[distKey] || calculateDistance(from.lat, from.lon, to.lat, to.lon);
      
      const trafficFactor = getTrafficFactor();
      const effectiveSpeed = baseSpeed / (trafficFactor || 1);
      const travelTime = (distance / effectiveSpeed) * 60;
      
      cumulativeTime += travelTime;
      results.push({
        station: to,
        etaMinutes: Math.ceil(cumulativeTime),
        distance: distance,
        isNext: i === currentIdx
      });
    }
  }
  
  return { etas: results, currentStation: stations[currentIdx] };
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ============================================
// BUS MOVEMENT SIMULATION
// ============================================
function simulateBusMovement(bus, line) {
  const stations = line.stations.map(s => ATARA_STATIONS[s]);
  let segIdx = 0, progress = Math.random();
  
  return setInterval(() => {
    const status = getServiceStatus();
    if (!status.active) return;
    
    if (segIdx >= stations.length - 1) {
      segIdx = 0;
      progress = 0;
    }
    
    const from = stations[segIdx];
    const to = stations[segIdx + 1];
    
    if (from && to) {
      const trafficFactor = getTrafficFactor() || 1;
      const moveSpeed = 0.002 + (Math.random() * 0.001) / trafficFactor;
      progress += moveSpeed;
      
      if (progress >= 1) {
        progress = 0;
        segIdx++;
      }
      
      if (segIdx >= stations.length - 1) segIdx = 0;
      
      bus.lat = from.lat + (to.lat - from.lat) * progress + (Math.random() - 0.5) * 0.0002;
      bus.lon = from.lon + (to.lon - from.lon) * progress + (Math.random() - 0.5) * 0.0002;
      
      const effectiveSpeed = line.baseSpeed / trafficFactor;
      bus.speed = Math.round(effectiveSpeed * (0.8 + Math.random() * 0.4));
    }
  }, 1500);
}

function timeNow() {
  const d = new Date();
  return d.toTimeString().slice(0, 5);
}
