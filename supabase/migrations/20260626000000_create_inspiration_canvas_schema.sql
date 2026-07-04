create extension if not exists pgcrypto;

create table if not exists public.canvases (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Untitled inspiration canvas',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists canvases_user_default_idx
  on public.canvases (user_id)
  where is_default;

create index if not exists canvases_user_idx on public.canvases (user_id);

create table if not exists public.media_items (
  id text primary key default gen_random_uuid()::text,
  canvas_id text not null references public.canvases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  url text not null,
  storage_driver text not null default 'supabase'
    check (storage_driver in ('local', 'blob', 'supabase')),
  storage_key text not null,
  thumbnail_url text,
  thumbnail_storage_key text,
  mime_type text not null,
  file_name text not null,
  title text,
  size_bytes bigint not null,
  intrinsic_width double precision,
  intrinsic_height double precision,
  duration_seconds double precision,
  x double precision not null default 240,
  y double precision not null default 180,
  width double precision not null default 360,
  height double precision not null default 260,
  z_index bigint not null default 0,
  rotation double precision not null default 0,
  crop_json jsonb,
  tags_json jsonb not null default '[]'::jsonb,
  category text,
  subcategory text,
  description text,
  design_analysis_json jsonb,
  analysis_status text not null default 'pending',
  analysis_error text,
  parent_ids_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists media_items_canvas_idx on public.media_items (canvas_id);
create index if not exists media_items_user_idx on public.media_items (user_id);
create index if not exists media_items_analysis_status_idx on public.media_items (analysis_status);

create table if not exists public.comments (
  id text primary key default gen_random_uuid()::text,
  media_item_id text not null references public.media_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists comments_media_idx on public.comments (media_item_id);
create index if not exists comments_user_idx on public.comments (user_id);

create table if not exists public.taste_briefs (
  id text primary key default gen_random_uuid()::text,
  canvas_id text not null references public.canvases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  media_item_ids_json jsonb not null default '[]'::jsonb,
  text text not null,
  created_at timestamptz not null default now()
);

create index if not exists taste_briefs_canvas_idx on public.taste_briefs (canvas_id);
create index if not exists taste_briefs_user_idx on public.taste_briefs (user_id);

create table if not exists public.generation_runs (
  id text primary key default gen_random_uuid()::text,
  canvas_id text not null references public.canvases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  media_item_ids_json jsonb not null default '[]'::jsonb,
  status text not null default 'pending',
  prompt text not null,
  result_media_item_id text references public.media_items(id) on delete set null,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists generation_runs_canvas_idx on public.generation_runs (canvas_id);
create index if not exists generation_runs_user_idx on public.generation_runs (user_id);

create table if not exists public.agent_tool_approvals (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users(id) on delete cascade,
  tool_name text not null,
  canvas_id text references public.canvases(id) on delete cascade,
  media_item_ids_json jsonb not null default '[]'::jsonb,
  payload_json jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_tool_approvals_status_idx
  on public.agent_tool_approvals (status);
create index if not exists agent_tool_approvals_user_idx
  on public.agent_tool_approvals (user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists canvases_set_updated_at on public.canvases;
create trigger canvases_set_updated_at
  before update on public.canvases
  for each row execute function public.set_updated_at();

drop trigger if exists media_items_set_updated_at on public.media_items;
create trigger media_items_set_updated_at
  before update on public.media_items
  for each row execute function public.set_updated_at();

drop trigger if exists comments_set_updated_at on public.comments;
create trigger comments_set_updated_at
  before update on public.comments
  for each row execute function public.set_updated_at();

drop trigger if exists generation_runs_set_updated_at on public.generation_runs;
create trigger generation_runs_set_updated_at
  before update on public.generation_runs
  for each row execute function public.set_updated_at();

drop trigger if exists agent_tool_approvals_set_updated_at on public.agent_tool_approvals;
create trigger agent_tool_approvals_set_updated_at
  before update on public.agent_tool_approvals
  for each row execute function public.set_updated_at();

alter table public.canvases enable row level security;
alter table public.media_items enable row level security;
alter table public.comments enable row level security;
alter table public.taste_briefs enable row level security;
alter table public.generation_runs enable row level security;
alter table public.agent_tool_approvals enable row level security;

create policy "Users read own canvases" on public.canvases
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users create own canvases" on public.canvases
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update own canvases" on public.canvases
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users delete own canvases" on public.canvases
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users read own media" on public.media_items
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users create own media" on public.media_items
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update own media" on public.media_items
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users delete own media" on public.media_items
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users read own comments" on public.comments
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users create own comments" on public.comments
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update own comments" on public.comments
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users delete own comments" on public.comments
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users read own taste briefs" on public.taste_briefs
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users create own taste briefs" on public.taste_briefs
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users read own generation runs" on public.generation_runs
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users create own generation runs" on public.generation_runs
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update own generation runs" on public.generation_runs
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users read own approvals" on public.agent_tool_approvals
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users create own approvals" on public.agent_tool_approvals
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update own approvals" on public.agent_tool_approvals
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.canvases,
  public.media_items,
  public.comments,
  public.taste_briefs,
  public.generation_runs,
  public.agent_tool_approvals
to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'inspiration-media',
  'inspiration-media',
  true,
  52428800,
  array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/quicktime',
    'video/webm'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Users read own canvas media objects" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'inspiration-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users upload own canvas media objects" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'inspiration-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users update own canvas media objects" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'inspiration-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'inspiration-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users delete own canvas media objects" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'inspiration-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
