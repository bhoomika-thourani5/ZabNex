const express = require('express');
const pool = require('../config/db');
const authMiddleware = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const router = express.Router();

// GET /api/v1/users - List all users (Super Admin only)
router.get('/', authMiddleware, requireRole(['super_admin']), async (req, res) => {
  try {
    const { rows: users } = await pool.query(`
      SELECT u.id, u.email, u.full_name, u.role, u.is_active, u.is_verified, u.created_at,
             json_build_object('name', c.name, 'block_number', c.block_number) as campus
      FROM users u
      LEFT JOIN campuses c ON u.campus_id = c.id
      ORDER BY u.created_at DESC
    `);
    res.status(200).json(users);
  } catch (error) {
    console.error('List Users Error:', error);
    res.status(500).json({ error: 'Internal server error listing users.' });
  }
});

// GET /api/v1/users/:id - Get user profile (Super Admin or Self)
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const sessionUser = req.session.user;

    if (sessionUser.role !== 'super_admin' && String(sessionUser.id) !== String(id)) {
      return res.status(403).json({ error: 'Forbidden: You can only view your own profile.' });
    }

    const { rows } = await pool.query(`
      SELECT u.id, u.email, u.full_name, u.role, u.avatar_url, u.is_active, u.is_verified, u.created_at,
             row_to_json(c.*) as campus,
             COALESCE(
               json_agg(
                 json_build_object(
                   'id', sm.id,
                   'role', sm.role,
                   'society', row_to_json(s.*)
                 )
               ) FILTER (WHERE sm.id IS NOT NULL), '[]'
             ) as society_members
      FROM users u
      LEFT JOIN campuses c ON u.campus_id = c.id
      LEFT JOIN society_members sm ON sm.user_id = u.id
      LEFT JOIN societies s ON sm.society_id = s.id
      WHERE u.id = $1
      GROUP BY u.id, c.id
    `, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.status(200).json(rows[0]);
  } catch (error) {
    console.error('Get User Profile Error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// PUT /api/v1/users/:id - Update user profile (Self only)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const sessionUser = req.session.user;

    if (sessionUser.role !== 'super_admin' && String(sessionUser.id) !== String(id)) {
      return res.status(403).json({ error: 'Forbidden: You can only edit your own profile.' });
    }

    const { full_name, avatar_url } = req.body;

    const { rows } = await pool.query(`
      UPDATE users 
      SET full_name = COALESCE($1, full_name), 
          avatar_url = COALESCE($2, avatar_url),
          updated_at = now()
      WHERE id = $3
      RETURNING id, email, full_name, role, avatar_url
    `, [full_name, avatar_url, id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const updated = rows[0];
    req.session.user.full_name = updated.full_name;

    res.status(200).json({ message: 'Profile updated successfully.', user: updated });
  } catch (error) {
    console.error('Update Profile Error:', error);
    res.status(500).json({ error: 'Internal server error updating profile.' });
  }
});

// DELETE /api/v1/users/:id - Deactivate user account (Super Admin only)
router.delete('/:id', authMiddleware, requireRole(['super_admin']), async (req, res) => {
  try {
    const { id } = req.params;

    const userRes = await pool.query('SELECT role FROM users WHERE id = $1', [id]);

    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (userRes.rows[0].role === 'super_admin') {
      return res.status(400).json({ error: 'Super Admin accounts cannot be deactivated.' });
    }

    await pool.query('UPDATE users SET is_active = false, updated_at = now() WHERE id = $1', [id]);

    res.status(200).json({ message: 'User account deactivated successfully.' });
  } catch (error) {
    console.error('Deactivate User Error:', error);
    res.status(500).json({ error: 'Internal server error deactivating user.' });
  }
});

// PUT /api/v1/users/:id/role - Change user role (Super Admin only)
router.put('/:id/role', authMiddleware, requireRole(['super_admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    const validRoles = ['student', 'society_admin', 'super_admin'];
    if (!role || !validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role specified.' });
    }

    const { rows } = await pool.query(`
      UPDATE users 
      SET role = $1, updated_at = now()
      WHERE id = $2
      RETURNING id, email, full_name, role
    `, [role, id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.status(200).json({ message: `Role changed successfully to ${role}.`, user: rows[0] });
  } catch (error) {
    console.error('Change Role Error:', error);
    res.status(500).json({ error: 'Internal server error changing role.' });
  }
});

module.exports = router;
