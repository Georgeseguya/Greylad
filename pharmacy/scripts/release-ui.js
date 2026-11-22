(()=>{
 function labelTables(){for(const table of document.querySelectorAll('#content table')){const heads=[...table.querySelectorAll(':scope>thead th')].map(th=>th.textContent.trim());table.classList.toggle('wide-table',heads.length>7);table.classList.toggle('catalogue-table',tab==='catalogue');for(const row of table.querySelectorAll(':scope>tbody>tr'))[...row.cells].forEach((cell,i)=>{const label=heads[i]||'Actions';if(cell.dataset.label!==label)cell.dataset.label=label;});}}
 new MutationObserver(labelTables).observe($('#content'),{childList:true,subtree:true});labelTables();
})();
