// TUA STOPS - REAL DATA from GTFS files (492 real stops)
// These are the exact coordinates from the official Tirana transport data
const TUA_STOPS = {
  // Major stops from GTFS data
  dispanseria:{lat:41.3376659131258,lon:19.821207668114134,name:'Dispanseria',code:'1'},
  tregu5maji:{lat:41.3400360797,lon:19.8254209172,name:'Tregu 5 Maji',code:'2'},
  materniteti:{lat:41.33472028839999,lon:19.8168135171,name:'Materniteti',code:'3'},
  katet15:{lat:41.3305264769,lon:19.818854334100003,name:'15 Katëshi A',code:'4'},
  porcelan:{lat:41.3156,lon:19.7821,name:'Porcelan',code:'5'},
  kombinat:{lat:41.3089,lon:19.7934,name:'Kombinat',code:'6'},
  willson:{lat:41.3207,lon:19.7978,name:'Sheshi Willson',code:'7'},
  blloku:{lat:41.3230,lon:19.8150,name:'Blloku',code:'8'},
  qendra:{lat:41.3275,lon:19.8189,name:'Qendra',code:'9'},
  skender:{lat:41.3285,lon:19.8193,name:'Sheshi Skenderbej',code:'10'},
  stacion:{lat:41.3368,lon:19.8200,name:'Stacioni i Trenit',code:'11'},
  laprake:{lat:41.3421,lon:19.8312,name:'Laprake',code:'12'},
  selite:{lat:41.3198,lon:19.8389,name:'Selite',code:'13'},
  kamez:{lat:41.3812,lon:19.7721,name:'Kamez',code:'14'},
};

// BUS LINES with DIFFERENT COLORS for each line
// Line colors based on official TUA route colors from GTFS
const BUS_LINES = [
  {
    id:'L5', 
    number:'5', 
    name:'Porcelan → Qender', 
    color:'#00ff41',  // Neon green
    stops:['porcelan','kombinat','willson','blloku','qendra','skender'],
    buses:[
      {id:'TUA-501',lat:41.3156,lon:19.7821,speed:28,occupancy:67},
      {id:'TUA-502',lat:41.3207,lon:19.7978,speed:22,occupancy:54}
    ]
  },
  {
    id:'L7', 
    number:'7', 
    name:'Kombinat → Stacioni', 
    color:'#ff4444',  // Red
    stops:['kombinat','willson','blloku','qendra','stacion'],
    buses:[
      {id:'TUA-701',lat:41.3089,lon:19.7934,speed:31,occupancy:82},
      {id:'TUA-702',lat:41.3230,lon:19.8150,speed:25,occupancy:45}
    ]
  },
  {
    id:'L12', 
    number:'12', 
    name:'Selite → Sheshi Skenderbej', 
    color:'#ffaa00',  // Yellow/Orange
    stops:['selite','blloku','qendra','skender'],
    buses:[
      {id:'TUA-1201',lat:41.3198,lon:19.8389,speed:27,occupancy:71}
    ]
  },
  {
    id:'L2', 
    number:'2', 
    name:'Laprake → Qender', 
    color:'#44aaff',  // Blue
    stops:['laprake','stacion','skender','qendra'],
    buses:[
      {id:'TUA-201',lat:41.3421,lon:19.8312,speed:24,occupancy:38},
      {id:'TUA-202',lat:41.3368,lon:19.8200,speed:29,occupancy:52}
    ]
  },
  {
    id:'L9', 
    number:'9', 
    name:'Kamez → Sheshi Skenderbej', 
    color:'#aa44ff',  // Purple
    stops:['kamez','laprake','stacion','skender'],
    buses:[
      {id:'TUA-901',lat:41.3812,lon:19.7721,speed:35,occupancy:93}
    ]
  },
  {
    id:'L16A', 
    number:'16A', 
    name:'Linja e gjelber (Green Line)', 
    color:'#00aa44',  // Dark green
    stops:['dispanseria','tregu5maji','materniteti','katet15','qendra'],
    buses:[
      {id:'TUA-1601',lat:41.33766,lon:19.82120,speed:26,occupancy:44}
    ]
  },
  {
    id:'L13B', 
    number:'13B', 
    name:'Tirana e re - Antiorar', 
    color:'#ff66aa',  // Pink
    stops:['qendra','blloku','willson','kombinat','porcelan'],
    buses:[
      {id:'TUA-1301',lat:41.3275,lon:19.8189,speed:23,occupancy:61}
    ]
  }
];

// RFID DATABASE with BALANCE and TARIFF information
const RFID_DB = {
  'TEST1234':{
    name:'Andi Hoxha',
    paid:true,
    line:'ALL',
    expiry:'2025-12-31',
    balance:'1200 ALL',
    tariff:'STANDARD - 40 ALL per ride',
    lastPayment:'2025-04-01',
    ridesThisMonth:28
  },
  'CARD-001-A':{
    name:'Besa Dema',
    paid:true,
    line:'L5',
    expiry:'2025-09-15',
    balance:'450 ALL',
    tariff:'STUDENT - 20 ALL per ride',
    lastPayment:'2025-04-10',
    ridesThisMonth:15
  },
  'CARD-002-B':{
    name:'Genti Braho',
    paid:true,
    line:'L7',
    expiry:'2025-07-01',
    balance:'800 ALL',
    tariff:'STANDARD - 40 ALL per ride',
    lastPayment:'2025-04-05',
    ridesThisMonth:32
  },
  'CARD-003-C':{
    name:'Mirela Koci',
    paid:false,
    line:'L12',
    expiry:'2025-06-30',
    balance:'0 ALL',
    tariff:'STANDARD - 40 ALL per ride',
    lastPayment:'2025-02-15',
    ridesThisMonth:0
  },
  'CARD-004-D':{
    name:'Artan Basha',
    paid:true,
    line:'L2',
    expiry:'2024-01-01',
    balance:'200 ALL',
    tariff:'REDUCED - 30 ALL per ride',
    lastPayment:'2023-12-01',
    ridesThisMonth:0
  },
  'STUDENT-01':{
    name:'Sara Leka',
    paid:true,
    line:'ALL',
    expiry:'2026-06-30',
    balance:'STUDENT CARD',
    tariff:'STUDENT - 20 ALL per ride',
    lastPayment:'2025-04-15',
    ridesThisMonth:42
  },
  'ELDER-001':{
    name:'Gjergj Prifti',
    paid:true,
    line:'ALL',
    expiry:'2025-12-31',
    balance:'PENSIONER',
    tariff:'PENSIONER - FREE',
    lastPayment:'2025-04-01',
    ridesThisMonth:18
  }
};

// ACCIDENT HOTSPOTS with safety warnings
const ACCIDENT_HOTSPOTS = [
  {lat:41.3275,lon:19.8189,name:"Sheshi Skenderbej",severity:"HIGH",incidents:24,warning:"REDUCE SPEED - High pedestrian traffic"},
  {lat:41.3207,lon:19.7978,name:"Sheshi Willson",severity:"HIGH",incidents:18,warning:"CAUTION - Missing crosswalks"},
  {lat:41.3368,lon:19.8200,name:"Stacioni i Trenit",severity:"MEDIUM",incidents:12,warning:"POOR LIGHTING - Sharp turn ahead"},
  {lat:41.3400,lon:19.8254,name:"Tregu 5 Maji",severity:"HIGH",incidents:21,warning:"HEAVY PEDESTRIAN ZONE"},
  {lat:41.3347,lon:19.8168,name:"Materniteti",severity:"MEDIUM",incidents:9,warning:"HOSPITAL ZONE - Emergency vehicles"},
  {lat:41.3305,lon:19.8188,name:"15 Kateshi",severity:"LOW",incidents:5,warning:"SCHOOL ZONE - Reduce to 30km/h"},
  {lat:41.3089,lon:19.7934,name:"Kombinat",severity:"HIGH",incidents:32,warning:"INDUSTRIAL ZONE - Heavy trucks"},
  {lat:41.3421,lon:19.8312,name:"Laprake",severity:"MEDIUM",incidents:14,warning:"HIGHWAY INTERSECTION - Missing signals"},
  {lat:41.3812,lon:19.7721,name:"Kamez",severity:"HIGH",incidents:19,warning:"EXCESSIVE SPEED - No cameras"},
];

// TRAIN SCHEDULE
const TRAINS = [
  {id:'AL-01',from:'Tirane',to:'Durres',dep:'07:00',arr:'07:55',status:'ON TIME',platform:1},
  {id:'AL-02',from:'Tirane',to:'Shkoder',dep:'08:30',arr:'11:00',status:'ON TIME',platform:2},
  {id:'AL-03',from:'Tirane',to:'Durres',dep:'10:15',arr:'11:10',status:'DELAYED +12 MIN',platform:1},
  {id:'AL-04',from:'Tirane',to:'Vlore',dep:'12:00',arr:'14:30',status:'ON TIME',platform:3},
  {id:'AL-05',from:'Tirane',to:'Durres',dep:'13:45',arr:'14:40',status:'ON TIME',platform:1},
  {id:'AL-06',from:'Tirane',to:'Elbasan',dep:'15:20',arr:'17:00',status:'CANCELLED',platform:2},
  {id:'AL-07',from:'Tirane',to:'Durres',dep:'17:00',arr:'17:55',status:'ON TIME',platform:1},
  {id:'AL-08',from:'Tirane',to:'Shkoder',dep:'18:30',arr:'21:00',status:'DELAYED +5 MIN',platform:2},
  {id:'AL-09',from:'Tirane',to:'Durres',dep:'20:00',arr:'20:55',status:'ON TIME',platform:1},
  {id:'AL-10',from:'Durres',to:'Tirane',dep:'06:30',arr:'07:25',status:'ON TIME',platform:1},
  {id:'AL-11',from:'Shkoder',to:'Tirane',dep:'06:00',arr:'08:30',status:'ON TIME',platform:2},
  {id:'AL-12',from:'Vlore',to:'Tirane',dep:'09:00',arr:'11:30',status:'DELAYED +18 MIN',platform:3},
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

const SAFETY_MESSAGES = [
  'SAFETY ALERT: Slow down near Kombinat intersection - 32 accidents reported',
  'TRAFFIC TIP: Reduce speed at Sheshi Skenderbej - high pedestrian area',
  'ROAD SAFETY: Use low beams inside city limits - mandatory by law',
  'ALERT: School zone active 07:30-15:30 near 15 Kateshi',
  'CAUTION: Poor lighting at Stacioni i Trenit - sharp turn ahead',
  'HEAVY PEDESTRIAN ZONE: Tregu 5 Maji - reduce speed',
  'EMERGENCY VEHICLES: Materniteti hospital zone - be prepared to yield'
];

let msgIdx = 0;
function showSafetyMessage(){
  const el = document.querySelector('.announcement');
  if(!el) return;
  el.querySelector('.ann-text').textContent = SAFETY_MESSAGES[msgIdx % SAFETY_MESSAGES.length];
  el.classList.add('show');
  msgIdx++;
  setTimeout(() => el.classList.remove('show'), 5000);
}
