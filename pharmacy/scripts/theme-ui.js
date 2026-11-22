/* Navigation and dialog behaviour for the offline shell. */
(()=>{
 const dock=document.createElement('nav');dock.className='mobile-dock';dock.setAttribute('aria-label','Frequent pages');
 for(const [id,label] of [['catalogue','Medicines'],['checkout','Checkout'],['batches','Inventory'],['alerts','Alerts']]){const b=document.createElement('button');b.type='button';b.dataset.tab=id;b.textContent=label;b.onclick=()=>go(id);dock.append(b);}
 const more=document.createElement('button');more.type='button';more.textContent='More';more.setAttribute('aria-haspopup','dialog');dock.append(more);document.body.append(dock);
 const sheet=document.createElement('dialog');sheet.id='navigation-dialog';sheet.setAttribute('aria-labelledby','navigation-title');sheet.innerHTML='<div class="modal-head"><h2 id="navigation-title">All pages</h2><button type="button" class="close" aria-label="Close navigation">×</button></div><div id="navigation-items"></div>';
 document.body.append(sheet);sheet.querySelector('.close').onclick=()=>sheet.close();
 for(const source of document.querySelectorAll('aside nav [data-tab]')){const b=source.cloneNode(true);b.onclick=()=>{sheet.close();go(b.dataset.tab);};sheet.querySelector('#navigation-items').append(b);}
 more.onclick=()=>{applyAccessUI();sheet.showModal();};sheet.addEventListener('close',()=>more.focus());
 const sync=()=>{document.body.classList.toggle('modal-open',!!document.querySelector('dialog[open]'));document.querySelectorAll('[data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===tab);if(b.dataset.tab===tab)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});};
 new MutationObserver(sync).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
 const oldGo=go;go=function(...args){const result=oldGo(...args);sync();return result;};
 sync();applyAccessUI();
})();
