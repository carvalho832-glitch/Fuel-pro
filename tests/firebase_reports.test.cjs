const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {
  isConfigured,validate,toCreate,toUpdate,reportId,COLLECTION
}=require('../beta/firebase_reports.js');
const {makeRecord}=require('../beta/community_feedback.js');

const post={
  cnpj:'12345678000190',
  city:'ARARAQUARA',
  name:'POSTO EXEMPLO',
  address:'AVENIDA BRASIL, 1050',
  district:'CENTRO'
};
const rec=makeRecord(post,'confirmed',post.address,'');
const cfg={enabled:true,config:{
  apiKey:'firebase-public-web-key',authDomain:'fuelpro-test.firebaseapp.com',
  projectId:'fuelpro-test',appId:'1:123456:web:abcdef'
}};

test('no visible login: bridge remains disabled until project configured',()=>{
  assert.equal(isConfigured({enabled:false,config:cfg.config}),false);
  assert.equal(isConfigured({enabled:true,config:null}),false);
  assert.equal(isConfigured(cfg),true);
  assert.equal(isConfigured({enabled:true,config:{projectId:'x'}}),false);
});
test('one deterministic Firestore doc per anonymous uid + CNPJ',()=>{
  assert.equal(COLLECTION,'fuelpro_reports');
  assert.equal(reportId('anonymousUID',post.cnpj),'anonymousUID_12345678000190');
  assert.throws(()=>reportId('anonymousUID','123'),/inválida/);
});
test('only eligible local reports are transformed into pending submissions',()=>{
  assert.equal(validate(rec),true);
  const stamp={__serverTimestamp:true};
  const saved=toCreate(rec,'anonymousUID',stamp);
  assert.equal(saved.ownerUid,'anonymousUID');
  assert.equal(saved.cnpj,post.cnpj);
  assert.equal(saved.status,'pending');
  assert.equal(saved.schemaVersion,1);
  assert.equal(saved.createdAt,stamp);
  assert.equal(saved.updatedAt,stamp);
  assert.equal(saved.locationVerified,undefined);
  assert.equal(saved.userEmail,undefined);
  assert.equal(saved.coordinates,undefined);
});
test('retry changes proposed address, never CNPJ, admin state, creation timestamp',()=>{
  const saved=toUpdate(rec,{__serverTimestamp:true});
  assert.deepEqual(Object.keys(saved).sort(),['kind','notes','proposedAddress','updatedAt']);
});
test('malformed, unapproved or oversized reports cannot reach Firestore',()=>{
  assert.equal(validate({...rec,cnpj:'x'}),false);
  assert.equal(validate({...rec,status:'approved'}),false);
  assert.equal(validate({...rec,locationVerified:true}),false);
  assert.equal(validate({...rec,proposedAddress:'A'}),false);
  assert.equal(validate({...rec,notes:'x'.repeat(281)}),false);
});
test('Firestore rules deny reading reports of other users and client admin writes',()=>{
  const rules=fs.readFileSync(path.join(__dirname,'../firebase/firestore.rules'),'utf8');
  assert.match(rules,/match \/fuelpro_reports\/\{reportId\}/);
  assert.match(rules,/reportId == request\.auth\.uid \+ '_'/);
  assert.match(rules,/allow list: if isAdmin\(\)/);
  assert.match(rules,/allow create: if isAnonymous\(\)/);
  assert.match(rules,/request\.resource\.data\.updatedAt == request\.time/);
  assert.match(rules,/allow list, create, update, delete: if false/);
  assert.doesNotMatch(rules,/allow read, write: if true/);
});
test('client never includes service-account credential or an admin role',()=>{
  const src=fs.readFileSync(path.join(__dirname,'../beta/firebase_reports.js'),'utf8');
  assert.doesNotMatch(src,/serviceAccountKey|private_key|ADMIN_SECRET|admin\.credential/);
  assert.match(src,/signInAnonymously/);
  assert.match(src,/serverTimestamp/);
  assert.match(src,/await sdk\.firestore\.(setDoc|updateDoc)/);
});

test('receipt keeps send button disabled after Firebase confirmation',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../beta/app.js'),'utf8');
  assert.match(source,/const delivered=Boolean\(receipt\)/);
  assert.match(source,/✓ Recebido pelo Fuel Pro/);
  assert.match(source,/els\['send-feedback'\]\.disabled=delivered \|\| !firebaseActive\(\)/);
  assert.match(source,/if\(receiptFor\(feedback\)\)/);
  assert.match(source,/if\(acknowledgedByServer \|\| receiptFor\(communityRecord\(station\)\)\)/);
  assert.doesNotMatch(source,/button\.textContent='Tentar envio pelo Fuel Pro';/);
});

test('the local erase button is not mistaken for deleting the cloud report',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../beta/index.html'),'utf8');
  const source=fs.readFileSync(path.join(__dirname,'../beta/app.js'),'utf8');
  assert.match(html,/Apagar apenas deste aparelho/);
  assert.match(html,/não cancela um relato já enviado ao Firebase/);
  assert.match(source,/O relato já enviado permanece no Firebase|O relato já enviado permanece/i);
});

test('successful cloud acknowledgment holds sent status even if local receipt is delayed',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../beta/app.js'),'utf8');
  assert.match(source,/let acknowledgedByServer=false/);
  assert.match(source,/acknowledgedByServer=true/);
  assert.match(source,/if\(acknowledgedByServer \|\| receiptFor\(communityRecord\(station\)\)\)/);
  assert.match(source,/button\.disabled=true;\s*button\.textContent='✓ Recebido pelo Fuel Pro'/);
});

test('Android loads versioned scripts and app cache is bumped',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../beta/index.html'),'utf8');
  const worker=fs.readFileSync(path.join(__dirname,'../beta/sw.js'),'utf8');
  assert.match(html,/app\.js\?v=20261015r2/);
  assert.match(html,/firebase_config\.js\?v=20261015r2/);
  assert.match(worker,/fuel-pro-anp-beta-v9-receipt-fix/);
  assert.match(worker,/app\.js\?v=20261015r2/);
});
