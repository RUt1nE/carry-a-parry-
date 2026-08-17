-- Feedback from players. Apply with: npm run db:push

create table if not exists public.feedbacks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  player_name text not null,
  rating integer not null check (rating between 1 and 5),
  message text not null check (char_length(message) <= 500),
  room numeric not null,
  created_at timestamptz not null default now()
);

alter table public.feedbacks enable row level security;

create policy "read own feedbacks"
  on public.feedbacks for select
  using (auth.uid() = user_id);

create policy "insert own feedbacks"
  on public.feedbacks for insert
  with check (auth.uid() = user_id);
