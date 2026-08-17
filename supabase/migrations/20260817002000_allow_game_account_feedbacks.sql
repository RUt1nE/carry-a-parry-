-- Local game accounts are not Supabase auth users, so feedback can be anonymous.

alter table public.feedbacks
  alter column user_id drop not null;

drop policy if exists "insert own feedbacks" on public.feedbacks;

create policy "insert feedbacks from game accounts"
  on public.feedbacks for insert
  with check (true);
