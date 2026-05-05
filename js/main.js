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
};
const BUS_LINES=[
  {id:'L5',number:'5',name:'Porcelan → Qender',stops:['porcelan','kombinat','willson','blloku','qendra','skender'],buses:[{id:'TUA-501',lat:41.3156,lon:19.7821,speed:28},{id:'TUA-502',lat:41.3207,lon:19.7978,speed:22}]},
  {id:'L7',number:'7',name:'Kombinat → Stacioni',stops:['kombinat','willson','blloku','qendra','stacion'],buses:[{id:'TUA-701',lat:41.3089,lon:19.7934,speed:31},{id:'TUA-702',lat:41.3230,lon:19.8150,speed:25}]},
  {id:'L12',number:'12',name:'Selitë → Sheshi Skënderbej',stops:['selite','blloku','qendra','skender'],buses:[{id:'TUA-1201',lat:41.3198,lon:19.8389,speed:27}]},
  {id:'L2',number:'2',name:'Laprake → Qender',stops:['laprake','stacion','skender','qendra'],buses:[{id:'TUA-201',lat:41.3421,lon:19.8312,speed:24},{id:'TUA-202',lat:41.3368,lon:19.8200,speed:29}]},
  {id:'L9',number:'9',name:'Kamëz → Sheshi Skënderbej',stops:['kamez','laprake','stacion','skender'],buses:[{id:'TUA-901',lat:41.3812,lon:19.7721,speed:35}]},
];
const RFID_DB={
  'TEST1234':{name:'Andi Hoxha',paid:true,line:'ALL',expiry:'2025-12-31',balance:'1200 ALL'},
  'CARD-001-A':{name:'Besa Dema',paid:true,line:'L5',expiry:'2025-09-15',balance:'450 ALL'},
  'CARD-002-B':{name:'Genti Braho',paid:true,line:'L7',expiry:'2025-07-01',balance:'800 ALL'},
  'CARD-003-C':{name:'Mirela Koci',paid:false,line:'L12',expiry:'2025-06-30',balance:'0 ALL'},
  'CARD-004-D':{name:'Artan Basha',paid:true,line:'L2',expiry:'2024-01-01',balance:'200 ALL'},
  'STUDENT-01':{name:'Sara Leka',paid:true,line:'ALL',expiry:'2026-06-30',balance:'STUDENT'},
};
const TRAINS=[
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
function simulateBusMovement(bus,route){
  const stops=route.stops.map(s=>TUA_STOPS[s]);
  let segIdx=0,progress=Math.random();
  return setInterval(()=>{
    if(segIdx>=stops.length-1){segIdx=0;progress=0;}
    const from=stops[segIdx],to=stops[segIdx+1];
    progress+=0.003+Math.random()*0.002;
    if(progress>=1){progress=0;segIdx++;}
    if(segIdx>=stops.length-1)segIdx=0;
    bus.lat=from.lat+(to.lat-from.lat)*progress+(Math.random()-0.5)*0.0003;
    bus.lon=from.lon+(to.lon-from.lon)*progress+(Math.random()-0.5)*0.0003;
  },1200);
}
function calculateETA(bLat,bLon,sLat,sLon,spd){
  const R=6371,dLat=(sLat-bLat)*Math.PI/180,dLon=(sLon-bLon)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(bLat*Math.PI/180)*Math.cos(sLat*Math.PI/180)*Math.sin(dLon/2)**2;
  const dist=R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  return Math.max(1,Math.round((dist/spd)*60));
}
function timeNow(offset=0){const d=new Date(Date.now()+offset*60000);return d.toTimeString().slice(0,5);}
function randomBetween(a,b){return Math.floor(Math.random()*(b-a+1))+a;}
const ANN_MESSAGES=['⚡ LINE 7: Minor delay — Kombinat stop','🔔 LINE 5: TUA-501 approaching Sheshi Willson','✅ LINE 12: Back on schedule','🔔 TRAIN AL-04: Boarding Platform 3 in 5 min'];
let annIdx=0;
function showAnnouncement(){
  const el=document.querySelector('.announcement');
  if(!el)return;
  el.querySelector('.ann-text').textContent=ANN_MESSAGES[annIdx%ANN_MESSAGES.length];
  el.classList.add('show');annIdx++;
  setTimeout(()=>el.classList.remove('show'),5000);
}
