const test = require('node:test');
const assert = require('node:assert/strict');
const { normalize,stationIndex,searchStations } = require('../beta/station_search.js');

const stations = [
  {cnpj:'12345678000190',name:'AUTO POSTO SÃO JOSÉ',address:'AVENIDA DOS AUTONOMISTAS, 1250',district:'JARDIM SATÉLITE',brand:'RAIZEN',city:'SAO JOSE DOS CAMPOS',mapEligible:true},
  {cnpj:'98765432000144',name:'POSTO ARAQUARA',address:'RUA MAURÍCIO GALLI, 55',district:'CENTRO',brand:'BANDEIRA BRANCA',city:'ARARAQUARA',mapEligible:false},
  {cnpj:'22222222000111',name:'POSTO SÃO BENTO',address:'RUA PORTUGAL, 99',district:'JARDIM SATÉLITE',brand:'RAIZEN',city:'SAO JOSE DOS CAMPOS',mapEligible:true},
];

test('busca sem acento nem diferença de caixa',()=>{
  assert.equal(normalize('  SÃO   JOSÉ! '),'sao jose');
  assert.deepEqual(searchStations(stations,'auto posto sao jose','SAO JOSE DOS CAMPOS').matches.map(x=>x.cnpj),['12345678000190']);
  assert.equal(searchStations(stations,'MAURICIO GALLI','ALL').matches[0].cnpj,'98765432000144');
});
test('busca bairro, bandeira e nome por palavras parciais',()=>{
  assert.equal(searchStations(stations,'satélite','ALL').total,2);
  assert.equal(searchStations(stations,'raizen','ALL').total,2);
  assert.equal(searchStations(stations,'posto sao bento','ALL').matches[0].cnpj,'22222222000111');
  assert.equal(searchStations(stations,'portugal 99','ALL').total,1);
});
test('busca CNPJ formatado e somente dígitos',()=>{
  assert.equal(searchStations(stations,'12.345.678/0001-90','ALL').matches[0].cnpj,'12345678000190');
  assert.equal(searchStations(stations,'000144','ALL').matches[0].cnpj,'98765432000144');
});
test('permite encontrar postos sem coordenadas e de outra cidade',()=>{
  const found=searchStations(stations,'araquara','SAO JOSE DOS CAMPOS');
  assert.equal(found.total,1);
  assert.equal(found.matches[0].mapEligible,false);
  assert.equal(found.matches[0].city,'ARARAQUARA');
});
test('busca mostra no máximo 12, sem perder total',()=>{
  const many=Array.from({length:30},(_,i)=>({
    cnpj:String(10000000000000+i),name:'AUTO POSTO ' + String(i).padStart(2,'0'),
    city:'ARARAQUARA'
  }));
  const result=searchStations(many,'auto','ARARAQUARA');
  assert.equal(result.total,30);
  assert.equal(result.matches.length,12);
  assert.equal(searchStations(many,'auto','ARARAQUARA',3).matches.length,3);
});
test('a busca é local, não usa fetch nem saída HTML das informações',()=>{
  const source=require('node:fs').readFileSync(require('node:path').join(__dirname,'../beta/station_search.js'),'utf8');
  assert.doesNotMatch(source,/fetch\s*\(/);
  assert.doesNotMatch(source,/maps\.googleapis|nominatim|overpass/i);
  assert.equal(searchStations(stations,'<img onerror=alert(1)>','ALL').total,0);
});
test('consulta curta, CNPJ inválido ou base ausente não retorna resultado',()=>{
  assert.equal(searchStations(stations,'a','ALL').total,0);
  assert.equal(searchStations(null,'teste','ALL').total,0);
  assert.equal(stationIndex({city:'ARARAQUARA',name:'POSTO'}).haystack,'posto araraquara');
});
