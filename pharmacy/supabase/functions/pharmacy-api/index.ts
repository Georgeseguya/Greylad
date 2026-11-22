import './pack-core.js';
import './access.js';
import './core.js';
import './commands.js';
const G=globalThis as any;
const url=Deno.env.get('SUPABASE_URL')!;
const secret=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const pub=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}').default||Deno.env.get('SUPABASE_ANON_KEY');
const site=Deno.env.get('PHARMACY_SITE_URL')||'https://greyladpharmacy.vercel.app';
const headers={'Access-Control-Allow-Origin':site,'Access-Control-Allow-Headers':'authorization, content-type, apikey','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
class ApiError extends Error { constructor(message:string,public status=400){super(message);} }
async function api(path:string,body?:unknown,method?:string,key=secret,token?:string){
 const h:Record<string,string>={apikey:key,'Content-Type':'application/json'};if(token)h.Authorization='Bearer '+token;
 const r=await fetch(url+path,{method:method||(body===undefined?'GET':'POST'),headers:h,body:body===undefined?undefined:JSON.stringify(body)});
 const data=await r.json().catch(()=>null);if(!r.ok)throw new ApiError(data?.message||data?.msg||data?.error_description||'Service unavailable.',r.status===401?401:400);return data;
}
const rest=(path:string,body?:unknown)=>api('/rest/v1/'+path,body);
const member=(m:any)=>({id:m.id,pharmacyId:m.pharmacy_id,userId:m.user_id,username:m.username,name:m.name,email:m.email,role:m.role,designation:m.designation,status:m.status});
async function context(token:string,pid:string){
 if(!/^[a-f0-9-]{36}$/.test(pid||''))throw new ApiError('Sign in to your pharmacy.',401);
 let auth;try{auth=await api('/auth/v1/user',undefined,'GET',pub,token);}catch{throw new ApiError('Your session has expired. Sign in again.',401);}
 const [rows,pharmacies]=await Promise.all([rest('gp_memberships?pharmacy_id=eq.'+pid+'&user_id=eq.'+auth.id+'&status=eq.Active'),rest('gp_pharmacies?id=eq.'+pid+'&active=eq.true')]);
 if(rows.length!==1||pharmacies.length!==1)throw new ApiError('Pharmacy access denied.',403);return {u:member(rows[0]),pharmacy:pharmacies[0]};
}
async function view(u:any,pharmacy:any,data?:any){
 const s=data||((await rest('gp_workspaces?pharmacy_id=eq.'+u.pharmacyId))[0]?.data);
 if(!s)throw new ApiError('Your pharmacy workspace is not ready.',503);
 const may=(p:string)=>u.role==='Admin'||G.Access.rights[u.role]?.includes(p),out=structuredClone(s);
 if(!may('clinical'))for(const k of ['patients','appointments','consultations','prescriptions'])out[k]=[];
 if(!may('staff'))out.employees=[];
 if(!may('finance')){out.cashMovements=[];out.closings=[];}
 if(!may('reports'))out.editHistory=[];
 if(!may('sell')){out.invoices=[];out.customers=[];out.sales=out.sales.map((s:any)=>({id:s.id,order:s.order,date:s.date,lines:s.lines.map((l:any)=>({batchId:l.batchId,qty:l.qty}))}));}
 const members=may('accounts')?(await rest('gp_memberships?pharmacy_id=eq.'+u.pharmacyId)).map(member):[u];
 out.access={pharmacyId:u.pharmacyId,pharmacyName:pharmacy.name,mode:'online',accounts:members,audit:[],emails:[]};
 return {state:out,accountId:u.id};
}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 try{
 if(req.method!=='POST')throw new ApiError('Method not allowed.',405);
 if(req.headers.get('origin')&&req.headers.get('origin')!==site)throw new ApiError('Origin not allowed.',403);
 const raw=await req.text();if(raw.length>2*1024*1024)throw new ApiError('Request too large.',413);
 const b=JSON.parse(raw),action=b.action;
 if(action==='login'){
 const slug=String(b.pharmacy||'').trim().toLowerCase(),username=String(b.username||'').trim().toLowerCase();
 if(!/^[a-z0-9-]{3,80}$/.test(slug)||!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username)||typeof b.password!=='string'||b.password.length>1000)throw new ApiError('Check your pharmacy, username and password.',401);
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(slug+':'+username)))).map(x=>x.toString(16).padStart(2,'0')).join('');
 if(!await rest('rpc/gp_login_attempt',{p_key:digest}))throw new ApiError('Too many sign-in attempts. Try again in 15 minutes.',429);
 const ps=await rest('gp_pharmacies?slug=eq.'+encodeURIComponent(slug)+'&active=eq.true');
 const ms=ps.length?await rest('gp_memberships?pharmacy_id=eq.'+ps[0].id+'&username=eq.'+encodeURIComponent(username)+'&status=eq.Active'):[];
 if(ms.length!==1)throw new ApiError('Check your pharmacy, username and password.',401);
 let session;try{session=await api('/auth/v1/token?grant_type=password',{email:ms[0].email,password:b.password},'POST',pub);}catch{throw new ApiError('Check your pharmacy, username and password.',401);}
 if(session.user.id!==ms[0].user_id)throw new ApiError('Account access denied.',403);
 return Response.json({session:{access_token:session.access_token,refresh_token:session.refresh_token,expires_at:Math.floor(Date.now()/1000)+session.expires_in},pharmacyId:ps[0].id},{headers});
 }
 if(action==='refresh'){
 const session=await api('/auth/v1/token?grant_type=refresh_token',{refresh_token:b.refreshToken},'POST',pub);
 await context(session.access_token,b.pharmacyId);
 return Response.json({session:{access_token:session.access_token,refresh_token:session.refresh_token,expires_at:Math.floor(Date.now()/1000)+session.expires_in}},{headers});
 }
 const token=(req.headers.get('authorization')||'').replace(/^Bearer /,'');const {u,pharmacy}=await context(token,b.pharmacyId);
 if(action==='logout'){await api('/auth/v1/logout?scope=local',{},'POST',pub,token);return Response.json({ok:true},{headers});}
 if(action==='workspace')return Response.json(await view(u,pharmacy),{headers});
 if(action==='changeMember'){
 await rest('rpc/gp_change_member',{p_pharmacy:u.pharmacyId,p_user:u.userId,p_target:b.targetId,p_role:b.role,p_designation:b.designation,p_status:b.status,p_reason:b.reason,p_request:b.requestId});
 return Response.json(await view(u,pharmacy),{headers});
 }
 if(action==='command'){
 const row=(await rest('gp_workspaces?pharmacy_id=eq.'+u.pharmacyId))[0];
 if(!row)throw new ApiError('Workspace not provisioned.',503);
 if(row.revision!==b.revision)throw new ApiError('Records changed. Use Refresh, review your entry and try again.',409);
 const next=G.Commands.run({...row.data,revision:row.revision},b.commands,u);
 await rest('rpc/gp_commit',{p_pharmacy:u.pharmacyId,p_user:u.userId,p_member:u.id,p_role:u.role,p_expected:row.revision,p_data:next,p_request:b.requestId,p_action:b.commands.map((c:any)=>c.name).join(', ')});
 return Response.json(await view(u,pharmacy,next),{headers});
 }
 throw new ApiError('Unknown action.');
 }catch(e){const err=e as Error;return Response.json({error:err.message?.includes('CONFLICT:')?'Records changed. Refresh before saving.':err.message||'The action could not be completed.'},{status:err.message?.includes('CONFLICT:')?409:(e instanceof ApiError?e.status:400),headers});}
});
