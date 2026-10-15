/* Fuel Pro Firebase bridge: Firestore Spark + invisible anonymous authentication.
 * Does not pretend submission occurred if Firebase is not configured or fails.
 * The Firebase web API key identifies a project; never include admin secrets here.
 */
(function(global){
'use strict';
const COLLECTION='fuelpro_reports';
const VERSION='12.4.0';
const FBASE='https://www.gstatic.com/firebasejs/'+VERSION+'/';
const REQUIRED=['apiKey','authDomain','projectId','appId'];

function isConfigured(settings){
  if(!settings || settings.enabled!==true || !settings.config)return false;
  return REQUIRED.every(key=>typeof settings.config[key]==='string'&&settings.config[key].trim());
}
function validate(record){
  return record && record.status==='local_only' && record.locationVerified===false &&
    /^\d{14}$/.test(record.cnpj||'') &&
    ['ARARAQUARA','SAO JOSE DOS CAMPOS'].includes(record.city) &&
    ['confirmed','correction'].includes(record.kind) &&
    typeof record.name==='string' && record.name.length>=2 && record.name.length<=130 &&
    typeof record.originalAddress==='string'&&record.originalAddress.length>=7&&record.originalAddress.length<=180 &&
    typeof record.proposedAddress==='string'&&record.proposedAddress.length>=7&&record.proposedAddress.length<=180 &&
    typeof record.notes==='string'&&record.notes.length<=280;
}
function toCreate(record,uid,stamp){
  if(!validate(record)||typeof uid!=='string'||!uid)throw new Error('Relato inválido.');
  return {
    ownerUid:uid,cnpj:record.cnpj,city:record.city,kind:record.kind,
    stationName:record.name,
    originalAddress:record.originalAddress,proposedAddress:record.proposedAddress,
    notes:record.notes,status:'pending',schemaVersion:1,
    createdAt:stamp,updatedAt:stamp
  };
}
function toUpdate(record,stamp){
  if(!validate(record))throw new Error('Relato inválido.');
  return {kind:record.kind,proposedAddress:record.proposedAddress,
          notes:record.notes,updatedAt:stamp};
}
function reportId(uid,cnpj){
  if(typeof uid!=='string'||!uid||!/^\d{14}$/.test(cnpj||''))throw new Error('Identificação inválida.');
  return uid+'_'+cnpj;
}
let sdkPromise=null;
async function getSdk(){
  if(!sdkPromise){
    sdkPromise=Promise.all([
      import(FBASE+'firebase-app.js'),
      import(FBASE+'firebase-auth.js'),
      import(FBASE+'firebase-firestore.js')
    ]).then(([app,auth,firestore])=>({app,auth,firestore}))
      .catch(err=>{sdkPromise=null;throw err;});
  }
  return sdkPromise;
}
let connection=null;
async function init(){
  const settings=global.FuelProFirebaseSettings;
  if(!isConfigured(settings))throw new Error('O recebimento pelo Firebase ainda não foi ativado nesta Beta.');
  const sdk=await getSdk();
  if(!connection){
    const app = sdk.app.getApps().find(x=>x.name==='fuelpro-beta') ||
      sdk.app.initializeApp(settings.config,'fuelpro-beta');
    connection={
      auth:sdk.auth.getAuth(app),db:sdk.firestore.getFirestore(app),sdk
    };
  }
  return connection;
}
async function submit(record){
  if(!validate(record))throw new Error('Relato inválido. Confirme ou corrija o endereço antes de enviar.');
  const {auth,db,sdk}=await init();
  if(!auth.currentUser)await sdk.auth.signInAnonymously(auth);
  if(!auth.currentUser)throw new Error('Não foi possível iniciar o acesso anônimo.');
  const uid=auth.currentUser.uid;
  const ref=sdk.firestore.doc(db,COLLECTION,reportId(uid,record.cnpj));
  const existing=await sdk.firestore.getDoc(ref);
  if(existing.exists() && existing.data().status!=='pending'){
    throw new Error('Este relato já foi analisado. Aguarde antes de enviar outro para o mesmo posto.');
  }
  const stamp=sdk.firestore.serverTimestamp();
  if(existing.exists()){
    await sdk.firestore.updateDoc(ref,toUpdate(record,stamp));
  } else {
    await sdk.firestore.setDoc(ref,toCreate(record,uid,stamp));
  }
  // Firestore acknowledged this write. The review process remains pending.
  return {accepted:true,reportId:ref.id,cnpj:record.cnpj,status:'pending'};
}
const api={COLLECTION,isConfigured,validate,toCreate,toUpdate,reportId,submit};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
global.FuelProFirebase=api;
})(typeof window!=='undefined'?window:globalThis);
