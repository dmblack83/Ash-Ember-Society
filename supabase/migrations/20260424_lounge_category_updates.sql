-- ============================================================
-- Lounge category updates
-- - Add "Welcome/Introductions" as the first category
-- - Rename "The Lounge" -> "General Discussion"
-- - Update descriptions and sort order for all categories
-- Run in the Supabase SQL editor
-- ============================================================

-- 1. Insert Welcome/Introductions (sort_order 1)
insert into forum_categories (name, slug, description, sort_order, is_locked, is_gate)
values (
  'Welcome/Introductions',
  'welcome',
  'Welcome to Ash & Ember. Introduce yourself to the society.',
  1,
  false,
  false
)
on conflict (slug) do update
  set name        = excluded.name,
      description = excluded.description,
      sort_order  = excluded.sort_order;

-- 2. General Discussion (was "The Lounge") — sort_order 2
update forum_categories
set
  name        = 'General Discussion',
  slug        = 'general-discussion',
  description = 'Our catch-all corner for the off-topic and the everyday.',
  sort_order  = 2
where slug in ('lounge', 'the-lounge', 'general', 'general-discussion')
   or lower(name) in ('the lounge', 'lounge', 'general discussion');

-- 3. Cigar Room — sort_order 3, updated description
update forum_categories
set
  name        = 'Cigar Room',
  description = 'A space dedicated to the leaf. Share your latest smokes, seek humidification advice, and discuss the nuances of your favorite wrappers.',
  sort_order  = 3
where slug = 'cigar-room'
   or lower(name) = 'cigar room';

-- 4. Burn Reports — sort_order 4 (no other changes)
update forum_categories
set sort_order = 4
where slug = 'burn-reports'
   or lower(name) = 'burn reports';

-- 5. Speakeasy — sort_order 5 (no other changes)
update forum_categories
set sort_order = 5
where slug = 'speakeasy'
   or lower(name) = 'speakeasy';
