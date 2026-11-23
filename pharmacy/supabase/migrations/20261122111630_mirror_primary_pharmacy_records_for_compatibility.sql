-- While the hosted interface transitions, keep the primary branch workspace
-- mirrored to the original pharmacy ledger for safe rollback compatibility.
create function public.gp_mirror_primary_branch()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.gp_branches where id=new.branch_id
 and pharmacy_id=new.pharmacy_id and is_primary) then
  update public.gp_workspaces set revision=new.revision,data=new.data,updated_at=now()
  where pharmacy_id=new.pharmacy_id;
 end if;
 return new;
end $$;
create trigger gp_sync_main_branch_after_update
after update of revision,data on public.gp_branch_workspaces
for each row execute function public.gp_mirror_primary_branch();
revoke all on function public.gp_mirror_primary_branch() from public,anon,authenticated;
