/* Fuel Pro Admin: compare address reports from distinct anonymous senders.
 * Warnings are informative, NOT automatic invalidation or ANP verification.
 */
(function(root) {
'use strict';
function normalizeAddress(text){
  return String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/\b(rua|r)\.?\s+/g,'rua ')
    .replace(/\b(avenida|av)\.?\s+/g,'avenida ')
    .replace(/[^\p{L}\p{N}]/gu,' ').replace(/\s+/g,' ').trim();
}
function comparable(r){
  return r && /^\d{14}$/.test(r.cnpj||'') &&
    ['pending','approved'].includes(r.status) &&
    ['confirmed','correction'].includes(r.kind) &&
    typeof r.proposedAddress==='string' && r.proposedAddress.trim().length>=7;
}
function stationReports(records,cnpj){
  return (Array.isArray(records)?records:[]).filter(r=>comparable(r)&&r.cnpj===cnpj);
}
function conflictFor(records,report){
  if(!comparable(report))return {conflict:false,distinct:[],others:0,reason:'unavailable'};
  const group=stationReports(records,report.cnpj);
  const self=normalizeAddress(report.proposedAddress);
  const different=group.filter(r=>r.id!==report.id &&
    normalizeAddress(r.proposedAddress)!==self);
  const unique=new Map();
  for(const r of group){
    const canonical=normalizeAddress(r.proposedAddress);
    if(canonical && !unique.has(canonical))
      unique.set(canonical,{address:r.proposedAddress,count:group.filter(x=>
        normalizeAddress(x.proposedAddress)===canonical).length});
  }
  return {conflict:different.length>0,distinct:[...unique.values()],
    others:different.length,reason:different.length?'different_addresses':'no_conflict'};
}
const api={normalizeAddress,stationReports,conflictFor};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.FuelProAdminConflict=api;
})(typeof window!=='undefined'?window:globalThis);
