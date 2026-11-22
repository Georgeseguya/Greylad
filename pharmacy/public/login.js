'use strict';
const config=window.PHARMACY_CONFIG,form=document.querySelector('#login-form'),error=document.querySelector('#login-error'),frame=document.querySelector('#workspace');
let auth=null,refreshing=null,saving=false;
try{auth=JSON.parse(sessionStorage.getItem('greylad-session')||'null');}catch{}
function store(){if(auth)sessionStorage.setItem('greylad-session',JSON.stringify(auth));else sessionStorage.removeItem('greylad-session');}
async function call(body,token){if(!config.apiUrl)throw Error('The live pharmacy workspace is awaiting database activation. Sign-in will open once setup is complete.');const r=await fetch(config.apiUrl,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});const d=await r.json().catch(()=>({error:'The server could not be reached.'}));if(!r.ok){const e=Error(d.error||'Please try again.');e.status=r.status;throw e;}return d;}
async function request(body){if(!auth)throw Error('Please sign in.');if(auth.session.expires_at<Date.now()/1000+60){if(!refreshing)refreshing=call({action:'refresh',refreshToken:auth.session.refresh_token,pharmacyId:auth.pharmacyId}).then(r=>{auth.session=r.session;store();}).finally(()=>refreshing=null);try{await refreshing;}catch(e){signedOut();throw e;}}try{return await call({...body,pharmacyId:auth.pharmacyId,branchId:auth.branchId},auth.session.access_token);}catch(e){if(e.status===401||e.status===403)signedOut();throw e;}}
function signedOut(){auth=null;store();frame.removeAttribute('srcdoc');frame.hidden=true;document.querySelector('#branch-bar').hidden=true;document.querySelector('#all-branches').hidden=true;document.querySelector('#branch-management').hidden=true;document.querySelector('#login').hidden=false;form.reset();}
window.Live={request,command:async(commands,revision)=>{if(saving)throw Error('A save is already in progress.');saving=true;try{return await request({action:'command',commands,revision,requestId:crypto.randomUUID()});}finally{saving=false;}},logout:async()=>{try{await request({action:'logout'});}finally{signedOut();}}};

const bar=document.querySelector('#branch-bar'),branchSelector=document.querySelector('#branch-current');
const allPanel=document.querySelector('#all-branches'),managerPanel=document.querySelector('#branch-management');
let currentBranchBoot=null;
const h=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>'UGX '+Number(n||0).toLocaleString('en-UG');
function drawAll(boot){
 const t=boot.summaries||[],st=boot.stockRows||[];
 const sum=(key)=>t.reduce((n,x)=>n+Number(x[key]||0),0);
 const tiles=[['Branches',t.length],['Saleable units',sum('stockUnits').toLocaleString()],['Stock value',money(sum('stockValue'))],['Sales',money(sum('revenue'))]];
 allPanel.innerHTML='<h1>Overview</h1><div class="branch-grid">'+tiles.map(x=>'<div class="branch-stat">'+h(x[0])+'<b>'+h(x[1])+'</b></div>').join('')+'</div><h2>Branches</h2><table><thead><tr><th>Branch</th><th>Items</th><th>Stock units</th><th>Stock value</th><th>Sales</th></tr></thead><tbody>'+t.map(x=>'<tr><td>'+h(x.name)+'</td><td>'+x.medicines+'</td><td>'+x.stockUnits+'</td><td>'+money(x.stockValue)+'</td><td>'+money(x.revenue)+'</td></tr>').join('')+'</tbody></table><h2>Inventory</h2><table><thead><tr><th>Branch</th><th>Brand</th><th>Generic / strength</th><th>Available</th></tr></thead><tbody>'+st.map(x=>'<tr><td>'+h(x.branch)+'</td><td>'+h(x.brand)+'</td><td>'+h(x.generic)+' '+h(x.strength)+'</td><td>'+x.quantity+' '+h(x.unit)+'</td></tr>').join('')+'</tbody></table>';
}
async function openWorkspace(){
 const boot=await request({action:'workspace'});
 currentBranchBoot=boot;
 if(boot.branchId&&auth.branchId!==boot.branchId){auth.branchId=boot.branchId;store();}
 bar.hidden=false;document.querySelector('#login').hidden=true;document.querySelector('#staff-activation').hidden=true;
 const selected=auth.branchId||boot.branchId;
 branchSelector.innerHTML=(boot.isOwner?'<option value="all">All branches</option>':'')+(boot.branches||[]).map(x=>'<option value="'+h(x.id)+'">'+h(x.name)+' ('+h(x.code)+')</option>').join('');
 branchSelector.value=selected;
 document.querySelector('#branch-manage-btn').hidden=!boot.isOwner;
 managerPanel.hidden=true;
 if(boot.all){frame.hidden=true;allPanel.hidden=false;drawAll(boot);return;}
 allPanel.hidden=true;
 const r=await fetch('/workspace.html',{cache:'no-store'});
 if(!r.ok)throw Error('Workspace could not be loaded.');
 const html=await r.text();
 frame.srcdoc=html.replace('<head>','<head><script>window.BOOT='+JSON.stringify(boot).replace(/</g,'\\u003c')+';</script>');
 frame.hidden=false;form.reset();
}
branchSelector.onchange=async()=>{
 if(!auth)return;const previous=auth.branchId;auth.branchId=branchSelector.value;store();
 try{await openWorkspace();}catch(e){auth.branchId=previous;store();branchSelector.value=previous;alert(e.message);}
};
document.querySelector('#branch-logout').onclick=()=>window.Live.logout();
function opts(bs){return bs.map(x=>'<option value="'+h(x.id)+'">'+h(x.name)+'</option>').join('');}
async function showManager(){
 if(!currentBranchBoot?.isOwner)return;
 frame.hidden=true;allPanel.hidden=true;managerPanel.hidden=false;
 const bs=currentBranchBoot.branches||[];
 document.querySelectorAll('.branch-options').forEach(x=>x.innerHTML=opts(bs));
 const staff=await request({action:'listStaff'});
 const people=staff.staff.filter(x=>x.role!=='Admin'&&x.status==='Active');
 document.querySelector('#assign-employee').innerHTML=people.map(x=>'<option value="'+h(x.userId)+'">'+h(x.username)+' ('+h(x.role)+')</option>').join('');
 document.querySelector('#branch-access-list').innerHTML='<table><thead><tr><th>Employee</th><th>Branch</th><th>Role</th><th></th></tr></thead><tbody>'+
 staff.assignments.filter(x=>x.active).map(x=>{const person=people.find(p=>p.userId===x.user_id);
 const br=bs.find(b=>b.id===x.branch_id);
 return '<tr><td>'+h(person?.username||x.user_id)+'</td><td>'+h(br?.name||x.branch_id)+'</td><td>'+h(x.role)+'</td><td><button type="button" class="remove-branch-access" data-branch="'+h(x.branch_id)+'" data-user="'+h(x.user_id)+'">Remove</button></td></tr>';}).join('')+'</tbody></table>';
 document.querySelectorAll('.remove-branch-access').forEach(btn=>btn.onclick=async()=>{
 if(!confirm('Remove this branch access?'))return;
 try{await request({action:'removeBranchAccess',targetBranch:btn.dataset.branch,userId:btn.dataset.user});await showManager();}
 catch(e){showError(e.message);}
 });
}
function showError(x){document.querySelector('#branch-status').textContent=x;}
document.querySelector('#branch-manage-btn').onclick=()=>showManager().catch(e=>showError(e.message));
document.querySelector('#close-branch-manage').onclick=()=>openWorkspace().catch(e=>showError(e.message));
document.querySelector('#new-branch-form').onsubmit=async e=>{
 e.preventDefault();const d=Object.fromEntries(new FormData(e.target));const btn=e.target.querySelector('button');btn.disabled=true;
 try{await request({action:'createBranch',...d});e.target.reset();await openWorkspace();await showManager();showError('Branch created.');}
 catch(e){showError(e.message)}finally{btn.disabled=false;}
};
document.querySelector('#invite-staff-form').onsubmit=async e=>{
 e.preventDefault();const d=Object.fromEntries(new FormData(e.target));const btn=e.target.querySelector('button');btn.disabled=true;
 try{const r=await request({action:'inviteStaff',...d});document.querySelector('#invite-result').hidden=false;document.querySelector('#invite-link').value=r.invitationUrl;showError('Invitation created.');}
 catch(e){showError(e.message)}finally{btn.disabled=false;}
};
document.querySelector('#copy-invite').onclick=async()=>{try{await navigator.clipboard.writeText(document.querySelector('#invite-link').value);showError('Link copied.');}catch(e){showError(e.message)}};
document.querySelector('#grant-branch-form').onsubmit=async e=>{
 e.preventDefault();const d=Object.fromEntries(new FormData(e.target));const btn=e.target.querySelector('button');btn.disabled=true;
 try{const p=await request({action:'listStaff'});const emp=p.staff.find(x=>x.userId===d.userId);if(!emp)throw Error('Choose an employee.');
 await request({action:'grantBranch',...d,role:emp.role});await showManager();showError('Branch access updated.');}
 catch(e){showError(e.message)}finally{btn.disabled=false;}
};
const inviteCode=new URLSearchParams(location.search).get('invite');
if(inviteCode){
 document.querySelector('#login').hidden=true;document.querySelector('#staff-activation').hidden=false;
 document.querySelector('#activate-form').onsubmit=async e=>{
  e.preventDefault();const d=Object.fromEntries(new FormData(e.target)),msg=document.querySelector('#activate-message');
  if(d.password!==d.confirmPassword){msg.textContent='Passwords do not match.';return;}
  try{const r=await call({action:'activateStaff',invite:inviteCode,email:d.email,password:d.password});msg.textContent=r.message; e.target.reset();}
  catch(e){msg.textContent=e.message;}
 };
}

form.onsubmit=async e=>{e.preventDefault();error.textContent='';const btn=document.querySelector('#sign-in');btn.disabled=true;try{const d=Object.fromEntries(new FormData(form));auth=await call({action:'login',...d,pharmacy:d.pharmacy.trim().toLowerCase().replace(/\s+/g,'-')});store();await openWorkspace();}catch(e){error.textContent=e.message;}finally{btn.disabled=false;}};
if(!config.apiUrl){error.textContent='The live workspace is awaiting database activation.';document.querySelector('#sign-in').disabled=true;}else if(auth&&!inviteCode)openWorkspace().catch(e=>{signedOut();error.textContent=e.message;});
