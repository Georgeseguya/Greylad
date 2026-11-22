-- Safe, one-time onboarding of an approved pharmacy owner.
-- Existing production branch/schema objects remain untouched.
create table if not exists public.gp_owner_claims(
 email text primary key check(email=lower(btrim(email))),
 pharmacy_name text not null,
 pharmacy_slug text not null unique check(pharmacy_slug~'^[a-z0-9][a-z0-9-]{2,79}$'),
 username text not null check(username~'^[a-z0-9][a-z0-9._-]{2,39}$'),
 claimed_by uuid references auth.users(id),
 claimed_at timestamptz,
 created_at timestamptz not null default now(),
 check((claimed_by is null)=(claimed_at is null))
);
alter table public.gp_owner_claims enable row level security;
revoke all on public.gp_owner_claims from public,anon,authenticated;
grant all on public.gp_owner_claims to service_role;
-- Owner setup is never callable with browser credentials.
create or replace function public.gp_claim_owner(p_user uuid,p_data jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare c public.gp_owner_claims%rowtype;mail text;pid uuid;
begin
 select lower(email) into mail from auth.users where id=p_user and email_confirmed_at is not null;
 if mail is null then raise exception 'Verify your email first';end if;
 select * into c from public.gp_owner_claims where email=mail for update;
 if not found then raise exception 'No approved owner registration';end if;
 if c.claimed_by is not null and c.claimed_by<>p_user then raise exception 'This pharmacy is already registered';end if;
 select m.pharmacy_id into pid from public.gp_memberships m join public.gp_pharmacies p on p.id=m.pharmacy_id
 where m.user_id=p_user and p.slug=c.pharmacy_slug and m.role='Admin';
 if pid is not null then return pid;end if;
 if c.claimed_at is not null then raise exception 'Owner registration already consumed';end if;
 pid:=public.gp_provision_pharmacy(c.pharmacy_name,c.pharmacy_slug,p_user,c.username,c.username,'Owner',p_data);
 update public.gp_owner_claims set claimed_by=p_user,claimed_at=now() where email=mail;
 return pid;
end $$;
alter function public.gp_provision_pharmacy(text,text,uuid,text,text,text,jsonb) security definer;
alter function public.gp_provision_member(uuid,uuid,text,text,text,text) security definer;
revoke all on function public.gp_claim_owner(uuid,jsonb),
 public.gp_provision_pharmacy(text,text,uuid,text,text,text,jsonb),
 public.gp_provision_member(uuid,uuid,text,text,text,text)
 from public,anon,authenticated;
grant execute on function public.gp_claim_owner(uuid,jsonb),
 public.gp_provision_pharmacy(text,text,uuid,text,text,text,jsonb),
 public.gp_provision_member(uuid,uuid,text,text,text,text) to service_role;
-- Record the approved owner separately from public browser settings.
insert into public.gp_owner_claims(email,pharmacy_name,pharmacy_slug,username)
 values('grivygeorgesalah@gmail.com','Greylad Pharmacy','greylad-pharmacy','george')
 on conflict(email) do nothing;
