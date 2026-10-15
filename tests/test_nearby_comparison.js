/* Run with: node tests/test_nearby_comparison.js
 * No live GPS, Firebase access or network calls.
 */
'use strict';
const assert=require('node:assert/strict');
const {nearest,distanceKm,nearestCity}=require('../beta/nearby_stations.js');
const here={lat:-21.80,lng:-48.17};
const station=(cnpj,lat,extra={})=>({
  cnpj,lat,lng:-48.17,city:'ARARAQUARA',mapEligible:true,...extra
});
const near=station('11111111111111',-21.801); // close and more expensive
const far=station('22222222222222',-21.82); // farther and less expensive
const unpriced=station('33333333333333',-21.802);
const outside=station('44444444444444',-23.19,{city:'SAO JOSE DOS CAMPOS'});
const missing=station('55555555555555',null,{mapEligible:false});
const rows=[near,far,unpriced,outside,missing];
const priceOf=p=>({
  '11111111111111':6.8,
  '22222222222222':5.7
})[p.cnpj]??null;

assert.equal(distanceKm(here,here),0);
assert.equal(distanceKm(here,{lat:NaN,lng:0}),null);
let result=nearest(rows,here,{radiusKm:5,city:'ALL',limit:15,priceOf});
assert.deepEqual(result.matches.map(x=>x.station.cnpj),[
  near.cnpj,unpriced.cnpj,far.cnpj
]);
assert.equal(result.total,3);
assert.equal(result.withPrice,2);
assert.equal(result.withoutCoords,1);
result=nearest(rows,here,{radiusKm:5,sortBy:'price',priceOf});
assert.deepEqual(result.matches.map(x=>x.station.cnpj),[
  far.cnpj,near.cnpj,unpriced.cnpj
]);
result=nearest(rows,here,{radiusKm:5,sortBy:'price',onlyPriced:true,priceOf});
assert.deepEqual(result.matches.map(x=>x.station.cnpj),[far.cnpj,near.cnpj]);
assert.equal(result.total,2);
assert.equal(result.withPrice,2);
result=nearest(rows,here,{radiusKm:0.5,sortBy:'price',onlyPriced:true,priceOf});
assert.equal(result.total,1);
result=nearest(rows,here,{radiusKm:5,onlyPriced:true});
assert.equal(result.total,0); // No price evidence must never imply a price.
result=nearest(rows,here,{radiusKm:5,priceOf:()=>NaN,sortBy:'price'});
assert.equal(result.withPrice,0);
assert.equal(result.total,3);
result=nearest(rows,here,{radiusKm:5,city:'SAO JOSE DOS CAMPOS'});
assert.equal(result.total,0);
assert.equal(nearestCity(rows,here,5),'ARARAQUARA');
console.log('Fuel Pro 2.1: testes de distância e menor preço passaram.');
