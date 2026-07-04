-- Migration: convert existing UUID PKs to SERIAL integer IDs
BEGIN;

-- 1. Add temporary SERIAL columns
ALTER TABLE campuses   ADD COLUMN new_id SERIAL;
ALTER TABLE users      ADD COLUMN new_id SERIAL;
ALTER TABLE societies   ADD COLUMN new_id SERIAL;
ALTER TABLE society_members ADD COLUMN new_id SERIAL;
ALTER TABLE posts      ADD COLUMN new_id SERIAL;
ALTER TABLE rsvps      ADD COLUMN new_id SERIAL;
ALTER TABLE saved_posts ADD COLUMN new_id SERIAL;
ALTER TABLE notifications ADD COLUMN new_id SERIAL;
ALTER TABLE login_history ADD COLUMN new_id SERIAL;
ALTER TABLE posts_history ADD COLUMN new_id SERIAL;

-- 2. Drop FK constraints that reference old UUID ids (generated names may differ)
ALTER TABLE society_members DROP CONSTRAINT IF EXISTS society_members_society_id_fkey;
ALTER TABLE society_members DROP CONSTRAINT IF EXISTS society_members_user_id_fkey;
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_campus_id_fkey;
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_society_id_fkey;
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_author_id_fkey;
ALTER TABLE rsvps DROP CONSTRAINT IF EXISTS rsvps_post_id_fkey;
ALTER TABLE rsvps DROP CONSTRAINT IF EXISTS rsvps_user_id_fkey;
ALTER TABLE saved_posts DROP CONSTRAINT IF EXISTS saved_posts_post_id_fkey;
ALTER TABLE saved_posts DROP CONSTRAINT IF EXISTS saved_posts_user_id_fkey;
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;
ALTER TABLE login_history DROP CONSTRAINT IF EXISTS login_history_user_id_fkey;
ALTER TABLE posts_history DROP CONSTRAINT IF EXISTS posts_history_post_id_fkey;

-- 3. Update child tables to reference new integer ids
UPDATE society_members   sm SET society_id = s.new_id FROM societies s WHERE sm.society_id = s.id;
UPDATE society_members   sm SET user_id    = u.new_id FROM users u WHERE sm.user_id = u.id;
UPDATE posts            p  SET campus_id  = c.new_id FROM campuses c WHERE p.campus_id = c.id;
UPDATE posts            p  SET society_id = s.new_id FROM societies s WHERE p.society_id = s.id;
UPDATE posts            p  SET author_id  = u.new_id FROM users u WHERE p.author_id = u.id;
UPDATE rsvps            r  SET post_id = p.new_id FROM posts p WHERE r.post_id = p.id;
UPDATE rsvps            r  SET user_id = u.new_id FROM users u WHERE r.user_id = u.id;
UPDATE saved_posts      sp SET post_id = p.new_id FROM posts p WHERE sp.post_id = p.id;
UPDATE saved_posts      sp SET user_id = u.new_id FROM users u WHERE sp.user_id = u.id;
UPDATE notifications    n  SET user_id = u.new_id FROM users u WHERE n.user_id = u.id;
UPDATE login_history    lh SET user_id = u.new_id FROM users u WHERE lh.user_id = u.id;
UPDATE posts_history    ph SET post_id = p.new_id FROM posts p WHERE ph.post_id = p.id;

-- 4. Drop old UUID id columns
ALTER TABLE campuses   DROP COLUMN id;
ALTER TABLE users      DROP COLUMN id;
ALTER TABLE societies   DROP COLUMN id;
ALTER TABLE society_members DROP COLUMN id;
ALTER TABLE posts      DROP COLUMN id;
ALTER TABLE rsvps      DROP COLUMN id;
ALTER TABLE saved_posts DROP COLUMN id;
ALTER TABLE notifications DROP COLUMN id;
ALTER TABLE login_history DROP COLUMN id;
ALTER TABLE posts_history DROP COLUMN id;

-- 5. Rename new_id to id
ALTER TABLE campuses   RENAME COLUMN new_id TO id;
ALTER TABLE users      RENAME COLUMN new_id TO id;
ALTER TABLE societies   RENAME COLUMN new_id TO id;
ALTER TABLE society_members RENAME COLUMN new_id TO id;
ALTER TABLE posts      RENAME COLUMN new_id TO id;
ALTER TABLE rsvps      RENAME COLUMN new_id TO id;
ALTER TABLE saved_posts RENAME COLUMN new_id TO id;
ALTER TABLE notifications RENAME COLUMN new_id TO id;
ALTER TABLE login_history RENAME COLUMN new_id TO id;
ALTER TABLE posts_history RENAME COLUMN new_id TO id;

-- 6. Re‑add primary keys (they are now on SERIAL columns)
ALTER TABLE campuses   ADD PRIMARY KEY (id);
ALTER TABLE users      ADD PRIMARY KEY (id);
ALTER TABLE societies   ADD PRIMARY KEY (id);
ALTER TABLE society_members ADD PRIMARY KEY (id);
ALTER TABLE posts      ADD PRIMARY KEY (id);
ALTER TABLE rsvps      ADD PRIMARY KEY (id);
ALTER TABLE saved_posts ADD PRIMARY KEY (id);
ALTER TABLE notifications ADD PRIMARY KEY (id);
ALTER TABLE login_history ADD PRIMARY KEY (id);
ALTER TABLE posts_history ADD PRIMARY KEY (id);

-- 7. Re‑create foreign‑key constraints (now referencing INTEGER ids)
ALTER TABLE society_members ADD CONSTRAINT society_members_society_id_fkey FOREIGN KEY (society_id) REFERENCES societies(id) ON DELETE CASCADE;
ALTER TABLE society_members ADD CONSTRAINT society_members_user_id_fkey    FOREIGN KEY (user_id)    REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE posts ADD CONSTRAINT posts_campus_id_fkey    FOREIGN KEY (campus_id) REFERENCES campuses(id);
ALTER TABLE posts ADD CONSTRAINT posts_society_id_fkey   FOREIGN KEY (society_id) REFERENCES societies(id);
ALTER TABLE posts ADD CONSTRAINT posts_author_id_fkey    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE rsvps ADD CONSTRAINT rsvps_post_id_fkey      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE;
ALTER TABLE rsvps ADD CONSTRAINT rsvps_user_id_fkey      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE saved_posts ADD CONSTRAINT saved_posts_post_id_fkey FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE;
ALTER TABLE saved_posts ADD CONSTRAINT saved_posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE login_history ADD CONSTRAINT login_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE posts_history ADD CONSTRAINT posts_history_post_id_fkey FOREIGN KEY (post_id) REFERENCES posts(id);

COMMIT;
VACUUM ANALYZE;
