let postos = [];
let currentFuel = 'gas';
let currentFuelName = 'Gasolina Comum';
let selectedStation = null;
let userLocation = null;
let locationCircle = null;
const map = L.map('map', { zoomControl: false }).setView([-23.2, -45.9], 13);
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; OpenStreetMap &copy; CARTO', maxZoom: 19 }).addTo(map);
const markersLayer = L.layerGroup().addTo(map);
const numberFormat = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
const $ = id => document.getElementById(id);
function validCoordinates(p) {
  const lat = Number(p.lat), lng = Number(p.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}
function fuelPrice(p) {
  const raw = p?.prices?.[currentFuel];
  if (raw == null || raw === '') return null;
  const parsed = Number(String(raw).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (Number(b.lat) - Number(a.lat)) * rad;
  const dLng = (Number(b.lng) - Number(a.lng)) * rad;
  const h = Math.sin(dLat/2)**2 + Math.cos(Number(a.lat)*rad)*Math.cos(Number(b.lat)*rad)*Math.sin(dLng/2)**2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
}
function setStatus(message) {
  const node = $('map-status');
  if (node) { node.textContent = message; node.hidden = !message; }
}
async function carregarDados() {
  try {
    const response = await fetch('dados.json?t=' + Date.now(), { cache: 'no-store' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error('Formato inválido de dados.json');
    postos = data.filter(validCoordinates);
    renderMarkers();
    setStatus(postos.length ? '' : 'Nenhum posto disponível na base de dados.');
  } catch (error) {
    console.error('Erro ao carregar postos:', error);
    setStatus('Não foi possível carregar os postos. Tente novamente mais tarde.');
  }
}
function renderMarkers() {
  markersLayer.clearLayers();
  const available = postos.filter(p => fuelPrice(p) !== null);
  const best = available.length ? Math.min(...available.map(fuelPrice)) : null;
  available.forEach(p => {
    const price = fuelPrice(p);
    const isBest = price === best;
    const color = isBest ? '#00a94b' : '#1a1a1a';
    const icon = L.divIcon({
      className: 'custom-pin',
      html: '<div class="price-pin" style="background:' + color + '">R$ ' + numberFormat.format(price) + '</div>',
      iconSize: [100, 38],
      iconAnchor: [50, 19]
    });
    L.marker([Number(p.lat), Number(p.lng)], { icon }).addTo(markersLayer)
      .on('click', () => showStation(p, isBest));
  });
  if (selectedStation) {
    const found = available.find(p => p === selectedStation);
    if (found) showStation(found, fuelPrice(found) === best);
    else closeStation();
  }
  updateNearbyCount();
}
function updateNearbyCount() {
  const node = $('nearby-count');
  if (!node) return;
  if (!userLocation) { node.textContent = 'Ative o GPS para ver os postos próximos'; return; }
  const nearby = postos.filter(p => fuelPrice(p) !== null && distanceKm(userLocation, p) <= 10);
  node.textContent = nearby.length + ' posto(s) com preço em até 10 km';
}
function showStation(p, isBest) {
  selectedStation = p;
  $('station-name').textContent = p.name || p.nome || 'Posto de combustível';
  $('station-price').textContent = 'R$ ' + numberFormat.format(fuelPrice(p));
  $('fuel-type-label').textContent = currentFuelName;
  $('price-badge').style.display = isBest ? 'block' : 'none';
  const address = p.address || p.endereco || [p.street, p.neighborhood, p.city].filter(Boolean).join(', ');
  const addressNode = $('station-address');
  if (addressNode) addressNode.textContent = address || 'Endereço não informado';
  const distanceNode = $('station-distance');
  if (distanceNode) distanceNode.textContent = userLocation
    ? distanceKm(userLocation, p).toFixed(1).replace('.', ',') + ' km em linha reta'
    : 'Selecione o GPS para calcular a distância';
  const updateNode = $('station-updated');
  if (updateNode) {
    const date = p.updated_at || p.updatedAt || p.data_coleta || p.date;
    updateNode.textContent = date ? 'Referência: ' + String(date).slice(0, 16) : 'Data de atualização não informada';
  }
  $('station-card').classList.add('active');
}
function closeStation() { selectedStation = null; $('station-card').classList.remove('active'); }
async function executeSearch() {
  const input = $('search-input');
  const query = input.value.trim();
  if (query.length < 3) { setStatus('Digite pelo menos 3 caracteres.'); return; }
  input.blur();
  try {
    const response = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=' + encodeURIComponent(query));
    if (!response.ok) throw new Error('Busca indisponível');
    const data = await response.json();
    if (!data.length) { setStatus('Local não encontrado.'); return; }
    map.setView([Number(data[0].lat), Number(data[0].lon)], 14);
    closeStation();
    setStatus('');
  } catch (error) { setStatus('Não foi possível realizar a busca agora.'); }
}
function setFuel(type, btnElement, fuelName) {
  currentFuel = type;
  currentFuelName = fuelName;
  document.querySelectorAll('.chip').forEach(chip => chip.classList.remove('active'));
  btnElement.classList.add('active');
  closeStation();
  renderMarkers();
}
function centerMap() {
  if (!navigator.geolocation) { setStatus('GPS indisponível neste dispositivo.'); return; }
  setStatus('Obtendo localização...');
  navigator.geolocation.getCurrentPosition(position => {
    userLocation = { lat: position.coords.latitude, lng: position.coords.longitude };
    if (locationCircle) map.removeLayer(locationCircle);
    locationCircle = L.circleMarker([userLocation.lat, userLocation.lng], {
      radius: 9, color: '#fff', weight: 3, fillColor: '#1976d2', fillOpacity: 1
    }).addTo(map);
    map.setView([userLocation.lat, userLocation.lng], 14);
    updateNearbyCount();
    if (selectedStation) showStation(selectedStation, fuelPrice(selectedStation) === Math.min(...postos.map(fuelPrice).filter(x => x !== null)));
    setStatus('');
  }, error => {
    setStatus(error.code === 1 ? 'Permita o acesso à localização no navegador.' : 'Não foi possível obter sua localização.');
  }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
}
function openRoute() {
  if (!selectedStation) return;
  const lat = Number(selectedStation.lat), lng = Number(selectedStation.lng);
  window.open('https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(lat + ',' + lng), '_blank', 'noopener,noreferrer');
}
$('search-input').addEventListener('keydown', event => { if (event.key === 'Enter') executeSearch(); });
map.on('click', closeStation);
carregarDados();
