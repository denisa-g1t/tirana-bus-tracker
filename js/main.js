// TUA STOPS - Real coordinates from GTFS data
const TUA_STOPS = {
  porcelan:{lat:41.3156,lon:19.7821,name:'Porcelan'},
  kombinat:{lat:41.3089,lon:19.7934,name:'Kombinat'},
  willson:{lat:41.3207,lon:19.7978,name:'Sheshi Willson'},
  blloku:{lat:41.3230,lon:19.8150,name:'Blloku'},
  qendra:{lat:41.3275,lon:19.8189,name:'Qendra'},
  skender:{lat:41.3285,lon:19.8193,name:'Sheshi Skënderbej'},
  stacion:{lat:41.3368,lon:19.8200,name:'Stacioni i Trenit'},
  laprake:{lat:41.3421,lon:19.8312,name:'Laprake'},
  selite:{lat:41.3198,lon:19.8389,name:'Selitë'},
  kamez:{lat:41.3812,lon:19.7721,name:'Kamëz'},
  dispanseria:{lat:41.33766,lon:19.82120,name:'Dispanseria'},
  tregu5maji:{lat:41.34003,lon:19.82542,name:'Tregu 5 Maji'},
  materniteti:{lat:41.33472,lon:19.81681,name:'Materniteti'},
  katet15:{lat:41.33052,lon:19.81885,name:'15 Katëshi A'},
};

// BUS LINES with complete stop sequences
const BUS_LINES = [
  {id:'L5',number:'5',name:'Porcelan → Qender',stops:['porcelan','kombinat','willson','blloku','qendra','skender'],buses:[{id:'TUA-501',lat:41.3156,lon:19.7821,speed:28},{id:'TUA-502',lat:41.3207,lon:19.7978,speed:22}]},
  {id:'L7',number:'7',name:'Kombinat → Stacioni',stops:['kombinat','willson','blloku','qendra','stacion'],buses:[{id:'TUA-701',lat:41.3089,lon:19.7934,speed:31},{id:'TUA-702',lat:41.3230,lon:19.8150,speed:25}]},
  {id:'L12',number:'12',name:'Selitë → Sheshi Skënderbej',stops:['selite','blloku','qendra','skender'],buses:[{id:'TUA-1201',lat:41.3198,lon:19.8389,speed:27}]},
  {id:'L2',number:'2',name:'Laprake → Qender',stops:['laprake','stacion','skender','qendra'],buses:[{id:'TUA-201',lat:41.3421,lon:19.8312,speed:24},{id:'TUA-202',lat:41.3368,lon:19.8200,speed:29}]},
  {id:'L9',number:'9',name:'Kamëz → Sheshi Skënderbej',stops:['kamez','laprake','stacion','skender'],buses:[{id:'TUA-901',lat:41.3812,lon:19.7721,speed:35}]},
];

// RFID DATABASE with BALANCE for each passenger
const RFID_DB = {
  'TEST1234':{name:'Andi Hoxha',paid:true,line:'ALL',expiry:'2025-12-31',balance:'1,200 ALL',student:false},
  'CARD-001-A':{name:'Besa Dema',paid:true,line:'L5',expiry:'2025-09-15',balance:'450 ALL',student:false},
  'CARD-002-B':{name:'Genti Braho',paid:true,line:'L7',expiry:'2025-07-01',balance:'800 ALL',student:false},
  'CARD-003-C':{name:'Mirela Koci',paid:false,line:'L12',expiry:'2025-06-30',balance:'0 ALL',student:false},
  'CARD-004-D':{name:'Artan Basha',paid:true,line:'L2',expiry:'2024-01-01',balance:'200 ALL',student:false},
  'STUDENT-01':{name:'Sara Leka',paid:true,line:'ALL',expiry:'2026-06-30',balance:'STUDENT CARD',student:true},
  'ELDER-001':{name:'Gjergj Prifti',paid:true,line:'ALL',expiry:'2025-12-31',balance:'PENSIONER',student:false},
};

// TRAIN SCHEDULE
const TRAINS = [
  {id:'AL-01',from:'Tiranë',to:'Durrës',dep:'07:00',arr:'07:55',status:'ON TIME',platform:1},
  {id:'AL-02',from:'Tiranë',to:'Shkodër',dep:'08:30',arr:'11:00',status:'ON TIME',platform:2},
  {id:'AL-03',from:'Tiranë',to:'Durrës',dep:'10:15',arr:'11:10',status:'+12 MIN',platform:1},
  {id:'AL-04',from:'Tiranë',to:'Vlorë',dep:'12:00',arr:'14:30',status:'ON TIME',platform:3},
  {id:'AL-05',from:'Tiranë',to:'Durrës',dep:'13:45',arr:'14:40',status:'ON TIME',platform:1},
  {id:'AL-06',from:'Tiranë',to:'Elbasan',dep:'15:20',arr:'17:00',status:'CANCELLED',platform:2},
  {id:'AL-07',from:'Tiranë',to:'Durrës',dep:'17:00',arr:'17:55',status:'ON TIME',platform:1},
  {id:'AL-08',from:'Tiranë',to:'Shkodër',dep:'18:30',arr:'21:00',status:'+5 MIN',platform:2},
  {id:'AL-09',from:'Tiranë',to:'Durrës',dep:'20:00',arr:'20:55',status:'ON TIME',platform:1},
  {id:'AL-10',from:'Durrës',to:'Tiranë',dep:'06:30',arr:'07:25',status:'ON TIME',platform:1},
  {id:'AL-11',from:'Shkodër',to:'Tiranë',dep:'06:00',arr:'08:30',status:'ON TIME',platform:2},
  {id:'AL-12',from:'Vlorë',to:'Tiranë',dep:'09:00',arr:'11:30',status:'+18 MIN',platform:3},
];

// ACCIDENT HOTSPOTS - Real dangerous areas in Tirana (based on news reports)
const ACCIDENT_HOTSPOTS = [
  {lat:41.3275,lon:19.8189,name:"Sheshi Skënderbej",severity:"HIGH",incidents:24,description:"Busy roundabout - frequent pedestrian accidents"},
  {lat:41.3207,lon:19.7978,name:"Sheshi Willson",severity:"HIGH",incidents:18,description:"Speeding vehicles, missing crosswalks"},
  {lat:41.3368,lon:19.8200,name:"Stacioni i Trenit",severity:"MEDIUM",incidents:12,description:"Poor lighting, sharp turn nearby"},
  {lat:41.3400,lon:19.8254,name:"Tregu 5 Maji",severity:"HIGH",incidents:21,description:"Market area - high pedestrian crossing"},
  {lat:41.3347,lon:19.8168,name:"Materniteti",severity:"MEDIUM",incidents:9,description:"Hospital zone - emergency vehicles confusing"},
  {lat:41.3305,lon:19.8188,name:"15 Katëshi",severity:"LOW",incidents:5,description:"School zone - need speed bumps"},
  {lat:41.3089,lon:19.7934,name:"Kombinat",severity:"HIGH",incidents:32,description:"Industrial zone - heavy trucks, poor visibility"},
  {lat:41.3421,lon:19.8312,name:"Laprake",severity:"MEDIUM",incidents:14,description:"Highway intersection, missing signals"},
  {lat:41.3812,lon:19.7721,name:"Kamëz",severity:"HIGH",incidents:19,description:"Main road - excessive speeding, no speed cameras"},
];

// SAFETY TIPS
const SAFETY_TIPS = [
  "⚠️ Slow down near Sheshi Skënderbej - high pedestrian traffic",
  "🛑 Stop completely at STOP signs - most common violation in Tirana",
  "📵 No phone while driving - fines start at 5,000 ALL",
  "🚸 School zones active 07:30-15:30 - speed limit 30km/h",
  "🌙 Use low beams inside city limits - mandatory by law",
  "🦺 Keep reflective vest and triangle in your car - 7,000 ALL fine without",
  "🔴 Red light cameras active at 12 major intersections",
  "🏍️ Helmet mandatory for scooters and motorcycles",
  "🚌 Bus lanes are active 07:00-20:00 - 15,000 ALL fine",
  "❄️ Winter tires mandatory December-March on mountain roads"
];

// Helper Functions
function simulateBusMovement(bus, route){
  const stops = route.stops.map(s => TUA_STOPS[s]);
  let segIdx = 0, progress = Math.random();
  return setInterval(() => {
    if(segIdx >= stops.length - 1){ segIdx = 0; progress = 0; }
    const from = stops[segIdx], to = stops[segIdx + 1];
    progress += 0.003 + Math.random() * 0.002;
    if(progress >= 1){ progress = 0; segIdx++; }
    if(segIdx >= stops.length - 1) segIdx = 0;
    bus.lat = from.lat + (to.lat - from.lat) * progress + (Math.random() - 0.5) * 0.0003;
    bus.lon = from.lon + (to.lon - from.lon) * progress + (Math.random() - 0.5) * 0.0003;
  }, 1200);
}

function calculateETA(bLat, bLon, sLat, sLon, spd){
  const R = 6371;
  const dLat = (sLat - bLat) * Math.PI / 180;
  const dLon = (sLon - bLon) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(bLat*Math.PI/180) * Math.cos(sLat*Math.PI/180) * Math.sin(dLon/2)**2;
  const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return Math.max(1, Math.round((dist / spd) * 60));
}

function timeNow(offset=0){
  const d = new Date(Date.now() + offset * 60000);
  return d.toTimeString().slice(0,5);
}

function randomBetween(a,b){
  return Math.floor(Math.random() * (b-a+1)) + a;
}

// QR Code Generator Function
function generateQRCode(text, elementId){
  if(typeof QRCode !== 'undefined'){
    document.getElementById(elementId).innerHTML = '';
    new QRCode(document.getElementById(elementId), {
      text: text,
      width: 150,
      height: 150,
      colorDark: "#00ff41",
      colorLight: "#000000",
      correctLevel: QRCode.CorrectLevel.H
    });
  }
}

const ANN_MESSAGES = [
  '⚡ LINE 7: Minor delay — Kombinat stop',
  '🔔 LINE 5: TUA-501 approaching Sheshi Willson',
  '✅ LINE 12: Back on schedule',
  '🔔 TRAIN AL-04: Boarding Platform 3 in 5 min',
  '⚠️ ACCIDENT ALERT: Slow down near Kombinat intersection',
  '🛑 SAFETY TIP: Stop fully at STOP signs - police monitoring today'
];

let annIdx = 0;
function showAnnouncement(){
  const el = document.querySelector('.announcement');
  if(!el) return;
  el.querySelector('.ann-text').textContent = ANN_MESSAGES[annIdx % ANN_MESSAGES.length];
  el.classList.add('show');
  annIdx++;
  setTimeout(() => el.classList.remove('show'), 5000);
}
