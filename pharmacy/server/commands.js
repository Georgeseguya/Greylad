(function(root){
'use strict';
const P=root.Pharmacy,A=root.Access;
const clone=x=>structuredClone(x),need=(ok,msg)=>{if(!ok)throw Error(msg);};
const specs={validateMedicine:['catalogue.write','medicines'],validateSupplier:['procurement','suppliers'],validateEmployee:['staff','employees'],receiveFromSupplier:['receive','batches'],receiveOrder:['receive','batches'],purchaseOrder:['procurement','purchaseOrders'],sale:['sell','sales'],adjust:['adjust','adjustments'],editRecord:['edit'],blockAction:['block'],createInvoice:['sell','invoices'],settleInvoice:['sell'],cancelInvoice:['invoice.cancel'],cashMovement:['finance','cashMovements'],closingRecord:['finance','closings'],startStocktake:['adjust','stocktakes'],updateStocktake:['adjust'],postStocktake:['adjust'],cancelStocktake:['adjust'],clinicalChange:['clinical']};
function empty(name,id){return {access:null,...Object.fromEntries(A.collections.map(k=>[k,[]])),customers:[],tradePrices:[],settings:{pharmacyName:name,pharmacyId:id},revision:0};}
function check(u,right){need(u&&u.status==='Active'&&(u.role==='Admin'||A.rights[u.role]?.includes(right)),'Your account cannot perform this action.');}
const identity=(u,reason)=>({name:u.name,role:u.role,reason:reason||''});
function run(state,commands,u,at=new Date().toISOString()){
 need(u?.pharmacyId===state.settings.pharmacyId,'Pharmacy access denied.');need(Array.isArray(commands)&&commands.length>=1&&commands.length<=2,'Invalid action.');
 if(commands.length===2)need(commands[0].name==='updateStocktake'&&commands[1].name==='postStocktake'&&commands[0].args[1]===commands[1].args[1],'Only one action may be saved at a time.');
 let n=clone(state);const day=new Date(Date.parse(at)+10800000).toISOString().slice(0,10);
 for(const cmd of commands){let a=clone(cmd.args||[]),r;if(cmd.name==='customer'){
 check(u,'sell');const d=a[0]||{};need(typeof d.id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(d.id),'Invalid customer reference.');
 for(const k of ['name','contact','phone','email','address','tin','licence'])need(typeof d[k]==='string'&&d[k].length<=200,'Invalid customer details.');need(d.name.trim(),'Enter a business name.');
 const old=n.customers.find(c=>c.id===d.id);if(old)need(typeof d.reason==='string'&&d.reason.trim().length>0&&d.reason.length<=500,'Explain the correction.');
 const record=Object.fromEntries(['id','name','contact','phone','email','address','tin','licence'].map(k=>[k,d[k].trim()]));Object.assign(record,{pharmacyId:u.pharmacyId,changedBy:u.id,changedAt:at,history:[...(old?.history||[]),{at,by:u.id,reason:d.reason||'Created',before:old?Object.fromEntries(['name','contact','phone','email','address','tin','licence'].map(k=>[k,old[k]])):null}]});if(old)n.customers[n.customers.indexOf(old)]=record;else n.customers.push(record);continue;
 }
 if(cmd.name==='tradePrice'){
 check(u,'catalogue.write');const d=a[0],m=n.medicines.find(m=>m.id===d.medicineId);need(m,'Medicine not found.');need(Number.isFinite(d.price)&&d.price>=0&&d.price<=1e12&&Math.abs(d.price*100-Math.round(d.price*100))<.001&&Number.isSafeInteger(d.minimum)&&d.minimum>=1,'Enter a price and minimum whole units.');need(typeof d.reason==='string'&&d.reason.trim().length>0&&d.reason.length<=500,'Explain the price change.');n.events.push({id:crypto.randomUUID(),action:'Wholesale price changed',medicineId:m.id,before:{price:m.wholesalePrice??null,minimum:m.wholesaleMinimum??null},after:{price:d.price,minimum:d.minimum},reason:d.reason,recordedBy:u.name,recordedAccountId:u.id,pharmacyId:u.pharmacyId,at});m.wholesalePrice=d.price;m.wholesaleMinimum=d.minimum;continue;
 }
 const spec=specs[cmd.name];need(spec,'Unknown action.');let right=spec[0];if(cmd.name==='editRecord'&&a[1]==='medicine'&&A.rights[u.role]?.includes('medicine.edit'))right='medicine.edit';check(u,right);
 switch(cmd.name){
 case 'validateMedicine': r=P.validateMedicine(a[0],n.medicines);break;
 case 'validateSupplier': r=P.validateSupplier(a[0],n.suppliers);break;
 case 'validateEmployee':r=P.validateEmployee(a[0],n.employees);break;
 case 'receiveFromSupplier':r=P.receiveFromSupplier(n,a[1],a[2],day);r.id=a[4];break;
 case 'receiveOrder':r=P.receiveOrder(n,a[1],a[2],a[3],day);r.id=a[5];break;
 case 'purchaseOrder':r=P.purchaseOrder(n,a[1],day);break;
 case 'sale':r=P.sale(n,a[1],a[2],day,a[4],at);break;
 case 'adjust':r=P.adjust(n,{...a[1],recordedBy:u.name},day,a[3],at);break;
 case 'editRecord':n=P.editRecord(n,a[1],a[2],a[3],identity(u,a[4]?.reason),day,at,a[7]);break;
 case 'blockAction':n=P.blockAction(n,{...a[1],...identity(u,a[1]?.reason)},day,at,a[4]);break;
 case 'createInvoice':r=P.createInvoice(n,a[1],{...a[2],recordedBy:u.name},day,a[4],at);break;
 case 'settleInvoice':n=P.settleInvoice(n,a[1],a[2],day,a[4],at);break;
 case 'cancelInvoice':n=P.cancelInvoice(n,a[1],identity(u,a[2]?.reason),at);break;
 case 'cashMovement':r=P.cashMovement(n,{...a[1],recordedBy:u.name},day,a[3],at);break;
 case 'closingRecord':r=P.closingRecord(n,{...a[1],recordedBy:u.name},day,a[3],at);break;
 case 'startStocktake':r=P.startStocktake(n,{...a[1],...identity(u)},day,a[3],at);break;
 case 'updateStocktake':n=P.updateStocktake(n,a[1],a[2],identity(u),at);break;
 case 'postStocktake':n=P.postStocktake(n,a[1],identity(u),day,at);break;
 case 'cancelStocktake':n=P.cancelStocktake(n,a[1],identity(u,a[2]?.reason),at);break;
 case 'clinicalChange':n=P.clinicalChange(n,a[1],{...a[2],actor:u.name},day,a[4],at);break;
 }
 if(r){need(typeof r.id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(r.id),'Invalid record reference.');need(!n[spec[1]].some(x=>x.id===r.id),'This record is already saved.');if(spec[1]==='batches'){need(!n.batches.some(x=>x.medicineId===r.medicineId&&P.norm(x.batch)===P.norm(r.batch)&&P.norm(x.invoice)===P.norm(r.invoice)&&x.supplierId===r.supplierId),'This delivery is already recorded.');need(!n.batches.some(x=>x.medicineId===r.medicineId&&P.norm(x.batch)===P.norm(r.batch)&&x.expiry!==r.expiry),'The batch has a different expiry date.');}n[spec[1]].push(r);}
 }
 // Only server-generated records are committed. Client state, totals and actor identities are never accepted.
 for(const k of A.collections){const before=new Map((state[k]||[]).map(r=>[r.id,r]));for(const r of n[k]||[]){if(JSON.stringify(before.get(r.id))!==JSON.stringify(r)){r.pharmacyId=u.pharmacyId;r.recordedAccountId=u.id;if(!before.has(r.id)){r.recordedBy=u.name;r.recordedRole=u.role;r.recordedAt=at;}else{r.lastChangedAccountId=u.id;r.lastChangedBy=u.name;r.lastChangedAt=at;}}}}
 const valid=P.validateBackup({app:'retail-pharmacy-offline',version:13,data:{...n,access:null}});return {...valid,customers:n.customers||[],tradePrices:n.tradePrices||[],revision:state.revision+1};
}
root.Commands={specs,empty,run,check};if(typeof module!=='undefined')module.exports=root.Commands;
})(typeof window==='undefined'?globalThis:window);
