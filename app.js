const postos = [
  { name: "Posto Shell Aquarius", lat: -23.219, lng: -45.908, prices: { gas: "5.45", eta: "3.59", gnv: "4.20", die: "5.89", gas_ad: "5.65", eta_ad: "3.79" } },
  { name: "Ipiranga Vila Adyana", lat: -23.199, lng: -45.895, prices: { gas: "5.59", eta: "3.49", gnv: "4.15", die: "5.95", gas_ad: "5.79", eta_ad: "3.69" } },
  { name: "Petrobras - Centro", lat: -23.185, lng: -45.890, prices: { gas: "5.37", eta: "3.65", gnv: "4.10", die: "5.75", gas_ad: "5.55", eta_ad: "3.85" } }
];

let currentFuel = 'gas'; 
let markersLayer; 

const map = L.map('map', { zoomControl: false }).setView([-23.200, -45.900], 13);
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(map);

markersLayer = L.layerGroup().addTo(map);

function renderMarkers() {
  markersLayer.clearLayers(); 
  const precos = postos.map(p => parseFloat(p.prices[currentFuel]));
  const menorPreco = Math.min(...precos);

  postos.forEach(p => {
    const preco = p.prices[currentFuel];
    const isBest = parseFloat(preco) === menorPreco;
    const cor = isBest ? '#00c853' : '#1a1a1a'; 
    
    const icon = L.divIcon({
      className: 'custom-pin',
      html: `<div style="background:${cor}; color:white; padding:6px 14px; border-radius:20px; font-weight:900; font-size:14px; box-shadow:0 4px 15px rgba(0,0,0,0.25); border:2px solid white;">R$ ${preco.replace('.',',')}</div>`,
      iconSize: [85, 35]
    });

    L.marker([p.lat, p.lng], { icon }).addTo(markersLayer).on('click', () => {
      document.getElementById('station-name').innerText = p.name;
      document.getElementById('station-price').innerText = `R$ ${preco.replace('.',',')}`;
      document.getElementById('price-badge').style.display = isBest ? 'block' : 'none';
      document.getElementById('station-card').classList.add('active');
    });
  });
}

function setFuel(type, btnElement, fuelName) {
  currentFuel = type;
  document.querySelectorAll('.chip').forEach(chip => chip.classList.remove('active'));
  btnElement.classList.add('active');
  document.getElementById('fuel-type-label').innerText = fuelName;
  document.getElementById('station-card').classList.remove('active');
  renderMarkers();
}

async function executeSearch() {
    const query = document.getElementById('search-input').value;
    if (query.length < 3) return;
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}`);
        const data = await response.json();
        if (data && data.length > 0) {
            const { lat, lon } = data[0];
            map.setView([lat, lon], 15);
            document.getElementById('station-card').classList.remove('active');
        }
    } catch (e) { console.error(e); }
}

document.getElementById('search-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') executeSearch();
});

map.on('click', () => document.getElementById('station-card').classList.remove('active'));
function centerMap() { map.locate({setView: true, maxZoom: 15}); }
map.on('locationfound', (e) => { L.circle(e.latlng, {radius: 20, color: '#2196F3', fillOpacity: 0.3}).addTo(map); });
function openRoute() { alert("Integrando com Waze/Maps..."); }

renderMarkers();
