-- Pilavna menu: public read, selected administrators only write.

create table if not exists public.menu_content (
  id smallint primary key,
  content jsonb not null,
  updated_at timestamptz not null default now(),
  constraint menu_content_singleton check (id = 1),
  constraint menu_content_categories_array check (jsonb_typeof(content -> 'categories') = 'array')
);

create table if not exists public.menu_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.menu_content enable row level security;
alter table public.menu_admins enable row level security;

revoke all on table public.menu_content from anon, authenticated;
revoke all on table public.menu_admins from anon, authenticated;
grant select on table public.menu_content to anon, authenticated;
grant update (content) on table public.menu_content to authenticated;

create or replace function public.is_menu_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.menu_admins
    where user_id = auth.uid()
  );
$function$;

revoke all on function public.is_menu_admin() from public;
grant execute on function public.is_menu_admin() to authenticated;

create policy "Menu is publicly readable"
on public.menu_content
for select
to anon, authenticated
using (true);

create policy "Only menu admins can update"
on public.menu_content
for update
to authenticated
using (public.is_menu_admin())
with check (public.is_menu_admin());

create or replace function public.set_menu_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

create trigger set_menu_updated_at
before update on public.menu_content
for each row
execute function public.set_menu_updated_at();

-- Create the Auth user first, then grant that user menu-admin access:
-- insert into public.menu_admins (user_id)
-- select id from auth.users where email = 'karizmatikberkbaba@pilavna.invalid'
-- on conflict (user_id) do nothing;
