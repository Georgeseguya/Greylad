const fs=require('fs'),acorn=require('acorn'),walk=require('acorn-walk');
const path=process.argv[2],s=fs.readFileSync(path,'utf8'),ast=acorn.parse(s,{ecmaVersion:'latest'}),edits=[],marked=new Set();
walk.ancestor(ast,{CallExpression(n,a){if(n.callee.type!=='Identifier'||!['persist','oldPersist','persistAccounts'].includes(n.callee.name))return;const parent=a.at(-2);if(parent.type!=='AwaitExpression')edits.push([n.start,'await ']);const f=[...a].reverse().find(n=>['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(n.type));if(f&&!f.async&&!marked.has(f.start)){marked.add(f.start);edits.push([f.start,'async ']);}}});
let out=s;for(const [i,v] of edits.sort((a,b)=>b[0]-a[0]))out=out.slice(0,i)+v+out.slice(i);fs.writeFileSync(path,out);
