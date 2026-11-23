-- Branch isolation for the production Greylad Pharmacy workspace.
-- Applied in the hosted project on 2026-11-22; do not replay into the same project.
-- Apply AFTER 20261122000100_pharmacy.sql and approved owner onboarding.
create table public.gp_branches(
 id uuid primary key default gen_random_uuid(),
 pharmacy_id uuid not null references public.gp_pharmacies(id) on delete cascade,
 code text not null check(code ~ '^[A-Z0-9-]{2,20}$'),
 name text not null check(length(trim(name)) between 2 and 100),
 address text not null default '',
 phone text not null default '',
 is_primary boolean not null default false,
 active boolean not null default true,
 created_at timestamptz not null default now(),
 unique(pharmacy_id,code),unique(id,pharmacy_id)
);
create unique index gp_one_primary_branch on public.gp_branches(pharmacy_id) where is_primary;
create table public.gp_owners(
 pharmacy_id uuid not null references public.gp_pharmacies(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 primary key(pharmacy_id,user_id)
);
create table public.gp_branch_access(
 pharmacy_id uuid not null,branch_id uuid not null,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check(role in ('Admin','Manager','Pharmacist','Cashier','Stock clerk','Viewer','Stock manager')),
 active boolean not null default true,
 primary key(pharmacy_id,branch_id,user_id),
 foreign key(branch_id,pharmacy_id) references public.gp_branches(id,pharmacy_id) on delete cascade,
 foreign key(pharmacy_id,user_id) references public.gp_memberships(pharmacy_id,user_id) on delete cascade
);
create table public.gp_branch_workspaces(
 branch_id uuid primary key,pharmacy_id uuid not null,
 revision bigint not null default 0,data jsonb not null,
 updated_at timestamptz not null default now(),
 foreign key(branch_id,pharmacy_id) references public.gp_branches(id,pharmacy_id) on delete cascade
);
create index gp_branch_workspaces_pharmacy on public.gp_branch_workspaces(pharmacy_id);
create table public.gp_staff_invites(
 id uuid primary key default gen_random_uuid(),
 pharmacy_id uuid not null references public.gp_pharmacies(id) on delete cascade,
 branch_id uuid not null,
 email text not null check(email=lower(trim(email))),
 username text not null check(username~'^[a-z0-9][a-z0-9._-]{2,39}$'),
 role text not null check(role in ('Manager','Pharmacist','Cashier','Stock clerk','Viewer','Stock manager')),
 created_by uuid not null references auth.users(id),
 expires_at timestamptz not null default now()+interval '7 days',
 accepted_by uuid references auth.users(id),
 accepted_at timestamptz,revoked_at timestamptz,
 created_at timestamptz not null default now(),
 foreign key(branch_id,pharmacy_id) references public.gp_branches(id,pharmacy_id)
);
create index gp_pending_invites_lookup on public.gp_staff_invites(pharmacy_id,username,email);
alter table public.gp_audit add column branch_id uuid references public.gp_branches(id);
alter table public.gp_branches enable row level security;
alter table public.gp_owners enable row level security;
alter table public.gp_branch_access enable row level security;
alter table public.gp_branch_workspaces enable row level security;
alter table public.gp_staff_invites enable row level security;
revoke all on public.gp_branches,public.gp_owners,public.gp_branch_access,public.gp_branch_workspaces,public.gp_staff_invites from public,anon,authenticated;
grant all on public.gp_branches,public.gp_owners,public.gp_branch_access,public.gp_branch_workspaces,public.gp_staff_invites to service_role;

CREATE OR REPLACE FUNCTION public.gp_setup_primary_branch()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare b uuid;owner_uuid uuid;
begin
 select m.user_id into owner_uuid from public.gp_memberships m
 where m.pharmacy_id=new.pharmacy_id and m.role='Admin' and m.status='Active'
 order by m.id limit 1;
 if owner_uuid is null then raise exception 'Cannot bootstrap a branch without an initial owner'; end if;
 insert into public.gp_branches(pharmacy_id,code,name,is_primary)
 values(new.pharmacy_id,'MAIN','Main Branch',true) returning id into b;
 insert into public.gp_branch_workspaces(branch_id,pharmacy_id,revision,data)
 values(b,new.pharmacy_id,new.revision,new.data);
 insert into public.gp_owners(pharmacy_id,user_id) values(new.pharmacy_id,owner_uuid);
 return new;
end $function$


CREATE OR REPLACE FUNCTION public.gp_commit_branch(p_pharmacy uuid, p_branch uuid, p_user uuid, p_member uuid, p_expected bigint, p_data jsonb, p_request uuid, p_action text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare m public.gp_memberships; rev bigint;
begin
 select * into m from public.gp_memberships
 where id=p_member and pharmacy_id=p_pharmacy and user_id=p_user
 and status='Active' for share;
 if not found then raise exception 'Active membership required';end if;
 if not exists(select 1 from public.gp_owners o where o.pharmacy_id=p_pharmacy and o.user_id=p_user)
 and not exists(select 1 from public.gp_branch_access a
 where a.pharmacy_id=p_pharmacy and a.branch_id=p_branch and a.user_id=p_user
 and a.active and a.role=m.role)
 then raise exception 'No access to this branch';end if;
 perform 1 from public.gp_branches where id=p_branch and pharmacy_id=p_pharmacy and active;
 if not found then raise exception 'Branch unavailable';end if;
 select revision into rev from public.gp_branch_workspaces
 where branch_id=p_branch and pharmacy_id=p_pharmacy for update;
 if rev is null or rev<>p_expected then raise exception 'CONFLICT: Records changed. Refresh before saving.';end if;
 if p_data->'settings'->>'pharmacyId' is distinct from p_pharmacy::text
 then raise exception 'Invalid pharmacy identity';end if;
 update public.gp_branch_workspaces
 set data=p_data,revision=rev+1,updated_at=now()
 where branch_id=p_branch and pharmacy_id=p_pharmacy;
 insert into public.gp_audit(pharmacy_id,branch_id,membership_id,actor,action,request_id,revision)
 values(p_pharmacy,p_branch,m.id,jsonb_build_object('name',m.name,'role',m.role,'username',m.username),
 p_action,p_request,rev+1);
 return rev+1;
end $function$


CREATE OR REPLACE FUNCTION public.gp_create_branch(p_pharmacy uuid, p_owner uuid, p_name text, p_code text, p_address text, p_phone text, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare branch uuid;
begin
 if not exists(select 1 from public.gp_owners where pharmacy_id=p_pharmacy and user_id=p_owner)
 then raise exception 'Owner rights required';end if;
 if not exists(select 1 from public.gp_memberships where pharmacy_id=p_pharmacy and user_id=p_owner and status='Active')
 then raise exception 'Owner suspended';end if;
 if not exists(select 1 from public.gp_pharmacies where id=p_pharmacy and active)
 then raise exception 'Pharmacy inactive';end if;
 insert into public.gp_branches(pharmacy_id,code,name,address,phone)
 values(p_pharmacy,upper(trim(p_code)),trim(p_name),coalesce(trim(p_address),''),
 coalesce(trim(p_phone),'')) returning id into branch;
 if p_data->'settings'->>'pharmacyId' is distinct from p_pharmacy::text
 then raise exception 'Wrong pharmacy identity';end if;
 insert into public.gp_branch_workspaces(branch_id,pharmacy_id,data)
 values(branch,p_pharmacy,p_data);
 return branch;
end $function$


CREATE OR REPLACE FUNCTION public.gp_assign_branch(p_pharmacy uuid, p_owner uuid, p_branch uuid, p_user uuid, p_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not exists(select 1 from public.gp_owners where pharmacy_id=p_pharmacy and user_id=p_owner)
 then raise exception 'Owner rights required';end if;
 if exists(select 1 from public.gp_owners where pharmacy_id=p_pharmacy and user_id=p_user)
 then raise exception 'The owner already has access to all branches';end if;
 if not exists(select 1 from public.gp_branches where id=p_branch and pharmacy_id=p_pharmacy and active)
 then raise exception 'Invalid branch';end if;
 if not exists(select 1 from public.gp_memberships
 where pharmacy_id=p_pharmacy and user_id=p_user and role=p_role and status='Active')
 then raise exception 'Active account and matching role required';end if;
 insert into public.gp_branch_access(pharmacy_id,branch_id,user_id,role,active)
 values(p_pharmacy,p_branch,p_user,p_role,true)
 on conflict(pharmacy_id,branch_id,user_id)
 do update set role=excluded.role,active=true;
end $function$


CREATE OR REPLACE FUNCTION public.gp_remove_branch_access(p_pharmacy uuid, p_owner uuid, p_branch uuid, p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not exists(select 1 from public.gp_owners where pharmacy_id=p_pharmacy and user_id=p_owner)
 then raise exception 'Owner rights required';end if;
 update public.gp_branch_access set active=false
 where pharmacy_id=p_pharmacy and branch_id=p_branch and user_id=p_user;
end $function$


CREATE OR REPLACE FUNCTION public.gp_invite_staff(p_pharmacy uuid, p_owner uuid, p_branch uuid, p_email text, p_username text, p_role text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 if p_role not in ('Manager','Pharmacist','Cashier','Stock clerk','Viewer','Stock manager')
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
end $function$


CREATE OR REPLACE FUNCTION public.gp_claim_staff(p_user uuid, p_pharmacy uuid, p_username text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare email_verified text;i record;pid uuid;member_id uuid;
begin
 select lower(email) into email_verified from auth.users where id=p_user and email_confirmed_at is not null;
 if email_verified is null then raise exception 'Email confirmation required';end if;
 select p.id into pid from public.gp_pharmacies p where p.id=p_pharmacy and p.active;
 if pid is null then raise exception 'Pharmacy unavailable';end if;
 select * into i from public.gp_staff_invites where pharmacy_id=pid and email=email_verified
 and username=lower(trim(p_username)) and accepted_at is null and revoked_at is null and expires_at>now()
 order by created_at limit 1 for update;
 if not found then raise exception 'No active approved invitation';end if;
 if exists(select 1 from public.gp_owners where pharmacy_id=pid and user_id=p_user)
 then raise exception 'Owner cannot claim employee role';end if;
 select id into member_id from public.gp_memberships where pharmacy_id=pid and user_id=p_user;
 if member_id is null then
  member_id:=public.gp_provision_member(pid,p_user,i.username,i.username,'Staff',i.role);
 elsif not exists(select 1 from public.gp_memberships where id=member_id and role=i.role and status='Active')
 then raise exception 'Existing account role conflict';end if;
 insert into public.gp_branch_access(pharmacy_id,branch_id,user_id,role,active)
 values(pid,i.branch_id,p_user,i.role,true)
 on conflict(pharmacy_id,branch_id,user_id) do update set role=excluded.role,active=true;
 update public.gp_staff_invites set accepted_at=now(),accepted_by=p_user where id=i.id;
 return pid;
end $function$


create trigger gp_init_primary_branch after insert on public.gp_workspaces
for each row execute function public.gp_setup_primary_branch();
do $$
declare r record;b uuid;uid uuid;
begin
 for r in select * from public.gp_workspaces loop
 if not exists(select 1 from public.gp_branches where pharmacy_id=r.pharmacy_id and is_primary) then
  select user_id into uid from public.gp_memberships where pharmacy_id=r.pharmacy_id and role='Admin' and status='Active' order by id limit 1;
  if uid is null then raise exception 'Existing pharmacy missing initial admin';end if;
  insert into public.gp_branches(pharmacy_id,code,name,is_primary)
  values(r.pharmacy_id,'MAIN','Main Branch',true) returning id into b;
  insert into public.gp_branch_workspaces(branch_id,pharmacy_id,revision,data) values(b,r.pharmacy_id,r.revision,r.data);
  insert into public.gp_owners(pharmacy_id,user_id) values(r.pharmacy_id,uid) on conflict do nothing;
 end if;
 end loop;
end $$;
revoke all on function public.gp_setup_primary_branch(),
 public.gp_commit_branch(uuid,uuid,uuid,uuid,bigint,jsonb,uuid,text),
 public.gp_create_branch(uuid,uuid,text,text,text,text,jsonb),
 public.gp_assign_branch(uuid,uuid,uuid,uuid,text),
 public.gp_remove_branch_access(uuid,uuid,uuid,uuid),
 public.gp_invite_staff(uuid,uuid,uuid,text,text,text),
 public.gp_claim_staff(uuid,uuid,text)
 from public,anon,authenticated;
grant execute on function public.gp_commit_branch(uuid,uuid,uuid,uuid,bigint,jsonb,uuid,text),
 public.gp_create_branch(uuid,uuid,text,text,text,text,jsonb),
 public.gp_assign_branch(uuid,uuid,uuid,uuid,text),
 public.gp_remove_branch_access(uuid,uuid,uuid,uuid),
 public.gp_invite_staff(uuid,uuid,uuid,text,text,text),
 public.gp_claim_staff(uuid,uuid,text) to service_role;
