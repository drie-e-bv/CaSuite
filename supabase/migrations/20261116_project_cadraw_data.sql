-- CaDraw (eendraadschema + situatieplan): 1 rij per project, zelfde opzet als project_cacalc_data.
-- Toegepast op 2026-11-16 (migratie "project_cadraw_data").
create table if not exists public.project_cadraw_data (
  id bigint generated always as identity primary key,
  project_id uuid not null unique references public.projecten(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  bijgewerkt_door text
);
alter table public.project_cadraw_data enable row level security;
create policy project_cadraw_data_select on public.project_cadraw_data for select to authenticated using (true);
create policy project_cadraw_data_insert on public.project_cadraw_data for insert to authenticated with check (true);
create policy project_cadraw_data_update on public.project_cadraw_data for update to authenticated using (true) with check (true);
create policy project_cadraw_data_delete on public.project_cadraw_data for delete to authenticated using (true);
