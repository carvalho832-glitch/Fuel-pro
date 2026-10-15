/* Read-only public notices. No user UID or private source identifiers exposed. */
(function(root){
'use strict';
const PROJECT='fuelpro-app-832';
function settingsReady(settings){
  return Boolean(settings?.enabled===true && settings.config?.projectId===PROJECT
    && typeof settings.config.apiKey==='string');
}
function parsePublicDocument(d,cnpj){
  if(!d||typeof d!=='object'||!d.fields)return null;
  const f=d.fields;
  if(f.cnpj?.stringValue!==cnpj || f.status?.stringValue!=='community_confirmed' ||
     f.kind?.stringValue!=='confirmed')return null;
  const address=f.address?.stringValue||'';
  if(address.length<7||address.length>180)return null;
  return {cnpj,address,status:'community_confirmed',kind:'confirmed',
    publishedAt:f.publishedAt?.timestampValue||null};
}
async function fetchPublicConfirmation(cnpj,settings){
  if(!/^\d{14}$/.test(cnpj||'')||!settingsReady(settings))return null;
  const url='https://firestore.googleapis.com/v1/projects/'+PROJECT+
    '/databases/(default)/documents/fuelpro_public_stations/'+cnpj+
    '?key='+encodeURIComponent(settings.config.apiKey);
  const response=await fetch(url,{cache:'no-store'});
  if(response.status===404)return null;
  if(!response.ok)throw Error('A consulta comunitária não está disponível.');
  return parsePublicDocument(await response.json(),cnpj);
}
const api={settingsReady,parsePublicDocument,fetchPublicConfirmation};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.FuelProPublic=api;
})(typeof window!=='undefined'?window:globalThis);
