-- 1. TRIGGERS
-- Auto-update updated_at timestamp trigger function
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Bind triggers to posts and users
DROP TRIGGER IF EXISTS trg_posts_updated_at ON posts;
CREATE TRIGGER trg_posts_updated_at
BEFORE UPDATE ON posts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Auto-maintain rsvp_count on posts trigger function
CREATE OR REPLACE FUNCTION update_rsvp_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET rsvp_count = rsvp_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET rsvp_count = rsvp_count - 1 WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Bind triggers to rsvps table
DROP TRIGGER IF EXISTS trg_rsvp_count ON rsvps;
CREATE TRIGGER trg_rsvp_count
AFTER INSERT OR DELETE ON rsvps
FOR EACH ROW EXECUTE FUNCTION update_rsvp_count();

-- Auto-log posts history trigger function
CREATE OR REPLACE FUNCTION log_post_history()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO posts_history (post_id, title, body, type, status, changed_by)
    VALUES (NEW.id, NEW.title, NEW.body, NEW.type, NEW.status, NEW.author_id);
  ELSIF TG_OP = 'UPDATE' THEN
    -- In this app, only the author or admin updates the post. Since we don't always have the user who changed it in the context of the query, we can use the author_id for now or leave it null if not known. 
    -- Actually, we have the user who changed it in the session, but Postgres triggers don't have access to the Express session. 
    -- So we'll use author_id as a fallback.
    INSERT INTO posts_history (post_id, title, body, type, status, changed_by)
    VALUES (NEW.id, NEW.title, NEW.body, NEW.type, NEW.status, NEW.author_id);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Bind triggers to posts table
DROP TRIGGER IF EXISTS trg_posts_history ON posts;
CREATE TRIGGER trg_posts_history
AFTER INSERT OR UPDATE ON posts
FOR EACH ROW EXECUTE FUNCTION log_post_history();



-- 2. STORED FUNCTIONS / PROCEDURES
-- Toggle RSVP function: insert if not exists, else delete
CREATE OR REPLACE FUNCTION toggle_rsvp(p_post_id UUID, p_user_id UUID)
RETURNS TEXT AS $$
DECLARE
  existing_id UUID;
BEGIN
  SELECT id INTO existing_id FROM rsvps
  WHERE post_id = p_post_id AND user_id = p_user_id;

  IF existing_id IS NOT NULL THEN
    DELETE FROM rsvps WHERE id = existing_id;
    RETURN 'removed';
  ELSE
    INSERT INTO rsvps (post_id, user_id) VALUES (p_post_id, p_user_id);
    RETURN 'added';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Get upcoming deadlines function
CREATE OR REPLACE FUNCTION get_upcoming_deadlines(days_ahead INT DEFAULT 30)
RETURNS TABLE (id UUID, title VARCHAR, type TEXT, deadline_date TIMESTAMPTZ) AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.title, p.type::TEXT, p.deadline_date
  FROM posts p
  WHERE p.deadline_date IS NOT NULL
    AND p.status = 'published'
    AND p.deadline_date BETWEEN now() AND now() + (days_ahead || ' days')::INTERVAL
  ORDER BY p.deadline_date ASC;
END;
$$ LANGUAGE plpgsql;


-- 3. VIEWS
-- Feed View: Joined view of posts, societies, and campuses for general feed loading
CREATE OR REPLACE VIEW feed_view AS
SELECT
  p.id, p.title, p.body, p.type, p.event_date, p.deadline_date,
  p.venue, p.rsvp_count, p.view_count, p.created_at, p.campus_scope, p.campus_id, p.society_id, p.image_url,
  s.name AS society_name, s.logo_url AS society_logo, s.color_hex AS society_color,
  c.name AS campus_name
FROM posts p
LEFT JOIN societies s ON p.society_id = s.id
LEFT JOIN campuses c ON p.campus_id = c.id
WHERE p.status = 'published';

-- Trending posts (materialized view) for homepage analytics and highlights
DROP MATERIALIZED VIEW IF EXISTS trending_posts;
CREATE MATERIALIZED VIEW trending_posts AS
SELECT id, title, type, rsvp_count, view_count,
       (rsvp_count * 2 + view_count) AS trend_score
FROM posts
WHERE created_at >= now() - INTERVAL '7 days'
  AND status = 'published'
ORDER BY trend_score DESC
LIMIT 20;

-- Create index on materialized view to speed up access
CREATE UNIQUE INDEX IF NOT EXISTS idx_trending_posts_id ON trending_posts(id);


-- 4. INDEXES
-- Indexing campus_id, type, and event_date for feed sorting and filtering
CREATE INDEX IF NOT EXISTS idx_posts_campus ON posts(campus_id);
CREATE INDEX IF NOT EXISTS idx_posts_type ON posts(type);
CREATE INDEX IF NOT EXISTS idx_posts_event_date ON posts(event_date);

-- Full-text GIN search index on post title and body
CREATE INDEX IF NOT EXISTS idx_posts_search ON posts USING GIN (to_tsvector('english', title || ' ' || body));


-- 5. CONSTRAINTS
-- Deadline must be after creation date
ALTER TABLE posts DROP CONSTRAINT IF EXISTS chk_deadline_after_created;
ALTER TABLE posts ADD CONSTRAINT chk_deadline_after_created
  CHECK (deadline_date IS NULL OR deadline_date > created_at);

-- Event posts must have an event_date
ALTER TABLE posts DROP CONSTRAINT IF EXISTS chk_event_has_date;
ALTER TABLE posts ADD CONSTRAINT chk_event_has_date
  CHECK (type != 'event' OR event_date IS NOT NULL);

-- Scholarship/internship/job posts must have a deadline
ALTER TABLE posts DROP CONSTRAINT IF EXISTS chk_opportunity_has_deadline;
ALTER TABLE posts ADD CONSTRAINT chk_opportunity_has_deadline
  CHECK (type NOT IN ('scholarship','internship','job') OR deadline_date IS NOT NULL);
