const express = require('express');
const pool = require('../config/db');
const authMiddleware = require('../middleware/auth');
const { requireRole, requireSocietyAdminRights } = require('../middleware/rbac');
const router = express.Router();

// GET /api/v1/societies - List all active societies (Authenticated)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { rows: societies } = await pool.query(`
      SELECT s.*, 
             json_build_object('name', c.name, 'block_number', c.block_number) as campus
      FROM societies s
      LEFT JOIN campuses c ON s.campus_id = c.id
      WHERE s.is_active = true
      ORDER BY s.name ASC
    `);
    res.status(200).json(societies);
  } catch (error) {
    console.error('List Societies Error:', error);
    res.status(500).json({ error: 'Internal server error listing societies.' });
  }
});

// GET /api/v1/societies/:id - Get single society & its posts (Authenticated)
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    const socRes = await pool.query(`
      SELECT s.*, row_to_json(c.*) as campus
      FROM societies s
      LEFT JOIN campuses c ON s.campus_id = c.id
      WHERE s.id = $1
    `, [id]);

    if (socRes.rows.length === 0 || !socRes.rows[0].is_active) {
      return res.status(404).json({ error: 'Society not found or is inactive.' });
    }

    const society = socRes.rows[0];

    const postsRes = await pool.query(`
      SELECT * FROM posts 
      WHERE society_id = $1 AND status = 'published'
      ORDER BY created_at DESC
    `, [id]);

    society.posts = postsRes.rows;

    res.status(200).json(society);
  } catch (error) {
    console.error('Get Society Error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/v1/societies - Create a new society with its founding president admin (Super Admin only)
router.post('/', authMiddleware, requireRole(['super_admin']), async (req, res) => {
  const client = await pool.connect();
  try {
    const { name, short_code, description, campus_id, created_by, color_hex, logo_url } = req.body;

    if (!name || !short_code || !campus_id || !created_by) {
      return res.status(400).json({ error: 'Name, short code, campus ID, and founder (user ID) are required.' });
    }

    // Verify founder user exists
    const founderRes = await client.query('SELECT id, role FROM users WHERE id = $1', [created_by]);
    if (founderRes.rows.length === 0) {
      return res.status(400).json({ error: 'Founder user not found.' });
    }
    const founder = founderRes.rows[0];

    // Transaction
    await client.query('BEGIN');

    // 1. Create society
    const socRes = await client.query(`
      INSERT INTO societies (name, short_code, description, campus_id, created_by, color_hex, logo_url, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, true) RETURNING *
    `, [name, short_code, description, campus_id, created_by, color_hex, logo_url]);
    
    const society = socRes.rows[0];

    // 2. Add founder as President
    await client.query(`
      INSERT INTO society_members (society_id, user_id, role)
      VALUES ($1, $2, 'president')
    `, [society.id, created_by]);

    // 3. Update the user role to society_admin if not already super_admin
    if (founder.role === 'student') {
      await client.query(`UPDATE users SET role = 'society_admin', updated_at = now() WHERE id = $1`, [created_by]);
    }

    await client.query('COMMIT');
    res.status(201).json({ message: 'Society created and president assigned successfully.', society });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create Society Transaction Error:', error);
    res.status(500).json({ error: 'Database transaction failed: Cannot create society.' });
  } finally {
    client.release();
  }
});

// PUT /api/v1/societies/:id - Update society details (Society Admin or Super Admin)
router.put('/:id', authMiddleware, requireSocietyAdminRights(), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, color_hex, logo_url } = req.body;

    const { rows } = await pool.query(`
      UPDATE societies 
      SET name = COALESCE($1, name),
          description = COALESCE($2, description),
          color_hex = COALESCE($3, color_hex),
          logo_url = COALESCE($4, logo_url)
      WHERE id = $5
      RETURNING *
    `, [name, description, color_hex, logo_url, id]);

    res.status(200).json({ message: 'Society profile updated successfully.', society: rows[0] });
  } catch (error) {
    console.error('Update Society Error:', error);
    res.status(500).json({ error: 'Internal server error updating society.' });
  }
});

// DELETE /api/v1/societies/:id - Deactivate society (Super Admin only)
router.delete('/:id', authMiddleware, requireRole(['super_admin']), async (req, res) => {
  try {
    const { id } = req.params;

    const checkRes = await pool.query('SELECT id FROM societies WHERE id = $1', [id]);
    if (checkRes.rows.length === 0) {
      return res.status(404).json({ error: 'Society not found.' });
    }

    await pool.query('UPDATE societies SET is_active = false WHERE id = $1', [id]);

    res.status(200).json({ message: 'Society deactivated successfully.' });
  } catch (error) {
    console.error('Deactivate Society Error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/v1/societies/:id/members - List members of a society (Society Admin or Super Admin)
router.get('/:id/members', authMiddleware, requireSocietyAdminRights(), async (req, res) => {
  try {
    const { id } = req.params;

    const { rows: members } = await pool.query(`
      SELECT sm.*, 
             json_build_object('id', u.id, 'email', u.email, 'full_name', u.full_name, 'role', u.role) as user
      FROM society_members sm
      JOIN users u ON sm.user_id = u.id
      WHERE sm.society_id = $1
      ORDER BY sm.joined_at ASC
    `, [id]);

    res.status(200).json(members);
  } catch (error) {
    console.error('Fetch Society Members Error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/v1/societies/:id/members - Add member/assign role in society (Society Admin or Super Admin)
router.post('/:id/members', authMiddleware, requireSocietyAdminRights(), async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { email, role } = req.body;

    if (!email || !role) {
      return res.status(400).json({ error: 'Email and role are required.' });
    }

    const validRoles = ['marketing', 'president', 'member'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid member role.' });
    }

    // Find user
    const userRes = await client.query('SELECT id, role FROM users WHERE email = $1', [email]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User with this email not found.' });
    }
    const user = userRes.rows[0];

    // Check if already a member
    const existingRes = await client.query('SELECT id FROM society_members WHERE society_id = $1 AND user_id = $2', [id, user.id]);
    
    if (existingRes.rows.length > 0) {
      // Update role
      const updatedRes = await client.query(`
        UPDATE society_members SET role = $1 WHERE id = $2 RETURNING *
      `, [role, existingRes.rows[0].id]);
      return res.status(200).json({ message: 'Member role updated successfully.', member: updatedRes.rows[0] });
    }

    await client.query('BEGIN');

    const memberRes = await client.query(`
      INSERT INTO society_members (society_id, user_id, role)
      VALUES ($1, $2, $3) RETURNING *
    `, [id, user.id, role]);

    if (user.role === 'student' && (role === 'president' || role === 'marketing')) {
      await client.query(`UPDATE users SET role = 'society_admin', updated_at = now() WHERE id = $1`, [user.id]);
    }

    await client.query('COMMIT');
    res.status(201).json({ message: 'Member added to society successfully.', member: memberRes.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Add Member Error:', error);
    res.status(500).json({ error: 'Internal server error adding member.' });
  } finally {
    client.release();
  }
});

// DELETE /api/v1/societies/:id/members/:uid - Remove member from society (Society Admin or Super Admin)
router.delete('/:id/members/:uid', authMiddleware, requireSocietyAdminRights(), async (req, res) => {
  try {
    const { id, uid } = req.params;

    const delRes = await pool.query('DELETE FROM society_members WHERE society_id = $1 AND user_id = $2 RETURNING id', [id, uid]);

    if (delRes.rows.length === 0) {
      return res.status(404).json({ error: 'Member not found in this society.' });
    }

    res.status(200).json({ message: 'Member removed from society successfully.' });
  } catch (error) {
    console.error('Remove Member Error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/v1/societies/:id/analytics - Get analytics stats for own posts (Society Admin or Super Admin)
router.get('/:id/analytics', authMiddleware, requireSocietyAdminRights(), async (req, res) => {
  try {
    const { id } = req.params;

    const { rows: postStats } = await pool.query(`
      SELECT id, title, type, view_count, rsvp_count, created_at
      FROM posts
      WHERE society_id = $1
      ORDER BY created_at DESC
    `, [id]);

    let totalViews = 0;
    let totalRSVPs = 0;
    postStats.forEach(p => {
      totalViews += p.view_count;
      totalRSVPs += p.rsvp_count;
    });

    res.status(200).json({
      society_id: id,
      total_posts: postStats.length,
      total_views: totalViews,
      total_rsvps: totalRSVPs,
      posts: postStats,
    });
  } catch (error) {
    console.error('Fetch Analytics Error:', error);
    res.status(500).json({ error: 'Internal server error loading analytics.' });
  }
});

module.exports = router;
