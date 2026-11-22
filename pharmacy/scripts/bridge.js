if(!window.BOOT||window.parent===window)location.replace('/');
window.pendingCommands=[];
for(const event of ['click','submit'])document.addEventListener(event,()=>{window.pendingCommands=[];},true);
for(const name of Object.keys(Commands.specs)){
 const original=Pharmacy[name];Pharmacy[name]=function(...args){const result=original(...args);let a=structuredClone(args);
 if(!name.startsWith('validate'))a[0]=null;else a[1]=null;
 // Capture the command only. Never upload the browser's copy of the ledger.
 window.pendingCommands.push({name,args:a});return result;};
}
Access.tabs.overview='stock.read';Access.tabs.customers='sell';
