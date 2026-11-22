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

async function branchScope(u:any){
 const pid=u.pharmacyId;
 const owner=(await rest('gp_owners?pharmacy_id=eq.'+pid+'&user_id=eq.'+u.userId)).length>0;
 const all=await rest('gp_branches?pharmacy_id=eq.'+pid+'&active=eq.true&order=is_primary.desc,created_at.asc');
 const permissions=owner?[]:await rest('gp_branch_access?pharmacy_id=eq.'+pid+'&user_id=eq.'+u.userId+'&active=eq.true');
 const visible=owner?all:all.filter((x:any)=>permissions.some((p:any)=>p.branch_id===x.id&&p.role===u.role));
 return {owner,branches:visible.map((b:any)=>({id:b.id,name:b.name,code:b.code,address:b.address,phone:b.phone,isPrimary:b.is_primary})),permissions};
}
async function branchContext(u:any,id:string|undefined){
 const scope=await branchScope(u);
 if(!scope.branches.length)throw new ApiError('No active branches assigned. Contact the pharmacy owner.',403);
 const branchId=id||scope.branches[0].id;
 if(branchId==='all'){
   if(!scope.owner)throw new ApiError('All-branch access belongs to the owner.',403);
   return {...scope,branchId};
 }
 if(!scope.branches.some((b:any)=>b.id===branchId))throw new ApiError('You do not have access to this branch.',403);
 return {...scope,branchId};
}
function branchSummary(s:any,b:any){
 const today=new Date().toLocaleDateString('en-CA',{timeZone:'Africa/Kampala'});
 const available=(s.batches||[]).filter((x:any)=>!['quarantined','writtenoff'].includes(x.status)&&!G.Pharmacy.expired(x,today));
 const units=available.reduce((n:number,x:any)=>n+Math.max(0,G.Pharmacy.remaining(x,s.sales||[],s.adjustments||[])),0);
 const stockValue=available.reduce((n:number,x:any)=>n+Math.max(0,G.Pharmacy.remaining(x,s.sales||[],s.adjustments||[]))*Number(x.unitCost||0),0);
 const sales=(s.sales||[]),unpaid=(s.invoices||[]).filter((x:any)=>x.status==='Unpaid');
 return {branchId:b.id,name:b.name,code:b.code,medicines:(s.medicines||[]).length,stockUnits:units,stockValue,sales:sales.length,revenue:sales.reduce((n:number,x:any)=>n+Number(x.total||0),0),todaySales:sales.filter((x:any)=>x.date===today).reduce((n:number,x:any)=>n+Number(x.total||0),0),unpaid:unpaid.reduce((n:number,x:any)=>n+Number(x.total||0),0)};
}
async function view(u:any,pharmacy:any,id?:string,data?:any){
 const scope=await branchContext(u,id);
 if(scope.branchId==='all'){
   const records=await rest('gp_branch_workspaces?pharmacy_id=eq.'+u.pharmacyId+'&select=branch_id,data');
   const summaries=scope.branches.map((b:any)=>branchSummary(records.find((r:any)=>r.branch_id===b.id)?.data||{},b));
   const stockRows:any[]=[];
   for(const b of scope.branches){
     const st=records.find((r:any)=>r.branch_id===b.id)?.data||{};
     for(const m of st.medicines||[]){
       const today=new Date().toLocaleDateString('en-CA',{timeZone:'Africa/Kampala'});
       const qty=G.Pharmacy.available(m,st.batches||[],today,st.sales||[],st.adjustments||[]);
       stockRows.push({branch:b.name,branchCode:b.code,brand:m.brand,generic:m.generic,strength:m.strength,unit:m.unit,quantity:qty});
     }
   }
   return {all:true,isOwner:true,branches:scope.branches,summaries,stockRows,accountId:u.id,role:u.role};
 }
 const row=data?{data}:((await rest('gp_branch_workspaces?branch_id=eq.'+scope.branchId+'&pharmacy_id=eq.'+u.pharmacyId))[0]);
 if(!row?.data)throw new ApiError('Branch workspace unavailable.',503);
 const s=row.data;
 const may=(p:string)=>u.role==='Admin'||G.Access.rights[u.role]?.includes(p),out=structuredClone(s);
 if(!may('clinical'))for(const k of ['patients','appointments','consultations','prescriptions'])out[k]=[];
 if(!may('staff'))out.employees=[];
 if(!may('finance')){out.cashMovements=[];out.closings=[];}
 if(!may('reports'))out.editHistory=[];
 if(!may('sell')&&!may('reports')){out.invoices=[];out.customers=[];out.sales=out.sales.map((s:any)=>({id:s.id,order:s.order,date:s.date,lines:s.lines.map((l:any)=>({batchId:l.batchId,qty:l.qty}))}));}
 const members=scope.owner?(await rest('gp_memberships?pharmacy_id=eq.'+u.pharmacyId)).map(member):[u];
 out.access={pharmacyId:u.pharmacyId,pharmacyName:pharmacy.name,mode:'online',accounts:members,audit:[],emails:[]};
 out.revision=typeof row.revision==='number'?row.revision:out.revision;
 return {state:out,accountId:u.id,branchId:scope.branchId,branch:scope.branches.find((b:any)=>b.id===scope.branchId),branches:scope.branches,isOwner:scope.owner,role:u.role};
}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 try{
 if(req.method!=='POST')throw new ApiError('Method not allowed.',405);
 if(req.headers.get('origin')&&req.headers.get('origin')!==site)throw new ApiError('Origin not allowed.',403);
 const raw=await req.text();if(raw.length>2*1024*1024)throw new ApiError('Request too large.',413);
 const b=JSON.parse(raw),action=b.action;
 if(action==='registerOwner')throw new ApiError('Accounts are created through pharmacy administration.',403);
 if(action==='activateStaff'){
  const id=String(b.invite||''),email=String(b.email||'').trim().toLowerCase(),password=String(b.password||'');
  if(!/^[a-f0-9-]{36}$/.test(id)||password.length<10||password.length>1000)throw new ApiError('Invalid activation request.');
  const invitations=await rest('gp_staff_invites?id=eq.'+id+'&accepted_at=is.null&revoked_at=is.null');
  const invitation=invitations[0];
  if(!invitation||new Date(invitation.expires_at)<=new Date()||invitation.email!==email)throw new ApiError('Invitation expired or belongs to another email.',403);
  await api('/auth/v1/signup',{email,password,data:{username:invitation.username}},'POST',pub);
  return Response.json({ok:true,message:'Check your email to confirm your account. Then sign in with your approved username.'},{headers});
 }
 if(action==='login'){
 const slug=String(b.pharmacy||'').trim().toLowerCase(),username=String(b.username||'').trim().toLowerCase();
 if(!/^[a-z0-9-]{3,80}$/.test(slug)||!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username)||typeof b.password!=='string'||b.password.length>1000)throw new ApiError('Check your pharmacy, username and password.',401);
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(slug+':'+username)))).map(x=>x.toString(16).padStart(2,'0')).join('');
 if(!await rest('rpc/gp_login_attempt',{p_key:digest}))throw new ApiError('Too many sign-in attempts. Try again in 15 minutes.',429);
 let ps=await rest('gp_pharmacies?slug=eq.'+encodeURIComponent(slug)+'&active=eq.true');
 let ms=ps.length?await rest('gp_memberships?pharmacy_id=eq.'+ps[0].id+'&username=eq.'+encodeURIComponent(username)+'&status=eq.Active'):[];
 let session;
 if(ms.length!==1){
   const claims=await rest('gp_owner_claims?pharmacy_slug=eq.'+encodeURIComponent(slug)+'&username=eq.'+encodeURIComponent(username)+'&claimed_at=is.null');

   if(claims.length!==1){
     const invites=ps.length?await rest('gp_staff_invites?pharmacy_id=eq.'+ps[0].id+'&username=eq.'+encodeURIComponent(username)+'&accepted_at=is.null&revoked_at=is.null'):[];
     const invite=invites.find((x:any)=>new Date(x.expires_at)>new Date());
     if(!invite)throw new ApiError('Check your pharmacy, username and password.',401);
     try{session=await api('/auth/v1/token?grant_type=password',{email:invite.email,password:b.password},'POST',pub);}
     catch{throw new ApiError('Check your pharmacy, username and password.',401);}
     if(!session.user?.email_confirmed_at||session.user.email?.toLowerCase()!==invite.email)throw new ApiError('Confirm your invitation email before signing in.',403);
     await rest('rpc/gp_claim_staff',{p_user:session.user.id,p_pharmacy:ps[0].id,p_username:username});
     ms=await rest('gp_memberships?pharmacy_id=eq.'+ps[0].id+'&username=eq.'+encodeURIComponent(username)+'&status=eq.Active');
     if(ms.length!==1)throw new ApiError('Staff account could not be activated.',503);
   }else{

   try{session=await api('/auth/v1/token?grant_type=password',{email:claims[0].email,password:b.password},'POST',pub);}
   catch{throw new ApiError('Check your pharmacy, username and password.',401);}
   if(session.user.id===undefined||session.user.email?.toLowerCase()!==claims[0].email||!session.user.email_confirmed_at)
    throw new ApiError('Verify your email address before signing in.',403);
   await rest('rpc/gp_claim_owner',{p_user:session.user.id,p_data:G.Commands.empty(claims[0].pharmacy_name,'pending')});
   try{await api('/rest/v1/rpc/claim_pending_owner',{},'POST',pub,session.access_token);}
   catch{/* Branch enrollment can be completed independently; pharmacy sign-in stays available. */}
   ps=await rest('gp_pharmacies?slug=eq.'+encodeURIComponent(slug)+'&active=eq.true');
   ms=ps.length?await rest('gp_memberships?pharmacy_id=eq.'+ps[0].id+'&username=eq.'+encodeURIComponent(username)+'&status=eq.Active'):[];
   if(ms.length!==1)throw new ApiError('Pharmacy setup could not be completed.',503);
   }
 } else {
   try{session=await api('/auth/v1/token?grant_type=password',{email:ms[0].email,password:b.password},'POST',pub);}
   catch{throw new ApiError('Check your pharmacy, username and password.',401);}
 }
 if(session.user.id!==ms[0].user_id)throw new ApiError('Account access denied.',403);
 return Response.json({session:{access_token:session.access_token,refresh_token:session.refresh_token,expires_at:Math.floor(Date.now()/1000)+session.expires_in},pharmacyId:ps[0].id},{headers});
 }
 if(action==='refresh'){
 const session=await api('/auth/v1/token?grant_type=refresh_token',{refresh_token:b.refreshToken},'POST',pub);
 await context(session.access_token,b.pharmacyId);
 return Response.json({session:{access_token:session.access_token,refresh_token:session.refresh_token,expires_at:Math.floor(Date.now()/1000)+session.expires_in}},{headers});
 }

 const token=(req.headers.get('authorization')||'').replace(/^Bearer /,'');
 const {u,pharmacy}=await context(token,b.pharmacyId);
 const scope=await branchContext(u,b.branchId);
 if(action==='logout'){await api('/auth/v1/logout?scope=local',{},'POST',pub,token);return Response.json({ok:true},{headers});}
 if(action==='workspace')return Response.json(await view(u,pharmacy,b.branchId),{headers});
 if(action==='listStaff'){
   if(!scope.owner)throw new ApiError('Owner access required.',403);
   const [staff,assignments,invites]=await Promise.all([
     rest('gp_memberships?pharmacy_id=eq.'+u.pharmacyId),
     rest('gp_branch_access?pharmacy_id=eq.'+u.pharmacyId),
     rest('gp_staff_invites?pharmacy_id=eq.'+u.pharmacyId+'&accepted_at=is.null&revoked_at=is.null')
   ]);
   return Response.json({staff:staff.map(member),assignments,invites:invites.map((x:any)=>({id:x.id,branchId:x.branch_id,email:x.email,username:x.username,role:x.role,expiresAt:x.expires_at}))},{headers});
 }
 if(action==='createBranch'){
   if(!scope.owner)throw new ApiError('Only the owner can create branches.',403);
   const name=String(b.name||'').trim(),code=String(b.code||'').trim().toUpperCase();
   if(name.length<2||name.length>100||!/^[A-Z0-9-]{2,20}$/.test(code))throw new ApiError('Enter a valid branch name and code.');
   const data=G.Commands.empty(pharmacy.name,u.pharmacyId);
   const id=await rest('rpc/gp_create_branch',{p_pharmacy:u.pharmacyId,p_owner:u.userId,p_name:name,p_code:code,p_address:String(b.address||'').slice(0,300),p_phone:String(b.phone||'').slice(0,50),p_data:data});
   return Response.json({branchId:id},{headers});
 }
 if(action==='inviteStaff'){
   if(!scope.owner)throw new ApiError('Only the owner can approve staff.',403);
   const invite=await rest('rpc/gp_invite_staff',{p_pharmacy:u.pharmacyId,p_owner:u.userId,p_branch:b.targetBranch,p_email:b.email,p_username:b.username,p_role:b.role});
   return Response.json({invitationUrl:site+'/?invite='+invite},{headers});
 }
 if(action==='grantBranch'){
   if(!scope.owner)throw new ApiError('Only the owner can manage branch access.',403);
   await rest('rpc/gp_assign_branch',{p_pharmacy:u.pharmacyId,p_owner:u.userId,p_branch:b.targetBranch,p_user:b.userId,p_role:b.role});
   return Response.json({ok:true},{headers});
 }
 if(action==='removeBranchAccess'){
   if(!scope.owner)throw new ApiError('Only the owner can remove branch access.',403);
   await rest('rpc/gp_remove_branch_access',{p_pharmacy:u.pharmacyId,p_owner:u.userId,p_branch:b.targetBranch,p_user:b.userId});
   return Response.json({ok:true},{headers});
 }
 if(action==='changeMember'){
   if(!scope.owner)throw new ApiError('Only the owner can change staff access.',403);
   await rest('rpc/gp_change_member',{p_pharmacy:u.pharmacyId,p_user:u.userId,p_target:b.targetId,p_role:b.role,p_designation:b.designation,p_status:b.status,p_reason:b.reason,p_request:b.requestId});
   return Response.json(await view(u,pharmacy,b.branchId),{headers});
 }
 if(action==='command'){
   if(scope.branchId==='all')throw new ApiError('Choose a branch to save a transaction.',403);
   const row=(await rest('gp_branch_workspaces?branch_id=eq.'+scope.branchId+'&pharmacy_id=eq.'+u.pharmacyId))[0];
   if(!row)throw new ApiError('Branch workspace unavailable.',503);
   if(row.revision!==b.revision)throw new ApiError('Records changed. Refresh before saving.',409);
   const next=G.Commands.run({...row.data,revision:row.revision},b.commands,u);
   const branch=scope.branches.find((x:any)=>x.id===scope.branchId);
   for(const c of b.commands||[]){
     if(c.name==='sale'){
       for(const record of next.sales||[])if(!(row.data.sales||[]).some((x:any)=>x.id===record.id)){
         record.branchId=scope.branchId;record.branchName=branch.name;record.branchCode=branch.code;
       }
     }
     if(c.name==='createInvoice'){
       for(const record of next.invoices||[])if(!(row.data.invoices||[]).some((x:any)=>x.id===record.id)){
         record.branchId=scope.branchId;record.branchName=branch.name;record.branchCode=branch.code;
       }
     }
   }
   await rest('rpc/gp_commit_branch',{p_pharmacy:u.pharmacyId,p_branch:scope.branchId,p_user:u.userId,p_member:u.id,p_expected:row.revision,p_data:next,p_request:b.requestId,p_action:b.commands.map((c:any)=>c.name).join(', ')});
   return Response.json(await view(u,pharmacy,scope.branchId,next),{headers});
 }
 throw new ApiError('Unknown action.');
 }catch(e){const err=e as Error;return Response.json({error:err.message?.includes('CONFLICT:')?'Records changed. Refresh before saving.':err.message||'The action could not be completed.'},{status:err.message?.includes('CONFLICT:')?409:(e instanceof ApiError?e.status:400),headers});}
});
