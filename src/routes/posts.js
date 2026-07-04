const express = require('express');
const pool = require('../config/db');
const authMiddleware = require('../middleware/auth');
const { requireRole, requirePostOwnership } = require('../middleware/rbac');
const { validatePost } = require('../middleware/validate');
const { upload, getFileUrl } = require('../config/firebase');
const router = express.Router();

// GET /api/v1/posts - Query Feed (uses database View 'feed_view' and filters)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { campus_id, type, society_id, search } = req.query;

    let query = `
      SELECT id, title, body, type, event_date, deadline_date, venue, 
             rsvp_count, view_count, created_at, campus_scope, campus_id, society_id, image_url,
             society_name, society_logo, society_color, campus_name
      FROM feed_view 
      WHERE 1=1
    `;
    const params = [];

    if (campus_id) {
      params.push(campus_id);
      query += ` AND (campus_scope = 'all' OR campus_id = $${params.length}::integer)`;
    }

    if (type) {
      params.push(type);
      query += ` AND type = $${params.length}::"PostType"`;
    }

    if (society_id) {
      params.push(society_id);
      query += ` AND society_id = $${params.length}::integer`;
    }

    if (search && search.trim().length > 0) {
      params.push(search.trim());
      query += ` AND to_tsvector('english', title || ' ' || body) @@ plainto_tsquery('english', $${params.length})`;
    }

    query += ` ORDER BY created_at DESC`;

    const { rows: posts } = await pool.query(query, params);
    res.status(200).json(posts);
  } catch (error) {
    console.error('Fetch Feed View Error:', error);
    res.status(500).json({ error: 'Internal server error loading feed.' });
  }
});

// GET /api/v1/posts/trending - Materialized view query
router.get('/trending', authMiddleware, async (req, res) => {
  try {
    await pool.query('REFRESH MATERIALIZED VIEW trending_posts');
    const { rows: trending } = await pool.query('SELECT * FROM trending_posts');
    res.status(200).json(trending);
  } catch (error) {
    console.error('Trending Posts Error:', error);
    res.status(500).json({ error: 'Internal server error loading trending posts.' });
  }
});

// GET /api/v1/posts/deadlines - Stored function lookup
router.get('/deadlines', authMiddleware, async (req, res) => {
  try {
    const days = req.query.days ? parseInt(req.query.days) : 30;
    const { rows: deadlines } = await pool.query('SELECT * FROM get_upcoming_deadlines($1)', [days]);
    res.status(200).json(deadlines);
  } catch (error) {
    console.error('Deadlines Stored Function Error:', error);
    res.status(500).json({ error: 'Internal server error fetching deadlines.' });
  }
});

// GET /api/v1/posts/saved - Get bookmarked posts for logged-in user
router.get('/saved', authMiddleware, async (req, res) => {
  try {
    const userId = req.session.user.id;

    const { rows: saved } = await pool.query(`
      SELECT p.id, p.title, p.body, p.type, p.event_date, p.deadline_date,
             p.venue, p.rsvp_count, p.view_count, p.created_at, p.image_url,
             s.name as society_name, s.logo_url as society_logo, c.name as campus_name
      FROM saved_posts sp
      JOIN posts p ON sp.post_id = p.id
      LEFT JOIN societies s ON p.society_id = s.id
      LEFT JOIN campuses c ON p.campus_id = c.id
      WHERE sp.user_id = $1
      ORDER BY sp.saved_at DESC
    `, [userId]);

    res.status(200).json(saved);
  } catch (error) {
    console.error('Fetch Saved Posts Error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/v1/posts/:id - Get single post and increment view count
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;

    // Increment view count
    const postRes = await pool.query(`
      UPDATE posts SET view_count = view_count + 1 WHERE id = $1 
      RETURNING *
    `, [id]);

    if (postRes.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found.' });
    }
    const post = postRes.rows[0];

    // Fetch related data
    const relatedRes = await pool.query(`
      SELECT 
        (SELECT json_build_object('name', name, 'logo_url', logo_url, 'color_hex', color_hex) FROM societies WHERE id = $1) as society,
        (SELECT json_build_object('name', name, 'block_number', block_number) FROM campuses WHERE id = $2) as campus,
        (SELECT json_build_object('full_name', full_name) FROM users WHERE id = $3) as author
    `, [post.society_id, post.campus_id, post.author_id]);

    post.society = relatedRes.rows[0].society;
    post.campus = relatedRes.rows[0].campus;
    post.author = relatedRes.rows[0].author;

    const rsvpRes = await pool.query('SELECT id FROM rsvps WHERE post_id = $1 AND user_id = $2', [id, userId]);
    const savedRes = await pool.query('SELECT id FROM saved_posts WHERE post_id = $1 AND user_id = $2', [id, userId]);

    res.status(200).json({
      ...post,
      userHasRsvpd: rsvpRes.rows.length > 0,
      userHasSaved: savedRes.rows.length > 0,
    });
  } catch (error) {
    console.error('Fetch Post Detail Error:', error);
    res.status(404).json({ error: 'Post not found.' });
  }
});

// POST /api/v1/posts - Create Post
router.post('/', authMiddleware, requireRole(['society_admin', 'super_admin']), upload.single('image'), validatePost, async (req, res) => {
  try {
    const { title, body, type, campus_scope, campus_id, society_id, event_date, deadline_date, venue } = req.body;
    const authorId = req.session.user.id;

    if (req.session.user.role === 'society_admin') {
      if (!society_id) return res.status(400).json({ error: 'Society ID is required for society admin posts.' });
      
      const memberRes = await pool.query(`
        SELECT id FROM society_members 
        WHERE society_id = $1 AND user_id = $2 AND role IN ('president', 'marketing')
      `, [society_id, authorId]);

      if (memberRes.rows.length === 0) {
        return res.status(403).json({ error: 'Forbidden: You cannot post on behalf of this society.' });
      }
    }

    const imageUrl = await getFileUrl(req.file);

    const postRes = await pool.query(`
      INSERT INTO posts (title, body, type, campus_scope, campus_id, society_id, author_id, image_url, event_date, deadline_date, venue, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'published') RETURNING *
    `, [
      title, body, type, campus_scope || 'all', campus_scope === 'specific' ? campus_id : null,
      society_id || null, authorId, imageUrl, event_date ? new Date(event_date) : null,
      deadline_date ? new Date(deadline_date) : null, venue || null
    ]);

    const post = postRes.rows[0];

    // Create notifications
    let targetUsersRes;
    if (post.campus_scope === 'specific') {
      targetUsersRes = await pool.query('SELECT id FROM users WHERE campus_id = $1 AND is_active = true AND id != $2', [post.campus_id, authorId]);
    } else {
      targetUsersRes = await pool.query('SELECT id FROM users WHERE is_active = true AND id != $1', [authorId]);
    }

    if (targetUsersRes.rows.length > 0) {
      const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
      const titleStr = title.replace(/'/g, "''");
      
      const values = targetUsersRes.rows.map(u => 
        `('${u.id}', 'new_post'::"NotificationType", 'New ${typeLabel} Published', '"${titleStr}" has been posted. Check details now!', '${post.id}')`
      ).join(',');

      await pool.query(`
        INSERT INTO notifications (user_id, type, title, body, related_id)
        VALUES ${values}
      `);
    }

    res.status(201).json({ message: 'Post published successfully.', post });
  } catch (error) {
    console.error('Create Post Error:', error);
    res.status(500).json({ error: 'Internal server error creating post.' });
  }
});

// PUT /api/v1/posts/:id - Edit Post
router.put('/:id', authMiddleware, requirePostOwnership, upload.single('image'), validatePost, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, body, type, campus_scope, campus_id, event_date, deadline_date, venue, status } = req.body;

    let imageUrl;
    if (req.file) {
      imageUrl = await getFileUrl(req.file);
    }

    const { rows } = await pool.query(`
      UPDATE posts
      SET title = $1, body = $2, type = $3, campus_scope = COALESCE($4, campus_scope),
          campus_id = $5, image_url = COALESCE($6, image_url), event_date = $7,
          deadline_date = $8, venue = $9, status = COALESCE($10, status), updated_at = now()
      WHERE id = $11
      RETURNING *
    `, [
      title, body, type, campus_scope, campus_scope === 'specific' ? campus_id : null,
      imageUrl, event_date ? new Date(event_date) : null, deadline_date ? new Date(deadline_date) : null,
      venue || null, status, id
    ]);

    res.status(200).json({ message: 'Post updated successfully.', post: rows[0] });
  } catch (error) {
    console.error('Update Post Error:', error);
    res.status(500).json({ error: 'Internal server error editing post.' });
  }
});

// DELETE /api/v1/posts/:id - Archive/Delete Post
router.delete('/:id', authMiddleware, requirePostOwnership, async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.session.user;

    if (user.role === 'super_admin') {
      await pool.query('DELETE FROM posts WHERE id = $1', [id]);
      return res.status(200).json({ message: 'Post hard deleted successfully by admin.' });
    }

    await pool.query("UPDATE posts SET status = 'archived', updated_at = now() WHERE id = $1", [id]);
    res.status(200).json({ message: 'Post archived successfully.' });
  } catch (error) {
    console.error('Delete Post Error:', error);
    res.status(500).json({ error: 'Internal server error deleting post.' });
  }
});

// POST /api/v1/posts/:id/rsvp - Toggle RSVP
router.post('/:id/rsvp', authMiddleware, requireRole(['student', 'society_admin', 'super_admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;

    const postRes = await pool.query('SELECT type FROM posts WHERE id = $1', [id]);
    if (postRes.rows.length === 0) return res.status(404).json({ error: 'Post not found.' });
    if (postRes.rows[0].type !== 'event') return res.status(400).json({ error: 'RSVPs are only allowed on Event posts.' });

    const result = await pool.query('SELECT toggle_rsvp($1::integer, $2::integer) AS status', [id, userId]);
    const rsvpStatus = result.rows[0].status;

    const countRes = await pool.query('SELECT rsvp_count FROM posts WHERE id = $1', [id]);

    res.status(200).json({
      message: rsvpStatus === 'added' ? 'RSVP registered.' : 'RSVP cancelled.',
      status: rsvpStatus,
      rsvp_count: countRes.rows[0].rsvp_count,
    });
  } catch (error) {
    console.error('Toggle RSVP Error:', error);
    res.status(500).json({ error: 'Internal server error registering RSVP.' });
  }
});

// GET /api/v1/posts/:id/rsvps - List RSVPs for a post
router.get('/:id/rsvps', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.session.user;

    const postRes = await pool.query('SELECT society_id, author_id FROM posts WHERE id = $1', [id]);
    if (postRes.rows.length === 0) return res.status(404).json({ error: 'Post not found.' });
    const post = postRes.rows[0];

    if (user.role !== 'super_admin' && post.author_id !== user.id) {
      if (post.society_id) {
        const isMember = await pool.query(
          "SELECT id FROM society_members WHERE society_id = $1 AND user_id = $2 AND role IN ('president', 'marketing')",
          [post.society_id, user.id]
        );
        if (isMember.rows.length === 0) return res.status(403).json({ error: 'Forbidden: You cannot view this event\'s RSVPs.' });
      } else {
        return res.status(403).json({ error: 'Forbidden.' });
      }
    }

    const { rows: rsvps } = await pool.query(`
      SELECT r.*, json_build_object('id', u.id, 'email', u.email, 'full_name', u.full_name) as user
      FROM rsvps r
      JOIN users u ON r.user_id = u.id
      WHERE r.post_id = $1
      ORDER BY r.created_at DESC
    `, [id]);

    res.status(200).json(rsvps);
  } catch (error) {
    console.error('Fetch RSVPs List Error:', error);
    res.status(500).json({ error: 'Internal server error fetching RSVPs.' });
  }
});

// POST /api/v1/posts/:id/save - Bookmark / unsave post
router.post('/:id/save', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;

    const checkPost = await pool.query('SELECT id FROM posts WHERE id = $1', [id]);
    if (checkPost.rows.length === 0) return res.status(404).json({ error: 'Post not found.' });

    const existingRes = await pool.query('SELECT id FROM saved_posts WHERE post_id = $1 AND user_id = $2', [id, userId]);

    if (existingRes.rows.length > 0) {
      await pool.query('DELETE FROM saved_posts WHERE id = $1', [existingRes.rows[0].id]);
      return res.status(200).json({ message: 'Post removed from bookmarks.', saved: false });
    }

    await pool.query('INSERT INTO saved_posts (post_id, user_id) VALUES ($1, $2)', [id, userId]);
    res.status(200).json({ message: 'Post added to bookmarks.', saved: true });
  } catch (error) {
    console.error('Bookmark Post Error:', error);
    res.status(500).json({ error: 'Internal server error toggling bookmark.' });
  }
});

module.exports = router;
