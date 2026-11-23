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

create or replace function public.gp_invite_staff(
 p_pharmacy uuid,p_owner uuid,p_branch uuid,p_email text,p_username text,p_role text
) returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare invite uuid; mail text:=lower(trim(p_email));uname text:=lower(trim(p_username));
begin
 if not exists(select 1 from public.gp_owners o join public.gp_memberships m
 on m.pharmacy_id=o.pharmacy_id and m.user_id=o.user_id and m.status='Active'
 where o.pharmacy_id=p_pharmacy and o.user_id=p_owner) then raise exception 'Owner access required';end if;
 if not exists(select 1 from public.gp_branches where pharmacy_id=p_pharmacy and id=p_branch and active)
 then raise exception 'Branch inactive or not found';end if;
 if length(mail)<5 or position('@' in mail)<2 or length(mail)>320
 then raise exception 'Invalid email';end if;
 if uname!~'^[a-z0-9][a-z0-9._-]{2,39}$'
 then raise exception 'Invalid username';end if;
 if p_role not in ('Manager','Pharmacist','Dispenser','Cashier','Stock clerk','Viewer','Stock manager')
 then raise exception 'Invalid staff role';end if;
 if exists(select 1 from public.gp_memberships where pharmacy_id=p_pharmacy and username=uname)
 or exists(select 1 from public.gp_owners where pharmacy_id=p_pharmacy and user_id in
 (select id from auth.users where lower(email)=mail))
 then raise exception 'Existing staff should be granted another branch';end if;
 if exists(select 1 from public.gp_staff_invites where pharmacy_id=p_pharmacy and email=mail
 and username=uname and accepted_at is null and revoked_at is null and expires_at>now())
 then raise exception 'Invitation already pending';end if;
 insert into public.gp_staff_invites(pharmacy_id,branch_id,email,username,role,created_by)
 values(p_pharmacy,p_branch,mail,uname,p_role,p_owner) returning id into invite;
 return invite;
end $function$;
