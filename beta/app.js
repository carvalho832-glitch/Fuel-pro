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
  'source-info','notification','detail-cnpj',
  'search-toggle','station-search-panel','station-query','search-clear','search-count','search-results',
  'directions','confirm-address','suggest-address','community-form','community-status',
  'new-address','address-notes','cancel-suggestion','feedback-share-actions',
  'send-feedback','share-feedback','undo-feedback'
].map(id => [id, document.getElementById(id)]));

let all = [];
let selected = null;
let mode = 'all';
let status = {};
let locationMarker = null;
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
function hideDetail() { selected=null; els.detail.hidden = true; }
function stationCount(city) {
  return all.filter(p => p.city === city && safeCoordinate(p)).length;
}
function toggleSearchPanel(force) {
  const panel = els['station-search-panel'];
  const show = typeof force === 'boolean' ? force : panel.hidden;
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
      effectiveAddress(station), station.district, cityLabel
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
    ' · base consultada em ' + friendlyDay(generated) : '';
  const oldSnapshot = snapshotAge === null || snapshotAge > 14;
  els.summary.textContent =
    filtered.length + ' postos no mapa · ' + priced +
    ' com preço pesquisado de ' + FUELS[fuel].toLowerCase() +
    ' · ' + missingGeo + ' sem coordenadas' + snapshotLabel +
    (oldSnapshot ? ' · ATENÇÃO: base precisa ser atualizada' : '');
}
function friendlyDay(iso) {
  const ts = readDate(iso);
  return ts === null ? 'não informada' : new Date(ts).toLocaleDateString('pt-BR',{timeZone:'UTC'});
}
function showDetail(p) {
  selected = p;
  const fuel = currentFuel(), price = observed(p,fuel);
  els['detail-name'].textContent = p.name || 'Posto cadastrado na ANP';
  els['detail-address'].textContent =
    [effectiveAddress(p),p.district, p.city === 'ARARAQUARA'?'Araraquara · SP':'São José dos Campos · SP']
      .filter(Boolean).join(' · ');
  els['detail-cnpj'].textContent = 'CNPJ: ' + p.cnpj + ' · cadastro consultado na ANP';
  els['detail-fuel'].textContent = FUELS[fuel];
  els['detail-value'].textContent = price ? formatMoney(price.value) : 'Preço não disponível';
  els['detail-value'].classList.toggle('missing',!price);
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
    '📍 Posição cadastral provisória, não validada em campo. Rotas bloqueadas.' +
    recorded + (warnings.length ? ' ' + warnings.join(' ') : '') :
    '📍 Sem coordenadas utilizáveis para este posto. A ficha existe no cadastro ANP, mas não há pin confiável nem rota.' +
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
  els['detail-brand'].textContent = '🏷️ Bandeira cadastrada: ' + (p.brand || 'não informada');
  updateCommunityState(p);
  els.detail.hidden = false;
}
els.close.addEventListener('click',hideDetail);
els['city-filter'].addEventListener('change', e => chooseCity(e.target.value));
els['fuel-filter'].addEventListener('change', () => {hideDetail();render();});
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
function communityRecord(p) {
  try {return FuelProCommunity.get(window.localStorage,p.cnpj);}
  catch(error){return null;}
}
function effectiveAddress(p) {
  try {return FuelProCommunity.displayAddress(p,window.localStorage);}
  catch(error){return p.address;}
}
function routeForStation(p) {
  return FuelProCommunity.mapsUrl(p,window.localStorage);
}
function updateCommunityState(post) {
  const feedback=communityRecord(post);
  els['community-form'].hidden=true;
  els['feedback-share-actions'].hidden=!feedback;
  els['community-status'].textContent=feedback
    ? feedback.kind==='confirmed'
      ? '✓ Você confirmou este endereço neste navegador. Ainda não é validação oficial nem pública.'
      : '✏️ Sua correção está guardada neste navegador: '+feedback.proposedAddress+'. Ainda não foi aceita no cadastro público.'
    : 'Endereço exibido conforme a ANP. Ainda não há confirmação sua neste navegador.';
}
function saveCommunityRecord(record) {
  try {
    FuelProCommunity.save(window.localStorage,record);
    showDetail(selected);
    if(!els['station-search-panel'].hidden)updateSearchResults();
    notify('Relato salvo somente neste navegador. Compartilhe ou envie para revisão.');
  }catch(error){notify(error.message||'Não foi possível guardar o relato.');}
}
els['confirm-address'].addEventListener('click',()=>{
  if(!selected)return;
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
  try{
    if(FuelProCommunity.remove(window.localStorage,selected.cnpj)){
      showDetail(selected);
      notify('Registro local apagado. O endereço da ANP voltou a ser exibido.');
    }else notify('Não foi possível apagar o registro deste dispositivo.');
  }catch(error){notify('Não foi possível acessar os registros deste navegador.');}
});
els['send-feedback'].addEventListener('click',()=>{
  if(!selected)return;
  const item=communityRecord(selected);
  if(!item)return notify('Confirme ou corrija o endereço antes de enviar.');
  const url=FuelProCommunity.issueUrl(selected,item);
  const link=document.createElement('a');
  link.href=url;
  link.target='_blank';
  link.rel='noopener noreferrer';
  link.click();
  notify('Página do GitHub aberta. O relato só é enviado quando você finalizar a publicação lá.');
});
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
els['source-info'].addEventListener('click', () =>
  notify('Preços: pesquisa semanal ANP. Posição: cadastro ANP não validado. PMQC: ensaios amostrais de setembro/2026. Nenhuma nota de qualidade foi calculada.'));
els.gps.addEventListener('click',() => map.locate({setView:true,maxZoom:14,enableHighAccuracy:true}));
map.on('locationfound', e => {
  if (locationMarker) map.removeLayer(locationMarker);
  locationMarker = L.circleMarker(e.latlng,{radius:8,color:'#2563eb',fillColor:'#3b82f6',fillOpacity:.45})
    .addTo(map);
});
map.on('locationerror',()=>notify('Não foi possível determinar sua localização.'));
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
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () =>
    navigator.serviceWorker.register('./sw.js').catch(error => console.warn(error))
  );
}
boot();
