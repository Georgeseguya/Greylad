/* Printer preferences belong to this device, not the pharmacy stock ledger. */
(()=>{
 const preferenceKey=demoMode?'retail-pharmacy-demo-paper-v1':'retail-pharmacy-receipt-paper-v1', sizes=['80','58','a4'];
 let preferred='80',kind='document';
 try{const saved=localStorage.getItem(preferenceKey);if(sizes.includes(saved))preferred=saved;}catch(_){}
 const options='<option value="80">80 mm thermal roll</option><option value="58">58 mm thermal roll</option><option value="a4">A4 paper</option>';
 const instructions='Choose the same roll width in your printer settings. Use portrait, 100% scale, no margins, and turn browser headers and footers off. Roll length and paper cutting are controlled by the printer driver. This choice is saved on this device only.';
 const controls=document.createElement('div');controls.className='receipt-print-controls';controls.innerHTML='<label for="receipt-paper">Receipt paper</label><select id="receipt-paper">'+options+'</select><p id="receipt-print-help"></p>';
 $('#receipt').prepend(controls);
 const pageStyle=document.createElement('style');pageStyle.id='receipt-page-style';document.head.append(pageStyle);
 function apply(size){
  const chosen=kind==='sale'&&sizes.includes(size)?size:'a4';
  $('#receipt').dataset.paper=chosen;
  $('#receipt-paper').value=chosen;
  pageStyle.textContent='@media print{@page{size:'+(chosen==='a4'?'A4;margin:14mm':'auto;margin:0')+'}}';
  $('#receipt-print-help').textContent=chosen==='a4'?'A4 layout. Select A4 paper in the print dialog.':instructions;
 }
 function remember(size){if(!sizes.includes(size))return false;preferred=size;try{localStorage.setItem(preferenceKey,size);return true;}catch(_){toast('Paper size selected, but this browser could not save the preference.');return false;}}
 $('#receipt-paper').onchange=e=>{remember(e.target.value);apply(preferred);};
 function prepare(type){kind=type;controls.hidden=type!=='sale';
  if(type==='sale')for(const row of $('#receipt-content').querySelectorAll('tbody tr')){
   [...row.cells].forEach((cell,i)=>{cell.dataset.receiptLabel=['Medicine','Batch','Quantity','Unit price','Total'][i]||'';});
  }
  apply(type==='sale'?preferred:'a4');$('#receipt').scrollTop=0;
 }
 function addBranch(kind,id){
 const record=(kind==='sale'?state.sales:state.invoices).find(x=>x.id===id)||{};
 const branch=record.branchName||window.BOOT?.branch?.name;
 const code=record.branchCode||window.BOOT?.branch?.code;
 if(!branch)return;
 const holder=$('#receipt-content'),heading=holder.querySelector('.receipt-head')||holder;
 const p=document.createElement('p');p.style.cssText='font-size:11px;margin:5px 0;font-weight:600';
 p.textContent='Branch: '+branch+(code?' ('+code+')':'');
 heading.prepend(p);
}
const oldSale=showReceipt;showReceipt=function(...args){const result=oldSale(...args);addBranch('sale',args[0]);prepare('sale');return result;};
 const oldInvoice=showInvoice;showInvoice=function(...args){const result=oldInvoice(...args);addBranch('invoice',args[0]);prepare('document');return result;};
 const oldClosing=showClosing;showClosing=function(...args){const result=oldClosing(...args);prepare('document');return result;};
 const oldRx=printRx;printRx=function(...args){const result=oldRx(...args);prepare('document');return result;};
 const oldSettings=renderBackup;renderBackup=function(...args){const result=oldSettings(...args);
  const section=document.createElement('section');section.className='section-body receipt-settings';section.innerHTML='<h2>Receipt printing</h2><label for="default-receipt-paper">Default receipt paper</label><select id="default-receipt-paper">'+options+'</select><p>'+instructions+'</p><p>80 mm prints within a 72 mm content area; 58 mm uses 48 mm. Invoices, prescriptions and cash-closing reports keep their A4 layout.</p>';
  $('#content').insertBefore(section,$('#content .maker-signature'));$('#default-receipt-paper').value=preferred;
  $('#default-receipt-paper').onchange=e=>{if(remember(e.target.value))toast('Receipt paper preference saved on this device.');};return result;
 };
 window.onbeforeprint=()=>{if($('#receipt').open){apply($('#receipt-paper').value);document.body.classList.add('printing');}};
 window.onafterprint=()=>document.body.classList.remove('printing');
 $('#print-receipt').onclick=()=>{if(!$('#receipt').open)return;apply($('#receipt-paper').value);document.body.classList.add('printing');try{window.print();}catch(e){document.body.classList.remove('printing');toast('Could not open printing. Try your browser’s Print menu.');}};
 $('#receipt').addEventListener('close',()=>document.body.classList.remove('printing'));
 apply('a4');
})();
