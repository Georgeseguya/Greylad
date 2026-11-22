-- Dedicated pharmacy project. No client role may read these tables directly.
create table public.gp_pharmacies (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 80),
 slug text unique not null check(slug ~ '^[a-z0-9][a-z0-9-]{2,79}$'), active boolean not null default true,
 created_at timestamptz not null default now()
);
create table public.gp_memberships (
 id uuid primary key default gen_random_uuid(), pharmacy_id uuid not null references public.gp_pharmacies(id),
 user_id uuid not null references auth.users(id), username text not null check(username ~ '^[a-z0-9][a-z0-9._-]{2,39}$'),
 name text not null, email text not null, designation text not null,
 role text not null check(role in ('Admin','Manager','Pharmacist','Cashier','Stock clerk','Viewer','Stock manager')),
 status text not null default 'Active' check(status in ('Active','Suspended')),
 unique(pharmacy_id,username),unique(pharmacy_id,user_id)
);
create table public.gp_workspaces (
 pharmacy_id uuid primary key references public.gp_pharmacies(id), revision bigint not null default 0,
 data jsonb not null, updated_at timestamptz not null default now()
);
create table public.gp_audit (
 id bigint generated always as identity primary key, pharmacy_id uuid not null references public.gp_pharmacies(id),
 membership_id uuid not null references public.gp_memberships(id), actor jsonb not null,
 action text not null, request_id uuid not null, revision bigint, recorded_at timestamptz not null default now(),
 unique(pharmacy_id,request_id)
);
create index gp_audit_pharmacy_date on public.gp_audit(pharmacy_id,recorded_at desc);
create table public.gp_email_outbox (
 id uuid primary key default gen_random_uuid(), pharmacy_id uuid not null references public.gp_pharmacies(id),
 recipient_membership uuid not null references public.gp_memberships(id), kind text not null,
 payload jsonb not null, dedupe_key text unique not null, status text not null default 'pending',
 attempts integer not null default 0, created_at timestamptz not null default now(), sent_at timestamptz
);
create table public.gp_login_limits (key text primary key, window_start timestamptz not null, attempts integer not null);
alter table public.gp_pharmacies enable row level security;
alter table public.gp_memberships enable row level security;
alter table public.gp_workspaces enable row level security;
alter table public.gp_audit enable row level security;
alter table public.gp_email_outbox enable row level security;
alter table public.gp_login_limits enable row level security;
revoke all on public.gp_pharmacies,public.gp_memberships,public.gp_workspaces,public.gp_audit,public.gp_email_outbox,public.gp_login_limits from anon,authenticated;
grant all on public.gp_pharmacies,public.gp_memberships,public.gp_workspaces,public.gp_audit,public.gp_email_outbox,public.gp_login_limits to service_role;
grant usage,select on sequence public.gp_audit_id_seq to service_role;

create function public.gp_login_attempt(p_key text) returns boolean language plpgsql set search_path='' as $$
declare n integer;
begin
 insert into public.gp_login_limits as l values (p_key,now(),1)
 on conflict(key) do update set attempts=case when l.window_start<now()-interval '15 minutes' then 1 else l.attempts+1 end,
 window_start=case when l.window_start<now()-interval '15 minutes' then now() else l.window_start end returning attempts into n;
 return n<=10;
end $$;

create function public.gp_commit(p_pharmacy uuid,p_user uuid,p_member uuid,p_role text,p_expected bigint,p_data jsonb,p_request uuid,p_action text)
returns bigint language plpgsql set search_path='' as $$
declare m public.gp_memberships; rev bigint;
begin
 select * into m from public.gp_memberships where id=p_member and pharmacy_id=p_pharmacy and user_id=p_user for share;
 if not found or m.status<>'Active' or m.role<>p_role then raise exception 'Account access changed. Sign in again.'; end if;
 perform 1 from public.gp_pharmacies where id=p_pharmacy and active for share;
 if not found then raise exception 'Pharmacy unavailable.'; end if;
 select revision into rev from public.gp_workspaces where pharmacy_id=p_pharmacy for update;
 if rev is distinct from p_expected then raise exception 'CONFLICT: Records changed. Refresh before saving.'; end if;
 if (p_data->'settings'->>'pharmacyId') is distinct from p_pharmacy::text then raise exception 'Invalid pharmacy identity'; end if;
 update public.gp_workspaces set data=p_data,revision=rev+1,updated_at=now() where pharmacy_id=p_pharmacy;
 insert into public.gp_audit(pharmacy_id,membership_id,actor,action,request_id,revision)
 values(p_pharmacy,m.id,jsonb_build_object('name',m.name,'role',m.role,'designation',m.designation,'username',m.username),p_action,p_request,rev+1);
 return rev+1;
end $$;

create function public.gp_change_member(p_pharmacy uuid,p_user uuid,p_target uuid,p_role text,p_designation text,p_status text,p_reason text,p_request uuid)
returns void language plpgsql set search_path='' as $$
declare a public.gp_memberships; t public.gp_memberships; r public.gp_memberships;
begin
 -- Serialize all account changes in this pharmacy before checking both memberships.
 perform 1 from public.gp_pharmacies where id=p_pharmacy and active for update;
 if not found then raise exception 'Pharmacy unavailable'; end if;
 select * into a from public.gp_memberships where pharmacy_id=p_pharmacy and user_id=p_user for update;
 if not found or a.status<>'Active' or a.role not in ('Admin','Manager') then raise exception 'Access denied'; end if;
 select * into t from public.gp_memberships where id=p_target and pharmacy_id=p_pharmacy for update;
 if not found or t.id=a.id or t.role in ('Admin','Manager') then raise exception 'This account is platform-managed'; end if;
 if p_role not in ('Pharmacist','Cashier','Stock clerk','Viewer','Stock manager') or p_status not in ('Active','Suspended') or length(trim(p_designation)) not between 1 and 100 or length(trim(p_reason)) not between 1 and 500 then raise exception 'Invalid account change'; end if;
 update public.gp_memberships set role=p_role,designation=trim(p_designation),status=p_status where id=t.id;
 insert into public.gp_audit(pharmacy_id,membership_id,actor,action,request_id)
 values(p_pharmacy,a.id,jsonb_build_object('name',a.name,'role',a.role,'target',t.id,'beforeRole',t.role,'afterRole',p_role,'beforeDesignation',t.designation,'afterDesignation',p_designation,'beforeStatus',t.status,'afterStatus',p_status,'reason',p_reason),'Account changed',p_request);
 for r in select * from public.gp_memberships where pharmacy_id=p_pharmacy and (id=t.id or (status='Active' and role in ('Admin','Manager'))) loop
 insert into public.gp_email_outbox(pharmacy_id,recipient_membership,kind,payload,dedupe_key)
 values(p_pharmacy,r.id,'account-change',jsonb_build_object('username',t.username,'role',p_role,'designation',p_designation,'status',p_status,'changedBy',a.name,'reason',p_reason),p_request::text||':'||r.id::text);
 end loop;
end $$;
revoke all on function public.gp_login_attempt(text),public.gp_commit(uuid,uuid,uuid,text,bigint,jsonb,uuid,text),public.gp_change_member(uuid,uuid,uuid,text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.gp_login_attempt(text),public.gp_commit(uuid,uuid,uuid,text,bigint,jsonb,uuid,text),public.gp_change_member(uuid,uuid,uuid,text,text,text,text,uuid) to service_role;

create function public.gp_provision_pharmacy(p_name text,p_slug text,p_user uuid,p_username text,p_person text,p_designation text,p_state jsonb)
returns uuid language plpgsql set search_path='' as $$
declare pid uuid:=gen_random_uuid(); mail text;
begin
 select email into mail from auth.users where id=p_user;
 if mail is null then raise exception 'Create the approved Auth user first'; end if;
 insert into public.gp_pharmacies(id,name,slug) values(pid,p_name,p_slug);
 insert into public.gp_memberships(pharmacy_id,user_id,username,name,email,designation,role) values(pid,p_user,p_username,p_person,mail,p_designation,'Admin');
 insert into public.gp_workspaces(pharmacy_id,data) values(pid,jsonb_set(jsonb_set(p_state,'{settings,pharmacyId}',to_jsonb(pid::text)),'{settings,pharmacyName}',to_jsonb(p_name)));
 return pid;
end $$;
create function public.gp_provision_member(p_pharmacy uuid,p_user uuid,p_username text,p_person text,p_designation text,p_role text)
returns uuid language plpgsql set search_path='' as $$
declare mid uuid:=gen_random_uuid(); mail text;
begin
 select email into mail from auth.users where id=p_user;
 if mail is null then raise exception 'Create the approved Auth user first'; end if;
 insert into public.gp_memberships(id,pharmacy_id,user_id,username,name,email,designation,role) values(mid,p_pharmacy,p_user,p_username,p_person,mail,p_designation,p_role);
 return mid;
end $$;
revoke all on function public.gp_provision_pharmacy(text,text,uuid,text,text,text,jsonb),public.gp_provision_member(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.gp_provision_pharmacy(text,text,uuid,text,text,text,jsonb),public.gp_provision_member(uuid,uuid,text,text,text,text) to service_role;
