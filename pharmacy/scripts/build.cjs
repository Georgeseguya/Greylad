const fs=require('fs'),path=require('path'),acorn=require('acorn'),{execFileSync}=require('child_process');
const root=path.resolve(__dirname,'..');const read=p=>fs.readFileSync(path.join(root,p),'utf8'),write=(p,s)=>fs.writeFileSync(path.join(root,p),s);
let ui=read('scripts/ui.js');
const ast=acorn.parse(ui,{ecmaVersion:'latest'});let edits=[];
const removeFns=new Set(['loadDemo','approvalExample','loadApproval','persistAccounts','renderAccountReports','savePharmacySettings']);
const replacement={
persist:`async function persist(next,expected=state.revision){if(!window.pendingCommands.length)throw Error('This action is not available online.');const commands=structuredClone(window.pendingCommands);for(const c of commands){if(c.name==='receiveFromSupplier')c.args[4]=next.batches.at(-1).id;if(c.name==='receiveOrder')c.args[5]=next.batches.at(-1).id;}const result=await parent.Live.command(commands,expected);state=result.state;window.pendingCommands=[];}`,
renderBackup:`function renderBackup(){$('#content').innerHTML='<div class="section-body"><h2>'+esc(state.settings.pharmacyName)+'</h2><p>Pharmacy reference: '+esc(state.settings.pharmacyId)+'</p><p>Contact your platform administrator to change your pharmacy name or approved accounts.</p><button id="download-backup">Export records</button><p id="email-status" class="note">Email delivery is awaiting setup.</p></div>';$('#download-backup').hidden=!allowed('backup.export');$('#download-backup').onclick=backup;}`,
renderAccounts:`function renderAccounts(){const u=activeAccount();$('#content').innerHTML='<div class="section-body"><h2>'+esc(u.name)+'</h2><p>'+esc(u.designation)+' · '+esc(u.role)+'</p><button id="sign-out" class="secondary">Sign out</button></div>';$('#sign-out').onclick=()=>parent.Live.logout();if(allowed('accounts')){$('#content').insertAdjacentHTML('beforeend',table(['NAME / USERNAME','DESIGNATION','ROLE / STATUS',''],state.access.accounts.map(a=>'<tr><td>'+esc(a.name)+'<small>'+esc(a.username)+'</small></td><td>'+esc(a.designation)+'</td><td>'+esc(a.role)+'<small>'+esc(a.status)+'</small></td><td>'+(!A.privileged(a.role)&&a.id!==u.id?'<button data-account-edit="'+esc(a.id)+'">Change access</button>':'Platform-managed')+'</td></tr>')));document.querySelectorAll('[data-account-edit]').forEach(b=>b.onclick=()=>editAccess(b.dataset.accountEdit));}}`,
editAccess:`function editAccess(id){const a=state.access.accounts.find(a=>a.id===id);$('#access-title').textContent='Change access · '+a.username;$('#access-fields').innerHTML=field('Designation *','designation','text',a.designation,'required maxlength="100"')+cSelect('Role','role',A.staffRoles,a.role)+cSelect('Status','status',['Active','Suspended'],a.status)+field('Reason *','reason','text','','required maxlength="500"');$('#access-error').textContent='';$('#access-form').onsubmit=async e=>{e.preventDefault();try{const d=Object.fromEntries(new FormData(e.target));const r=await parent.Live.request({action:'changeMember',targetId:id,...d,requestId:crypto.randomUUID()});state=r.state;$('#access-dialog').close();render();toast('Access updated.');}catch(e){$('#access-error').textContent=e.message;}};$('#access-dialog').showModal();}`
};
for(const n of ast.body){const s=ui.slice(n.start,n.end);if(n.type==='FunctionDeclaration'&&removeFns.has(n.id.name))edits.push([n.start,n.end,'']);else if(n.type==='FunctionDeclaration'&&replacement[n.id.name])edits.push([n.start,n.end,replacement[n.id.name]]);else if((n.type==='TryStatement'&&s.includes('localStorage.getItem'))||s.startsWith("$('#restore-file').onchange")||s.startsWith("$('#approval-file').onchange")||s.startsWith('const originalRestore=')||s.startsWith('const oldPersist=')||s.startsWith('persist=function')||s.startsWith("window.addEventListener('storage'")||s.startsWith("if(state.access)go('accounts')"))edits.push([n.start,n.end,'']);}
for(const [start,end,s] of edits.sort((a,b)=>b[0]-a[0]))ui=ui.slice(0,start)+s+ui.slice(end);
ui=ui.replace("const demoMode=new URLSearchParams(location.search).get('demo')==='1';","const demoMode=false;")
.replace(/let state=\{access:null,patients:.*?},tab='catalogue'/,"let state=window.BOOT.state,tab='overview'")
.replace('let accountSession=null,','let accountSession=window.BOOT.accountId,')
.replace("const labels={accounts:","const labels={tradeprices:['Wholesale prices','Wholesale prices',''],overview:['Overview','Overview',''],customers:['Business customers','Business customers',''],accounts:")
.replace("if(tab==='catalogue')$('#content')","if(tab==='tradeprices')renderTradePrices();else if(tab==='overview')renderOverview();else if(tab==='customers')renderCustomers();else if(tab==='catalogue')$('#content')")
.replace("$('#stats').hidden=tab!=='catalogue'","$('#stats').hidden=!['catalogue','overview'].includes(tab)")
.replace("confirmed:$('#payment-confirmed')?.checked||false","confirmed:$('#payment-confirmed')?.checked||false,customerId:checkoutCustomer")
.replace("P.createInvoice(state,cart,d,today()","P.createInvoice(state,cart,{...d,customerId:checkoutCustomer},today()")
.replaceAll('Orders are saved locally and do not contact suppliers or add stock.','Orders do not contact suppliers or add stock.')
.replaceAll('Purchase order saved locally. No stock added yet.','Purchase order saved.')
.replaceAll('Account preview automatically supplies the recorder identity. ','')
.replaceAll('account preview','your account');
write('scripts/generated-ui.js',ui);execFileSync(process.execPath,[path.join(__dirname,'async-ui.cjs'),path.join(__dirname,'generated-ui.js')]);
let html=read('scripts/base.html').replace(/<!--[\s\S]*?-->/g,'').replace(/<script[^>]*>[\s\S]*?<\/script>/g,'');
html=html.replace(/<meta name="description"[^>]*>/,'<meta name="description" content="Greylad Pharmacy workspace">');
html=html.replace(/<title>.*?<\/title>/,'<title>Greylad Pharmacy</title>').replace(/VERSION 0\.20/g,'GREYLAD PHARMACY').replace(/Version 0\.20/g,'Greylad Pharmacy').replace('OFFLINE · VERSION 0.20','ONLINE · VERSION 1.0').replace('Offline · UGX','Online · UGX').replace('Offline prototype · Records stay in this browser. Export a backup before replacing or moving this file. Use one tab at a time.','Connected workspace. Changes are saved to your pharmacy account.');
html=html.replace('<nav','<nav'); // Preserve the tested responsive shell.
html=html.replace(/(<nav[^>]*>)/,'$1<button data-tab="overview">Overview</button>');
// Keep wholesale tools together at the bottom of the sidebar, immediately before Settings.
html=html.replace(/(<button data-tab="backup"[^>]*>)/,'<button data-tab="customers">Business customers</button><button data-tab="tradeprices">Wholesale prices</button>$1');
html=html.replace(/<input[^>]*id="restore-file"[^>]*>/,'');
// Public workspace markup is inert until a verified session supplies BOOT.
const scripts=['server/pack-core.js','server/access.js','server/core.js','server/commands.js','scripts/bridge.js','scripts/generated-ui.js','scripts/pack-ui.js','scripts/live-ui.js','scripts/theme-ui.js','scripts/receipt-print.js','scripts/release-ui.js'];
html=html.replace('</head>','<style>'+read('scripts/live.css')+'</style></head>');
html=html.replace('</body>',scripts.map(p=>'<script>'+read(p).replace(/<\/script/gi,'<\\/script')+'</script>').join('\n')+"<script>go('overview');</script></body>");
write('public/workspace.html',html);
for(const name of ['pack-core.js','access.js','core.js','commands.js'])write('supabase/functions/pharmacy-api/'+name,read('server/'+name));
const config={apiUrl:process.env.PHARMACY_API_URL||'',siteUrl:'https://greyladpharmacy.vercel.app'};write('public/config.js','window.PHARMACY_CONFIG='+JSON.stringify(config)+';\n');
console.log('Built production workspace and Edge function. Backend '+(config.apiUrl?'configured.':'awaiting separate Supabase project.'));
