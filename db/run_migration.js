const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_IHo8sLBPUO2y@ep-wandering-morning-atynzros-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
});

const steps = [
  {
    name: 'DROP get_upcoming_deadlines',
    sql: 'DROP FUNCTION IF EXISTS get_upcoming_deadlines(INT)'
  },
  {
    name: 'CREATE get_upcoming_deadlines (full fields)',
    sql: `CREATE OR REPLACE FUNCTION get_upcoming_deadlines(days_ahead INT DEFAULT 30)
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
$$ LANGUAGE plpgsql`
  },
  {
    name: 'DROP trending_posts materialized view',
    sql: 'DROP MATERIALIZED VIEW IF EXISTS trending_posts'
  },
  {
    name: 'CREATE trending_posts materialized view (full fields)',
    sql: `CREATE MATERIALIZED VIEW trending_posts AS
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
LIMIT 20`
  },
  {
    name: 'CREATE UNIQUE INDEX on trending_posts',
    sql: 'CREATE UNIQUE INDEX IF NOT EXISTS idx_trending_posts_id ON trending_posts(id)'
  }
];

(async () => {
  for (const step of steps) {
    try {
      await pool.query(step.sql);
      console.log('[OK]', step.name);
    } catch (e) {
      console.error('[FAIL]', step.name, '->', e.message);
    }
  }
  console.log('\nMigration complete.');
  await pool.end();
})();
