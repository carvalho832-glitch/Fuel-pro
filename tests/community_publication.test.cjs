const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {conflictFor,normalizeAddress,stationReports}=require('../admin/conflicts.js');
const {settingsReady,parsePublicDocument,fetchPublicConfirmation}=require('../beta/community_public.js');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const admin=read('admin/app.js'),rules=read('firebase/firestore.rules');

const records=[
  {id:'a',cnpj:'12345678000190',kind:'confirmed',status:'approved',originalAddress:'RUA TESTE, 42',proposedAddress:'Rua Teste 42'},
  {id:'b',cnpj:'12345678000190',kind:'confirmed',status:'pending',originalAddress:'RUA TESTE, 42',proposedAddress:'Rua TESTE, 42'},
  {id:'c',cnpj:'12345678000190',kind:'correction',status:'pending',originalAddress:'RUA TESTE, 42',proposedAddress:'AVENIDA TESTE, 103'},
  {id:'d',cnpj:'12345678000190',kind:'correction',status:'rejected',originalAddress:'RUA TESTE, 42',proposedAddress:'RUA FALSA, 5'},
  {id:'e',cnpj:'98765432000144',kind:'correction',status:'pending',originalAddress:'RUA OUTRA, 7',proposedAddress:'RUA OUTRA, 8'}
];

test('divergence only when distinct active addresses for same CNPJ',()=>{
  assert.equal(normalizeAddress('RUA TESTE, 42'),normalizeAddress('Rua Teste 42'));
  const yes=conflictFor(records,records[0]);
  assert.equal(yes.conflict,true);
  assert.equal(yes.others,1);
  assert.equal(yes.distinct.length,2);
  assert.equal(stationReports(records,'12345678000190').length,3);
  const no=conflictFor(records,records[4]);
  assert.equal(no.conflict,false);
});
test('rejected addresses do not create false conflicts',()=>{
  const no=conflictFor(records.filter(x=>x.id!=='c'),records[0]);
  assert.equal(no.conflict,false);
});
test('public records contain no owner UID and only published confirmation fields',()=>{
  const valid={
    fields:{cnpj:{stringValue:'12345678000190'},
      status:{stringValue:'community_confirmed'},kind:{stringValue:'confirmed'},
      address:{stringValue:'Rua Teste, 42'},publishedAt:{timestampValue:'2026-10-15T20:08:00Z'}}
  };
  const res=parsePublicDocument(valid,'12345678000190');
  assert.equal(res.address,'Rua Teste, 42');
  assert.equal(res.uid,undefined);
  assert.equal(parsePublicDocument(valid,'00000000000000'),null);
  assert.equal(parsePublicDocument({fields:{...valid.fields,status:{stringValue:'pending'}}},'12345678000190'),null);
});
test('without real Firebase config public check cannot request server',async()=>{
  assert.equal(settingsReady({enabled:false,config:{}}),false);
  assert.equal(await fetchPublicConfirmation('12345678000190',{enabled:false}),null);
  assert.equal(await fetchPublicConfirmation('NOT-CNPJ',{enabled:true,
    config:{projectId:'fuelpro-app-832',apiKey:'x'}}),null);
});
test('server rules permit only explicit approved confirmations to be published',()=>{
  assert.match(rules,/match \/fuelpro_public_stations\/\{cnpj\}/);
  assert.match(rules,/allow get: if true;\s*allow list: if false;/);
  assert.match(rules,/request\.resource\.data\.status == 'community_confirmed'/);
  assert.match(rules,/request\.resource\.data\.kind == 'confirmed'/);
  assert.match(rules,/match \/fuelpro_publication_sources\/\{cnpj\}/);
  assert.match(rules,/report\.status == 'approved'/);
  assert.match(rules,/report\.originalAddress == report\.proposedAddress/);
  assert.match(rules,/allow update, delete: if false;/);
  assert.doesNotMatch(rules,/allow read, write: if true/);
});
test('publishing is deliberately separate from private approval and uses atomic source link',()=>{
  assert.match(admin,/async function publishConfirmation/);
  assert.match(admin,/batch\.set\(publicRef,/);
  assert.match(admin,/batch\.set\(doc\(db,'fuelpro_publication_sources',r\.cnpj\)/);
  assert.match(admin,/await batch\.commit\(\)/);
  assert.match(admin,/window\.confirm\('PUBLICAR/);
  assert.match(admin,/r\.status!=='approved'/);
  assert.match(admin,/FuelProAdminConflict\.conflictFor\(records,r\)\.conflict/);
  const decisionSegment=admin.substring(admin.indexOf('async function decide('),admin.indexOf('async function loadReportsAfterDecision'));
  assert.doesNotMatch(decisionSegment,/fuelpro_public_stations|fuelpro_publication_sources/);
});
test('admin history and public app do not leak private report ID',()=>{
  assert.match(admin,/collection\(db,'fuelpro_review_logs'\)/);
  const publicSource=read('beta/community_public.js');
  assert.doesNotMatch(publicSource,/ownerUid|sourceReportId|reviewedBy/);
  assert.match(read('beta/app.js'),/updatePublishedStatus\(p\)/);
  assert.match(read('beta/index.html'),/public-community-status/);
});
