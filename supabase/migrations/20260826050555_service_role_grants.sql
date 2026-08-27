-- The pipeline (lore pull / publish) talks to PostgREST with the
-- service role key, and new projects grant Data API roles nothing by default
-- (changelog 2026-04-28) — so grant the pipeline's reads and writes
-- explicitly. service_role bypasses RLS once table access exists.
grant select on public.profiles to service_role;
grant select, update on public.uploads to service_role;
