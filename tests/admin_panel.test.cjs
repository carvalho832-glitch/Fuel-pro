const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=(p)=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const js=read('admin/app.js'),html=read('admin/index.html'),rules=read('firebase/firestore.rules');

test('admin has its own site and never mixes with public Fuel Pro route',()=>{
  assert.match(js,/fuelpro-admin-832\.web\.app/);
  assert.match(js,/EXPECTED_PROJECT='fuelpro-app-832'/);
  assert.match(js,/\/__\/firebase\/init\.json/);
  assert.doesNotMatch(html,/src="\.\/\.\.\/beta\//);
  assert.match(html,/Fuel Pro ADMIN|<span class="admin-tag">ADMIN<\/span>/);
});
test('Google login and allowlist are checked before listing records',()=>{
  assert.match(js,/GoogleAuthProvider/);
  assert.match(js,/signInWithPopup\(auth,provider\)/);
  assert.match(js,/getDoc\(doc\(db,'fuelpro_admins',u\.uid\)\)/);
  assert.match(js,/own\.data\(\)\.active!==true/);
  assert.match(js,/if\(!authorized\|\|!user\|\|busy\)return/);
  assert.match(rules,/sign_in_provider == 'google\.com'/);
  assert.match(rules,/exists\(\/databases\/\$\(database\)\/documents\/fuelpro_admins\/\$\(request\.auth\.uid\)\)/);
  assert.match(rules,/allow list, create, update, delete: if false/);
});
test('Firestore data stays private and public ANP directory is not modified',()=>{
  assert.match(rules,/allow list: if isAdmin\(\);/);
  assert.match(rules,/request\.resource\.data\.status in \['approved', 'rejected'\]/);
  assert.match(js,/collection\(db,'fuelpro_reports'\)/);
  assert.doesNotMatch(js,/collection\(db,'postos_anp'\)|\/beta\/dados\.json|setDoc\(doc\(db,'fuelpro_admins'/);
  assert.doesNotMatch(rules,/allow read, write: if true/);
});
test('approval is batched with immutable audit log; no unreviewed reports deleted',()=>{
  assert.match(js,/const batch=writeBatch\(db\)/);
  assert.match(js,/batch\.update\(doc\(db,'fuelpro_reports',r\.id\)/);
  assert.match(js,/batch\.set\(doc\(db,'fuelpro_review_logs',r\.id\)/);
  assert.match(js,/await batch\.commit\(\)/);
  assert.match(rules,/getAfter\(\/databases\/\$\(database\)\/documents\/fuelpro_review_logs\/\$\(reportId\)\)/);
  assert.match(rules,/getAfter\(\/databases\/\$\(database\)\/documents\/fuelpro_reports\/\$\(reportId\)\)/);
  assert.match(rules,/match \/fuelpro_review_logs\/\{reportId\}[\s\S]*allow update, delete: if false/);
  assert.match(rules,/resource\.data\.status == 'pending'/);
});
test('records from other motorists cannot be rendered as unsanitized HTML',()=>{
  assert.match(js,/item\.textContent=String\(text\)/);
  assert.match(js,/report\.stationName|r\.stationName/);
  assert.doesNotMatch(js,/\.innerHTML\s*=|eval\(|Function\(/);
});
test('admin UI shows history, justified rejection and no auto-update of ANP',()=>{
  assert.match(html,/id="count-pending"/);
  assert.match(html,/id="count-approved"/);
  assert.match(html,/id="count-rejected"/);
  assert.match(html,/id="review-note"/);
  assert.match(js,/nextStatus==='rejected'&&note\.length<10/);
  assert.match(html,/não<\/strong> altera automaticamente/);
});

test('admin never leaves only the header visible when JavaScript fails to initialize',()=>{
  assert.match(html,/<section id="login-view" class="center-panel">/);
  assert.match(html,/id="load-problem"/);
  assert.match(html,/__fuelproAdminStarted/);
  assert.match(html,/app\.bundle\.js\?v=4/);
  const pkg=JSON.parse(read('admin/package.json'));
  assert.equal(pkg.dependencies.firebase,'12.4.0');
  assert.match(pkg.scripts.build,/esbuild app\.js --bundle/);
  assert.match(pkg.scripts.build,/--format=iife/);
  assert.doesNotMatch(html,/gstatic\.com\/firebasejs/);
});
