/* Fuel Pro: community address feedback without paid APIs or public tokens.
 * Local drafts are personal, never automatic ANP verification.
 */
(function(global){
'use strict';
const KEY='fuelpro.address.feedback.v1';
const LIMIT=150;
function clean(value,max){
  return String(value==null?'':value).replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
}
function address(value){
  const a=clean(value,180);
  if(a.length<7)throw new Error('Informe um endereço mais completo (rua e número).');
  return a;
}
function cityName(code){
  return code==='ARARAQUARA'?'Araraquara':code==='SAO JOSE DOS CAMPOS'?'São José dos Campos':'';
}
function validateRecord(r){
  if(!r||typeof r!=='object'||!/^\d{14}$/.test(r.cnpj||'')||
     !cityName(r.city)|| !['confirmed','correction'].includes(r.kind)||
     r.status!=='local_only'||r.locationVerified!==false ||
     typeof r.createdAt!=='string'||!Number.isFinite(Date.parse(r.createdAt)))return false;
  if(typeof r.proposedAddress!=='string'||r.proposedAddress.length<7||
     r.proposedAddress.length>180)return false;
  return true;
}
function makeRecord(post,kind,newAddress,notes,now){
  if(!post||!/^\d{14}$/.test(post.cnpj||'')||!cityName(post.city))
    throw new Error('Posto não identificado no cadastro ANP.');
  if(!['confirmed','correction'].includes(kind))throw new Error('Tipo de confirmação desconhecido.');
  const proposedAddress=address(newAddress);
  const official=address(post.address);
  if(kind==='correction'&&proposedAddress.toLocaleLowerCase('pt-BR')===
    official.toLocaleLowerCase('pt-BR'))throw new Error('O endereço sugerido é igual ao endereço da ANP.');
  return {
    version:1,cnpj:post.cnpj,city:post.city,
    name:clean(post.name,130),originalAddress:official,
    proposedAddress,kind,
    notes:clean(notes,280),
    status:'local_only',locationVerified:false,
    createdAt:(now||new Date()).toISOString()
  };
}
function load(storage){
  try{
    const raw=JSON.parse(storage.getItem(KEY)||'{}');
    if(!raw||typeof raw!=='object'||Array.isArray(raw))return {};
    const data={};
    for(const [key,record] of Object.entries(raw)){
      if(validateRecord(record)&&key===record.cnpj)data[key]=record;
    }
    return data;
  }catch(e){return {};}
}
function save(storage,entry){
  if(!validateRecord(entry))throw new Error('Relato inválido.');
  const data=load(storage);
  data[entry.cnpj]=entry;
  const pairs=Object.entries(data).sort((a,b)=>b[1].createdAt.localeCompare(a[1].createdAt));
  const limited=Object.fromEntries(pairs.slice(0,LIMIT));
  try{storage.setItem(KEY,JSON.stringify(limited));}
  catch(e){throw new Error('Armazenamento indisponível neste navegador. Compartilhe o relato para não perdê-lo.');}
  return entry;
}
function get(storage,cnpj){return load(storage)[cnpj]||null;}
function remove(storage,cnpj){
  const data=load(storage);delete data[cnpj];
  try{storage.setItem(KEY,JSON.stringify(data));return true;}
  catch(e){return false;}
}
function displayAddress(post,storage){
  const feedback=get(storage,post.cnpj);
  return feedback&&feedback.kind==='correction'?feedback.proposedAddress:post.address;
}
function fullAddress(post,storage){
  const entry=get(storage,post.cnpj);
  // If a user edited the full address, the old ANP district may be incorrect.
  const district=entry&&entry.kind==='correction'?null:post.district;
  return [displayAddress(post,storage),district,cityName(post.city),'SP','Brasil']
    .map(x=>clean(x,180)).filter(Boolean).join(', ');
}
function mapsUrl(post,storage){
  // Never route to the city centre merely because a station address is absent.
  address(displayAddress(post,storage));
  const destination=fullAddress(post,storage);
  return 'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(destination);
}
function reportText(post,record){
  if(!validateRecord(record)||record.cnpj!==post.cnpj)throw new Error('Relato não corresponde ao posto.');
  return [
    'Fuel Pro Beta | Relato comunitário de endereço (não verificado)',
    'Tipo: '+(record.kind==='confirmed'?'Confirmação por usuário':'Sugestão de correção'),
    'CNPJ: '+record.cnpj,
    'Posto: '+clean(post.name,130),
    'Cidade: '+cityName(record.city)+' / SP',
    'Endereço cadastral ANP: '+record.originalAddress,
    'Endereço informado pelo usuário: '+record.proposedAddress,
    'Observação: '+(record.notes||'Não informada'),
    'Registrado em: '+record.createdAt,
    'Status: aguardando conferência; relato NÃO altera cadastro oficial nem valida coordenadas.'
  ].join('\n');
}
function issueUrl(post,record){
  const title='[Fuel Pro][Endereço] '+(record.kind==='confirmed'?'Confirmação':'Correção')+' CNPJ '+record.cnpj;
  const body=reportText(post,record);
  return 'https://github.com/carvalho832-glitch/Fuel-pro/issues/new?title='+
    encodeURIComponent(title)+'&body='+encodeURIComponent(body);
}
const api={KEY,clean,address,makeRecord,load,save,get,remove,displayAddress,fullAddress,mapsUrl,reportText,issueUrl};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
global.FuelProCommunity=api;
})(typeof window!=='undefined'?window:globalThis);
