-- ================================================================
-- PulseNet — Supabase security policies
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)
-- ================================================================

-- 1. Enable RLS on pulses table (idempotent)
ALTER TABLE pulses ENABLE ROW LEVEL SECURITY;

-- 2. Drop any existing policies to avoid conflicts
DROP POLICY IF EXISTS "Public read"   ON pulses;
DROP POLICY IF EXISTS "anon_select"   ON pulses;
DROP POLICY IF EXISTS "agent_insert"  ON pulses;
DROP POLICY IF EXISTS "deny_update"   ON pulses;
DROP POLICY IF EXISTS "deny_delete"   ON pulses;

-- 3. Anon users: SELECT only, no write access
CREATE POLICY "anon_select" ON pulses
  FOR SELECT TO anon USING (true);

-- 4. Service role (used by the agent) bypasses RLS automatically.
--    No explicit policy needed — service key has full access.

-- 5. Explicitly deny insert/update/delete for anon and authenticated roles
--    (Belt-and-suspenders: no policy = deny, but being explicit is safer)
CREATE POLICY "deny_anon_insert" ON pulses
  FOR INSERT TO anon WITH CHECK (false);

CREATE POLICY "deny_anon_update" ON pulses
  FOR UPDATE TO anon USING (false);

CREATE POLICY "deny_anon_delete" ON pulses
  FOR DELETE TO anon USING (false);


-- ================================================================
-- Storage bucket policies (if you create a 'pulses' bucket)
-- Only the service role (agent) can upload; public can read images.
-- ================================================================

-- Uncomment if you create a storage bucket named 'pulses':
--
-- INSERT INTO storage.buckets (id, name, public)
--   VALUES ('pulses', 'pulses', true)
--   ON CONFLICT DO NOTHING;
--
-- DROP POLICY IF EXISTS "public_read"     ON storage.objects;
-- DROP POLICY IF EXISTS "agent_upload"    ON storage.objects;
-- DROP POLICY IF EXISTS "deny_anon_write" ON storage.objects;
--
-- -- Public can read objects in the bucket
-- CREATE POLICY "public_read" ON storage.objects
--   FOR SELECT USING (bucket_id = 'pulses');
--
-- -- Only service role can insert/update/delete (anon cannot upload)
-- CREATE POLICY "deny_anon_write" ON storage.objects
--   FOR INSERT TO anon WITH CHECK (false);
