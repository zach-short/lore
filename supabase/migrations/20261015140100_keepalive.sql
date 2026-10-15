-- Called by the keepalive workflow so the project is not paused for inactivity.
-- It reads no table and returns no data.

create function public.keepalive()
returns integer
language sql
stable
security invoker
set search_path = ''
as $$ select 1 $$;

revoke all on function public.keepalive() from public;
grant execute on function public.keepalive() to anon;
