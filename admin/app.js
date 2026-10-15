/* Fuel Pro Admin. Standalone site. Server-enforced Google admin whitelist.
 * No admin secrets in the browser, no public post edits.
 */
import {initializeApp} from 'firebase/app';
import {getAuth,GoogleAuthProvider,signInWithPopup,signOut,onAuthStateChanged} from 'firebase/auth';
import {getFirestore,doc,getDoc,collection,query,orderBy,limit,getDocs,writeBatch,serverTimestamp} from 'firebase/firestore';

const EXPECTED_PROJECT='fuelpro-app-832';
const HOSTS=['fuelpro-admin-832.web.app','fuelpro-admin-832.firebaseapp.com'];
const els={};
for(const id of ['login-view','blocked-view','dashboard','account-email','logout','login-google',
  'pending-uid','copy-uid','recheck-access','refresh','filter-status','filter-text',
  'count-all','count-pending','count-approved','count-rejected','visible-count',
  'report-list','empty-detail','report-detail','detail-title','detail-badge',
  'detail-cnpj','detail-city','detail-date','detail-kind','detail-original',
  'detail-proposed','detail-notes','reviewed-info','decision-box',
  'review-note','approve','reject','alert','history-count','history-list',
  'conflict-warning','conflict-description',
  'publication-box','publication-status','publish-confirmation'])els[id]=document.getElementById(id);

let auth=null,db=null,user=null,authorized=false,records=[],history=[],chosenId=null,busy=false;
let publicationRequestId=0;
function visible(id){for(const key of ['login-view','blocked-view','dashboard'])els[key].hidden=key!==id;}
function say(message){
  els.alert.textContent=message;els.alert.hidden=false;
  clearTimeout(say.timer);
  say.timer=setTimeout(()=>{els.alert.hidden=true;},5500);
}
function displayDate(value){
  if(!value)return 'Não informada';
  const date=typeof value.toDate==='function'?value.toDate():new Date(value);
  if(Number.isNaN(date.getTime()))return 'Não informada';
  return new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',
    timeZone:'America/Sao_Paulo'}).format(date);
}
function cityName(value){
  return value==='SAO JOSE DOS CAMPOS'?'São José dos Campos':
    value==='ARARAQUARA'?'Araraquara':value||'Não informada';
}
function statusName(value){return value==='approved'?'Aprovado':value==='rejected'?'Rejeitado':'Pendente';}
function safeStatus(value){return ['pending','approved','rejected'].includes(value)?value:'pending';}
function maskedCnpj(v){
  const digits=String(v||'').replace(/\D/g,'');
  return /^\d{14}$/.test(digits)
    ? digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5')
    : String(v||'');
}
function dom(tag,klass,text){
  const item=document.createElement(tag);if(klass)item.className=klass;
  if(text!==undefined)item.textContent=String(text);
  return item;
}
function normalize(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
function isCurrentAdmin(u){
  return u && u.providerData.some(p=>p.providerId==='google.com');
}
function resetData(){
  authorized=false;records=[];history=[];chosenId=null;user=null;
  els['report-list'].replaceChildren();
  els['report-detail'].hidden=true;
  els['empty-detail'].hidden=false;
}
async function checkAdmin(u){
  if(!isCurrentAdmin(u)){
    resetData();visible('blocked-view');
    els['pending-uid'].textContent='Entre usando uma conta Google.';
    return;
  }
  const own=await getDoc(doc(db,'fuelpro_admins',u.uid));
  if(!own.exists()||own.data().active!==true){
    authorized=false;records=[];chosenId=null;visible('blocked-view');
    els['pending-uid'].textContent=u.uid;
    return;
  }
  authorized=true;user=u;visible('dashboard');
  await loadReports();
}
async function loadReports(){
  if(!authorized||!user||busy)return;
  els.refresh.disabled=true;
  try{
    const snap=await getDocs(query(collection(db,'fuelpro_reports'),
      orderBy('createdAt','desc'),limit(150)));
    records=snap.docs.map(d=>({id:d.id,...d.data()}));
    if(chosenId&&!records.some(x=>x.id===chosenId))chosenId=null;
    updateStats();drawList();showChosen();
    await loadHistory();
  }catch(err){
    console.error('Não foi possível carregar relatórios:',err);
    say(err.code==='permission-denied'?'Acesso não autorizado pelo Firebase.':'Erro ao carregar relatos. Confira a conexão.');
  }finally{els.refresh.disabled=false;}
}
async function loadHistory(){
  if(!authorized || !user)return;
  try{
    const snap=await getDocs(query(collection(db,'fuelpro_review_logs'),
      orderBy('reviewedAt','desc'),limit(80)));
    history=snap.docs.map(d=>({id:d.id,...d.data()}));
    drawHistory();
  }catch(err){
    console.error('Falha ao carregar histórico administrativo:',err);
    els['history-list'].replaceChildren(dom('p','','Não foi possível consultar a auditoria.'));
  }
}
function drawHistory(){
  const list=els['history-list'];
  list.replaceChildren();
  els['history-count'].textContent=history.length+' decisões carregadas';
  if(!history.length){
    list.append(dom('p','', 'Ainda não há decisões registradas.'));
    return;
  }
  for(const entry of history){
    const card=dom('article','history-entry');
    const pill=dom('span','small-pill '+safeStatus(entry.status),statusName(entry.status));
    card.append(pill);
    const report=records.find(r=>r.id===entry.reportId);
    card.append(dom('strong','',report?.stationName||'CNPJ '+maskedCnpj(entry.cnpj)));
    card.append(dom('p','audit-meta','Decidido em '+displayDate(entry.reviewedAt)));
    card.append(dom('p','',entry.reviewNote||'Sem justificativa adicional.'));
    list.append(card);
  }
}
function updateStats(){
  els['count-all'].textContent=records.length;
  for(const s of ['pending','approved','rejected']){
    els['count-'+s].textContent=records.filter(x=>x.status===s).length;
  }
}
function drawList(){
  const status=els['filter-status'].value;
  const q=normalize(els['filter-text'].value.trim());
  const filtered=records.filter(r=>(status==='all'||r.status===status) &&
    (!q||normalize([r.stationName,r.cnpj,r.city,r.originalAddress,
      r.proposedAddress].filter(Boolean).join(' ')).includes(q)));
  els['visible-count'].textContent=filtered.length+' de '+records.length+' carregados';
  const list=els['report-list'];
  list.replaceChildren();
  for(const r of filtered){
    const button=dom('button','report-card'+(r.id===chosenId?' active':''));button.type='button';
    button.setAttribute('role','listitem');
    const top=dom('span','report-top');
    top.append(dom('span','report-name',r.stationName||'Posto sem nome'));
    top.append(dom('span','small-pill '+safeStatus(r.status),statusName(r.status)));
    button.append(top);
    button.append(dom('div','report-meta',cityName(r.city)+' · '+maskedCnpj(r.cnpj)));
    const foot=dom('span','report-foot');
    foot.append(dom('span','',r.kind==='confirmed'?'✓ Confirmação':'✏️ Correção'));
    foot.append(dom('span','',displayDate(r.createdAt)));
    button.append(foot);
    if(window.FuelProAdminConflict.conflictFor(records,r).conflict){
      button.append(dom('span','small-pill pending','⚠️ Divergência em outros relatos'));
    }
    button.addEventListener('click',()=>{chosenId=r.id;drawList();showChosen();});
    list.append(button);
  }
  if(!filtered.length){
    const p=dom('p','empty-detail','Nenhum relato encontrado neste filtro.');
    p.style.padding='25px 12px';list.append(p);
  }
}
function showChosen(){
  const r=records.find(x=>x.id===chosenId);
  els['empty-detail'].hidden=Boolean(r);
  els['report-detail'].hidden=!r;
  if(!r)return;
  els['detail-title'].textContent=r.stationName||'Posto sem identificação';
  els['detail-badge'].className='status-pill '+safeStatus(r.status);
  els['detail-badge'].textContent=statusName(r.status);
  els['detail-cnpj'].textContent=maskedCnpj(r.cnpj);
  els['detail-city'].textContent=cityName(r.city);
  els['detail-date'].textContent=displayDate(r.createdAt);
  els['detail-kind'].textContent=r.kind==='confirmed'?'Confirmação':'Sugestão de correção';
  els['detail-original'].textContent=r.originalAddress||'Não informado';
  els['detail-proposed'].textContent=r.proposedAddress||'Não informado';
  els['detail-notes'].textContent=r.notes||'Nenhuma observação adicional.';
  const check=window.FuelProAdminConflict.conflictFor(records,r);
  els['conflict-warning'].hidden=!check.conflict;
  els['conflict-description'].textContent=check.conflict ?
    check.others+' outro(s) relato(s) diverge(m) deste endereço. '+
    'Endereços distintos registrados: '+check.distinct.map(x=>x.address+' ('+x.count+')').join('; ')+
    '. Compare manualmente antes de aprovar e publicar informações comunitárias.' : '';
  const decided=r.status!=='pending';
  els['decision-box'].hidden=decided;
  els['reviewed-info'].hidden=!decided;
  if(decided){
    els['reviewed-info'].textContent='Decisão: '+statusName(r.status)+
      ' · '+displayDate(r.reviewedAt)+
      (r.reviewNote?' · Observação: '+r.reviewNote:'');
  }
  els['review-note'].value='';
  void updatePublicationState(r);
}
async function updatePublicationState(r){
  const request=++publicationRequestId;
  const panel=els['publication-box'];
  const status=els['publication-status'];
  const action=els['publish-confirmation'];
  panel.hidden=true;
  if(!r || r.status!=='approved')return;
  panel.hidden=false;
  const conflict=window.FuelProAdminConflict.conflictFor(records,r).conflict;
  const eligible=r.kind==='confirmed' &&
    window.FuelProAdminConflict.normalizeAddress(r.originalAddress)===
    window.FuelProAdminConflict.normalizeAddress(r.proposedAddress);
  action.disabled=true;
  status.textContent='Verificando publicação anterior…';
  try{
    const snap=await getDoc(doc(db,'fuelpro_public_stations',r.cnpj));
    if(request!==publicationRequestId || chosenId!==r.id)return;
    if(snap.exists()){
      status.textContent='✓ Já publicado para motoristas: '+(snap.data().address||'endereço confirmado')+'.';
      action.textContent='✓ Publicado';
      return;
    }
    if(conflict){
      status.textContent='⚠️ Existem relatos conflitantes. Resolva as divergências antes de publicar.';
    }else if(!eligible){
      status.textContent='Este relato é uma correção ou não coincide com o cadastro ANP. Publicação bloqueada nesta etapa.';
    }else{
      status.textContent='Aprovado internamente. A confirmação ainda NÃO está publicada para motoristas.';
      action.disabled=false;
    }
    action.textContent='Publicar confirmação revisada';
  }catch(error){
    if(request!==publicationRequestId)return;
    console.error('Falha ao consultar publicação comunitária',error);
    status.textContent='Não foi possível verificar se já existe publicação. Tente atualizar.';
  }
}
async function publishConfirmation(){
  if(!authorized||!user||busy)return;
  const r=records.find(x=>x.id===chosenId);
  if(!r||r.status!=='approved'||r.kind!=='confirmed' ||
      window.FuelProAdminConflict.normalizeAddress(r.originalAddress)!==
      window.FuelProAdminConflict.normalizeAddress(r.proposedAddress) ||
      window.FuelProAdminConflict.conflictFor(records,r).conflict){
    return say('Publicação bloqueada: é necessária confirmação aprovada, sem divergências.');
  }
  if(!window.confirm('PUBLICAR esta confirmação para motoristas?\n'+
    r.stationName+'\n'+r.originalAddress+
    '\nO endereço ANP e o GPS NÃO serão substituídos.'))return;
  busy=true;
  const button=els['publish-confirmation'];
  button.disabled=true;
  const status=els['publication-status'];
  try{
    const publicRef=doc(db,'fuelpro_public_stations',r.cnpj);
    const current=await getDoc(publicRef);
    if(current.exists())return say('Já existe uma publicação para este CNPJ.');
    const stamp=serverTimestamp();
    const batch=writeBatch(db);
    batch.set(publicRef,{
      cnpj:r.cnpj,city:r.city,stationName:r.stationName,
      address:r.originalAddress,kind:'confirmed',
      status:'community_confirmed',publishedAt:stamp
    });
    batch.set(doc(db,'fuelpro_publication_sources',r.cnpj),{
      cnpj:r.cnpj,reportId:r.id,publishedBy:user.uid,publishedAt:stamp
    });
    await batch.commit();
    status.textContent='✓ Publicado com fonte privada registrada no Firebase.';
    button.textContent='✓ Publicado';
    say('✓ Confirmação publicada para consulta comunitária. O cadastro ANP permanece intacto.');
  }catch(err){
    console.error('Falha ao publicar confirmação:',err);
    status.textContent='Não foi possível publicar. Nada foi confirmado como público.';
    say(err.code==='permission-denied'?'O Firebase recusou a publicação.':'Falha ao publicar. Tente novamente.');
  }finally{
    busy=false;
    if(chosenId===r.id)void updatePublicationState(r);
  }
}
async function decide(nextStatus){
  if(!authorized||!user||busy)return;
  const r=records.find(x=>x.id===chosenId);
  if(!r||r.status!=='pending')return say('Este relato não está disponível para decisão.');
  if(!['approved','rejected'].includes(nextStatus))return;
  const note=els['review-note'].value.trim().slice(0,500);
  if(nextStatus==='rejected'&&note.length<10){
    els['review-note'].focus();
    return say('Informe uma justificativa de pelo menos 10 caracteres para rejeitar.');
  }
  const action=nextStatus==='approved'?'aprovar':'rejeitar';
  if(!window.confirm('Deseja '+action+' este relato de '+r.stationName+
     '?\nA decisão ficará registrada e não alterará automaticamente o cadastro ANP.'))return;
  busy=true;
  els.approve.disabled=true;els.reject.disabled=true;els.refresh.disabled=true;
  try{
    const stamp=serverTimestamp();
    const batch=writeBatch(db);
    batch.update(doc(db,'fuelpro_reports',r.id),{
      status:nextStatus,reviewedBy:user.uid,reviewedAt:stamp,reviewNote:note
    });
    batch.set(doc(db,'fuelpro_review_logs',r.id),{
      reportId:r.id,cnpj:r.cnpj,status:nextStatus,
      reviewedBy:user.uid,reviewedAt:stamp,reviewNote:note
    });
    await batch.commit();
    say('✓ Relato '+(nextStatus==='approved'?'aprovado':'rejeitado')+
      '. Auditoria registrada no Firebase.');
    await loadReportsAfterDecision();
  }catch(err){
    console.error('Erro na moderação:',err);
    say(err.code==='permission-denied'
      ?'O servidor recusou a operação. Sua conta pode não estar autorizada.'
      :'Falha ao gravar decisão. Nenhuma aprovação foi confirmada.');
  }finally{
    busy=false;els.approve.disabled=false;els.reject.disabled=false;els.refresh.disabled=false;
  }
}
async function loadReportsAfterDecision(){
  const snap=await getDocs(query(collection(db,'fuelpro_reports'),
    orderBy('createdAt','desc'),limit(150)));
  records=snap.docs.map(d=>({id:d.id,...d.data()}));
  updateStats();drawList();showChosen();
  await loadHistory();
}
async function signIn(){
  if(!auth)return;
  els['login-google'].disabled=true;
  try{
    const provider=new GoogleAuthProvider();
    provider.setCustomParameters({prompt:'select_account'});
    await signInWithPopup(auth,provider);
  }catch(err){
    console.error('Falha no login Google:',err);
    if(err.code!=='auth/popup-closed-by-user'&&err.code!=='auth/cancelled-popup-request'){
      say('Não foi possível entrar com Google. Confira pop-ups e autorização de domínio.');
    }
  }finally{els['login-google'].disabled=false;}
}
async function start(){
  window.__fuelproAdminStarted=true;
  visible('login-view');
  if(!HOSTS.includes(location.hostname)){
    els['login-google'].disabled=true;
    say('Por segurança, abra o painel pelo domínio oficial fuelpro-admin-832.web.app.');
    return;
  }
  try{
    const res=await fetch('/__/firebase/init.json',{cache:'no-store'});
    if(!res.ok)throw Error('Configuração do Hosting indisponível');
    const cfg=await res.json();
    if(cfg.projectId!==EXPECTED_PROJECT||!cfg.apiKey||!cfg.appId||!cfg.authDomain){
      throw Error('O projeto Firebase não corresponde ao Fuel Pro');
    }
    const app=initializeApp(cfg,'fuelpro-admin');
    auth=getAuth(app);db=getFirestore(app);
    els['login-google'].disabled=false;
    onAuthStateChanged(auth,async u=>{
      els['account-email'].textContent=u?.email||'';
      els.logout.hidden=!u;
      if(!u){resetData();visible('login-view');return;}
      try{await checkAdmin(u);}
      catch(err){console.error('Falha na verificação de acesso:',err);
        resetData();visible('blocked-view');els['pending-uid'].textContent=u.uid;
        say('Não foi possível verificar sua autorização no banco.');
      }
    });
  }catch(err){
    console.error('Erro na inicialização administrativa:',err);
    els['login-google'].disabled=true;
    say('Falha na inicialização do Firebase Admin. Tente novamente.');
  }
}
els['login-google'].addEventListener('click',signIn);
els.logout.addEventListener('click',async()=>{if(auth)await signOut(auth);});
els['copy-uid'].addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText(els['pending-uid'].textContent);
    say('Código de autorização copiado.');}
  catch(err){say('Não foi possível copiar. Selecione o código exibido.');}
});
els['recheck-access'].addEventListener('click',async()=>{
  if(!auth?.currentUser)return;
  try{await checkAdmin(auth.currentUser);}catch(e){say('Não foi possível verificar o acesso.');}
});
els.refresh.addEventListener('click',loadReports);
els['filter-status'].addEventListener('change',drawList);
els['filter-text'].addEventListener('input',drawList);
els.approve.addEventListener('click',()=>decide('approved'));
els.reject.addEventListener('click',()=>decide('rejected'));
els['publish-confirmation'].addEventListener('click',()=>{void publishConfirmation();});
void start();
