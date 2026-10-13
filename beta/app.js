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
  'source-info','notification'
].map(id => [id, document.getElementById(id)]));

let all = [];
let selected = null;
let mode = 'all';
let status = {};
let locationMarker = null;
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
function chooseCity(city) {
  hideDetail();
  if (city === 'ALL') {
    const bounds = [];
    Object.values(CENTERS).forEach(p => bounds.push(p));
    map.fitBounds(bounds, {padding:[30,30],maxZoom:11});
  } else map.setView(CENTERS[city] || CENTERS['SAO JOSE DOS CAMPOS'],12);
  render();
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
      L.marker([post.lat, post.lng], {icon, keyboard:true})
        .on('click', () => showDetail(post)).addTo(overlay);
    } else {
      L.circleMarker([post.lat,post.lng], {
        radius:6,weight:1,color:'#164a41',fillColor:'#376c62',fillOpacity:0.7,bubblingMouseEvents:false
      }).on('click',()=>showDetail(post)).addTo(overlay);
    }
  }
  const missingGeo = all.filter(p =>
    (city === 'ALL' || p.city === city) && !p.mapEligible).length;
  els.summary.textContent =
    filtered.length + ' postos no mapa · ' + priced +
    ' com preço pesquisado de ' + FUELS[fuel].toLowerCase() +
    ' · ' + missingGeo + ' sem coordenadas';
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
    [p.address,p.district, p.city === 'ARARAQUARA'?'Araraquara · SP':'São José dos Campos · SP']
      .filter(Boolean).join(' · ');
  els['detail-fuel'].textContent = FUELS[fuel];
  els['detail-value'].textContent = price ? formatMoney(price.value) : 'Preço não disponível';
  els['detail-value'].classList.toggle('missing',!price);
  els['detail-date'].textContent = price ?
    ('Pesquisa ANP: ' + friendlyDay(price.iso) + ' (' + price.age +
      (price.age === 1 ? ' dia' : ' dias') + ' atrás). Valor não é em tempo real.') :
    'Sem coleta recente deste combustível para este CNPJ.';
  const audit = p.geoAudit || {};
  const flags = Array.isArray(audit.reasons) ? audit.reasons : [];
  const geowarning = flags.includes('near_another_cnpj') ?
    ' Há outro CNPJ com coordenadas próximas.' : '';
  els['detail-geo'].textContent =
    '📍 Localização do cadastro ANP, não validada em campo. Rotas bloqueadas.' + geowarning;
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
els['copy-address'].addEventListener('click',async() => {
  if (!selected) return;
  const address = [selected.address,selected.district,
    selected.city==='ARARAQUARA'?'Araraquara':'São José dos Campos','SP','Brasil']
    .filter(Boolean).join(', ');
  try {
    await navigator.clipboard.writeText(address);
    notify('Endereço do cadastro copiado. Confirme antes de seguir viagem.');
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
    chooseCity(currentCity());
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
