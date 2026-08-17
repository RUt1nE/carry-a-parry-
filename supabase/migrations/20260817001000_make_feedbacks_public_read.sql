-- Let everyone read feedbacks, while inserts still require an authenticated owner.

drop policy if exists "read own feedbacks" on public.feedbacks;

create policy "read public feedbacks"
  on public.feedbacks for select
  using (true);
