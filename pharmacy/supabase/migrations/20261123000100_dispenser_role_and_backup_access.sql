-- Add the Dispenser operational role and permit owner/admin assignment.
alter table public.gp_memberships drop constraint if exists gp_memberships_role_check;
alter table public.gp_memberships add constraint gp_memberships_role_check
check (role = any (array['Admin','Manager','Pharmacist','Dispenser','Cashier','Stock clerk','Viewer','Stock manager']::text[]));

create or replace function public.gp_change_member(
 p_pharmacy uuid,p_user uuid,p_target uuid,p_role text,p_designation text,p_status text,p_reason text,p_request uuid
) returns void
language plpgsql
set search_path to ''
as $function$
declare a public.gp_memberships; t public.gp_memberships; r public.gp_memberships;
begin
 perform 1 from public.gp_pharmacies where id=p_pharmacy and active for update;
 if not found then raise exception 'Pharmacy unavailable'; end if;
 select * into a from public.gp_memberships where pharmacy_id=p_pharmacy and user_id=p_user for update;
 if not found or a.status<>'Active' or a.role not in ('Admin','Manager') then raise exception 'Access denied'; end if;
 select * into t from public.gp_memberships where id=p_target and pharmacy_id=p_pharmacy for update;
 if not found or t.id=a.id or t.role in ('Admin','Manager') then raise exception 'This account is platform-managed'; end if;
 if p_role not in ('Pharmacist','Dispenser','Cashier','Stock clerk','Viewer','Stock manager')
 or p_status not in ('Active','Suspended')
 or length(trim(p_designation)) not between 1 and 100
 or p_reason is null or length(trim(p_reason)) not between 1 and 500
 then raise exception 'Invalid account change'; end if;
 update public.gp_memberships set role=p_role,designation=trim(p_designation),status=p_status where id=t.id;
 insert into public.gp_audit(pharmacy_id,membership_id,actor,action,request_id)
 values(p_pharmacy,a.id,jsonb_build_object('name',a.name,'role',a.role,'target',t.id,'beforeRole',t.role,'afterRole',p_role,'beforeDesignation',t.designation,'afterDesignation',p_designation,'beforeStatus',t.status,'afterStatus',p_status,'reason',p_reason),'Account changed',p_request);
 for r in select * from public.gp_memberships where pharmacy_id=p_pharmacy
 and (id=t.id or (status='Active' and role in ('Admin','Manager'))) loop
  insert into public.gp_email_outbox(pharmacy_id,recipient_membership,kind,payload,dedupe_key)
  values(p_pharmacy,r.id,'account-change',jsonb_build_object('username',t.username,'role',p_role,'designation',p_designation,'status',p_status,'changedBy',a.name,'reason',p_reason),p_request::text||':'||r.id::text);
 end loop;
end $function$;
