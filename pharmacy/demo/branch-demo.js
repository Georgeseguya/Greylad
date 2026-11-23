/* Greylad Pharmacy demo branch testing. All records remain in browser storage. */
(function(){
'use strict';
if(window.Access){
 if(!Access.roles.includes('Dispenser'))Access.roles.splice(3,0,'Dispenser');
 if(!Access.staffRoles.includes('Dispenser'))Access.staffRoles.splice(1,0,'Dispenser');
 const rights=Access.rights;
 const backupRoles=['Manager','Pharmacist','Dispenser','Cashier','Stock clerk','Viewer','Stock manager'];
 backupRoles.forEach(role=>{if(rights[role]&&!rights[role].includes('backup.export'))rights[role].push('backup.export');});
 // Restore remains an owner/Admin-only operation.
 rights.Dispenser=['stock.read','catalogue.write','medicine.edit','edit','adjust','block','sell','invoice.cancel','clinical','settings','backup.export'];
 Access.tabs.backup='backup.export';
 Access.backupData=function(s,id){
  const u=Access.account(s,id);if(!u||!Access.can(s,id,'backup.export'))throw Error('Backup access denied.');
  const n=structuredClone(s),can=p=>Access.can(s,id,p);
  const scopes={medicines:'stock.read',batches:'stock.read',sales:'sell',adjustments:'adjust',suppliers:'procurement',purchaseOrders:'procurement',editHistory:'edit',employees:'staff',blockHistory:'block',invoices:'sell',cashMovements:'finance',closings:'finance',stocktakes:'adjust',patients:'clinical',appointments:'clinical',consultations:'clinical',prescriptions:'clinical',events:'reports',customers:'sell',tradePrices:'catalogue.write'};
  for(const [key,right] of Object.entries(scopes))if(!can(right))n[key]=[];
  if(!can('adjust'))n.adjustments=(s.adjustments||[]).map(({id,batchId,medicineId,delta,order,date})=>({id,batchId,medicineId,delta,order,date}));
  if(!can('sell')&&!can('reports'))n.sales=(s.sales||[]).map(x=>({id:x.id,order:x.order,date:x.date,lines:(x.lines||[]).map(l=>({batchId:l.batchId,qty:l.qty}))}));
  else if(!can('reports'))n.sales=(s.sales||[]).map(({cost,profit,...x})=>({...x,lines:(x.lines||[]).map(({unitCost,cost,...l})=>l)}));
  if(!can('finance')){n.batches=(s.batches||[]).map(({unitCost,cost,...b})=>b);n.adjustments=(n.adjustments||[]).map(({value,...a})=>a);}
  delete n.access;
  return {data:n,scope:{pharmacyId:s.settings.pharmacyId,branchId:s.settings.branchId||null,branchName:s.settings.branchName||null,role:u.role,includedSections:Object.entries(scopes).filter(([key,right])=>can(right)).map(([key])=>key)}};
 };
 if(typeof applyAccessUI==='function'){
  const priorApplyAccessUI=applyAccessUI;
  applyAccessUI=function(){priorApplyAccessUI();const u=Access.account(state,accountSession);document.querySelectorAll('#download-backup').forEach(x=>x.hidden=!u||!Access.can(state,accountSession,'backup.export'));document.querySelectorAll('#restore-backup').forEach(x=>x.hidden=!u||!Access.can(state,accountSession,'backup.restore'));};
  applyAccessUI();
 }
 if(typeof backup==='function'){
  backup=function(){const payload=state.access?Access.backupData(state,accountSession):{data:state,scope:{role:'Demo'}};download('pharmacy-backup-'+today()+'.json',JSON.stringify({app:'greylad-pharmacy',version:14,exportedAt:new Date().toISOString(),...payload},null,2),'application/json');toast('Role-scoped backup download started.');};
 }
}

const dirKey='gp-demo-directory-v1',activeKey='gp-demo-active-branch-v1',prefix='gp-demo-branch-stock-';
const main={id:'MAIN',code:'MAIN',name:'Main Branch'};
let directory;
try{directory=JSON.parse(localStorage.getItem(dirKey)||'null')}catch{}
if(!directory||!Array.isArray(directory.branches))directory={branches:[main],staff:[]};
if(!Array.isArray(directory.staff))directory.staff=[];
if(!directory.branches.some(b=>b.id==='MAIN'))directory.branches.unshift(main);
const originalMainKey=key;
let active=sessionStorage.getItem(activeKey)||'MAIN';
if(active!=='all'&&!directory.branches.some(b=>b.id===active))active='MAIN';
const branch=id=>directory.branches.find(x=>x.id===id),safe=esc;
const moneyDemo=n=>'UGX '+Number(n||0).toLocaleString('en-UG');
const storeDir=()=>localStorage.setItem(dirKey,JSON.stringify(directory));
function stockKey(id){return id==='MAIN'?originalMainKey:prefix+id;}
function emptyState(){const a=structuredClone(state);Object.keys(a).forEach(k=>{if(Array.isArray(a[k]))a[k]=[];});a.revision=0;return a;}
function readState(id){try{return JSON.parse(localStorage.getItem(stockKey(id))||'null')||emptyState();}catch{return emptyState();}}
function leftUnits(d){const day=today();return (d.batches||[]).filter(b=>!P.expired(b,day)&&!['quarantined','writtenoff'].includes(b.status)).reduce((n,b)=>n+Math.max(0,P.remaining(b,d.sales||[],d.adjustments||[])),0);}
function stockValue(d){const day=today();return (d.batches||[]).filter(b=>!P.expired(b,day)&&!['quarantined','writtenoff'].includes(b.status)).reduce((n,b)=>n+Math.max(0,P.remaining(b,d.sales||[],d.adjustments||[]))*Number(b.unitCost||0),0);}
const originalPersist=persist;
persist=function(next,expected=state.revision){
 if(active==='all')throw Error('Select a branch first.');
 if(active==='MAIN')return originalPersist(next,expected);
 const latest=readState(active);if((latest.revision||0)!==expected)throw Error('This branch has changed. Refresh first.');
 next.revision=expected+1;localStorage.setItem(stockKey(active),JSON.stringify(next));state=next;
};
const originalRender=render;
const commercialKey='gp-demo-commercial-v1';
function commercialData(){try{const d=JSON.parse(localStorage.getItem(commercialKey)||'{}');return {customers:Array.isArray(d.customers)?d.customers:[],prices:Array.isArray(d.prices)?d.prices:[]};}catch{return {customers:[],prices:[]}}}
function saveCommercial(data){localStorage.setItem(commercialKey,JSON.stringify(data))}
function renderDemoCommercial(which){
 const data=commercialData();
 if(which==='customers'){
  $('#breadcrumb').textContent='Business customers';$('#heading').textContent='Business customers';$('#subtitle').textContent='';
  $('#stats').hidden=true;$('#toolbar').hidden=true;$('.intro .actions').hidden=true;$('.intro small').hidden=true;$('#notice').hidden=true;
  $('#content').innerHTML='<div class="section-body"><h3>Add business customer</h3><form id="demo-customer-form" class="demo-commercial-form"><label>Business name *<input name="name" required maxlength="160"></label><label>Contact person<input name="contact" maxlength="100"></label><label>Telephone<input name="phone" maxlength="40"></label><label>Email<input name="email" type="email" maxlength="160"></label><label>Address<input name="address" maxlength="240"></label><label>TIN<input name="tin" maxlength="60"></label><label>Licence reference<input name="licence" maxlength="80"></label><button>Save customer</button></form></div><h3>Saved business customers</h3><div class="demo-table"><table><thead><tr><th>Business</th><th>Contact</th><th>TIN / Licence</th></tr></thead><tbody>'+data.customers.map(c=>'<tr><td>'+safe(c.name)+'<small>'+safe(c.address)+'</small></td><td>'+safe(c.contact)+'<small>'+safe(c.phone)+' · '+safe(c.email)+'</small></td><td>'+safe(c.tin)+'<small>'+safe(c.licence)+'</small></td></tr>').join('')+'</tbody></table></div>';
  $('#demo-customer-form').onsubmit=e=>{e.preventDefault();data.customers.push({...Object.fromEntries(new FormData(e.target)),id:uuid()});saveCommercial(data);renderDemoCommercial('customers');};
 }else{
  $('#breadcrumb').textContent='Wholesale prices';$('#heading').textContent='Wholesale prices';$('#subtitle').textContent='';
  $('#stats').hidden=true;$('#toolbar').hidden=true;$('.intro .actions').hidden=true;$('.intro small').hidden=true;$('#notice').hidden=true;
  $('#content').innerHTML='<div class="section-body"><h3>Set wholesale price</h3><form id="demo-price-form" class="demo-commercial-form"><label>Medicine *<select name="medicineId" required><option value="">Select medicine</option>'+(state.medicines||[]).map(m=>'<option value="'+safe(m.id)+'">'+safe(m.brand)+' / '+safe(m.generic)+' '+safe(m.strength)+'</option>').join('')+'</select></label><label>Price per smallest unit (UGX) *<input name="price" type="number" min="0" step="0.01" required></label><label>Minimum quantity *<input name="minimum" type="number" min="1" step="1" value="1" required></label><button>Save wholesale price</button></form></div><h3>Saved wholesale prices</h3><div class="demo-table"><table><thead><tr><th>Medicine</th><th>Wholesale price</th><th>Minimum quantity</th></tr></thead><tbody>'+data.prices.map(p=>{const m=(state.medicines||[]).find(m=>m.id===p.medicineId);return '<tr><td>'+safe(m?.brand||'Medicine')+' / '+safe(m?.generic||'')+' '+safe(m?.strength||'')+'</td><td>'+moneyDemo(p.price)+'</td><td>'+Number(p.minimum).toLocaleString()+'</td></tr>';}).join('')+'</tbody></table></div>';
  $('#demo-price-form').onsubmit=e=>{e.preventDefault();const v=Object.fromEntries(new FormData(e.target));const m=data.prices.find(x=>x.medicineId===v.medicineId);if(m){m.price=Number(v.price);m.minimum=Number(v.minimum);}else data.prices.push({medicineId:v.medicineId,price:Number(v.price),minimum:Number(v.minimum)});saveCommercial(data);renderDemoCommercial('tradeprices');};
 }
}
function demoOverview(){
 const branches=active==='all'?directory.branches:[branch(active)];
 const items=branches.map(b=>{const d=b.id===active&&active!=='all'?state:readState(b.id);return {b,d,units:leftUnits(d),value:stockValue(d),sales:(d.sales||[]).reduce((n,x)=>n+Number(x.total||0),0)};});
 const sum=k=>items.reduce((n,x)=>n+x[k],0);
 const metrics=[['Branches',items.length],['Saleable units',sum('units').toLocaleString()],['Stock value',moneyDemo(sum('value'))],['Recorded sales',moneyDemo(sum('sales'))]];
 const grid='<div class="demo-branch-grid">'+metrics.map(x=>'<section class="demo-branch-card">'+safe(x[0])+'<b>'+safe(x[1])+'</b></section>').join('')+'</div>';
 const summary='<h3>Branches</h3><div class="demo-table"><table><thead><tr><th>Branch</th><th>Medicines</th><th>Saleable units</th><th>Stock value</th><th>Sales</th></tr></thead><tbody>'+items.map(x=>'<tr><td>'+safe(x.b.name)+'</td><td>'+(x.d.medicines||[]).length+'</td><td>'+x.units+'</td><td>'+moneyDemo(x.value)+'</td><td>'+moneyDemo(x.sales)+'</td></tr>').join('')+'</tbody></table></div>';
 const stock='<h3>Inventory</h3><div class="demo-table"><table><thead><tr><th>Branch</th><th>Brand</th><th>Generic / strength</th><th>Available</th></tr></thead><tbody>'+items.flatMap(x=>(x.d.medicines||[]).map(m=>'<tr><td>'+safe(x.b.name)+'</td><td>'+safe(m.brand)+'</td><td>'+safe(m.generic)+' '+safe(m.strength)+'</td><td>'+P.available(m,x.d.batches||[],today(),x.d.sales||[],x.d.adjustments||[])+' '+safe(m.unit)+'</td></tr>')).join('')+'</tbody></table></div>';
 return grid+summary+stock;
}
render=function(){if(tab==='customers'||tab==='tradeprices'){renderDemoCommercial(tab);return;}if(tab!=='overview')return originalRender();
 tab='catalogue';originalRender();tab='overview';
 document.querySelectorAll('aside nav [data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab==='overview'));
 $('#breadcrumb').textContent='Overview';$('#heading').textContent='Overview';$('#subtitle').textContent='';
 $('.intro .actions').hidden=true;$('.intro small').hidden=true;$('#notice').hidden=true;
 $('#stats').hidden=true;$('#toolbar').hidden=true;$('#content').innerHTML=demoOverview();
};
const oldGo=go;
go=function(n){if(active==='all'&&n!=='overview')return;if(n==='customers'||n==='tradeprices'){tab=n;document.querySelectorAll('aside nav [data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===n));renderDemoCommercial(n);return;}if(n!=='overview')return oldGo(n);oldGo('catalogue');tab='overview';render();};
// Normalize older demo builds that may already contain branch controls.
document.querySelectorAll('#demo-branch-switch').forEach((el,i)=>{if(i>0)el.closest('label')?.remove();});
document.querySelectorAll('#demo-manage-branches').forEach((el,i)=>{if(i>0)el.remove();});
const headerTools=document.querySelector('header .header-tools');
if(!document.getElementById('demo-branch-switch')){
 const controls='<label class="demo-branch-label">Branch <select id="demo-branch-switch"></select></label><button type="button" class="secondary" id="demo-manage-branches">Manage branches</button>';
 headerTools.insertAdjacentHTML('afterbegin',controls);
}
const overviewButtons=[...document.querySelectorAll('aside nav [data-tab="overview"]')];
overviewButtons.slice(1).forEach(el=>el.remove());
if(!overviewButtons.length)document.querySelector('aside nav').insertAdjacentHTML('afterbegin','<button type="button" data-tab="overview">◫ &nbsp; Overview</button>');
document.querySelector('aside nav [data-tab="overview"]').onclick=()=>go('overview');
// Keep the wholesale tools together at the bottom of the sidebar.
const nav=document.querySelector('aside nav');
for(const [tabId,label] of [['customers','Business customers'],['tradeprices','Wholesale prices']]){
 let item=nav.querySelector('[data-tab="'+tabId+'"]');
 if(!item){item=document.createElement('button');item.type='button';item.dataset.tab=tabId;item.textContent=label;nav.append(item);}
 item.onclick=()=>go(tabId);
}
const settings=nav.querySelector('[data-tab="backup"]');
const customers=nav.querySelector('[data-tab="customers"]'),prices=nav.querySelector('[data-tab="tradeprices"]');
if(settings){settings.before(customers);settings.before(prices);}
const css=[
'.demo-branch-label{display:flex;align-items:center;gap:6px;font-size:12px}',
'#demo-branch-switch{max-width:180px;padding:8px;border:1px solid #cbd0d3;border-radius:8px}',
'.demo-branch-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:12px;margin:10px 0 23px}',
'.demo-branch-card{background:white;border:1px solid #e2e4e5;border-radius:12px;padding:16px;font-size:12px}',
'.demo-branch-card b{display:block;margin-top:8px;font-size:22px}',
'.demo-table{overflow-x:auto;margin:12px 0 20px}',
'.demo-table table{width:100%;border-collapse:collapse;background:white;font-size:12px}',
'.demo-table td,.demo-table th{border-bottom:1px solid #e2e3e4;padding:10px;text-align:left}',
'#demo-branch-dialog{border:1px solid #d8d9dd;border-radius:12px;max-width:480px;width:calc(100vw - 40px);padding:22px}',
'#demo-branch-dialog form{display:grid;gap:10px;margin:10px 0 22px}',
'#demo-branch-dialog label{display:grid;gap:4px;font-size:12px}',
'#demo-branch-dialog input,#demo-branch-dialog select{padding:8px;border:1px solid #d0d2d5;border-radius:6px}',
'#demo-branch-dialog table{border-collapse:collapse;width:100%}',
'#demo-branch-dialog td{border-bottom:1px solid #ddd;padding:7px;font-size:12px}',
'@media(max-width:700px){.demo-branch-label{width:100%;justify-content:space-between}}'
].join('\n');
const commercialCss='.demo-commercial-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;max-width:900px}.demo-commercial-form label{display:grid;gap:5px;font-size:12px}.demo-commercial-form input,.demo-commercial-form select{padding:9px;border:1px solid #ccd0d3;border-radius:7px}.demo-commercial-form button{align-self:end;min-height:36px}';const style=document.createElement('style');style.textContent=css+'\n'+commercialCss;document.head.append(style);
document.body.insertAdjacentHTML('beforeend',
'<dialog id="demo-branch-dialog"><div style="display:flex;align-items:center;justify-content:space-between"><h2>Branches</h2><button id="demo-branch-close">Close</button></div>'+
'<form id="demo-branch-add"><h3>New branch</h3><label>Branch name<input name="name" maxlength="100" required></label><label>Code<input name="code" maxlength="20" required></label><label>Address<input name="address" maxlength="300"></label><button>Add branch</button></form>'+
'<form id="demo-staff-add"><h3>Employee assignment</h3><label>Employee<input name="name" required maxlength="100"></label><label>Email<input name="email" type="email" required></label><label>Branch<select name="branch" id="demo-staff-options"></select></label><label>Role<select name="role"><option>Manager</option><option>Pharmacist</option><option>Dispenser</option><option>Cashier</option><option>Stock clerk</option><option>Viewer</option><option>Stock manager</option></select></label><button>Assign employee</button></form><div id="demo-staff-list"></div></dialog>');
function updateChoices(){
 $('#demo-branch-switch').innerHTML='<option value="all">All branches</option>'+directory.branches.map(b=>'<option value="'+safe(b.id)+'">'+safe(b.name)+' ('+safe(b.code)+')</option>').join('');
 $('#demo-branch-switch').value=active;
 $('#demo-staff-options').innerHTML=directory.branches.map(b=>'<option value="'+safe(b.id)+'">'+safe(b.name)+'</option>').join('');
 document.querySelectorAll('aside nav [data-tab]').forEach(b=>b.disabled=active==='all'&&b.dataset.tab!=='overview');
 $('#quick-checkout').disabled=active==='all';
}
function switchBranch(id){
 if(id===active)return;
 if(cart.length&&!confirm('Switch branches and clear your basket?')){$('#demo-branch-switch').value=active;return;}
 // Save the branch being left before changing the in-memory workspace.
 if(active!=='all')localStorage.setItem(stockKey(active),JSON.stringify(state));
 cart=[];saleToken=uuid();
 if(id!=='all'){
  const data=readState(id);
  state={...P.validateBackup({app:'retail-pharmacy-offline',version:13,data}),revision:data.revision||0};
  window.DEMO_BRANCH=branch(id);
 }
 active=id;sessionStorage.setItem(activeKey,id);updateChoices();go('overview');
}
$('#demo-branch-switch').onchange=e=>switchBranch(e.target.value);
$('#demo-manage-branches').onclick=()=>{$('#demo-branch-dialog').showModal();renderStaff();};
$('#demo-branch-close').onclick=()=>$('#demo-branch-dialog').close();
$('#demo-branch-add').onsubmit=e=>{
 e.preventDefault();const d=Object.fromEntries(new FormData(e.target));
 const code=d.code.trim().toUpperCase();
 if(!/^[A-Z0-9-]{2,20}$/.test(code)||directory.branches.some(b=>b.code===code)){alert('Choose a unique branch code.');return;}
 const id=uuid();directory.branches.push({id,name:d.name.trim(),code,address:d.address.trim()});storeDir();updateChoices();switchBranch(id);e.target.reset();$('#demo-branch-dialog').close();
};
$('#demo-staff-add').onsubmit=e=>{
 e.preventDefault();const d=Object.fromEntries(new FormData(e.target));
 directory.staff.push({...d,id:uuid()});storeDir();e.target.reset();renderStaff();
};
function renderStaff(){
 $('#demo-staff-list').innerHTML='<table><tbody>'+directory.staff.map((x,i)=>'<tr><td>'+safe(x.name)+'<small>'+safe(x.email)+'</small></td><td>'+safe(branch(x.branch)?.name)+'</td><td>'+safe(x.role)+'</td><td><button data-demostaff="'+i+'">Remove</button></td></tr>').join('')+'</tbody></table>';
 document.querySelectorAll('[data-demostaff]').forEach(b=>b.onclick=()=>{directory.staff.splice(Number(b.dataset.demostaff),1);storeDir();renderStaff();});
}
const oldReceipt=showReceipt;
showReceipt=function(id){const result=oldReceipt(id),b=branch(active)||main;const p=document.createElement('p');p.style.cssText='font-size:12px;font-weight:600;margin:7px 0';p.textContent='Branch: '+b.name+' ('+b.code+')';($('#receipt-content').querySelector('.receipt-head')||$('#receipt-content')).prepend(p);return result;};
const oldInvoice=showInvoice;
showInvoice=function(id){const result=oldInvoice(id),b=branch(active)||main;const p=document.createElement('p');p.style.cssText='font-size:12px;font-weight:600;margin:7px 0';p.textContent='Branch: '+b.name+' ('+b.code+')';$('#receipt-content').prepend(p);return result;};
if(active!=='MAIN'){const desired=active;active='MAIN';switchBranch(desired);}else{window.DEMO_BRANCH=main;updateChoices();go('overview');}
})();
