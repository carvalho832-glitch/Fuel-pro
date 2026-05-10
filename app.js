let postos = []; 
let currentFuel = 'gas'; 
let markersLayer; 

const map = L.map('map', { zoomControl: false }).setView([-23.200, -45.900], 13);
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(map);

markersLayer = L.layerGroup().addTo(map);

// Função com "Anti-Cache" para garantir dados novos
async function carregarDados() {
  try {
    // O final '?t=' + new Date().getTime() força o navegador a baixar a versão mais nova do GitHub
    const resposta = await fetch('dados.json?t=' + new Date().getTime());
    postos = await resposta.json();
    console.log("Dados carregados do robô:", postos);
    renderMarkers();
  } catch (erro) {
    console.error("Erro ao carregar preços:", erro);
  }
}

function renderMarkers() {
  markersLayer.clearLayers(); 
  if (postos.length === 0) return;

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

async function executeSearch() {
    const input = document.getElementById('search-input');
    const query = input.value;
    if (query.length < 3) return;
    input.blur();
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}`);
        const data = await response.json();
        if (data && data.length > 0) {
            const { lat, lon } = data[0];
            map.setView([lat, lon], 15);
            document.getElementById('station-card').classList.remove('active');
        }
    } catch (e) { alert("Erro na busca."); }
}

function setFuel(type, btnElement, fuelName) {
  currentFuel = type;
  document.querySelectorAll('.chip').forEach(chip => chip.classList.remove('active'));
  btnElement.classList.add('active');
  document.getElementById('fuel-type-label').innerText = fuelName;
  document.getElementById('station-card').classList.remove('active');
  renderMarkers();
}

document.getElementById('search-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') executeSearch();
});

map.on('click', () => document.getElementById('station-card').classList.remove('active'));
function centerMap() { map.locate({setView: true, maxZoom: 15}); }
map.on('locationfound', (e) => { L.circle(e.latlng, {radius: 20, color: '#2196F3', fillOpacity: 0.3}).addTo(map); });
function openRoute() { alert("Integrando com Waze/Maps..."); }

carregarDados();
