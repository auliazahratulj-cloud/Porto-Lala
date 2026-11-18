-- Jalankan di Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;

create or replace function public.is_portfolio_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;
revoke all on function public.is_portfolio_admin() from public;
grant execute on function public.is_portfolio_admin() to anon, authenticated;

create table if not exists public.profiles (
  id text primary key default 'main' check (id = 'main'),
  full_name text not null default 'Aulia Zahratul Jannah',
  headline text not null default 'Electrical Engineering Student',
  biography text,
  profile_image text,
  email text,
  linkedin_url text,
  instagram_url text,
  cv_file text,
  updated_at timestamptz not null default now()
);
insert into public.profiles (id, full_name, headline, biography)
values ('main','Aulia Zahratul Jannah','Electrical Engineering Student','Welcome to my personal portfolio.')
on conflict (id) do nothing;

create table if not exists public.education (
  id uuid primary key default gen_random_uuid(), institution text not null, major text, degree text,
  start_year integer, end_year integer, description text,
  status text not null default 'published' check(status in ('draft','published')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.journeys (
  id uuid primary key default gen_random_uuid(), title text not null, period text, category text, description text, image text, year integer,
  status text not null default 'published' check(status in ('draft','published')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.achievements (
  id uuid primary key default gen_random_uuid(), title text not null, competition_name text, organizer text, award text, level text, category text,
  year integer, description text, certificate_image text,
  status text not null default 'draft' check(status in ('draft','published')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.experiences (
  id uuid primary key default gen_random_uuid(), organization_name text not null, position text, start_date text, end_date text, category text,
  description text, contribution text, image text,
  status text not null default 'draft' check(status in ('draft','published')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(), title text not null, category text, year integer, description text, problem text, solution text,
  technologies text, role text, result text, image text, repository_url text,
  status text not null default 'draft' check(status in ('draft','published')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- Update timestamp otomatis.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
do $$ declare t text; begin
  foreach t in array array['profiles','education','journeys','achievements','experiences','projects'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- Row Level Security: publik hanya membaca data published; admin dapat mengelola semua data.
do $$ declare t text; begin
  foreach t in array array['education','journeys','achievements','experiences','projects'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Public read published" on public.%I', t);
    execute format('create policy "Public read published" on public.%I for select to anon, authenticated using (status = ''published'' or public.is_portfolio_admin())', t);
    execute format('drop policy if exists "Admin manage content" on public.%I', t);
    execute format('create policy "Admin manage content" on public.%I for all to authenticated using (public.is_portfolio_admin()) with check (public.is_portfolio_admin())', t);
  end loop;
end $$;

alter table public.profiles enable row level security;
drop policy if exists "Public read profile" on public.profiles;
create policy "Public read profile" on public.profiles for select to anon, authenticated using (true);
drop policy if exists "Admin manage profile" on public.profiles;
create policy "Admin manage profile" on public.profiles for all to authenticated using (public.is_portfolio_admin()) with check (public.is_portfolio_admin());

-- Storage bucket untuk foto, sertifikat, dan CV. File dapat dibaca publik; upload/delete hanya admin.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portfolio-media','portfolio-media',true,5242880,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "Public read portfolio media" on storage.objects;
create policy "Public read portfolio media" on storage.objects for select to anon, authenticated using (bucket_id = 'portfolio-media');
drop policy if exists "Admin upload portfolio media" on storage.objects;
create policy "Admin upload portfolio media" on storage.objects for insert to authenticated with check (bucket_id = 'portfolio-media' and public.is_portfolio_admin());
drop policy if exists "Admin update portfolio media" on storage.objects;
create policy "Admin update portfolio media" on storage.objects for update to authenticated using (bucket_id = 'portfolio-media' and public.is_portfolio_admin()) with check (bucket_id = 'portfolio-media' and public.is_portfolio_admin());
drop policy if exists "Admin delete portfolio media" on storage.objects;
create policy "Admin delete portfolio media" on storage.objects for delete to authenticated using (bucket_id = 'portfolio-media' and public.is_portfolio_admin());
