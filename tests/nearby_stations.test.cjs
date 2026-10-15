const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {validPoint,distanceKm,nearest,nearestCity,formatDistance}=
  require('../beta/nearby_stations.js');
const positions=[
  {cnpj:'12345678000190',name:'POSTO PERTO',city:'SAO JOSE DOS CAMPOS',
    lat:-23.201,lng:-45.883,mapEligible:true},
  {cnpj:'12345678000191',name:'POSTO MAIS LONGE',city:'SAO JOSE DOS CAMPOS',
    lat:-23.250,lng:-45.910,mapEligible:true},
  {cnpj:'12345678000192',name:'POSTO OUTRA CIDADE',city:'ARARAQUARA',
    lat:-21.7927,lng:-48.1754,mapEligible:true},
  {cnpj:'12345678000193',name:'SEM COORDENADAS',city:'SAO JOSE DOS CAMPOS',
    lat:null,lng:null,mapEligible:false},
  {cnpj:'12345678000194',name:'PIN PROVISORIO REPROVADO',city:'SAO JOSE DOS CAMPOS',
    lat:-23.1996,lng:-45.8841,mapEligible:false}
];
const point={lat:-23.1996,lng:-45.8841};
test('distância haversine expressa quilômetros em linha reta, não trânsito',()=>{
  assert.equal(distanceKm(point,point),0);
  const d=distanceKm(point,positions[0]);
  assert.ok(d>0.15 && d<0.3);
  assert.ok(Math.abs(distanceKm(point,positions[1])-distanceKm(positions[1],point))<1e-8);
  assert.equal(distanceKm(point,{lat:null,lng:1}),null);
  assert.equal(formatDistance(.2),'200 m');
  assert.match(formatDistance(1.42),/1,4 km/);
});
test('GPS não precisa ser do Brasil, mas coordenadas inválidas são rejeitadas',()=>{
  assert.ok(validPoint({lat:40.7,lng:-74}));
  assert.equal(validPoint({lat:91,lng:-75}),false);
  assert.equal(validPoint({lat:NaN,lng:0}),false);
  assert.equal(validPoint({lat:'-23',lng:-45}),false);
});
test('ordena por distância real e aplica raio e cidade',()=>{
  const near=nearest(positions,point,{radiusKm:2,city:'SAO JOSE DOS CAMPOS'});
  assert.equal(near.total,1);
  assert.deepEqual(near.matches.map(x=>x.station.cnpj),['12345678000190']);
  assert.equal(near.withoutCoords,2);
  const wide=nearest(positions,point,{radiusKm:20,city:'ALL'});
  assert.equal(wide.total,2);
  assert.equal(wide.matches[0].station.cnpj,'12345678000190');
  assert.equal(wide.matches[1].station.cnpj,'12345678000191');
});
test('cidades desconhecidas e postos sem coordenadas não são inventados',()=>{
  assert.equal(nearestCity(positions,point,20),'SAO JOSE DOS CAMPOS');
  assert.equal(nearestCity(positions,{lat:-22.7,lng:-46.7},10),null);
  assert.equal(nearest(positions,{lat:0,lng:0},{radiusKm:10}).total,0);
  assert.equal(nearest(positions,point,{radiusKm:Infinity}).total,0);
  assert.equal(nearest(null,point,{}).matches.length,0);
});
test('empate usa CNPJ determinístico e consulta permanece local',()=>{
  const tie=[{...positions[0],cnpj:'99999999000199'},positions[0]];
  assert.deepEqual(nearest(tie,point,{radiusKm:5}).matches.map(x=>x.station.cnpj),
    ['12345678000190','99999999000199']);
  const source=fs.readFileSync(path.join(__dirname,'../beta/nearby_stations.js'),'utf8');
  assert.doesNotMatch(source,/fetch\s*\(|localStorage|firebase|googleapis|overpass|nominatim/i);
});
test('aplicativo solicita GPS em interação, com falhas tratadas e sem rastreamento',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../beta/app.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'../beta/index.html'),'utf8');
  for(const id of ['nearby-toggle','nearby-panel','nearby-radius','nearby-results','nearby-status','detail-distance']){
    assert.match(html,new RegExp('id="'+id+'"'));
  }
  assert.match(source,/navigator\.geolocation\.getCurrentPosition/);
  assert.match(source,/enableHighAccuracy:false,timeout:15000,maximumAge:120000/);
  assert.match(source,/location\.coords\.latitude|position\.coords\.latitude/);
  assert.match(source,/map\.setView\(\[coord\.lat,coord\.lng\],14\)/);
  assert.match(source,/userPosition=coord/);
  assert.match(source,/if\(error\?\.code===1\)/);
  assert.match(source,/FuelProNearby\.nearest\(all,userPosition/);
  assert.doesNotMatch(source,/watchPosition|geolocation\.getCurrentPosition\(\s*\)\s*;/);
});
test('dados da ANP e painel admin permanecem intactos',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../beta/index.html'),'utf8');
  assert.match(html,/Preço não disponível|id="detail-value"/);
  assert.match(html,/id="detail-lab"/);
  assert.match(html,/id="public-community-status"/);
  assert.match(html,/id="community-form"/);
  assert.match(html,/Fontes ANP, posição e análises/);
  assert.match(html,/Distâncias em linha reta/);
  assert.match(html,/id="directions"/);
});
