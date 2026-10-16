/* Fuel Pro Beta ANP — integração de dados públicos para homologação, não produção. */
'use strict';

const CENTERS = {
  'ARARAQUARA': [-21.7927, -48.1754],
  'SAO JOSE DOS CAMPOS': [-23.1996, -45.8841]
};
const FUELS = {
  gas:'Gasolina comum', eta:'Etanol', gas_ad:'Gasolina aditivada',
  eta_ad:'Etanol aditivado', die:'Diesel', die_s10:'Diesel S10', gnv:'GNV'
};
const OFFICIAL_PRICE = 'ANP - levantamento semanal';
const els = Object.fromEntries([
  'city-filter','fuel-filter','summary','detail','detail-name','detail-address',
  'detail-fuel','detail-value','detail-date','detail-geo','detail-lab',
  'detail-brand','close','gps','mode-all','mode-price','copy-address',
  'detail-expand','detail-expand-label','detail-advanced','community-disclosure','technical-details',
  'source-info','notification','detail-cnpj',
  'search-toggle','station-search-panel','station-query','search-clear','search-count','search-results',
  'directions','confirm-address','suggest-address','community-form','community-status',
  'new-address','address-notes','cancel-suggestion','feedback-share-actions',
  'send-feedback','share-feedback','undo-feedback','public-community-status',
  'nearby-toggle','nearby-panel','nearby-close','nearby-retry','nearby-radius',
  'nearby-status','nearby-results','nearby-sort','nearby-priced-only','detail-distance',
  'filters-toggle','extra-filters','minimize-detail','detail-mini','mini-name','mini-price'
].map(id => [id, document.getElementById(id)]));

let all = [];
let selected = null;
let mode = 'all';
let status = {};
let locationMarker = null;
let locationAccuracy = null;
let userPosition = null; // Ephemeral GPS in memory only, never localStorage or Firebase.
let locating = false;
let searchUpdateTimer = null;
const map = L.map('map', {zoomControl:false, preferCanvas:true}).setView(CENTERS['SAO JOSE DOS CAMPOS'], 12);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom:19,
  attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
}).addTo(map);
L.control.zoom({position:'bottomright'}).addTo(map);
const overlay = L.layerGroup().addTo(map);
const safeCoordinate = p => Number.isFinite(p.lat) && Number.isFinite(p.lng) &&
  p.lat > -35 && p.lat < -1 && p.lng > -75 && p.lng < -30;
const formatMoney = n => 'R$ ' + Number(n).toFixed(2).replace('.', ',');
const readDate = iso => {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const parsed = Date.parse(iso + 'T12:00:00Z');
  return Number.isFinite(parsed) ? parsed : null;
};
const priceAge = iso => {
  const ts = readDate(iso);
  return ts === null ? null : Math.floor((Date.now() - ts) / 86400000);
};
function observed(p, fuel) {
  const value = p.prices && p.prices[fuel];
  const iso = p.collectedAtByFuel && p.collectedAtByFuel[fuel];
  const age = priceAge(iso);
  if (p.source !== OFFICIAL_PRICE || age === null || age < -1 || age > 30 ||
      typeof value !== 'number' || !Number.isFinite(value) || value <= 0.5 || value >= 30) return null;
  return {value, iso, age};
}
function notify(message) {
  const n = els.notification;
  n.textContent = message;
  n.hidden = false;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => n.hidden = true, 4500);
}
function currentCity() { return els['city-filter'].value; }
function currentFuel() { return els['fuel-filter'].value; }
function setDetailExpanded(expanded) {
  els.detail.classList.toggle('expanded', expanded);
  els['detail-advanced'].hidden = !expanded;
  els['detail-expand'].setAttribute('aria-expanded', String(expanded));
  els['detail-expand-label'].textContent = expanded ? 'Menos detalhes' : 'Mais detalhes';
  if (!expanded) els.detail.scrollTop = 0;
}
function hideDetail() {
  selected = null;
  setDetailExpanded(false);
  els.detail.hidden = true;
  els['detail-mini'].hidden = true;
}
function minimizeDetail() {
  if (!selected) return;
  els.detail.hidden = true;
  els['detail-mini'].hidden = false;
}
function restoreDetail() {
  if (!selected) return hideDetail();
  els['detail-mini'].hidden = true;
  els.detail.hidden = false;
}
function toggleFilters(force) {
  const isVisible = !els['extra-filters'].hidden;
  const show = typeof force==='boolean' ? force : !isVisible;
  els['extra-filters'].hidden = !show;
  els['filters-toggle'].setAttribute('aria-expanded',String(show));
}
els['filters-toggle'].addEventListener('click',()=>toggleFilters());
els['minimize-detail'].addEventListener('click',minimizeDetail);
els['detail-mini'].addEventListener('click',restoreDetail);
els['detail-expand'].addEventListener('click', () =>
  setDetailExpanded(els['detail-expand'].getAttribute('aria-expanded') !== 'true')
);
function stationCount(city) {
  return all.filter(p => p.city === city && safeCoordinate(p)).length;
}
function toggleSearchPanel(force) {
  const panel = els['station-search-panel'];
  const show = typeof force === 'boolean' ? force : panel.hidden;
  if(show){ closeNearbyPanel(); toggleFilters(false); }
  panel.hidden = !show;
  els['search-toggle'].setAttribute('aria-expanded', String(show));
  if (show) {
    updateSearchResults();
    els['station-query'].focus();
  }
}
function makeTextElement(tag, cssClass, label) {
  const node = document.createElement(tag);
  if (cssClass) node.className = cssClass;
  node.textContent = label;
  return node;
}
function updateSearchResults() {
  const box = els['search-results'];
  box.replaceChildren();
  const query = els['station-query'].value.trim();
  if (FuelProSearch.normalize(query).length < 2) {
    els['search-count'].textContent = 'Digite pelo menos 2 caracteres para pesquisar.';
    return;
  }
  const {matches,total} = FuelProSearch.searchStations(all,query,currentCity(),12);
  els['search-count'].textContent = total
    ? total + (total === 1 ? ' posto encontrado' : ' postos encontrados') +
      (total > matches.length ? ' · exibindo os primeiros ' + matches.length : '')
    : 'Nenhum posto encontrado neste cadastro da ANP.';
  for (const station of matches) {
    const cityLabel = station.city === 'ARARAQUARA' ? 'Araraquara' : 'São José dos Campos';
    const hasPoint = station.mapEligible === true && safeCoordinate(station);
    const item = document.createElement('button');
    item.type='button';
    item.className='search-result';
    const name = makeTextElement('strong','result-name',station.name || 'Posto cadastrado na ANP');
    const location = makeTextElement('span','result-location',[
      effectiveAddress(station), effectiveDistrict(station), cityLabel
    ].filter(Boolean).join(' · '));
    const indicator = makeTextElement('span','result-info',
      hasPoint ? '📍 Localização ANP provisória · CNPJ ' + station.cnpj
        : '⚠️ Sem coordenadas ANP · CNPJ ' + station.cnpj);
    const price = observed(station,currentFuel());
    const priceText = makeTextElement('span','result-price',
      price ? formatMoney(price.value) + ' · coletado em ' + friendlyDay(price.iso)
        : 'Preço não disponível');
    item.append(name,location,indicator,priceText);
    item.addEventListener('click', () => locateStationFromSearch(station));
    box.appendChild(item);
  }
}
function locateStationFromSearch(station) {
  if (station.city !== currentCity()) {
    els['city-filter'].value = station.city;
    chooseCity(station.city);
  }
  toggleSearchPanel(false);
  const hasPoint = station.mapEligible === true && safeCoordinate(station);
  if (hasPoint) map.flyTo([station.lat,station.lng],15,{duration:0.65});
  else map.setView(CENTERS[station.city],12);
  showDetail(station);
  if (!hasPoint) notify('Este posto não possui coordenadas ANP utilizáveis; exibimos apenas a ficha cadastral.');
}
/* GPS and nearby stations: browser permission is requested only from
 * a direct user interaction. Coordinates never leave device memory. */
function closeNearbyPanel(){
  const panel=els['nearby-panel'];
  if(!panel)return;
  panel.hidden=true;
  els['nearby-toggle'].setAttribute('aria-expanded','false');
}
function showNearbyPanel(){
  toggleSearchPanel(false);
  toggleFilters(false);
  els['nearby-panel'].hidden=false;
  els['nearby-toggle'].setAttribute('aria-expanded','true');
  if(userPosition){
    updateNearbyResults();
  } else {
    els['nearby-status'].textContent='Solicitando permissão para usar o GPS neste aparelho…';
    void requestGps();
  }
}
function updateNearbyResults(){
  const list=els['nearby-results'];
  list.replaceChildren();
  if(!userPosition){
    els['nearby-status'].textContent='Ative o GPS para listar postos próximos. Sua posição não será enviada ao servidor.';
    return;
  }
  const radius=Number(els['nearby-radius'].value);
  const pricedOnly=els['nearby-priced-only'].checked;
  const sortBy=els['nearby-sort'].value==='price'?'price':'distance';
  const results=FuelProNearby.nearest(all,userPosition,{
    city:currentCity(),radiusKm:radius,limit:15,sortBy,onlyPriced:pricedOnly,
    // Only the original observed ANP price, with a valid collection date, can be ranked.
    priceOf:station=>observed(station,currentFuel())?.value ?? null
  });
  els['nearby-status'].textContent=results.total
    ? results.total+' posto(s) no raio de '+radius+' km · '+results.withPrice+
      ' com preço ANP recente de '+FUELS[currentFuel()].toLowerCase()+
      ' · exibindo '+results.matches.length+
      (sortBy==='price'?' · menores preços primeiro (sem preço por último).':' · mais próximos primeiro.')
    : pricedOnly
      ? 'Nenhum posto com preço ANP recente deste combustível em '+radius+
        ' km. Desmarque o filtro, aumente o raio ou selecione “Ambas”.'
      : 'Nenhum posto com coordenadas ANP encontrado em '+radius+
        ' km. Amplie o raio ou selecione “Ambas” em Cidade.';
  for(const {station,distanceKm} of results.matches){
    const item=document.createElement('button');
    item.type='button';
    item.className='nearby-result';
    const head=makeTextElement('span','nearby-item-head','');
    const title=makeTextElement('strong','nearby-item-name',station.name||'Posto cadastrado');
    const badge=makeTextElement('span','nearby-km',FuelProNearby.formatDistance(distanceKm));
    head.append(title,badge);
    const address=makeTextElement('span','nearby-item-address',
      [effectiveAddress(station),effectiveDistrict(station)].filter(Boolean).join(' · '));
    const recent=observed(station,currentFuel());
    const price=makeTextElement('span','nearby-item-price',recent
      ? formatMoney(recent.value)+' · coleta ANP '+friendlyDay(recent.iso)
      : 'Preço atual não disponível');
    item.append(head,address,price);
    item.addEventListener('click',()=>{
      closeNearbyPanel();
      map.flyTo([station.lat,station.lng],15,{duration:.55});
      showDetail(station);
    });
    list.append(item);
  }
}
function renderUserPosition(coords){
  if(locationMarker)map.removeLayer(locationMarker);
  if(locationAccuracy)map.removeLayer(locationAccuracy);
  const latlng=[coords.latitude,coords.longitude];
  locationMarker=L.circleMarker(latlng,{
    radius:9,color:'#fff',weight:3,fillColor:'#2375e0',fillOpacity:1,
    bubblingMouseEvents:false
  }).addTo(map);
  locationMarker.bindTooltip('Sua posição (GPS do aparelho)');
  if(Number.isFinite(coords.accuracy)&&coords.accuracy>0&&coords.accuracy<=3000){
    locationAccuracy=L.circle(latlng,{
      radius:coords.accuracy,color:'#2375e0',weight:1,
      fillColor:'#478fef',fillOpacity:.10,bubblingMouseEvents:false
    }).addTo(map);
  }
}
function gpsErrorMessage(error){
  if(error?.code===1)return 'Permissão de localização negada. Autorize o GPS nas configurações do navegador.';
  if(error?.code===2)return 'Localização indisponível. Verifique se o GPS está ligado e tente novamente.';
  if(error?.code===3)return 'O GPS demorou para responder. Tente novamente em um local com melhor sinal.';
  return 'Não foi possível acessar a localização deste aparelho.';
}
function requestGps(){
  if(locating)return Promise.resolve(false);
  if(!window.isSecureContext||!navigator.geolocation){
    const message='Localização requer HTTPS e um navegador com GPS habilitado.';
    els['nearby-status'].textContent=message;notify(message);
    return Promise.resolve(false);
  }
  locating=true;
  els.gps.disabled=true;
  els['nearby-retry'].disabled=true;
  els['nearby-status'].textContent='Obtendo sua localização com permissão do navegador…';
  return new Promise(resolve=>{
    navigator.geolocation.getCurrentPosition(position=>{
      locating=false;
      els.gps.disabled=false;
      els['nearby-retry'].disabled=false;
      const coord={lat:position.coords.latitude,lng:position.coords.longitude};
      if(!FuelProNearby.validPoint(coord)){
        els['nearby-status'].textContent='Coordenadas de GPS inválidas. Tente novamente.';
        resolve(false);return;
      }
      userPosition=coord;
      const inferred=FuelProNearby.nearestCity(all,coord,30);
      if(inferred && currentCity()!==inferred){
        els['city-filter'].value=inferred;
        chooseCity(inferred);
      }
      renderUserPosition(position.coords);
      map.setView([coord.lat,coord.lng],14);
      if(!els['nearby-panel'].hidden)updateNearbyResults();
      const accuracy=Number.isFinite(position.coords.accuracy)
        ? ' · precisão informada: '+Math.round(position.coords.accuracy)+' m':'';
      notify('Localização obtida neste aparelho'+accuracy+'. Distâncias são estimativas em linha reta.');
      if(selected)showDetail(selected);
      resolve(true);
    },error=>{
      locating=false;
      els.gps.disabled=false;
      els['nearby-retry'].disabled=false;
      const message=gpsErrorMessage(error);
      els['nearby-status'].textContent=message;
      notify(message);
      resolve(false);
    },{enableHighAccuracy:false,timeout:15000,maximumAge:120000});
  });
}
els['nearby-toggle'].addEventListener('click',()=>{
  if(els['nearby-panel'].hidden)showNearbyPanel();
  else closeNearbyPanel();
});
els['nearby-close'].addEventListener('click',closeNearbyPanel);
els['nearby-retry'].addEventListener('click',()=>{void requestGps();});
els['nearby-radius'].addEventListener('change',updateNearbyResults);
els['nearby-sort'].addEventListener('change',updateNearbyResults);
els['nearby-priced-only'].addEventListener('change',updateNearbyResults);

els['search-toggle'].addEventListener('click',()=>toggleSearchPanel());
els['search-clear'].addEventListener('click',()=>{
  els['station-query'].value='';
  updateSearchResults();
  els['station-query'].focus();
});
els['station-query'].addEventListener('input',()=>{
  clearTimeout(searchUpdateTimer);
  searchUpdateTimer=setTimeout(updateSearchResults,100);
});
els['station-query'].addEventListener('keydown',event=>{
  if(event.key==='Escape'){toggleSearchPanel(false);els['search-toggle'].focus();}
  if(event.key==='Enter'){
    event.preventDefault();
    const results=FuelProSearch.searchStations(all,els['station-query'].value,currentCity(),1);
    if(results.matches.length) locateStationFromSearch(results.matches[0]);
  }
});
function chooseCity(city) {
  hideDetail();
  if (city === 'ALL') {
    const bounds = [];
    Object.values(CENTERS).forEach(p => bounds.push(p));
    map.fitBounds(bounds, {padding:[30,30],maxZoom:11});
  } else map.setView(CENTERS[city] || CENTERS['SAO JOSE DOS CAMPOS'],12);
  render();
  if (!els['station-search-panel'].hidden) updateSearchResults();
  if (!els['nearby-panel'].hidden) updateNearbyResults();
}
function render() {
  overlay.clearLayers();
  const city = currentCity(), fuel = currentFuel();
  const inCity = all.filter(p => p.mapEligible === true && safeCoordinate(p) &&
       (city === 'ALL' || p.city === city));
  const filtered = mode === 'price' ? inCity.filter(p => observed(p,fuel)) : inCity;
  let priced = 0;
  for (const post of filtered) {
    const price = observed(post, fuel);
    if (price) {
      priced += 1;
      const html = '<span class="fuel-pin" title="Preço coletado, não ao vivo">' +
          formatMoney(price.value) + '</span>';
      const icon = L.divIcon({
        className:'fuel-marker', html, iconSize:[91,35], iconAnchor:[45,17]
      });
      L.marker([post.lat, post.lng], {icon, keyboard:true,bubblingMouseEvents:false})
        .on('click', () => showDetail(post)).addTo(overlay);
    } else {
      L.circleMarker([post.lat,post.lng], {
        radius:6,weight:1,color:'#164a41',fillColor:'#376c62',fillOpacity:0.7,bubblingMouseEvents:false
      }).on('click',()=>showDetail(post)).addTo(overlay);
    }
  }
  const missingGeo = all.filter(p =>
    (city === 'ALL' || p.city === city) && !p.mapEligible).length;
  const generated = status && status.generatedAt && status.generatedAt.slice(0,10);
  const snapshotAge = priceAge(generated);
  const snapshotLabel = generated ?
    ' · base ' + friendlyDay(generated) : '';
  const oldSnapshot = snapshotAge === null || snapshotAge > 14;
  els.summary.textContent =
    filtered.length + ' postos · ' + priced + ' com preço ANP de ' +
    FUELS[fuel].toLowerCase() +
    (missingGeo ? ' · ' + missingGeo + ' sem GPS cadastral' : '') + snapshotLabel +
    (oldSnapshot ? ' · base antiga' : '');
}
function friendlyDay(iso) {
  const ts = readDate(iso);
  return ts === null ? 'não informada' : new Date(ts).toLocaleDateString('pt-BR',{timeZone:'UTC'});
}
function showDetail(p) {
  // GPS refresh and saving a report must not unexpectedly collapse this sheet.
  // Selecting a different post always starts with the short view.
  if (!selected || selected.cnpj !== p.cnpj) {
    setDetailExpanded(false);
    els['community-disclosure'].open = false;
    els['technical-details'].open = false;
  }
  selected = p;
  const fuel = currentFuel(), price = observed(p,fuel);
  els['detail-name'].textContent = p.name || 'Posto cadastrado na ANP';
  els['detail-address'].textContent =
    [effectiveAddress(p),effectiveDistrict(p), p.city === 'ARARAQUARA'?'Araraquara · SP':'São José dos Campos · SP']
      .filter(Boolean).join(' · ');
  els['detail-cnpj'].textContent = 'CNPJ: ' + p.cnpj + ' · cadastro consultado na ANP';
  els['detail-fuel'].textContent = FUELS[fuel];
  els['detail-value'].textContent = price ? formatMoney(price.value) : 'Preço não disponível';
  els['detail-value'].classList.toggle('missing',!price);
  els['mini-name'].textContent = p.name || 'Posto cadastrado na ANP';
  els['mini-price'].textContent = price ? formatMoney(price.value) : 'Sem preço';
  els['detail-date'].textContent = price ?
    ('Pesquisa ANP: ' + friendlyDay(price.iso) + ' (' + price.age +
      (price.age === 1 ? ' dia' : ' dias') + ' atrás). Valor não é em tempo real.') :
    'Sem coleta recente deste combustível para este CNPJ.';
  const audit = p.geoAudit || {};
  const flags = Array.isArray(audit.reasons) ? audit.reasons : [];
  const warnings = [];
  if (flags.includes('near_another_cnpj')) warnings.push('Outro CNPJ aparece muito próximo nesta base.');
  if (flags.includes('geo_observation_old')) warnings.push('Coordenada cadastrada há mais de 2 anos.');
  if (flags.includes('geo_date_unknown')) warnings.push('Data de obtenção da coordenada desconhecida.');
  const recorded = typeof p.geoRecordedAt === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(p.geoRecordedAt)
    ? ' Registro de posição ANP em ' + p.geoRecordedAt + '.' : '';
  const hasPoint = p.mapEligible === true && safeCoordinate(p);
  const cross = audit.pmqcCrosscheck;
  if (cross && cross.status === 'anp_sources_diverge') {
    warnings.push('A coordenada registrada na amostra PMQC difere ' +
      Number(cross.distanceMeters).toFixed(0) +
      ' m da posição cadastral ANP. Conferência pendente.');
  } else if (cross && cross.status === 'anp_sources_nearby_unverified') {
    warnings.push('O PMQC e o cadastro ANP indicam posições próximas. Isso não é validação independente.');
  } else if (cross && cross.status === 'pmqc_without_coordinates') {
    warnings.push('A amostra PMQC não contém uma coordenada utilizável para comparação.');
  } else if (cross && cross.status === 'registry_without_coordinates') {
    warnings.push('O cadastro de revendas não fornece coordenadas utilizáveis para comparar ao PMQC.');
  }
  els['detail-geo'].textContent = hasPoint ?
    '📍 Posição cadastral provisória, não validada em campo. A rota por endereço requer conferir o destino.' +
    recorded + (warnings.length ? ' ' + warnings.join(' ') : '') :
    '📍 Sem coordenadas utilizáveis para este posto. A ficha existe no cadastro ANP, mas não há pin; a rota só pode ser aberta pelo endereço escrito.' +
    (warnings.length ? ' ' + warnings.join(' ') : '');
  const pmqc = p.pmqc;
  if (pmqc && pmqc.sampleCount > 0) {
    const affected = Number(pmqc.samplesWithNonconformity) || 0;
    els['detail-lab'].textContent =
      '🧪 PMQC ANP: ' + pmqc.sampleCount +
      (pmqc.sampleCount === 1 ? ' amostra' : ' amostras') +
      ' em ' + friendlyDay(pmqc.latestSampleAt) +
      '. ' + (affected > 0
        ? affected + ' amostra(s) com ao menos um ensaio marcado não conforme na data da coleta.'
        : 'Nos ensaios informados dessas amostras, não consta não conformidade.') +
      ' Isso não certifica a qualidade atual.';
  } else {
    els['detail-lab'].textContent = '🧪 Sem amostra PMQC associada a este CNPJ no arquivo mensal importado. Isso não indica aprovação nem reprovação.';
  }
  els['detail-brand'].textContent = '🏷️ ' + (p.brand || 'Bandeira não informada');
  const km = userPosition && hasPoint ? FuelProNearby.distanceKm(userPosition,p) : null;
  els['detail-distance'].hidden = km === null;
  els['detail-distance'].textContent = km === null ? '' :
    '📏 ' + FuelProNearby.formatDistance(km) + ' em linha reta';
  updateCommunityState(p);
  els['detail-mini'].hidden = true;
  els.detail.hidden = false;
  void updatePublishedStatus(p);
}
els.close.addEventListener('click',hideDetail);
els['city-filter'].addEventListener('change', e => chooseCity(e.target.value));
els['fuel-filter'].addEventListener('change', () => {
  hideDetail();render();
  if(!els['station-search-panel'].hidden)updateSearchResults();
  if(!els['nearby-panel'].hidden)updateNearbyResults();
});
els['mode-all'].addEventListener('click', () => setMode('all'));
els['mode-price'].addEventListener('click', () => setMode('price'));
function setMode(next) {
  mode = next; hideDetail();
  els['mode-all'].classList.toggle('selected', next==='all');
  els['mode-price'].classList.toggle('selected', next==='price');
  render();
}

/* Confirmações ficam no dispositivo; um relato só chega ao projeto
 * quando a pessoa finaliza o envio externo, sem token privado no PWA. */
let publicStatusSerial=0;
async function updatePublishedStatus(post){
  const serial=++publicStatusSerial;
  const label=els['public-community-status'];
  label.hidden=true;
  if(!window.FuelProPublic.settingsReady(window.FuelProFirebaseSettings))return;
  try{
    const result=await window.FuelProPublic.fetchPublicConfirmation(
      post.cnpj,window.FuelProFirebaseSettings);
    if(serial!==publicStatusSerial||selected?.cnpj!==post.cnpj||!result)return;
    const date=result.publishedAt ?
      new Date(result.publishedAt).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'}):'';
    label.textContent='✓ Endereço confirmado por motorista e publicado após revisão administrativa'+
      (date?' em '+date:'')+
      '. Não é validação oficial da ANP nem verificação do GPS.';
    label.hidden=false;
  }catch(error){
    console.warn('Consulta de publicação comunitária indisponível:',error);
  }
}
function communityRecord(p) {
  try {return FuelProCommunity.get(window.localStorage,p.cnpj);}
  catch(error){return null;}
}
function effectiveAddress(p) {
  try {return FuelProCommunity.displayAddress(p,window.localStorage);}
  catch(error){return p.address;}
}
function effectiveDistrict(p) {
  const record=communityRecord(p);
  return record&&record.kind==='correction'?null:p.district;
}
function routeForStation(p) {
  return FuelProCommunity.mapsUrl(p,window.localStorage);
}
const RECEIPTS_KEY='fuelpro.firebase.confirmations.v1';
function firebaseActive(){
  return FuelProFirebase.isConfigured(window.FuelProFirebaseSettings);
}
function receiptFor(record){
  if(!record)return null;
  try{
    const receipts=JSON.parse(window.localStorage.getItem(RECEIPTS_KEY)||'{}');
    const entry=receipts[record.cnpj];
    return entry && entry.localCreatedAt===record.createdAt ? entry : null;
  }catch(error){return null;}
}
function saveReceipt(record,result){
  try{
    const receipts=JSON.parse(window.localStorage.getItem(RECEIPTS_KEY)||'{}');
    receipts[record.cnpj]={
      localCreatedAt:record.createdAt,reportId:result.reportId,
      receivedAt:new Date().toISOString(),reviewStatus:'pending'
    };
    window.localStorage.setItem(RECEIPTS_KEY,JSON.stringify(receipts));
    return true;
  }catch(error){return false;}
}
function updateCommunityState(post){
  const feedback=communityRecord(post);
  const receipt=receiptFor(feedback);
  els['community-form'].hidden=true;
  els['feedback-share-actions'].hidden=!feedback;
  const delivered=Boolean(receipt);
  els['send-feedback'].textContent=delivered ? '✓ Recebido pelo Fuel Pro'
    : firebaseActive() ? 'Enviar pelo Fuel Pro' : 'Envio online em preparação';
  els['send-feedback'].disabled=delivered || !firebaseActive();
  els['confirm-address'].disabled=delivered && feedback.kind==='confirmed';
  els['confirm-address'].textContent=(delivered && feedback.kind==='confirmed')
    ? '✓ Endereço confirmado' : '✓ Confirmar endereço';
  els['community-status'].textContent=!feedback
    ? 'Endereço cadastrado na ANP. Você ainda não fez confirmação neste navegador.'
    : receipt
      ? '✓ Recebido pelo Firebase. Aguardando revisão; o endereço oficial não foi alterado.'
      : firebaseActive()
        ? 'Relato salvo neste aparelho, ainda não enviado. Toque em Enviar pelo Fuel Pro.'
        : 'Relato salvo somente neste aparelho. O recebimento Firebase ainda não foi ativado.';
}
async function submitSavedFeedback(){
  if(!selected)return;
  const station=selected;
  const feedback=communityRecord(station);
  if(!feedback){notify('Confirme ou corrija o endereço antes de enviar.');return;}
  if(receiptFor(feedback)){notify('Este relato já foi recebido e está aguardando revisão.');return;}
  if(!firebaseActive()){notify('O servidor Firebase ainda está em configuração. Seu registro permanece salvo no aparelho.');return;}
  const button=els['send-feedback'];
  let acknowledgedByServer=false;
  button.disabled=true;
  button.textContent='Enviando…';
  els['community-status'].textContent='Enviando relato com identificação anônima…';
  try{
    const receipt=await FuelProFirebase.submit(feedback);
    if(receipt && receipt.accepted===true){
      acknowledgedByServer=true;
      const locallySaved=saveReceipt(feedback,receipt);
      if(selected && selected.cnpj===station.cnpj){
        updateCommunityState(station);
        button.disabled=true;
        button.textContent='✓ Recebido pelo Fuel Pro';
        if(!locallySaved)els['community-status'].textContent=
          '✓ Recebido pelo Firebase. Não foi possível guardar o comprovante neste navegador.';
      }
      notify('✓ Relato recebido pelo Fuel Pro. Aguardando revisão.');
    }else{
      throw new Error('O servidor não confirmou o recebimento.');
    }
  }catch(error){
    if(selected && selected.cnpj===station.cnpj){
      els['community-status'].textContent='Ainda não enviado. Relato preservado neste aparelho. Tente novamente quando houver conexão.';
    }
    notify('Não foi possível confirmar o envio: '+(error&&error.message?error.message:'tente novamente.'));
  }finally{
    if(selected && selected.cnpj===station.cnpj){
      // A server-acknowledged operation cannot become "Retry" merely
      // because of a stale local receipt or delayed UI refresh.
      if(acknowledgedByServer || receiptFor(communityRecord(station))){
        updateCommunityState(station);
        button.disabled=true;
        button.textContent='✓ Recebido pelo Fuel Pro';
      } else {
        button.disabled=!firebaseActive();
        button.textContent=firebaseActive()
          ? 'Tentar envio pelo Fuel Pro' : 'Envio online em preparação';
      }
    }
  }
}
function saveCommunityRecord(record){
  try{
    FuelProCommunity.save(window.localStorage,record);
    showDetail(selected);
    if(!els['station-search-panel'].hidden)updateSearchResults();
    if(firebaseActive()){
      void submitSavedFeedback();
    }else{
      notify('Relato salvo neste aparelho. O envio pelo Firebase será ativado após configurar a base.');
    }
  }catch(error){notify(error.message||'Não foi possível guardar o relato.');}
}
els['confirm-address'].addEventListener('click',()=>{
  if(!selected)return;
  const previous=communityRecord(selected);
  if(previous && previous.kind==='confirmed' && receiptFor(previous)){
    notify('Sua confirmação já está no Firebase, aguardando revisão.');
    return;
  }
  try {
    const feedback=FuelProCommunity.makeRecord(selected,'confirmed',selected.address,'');
    saveCommunityRecord(feedback);
  } catch(error){notify(error.message||'Confirmação inválida.');}
});
els['suggest-address'].addEventListener('click',()=>{
  if(!selected)return;
  const old=communityRecord(selected);
  els['new-address'].value=old&&old.kind==='correction'?old.proposedAddress:selected.address;
  els['address-notes'].value=old?old.notes:'';
  els['community-form'].hidden=false;
  els['new-address'].focus();
});
els['cancel-suggestion'].addEventListener('click',()=>els['community-form'].hidden=true);
els['community-form'].addEventListener('submit',event=>{
  event.preventDefault();
  if(!selected)return;
  try {
    const record=FuelProCommunity.makeRecord(
      selected,'correction',els['new-address'].value,els['address-notes'].value);
    saveCommunityRecord(record);
  } catch(error){notify(error.message||'Verifique o endereço informado.');}
});
els['undo-feedback'].addEventListener('click',()=>{
  if(!selected)return;
  const wasSent=Boolean(receiptFor(communityRecord(selected)));
  try{
    if(FuelProCommunity.remove(window.localStorage,selected.cnpj)){
      try {
        const receipts=JSON.parse(window.localStorage.getItem(RECEIPTS_KEY)||'{}');
        delete receipts[selected.cnpj];
        window.localStorage.setItem(RECEIPTS_KEY,JSON.stringify(receipts));
      }catch(error){}
      showDetail(selected);
      notify(wasSent
        ? 'Registro apagado deste aparelho. O relato já enviado permanece no Firebase, aguardando revisão.'
        : 'Registro local apagado. O endereço da ANP voltou a ser exibido.');
    }else notify('Não foi possível apagar o registro deste dispositivo.');
  }catch(error){notify('Não foi possível acessar os registros deste navegador.');}
});
els['send-feedback'].addEventListener('click',()=>{void submitSavedFeedback();});
els['share-feedback'].addEventListener('click',async()=>{
  if(!selected)return;
  const record=communityRecord(selected);
  if(!record)return notify('Nenhum relato guardado neste aparelho.');
  const text=FuelProCommunity.reportText(selected,record);
  try {
    if(navigator.share){
      await navigator.share({title:'Fuel Pro: endereço de posto',text});
      notify('Compartilhamento aberto. O destinatário precisará receber seu relato.');
    }else{
      await navigator.clipboard.writeText(text);
      notify('Relato copiado. Envie para quem fará a revisão.');
    }
  }catch(error){
    if(error&&error.name==='AbortError')return;
    try{await navigator.clipboard.writeText(text);notify('Relato copiado. Envie para quem fará a revisão.');}
    catch(e){window.prompt('Copie o relato e compartilhe:',text);}
  }
});
els.directions.addEventListener('click',()=>{
  if(!selected)return;
  try {
    const url=routeForStation(selected);
    const link=document.createElement('a');
    link.href=url;
    link.target='_blank';
    link.rel='noopener noreferrer';
    link.click();
    notify('Rota aberta pelo endereço escrito. Confira o destino no Google Maps.');
  }catch(error){notify(error.message||'Endereço indisponível para rota.');}
});
els['copy-address'].addEventListener('click',async()=>{
  if(!selected)return;
  try {
    const address=FuelProCommunity.fullAddress(selected,window.localStorage);
    await navigator.clipboard.writeText(address);
    notify('Endereço copiado. Confirme o destino antes de sair.');
  } catch(error) {
    notify('Não foi possível copiar automaticamente. Consulte o endereço exibido na ficha.');
  }
});
els['source-info'].addEventListener('click', () => {
  // Show complete evidence rather than a short-lived notification.
  els['technical-details'].open = true;
  els['technical-details'].scrollIntoView({block:'nearest',behavior:'smooth'});
});
els.gps.addEventListener('click',()=>{void requestGps();});
map.on('click',hideDetail);
async function boot() {
  try {
    const res=await fetch('./dados.json',{cache:'no-store'});
    if (!res.ok) throw new Error('HTTP '+res.status);
    const data=await res.json();
    if (!data || !data.beta || !data.homologationOnly ||
        !Array.isArray(data.stations) || !data.generatedAt) throw new Error('Dados beta inválidos');
    all = data.stations.filter(p=>p && /^\d{14}$/.test(p.cnpj) &&
      typeof p.name === 'string' && p.city in CENTERS &&
      p.geoAudit && p.geoAudit.manualReviewApproved===false &&
      p.fuelScoreOverall === null);
    status = data;
    if (!all.length) throw new Error('Sem postos com proveniência válida');
    const ageDays = priceAge(data.generatedAt.slice(0,10));
    if (ageDays === null || ageDays > 14) {
      notify('Esta base de homologação está antiga. Preços de mais de 30 dias ficam ocultos.');
    }
    chooseCity(currentCity());
    if(!els['station-search-panel'].hidden) updateSearchResults();
  } catch(error) {
    console.error('Fuel Pro beta: dados inválidos',error);
    els.summary.textContent='Falha ao carregar dados. Reabra o aplicativo.';
    notify('Não foi possível validar a base ANP. Nenhum posto foi exibido.');
  }
}
window.addEventListener('fuelpro-firebase-ready', () => {
  if (selected) {
    updateCommunityState(selected);
    void updatePublishedStatus(selected);
  }
});
window.addEventListener('fuelpro-firebase-unavailable', () => {
  if (selected) updateCommunityState(selected);
});
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () =>
    navigator.serviceWorker.register('./sw.js').catch(error => console.warn(error))
  );
}
boot();
