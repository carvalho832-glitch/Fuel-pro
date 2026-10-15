/* Fuel Pro 2.1 | proximity measured only on the visitor's device.
 * ANP geographic points are unverified: distances are straight-line estimates.
 * Does not fetch, store, send or persist the user's GPS coordinates.
 */
(function(root){
'use strict';
const EARTH_KM=6371.0088;
function validPoint(p){
  return !!p && typeof p.lat==='number' && typeof p.lng==='number' &&
    Number.isFinite(p.lat) && Number.isFinite(p.lng) &&
    p.lat>=-90 && p.lat<=90 && p.lng>=-180 && p.lng<=180;
}
function radians(n){return n*Math.PI/180;}
function distanceKm(a,b){
  if(!validPoint(a)||!validPoint(b))return null;
  const dlat=radians(b.lat-a.lat);
  const dlon=radians(b.lng-a.lng);
  const h=Math.sin(dlat/2)**2+
    Math.cos(radians(a.lat))*Math.cos(radians(b.lat))*Math.sin(dlon/2)**2;
  return EARTH_KM*2*Math.atan2(Math.sqrt(Math.min(1,h)),Math.sqrt(Math.max(0,1-h)));
}
function nearest(stations,position,options){
  const opt=options||{};
  const radius=opt.radiusKm===undefined?10:Number(opt.radiusKm);
  const city=opt.city||'ALL';
  const limit=Number.isInteger(opt.limit)?Math.max(1,Math.min(30,opt.limit)):12;
  const sortBy=opt.sortBy==='price'?'price':'distance';
  const onlyPriced=opt.onlyPriced===true;
  // Prices are supplied by the caller only after checking ANP source/date.
  const priceOf=typeof opt.priceOf==='function'?opt.priceOf:null;
  if(!validPoint(position)||!Array.isArray(stations)||!Number.isFinite(radius)||radius<=0||radius>200)
    return {matches:[],total:0,withoutCoords:0,withPrice:0};
  const distances=[];
  let missing=0,withPrice=0;
  for(const station of stations){
    if(!station || !/^\d{14}$/.test(station.cnpj||''))continue;
    if(city!=='ALL' && station.city!==city)continue;
    if(station.mapEligible!==true || !validPoint(station)){
      missing++;continue;
    }
    const distance=distanceKm(position,station);
    if(distance===null || distance>radius)continue;
    const rawPrice=priceOf?priceOf(station):null;
    const price=typeof rawPrice==='number' && Number.isFinite(rawPrice) &&
      rawPrice>0.5 && rawPrice<30 ? rawPrice : null;
    if(price!==null)withPrice++;
    if(onlyPriced && price===null)continue;
    distances.push({station,distanceKm:distance,price});
  }
  distances.sort((a,b)=>{
    if(sortBy==='price'){
      // Unpriced stations remain visible, but never outrank a documented price.
      if(a.price===null && b.price!==null)return 1;
      if(b.price===null && a.price!==null)return -1;
      if(a.price!==null && b.price!==null && a.price!==b.price)
        return a.price-b.price;
    }
    return a.distanceKm-b.distanceKm ||
      a.station.cnpj.localeCompare(b.station.cnpj);
  });
  return {matches:distances.slice(0,limit),total:distances.length,
    withoutCoords:missing,withPrice};
}
function nearestCity(stations,position,maxDistanceKm=30){
  const result=nearest(stations,position,{radiusKm:maxDistanceKm,limit:1});
  return result.matches.length?result.matches[0].station.city:null;
}
function formatDistance(distance){
  if(!Number.isFinite(distance)||distance<0)return 'Distância indisponível';
  return distance<1?Math.round(distance*1000)+' m':distance.toLocaleString('pt-BR',{
    minimumFractionDigits:1,maximumFractionDigits:1})+' km';
}
const api={validPoint,distanceKm,nearest,nearestCity,formatDistance};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.FuelProNearby=api;
})(typeof window!=='undefined'?window:globalThis);
