-- Migration: 20260416_avatars_storage_rls
-- Sets up the public "avatars" bucket and correct RLS policies so
-- authenticated users can upload/update/delete only their own avatar
-- (stored at avatars/{user_id}/{filename}) while the world can read.
--
-- Run this in the Supabase SQL Editor.
-- Also ensure the "avatars" bucket exists and is marked Public in
-- the Supabase Storage dashboard before running these policies.

-- Drop any stale policies that may conflict
DROP POLICY IF EXISTS "Users can upload their own avatar"  ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar"  ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatar"  ON storage.objects;
DROP POLICY IF EXISTS "Avatars are publicly readable"      ON storage.objects;

-- Allow authenticated users to upload their own avatar
CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to update their own avatar
CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow authenticated users to delete their own avatar
CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow public read access to all avatars
CREATE POLICY "Avatars are publicly readable"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');
