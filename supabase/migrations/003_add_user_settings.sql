-- Create user_settings table to store per-user portfolio preferences
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  portfolio_size numeric,
  daily_contract_budget numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger update_user_settings_updated_at
before update on public.user_settings
for each row
execute procedure public.update_updated_at_column();

alter table public.user_settings enable row level security;

create policy "Users can view their settings"
  on public.user_settings for select
  using (auth.uid() = user_id);

create policy "Users can upsert their settings"
  on public.user_settings for insert
  with check (auth.uid() = user_id);

create policy "Users can update their settings"
  on public.user_settings for update
  using (auth.uid() = user_id);
