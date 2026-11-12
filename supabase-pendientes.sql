-- Reporte de Turno: habilitar pendientes del turno anterior.
-- Ejecutar una sola vez en Supabase > SQL Editor.
alter table public.user_app_data add column if not exists pendientes jsonb not null default '[]'::jsonb;
alter table public.user_app_data drop constraint if exists user_app_data_pendientes_array;
alter table public.user_app_data add constraint user_app_data_pendientes_array check (jsonb_typeof(pendientes) = 'array');
