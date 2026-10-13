const test=require('node:test');
const assert=require('node:assert/strict');
const {
  KEY,makeRecord,load,save,get,remove,displayAddress,fullAddress,
  mapsUrl,reportText,issueUrl,address
}=require('../beta/community_feedback.js');

const post={
  cnpj:'12345678000190',city:'SAO JOSE DOS CAMPOS',name:'POSTO EXEMPLO',
  address:'AVENIDA CASSIANO RICARDO, 1500',district:'JARDIM ALVORADA'
};
function storage(){
  const state=new Map();
  return {
    getItem:key=>state.has(key)?state.get(key):null,
    setItem:(key,val)=>state.set(key,val),
    dump:()=>state,
  };
}
const now=new Date('2026-10-13T12:00:00Z');

test('confirmação de endereço não modifica cadastro ANP nem valida GPS',()=>{
  const s=storage();
  const r=makeRecord(post,'confirmed',post.address,'',now);
  save(s,r);
  assert.equal(get(s,post.cnpj).kind,'confirmed');
  assert.equal(get(s,post.cnpj).status,'local_only');
  assert.equal(r.locationVerified,false);
  assert.equal(displayAddress(post,s),post.address);
  assert.equal(post.address,'AVENIDA CASSIANO RICARDO, 1500');
  assert.throws(()=>mapsUrl({...post,address:''},s),/completo/);
});
test('correção local altera apenas destino escrito neste dispositivo',()=>{
  const s=storage();
  const r=makeRecord(post,'correction','AVENIDA CASSIANO RICARDO, 1520','Portão do lado',now);
  save(s,r);
  assert.equal(displayAddress(post,s),'AVENIDA CASSIANO RICARDO, 1520');
  assert.match(fullAddress(post,s),/1520.*São José dos Campos, SP, Brasil/);
  const uri=new URL(mapsUrl(post,s));
  assert.equal(uri.origin,'https://www.google.com');
  assert.equal(uri.searchParams.get('destination'),'AVENIDA CASSIANO RICARDO, 1520, São José dos Campos, SP, Brasil');
  assert.doesNotMatch(uri.searchParams.get('destination'),/JARDIM ALVORADA/);
  assert.equal(post.address,'AVENIDA CASSIANO RICARDO, 1500');
});
test('GitHub issue recebe relato e exige etapa de publicação pelo usuário',()=>{
  const rec=makeRecord(post,'correction','AVENIDA CASSIANO RICARDO, 1520','portão lateral',now);
  const uri=new URL(issueUrl(post,rec));
  assert.equal(uri.origin,'https://github.com');
  assert.equal(uri.pathname,'/carvalho832-glitch/Fuel-pro/issues/new');
  assert.match(uri.searchParams.get('body'),/CNPJ: 12345678000190/);
  assert.match(uri.searchParams.get('body'),/aguardando conferência/);
  assert.doesNotMatch(uri.searchParams.get('body'),/GPS aprovado|validado oficialmente/i);
});
test('pode remover apenas confirmação deste aparelho',()=>{
  const s=storage();save(s,makeRecord(post,'confirmed',post.address,'',now));
  assert.equal(remove(s,post.cnpj),true);
  assert.equal(get(s,post.cnpj),null);
});
test('não aceita CNPJ inválido, endereço curto ou sugestão idêntica',()=>{
  assert.throws(()=>makeRecord({...post,cnpj:'123'},'confirmed',post.address,''),/identificado/);
  assert.throws(()=>makeRecord(post,'correction','x',''),/completo/);
  assert.throws(()=>makeRecord(post,'correction',post.address,'') ,/igual/);
  assert.throws(()=>makeRecord(post,'other',post.address,''),/desconhecido/);
});
test('dados falsificados ou armazenados com problema não ganham status verificado',()=>{
  const s=storage();
  s.setItem(KEY,'not json');
  assert.deepEqual(load(s),{});
  s.setItem(KEY,JSON.stringify({[post.cnpj]:{kind:'confirmed',cnpj:post.cnpj,city:post.city,status:'approved',locationVerified:true}}));
  assert.deepEqual(load(s),{});
});
test('não registra dados pessoais de usuário automaticamente ou faz requisições',()=>{
  const f=require('node:fs');
  const source=f.readFileSync(require('node:path').join(__dirname,'../beta/community_feedback.js'),'utf8');
  assert.doesNotMatch(source,/fetch\s*\(|api[_-]?key|geolocation\.getCurrentPosition/i);
  const r=makeRecord(post,'confirmed',post.address,'',now);
  assert.equal(r.userId,undefined);
  assert.equal(r.userGps,undefined);
});
test('endereço com html permanece texto e tem tamanho limitado',()=>{
  const s=storage();
  const newAddress='<img src=x onerror=alert(1)> Avenida Teste, 100';
  const rec=makeRecord(post,'correction',newAddress,'',now);
  save(s,rec);
  assert.equal(displayAddress(post,s),newAddress);
  assert.match(issueUrl(post,rec),/%3Cimg/);
  assert.throws(()=>address('a'),/completo/);
});
