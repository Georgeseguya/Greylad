const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync('public/index.html','utf8');
const client=fs.readFileSync('public/login.js','utf8');
const api=fs.readFileSync('supabase/functions/pharmacy-api/index.ts','utf8');
const demo=fs.readFileSync('demo/branch-demo.js','utf8');
test('owner signup is not exposed and branch selection remains on the pharmacy page',()=>{
 assert.doesNotMatch(html,/Create owner account|id="owner-registration"/);
 assert.match(html,/id="branch-current"/);
 assert.match(html,/id="branch-management"/);
 assert.match(html,/id="all-branches"/);
});
test('server isolates branch records and checks owner access',()=>{
 assert.match(api,/gp_branch_workspaces/);
 assert.match(api,/gp_commit_branch/);
 assert.match(api,/if\(!scope\.owner\)throw new ApiError\('Only the owner/);
 assert.match(api,/if\(scope\.branchId==='all'\)/);
 assert.match(api,/gp_staff_invites/);
});
test('demo maintains separate branch stocks and receipts',()=>{
 assert.match(demo,/gp-demo-branch-stock-/);
 assert.match(demo,/originalPersist/);
 assert.match(demo,/showReceipt=function/);
 assert.match(demo,/branch\(active\)/);
});
test('changing branch does not require signing in again',async()=>{
 const dom=new JSDOM(html,{url:'https://greyladpharmacy.vercel.app/',runScripts:'outside-only'});
 const w=dom.window,branch='11111111-1111-4111-8111-111111111111',calls=[];
 const branches=[{id:branch,name:'Main Branch',code:'MAIN'}];
 w.PHARMACY_CONFIG={apiUrl:'https://example.invalid/pharmacy-api'};
 const response=data=>({ok:true,json:async()=>data});
 w.fetch=async(url,options)=>{
   if(url==='/workspace.html')return {ok:true,text:async()=>'<html><head></head><body></body></html>'};
   const body=JSON.parse(options.body);calls.push(body.action);
   if(body.action==='login')return response({session:{access_token:'test',refresh_token:'refresh',expires_at:4100000000},pharmacyId:branch});
   if(body.action==='workspace')return body.branchId==='all'
     ? response({all:true,isOwner:true,branches,summaries:[{branchId:branch,name:'Main Branch',stockUnits:1,stockValue:1000,revenue:1000}],stockRows:[]})
     : response({state:{revision:0,settings:{pharmacyName:'Pharmacy'},access:{accounts:[]}},branchId:branch,branch:branches[0],branches,isOwner:true});
   throw Error('Unexpected request '+body.action);
 };
 w.eval(client);
 const form=w.document.querySelector('#login-form');
 form.elements.pharmacy.value='greylad-pharmacy';
 form.elements.username.value='george';
 form.elements.password.value='test-only';
 form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 await new Promise(r=>setTimeout(r,20));
 const select=w.document.querySelector('#branch-current');
 assert.equal(select.options.length,2);
 select.value='all';select.dispatchEvent(new w.Event('change',{bubbles:true}));
 await new Promise(r=>setTimeout(r,20));
 assert.equal(w.document.querySelector('#all-branches').hidden,false);
 assert.equal(calls.filter(c=>c==='login').length,1);
 dom.window.close();
});
