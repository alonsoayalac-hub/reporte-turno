-- Reporte de Turno: almacenamiento privado por usuario
create table if not exists public.user_app_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  areas jsonb not null default '[]'::jsonb,
  eventos jsonb not null default '[]'::jsonb,
  reuniones jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint user_app_data_areas_array check (jsonb_typeof(areas) = 'array'),
  constraint user_app_data_eventos_array check (jsonb_typeof(eventos) = 'array'),
  constraint user_app_data_reuniones_array check (jsonb_typeof(reuniones) = 'array')
);

alter table public.user_app_data enable row level security;

drop policy if exists "Users can read own app data" on public.user_app_data;
create policy "Users can read own app data"
  on public.user_app_data for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own app data" on public.user_app_data;
create policy "Users can insert own app data"
  on public.user_app_data for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own app data" on public.user_app_data;
create policy "Users can update own app data"
  on public.user_app_data for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own app data" on public.user_app_data;
create policy "Users can delete own app data"
  on public.user_app_data for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.user_app_data to authenticated;
