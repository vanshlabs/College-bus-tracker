const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
let token = localStorage.getItem('mediride_token') || '';
let currentUser = JSON.parse(localStorage.getItem('mediride_user') || 'null');
let buses = [], map, markers = [], activePage = 'overview', toastTimer, allRoutes = [], routeMap, routeLayers = [];
const navItems = [
  {id:'overview',label:'Overview',icon:'⌂',roles:['student','driver','admin','maintenance']},
  {id:'routeFinder',label:'Find bus / stop',icon:'⌕',roles:['student']},
  {id:'buses',label:'Bus tracking',icon:'◎',roles:['student','driver','admin','maintenance']},
  {id:'notifications',label:'Notifications',icon:'♧',roles:['student','driver','admin','maintenance']},
  {id:'boarding',label:'Boarding',icon:'↗',roles:['student']},
  {id:'controls',label:'Trip controls',icon:'◉',roles:['driver','admin']},
  {id:'records',label:'Records',icon:'▤',roles:['driver','maintenance','admin']},
  {id:'alerts',label:'Delay alerts',icon:'⚑',roles:['admin']}
];
function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function showToast(msg,error=false){const el=$('#toast');el.textContent=msg;el.classList.remove('hidden','error');if(error)el.classList.add('error');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.add('hidden'),3200);}
async function api(path,opts={}){const headers={'Content-Type':'application/json',...(opts.headers||{})};if(token)headers.Authorization=`Bearer ${token}`;const r=await fetch(path,{...opts,headers});let data={};try{data=await r.json()}catch{}if(!r.ok)throw new Error(data.error||`Request failed (${r.status})`);return data;}
function roleLabel(role){return ({student:'Student',driver:'Driver',admin:'Administrator',maintenance:'Maintenance'})[role]||role;}
function setupNav(){const allowed=navItems.filter(n=>n.roles.includes(currentUser.role));const html=allowed.map(n=>`<button class="nav-link ${activePage===n.id?'active':''}" data-page="${n.id}"><span class="nav-icon">${n.icon}</span>${n.label}</button>`).join('');$('#sideNav').innerHTML=html;$('#mobileNav').innerHTML=allowed.slice(0,5).map(n=>`<button class="nav-link ${activePage===n.id?'active':''}" data-page="${n.id}"><span class="nav-icon">${n.icon}</span>${n.label}</button>`).join('');$$('[data-page]').forEach(b=>b.addEventListener('click',()=>goPage(b.dataset.page)));}
function goPage(id){activePage=id;$$('.page').forEach(p=>p.classList.toggle('active',p.id===id+'Page'));$$('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===id));$('#crumbPage').textContent=navItems.find(n=>n.id===id)?.label||'Overview';$('#pageTitle').textContent=({overview:`Hello, ${currentUser.name.split(' ')[0]}`,routeFinder:'Find your bus',buses:'Bus tracking',notifications:'Notifications',boarding:'Boarding',controls:'Trip controls',records:'Records & maintenance',alerts:'Delay alerts'})[id];$('#pageSubtitle').textContent=({overview:'Here’s what’s happening with your commute.',routeFinder:'Choose a route or search for a stop to see which bus serves it.',buses:'Live location and route information for your fleet.',notifications:'Important updates from your transport network.',boarding:'Confirm your ride when you get on your bus.',controls:'Manage your assigned trip and share your location.',records:'Keep fleet operations and maintenance up to date.',alerts:'Review buses reporting significant delays.'})[id];$('.sidebar').classList.remove('open');if(id==='routeFinder')loadRouteFinder();if(id==='buses')renderBusCards();if(id==='notifications')loadNotifications();if(id==='controls')renderDriverControls();if(id==='records')loadRecords();if(id==='alerts')loadAlerts();if(id==='boarding'){} }
function initApp(){if(!token||!currentUser){$('#loginScreen').classList.remove('hidden');$('#appShell').classList.add('hidden');return;}$('#loginScreen').classList.add('hidden');$('#appShell').classList.remove('hidden');$('#sideName').textContent=currentUser.name;$('#sideRole').textContent=roleLabel(currentUser.role);$('#sideAvatar').textContent=currentUser.name[0].toUpperCase();$('#topAvatar').textContent=currentUser.name[0].toUpperCase();$('#dateLabel').textContent=new Intl.DateTimeFormat('en-IN',{weekday:'short',day:'numeric',month:'short',year:'numeric'}).format(new Date());setupNav();goPage('overview');refreshAll();}
async function refreshAll(){try{buses=await api('/api/buses'+(currentUser?.role==='student'?'?all=1':''));renderStats();renderBusTable();renderBusCards();renderMap();$('#lastUpdated').textContent='Updated '+new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});renderActivity();}catch(e){showToast(e.message,true)}}
function renderStats(){const running=buses.filter(b=>b.status==='running').length,delayed=buses.filter(b=>(b.delay_min||0)>=10).length;let stats=[['Buses on route',running,'Currently running','◎'],['Total buses',buses.length,'In your transport network','▣'],['Delayed buses',delayed,'10+ minute delay','◷'],['Your role',roleLabel(currentUser.role),'Access level','♙']];if(currentUser.role==='student'){const own=buses.filter(b=>b.route_id===currentUser.route_id);const ownBus=own[0];stats=[['Your assigned bus',ownBus?.number||'—','Default route','◎'],['Route status',ownBus?.status||'—','Current reported status','↗'],['Reported delay',(ownBus?.delay_min||0)+' min','Latest driver report','◷'],['Next stop',ownBus?.eta?.next_stop||'Schedule','GPS ETA when available','◷']];}$('#statsGrid').innerHTML=stats.map(s=>`<div class="stat-card"><div class="stat-top">${s[0]}<span class="stat-icon">${s[3]}</span></div><div class="stat-value">${esc(s[1])}</div><div class="stat-note">${s[2]}</div></div>`).join('');}
function statusClass(s){return ['running','stopped','maintenance','delayed'].includes(s)?s:'stopped';}
function busRow(b){const gps=b.lat!=null&&b.lng!=null;return `<tr><td><b>${esc(b.number)}</b><br><small>#${b.id}</small></td><td>${esc(b.route||'—')}</td><td><span class="status ${gps?statusClass((b.delay_min||0)>=10?'delayed':b.status):'stopped'}">${gps?((b.delay_min||0)>=10?'Delayed':esc(b.status)):'GPS unavailable'}</span></td><td>${gps?(b.delay_min||0)+' min':'—'}</td><td>${b.eta?.college_min!=null?b.eta.college_min+' min':'Not available'}</td></tr>`;}
function renderBusTable(){$('#busTable').innerHTML=buses.length?buses.map(busRow).join(''):'<tr><td colspan="5">No buses found.</td></tr>';}
function renderBusCards(){
  const visible=currentUser.role==='student'?buses:buses;
  $('#busCards').innerHTML=visible.length?visible.map(b=>{
    const route=allRoutes.find(r=>r.bus_id===b.id)||allRoutes.find(r=>r.bus_number===String(b.number).replace(/^Bus /,''));
    return `<article class="bus-card bus-card-interactive">
      <div class="bus-card-top"><div class="bus-number">${esc(b.number)}</div><span class="status stopped">${b.lat!=null&&b.lng!=null?'GPS available':'GPS unavailable'}</span></div>
      <div class="bus-route">${esc(b.route||'Route unavailable')}</div>
      <div class="bus-meta"><div><small>BUS ID</small><b>#${b.id}</b></div><div><small>DRIVER</small><b>${esc(b.driver||'—')}</b></div><div><small>STOPS</small><b>${route?.stops?.length??b.stops?.length??'—'}</b></div><div><small>LIVE ETA</small><b>${b.eta?.college_min!=null?b.eta.college_min+' min':'Not available'}</b></div></div>
      <button class="btn btn-primary bus-explore-btn" data-bus-route="${b.route_id}">View bus & route →</button>
    </article>`;
  }).join(''):'<div class="panel empty-state">No buses found.</div>';
  $$('#busCards [data-bus-route]').forEach(btn=>btn.addEventListener('click',async()=>{
    if(!allRoutes.length){try{allRoutes=await api('/api/routes');}catch(e){showToast(e.message,true);return;}}
    const route=allRoutes.find(r=>r.id===Number(btn.dataset.busRoute));
    if(!route){showToast('Route details are not available.',true);return;}
    goPage('routeFinder');
    const city=$('#cityFilter');city.value='All';$('#routeSearch').value='';
    await loadRouteFinder();$('#routeSelect').value=String(route.id);renderSelectedRoute(route);
  }));
}
function renderMap(){
  const mapEl=$('#map');
  if(!mapEl)return;
  if(!window.L){mapEl.innerHTML='<div class="map-fallback">The map library could not load. Check your internet connection and reload the page.</div>';return;}
  if(!map){
    map=L.map('map',{scrollWheelZoom:false}).setView([22.69,75.85],11);
    const tiles=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom:19
    });
    tiles.on('tileerror',()=>{const note=$('#mapTileNote');if(note)note.classList.remove('hidden');});
    tiles.addTo(map);
    mapEl.insertAdjacentHTML('beforeend','<div id="mapTileNote" class="map-tile-note hidden">Map tiles are not loading. Check your internet connection or network restrictions.</div><div id="mapNoGps" class="map-no-gps">No live GPS feeds yet. Open <b>Find bus / stop</b> to explore every scheduled route and its stops.</div>');
  }
  markers.forEach(m=>map.removeLayer(m));markers=[];
  buses.forEach(b=>{
    if(b.lat==null||b.lng==null)return;
    const m=L.marker([b.lat,b.lng]).addTo(map).bindPopup(`<b>${esc(b.number)}</b><br>${esc(b.route||'')}<br>ETA: ${b.eta?.college_min??'—'} min`);
    markers.push(m);
  });
  const noGps=$('#mapNoGps');if(noGps)noGps.classList.toggle('hidden',markers.length>0);
  if(markers.length)map.fitBounds(L.featureGroup(markers).getBounds().pad(.18));
  setTimeout(()=>map.invalidateSize(),150);
}
function renderActivity(){const items=[];buses.forEach(b=>{if((b.delay_min||0)>=10)items.push({icon:'◷',title:`${b.number} is delayed`,desc:`Running ${b.delay_min} minutes late on ${b.route||'its route'}.`});if(b.lat!=null&&b.lng!=null&&b.status==='running')items.push({icon:'↗',title:`${b.number} GPS reported`,desc:`Next stop: ${b.eta?.next_stop||'Updating location'}.`});});$('#activityTitle').textContent=currentUser.role==='student'?'Route updates':'Fleet activity';$('#activityList').innerHTML=items.length?items.slice(0,6).map(x=>`<div class="activity-item"><div class="activity-dot">${x.icon}</div><div><b>${esc(x.title)}</b><p>${esc(x.desc)}</p></div></div>`).join(''):'<div class="empty-state">No new activity right now.</div>';}

async function loadRouteFinder(){
  try{
    if(!allRoutes.length) allRoutes=await api('/api/routes');
    const search=$('#routeSearch'), city=$('#cityFilter'), select=$('#routeSelect');
    const assigned=allRoutes.find(r=>r.id===currentUser.route_id);
    $('#assignedRouteNote').innerHTML=assigned?`<b>Your assigned route:</b> ${esc(assigned.name)}. It is selected by default; you can search any other Indore or Dewas route.`:'Select any route below.';
    const populate=()=>{
      const q=(search.value||'').trim().toLowerCase(), c=city.value;
      const filtered=allRoutes.filter(r=>(c==='All'||r.city===c) && (!q || `${r.name} ${r.bus_number} ${r.stops.map(s=>s.name).join(' ')}`.toLowerCase().includes(q)));
      const current=Number(select.value);
      select.innerHTML=filtered.map(r=>`<option value="${r.id}">${esc(r.name)} · ${esc(r.city)}</option>`).join('') || '<option value="">No matching routes</option>';
      if(filtered.some(r=>r.id===current))select.value=String(current);
      else if(filtered.some(r=>r.id===currentUser.route_id))select.value=String(currentUser.route_id);
      else if(filtered.length)select.value=String(filtered[0].id);
      renderRouteBusCards(filtered);
      const selected=filtered.find(r=>r.id===Number(select.value));
      if(selected)renderSelectedRoute(selected);
      else {$('#routeStopsList').innerHTML='<div class="empty-state">No routes match your search.</div>';$('#routeMapStatus').textContent='Choose a matching route to view its road path.';if(routeMap){routeLayers.forEach(x=>routeMap.removeLayer(x));routeLayers=[];}}
    };
    if(!search.dataset.bound){search.addEventListener('input',populate);city.addEventListener('change',populate);select.addEventListener('change',()=>{const r=allRoutes.find(x=>x.id===Number(select.value));if(r)renderSelectedRoute(r);});search.dataset.bound='1';}
    populate();
  }catch(e){showToast(e.message,true);}
}
function renderRouteBusCards(routes){
  const host=$('#routeBusCards');
  if(!routes.length){host.innerHTML='<div class="panel empty-state">No buses match your search. Try another stop, bus number or city.</div>';return;}
  host.innerHTML=routes.map(r=>{
    const gpsAvailable=r.lat!=null&&r.lng!=null;
    const isAssigned=r.id===currentUser.route_id;
    return `<article class="route-bus-card ${isAssigned?'assigned':''}">
      <div class="route-bus-card-top"><span class="route-bus-number">${esc(r.bus_number?'Bus '+r.bus_number:'Bus not assigned')}</span>${isAssigned?'<span class="assigned-chip">YOUR ROUTE</span>':''}</div>
      <div class="route-bus-route">${esc(r.name)}</div>
      <div class="route-bus-city">${esc(r.city)} · ${r.stops.length} stops</div>
      <div class="route-bus-meta"><span>${gpsAvailable?'GPS position available':'GPS data unavailable'}</span><span>${esc(r.stops[0]?.time||'')} departure</span></div>
      <button class="btn btn-primary route-open-btn" data-open-route="${r.id}">Explore this bus <span>→</span></button>
    </article>`;
  }).join('');
  host.querySelectorAll('[data-open-route]').forEach(btn=>btn.addEventListener('click',()=>{
    const id=Number(btn.dataset.openRoute);const route=allRoutes.find(x=>x.id===id);if(!route)return;
    $('#routeSelect').value=String(id);renderSelectedRoute(route);
    $('#routeStopsList').scrollIntoView({behavior:'smooth',block:'nearest'});
  }));
}

function renderSelectedRoute(route){
  const busName=route.bus_number||'Bus not assigned';
  $('#routeStopsList').innerHTML=route.stops.map((s,i)=>{
    const delay=Number(route.delay_min||0), time=s.time||'—';
    const [hh,mm]=time.split(':').map(Number);
    const d=new Date();d.setHours(hh||0,(mm||0)+delay,0,0);
    const display=Number.isFinite(hh)?d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):time;
    return `<div class="route-stop-row"><div class="stop-index">${i===route.stops.length-1?'★':i+1}</div><div class="stop-info"><b>${esc(s.name)}</b><small>${i===route.stops.length-1?'College arrival':'Pickup stop'}</small></div><div class="stop-time"><b>${esc(display)}</b><small>${delay?`+${delay} min reported delay`:'Scheduled'}</small></div></div>`;
  }).join('')+`<div class="route-bus-summary"><b>${esc(busName)}</b><span class="status stopped">${route.lat!=null&&route.lng!=null?'GPS available':'GPS unavailable · timetable only'}</span></div><div class="route-detail-note">You can explore this bus, its ordered stops and scheduled pickup times. Live position and live ETA are unavailable until a driver shares GPS.</div>`;
  drawRoadRoute(route);
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function geocodeStop(name,city){
  const key=`mediride_geo_${city}_${name}`;const cached=localStorage.getItem(key);if(cached)return JSON.parse(cached);
  const query=encodeURIComponent(`${name}, ${city}, Madhya Pradesh, India`);
  const res=await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${query}`,{headers:{'Accept':'application/json'}});
  if(!res.ok)throw new Error('OpenStreetMap geocoding is temporarily unavailable.');
  const data=await res.json();if(!data.length)return null;
  const point=[Number(data[0].lat),Number(data[0].lon)];localStorage.setItem(key,JSON.stringify(point));return point;
}
async function drawRoadRoute(route){
  const status=$('#routeMapStatus');status.textContent='Finding stop locations and building the road route…';
  if(!window.L){status.textContent='Leaflet map library did not load. Check your internet connection.';return;}
  if(!routeMap){routeMap=L.map('routeMap',{scrollWheelZoom:false}).setView([22.72,75.86],10);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; OpenStreetMap contributors',maxZoom:19}).addTo(routeMap);}
  routeLayers.forEach(x=>routeMap.removeLayer(x));routeLayers=[];
  try{
    const coords=[];
    for(let i=0;i<route.stops.length;i++){
      const s=route.stops[i];let point=null;
      if(s.lat!=null&&s.lng!=null)point=[s.lat,s.lng];
      else point=await geocodeStop(s.name,route.city);
      if(point)coords.push({point,stop:s});
      if(i<route.stops.length-1)await sleep(1050); // respect the public Nominatim service rate limit
    }
    if(coords.length<2){status.textContent='Could not locate enough stops to draw this route. Stop names and timetable are still available.';return;}
    let roadPoints=[];
    const coordString=coords.map(x=>`${x.point[1]},${x.point[0]}`).join(';');
    const routeUrl=`https://router.project-osrm.org/route/v1/driving/${coordString}?overview=full&geometries=geojson&steps=false`;
    const r=await fetch(routeUrl);
    if(r.ok){
      const data=await r.json();
      if(data.routes?.[0]?.geometry?.coordinates)roadPoints=data.routes[0].geometry.coordinates.map(c=>[c[1],c[0]]);
    }
    if(roadPoints.length>1){const line=L.polyline(roadPoints,{color:'#4169e1',weight:5,opacity:.85}).addTo(routeMap);routeLayers.push(line);}
    coords.forEach((x,i)=>{const marker=L.circleMarker(x.point,{radius:6,color:'#fff',weight:2,fillColor:'#4169e1',fillOpacity:1}).addTo(routeMap).bindPopup(`<b>${esc(x.stop.name)}</b><br>${esc(x.stop.time||'')}`);routeLayers.push(marker);});
    if(route.lat!=null&&route.lng!=null){
      let busPoint=[route.lat,route.lng];
      try{const nr=await fetch(`https://router.project-osrm.org/nearest/v1/driving/${route.lng},${route.lat}?number=1`);const nd=await nr.json();if(nd.waypoints?.[0]?.location)busPoint=[nd.waypoints[0].location[1],nd.waypoints[0].location[0]];}catch{}
      const busMarker=L.marker(busPoint).addTo(routeMap).bindPopup(`<b>${esc(route.bus_number||'Bus')}</b><br>Driver GPS location (road-snapped)`);
      routeLayers.push(busMarker);
    }
    const bounds=roadPoints.length?L.latLngBounds(roadPoints):L.latLngBounds(coords.map(x=>x.point));routeMap.fitBounds(bounds.pad(.12));setTimeout(()=>routeMap.invalidateSize(),120);
    status.textContent=`Showing ${coords.length} located stops. Road path uses OSRM routing over OpenStreetMap; stop names/times are from the uploaded route sheet.`;
  }catch(e){status.textContent=`The map route could not load: ${e.message}. The stop timetable remains available.`;}
}

async function loadNotifications(){try{const rows=await api('/api/notifications');$('#notificationsList').innerHTML=rows.length?rows.map(n=>`<div class="notification-item"><div class="notification-symbol">!</div><div><b>Transport update</b><p>${esc(n.message)}</p><small>${esc(n.created||'')}</small></div></div>`).join(''):'<div class="empty-state">You’re all caught up. No notifications yet.</div>';}catch(e){showToast(e.message,true)}}
function renderDriverControls(){const mine=buses.find(b=>b.driver_id===currentUser.id)||buses[0];$('#driverControls').innerHTML=mine?`<div class="control-row"><div><b>Assigned bus · ${esc(mine.number)}</b><small>${esc(mine.route||'')}</small></div><span class="status ${statusClass(mine.status)}">${esc(mine.status)}</span></div><div class="control-row"><div><b>Trip status</b><small>Update the current bus status</small></div><div class="control-actions"><select id="busStatus"><option value="running">Running</option><option value="stopped">Stopped</option><option value="maintenance">Maintenance</option></select><button class="btn btn-outline" id="saveStatus">Save</button></div></div><div class="control-row"><div><b>Report a delay</b><small>Set the current delay in minutes</small></div><div class="control-actions"><input id="delayMinutes" type="number" min="0" max="240" value="${mine.delay_min||0}" style="width:85px"><button class="btn btn-outline" id="saveDelay">Update</button></div></div><div class="control-row"><div><b>Share GPS location</b><small>Allow browser location access while using this page</small></div><button class="btn btn-primary" id="shareGps">Send my GPS</button></div><div class="muted" style="font-size:10px;margin-top:14px">Selected bus ID: ${mine.id}. Your account can update its assigned bus only.</div>`:'<div class="empty-state">No bus is assigned to this driver account.</div>';const s=$('#busStatus');if(s&&mine)s.value=mine.status;$('#saveStatus')?.addEventListener('click',()=>updateBus(mine.id,{status:$('#busStatus').value,delay_min:Number($('#delayMinutes').value||0)}));$('#saveDelay')?.addEventListener('click',()=>updateBus(mine.id,{status:$('#busStatus').value,delay_min:Number($('#delayMinutes').value||0)}));$('#shareGps')?.addEventListener('click',()=>shareGps(mine.id));}
async function updateBus(id,payload){try{await api(`/api/buses/${id}/status`,{method:'POST',body:JSON.stringify(payload)});showToast('Bus information updated.');await refreshAll();renderDriverControls();}catch(e){showToast(e.message,true)}}
function shareGps(id){if(!navigator.geolocation){showToast('Geolocation is not supported by this browser.',true);return;}navigator.geolocation.getCurrentPosition(async p=>{try{await api(`/api/buses/${id}/location`,{method:'POST',body:JSON.stringify({lat:p.coords.latitude,lng:p.coords.longitude})});showToast('Your GPS location was sent.');refreshAll();}catch(e){showToast(e.message,true)}},e=>showToast(e.message||'Location permission was denied.',true),{enableHighAccuracy:true,timeout:12000});}
async function loadRecords(){for(const kind of ['fuel','maintenance']){try{const rows=await api(`/api/records/${kind}`);const target=kind==='fuel'?'fuelRecords':'maintenanceRecords';$( '#'+target).innerHTML=rows.length?rows.slice(0,8).map(r=>`<div class="record-row">Bus #${r.bus_id} · ${kind==='fuel'?`${r.litres} L · ${r.mileage} km/L`:`${esc(r.issue)} · ${esc(r.status)}`}</div>`).join(''):'<div class="empty-state">No records yet.</div>';}catch(e){$('#'+(kind==='fuel'?'fuelRecords':'maintenanceRecords')).innerHTML=`<div class="empty-state">${esc(e.message)}</div>`;}}}
async function loadAlerts(){try{const rows=await api('/api/alerts');$('#alertsList').innerHTML=rows.length?rows.map(a=>`<div class="notification-item"><div class="notification-symbol">!</div><div><b>Bus #${a.bus_id} · ${a.delay_min} min delay</b><p>${esc(a.message)}</p><small>${esc(a.created)}</small></div></div>`).join(''):'<div class="empty-state">No delay alerts recorded.</div>';}catch(e){showToast(e.message,true)}}
$('#loginForm').addEventListener('submit',async e=>{e.preventDefault();$('#loginError').textContent='';try{const data=await api('/api/login',{method:'POST',body:JSON.stringify({email:$('#email').value,password:$('#password').value})});token=data.token;currentUser=data.user;localStorage.setItem('mediride_token',token);localStorage.setItem('mediride_user',JSON.stringify(currentUser));initApp();}catch(err){$('#loginError').textContent=err.message;}});
$('#togglePassword').addEventListener('click',()=>{$('#password').type=$('#password').type==='password'?'text':'password';});
function logout(){token='';currentUser=null;localStorage.removeItem('mediride_token');localStorage.removeItem('mediride_user');if(map){map.remove();map=null;}if(routeMap){routeMap.remove();routeMap=null;}routeLayers=[];allRoutes=[];markers=[];initApp();}
$('#logoutBtn').addEventListener('click',logout);$('#mobileMenu').addEventListener('click',()=>$('.sidebar').classList.toggle('open'));$('#refreshBtn').addEventListener('click',refreshAll);$('#busesRefresh').addEventListener('click',refreshAll);
$('#boardingForm').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.target);try{await api('/api/boarding',{method:'POST',body:JSON.stringify({bus_id:Number(f.get('bus_id')),stop:f.get('stop')})});showToast('Boarding confirmed.');e.target.reset();}catch(err){showToast(err.message,true)}});
$('#fuelForm').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.target);try{await api('/api/records/fuel',{method:'POST',body:JSON.stringify({bus_id:Number(f.get('bus_id')),litres:Number(f.get('litres')),mileage:Number(f.get('mileage'))})});showToast('Fuel record added.');e.target.reset();loadRecords();}catch(err){showToast(err.message,true)}});
$('#maintenanceForm').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.target);try{await api('/api/records/maintenance',{method:'POST',body:JSON.stringify({bus_id:Number(f.get('bus_id')),issue:f.get('issue'),status:f.get('status')})});showToast('Maintenance record added.');e.target.reset();loadRecords();}catch(err){showToast(err.message,true)}});
document.addEventListener('click',e=>{if(e.target.closest('.sidebar')===null&&!e.target.closest('#mobileMenu'))$('.sidebar').classList.remove('open');});
if(currentUser&&token)initApp();
setInterval(()=>{if(token)refreshAll()},15000);
