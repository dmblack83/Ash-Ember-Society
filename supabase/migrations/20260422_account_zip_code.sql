-- Add zip_code column to profiles for location-based features
alter table profiles add column if not exists zip_code text;
