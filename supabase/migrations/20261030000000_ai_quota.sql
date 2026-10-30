-- Atomic quota accounting for the AI Edge Functions.
-- Only the service role (Edge Functions) can touch this table or call the function.

create table if not exists public.ai_usage (
  user_id uuid not null,
  bucket text not null check (bucket in ('minute', 'day', 'global_day')),
  window_start timestamptz not null,
  used integer not null default 0,
  primary key (user_id, bucket, window_start)
);

alter table public.ai_usage enable row level security;
-- No policies on purpose: anon/authenticated clients can never read or write usage.
revoke all on public.ai_usage from anon, authenticated;

create or replace function public.consume_ai_quota(
  p_user uuid,
  p_weight integer,
  p_minute_limit integer,
  p_day_limit integer,
  p_global_day_limit integer
) returns table (allowed boolean, retry_after integer, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_minute timestamptz := date_trunc('minute', v_now);
  v_day timestamptz := date_trunc('day', v_now);
  v_global uuid := '00000000-0000-0000-0000-000000000000';
  u_min integer;
  u_day integer;
  g_day integer;
begin
  insert into ai_usage as t (user_id, bucket, window_start, used) values (p_user, 'minute', v_minute, p_weight)
    on conflict (user_id, bucket, window_start) do update set used = t.used + p_weight returning t.used into u_min;
  insert into ai_usage as t (user_id, bucket, window_start, used) values (p_user, 'day', v_day, p_weight)
    on conflict (user_id, bucket, window_start) do update set used = t.used + p_weight returning t.used into u_day;
  insert into ai_usage as t (user_id, bucket, window_start, used) values (v_global, 'global_day', v_day, p_weight)
    on conflict (user_id, bucket, window_start) do update set used = t.used + p_weight returning t.used into g_day;

  -- Old windows are cheap to drop opportunistically.
  delete from ai_usage where window_start < v_day - interval '2 days';

  if u_min > p_minute_limit then
    return query select false, greatest(1, ceil(extract(epoch from (v_minute + interval '1 minute' - v_now)))::integer), 'minute'::text;
  elsif u_day > p_day_limit then
    return query select false, greatest(1, ceil(extract(epoch from (v_day + interval '1 day' - v_now)))::integer), 'day'::text;
  elsif g_day > p_global_day_limit then
    return query select false, greatest(1, ceil(extract(epoch from (v_day + interval '1 day' - v_now)))::integer), 'global'::text;
  end if;
  return query select true, 0, 'ok'::text;
end;
$$;

revoke all on function public.consume_ai_quota(uuid, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_ai_quota(uuid, integer, integer, integer, integer) to service_role;
