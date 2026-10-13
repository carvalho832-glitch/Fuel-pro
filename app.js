/* Fuel Pro | camada de confiança de dados (fase 1) */
let postos = [];
let currentFuel = 'gas';
let selectedStation = null;
const FUEL_NAMES = { gas:'Gasolina comum', gas_ad:'Gasolina aditivada', eta:'Etanol', eta_ad:'Etanol aditivado', die:'Diesel', gnv:'GNV' };
const map = L.map('map', { zoomControl: false }).setView([-23.200, -45.900], 13);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
  maxZoom: 19
}).addTo(map);
const markersLayer = L.layerGroup().addTo(map);
const money = value => 'R$ ' + Number(value).toFixed(2).replace('.', ',');
const validPrice = value => {
  if (value === null || value === undefined || String(value).trim() === '') return false;
  const n = Number(value);
  return Number.isFinite(n) && n > 0.5 && n < 30;
};
const safeCoords = p => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng))
  && Number(p.lat) < -1 && Number(p.lat) > -35
  && Number(p.lng) < -30 && Number(p.lng) > -75;
function observedDate(p, fuel) {
  return (p.collectedAtByFuel && p.collectedAtByFuel[fuel]) || p.collectedAt || null;
}
function validObservation(p, fuel) {
  const iso = observedDate(p, fuel);
  if (!validPrice(p.prices && p.prices[fuel]) || typeof iso !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const stamp = Date.parse(iso + 'T12:00:00Z');
  if (!Number.isFinite(stamp)) return false;
  const ageMs = Date.now() - stamp;
  return ageMs >= -86400000 && ageMs <= 30 * 86400000;
}
function dateInfo(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return { label:'Data da coleta não informada', old:true };
  const date = new Date(iso + 'T12:00:00Z');
  if (Number.isNaN(date.valueOf())) return { label:'Data da coleta inválida', old:true };
  const days = Math.floor((Date.now() - date.valueOf()) / 86400000);
  const label = 'Coletado em ' + date.toLocaleDateString('pt-BR', {timeZone:'UTC'});
  return {label, old:days > 7 || days < -1, days};
}
function showStatus(message) {
  const el = document.getElementById('data-status');
  if (el) el.textContent = message;
}
function showEmpty(message) {
  const el = document.getElementById('map-empty');
  if (el) { el.hidden = !message; el.textContent = message || ''; }
}
function renderMarkers() {
  markersLayer.clearLayers();
  const visible = postos.filter(p => validObservation(p, currentFuel) && safeCoords(p));
  if (!visible.length) {
    showEmpty('Nenhum preço pesquisado e localizado para este combustível. Não mostramos estimativas como preços reais.');
    return;
  }
  showEmpty('');
  const least = Math.min(...visible.map(p => Number(p.prices[currentFuel])));
  visible.forEach(p => {
    const price = Number(p.prices[currentFuel]);
    const lowest = price === least;
    const old = dateInfo(observedDate(p, currentFuel)).old;
    const color = old ? '#6b7280' : lowest ? '#15803d' : '#1f2937';
    const priceText = money(price);
    const icon = L.divIcon({
      className:'custom-pin',
      html:'<div class="fuel-pin" style="background:' + color + '">' + priceText + '</div>',
      iconSize:[94,38], iconAnchor:[47,19]
    });
    L.marker([Number(p.lat), Number(p.lng)], {icon}).addTo(markersLayer)
      .on('click', () => openStation(p, lowest));
  });
}
function openStation(p, lowest) {
  selectedStation = p;
  const fuel = currentFuel;
  const info = dateInfo(observedDate(p, fuel));
  document.getElementById('station-name').textContent = p.name;
  document.getElementById('station-address').textContent = p.address || 'Endereço não informado';
  document.getElementById('station-price').textContent = money(p.prices[fuel]);
  document.getElementById('fuel-type-label').textContent = FUEL_NAMES[fuel] || fuel;
  const badge = document.getElementById('price-badge');
  badge.style.display = lowest ? 'block' : 'none';
  badge.textContent = 'Menor valor entre os postos exibidos';
  document.getElementById('station-date').textContent = info.label + (info.old ? ' · preço pode estar desatualizado' : '');
  document.getElementById('station-source').textContent = 'Fonte: ' + (p.source || 'não identificada') +
    (p.locationPrecision === 'approximate' ? ' · Localização aproximada' : '');
  document.getElementById('station-card').classList.add('active');
}
async function carregarDados() {
  showStatus('Carregando pesquisas de preços...');
  try {
    const response = await fetch('dados.json?t=' + Date.now(), {cache:'no-store'});
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const raw = await response.json();
    if (!Array.isArray(raw)) throw new Error('Formato de dados inválido');
    // Nunca atribuir um preço estimado, deduzido ou sem fonte ao mapa.
    postos = raw.filter(p => p && typeof p.name === 'string'
      && p.name.length > 3 && p.name.length < 160 && p.name !== 'FILTROS'
      && p.prices && typeof p.prices === 'object'
      && p.source === 'ANP - levantamento semanal'
      && Object.keys(p.prices).some(k => validObservation(p, k))
      && safeCoords(p));
    renderMarkers();
    showStatus(postos.length ? postos.length + ' postos com localização e preços rastreáveis' :
      'Sem preços confiáveis disponíveis nesta região');
  } catch (error) {
    console.error('Fuel Pro: falha ao carregar dados', error);
    postos = [];
    renderMarkers();
    showStatus('Dados indisponíveis. Tente novamente mais tarde.');
  }
}
async function executeSearch() {
  const input = document.getElementById('search-input');
  const query = input.value.trim();
  if (query.length < 3) return;
  input.blur();
  try {
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=' + encodeURIComponent(query));
    if (!r.ok) throw new Error('Busca indisponível');
    const data = await r.json();
    if (!data.length) return showStatus('Localidade não encontrada');
    map.setView([Number(data[0].lat), Number(data[0].lon)], 14);
    document.getElementById('station-card').classList.remove('active');
  } catch(e) { showStatus('Não foi possível buscar a cidade agora.'); }
}
function setFuel(type, btnElement, fuelName) {
  currentFuel = type;
  document.querySelectorAll('.chip').forEach(chip => chip.classList.remove('active'));
  btnElement.classList.add('active');
  document.getElementById('fuel-type-label').textContent = fuelName;
  document.getElementById('station-card').classList.remove('active');
  selectedStation = null;
  renderMarkers();
}
function centerMap() { map.locate({setView:true, maxZoom:15}); }
map.on('locationfound', e => L.circleMarker(e.latlng, {radius:8,color:'#2563eb',fillOpacity:0.4}).addTo(map));
map.on('locationerror', () => showStatus('Não foi possível acessar sua localização.'));
function openRoute() {
  if (!selectedStation || !safeCoords(selectedStation)) return;
  const destination = selectedStation.locationPrecision === 'approximate'
    ? selectedStation.name + ', ' + selectedStation.address
    : selectedStation.lat + ',' + selectedStation.lng;
  const dst = encodeURIComponent(destination);
  window.open('https://www.google.com/maps/dir/?api=1&destination=' + dst, '_blank', 'noopener,noreferrer');
}
function showSourceInfo() {
  alert('Os preços são registros de coletas, não garantias do preço no caixa. Consulte a origem e a data exibidas e confirme o valor ao abastecer. A edição colaborativa será lançada após a validação por GPS.');
}
document.getElementById('search-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') executeSearch();
});
map.on('click', () => document.getElementById('station-card').classList.remove('active'));
carregarDados();
