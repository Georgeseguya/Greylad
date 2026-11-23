const test=require('node:test');
const assert=require('node:assert/strict');
const Access=require('../server/access.js');

function fixture(){
 const roles=Access.roles;
 const accounts=roles.map((role,i)=>({id:'u'+i,pharmacyId:'p1',username:'staff'+i,name:role,designation:role,email:`staff${i}@example.test`,role,status:'Active'}));
 const row=(id)=>[{id}];
 return {settings:{pharmacyId:'p1',pharmacyName:'Test Pharmacy',branchId:'b1',branchName:'Main'},access:{pharmacyId:'p1',pharmacyName:'Test Pharmacy',accounts},
 medicines:row('m'),batches:row('b'),sales:row('s'),adjustments:row('a'),suppliers:row('sup'),purchaseOrders:row('po'),editHistory:row('eh'),employees:row('emp'),blockHistory:row('bh'),invoices:row('i'),cashMovements:row('cm'),closings:row('cl'),stocktakes:row('st'),patients:row('pt'),appointments:row('ap'),consultations:row('co'),prescriptions:row('pr'),events:row('ev'),customers:row('cu'),tradePrices:row('tp')};
}

test('every approved role can export a role-scoped branch backup',()=>{
 const s=fixture();
 for(const account of s.access.accounts){
  const result=Access.backupData(s,account.id);
  assert.equal(result.scope.role,account.role);
  assert.equal(result.scope.branchId,'b1');
  assert.equal(result.data.access,undefined,'backup must not disclose the staff directory');
 }
});

test('Dispenser can run daily pharmacy operations but not restricted manager functions',()=>{
 const s=fixture(),d=s.access.accounts.find(x=>x.role==='Dispenser');
 for(const p of ['stock.read','catalogue.write','medicine.edit','edit','adjust','block','sell','invoice.cancel','clinical','settings','backup.export'])assert.equal(Access.can(s,d.id,p),true,p);
 for(const p of ['receive','procurement','finance','reports','staff','accounts','backup.restore'])assert.equal(Access.can(s,d.id,p),false,p);
});

test('backup exports only records visible to the signed-in role',()=>{
 const s=fixture(),viewer=s.access.accounts.find(x=>x.role==='Viewer'),cashier=s.access.accounts.find(x=>x.role==='Cashier'),manager=s.access.accounts.find(x=>x.role==='Manager');
 const v=Access.backupData(s,viewer.id).data;
 assert.equal(v.medicines.length,1);assert.equal(v.batches.length,1);
 assert.equal(v.sales.length,1,'minimal sales ledger preserves stock balance');assert.equal(v.sales[0].total,undefined);assert.equal(v.sales[0].method,undefined);assert.equal(v.sales[0].lines[0].qty,1);
 for(const k of ['patients','suppliers','cashMovements','employees','prescriptions'])assert.equal(v[k].length,0,k);
 const c=Access.backupData(s,cashier.id).data;
 assert.equal(c.sales.length,1);assert.equal(c.invoices.length,1);assert.equal(c.patients.length,0);assert.equal(c.cashMovements.length,0);
 const m=Access.backupData(s,manager.id).data;
 assert.equal(m.cashMovements.length,1);assert.equal(m.patients.length,1);assert.equal(m.suppliers.length,1);
 assert.equal(Access.can(s,manager.id,'backup.restore'),false);
 const admin=s.access.accounts.find(x=>x.role==='Admin');assert.equal(Access.can(s,admin.id,'backup.restore'),true);
});
