-- ZabNex Migration: Fix trending_posts view and get_upcoming_deadlines function
-- Run this against your PostgreSQL database to apply the fixes
-- =========================================================

-- Step 1: Drop and recreate get_upcoming_deadlines with full fields
CREATE OR REPLACE FUNCTION get_upcoming_deadlines(days_ahead INT DEFAULT 30)
RETURNS TABLE (
  id INTEGER, title VARCHAR, type TEXT, deadline_date TIMESTAMPTZ,
  body TEXT, image_url TEXT, society_name VARCHAR, society_logo TEXT,
  society_color VARCHAR, campus_name VARCHAR, view_count INTEGER, rsvp_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.title, p.type::TEXT, p.deadline_date,
         p.body, p.image_url, s.name AS society_name, s.logo_url AS society_logo,
         s.color_hex AS society_color, c.name AS campus_name, p.view_count, p.rsvp_count
  FROM posts p
  LEFT JOIN societies s ON p.society_id = s.id
  LEFT JOIN campuses c ON p.campus_id = c.id
  WHERE p.deadline_date IS NOT NULL
    AND p.status = 'published'
    AND p.deadline_date BETWEEN now() AND now() + (days_ahead || ' days')::INTERVAL
  ORDER BY p.deadline_date ASC;
END;
$$ LANGUAGE plpgsql;

-- Step 2: Drop and recreate trending_posts materialized view with full fields
DROP MATERIALIZED VIEW IF EXISTS trending_posts;
CREATE MATERIALIZED VIEW trending_posts AS
SELECT
  p.id, p.title, p.body, p.type, p.rsvp_count, p.view_count, p.image_url,
  p.deadline_date, p.event_date, p.campus_id, p.campus_scope,
  (p.rsvp_count * 2 + p.view_count) AS trend_score,
  s.name AS society_name, s.logo_url AS society_logo, s.color_hex AS society_color,
  c.name AS campus_name
FROM posts p
LEFT JOIN societies s ON p.society_id = s.id
LEFT JOIN campuses c ON p.campus_id = c.id
WHERE p.created_at >= now() - INTERVAL '7 days'
  AND p.status = 'published'
ORDER BY trend_score DESC
LIMIT 20;

-- Step 3: Recreate unique index on materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_trending_posts_id ON trending_posts(id);

-- Done!
SELECT 'Migration applied successfully.' AS result;
